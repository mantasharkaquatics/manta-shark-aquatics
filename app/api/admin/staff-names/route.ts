import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'

// Who on staff wrote each desk reply, for Admin > Messages only (owner,
// 2026-10-28: families see 櫃台, the back office sees the person). The
// browser can read only its own admins row, so the names come from here.
//
// GET -> { names: { [admin id]: "First Last" } }

export async function GET() {
  const auth = await requireAdmin()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data, error } = await auth.svc.from('admins').select('id, first_name, last_name')
  if (error) {
    console.error('[admin/staff-names]', error)
    return NextResponse.json({ error: 'failed' }, { status: 500 })
  }
  const names: Record<string, string> = {}
  for (const a of data || []) {
    const name = [a.first_name, a.last_name].filter(Boolean).join(' ').trim()
    if (name) names[a.id] = name
  }
  return NextResponse.json({ names }, { headers: { 'Cache-Control': 'private, max-age=300' } })
}
