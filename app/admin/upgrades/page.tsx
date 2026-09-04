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


  // upgrade history
  const { data: rawHistory } = await svc
    .from('level_upgrades')
    .select('id, from_level, to_level, from_stage, to_stage, upgraded_at, notes, student_id, upgraded_by')
    .order('upgraded_at', { ascending: false })
    .limit(30)

  let upgradeHistory: any[] = []
  if (rawHistory && rawHistory.length > 0) {
    const sIds = [...new Set(rawHistory.map(h => h.student_id).filter(Boolean))]
    // `upgraded_by` is POLYMORPHIC and has no foreign key, deliberately: an
    // admin id when someone assigns a level through this page, a COACH id when
    // the trg_level_upgrade trigger promotes a swimmer who has finished every
    // skill. Looking only in `admins` -- which is what this did -- left every
    // trigger-created row reading "by" with no name after it, and those are
    // the ordinary case, not the exception.
    const byIds = [...new Set(rawHistory.map(h => h.upgraded_by).filter(Boolean))]
    const [{ data: hStudents }, { data: hAdmins }, { data: hCoaches }] = await Promise.all([
      svc.from('students').select('id, full_name').in('id', sIds),
      svc.from('admins').select('id, first_name, last_name').in('id', byIds),
      svc.from('coaches').select('id, first_name, last_name').in('id', byIds),
    ])
    const hsMap: Record<string, any> = {}
    for (const s of hStudents || []) hsMap[s.id] = s
    const byMap: Record<string, any> = {}
    for (const a of hAdmins || []) byMap[a.id] = { ...a, role: 'admin' }
    // Coaches second so that in the impossible event of an id in both tables
    // the answer is stable rather than order-of-arrival.
    for (const c of hCoaches || []) byMap[c.id] = { ...c, role: 'coach' }
    upgradeHistory = rawHistory.map(h => ({
      ...h,
      students: hsMap[h.student_id],
      by: byMap[h.upgraded_by] ?? null,
    }))
  }

  const { data: levels } = await svc.from('levels').select('id, level_number, name').order('sort_order')
  const { data: skills } = await svc.from('skills').select('id, name, sort_order, level_id, stage').order('stage').order('sort_order')
  const { data: students } = await svc.from('students').select('id, full_name, current_level, current_stage, is_active, parent_id').eq('is_active', true).order('full_name')

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
  />
}
