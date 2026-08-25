import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import AdminReviewsClient from './AdminReviewsClient'
import { loadReviewQueues } from '@/lib/admin/review-queues'

export const dynamic = 'force-dynamic'

// The queues an admin works through: lessons taught with no progress recorded,
// progress a coach submitted that nobody has published yet, and level changes a
// coach has asked for. Split out of /admin/upgrades, which now holds only the
// level settings themselves.
export default async function AdminReviewsPage() {
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

  const [{ data: levels }, { data: skills }, queues] = await Promise.all([
    svc.from('levels').select('id, level_number, name').order('sort_order'),
    svc.from('skills').select('id, name, sort_order, level_id').order('sort_order'),
    loadReviewQueues(svc),
  ])

  return <AdminReviewsClient
    adminId={admin.id}
    levels={levels || []}
    skills={skills || []}
    recommendations={queues.recommendations}
    pendingProgressList={queues.pendingProgressList}
    pastPendingProgressList={queues.pastPendingProgressList}
    missingProgressList={queues.missingProgressList}
  />
}
