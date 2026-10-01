import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'
import { readJson, badRequest } from '@/lib/http'

export const runtime = 'nodejs'

/** Every suggestion, newest first, with who sent it so a manager can reply. */
export async function GET() {
  const auth = await requireAdmin()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const svc = auth.svc
  const { data: rows, error } = await svc.from('parent_suggestions')
    .select('id, parent_id, body, status, handled_at, created_at')
    .order('created_at', { ascending: false }).limit(500)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const ids = [...new Set((rows || []).map((r: any) => r.parent_id))]
  const [{ data: parents }, { data: students }] = await Promise.all([
    ids.length ? svc.from('parents').select('id, first_name, last_name, email, phone').in('id', ids) : { data: [] },
    ids.length ? svc.from('students').select('parent_id, full_name').in('parent_id', ids) : { data: [] },
  ])
  const byId = new Map((parents || []).map((p: any) => [p.id, p]))
  const kids = new Map<string, string[]>()
  for (const s of students || []) kids.set((s as any).parent_id, [...(kids.get((s as any).parent_id) || []), (s as any).full_name])
  return NextResponse.json({
    suggestions: (rows || []).map((r: any) => {
      const p: any = byId.get(r.parent_id) || {}
      return {
        ...r,
        parentName: `${p.first_name || ''} ${p.last_name || ''}`.trim(),
        email: p.email || null, phone: p.phone || null,
        swimmers: kids.get(r.parent_id) || [],
      }
    }),
  })
}

/** Mark one handled, or back to new. */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await readJson(req)
  if (!body || (body.status !== 'new' && body.status !== 'done')) return badRequest()
  const done = body.status === 'done'
  const { error } = await auth.svc.from('parent_suggestions').update({
    status: body.status,
    handled_by: done ? auth.admin.id : null,
    handled_at: done ? new Date().toISOString() : null,
  }).eq('id', String(body.id || ''))
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
