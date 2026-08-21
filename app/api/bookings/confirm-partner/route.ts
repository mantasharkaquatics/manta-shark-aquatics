import { sendEmail } from '@/lib/email'
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { spendCredit } from '@/lib/ledger'
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

  const poolFor = async (parentId: string) => {
    const { data: rows } = await supabase
      .from('lesson_credits').select('id, total_credits, used_credits, course_type_id')
      .eq('parent_id', parentId)
      .is('converted_to_token_at', null)
    const flat: string[] = []
    for (const c of (rows || []).filter(c => c.course_type_id === courseTypeId).sort((a, b) => a.id.localeCompare(b.id))) {
      for (let i = 0; i < (c.total_credits - c.used_credits); i++) flat.push(c.id)
    }
    return flat
  }

  const myPool = await poolFor(confirmingParent.id)
  const theirPool = await poolFor(initiatorBooking.parent_id)
  if (myPool.length < mine.length)
    return NextResponse.json({ error: `You need ${mine.length} credits to confirm this lesson - you have ${myPool.length}.` }, { status: 402 })
  if (theirPool.length < theirs.length)
    return NextResponse.json({ error: 'The inviting family does not have enough credits.' }, { status: 402 })

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
    return NextResponse.json({ error: 'This invitation was already processed.' }, { status: 409 })
  }

  const assign = async (rows: any[], pool: string[]) => {
    for (let i = 0; i < rows.length; i++) {
      await supabase.from('bookings').update({
        lesson_credit_id: pool[i],
        pending_action: null,
        pending_expires_at: null,
      }).eq('id', rows[i].id)
      await spendCredit(supabase, pool[i])
    }
  }
  await assign(mine, myPool)
  await assign(theirs, theirPool)

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
