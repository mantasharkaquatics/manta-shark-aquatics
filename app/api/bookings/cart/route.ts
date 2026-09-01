import { NextRequest, NextResponse } from 'next/server'
import { requireParent } from '@/lib/api-auth'
import { getCoachBlocks, isBlocked } from '@/lib/availability'
import { getTodayLA, getNowMinutesLA, formatDateLA, formatTime12h, minutesUntil } from '@/lib/date'
import { LEAD_TIME_MINUTES } from '@/lib/booking-time'
import { sendEmail } from '@/lib/email'
import { priceLesson } from '@/lib/points'
import { applyPoints, InsufficientPoints, walletSummary } from '@/lib/points-wallet'

// Parent shopping cart. Items are real `in_cart` bookings so the DB trigger
// counts them into enrolled_count (slot is reserved the moment it enters the
// cart). Cart-wide expiry: 15 minutes from the FIRST item; expired items are
// lazily deleted on every action. Commit uses conditional updates
// (in_cart -> confirmed) as the idempotency lock, one points debit for the whole
// cart, and reverts to in_cart on any failure so the cart survives.
// v1 scope: points-paid lessons only (no assessment, no 1-on-2 partner flow).

const CART_LIMIT = 10
const CART_TTL_MS = 15 * 60 * 1000
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const TIME_RE = /^\d{2}:\d{2}$/

async function purgeExpired(svc: any, parentId: string) {
  await svc.from('bookings').delete()
    .eq('parent_id', parentId).eq('status', 'in_cart')
    .lt('pending_expires_at', new Date().toISOString())
}

async function loadCart(svc: any, parentId: string) {
  const { data: items } = await svc
    .from('bookings')
    .select('id, class_session_id, student_id, pending_expires_at, created_at')
    .eq('parent_id', parentId).eq('status', 'in_cart')
    .order('created_at', { ascending: true })
  const rows = items || []
  if (rows.length === 0) return { items: [], expiresAt: null }
  // Two-step fetch (no nested joins)
  const sessIds = [...new Set(rows.map((r: any) => r.class_session_id))]
  const studentIds = [...new Set(rows.map((r: any) => r.student_id))]
  const [{ data: sessions }, { data: students }] = await Promise.all([
    svc.from('class_sessions').select('id, coach_id, course_type_id, session_date, start_time, end_time').in('id', sessIds),
    svc.from('students').select('id, full_name').in('id', studentIds),
  ])
  const coachIds = [...new Set((sessions || []).map((s: any) => s.coach_id))]
  const ctIds = [...new Set((sessions || []).map((s: any) => s.course_type_id))]
  const [{ data: coaches }, { data: courseTypes }] = await Promise.all([
    svc.from('coaches').select('id, first_name, last_name').in('id', coachIds),
    svc.from('course_types').select('id, name, slug').in('id', ctIds),
  ])
  const sessOf = new Map<string, any>((sessions || []).map((s: any) => [s.id, s]))
  const stuOf = new Map<string, any>((students || []).map((s: any) => [s.id, s]))
  const coachOf = new Map<string, any>((coaches || []).map((c: any) => [c.id, c]))
  const ctOf = new Map<string, any>((courseTypes || []).map((c: any) => [c.id, c]))
  const merged = rows.map((r: any) => {
    const sess = sessOf.get(r.class_session_id)
    const coach = sess ? coachOf.get(sess.coach_id) : null
    const ct = sess ? ctOf.get(sess.course_type_id) : null
    return {
      booking_id: r.id,
      student_id: r.student_id,
      student_name: stuOf.get(r.student_id)?.full_name || '',
      course_type_id: sess?.course_type_id || null,
      course_slug: ct?.slug || '',
      course_name: ct?.name || '',
      coach_name: coach ? `${coach.first_name} ${coach.last_name || ''}`.trim() : '',
      session_date: sess?.session_date || '',
      start_time: sess ? String(sess.start_time).slice(0, 5) : '',
      end_time: sess ? String(sess.end_time).slice(0, 5) : '',
    }
  })
  const expiresAt = rows.reduce((min: string | null, r: any) =>
    !min || (r.pending_expires_at && r.pending_expires_at < min) ? r.pending_expires_at : min, null)
  return { items: merged, expiresAt }
}

/**
 * What this cart costs, item by item. Every line is priced on its own course,
 * date and time -- two lessons in the same cart can legitimately cost different
 * numbers of points, and the cart has to show that rather than a single rate.
 *
 * An item whose course has no points price (the assessment, Swim Team) is
 * returned with points: null and blocks the commit rather than being silently
 * given away.
 */
async function quoteCart(svc: any, parentId: string, items: any[]) {
  const wallet = await walletSummary(svc, parentId)
  let total = 0
  let priceable = true
  const lines = items.map((it: any) => {
    let points: number | null = null
    try {
      points = priceLesson({
        courseSlug: it.course_slug, minutes: 30,
        lessonsCompleted: wallet.lessonsCompleted,
        sessionDate: it.session_date, startTime: it.start_time, seats: 1,
      }).perSeat
      total += points
    } catch { priceable = false }
    return { booking_id: it.booking_id, points }
  })
  return {
    lines, total, priceable,
    balance: wallet.balance,
    vip_level: wallet.vipLevel,
    vip_discount: wallet.vipDiscount,
    sufficient: priceable && wallet.balance >= total,
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireParent()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { parent, svc } = auth

  const body = await req.json().catch(() => null)
  if (!body?.action) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })

  await purgeExpired(svc, parent.id)

  // ---------- list ----------
  if (body.action === 'list') {
    const cart = await loadCart(svc, parent.id)
    return NextResponse.json({ ...cart, quote: await quoteCart(svc, parent.id, cart.items) })
  }

  // ---------- clear ----------
  if (body.action === 'clear') {
    await svc.from('bookings').delete().eq('parent_id', parent.id).eq('status', 'in_cart')
    return NextResponse.json({ ok: true })
  }

  // ---------- remove ----------
  if (body.action === 'remove') {
    const { booking_id } = body
    if (!booking_id) return NextResponse.json({ error: 'Missing booking_id' }, { status: 400 })
    await svc.from('bookings').delete()
      .eq('id', booking_id).eq('parent_id', parent.id).eq('status', 'in_cart')
    const cart = await loadCart(svc, parent.id)
    return NextResponse.json({ ok: true, ...cart, quote: await quoteCart(svc, parent.id, cart.items) })
  }

  // ---------- add ----------
  if (body.action === 'add') {
    const { course_type_id, coach_id, session_date, start_time, student_id } = body
    if (!course_type_id || !coach_id || !session_date || !start_time || !student_id)
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    if (!DATE_RE.test(session_date) || !TIME_RE.test(start_time))
      return NextResponse.json({ error: 'Invalid date or time format' }, { status: 400 })

    // Cutoff rules (same as single booking)
    const today = getTodayLA()
    const nowMin = getNowMinutesLA()
    if (session_date < today || minutesUntil(session_date, start_time, today, nowMin) < LEAD_TIME_MINUTES)
      return NextResponse.json({ error: 'Bookings must be made at least 30 minutes before the lesson starts. Please pick a later time.' }, { status: 400 })
    const maxDate = formatDateLA(new Date(Date.now() + 60 * 86400000))
    if (session_date > maxDate)
      return NextResponse.json({ error: 'Bookings can only be made up to 60 days in advance.' }, { status: 400 })

    // Cart size limit
    const { data: cartRows } = await svc
      .from('bookings').select('id, pending_expires_at')
      .eq('parent_id', parent.id).eq('status', 'in_cart')
    if ((cartRows || []).length >= CART_LIMIT)
      return NextResponse.json({ error: `Cart is limited to ${CART_LIMIT} items.` }, { status: 400 })

    // Course type (v1: credit courses only)
    const { data: course } = await svc
      .from('course_types').select('id, name, slug, duration_minutes, max_students')
      .eq('id', course_type_id).single()
    if (!course) return NextResponse.json({ error: 'Course type not found' }, { status: 400 })
    if (course.slug === '1on2')
      return NextResponse.json({ error: '1-on-2 lessons cannot be added to the cart yet. Please book them individually.' }, { status: 400 })

    // Student ownership
    const { data: student } = await svc
      .from('students').select('id, full_name, parent_id, current_level').eq('id', student_id).single()
    if (!student || student.parent_id !== parent.id)
      return NextResponse.json({ error: 'Student not found' }, { status: 403 })
    if (student.current_level == null)
      return NextResponse.json({ error: 'This student must complete a Swim Assessment before booking lessons. Please book a Swim Assessment first.' }, { status: 403 })

    // Coach block check (time_off / admin_block)
    {
      const [bh, bm] = start_time.split(':').map(Number)
      const bEnd = bh * 60 + bm + course.duration_minutes
      const blockEnd = String(Math.floor(bEnd / 60)).padStart(2, '0') + ':' + String(bEnd % 60).padStart(2, '0')
      const coachBlocks = await getCoachBlocks(svc, [coach_id], session_date)
      if (isBlocked(coachBlocks, coach_id, start_time, blockEnd))
        return NextResponse.json({ error: 'The coach is not available at this time. Please pick another time.' }, { status: 409 })
    }

    // Coach conflict / full check (in_cart counts via trigger-maintained enrolled_count)
    const { data: conflicts } = await svc
      .from('class_sessions')
      .select('id, course_type_id, enrolled_count, max_students, status')
      .eq('coach_id', coach_id).eq('session_date', session_date).eq('start_time', start_time)
      .in('status', ['open', 'full'])
    const sameCourse = (conflicts || []).find((c: any) => c.course_type_id === course_type_id)
    if ((conflicts || []).some((c: any) => c.course_type_id !== course_type_id && c.enrolled_count > 0))
      return NextResponse.json({ error: 'The coach already has another class at this time. Please pick another time.' }, { status: 409 })
    if (sameCourse && sameCourse.enrolled_count >= sameCourse.max_students)
      return NextResponse.json({ error: 'This time slot is full. Please pick another time.' }, { status: 409 })

    // Duplicate: same student already has an active/in-cart booking on this slot
    if (sameCourse) {
      const { data: dup } = await svc
        .from('bookings').select('id')
        .eq('class_session_id', sameCourse.id).eq('student_id', student_id)
        .in('status', ['confirmed', 'in_cart', 'pending_payment']).limit(1)
      if (dup && dup.length > 0)
        return NextResponse.json({ error: 'This student already has this time slot booked or in the cart.' }, { status: 409 })
    }

    // Find or create session
    let sessionId: string | null = sameCourse?.id || null
    if (!sessionId) {
      const [h, m] = start_time.split(':').map(Number)
      const endTotal = h * 60 + m + course.duration_minutes
      const end_time = String(Math.floor(endTotal / 60)).padStart(2, '0') + ':' + String(endTotal % 60).padStart(2, '0')
      const { data: created, error: sessErr } = await svc
        .from('class_sessions')
        .insert({ course_type_id, coach_id, session_date, start_time, end_time, max_students: course.max_students, enrolled_count: 0, status: 'open' })
        .select('id').single()
      if (sessErr || !created)
        return NextResponse.json({ error: 'Could not create the time slot. Please try again.' }, { status: 500 })
      sessionId = created.id
    }

    // Cart-wide expiry: inherit from existing items, else now + 15 min
    const existingExpiry = (cartRows || []).reduce((min: string | null, r: any) =>
      !min || (r.pending_expires_at && r.pending_expires_at < min) ? r.pending_expires_at : min, null)
    const expiresAt = existingExpiry || new Date(Date.now() + CART_TTL_MS).toISOString()

    const { error: insErr } = await svc.from('bookings').insert({
      class_session_id: sessionId,
      parent_id: parent.id,
      student_id,
      lesson_credit_id: null,
      status: 'in_cart',
      pending_expires_at: expiresAt,
    })
    if (insErr) {
      const msg = insErr.message?.includes('coach_timeslot_conflict')
        ? 'The coach already has another class at this time. Please pick another time.'
        : 'Could not add to cart. Please try again.'
      return NextResponse.json({ error: msg }, { status: 409 })
    }

    const cart = await loadCart(svc, parent.id)
    return NextResponse.json({ ok: true, ...cart, quote: await quoteCart(svc, parent.id, cart.items) })
  }

  // ---------- commit ----------
  if (body.action === 'commit') {
    const cart = await loadCart(svc, parent.id)
    if (cart.items.length === 0)
      return NextResponse.json({ error: 'Your cart is empty or has expired.' }, { status: 400 })

    const quote = await quoteCart(svc, parent.id, cart.items)
    if (!quote.priceable)
      return NextResponse.json({ error: 'One of the lessons in your cart cannot be paid for with points. Please remove it.' }, { status: 400 })
    const pointsOf = new Map(quote.lines.map(l => [l.booking_id, l.points as number]))

    // One debit for the cart, taken before any row flips, so a family who
    // cannot pay is turned away with the cart intact and nothing confirmed.
    let pointsTaken = 0
    try {
      await applyPoints(svc, {
        parentId: parent.id, reason: 'booking', points: -quote.total, actor: 'parent',
        pricing: {
          kind: 'cart',
          vipLevel: quote.vip_level, vipPct: quote.vip_discount,
          items: cart.items.map((it: any) => ({
            course: it.course_slug, date: it.session_date,
            time: it.start_time, points: pointsOf.get(it.booking_id) ?? 0,
          })),
        },
        note: `Cart: ${cart.items.length} lesson${cart.items.length === 1 ? '' : 's'}`,
      })
      pointsTaken = quote.total
    } catch (e: any) {
      if (e instanceof InsufficientPoints)
        return NextResponse.json({ error: 'NOT_ENOUGH_POINTS', needed: e.needed, available: e.available }, { status: 400 })
      console.error('points charge failed:', e)
      return NextResponse.json({ error: 'Could not take the points for this cart. Please try again.' }, { status: 500 })
    }

    const confirmed: { id: string; expiry: string | null }[] = []
    async function rollback(why: string) {
      if (pointsTaken > 0) {
        await applyPoints(svc, {
          parentId: parent.id, reason: 'booking_failed', points: pointsTaken,
          actor: 'system', note: why,
        }).catch(e => console.error('points rollback failed:', e))
        pointsTaken = 0
      }
      for (const b of confirmed)
        await svc.from('bookings')
          .update({ status: 'in_cart', pending_expires_at: b.expiry, points_charged: null })
          .eq('id', b.id)
    }

    for (const it of cart.items) {
      // Conditional update = idempotency lock (only an un-expired in_cart row flips)
      const { data: locked } = await svc
        .from('bookings')
        .update({
          status: 'confirmed', lesson_credit_id: null,
          points_charged: pointsOf.get(it.booking_id) ?? 0,
          pending_expires_at: null,
        })
        .eq('id', it.booking_id).eq('status', 'in_cart')
        .select('id')
      if (!locked || locked.length === 0) {
        await rollback('a lesson in the cart was no longer available')
        return NextResponse.json({ error: `"${it.course_name} ${it.session_date}" is no longer available. Please review your cart.` }, { status: 409 })
      }
      confirmed.push({ id: it.booking_id, expiry: cart.expiresAt })
    }

    // Summary emails: one per (student, course, coach) group (best effort)
    try {
      const { data: parentRow } = await svc.from('parents').select('first_name, email').eq('id', parent.id).single()
      if (parentRow?.email) {
        const groups = new Map<string, any[]>()
        for (const it of cart.items) {
          const key = `${it.student_id}|${it.course_type_id}|${it.coach_name}`
          if (!groups.has(key)) groups.set(key, [])
          groups.get(key)!.push(it)
        }
        for (const [, items] of groups) {
          const first = items[0]
          const timeStr = `${formatTime12h(first.start_time)} \u2013 ${formatTime12h(first.end_time)}`
          if (items.length === 1) {
            await sendEmail({
              type: 'booking_confirmed', to: parentRow.email, parentName: parentRow.first_name,
              studentName: first.student_name, courseName: first.course_name, coachName: first.coach_name,
              date: first.session_date, time: timeStr,
            })
          } else {
            await sendEmail({
              type: 'booking_series_confirmed', to: parentRow.email, parentName: parentRow.first_name,
              studentName: first.student_name, courseName: first.course_name, coachName: first.coach_name,
              dates: items.map((i: any) => i.session_date), time: timeStr,
            })
          }
        }
      }
    } catch {}

    return NextResponse.json({ ok: true, confirmed_count: confirmed.length, points_charged: quote.total })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
