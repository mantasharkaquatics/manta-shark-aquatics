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
    .select('id, status, lesson_credit_id, parent_id, student_id')
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

  const result = bookings.map(b => ({
    ...b,
    students: students?.find(s => s.id === b.student_id) || null,
    parents: parents?.find(p => p.id === b.parent_id) || null,
  }))

  return NextResponse.json(result)
}
