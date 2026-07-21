import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { formatTime12h } from '@/lib/date'

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
  const fetchLimit = page * pageSize

  // Merge lesson check-ins (attendance) and team practice check-ins (team_attendance).
  // Each table is fetched up to page*pageSize newest rows, merged in memory, then sliced.
  const [lessonRes, teamRes] = await Promise.all([
    supabase
      .from('attendance')
      .select('id, booking_id, student_id, check_in_method, checked_in_at', { count: 'exact' })
      .order('checked_in_at', { ascending: false })
      .range(0, fetchLimit - 1),
    supabase
      .from('team_attendance')
      .select('id, student_id, team_tier_id, start_time, check_in_method, checked_in_at, team_tiers(name)', { count: 'exact' })
      .order('checked_in_at', { ascending: false })
      .range(0, fetchLimit - 1),
  ])

  if (lessonRes.error) return NextResponse.json({ error: lessonRes.error.message }, { status: 500 })
  if (teamRes.error) return NextResponse.json({ error: teamRes.error.message }, { status: 500 })

  const merged = [
    ...(lessonRes.data || []).map((r: any) => ({ ...r, kind: 'lesson' })),
    ...(teamRes.data || []).map((r: any) => ({ ...r, kind: 'team' })),
  ].sort((a: any, b: any) => new Date(b.checked_in_at).getTime() - new Date(a.checked_in_at).getTime())

  const from = (page - 1) * pageSize
  const pageRows = merged.slice(from, from + pageSize)

  const studentIds = Array.from(new Set(pageRows.map((r: any) => r.student_id)))
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

  const enriched = pageRows.map((r: any) => {
    const student: any = studentMap.get(r.student_id)
    const parent: any = student ? parentMap.get(student.parent_id) : null
    let detail: string | undefined
    if (r.kind === 'team') {
      const tierName = Array.isArray(r.team_tiers) ? r.team_tiers[0]?.name : r.team_tiers?.name
      detail = formatTime12h(String(r.start_time).slice(0, 5)) + ' \u00b7 ' + (tierName || 'Team') + ' practice'
    }
    return {
      id: r.kind + '-' + r.id,
      student_name: student?.full_name || '\u672a\u77e5\u5b78\u751f',
      parent_name: parent ? (parent.first_name + ' ' + parent.last_name) : '',
      check_in_method: r.check_in_method,
      checked_in_at: r.checked_in_at,
      detail,
    }
  })

  const total = (lessonRes.count || 0) + (teamRes.count || 0)

  return NextResponse.json({
    records: enriched,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  })
}
