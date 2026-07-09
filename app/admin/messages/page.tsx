import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import AdminMessagesClient from './AdminMessagesClient'

export default async function AdminMessagesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: admin } = await supabase.from('admins').select('id, first_name').eq('auth_user_id', user.id).single()
  if (!admin) redirect('/dashboard')
  return <AdminMessagesClient adminId={admin.id} adminName={admin.first_name} />
}
