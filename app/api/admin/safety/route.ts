import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'
import { readSafety } from '@/lib/safety-info-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** A family's safety information for the desk (Members): each swimmer's
 *  medical answer and the emergency contact (lib/safety-info.ts). */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const parentId = req.nextUrl.searchParams.get('parent_id') || ''
  if (!/^[0-9a-f-]{36}$/i.test(parentId)) return NextResponse.json({ error: 'parent_id required' }, { status: 400 })
  const info = await readSafety(auth.svc, parentId)
  if (!info) return NextResponse.json({ error: 'Could not load' }, { status: 500 })
  return NextResponse.json(info)
}
