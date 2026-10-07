import { sendEmail } from '@/lib/email'
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { priceLesson } from '@/lib/points'
import { applyPoints, InsufficientPoints, splitGranted, WalletInArrears } from '@/lib/points-wallet'
import { readJson, badRequest } from '@/lib/http'
import { formatTime12h } from '@/lib/date'
import { studentsBusyAt } from '@/lib/bookings/student-clash'

export async function POST(req: NextRequest) {
  const cookieStore = await cookies()
  const supabaseAuth = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } }
  )
  const { data: { user } } = await supabaseAuth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await readJson(req)
  if (!body) return badRequest()
  const { partner_booking_id } = body

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: confirmingParent } = await supabase
    .from('parents').select('id').eq('auth_user_id', user.id).single()
  if (!confirmingParent) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data: partnerBooking } = await supabase
    .from('bookings')
    .select('id, class_session_id, parent_id, student_id, partner_booking_id, pending_expires_at, lesson_group_id')
    .eq('id', partner_booking_id)
    .eq('status', 'pending_partner')
    .eq('pending_action', 'confirm')
    .single()

  if (!partnerBooking) return NextResponse.json({ error: 'Invitation not found or already expired' }, { status: 404 })
  if (partnerBooking.parent_id !== confirmingParent.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (new Date(partnerBooking.pending_expires_at) < new Date()) {
    return NextResponse.json({ error: 'This invitation has expired' }, { status: 410 })
  }

  const initiatorBookingId = partnerBooking.partner_booking_id
  if (!initiatorBookingId) return NextResponse.json({ error: 'Initiator booking not found' }, { status: 404 })

  const { data: initiatorBooking } = await supabase
    .from('bookings')
    .select('id, class_session_id, parent_id, student_id')
    .eq('id', initiatorBookingId)
    .eq('status', 'pending_partner')
    .single()

  if (!initiatorBooking) return NextResponse.json({ error: 'Initiator booking not found' }, { status: 404 })

  // An hour lesson is FOUR pending rows sharing a lesson_group_id (two halves x
  // two families); a 30-minute one is the pair above. Resolve whichever shape
  // this is, then treat everything below as "the group" - old rows have no
  // lesson_group_id and fall through to the original two-row behaviour.
  let group: any[]
  if (partnerBooking.lesson_group_id) {
    const { data: rows } = await supabase
      .from('bookings')
      .select('id, class_session_id, parent_id, student_id')
      .eq('lesson_group_id', partnerBooking.lesson_group_id)
      .eq('status', 'pending_partner')
    group = rows || []
  } else {
    group = [
      { id: partnerBooking.id, class_session_id: partnerBooking.class_session_id, parent_id: partnerBooking.parent_id, student_id: partnerBooking.student_id },
      { id: initiatorBooking.id, class_session_id: initiatorBooking.class_session_id, parent_id: initiatorBooking.parent_id, student_id: initiatorBooking.student_id },
    ]
  }

  const mine = group.filter(r => r.parent_id === confirmingParent.id)
  const theirs = group.filter(r => r.parent_id === initiatorBooking.parent_id)
  if (mine.length === 0 || theirs.length === 0 || mine.length + theirs.length !== group.length) {
    return NextResponse.json({ error: 'This invitation is no longer valid.' }, { status: 409 })
  }

  const sessionIds = Array.from(new Set(group.map(r => r.class_session_id)))
  const { data: sessions } = await supabase
    .from('class_sessions')
    .select('id, enrolled_count, max_students, course_type_id, coach_id, session_date, start_time, end_time')
    .in('id', sessionIds)
  if (!sessions || sessions.length !== sessionIds.length) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  }

  const cancelGroup = async (reason: string) => {
    await supabase.from('bookings')
      .update({ status: 'cancelled', cancellation_reason: reason })
      .in('id', group.map(r => r.id))
  }

  // Every half has to survive both checks - confirming an hour where only the
  // first half is still free would strand the second.
  //
  // Coach clash by OVERLAP, as create and confirm-reschedule do (found
  // 2026-10-07). This looked only for a session starting at the same minute,
  // and a 60-minute lesson's second half starts off the grid: an hour booked
  // at 9:10 (halves 9:10-9:40, 9:40-10:10) during the invitation window sat
  // over a pending 9:45 1-on-2, and accepting it double-booked the coach.
  const toMinP = (t: string) => { const [h, m] = String(t).slice(0, 5).split(':').map(Number); return h * 60 + m }
  const groupSessionIds = new Set(sessions.map((x: any) => x.id))
  for (const session of sessions) {
    const ns = toMinP(session.start_time)
    const ne = session.end_time ? toMinP(session.end_time) : ns + 30
    const { data: daySessions } = await supabase
      .from('class_sessions')
      .select('id, start_time, end_time')
      .eq('coach_id', session.coach_id)
      .eq('session_date', session.session_date)
      .neq('status', 'cancelled')
    const conflictSessionIds = (daySessions || [])
      .filter((x: any) => {
        if (groupSessionIds.has(x.id)) return false
        const s0 = toMinP(x.start_time)
        const e0 = x.end_time ? toMinP(x.end_time) : s0 + 30
        return ns < e0 && ne > s0
      })
      .map((x: any) => x.id)
    if (conflictSessionIds.length > 0) {
      const { data: conflictBookings } = await supabase
        .from('bookings')
        .select('id')
        .in('class_session_id', conflictSessionIds)
        .not('status', 'in', '("cancelled","pending_partner")')
      if (conflictBookings && conflictBookings.length > 0) {
        await cancelGroup('slot_taken')
        return NextResponse.json({ error: 'This time slot was taken by another customer and cannot be confirmed.' }, { status: 409 })
      }
    }

    const seatsHere = group.filter(r => r.class_session_id === session.id).length
    if (session.enrolled_count + seatsHere > session.max_students) {
      await cancelGroup('slot_full')
      return NextResponse.json({ error: 'This time slot is full and cannot be confirmed.' }, { status: 409 })
    }
  }

  // Each swimmer's own lessons, before any points move (found 2026-10-07).
  // Nothing checked them: an invited child already booked at that time made
  // the claim below fail on the database's double-booking guard after both
  // families had been charged and refunded, with "already processed" shown on
  // every retry until the invitation lapsed (or, without the guard, the child
  // was booked twice). Both families' swimmers, every half.
  {
    const byDate = new Map<string, { s: number; e: number }[]>()
    for (const x of sessions as any[]) {
      const st = toMinP(x.start_time)
      byDate.set(x.session_date, [...(byDate.get(x.session_date) || []), { s: st, e: x.end_time ? toMinP(x.end_time) : st + 30 }])
    }
    const swimmerIds = [...new Set(group.map(r => r.student_id).filter(Boolean))] as string[]
    const busyIds = new Set<string>()
    for (const [d, ranges] of byDate) {
      for (const id of await studentsBusyAt(supabase, swimmerIds, d, ranges)) busyIds.add(id)
    }
    if (busyIds.size > 0) {
      const { data: who } = await supabase.from('students').select('full_name').in('id', [...busyIds])
      const names = (who || []).map((x: any) => x.full_name).filter(Boolean).join(' & ') || 'A swimmer'
      await cancelGroup('partner_double_booked')
      return NextResponse.json({ error: `${names} already has a lesson at that time, so this invitation cannot be confirmed and has been cancelled. No points were used.` }, { status: 409 })
    }
  }

  const courseTypeId = sessions[0].course_type_id
  const { data: courseType } = await supabase
    .from('course_types').select('slug').eq('id', courseTypeId).single()
  if (!courseType) return NextResponse.json({ error: 'Course type not found' }, { status: 404 })

  // An hour lesson is two halves; the whole lesson is priced from the earlier
  // one, so a 60-minute lesson that starts off-peak is off-peak throughout.
  const firstSession = [...sessions].sort((a: any, b: any) =>
    (a.session_date + a.start_time).localeCompare(b.session_date + b.start_time))[0]

  // Each family pays for its own seat, out of its own wallet, settled here
  // when the second family accepts rather than when the invitation was sent.
  const quoteFor = (halves: number) => {
    const price = priceLesson({
      courseSlug: courseType.slug,
      minutes: 30,
      sessionDate: firstSession.session_date,
      startTime: String(firstSession.start_time).slice(0, 5),
      seats: 1,
    })
    return { price, perRow: price.perHalfHour, total: price.perHalfHour * halves }
  }

  let myQuote, theirQuote
  try {
    myQuote = quoteFor(mine.length)
    theirQuote = quoteFor(theirs.length)
  } catch {
    return NextResponse.json({ error: 'This lesson cannot be paid for with points.' }, { status: 400 })
  }

  // Settle both families BEFORE the claim. Taking the points first means a lost
  // race is a 409 with nothing claimed, instead of a confirmed lesson nobody
  // paid for. Both debits are reversible, and refundSpent() puts them back.
  const taken: { parentId: string; points: number; granted: number; expires: string | null }[] = []
  const refundSpent = async (why: string) => {
    for (const t of taken) {
      await applyPoints(supabase, {
        parentId: t.parentId, reason: 'booking_failed', points: t.points,
        grantedPart: t.granted, grantedExpiresAt: t.expires,
        actor: 'system', note: why,
      }).catch(e => console.error('points rollback failed:', e))
    }
    taken.length = 0
  }

  // Name the lesson on each family's statement line (found 2026-10-07). The
  // bare price had no kind, date or swimmers and no booking_id, so every
  // cross-family 1-on-2 showed as an unlabelled "booked" line. The rows exist
  // already here, so each debit also points at that family's first-half row.
  const firstStart = String(firstSession.start_time).slice(0, 5)
  const labelFor = (rows: any[], quote: { price: any }) => {
    const first = rows.find((r: any) => r.class_session_id === firstSession.id) ?? rows[0]
    return {
      bookingId: first?.id ?? null,
      pricing: { ...quote.price, kind: 'single', date: firstSession.session_date, startTime: firstStart,
                 students: [...new Set(rows.map((r: any) => r.student_id).filter(Boolean))] },
    }
  }
  const myLabel = labelFor(mine, myQuote)
  const theirLabel = labelFor(theirs, theirQuote)

  try {
    const paid = await applyPoints(supabase, {
      parentId: confirmingParent.id, reason: 'booking', points: -myQuote.total,
      pricing: myLabel.pricing, bookingId: myLabel.bookingId, actor: 'parent',
    })
    taken.push({ parentId: confirmingParent.id, points: myQuote.total, granted: paid.grantedTaken, expires: paid.grantedExpiresAt })
  } catch (e: any) {
    if (e instanceof WalletInArrears)
      return NextResponse.json({ error: 'WALLET_IN_ARREARS', owed: e.owed }, { status: 402 })
    if (e instanceof InsufficientPoints)
      return NextResponse.json({ error: 'NOT_ENOUGH_POINTS', needed: e.needed, available: e.available }, { status: 402 })
    console.error('points charge failed:', e)
    return NextResponse.json({ error: 'Could not take the points for this lesson. Please try again.' }, { status: 500 })
  }

  try {
    const paid = await applyPoints(supabase, {
      parentId: initiatorBooking.parent_id, reason: 'booking', points: -theirQuote.total,
      pricing: theirLabel.pricing, bookingId: theirLabel.bookingId, actor: 'parent',
    })
    taken.push({ parentId: initiatorBooking.parent_id, points: theirQuote.total, granted: paid.grantedTaken, expires: paid.grantedExpiresAt })
  } catch (e: any) {
    await refundSpent('the inviting family could not pay')
    // The INVITER's wallet is in arrears, not the confirming parent's (found
    // 2026-10-05). WALLET_IN_ARREARS made the invited parent read a message
    // about their own bank payment. Own string (err.partnerInArrears), no
    // `owed` figure (that is the other family's balance), and 409 rather than
    // 402: the dashboard turns a 402 into "not enough points" with a Buy
    // Points button, which is not something this parent can fix. The same
    // holds when the inviter is short of points: also 409.
    if (e instanceof WalletInArrears)
      return NextResponse.json({ error: 'The other family cannot be charged right now, so this lesson cannot be confirmed. Please contact us.' }, { status: 409 })
    if (e instanceof InsufficientPoints)
      return NextResponse.json({ error: 'The family who invited you no longer has enough points for their half of this lesson.' }, { status: 409 })
    console.error('points charge failed:', e)
    return NextResponse.json({ error: 'Could not take the points for this lesson. Please try again.' }, { status: 500 })
  }

  // Claim the WHOLE group in one update - the status filter is the lock. If the
  // count comes back short somebody else moved part of it, so hand back what we
  // took rather than leaving half the lesson confirmed.
  const groupIds = group.map(r => r.id)
  const { data: claimed, error: claimErr } = await supabase.from('bookings')
    .update({ status: 'confirmed' })
    .in('id', groupIds).eq('status', 'pending_partner').select('id')
  // A refusal by the database's own guards is not "already processed" (found
  // 2026-10-07): that told the family to retry something that fails the same
  // way every time. Name what refused, and end the invitation.
  if (claimErr) {
    await refundSpent('the lesson could not be confirmed')
    const m = claimErr.message || ''
    if (m.includes('STUDENT_DOUBLE_BOOKED') || m.includes('coach_timeslot_conflict')) {
      await cancelGroup(m.includes('STUDENT_DOUBLE_BOOKED') ? 'partner_double_booked' : 'slot_taken')
      return NextResponse.json({
        error: m.includes('STUDENT_DOUBLE_BOOKED')
          ? 'One of the swimmers already has a lesson at that time, so this invitation cannot be confirmed and has been cancelled. No points were used.'
          : 'This time slot was taken by another customer and cannot be confirmed.',
      }, { status: 409 })
    }
    console.error('confirm-partner: claim failed:', m)
    return NextResponse.json({ error: 'Could not confirm this lesson. Please try again.' }, { status: 500 })
  }
  if (!claimed || claimed.length !== groupIds.length) {
    if (claimed && claimed.length > 0) {
      await supabase.from('bookings').update({ status: 'pending_partner' }).in('id', claimed.map((r: any) => r.id))
    }
    await refundSpent('the invitation was already processed')
    return NextResponse.json({ error: 'This invitation was already processed.' }, { status: 409 })
  }

  // Stamp each row with its own half of what that family paid, so a later
  // cancellation refunds the right family the right number of points.
  // Each row also carries its share of any granted points that family used.
  const assign = async (rows: any[], perRow: number, t: { granted: number; expires: string | null } | undefined) => {
    const shares = splitGranted(t?.granted ?? 0, rows.map(() => perRow))
    for (const [i, row] of rows.entries()) {
      await supabase.from('bookings').update({
        lesson_credit_id: null,
        token_package_id: null,
        points_charged: perRow,
        points_granted: shares[i],
        points_granted_expires_at: shares[i] > 0 ? (t?.expires ?? null) : null,
        pending_action: null,
        pending_expires_at: null,
      }).eq('id', row.id)
    }
  }
  await assign(mine, myQuote.perRow, taken.find(t => t.parentId === confirmingParent.id))
  await assign(theirs, theirQuote.perRow, taken.find(t => t.parentId === initiatorBooking.parent_id))

  try {
    const { data: initiatorParent } = await supabase.from('parents').select('first_name, email').eq('id', initiatorBooking.parent_id).single()
    const { data: confirmer } = await supabase.from('parents').select('first_name, email').eq('id', confirmingParent.id).single()
    const kidIds = [...new Set(group.map(r => r.student_id).filter(Boolean))] as string[]
    const { data: kids } = kidIds.length
      ? await supabase.from('students').select('id, full_name').in('id', kidIds)
      : { data: [] as any[] }
    const kidName = new Map((kids || []).map((k: any) => [k.id, k.full_name]))
    const namesOf = (rows: any[]) => [...new Set(rows.map(r => kidName.get(r.student_id)).filter(Boolean))].join(' & ')
    const ordered = [...sessions].sort((a: any, b: any) => String(a.start_time).localeCompare(String(b.start_time)))
    const { data: sess } = await supabase
      .from('class_sessions')
      .select('session_date, start_time, course_types(name), coaches(first_name)')
      .eq('id', ordered[0].id)
      .single()
    if (sess) {
      const ct = Array.isArray((sess as any).course_types) ? (sess as any).course_types[0] : (sess as any).course_types
      const coach = Array.isArray((sess as any).coaches) ? (sess as any).coaches[0] : (sess as any).coaches
      const lesson = {
        courseName: (ct?.name || '') + (sessions.length > 1 ? ' (60 min)' : ''),
        coachName: coach?.first_name || '',
        date: (sess as any).session_date,
        // 12-hour start-end range across both halves of an hour (found
        // 2026-10-05): the raw column read "10:20:00" with no end time.
        time: formatTime12h(ordered[0].start_time) + ' \u2013 ' + formatTime12h(ordered[ordered.length - 1].end_time),
      }
      if (initiatorParent?.email) {
        await sendEmail({
          type: 'partner_booking_confirmed',
          to: initiatorParent.email,
          parentName: initiatorParent.first_name,
          studentName: namesOf(mine),
          ...lesson,
        })
      }
      // The family who accepted was charged too, and every other booking path
      // confirms to the family who paid (found 2026-10-07): they got nothing.
      if (confirmer?.email) {
        await sendEmail({
          type: 'booking_confirmed',
          to: confirmer.email,
          parentName: confirmer.first_name,
          studentName: namesOf(mine),
          partnerName: namesOf(theirs),
          ...lesson,
        })
      }
    }
  } catch {}

  return NextResponse.json({ success: true, rows_confirmed: groupIds.length })
}
