import { sendEmail } from '@/lib/email'
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { refundCredit, refundToken, spendCredit, spendToken } from '@/lib/ledger'
import { allocateTokens, isWithinTokenWindow, tokenPool } from '@/lib/tokens'
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
    .select('id, class_session_id, parent_id, student_id, pay_with_token')
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
  // An hour lesson is two halves; the token window is judged on the earlier one.
  const firstSession = [...sessions].sort((a: any, b: any) =>
    (a.session_date + a.start_time).localeCompare(b.session_date + b.start_time))[0]
  const tokenWindowOpen = !!courseType
    && isWithinTokenWindow(firstSession.session_date, firstSession.start_time)

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

  // Each family pays for its own seats, and pays all of them the same way --
  // part token and part credit has no clean cancellation. pay_with on this
  // request is the confirming family's choice; the inviting family chose when
  // they sent the invitation, and it has been sitting on their pending row
  // since. Either choice falls back to credit when tokens no longer cover the
  // seats, because credit is the option that leaves the lesson cancellable.
  const planFor = async (parentId: string, seats: number, wantsToken: boolean) => {
    if (wantsToken && tokenWindowOpen) {
      const picked = allocateTokens(await tokenPool(supabase, parentId, courseType!.slug), seats)
      if (picked) return { tokens: picked, credits: [] as string[], shortBy: 0 }
    }
    const pool = await poolFor(parentId)
    if (pool.length < seats) return { tokens: [] as string[], credits: [] as string[], shortBy: pool.length }
    return { tokens: [] as string[], credits: pool.slice(0, seats), shortBy: 0 }
  }

  const myPlan = await planFor(confirmingParent.id, mine.length, body.pay_with !== 'credit')
  if (myPlan.tokens.length === 0 && myPlan.credits.length === 0)
    return NextResponse.json({ error: `You need ${mine.length} credits to confirm this lesson - you have ${myPlan.shortBy}.` }, { status: 402 })
  const theirPlan = await planFor(initiatorBooking.parent_id, theirs.length, !!initiatorBooking.pay_with_token)
  if (theirPlan.tokens.length === 0 && theirPlan.credits.length === 0)
    return NextResponse.json({ error: 'The inviting family does not have enough credits.' }, { status: 402 })

  // Settle both families BEFORE the claim. The pool checks above run in
  // TypeScript while the spend runs in SQL, so two confirmations racing each
  // other both clear them; the ceiling constraint is the only real arbiter.
  // Spending first means a lost race is a 409 with nothing claimed, instead of a
  // confirmed lesson that nobody was charged for.
  const spentCredits: string[] = []
  const spentTokens: string[] = []
  const refundSpent = async () => {
    for (const cid of spentCredits) await refundCredit(supabase, cid)
    for (const tid of spentTokens) await refundToken(supabase, tid)
  }
  for (const cid of [...myPlan.credits, ...theirPlan.credits]) {
    if (!(await spendCredit(supabase, cid))) {
      await refundSpent()
      return NextResponse.json({ error: 'Credits ran out while this invitation was being confirmed. Please refresh and try again.' }, { status: 409 })
    }
    spentCredits.push(cid)
  }
  for (const tid of [...myPlan.tokens, ...theirPlan.tokens]) {
    if (!(await spendToken(supabase, tid))) {
      await refundSpent()
      return NextResponse.json({ error: 'Credits ran out while this invitation was being confirmed. Please refresh and try again.' }, { status: 409 })
    }
    spentTokens.push(tid)
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
    await refundSpent()
    return NextResponse.json({ error: 'This invitation was already processed.' }, { status: 409 })
  }

  const assign = async (rows: any[], plan: { tokens: string[]; credits: string[] }) => {
    for (let i = 0; i < rows.length; i++) {
      await supabase.from('bookings').update({
        lesson_credit_id: plan.credits[i] ?? null,
        token_package_id: plan.tokens[i] ?? null,
        pending_action: null,
        pending_expires_at: null,
      }).eq('id', rows[i].id)
    }
  }
  await assign(mine, myPlan)
  await assign(theirs, theirPlan)

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
