import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, requireParent, serviceClient } from '@/lib/api-auth'

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
  const [{ data: student }, { data: existingTrial }, { data: unusedCredit }] = await Promise.all([
    studentQ.maybeSingle(),
    svc.from('bookings').select('id')
      .eq('student_id', studentId).eq('is_trial', true).neq('status', 'cancelled').limit(1),
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

  const hasActiveTrial = !!(existingTrial && existingTrial.length > 0)
  const hasCredit = !!(unusedCredit && unusedCredit.length > 0) && !hasActiveTrial && st.current_level == null

  return NextResponse.json({
    eligible: !st.trial_used_at && !hasActiveTrial && st.current_level == null,
    hasCredit,
    trialUsedAt: st.trial_used_at,
    hasActiveTrial,
    hasLevel: st.current_level != null,
  })
}
