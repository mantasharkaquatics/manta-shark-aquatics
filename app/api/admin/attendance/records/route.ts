import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

export async function GET(req: NextRequest) {
  const cookieStore = await cookies()
  const supabaseAuth = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } }
  )
  const { data: { user } } = await supabaseAuth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: admin } = await supabase
    .from('admins')
    .select('id')
    .eq('auth_user_id', user.id)
    .single()

  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const page = parseInt(req.nextUrl.searchParams.get('page') || '1', 10)
  const pageSize = 10
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  const { data: records, count, error } = await supabase
    .from('attendance')
    .select('id, booking_id, student_id, check_in_method, checked_in_at', { count: 'exact' })
    .order('checked_in_at', { ascending: false })
    .range(from, to)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const studentIds = Array.from(new Set((records || []).map((r: any) => r.student_id)))
  const studentsRes = studentIds.length
    ? await supabase.from('students').select('id, full_name, parent_id').in('id', studentIds)
    : { data: [] as any[] }
  const studentsData = studentsRes.data || []

  const parentIds = Array.from(new Set(studentsData.map((s: any) => s.parent_id).filter(Boolean)))
  const parentsRes = parentIds.length
    ? await supabase.from('parents').select('id, first_name, last_name').in('id', parentIds)
    : { data: [] as any[] }
  const parentsData = parentsRes.data || []

  const studentMap = new Map(studentsData.map((s: any) => [s.id, s]))
  const parentMap = new Map(parentsData.map((p: any) => [p.id, p]))

  const enriched = (records || []).map((r: any) => {
    const student: any = studentMap.get(r.student_id)
    const parent: any = student ? parentMap.get(student.parent_id) : null
    return {
      id: r.id,
      student_name: student?.full_name || '\u672a\u77e5\u5b78\u751f',
      parent_name: parent ? (parent.first_name + ' ' + parent.last_name) : '',
      check_in_method: r.check_in_method,
      checked_in_at: r.checked_in_at,
    }
  })

  return NextResponse.json({
    records: enriched,
    total: count || 0,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil((count || 0) / pageSize)),
  })
}
