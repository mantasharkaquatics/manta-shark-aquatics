import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'
import { readJson, badRequest } from '@/lib/http'

// The two thread-row writes Admin > Messages made from the browser, on the
// server since 2026-10-15 (audit F39; see app/api/admin/chat-message):
//
//   { thread_id, action: 'read' }          -> unread_by_admin = false
//   { thread_id, action: 'clear_summary' } -> escalation_summary = null ("Resolved")
//
// Take-over and hand-back stay in app/api/admin/chat-handoff.

export async function POST(req: NextRequest) {
  const auth = await requireAdmin()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { svc } = auth
  const input = await readJson(req)
  if (!input || typeof input.thread_id !== 'string') return badRequest()
  const patch = input.action === 'read' ? { unread_by_admin: false }
    : input.action === 'clear_summary' ? { escalation_summary: null }
    : null
  if (!patch) return badRequest()
  const { error } = await svc.from('chat_threads').update(patch).eq('id', input.thread_id)
  if (error) return NextResponse.json({ error: 'failed' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
