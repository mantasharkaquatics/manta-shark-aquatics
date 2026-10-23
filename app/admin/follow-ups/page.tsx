import { redirect } from 'next/navigation'
import { requireAdmin } from '@/lib/api-auth'
import FollowUpsClient from './FollowUpsClient'

export const dynamic = 'force-dynamic'

// Families to follow up (owner, 2026-10-23; lib/follow-ups.ts).
export default async function AdminFollowUpsPage() {
  const auth = await requireAdmin()
  if (!auth) redirect('/login')
  return <FollowUpsClient />
}
