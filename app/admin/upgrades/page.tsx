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

  // 找出所有技能都 100% 的學生
  const { data: readyStudents } = await supabase.rpc('get_students_ready_for_upgrade')

  // 升等歷史記錄
  const { data: upgradeHistory } = await supabase
    .from('level_upgrades')
    .select('id, from_level, to_level, upgraded_at, notes, students(full_name), admins(first_name, last_name)')
    .order('upgraded_at', { ascending: false })
    .limit(20)

  return <AdminUpgradesClient 
    readyStudents={readyStudents || []} 
    upgradeHistory={upgradeHistory || []}
    adminId={admin.id}
  />
}
