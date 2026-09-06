import { redirect } from 'next/navigation'
import { requireAdmin } from '@/lib/api-auth'
import AdminFinanceClient from './AdminFinanceClient'

export const dynamic = 'force-dynamic'

export default async function AdminFinancePage() {
  // Re-checked here rather than trusted from proxy.ts, like every other admin
  // page on this site.
  const auth = await requireAdmin()
  if (!auth) redirect('/login')
  return <AdminFinanceClient />
}
