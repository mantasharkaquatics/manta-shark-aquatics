import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import AdminUpgradesClient from './AdminUpgradesClient'

export default async function AdminUpgradesPage() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } }
  )
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: admin } = await supabase.from('admins').select('id').eq('auth_user_id', user.id).single()
  if (!admin) redirect('/dashboard')

  const svc = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // 兩步查詢：pending recommendations
  const { data: recs } = await svc
    .from('level_recommendations')
    .select('id, recommended_level, notes, created_at, student_id, coach_id, previous_recommended_level')
    .eq('status', 'pending')
    .order('created_at', { ascending: false })

  let recommendations: any[] = []
  if (recs && recs.length > 0) {
    const studentIds = [...new Set(recs.map(r => r.student_id))]
    const coachIds = [...new Set(recs.map(r => r.coach_id))]
    const { data: recStudents } = await svc.from('students').select('id, full_name, current_level').in('id', studentIds)
    const { data: recCoaches } = await svc.from('coaches').select('id, first_name').in('id', coachIds)
    const sMap: Record<string, any> = {}
    for (const s of recStudents || []) sMap[s.id] = s
    const cMap: Record<string, any> = {}
    for (const c of recCoaches || []) cMap[c.id] = c
    recommendations = recs.map(r => ({
      ...r,
      student: sMap[r.student_id],
      coach: cMap[r.coach_id],
      previous_recommended_level: r.previous_recommended_level ?? null,
    }))
  }

  // upgrade history
  const { data: rawHistory } = await svc
    .from('level_upgrades')
    .select('id, from_level, to_level, upgraded_at, notes, student_id, upgraded_by')
    .order('upgraded_at', { ascending: false })
    .limit(30)

  let upgradeHistory: any[] = []
  if (rawHistory && rawHistory.length > 0) {
    const sIds = [...new Set(rawHistory.map(h => h.student_id).filter(Boolean))]
    const aIds = [...new Set(rawHistory.map(h => h.upgraded_by).filter(Boolean))]
    const { data: hStudents } = await svc.from('students').select('id, full_name').in('id', sIds)
    const { data: hAdmins } = await svc.from('admins').select('id, first_name, last_name').in('id', aIds)
    const hsMap: Record<string, any> = {}
    for (const s of hStudents || []) hsMap[s.id] = s
    const haMap: Record<string, any> = {}
    for (const a of hAdmins || []) haMap[a.id] = a
    upgradeHistory = rawHistory.map(h => ({
      ...h,
      students: hsMap[h.student_id],
      admins: haMap[h.upgraded_by],
    }))
  }

  const { data: levels } = await svc.from('levels').select('id, level_number, name').order('sort_order')
  const { data: skills } = await svc.from('skills').select('id, name, sort_order, level_id').order('sort_order')
  const { data: students } = await svc.from('students').select('id, full_name, current_level, is_active, parent_id').eq('is_active', true).order('full_name')

  const parentIds = [...new Set((students || []).map((s: any) => s.parent_id).filter(Boolean))]
  const { data: parents } = await svc.from('parents').select('id, first_name, last_name').in('id', parentIds)
  const pMap: Record<string, any> = {}
  for (const p of parents || []) pMap[p.id] = p
  const studentsNorm = (students || []).map((s: any) => ({ ...s, parents: pMap[s.parent_id] || null }))

  return <AdminUpgradesClient
    upgradeHistory={upgradeHistory}
    adminId={admin.id}
    levels={levels || []}
    skills={skills || []}
    students={studentsNorm}
    recommendations={recommendations}
  />
}
