import { createClient } from '@/lib/supabase/server'
import AdminCheckinClient from './AdminCheckinClient'
import { allRowsOrLog } from '@/lib/db-paging'

export default async function AdminCheckinPage() {
  const supabase = await createClient()
  // Paged: one read stopped at the API's 1,000-row cap, and swimmers late in
  // name order silently dropped out of the name search (found 2026-10-07).
  // id breaks name ties so the pages cannot overlap.
  const students = await allRowsOrLog('admin/checkin students', () => supabase
    .from('students')
    .select('id, full_name, parent_id, parents(first_name, last_name)')
    .eq('is_active', true)
    .order('full_name')
    .order('id'))
  return <AdminCheckinClient students={students} />
}
