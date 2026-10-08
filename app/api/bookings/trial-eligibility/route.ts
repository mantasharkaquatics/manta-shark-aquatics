import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, requireParent, serviceClient } from '@/lib/api-auth'
import Stripe from 'stripe'
import { SCHOOL_CANCEL_REASONS, syncTrialBooking } from '@/lib/trial-booking'
import { getTodayLA, getNowMinutesLA } from '@/lib/date'
import { assessmentPaymentReversed, reopenReversedAssessment } from '@/lib/assessments'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2026-05-27.dahlia' as any })

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
  const readAll = () => {
    let studentQ = svc.from('students').select('id, parent_id, trial_used_at, current_level').eq('id', studentId)
    if (parentId) studentQ = studentQ.eq('parent_id', parentId)
    return Promise.all([
      studentQ.maybeSingle(),
      // Every assessment booking, newest first, with its lesson time: the page
      // has to tell "booked, not taken yet" from "taken" from "the school
      // cancelled it" (found 2026-10-07). A swimmer has only a handful.
      svc.from('bookings').select('id, status, cancellation_reason, created_at, class_session_id, pending_expires_at, stripe_session_id')
        .eq('student_id', studentId).eq('is_trial', true).order('created_at', { ascending: false }).limit(20),
      // Paid (e.g. at POS) but not yet scheduled: an unused assessment credit exists
      svc.from('lesson_credits').select('id')
        .eq('student_id', studentId).eq('is_trial', true).eq('used_credits', 0).limit(1),
    ])
  }
  let [{ data: student }, { data: trialRows }, { data: unusedCredit }] = await readAll()

  // An unpaid hold whose 15 minutes are over is settled now -- released, or
  // confirmed if it was paid at the last moment -- rather than waiting for
  // the cleanup cron (every 15 minutes) or the dashboard. It kept the family
  // from booking again, and showed a "held until" time already past, for up
  // to 15 more minutes (found 2026-10-08). syncTrialBooking closes the Stripe
  // checkout before it lets the slot go.
  if (student) {
    const expired = (trialRows || []).filter((b: any) => b.status === 'pending_payment'
      && b.pending_expires_at && Date.parse(b.pending_expires_at) <= Date.now())
    let changed = false
    for (const b of expired) {
      try {
        const r = await syncTrialBooking(svc, stripe, b)
        if (r.state === 'released' || r.state === 'confirmed') changed = true
      } catch (e) {
        console.error('trial-eligibility: could not settle an expired hold', b.id, e)
      }
    }
    if (changed) [{ data: student }, { data: trialRows }, { data: unusedCredit }] = await readAll()
  }

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
  //   awaiting_payment -- held for the family but not paid yet; it is paid
  //                       or cancelled on the dashboard, and the hold ends at
  //                       pendingExpiresAt (found 2026-10-08: it read
  //                       "booked, waiting for the assessment")
  //   booked           -- a paid assessment booking that has not ended yet
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
  const held = active.find(b => b.status === 'pending_payment')
  let reason: 'eligible' | 'prepaid' | 'awaiting_payment' | 'booked' | 'school_cancelled' | 'done'
  if (st.current_level != null) reason = 'done'
  else if (hasCredit) reason = 'prepaid'
  else if (eligible) reason = 'eligible'
  else if (held) reason = 'awaiting_payment'
  else if (active.some(notEnded)) reason = 'booked'
  else if (!hasActiveTrial && st.trial_used_at && newest?.status === 'cancelled'
    && (SCHOOL_CANCEL_REASONS as readonly string[]).includes(newest.cancellation_reason)) {
    // A payment refunded in full or charged back is not owed: the school will
    // not rebook it (found 2026-10-08). Clearing trial_used_at makes the
    // swimmer eligible to pay again (owner, 2026-10-08); normally the cancel
    // or the refund already did, this catches anything that slipped past.
    if (await assessmentPaymentReversed(svc, studentId).catch(() => false)) {
      reason = (await reopenReversedAssessment(svc, studentId)) ? 'eligible' : 'done'
    } else reason = 'school_cancelled'
  }
  else reason = 'done'

  return NextResponse.json({
    eligible: eligible || reason === 'eligible',
    hasCredit,
    trialUsedAt: reason === 'eligible' ? null : st.trial_used_at,
    hasActiveTrial,
    hasLevel: st.current_level != null,
    reason,
    pendingExpiresAt: held?.pending_expires_at ?? null,
  })
}
