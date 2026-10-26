import { redirect } from 'next/navigation'
import { requireAdmin } from '@/lib/api-auth'
import CertificatesClient from './CertificatesClient'

export const dynamic = 'force-dynamic'

// Level-up certificates to print and hand to the swimmer (owner, 2026-10-26).
export default async function AdminCertificatesPage() {
  const auth = await requireAdmin()
  if (!auth) redirect('/login')
  return <CertificatesClient />
}
