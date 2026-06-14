import { createServerClient } from '@supabase/ssr'
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

  const { data: readyStudents } = await supabase.rpc('get_students_ready_for_upgrade')

  const { data: rawHistory } = await supabase
    .from('level_upgrades')
    .select('id, from_level, to_level, upgraded_at, notes, students(full_name), admins(first_name, last_name)')
    .order('upgraded_at', { ascending: false })
    .limit(20)

  const upgradeHistory = (rawHistory || []).map((h: any) => ({
    ...h,
    students: Array.isArray(h.students) ? h.students[0] : h.students,
    admins: Array.isArray(h.admins) ? h.admins[0] : h.admins,
  }))

  return <AdminUpgradesClient
    readyStudents={readyStudents || []}
    upgradeHistory={upgradeHistory}
    adminId={admin.id}
  />
}
