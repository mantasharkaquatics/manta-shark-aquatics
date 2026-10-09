import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { formatTime12h } from '@/lib/date'
import { getLocations, locationParam, DEFAULT_LOCATION_ID } from '@/lib/locations'
import { allRowsIn } from '@/lib/db-paging'

type Svc = SupabaseClient

/* Which pool each check-in was at.
   A lesson check-in: attendance -> booking -> class_sessions.location_id.
   A Swim Team check-in has no lesson, only the squad and the practice start,
   so it takes the pool of the team block in Zones with that squad and start
   on that day (a date override first, else the weekly one). Anything that
   cannot be traced -- including every row before the locations migration --
   is the default pool. */
async function lessonLocations(svc: Svc, rows: any[]): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  const bookingIds = [...new Set(rows.map(r => r.booking_id).filter(Boolean))] as string[]
  if (!bookingIds.length) return out
  const { data: bookings } = await allRowsIn(bookingIds, c => svc.from('bookings').select('id, class_session_id').in('id', c).order('id'))
  const sessionIds = [...new Set(bookings.map((b: any) => b.class_session_id).filter(Boolean))] as string[]
  const { data: sessions } = sessionIds.length
    ? await allRowsIn(sessionIds, c => svc.from('class_sessions').select('id, location_id').in('id', c).order('id'))
    : { data: [] as any[] }
  const sessLoc = new Map(sessions.map((x: any) => [x.id, x.location_id as string]))
  const bookLoc = new Map(bookings.map((b: any) => [b.id, sessLoc.get(b.class_session_id)]))
  for (const r of rows) out.set(r.id, bookLoc.get(r.booking_id) || DEFAULT_LOCATION_ID)
  return out
}

async function teamLocations(svc: Svc, rows: any[]): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  const tierIds = [...new Set(rows.map(r => r.team_tier_id).filter(Boolean))] as string[]
  const { data: zones } = tierIds.length
    ? await svc.from('coach_availability_zones').select('kind, weekday, override_date, start_time, team_tier_id, location_id')
        .eq('zone_type', 'team').in('team_tier_id', tierIds)
    : { data: [] as any[] }
  for (const r of rows) {
    const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles' }).format(new Date(r.checked_in_at))
    const dow = new Date(day + 'T00:00:00').getDay()
    const st = String(r.start_time || '').slice(0, 5)
    const same = (zones || []).filter((z: any) => z.team_tier_id === r.team_tier_id && String(z.start_time).slice(0, 5) === st)
    const z = same.find((z: any) => z.kind === 'date' && z.override_date === day) || same.find((z: any) => z.kind === 'weekly' && z.weekday === dow)
    out.set(r.id, z?.location_id || DEFAULT_LOCATION_ID)
  }
  return out
}

/* With a pool chosen, the newest `want` check-ins at that pool from one table,
   read 200 at a time. `more` = rows remain unread, so there may be further
   pages; the exact count would mean tracing every check-in ever made. */
async function newestAt(
  read: (from: number, to: number) => PromiseLike<{ data: any[] | null; error: any }>,
  locate: (rows: any[]) => Promise<Map<string, string>>,
  location: string,
  want: number,
): Promise<{ rows: any[]; more: boolean; error: any }> {
  const STEP = 200
  const rows: any[] = []
  for (let from = 0; ; from += STEP) {
    const { data, error } = await read(from, from + STEP - 1)
    if (error) return { rows, more: false, error }
    const batch = data || []
    const where = await locate(batch)
    for (const r of batch) {
      if (where.get(r.id) !== location) continue
      rows.push({ ...r, location_id: location })
      if (rows.length >= want) return { rows, more: true, error: null }
    }
    if (batch.length < STEP) return { rows, more: false, error: null }
  }
}

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
  // ?location=<id>: only check-ins at that pool (the desk's All / pool switch).
  const allLocations = await getLocations(supabase)
  const location = allLocations.length > 1 ? locationParam(req.nextUrl.searchParams.get('location'), allLocations) : null
  const lessonCols = 'id, booking_id, student_id, check_in_method, checked_in_at'
  const teamCols = 'id, student_id, team_tier_id, start_time, check_in_method, checked_in_at, team_tiers(name)'
  if (location) {
    const [lessons, teams] = await Promise.all([
      newestAt((a, b) => supabase.from('attendance').select(lessonCols).order('checked_in_at', { ascending: false }).order('id').range(a, b),
        rows => lessonLocations(supabase, rows), location, fetchLimit),
      newestAt((a, b) => supabase.from('team_attendance').select(teamCols).order('checked_in_at', { ascending: false }).order('id').range(a, b),
        rows => teamLocations(supabase, rows), location, fetchLimit),
    ])
    if (lessons.error) return NextResponse.json({ error: lessons.error.message }, { status: 500 })
    if (teams.error) return NextResponse.json({ error: teams.error.message }, { status: 500 })
    const merged = [
      ...lessons.rows.map((r: any) => ({ ...r, kind: 'lesson' })),
      ...teams.rows.map((r: any) => ({ ...r, kind: 'team' })),
    ].sort((a: any, b: any) => new Date(b.checked_in_at).getTime() - new Date(a.checked_in_at).getTime())
    const from = (page - 1) * pageSize
    const more = lessons.more || teams.more
    // Exact when both tables were read to the end; otherwise "at least one more page".
    const total = more ? Math.max(merged.length, fetchLimit) + 1 : merged.length
    return NextResponse.json({
      records: await enrich(supabase, merged.slice(from, from + pageSize)),
      total, page, pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    })
  }

  // Merge lesson check-ins (attendance) and team practice check-ins (team_attendance).
  // Each table is fetched up to page*pageSize newest rows, merged in memory, then sliced.
  const [lessonRes, teamRes] = await Promise.all([
    supabase
      .from('attendance')
      .select(lessonCols, { count: 'exact' })
      .order('checked_in_at', { ascending: false })
      .range(0, fetchLimit - 1),
    supabase
      .from('team_attendance')
      .select(teamCols, { count: 'exact' })
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
  // Each row's pool, for the tag beside it -- only worth the reads with two pools.
  if (allLocations.length > 1) {
    const [lessonLoc, teamLoc] = await Promise.all([
      lessonLocations(supabase, pageRows.filter((r: any) => r.kind === 'lesson')),
      teamLocations(supabase, pageRows.filter((r: any) => r.kind === 'team')),
    ])
    for (const r of pageRows as any[]) r.location_id = (r.kind === 'team' ? teamLoc : lessonLoc).get(r.id) || null
  }
  const enriched = await enrich(supabase, pageRows)

  const total = (lessonRes.count || 0) + (teamRes.count || 0)

  return NextResponse.json({
    records: enriched,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  })
}

/** Names for one page of check-ins. */
async function enrich(supabase: Svc, pageRows: any[]) {
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

  return pageRows.map((r: any) => {
    const student: any = studentMap.get(r.student_id)
    const parent: any = student ? parentMap.get(student.parent_id) : null
    // Neutral data only: the wording ('Unknown student', 'Team practice') was
    // fixed here in one language each and ignored the admin's own (found
    // 2026-10-04). The check-in screen words it through t().
    const tierName = r.kind === 'team' ? (Array.isArray(r.team_tiers) ? r.team_tiers[0]?.name : r.team_tiers?.name) : null
    return {
      id: r.kind + '-' + r.id,
      kind: r.kind as 'lesson' | 'team',
      student_name: student?.full_name || null,
      parent_name: parent ? (parent.first_name + ' ' + parent.last_name) : '',
      check_in_method: r.check_in_method,
      checked_in_at: r.checked_in_at,
      team_time: r.kind === 'team' ? formatTime12h(String(r.start_time).slice(0, 5)) : null,
      team_tier_id: r.kind === 'team' ? (r.team_tier_id || null) : null,
      team_tier_name: tierName || null,
      location_id: r.location_id ?? null,
    }
  })
}
