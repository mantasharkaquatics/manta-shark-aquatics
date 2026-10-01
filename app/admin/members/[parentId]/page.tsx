import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import FamilyViewClient from './FamilyViewClient'

export const dynamic = 'force-dynamic'

// One family as they see their own dashboard (read-only). Managers only.
export default async function AdminFamilyViewPage({ params }: { params: Promise<{ parentId: string }> }) {
  const { parentId } = await params
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
  return <FamilyViewClient parentId={parentId} />
}
