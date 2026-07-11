import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import AdminProgressHistoryClient from './AdminProgressHistoryClient'
export const dynamic = 'force-dynamic'

export default async function AdminProgressHistoryPage() {
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

  // Fetch all approved records
  const { data: records } = await svc
    .from('progress_history')
    .select('id, student_id, coach_id, snapshot, session_date, created_at, reviewed_at, reviewed_by')
    .eq('status', 'approved')
    .order('session_date', { ascending: false })
    .order('created_at', { ascending: false })

  if (!records || records.length === 0) {
    return <AdminProgressHistoryClient records={[]} skills={[]} />
  }

  const studentIds = [...new Set(records.map(r => r.student_id))]
  const coachIds = [...new Set(records.map(r => r.coach_id).filter(Boolean))]
  const adminIds = [...new Set(records.map(r => r.reviewed_by).filter(Boolean))]

  const { data: students } = await svc.from('students').select('id, full_name, current_level').in('id', studentIds)
  const { data: coaches } = await svc.from('coaches').select('id, first_name').in('id', coachIds)
  const { data: admins } = await svc.from('admins').select('id, first_name, last_name').in('id', adminIds)
  const { data: skills } = await svc.from('skills').select('id, name, sort_order, level_id').order('sort_order')

  const sMap: Record<string, any> = {}
  for (const s of students || []) sMap[s.id] = s
  const cMap: Record<string, any> = {}
  for (const c of coaches || []) cMap[c.id] = c
  const aMap: Record<string, any> = {}
  for (const a of admins || []) aMap[a.id] = a

  const enriched = records.map(r => ({
    ...r,
    student: sMap[r.student_id],
    coach: cMap[r.coach_id],
    reviewer: aMap[r.reviewed_by],
  }))

  return <AdminProgressHistoryClient records={enriched} skills={skills || []} />
}
