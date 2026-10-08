import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Suggestions not yet marked handled, for the sidebar's number (owner,
 *  2026-10-08: a count on the menu, no email). parent_suggestions has RLS on
 *  with no policies, so the browser cannot count it itself. A head count. */
export async function GET() {
  const auth = await requireAdmin()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { count, error } = await auth.svc.from('parent_suggestions')
    .select('id', { count: 'exact', head: true }).eq('status', 'new')
  if (error) return NextResponse.json({ count: 0 })
  return NextResponse.json({ count: count || 0 })
}
