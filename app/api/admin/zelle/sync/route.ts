import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'
import { syncZelle } from '@/lib/zelle-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** "Check now" on the Zelle page: read the mailbox without waiting for the
 *  5-minute job. Same work as /api/cron/zelle-sync. */
export async function POST() {
  const auth = await requireAdmin()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const result = await syncZelle(auth.svc)
  return NextResponse.json(result, { status: result.error ? 502 : 200 })
}
