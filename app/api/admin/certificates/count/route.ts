import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'
import { allCertificates } from '@/lib/certificates'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Certificates not handed to the swimmer yet, for the sidebar's number
 *  (owner, 2026-10-26: remind the desk to print them). 0 until the SQL is run. */
export async function GET() {
  const auth = await requireAdmin()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { rows, needsSql } = await allCertificates(auth.svc)
  return NextResponse.json({ count: needsSql ? 0 : rows.filter(r => !r.given).length })
}
