import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, requireParent, serviceClient } from '@/lib/api-auth'
import { SCHOOL_CANCEL_REASONS } from '@/lib/trial-booking'
import { getTodayLA, getNowMinutesLA } from '@/lib/date'

export async function GET(req: NextRequest) {
  const studentId = req.nextUrl.searchParams.get('student_id')
  if (!studentId) return NextResponse.json({ error: 'Missing student_id' }, { status: 400 })

  // Auth: parent (own students only) or admin (any student). The parent check
  // runs first because parents are who call this; asking "is this an admin?"
  // first cost every parent an extra round of auth lookups.
  let svc: ReturnType<typeof serviceClient>
  let parentId: string | null = null
  const parentCtx = await requireParent()
  if (parentCtx) {
    svc = parentCtx.svc
    parentId = parentCtx.parent.id
  } else {
    const adminCtx = await requireAdmin()
    if (!adminCtx) return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
    svc = adminCtx.svc
  }

  // The three reads are independent, so they go out together.
  let studentQ = svc.from('students').select('id, parent_id, trial_used_at, current_level').eq('id', studentId)
  if (parentId) studentQ = studentQ.eq('parent_id', parentId)
  const [{ data: student }, { data: trialRows }, { data: unusedCredit }] = await Promise.all([
    studentQ.maybeSingle(),
    // Every assessment booking, newest first, with its lesson time: the page
    // has to tell "booked, not taken yet" from "taken" from "the school
    // cancelled it" (found 2026-10-07). A swimmer has only a handful.
    svc.from('bookings').select('id, status, cancellation_reason, created_at, class_session_id')
      .eq('student_id', studentId).eq('is_trial', true).order('created_at', { ascending: false }).limit(20),
    // Paid (e.g. at POS) but not yet scheduled: an unused assessment credit exists
    svc.from('lesson_credits').select('id')
      .eq('student_id', studentId).eq('is_trial', true).eq('used_credits', 0).limit(1),
  ])

  let row = student
  if (!row && parentId) {
    // Not this parent's swimmer -- but the same login may also be an admin,
    // who may look up any student (the admin check used to run first).
    const adminCtx = await requireAdmin()
    if (adminCtx) {
      const { data } = await adminCtx.svc.from('students').select('id, parent_id, trial_used_at, current_level').eq('id', studentId).maybeSingle()
      row = data
    } else {
      return NextResponse.json({ error: 'Student not found' }, { status: 403 })
    }
  }
  if (!row) return NextResponse.json({ error: 'Student not found' }, { status: 404 })
  const st = row

  const trials = (trialRows || []) as any[]
  const active = trials.filter(b => b.status !== 'cancelled')
  const hasActiveTrial = active.length > 0
  const hasCredit = !!(unusedCredit && unusedCredit.length > 0) && !hasActiveTrial && st.current_level == null
  const eligible = !st.trial_used_at && !hasActiveTrial && st.current_level == null

  // Why the assessment is (or is not) offered, so the booking page can say it
  // plainly (owner, 2026-10-07). It used to say "Swim Assessment completed --
  // level pending" for every swimmer who could not book one, including one
  // whose assessment is next week and one whose assessment the school
  // cancelled (found 2026-10-07).
  //   eligible         -- may book (and pay for) an assessment
  //   prepaid          -- paid, not scheduled yet: pick a time
  //   booked           -- an assessment booking that has not ended yet
  //                       (held for payment or confirmed)
  //   school_cancelled -- the newest assessment was cancelled by the school;
  //                       it is still owed and the desk will rebook it (the
  //                       same test as the admin Reviews card,
  //                       lib/admin/review-queues loadAssessmentsToRebook)
  //   done             -- the swimmer has a level, or the assessment lesson
  //                       has taken place and the level is not set yet
  const today = getTodayLA(), nowMin = getNowMinutesLA()
  const toMin = (t: string) => { const [h, m] = String(t).slice(0, 5).split(':').map(Number); return h * 60 + m }
  const sessionIds = active.map(b => b.class_session_id).filter(Boolean)
  const sessionMap: Record<string, any> = {}
  if (sessionIds.length > 0) {
    const { data: ss } = await svc.from('class_sessions').select('id, session_date, end_time').in('id', sessionIds)
    for (const x of ss || []) sessionMap[x.id] = x
  }
  const notEnded = (b: any) => {
    const cs = sessionMap[b.class_session_id]
    // No lesson row to read: treat it as upcoming rather than claim it is done.
    if (!cs?.session_date) return true
    if (cs.session_date !== today) return cs.session_date > today
    return !cs.end_time || toMin(cs.end_time) > nowMin
  }
  const newest = trials[0]
  let reason: 'eligible' | 'prepaid' | 'booked' | 'school_cancelled' | 'done'
  if (st.current_level != null) reason = 'done'
  else if (hasCredit) reason = 'prepaid'
  else if (eligible) reason = 'eligible'
  else if (active.some(notEnded)) reason = 'booked'
  else if (!hasActiveTrial && st.trial_used_at && newest?.status === 'cancelled'
    && (SCHOOL_CANCEL_REASONS as readonly string[]).includes(newest.cancellation_reason)) reason = 'school_cancelled'
  else reason = 'done'

  return NextResponse.json({
    eligible,
    hasCredit,
    trialUsedAt: st.trial_used_at,
    hasActiveTrial,
    hasLevel: st.current_level != null,
    reason,
  })
}
