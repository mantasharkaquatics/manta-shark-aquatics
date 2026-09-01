import { sendEmail } from '@/lib/email'
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { priceLesson } from '@/lib/points'
import { applyPoints, InsufficientPoints, lessonsCompleted } from '@/lib/points-wallet'
import { readJson, badRequest } from '@/lib/http'

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
    .select('id, enrolled_count, max_students, course_type_id, coach_id, session_date, start_time')
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
  for (const session of sessions) {
    const { data: conflictSessions } = await supabase
      .from('class_sessions')
      .select('id')
      .eq('coach_id', session.coach_id)
      .eq('session_date', session.session_date)
      .eq('start_time', session.start_time)
      .neq('id', session.id)
    const conflictSessionIds = (conflictSessions || []).map((s: any) => s.id)
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

  const courseTypeId = sessions[0].course_type_id
  const { data: courseType } = await supabase
    .from('course_types').select('slug').eq('id', courseTypeId).single()
  if (!courseType) return NextResponse.json({ error: 'Course type not found' }, { status: 404 })

  // An hour lesson is two halves; the whole lesson is priced from the earlier
  // one, so a 60-minute lesson that starts off-peak is off-peak throughout.
  const firstSession = [...sessions].sort((a: any, b: any) =>
    (a.session_date + a.start_time).localeCompare(b.session_date + b.start_time))[0]

  // Each family pays for its own seat, at its OWN VIP level. That is the whole
  // point of settling here rather than when the invitation was sent: a family
  // that reached a new tier in the meantime gets the better price, and neither
  // family's discount is quietly spent on the other's lesson.
  const quoteFor = async (parentId: string, halves: number) => {
    const price = priceLesson({
      courseSlug: courseType.slug,
      minutes: 30,
      lessonsCompleted: await lessonsCompleted(supabase, parentId),
      sessionDate: firstSession.session_date,
      startTime: String(firstSession.start_time).slice(0, 5),
      seats: 1,
    })
    return { price, perRow: price.perHalfHour, total: price.perHalfHour * halves }
  }

  let myQuote, theirQuote
  try {
    myQuote = await quoteFor(confirmingParent.id, mine.length)
    theirQuote = await quoteFor(initiatorBooking.parent_id, theirs.length)
  } catch {
    return NextResponse.json({ error: 'This lesson cannot be paid for with points.' }, { status: 400 })
  }

  // Settle both families BEFORE the claim. Taking the points first means a lost
  // race is a 409 with nothing claimed, instead of a confirmed lesson nobody
  // paid for. Both debits are reversible, and refundSpent() puts them back.
  const taken: { parentId: string; points: number }[] = []
  const refundSpent = async (why: string) => {
    for (const t of taken) {
      await applyPoints(supabase, {
        parentId: t.parentId, reason: 'booking_failed', points: t.points,
        actor: 'system', note: why,
      }).catch(e => console.error('points rollback failed:', e))
    }
    taken.length = 0
  }

  try {
    await applyPoints(supabase, {
      parentId: confirmingParent.id, reason: 'booking', points: -myQuote.total,
      pricing: myQuote.price, actor: 'parent',
    })
    taken.push({ parentId: confirmingParent.id, points: myQuote.total })
  } catch (e: any) {
    if (e instanceof InsufficientPoints)
      return NextResponse.json({ error: 'NOT_ENOUGH_POINTS', needed: e.needed, available: e.available }, { status: 402 })
    console.error('points charge failed:', e)
    return NextResponse.json({ error: 'Could not take the points for this lesson. Please try again.' }, { status: 500 })
  }

  try {
    await applyPoints(supabase, {
      parentId: initiatorBooking.parent_id, reason: 'booking', points: -theirQuote.total,
      pricing: theirQuote.price, actor: 'parent',
    })
    taken.push({ parentId: initiatorBooking.parent_id, points: theirQuote.total })
  } catch (e: any) {
    await refundSpent('the inviting family could not pay')
    if (e instanceof InsufficientPoints)
      return NextResponse.json({ error: 'The family who invited you no longer has enough points for their half of this lesson.' }, { status: 402 })
    console.error('points charge failed:', e)
    return NextResponse.json({ error: 'Could not take the points for this lesson. Please try again.' }, { status: 500 })
  }

  // Claim the WHOLE group in one update - the status filter is the lock. If the
  // count comes back short somebody else moved part of it, so hand back what we
  // took rather than leaving half the lesson confirmed.
  const groupIds = group.map(r => r.id)
  const { data: claimed } = await supabase.from('bookings')
    .update({ status: 'confirmed' })
    .in('id', groupIds).eq('status', 'pending_partner').select('id')
  if (!claimed || claimed.length !== groupIds.length) {
    if (claimed && claimed.length > 0) {
      await supabase.from('bookings').update({ status: 'pending_partner' }).in('id', claimed.map((r: any) => r.id))
    }
    await refundSpent('the invitation was already processed')
    return NextResponse.json({ error: 'This invitation was already processed.' }, { status: 409 })
  }

  // Stamp each row with its own half of what that family paid, so a later
  // cancellation refunds the right family the right number of points.
  const assign = async (rows: any[], perRow: number) => {
    for (const row of rows) {
      await supabase.from('bookings').update({
        lesson_credit_id: null,
        token_package_id: null,
        points_charged: perRow,
        pending_action: null,
        pending_expires_at: null,
      }).eq('id', row.id)
    }
  }
  await assign(mine, myQuote.perRow)
  await assign(theirs, theirQuote.perRow)

  try {
    const { data: initiatorParent } = await supabase.from('parents').select('first_name, email').eq('id', initiatorBooking.parent_id).single()
    const { data: partnerStudent } = await supabase.from('students').select('full_name').eq('id', partnerBooking.student_id).single()
    const ordered = [...sessions].sort((a: any, b: any) => String(a.start_time).localeCompare(String(b.start_time)))
    const { data: sess } = await supabase
      .from('class_sessions')
      .select('session_date, start_time, course_types(name), coaches(first_name)')
      .eq('id', ordered[0].id)
      .single()
    if (initiatorParent && sess) {
      const ct = Array.isArray((sess as any).course_types) ? (sess as any).course_types[0] : (sess as any).course_types
      const coach = Array.isArray((sess as any).coaches) ? (sess as any).coaches[0] : (sess as any).coaches
      await sendEmail({
        type: 'partner_booking_confirmed',
        to: initiatorParent.email,
        parentName: initiatorParent.first_name,
        studentName: partnerStudent?.full_name || '',
        courseName: (ct?.name || '') + (sessions.length > 1 ? ' (60 min)' : ''),
        coachName: coach?.first_name || '',
        date: (sess as any).session_date,
        time: (sess as any).start_time,
      })
    }
  } catch {}

  return NextResponse.json({ success: true, rows_confirmed: groupIds.length })
}
