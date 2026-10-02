import { NextResponse } from 'next/server'
import { requireParent } from '@/lib/api-auth'
import { getTodayLA } from '@/lib/date'
import { graceUsedThisMonth, monthOfDate } from '@/lib/vouchers'

export const runtime = 'nodejs'

// The family's make-up vouchers that can still be used, and which children
// have already used this month's grace -- everything the dashboard needs to
// label each lesson's leave/cancel button and to list the vouchers.
export async function GET() {
  const ctx = await requireParent()
  if (!ctx) return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
  const { svc, parent } = ctx
  try {
    const today = getTodayLA()
    const [{ data: vs }, { data: kids }] = await Promise.all([
      svc.from('make_up_vouchers')
        .select('id, student_id, student2_id, course_slug, minutes, reason, expires_on, usable_from, created_at')
        .eq('parent_id', parent.id).eq('status', 'active').gte('expires_on', today)
        .order('expires_on', { ascending: true }),
      svc.from('students').select('id, full_name').eq('parent_id', parent.id),
    ])
    const nameOf = new Map<string, string>((kids || []).map((k: any) => [k.id, k.full_name]))
    const used = await graceUsedThisMonth(svc, (kids || []).map((k: any) => k.id), today)
    return NextResponse.json({
      vouchers: (vs || []).map((v: any) => ({
        id: v.id, studentId: v.student_id, student2Id: v.student2_id,
        studentNames: [nameOf.get(v.student_id), v.student2_id ? nameOf.get(v.student2_id) : null].filter(Boolean),
        courseSlug: v.course_slug, minutes: v.minutes, reason: v.reason, expiresOn: v.expires_on, usableFrom: v.usable_from ?? null,
      })),
      graceMonth: monthOfDate(today),
      graceUsed: [...used],
    })
  } catch (e) {
    console.error('parent/vouchers failed:', e)
    return NextResponse.json({ error: 'Could not load the make-up vouchers' }, { status: 500 })
  }
}
