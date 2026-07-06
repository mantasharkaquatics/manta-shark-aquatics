import { NextRequest, NextResponse } from 'next/server'
import { requireParent } from '@/lib/api-auth'

export async function GET(req: NextRequest) {
  const ctx = await requireParent()
  if (!ctx) return NextResponse.json({ error: 'Not authorized' }, { status: 401 })

  const studentId = req.nextUrl.searchParams.get('student_id')
  if (!studentId) return NextResponse.json({ error: 'Missing student_id' }, { status: 400 })

  const { data: student } = await ctx.svc
    .from('students')
    .select('id, trial_used_at')
    .eq('id', studentId)
    .eq('parent_id', ctx.parent.id)
    .single()

  if (!student || student.trial_used_at) return NextResponse.json({ eligible: false })

  const { data: existingTrial } = await ctx.svc
    .from('bookings')
    .select('id')
    .eq('student_id', studentId)
    .eq('is_trial', true)
    .neq('status', 'cancelled')
    .limit(1)

  return NextResponse.json({ eligible: !existingTrial || existingTrial.length === 0 })
}
