import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, requireParent, serviceClient } from '@/lib/api-auth'

export async function GET(req: NextRequest) {
  const studentId = req.nextUrl.searchParams.get('student_id')
  if (!studentId) return NextResponse.json({ error: 'Missing student_id' }, { status: 400 })

  // Auth: admin (any student) or parent (own students only)
  let svc: ReturnType<typeof serviceClient>
  const adminCtx = await requireAdmin()
  if (adminCtx) {
    svc = adminCtx.svc
  } else {
    const parentCtx = await requireParent()
    if (!parentCtx) return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
    svc = parentCtx.svc
    const { data: owned } = await svc
      .from('students')
      .select('id')
      .eq('id', studentId)
      .eq('parent_id', parentCtx.parent.id)
      .single()
    if (!owned) return NextResponse.json({ error: 'Student not found' }, { status: 403 })
  }

  const { data: student } = await svc
    .from('students')
    .select('id, trial_used_at, current_level')
    .eq('id', studentId)
    .single()

  if (!student) return NextResponse.json({ error: 'Student not found' }, { status: 404 })

  const { data: existingTrial } = await svc
    .from('bookings')
    .select('id')
    .eq('student_id', studentId)
    .eq('is_trial', true)
    .neq('status', 'cancelled')
    .limit(1)

  const hasActiveTrial = !!(existingTrial && existingTrial.length > 0)

  return NextResponse.json({
    eligible: !student.trial_used_at && !hasActiveTrial && student.current_level == null,
    trialUsedAt: student.trial_used_at,
    hasActiveTrial,
    hasLevel: student.current_level != null,
  })
}
