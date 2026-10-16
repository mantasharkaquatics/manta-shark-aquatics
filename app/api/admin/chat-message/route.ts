import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'
import { readJson, badRequest } from '@/lib/http'

// A desk reply from Admin > Messages, written with the service role
// (2026-10-15, audit F39). Admin Messages used to insert it from the browser,
// which needed the browser role to hold INSERT on chat_messages -- the same
// privilege that let a family write a row as 'admin'. With every chat write
// on the server, the SQL in the audit report can take that privilege away
// from the browser without breaking the desk. sender_admin_id is the signed-in
// admin, never a value from the request.
//
// POST { thread_id, body } -> { ok, message }

const MAX_LEN = 4000

export async function POST(req: NextRequest) {
  const auth = await requireAdmin()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { admin, svc } = auth
  const input = await readJson(req)
  if (!input || typeof input.thread_id !== 'string' || typeof input.body !== 'string') return badRequest()
  const body = input.body.trim()
  if (!body || body.length > MAX_LEN) return badRequest('Message is empty or too long')

  const { data: thread } = await svc.from('chat_threads').select('id').eq('id', input.thread_id).maybeSingle()
  if (!thread) return NextResponse.json({ error: 'Thread not found' }, { status: 404 })

  const { data: message, error } = await svc.from('chat_messages')
    .insert({ thread_id: thread.id, sender_type: 'admin', body, sender_admin_id: admin.id })
    .select('*').single()
  if (error || !message) {
    console.error('[admin/chat-message]', error)
    return NextResponse.json({ error: 'failed' }, { status: 500 })
  }
  await svc.from('chat_threads')
    .update({ last_message_at: message.created_at || new Date().toISOString(), last_message_preview: body.slice(0, 120), unread_by_admin: false })
    .eq('id', thread.id)
  return NextResponse.json({ ok: true, message })
}
