import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'

export async function GET(req: NextRequest) {
  const auth = await requireAdmin()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const session_id = req.nextUrl.searchParams.get('session_id')
  if (!session_id) return NextResponse.json({ error: 'Missing session_id' }, { status: 400 })

  const supabase = auth.svc

  const { data: bookings, error } = await supabase
    .from('bookings')
    .select('id, status, lesson_credit_id, parent_id, student_id, is_trial, lesson_group_id')
    .eq('class_session_id', session_id)
    .neq('status', 'cancelled')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!bookings?.length) return NextResponse.json([])

  const studentIds = bookings.map(b => b.student_id).filter(Boolean)
  const parentIds = bookings.map(b => b.parent_id).filter(Boolean)

  const [{ data: students }, { data: parents }] = await Promise.all([
    supabase.from('students').select('id, full_name, current_level').in('id', studentIds),
    supabase.from('parents').select('id, first_name, last_name').in('id', parentIds),
  ])

  // A 60-minute lesson lives in TWO sessions linked by lesson_group_id, and the
  // admin calendar only ever knows about the one that was clicked. Hand back the
  // real span so the modal can say 10:55-11:55 instead of the half's 10:55-11:25.
  let groupStart: string | null = null
  let groupEnd: string | null = null
  const groupId = bookings.map((b: any) => b.lesson_group_id).find(Boolean)
  if (groupId) {
    const { data: sibs } = await supabase
      .from('bookings').select('class_session_id')
      .eq('lesson_group_id', groupId).neq('status', 'cancelled')
    const ids = Array.from(new Set((sibs || []).map((b: any) => b.class_session_id).filter(Boolean)))
    if (ids.length > 1) {
      const { data: gs } = await supabase
        .from('class_sessions').select('start_time, end_time').in('id', ids).neq('status', 'cancelled')
      for (const g of gs || []) {
        if (!groupStart || String(g.start_time) < groupStart) groupStart = String(g.start_time)
        if (!groupEnd || String(g.end_time) > groupEnd) groupEnd = String(g.end_time)
      }
    }
  }

  const result = bookings.map(b => ({
    ...b,
    group_start_time: groupStart,
    group_end_time: groupEnd,
    students: students?.find(s => s.id === b.student_id) || null,
    parents: parents?.find(p => p.id === b.parent_id) || null,
  }))

  return NextResponse.json(result)
}
