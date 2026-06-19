import { createClient } from '@/lib/supabase/server'
import AdminCheckinClient from './AdminCheckinClient'

export default async function AdminCheckinPage() {
  const supabase = await createClient()
  const { data: students } = await supabase
    .from('students')
    .select('id, full_name, parent_id, parents(first_name, last_name)')
    .eq('is_active', true)
    .order('full_name')
  return <AdminCheckinClient students={students || []} />
}
