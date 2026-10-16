import { NextRequest, NextResponse } from 'next/server'
import { requireParent } from '@/lib/api-auth'
import { readJson, badRequest } from '@/lib/http'

// A signed-in family's chat message (components/ChatWidget).
//
// The widget used to insert into chat_messages and update chat_threads from
// the browser with the parent's own session (found 2026-10-15). Whatever the
// browser may write, it may write anything: a row with sender_type 'admin'
// shows in Admin > Messages as a desk reply ("Approved: we will refund your
// $650"), and the thread row holds escalation_summary, mode and
// ai_context_from, which staff and the AI trust. Now the message is written
// here, with the service role, and only the fields a family's message has:
// sender_type 'parent', the text, no metadata. The browser's write access
// itself is taken away by docs/migration-revoke-chat-writes.sql (F39); this route is
// what keeps the chat working once it is.
//
// POST { thread_id, body } -> { ok, message }

// The chat box takes 800 characters, as the guest chat does.
const MAX_LEN = 800

export async function POST(req: NextRequest) {
  const auth = await requireParent()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { parent, svc } = auth
  const input = await readJson(req)
  if (!input || typeof input.thread_id !== 'string' || typeof input.body !== 'string') return badRequest()
  const body = input.body.trim()
  if (!body || body.length > MAX_LEN) return badRequest('Message is empty or too long')

  const { data: thread } = await svc.from('chat_threads').select('id, parent_id').eq('id', input.thread_id).maybeSingle()
  if (!thread || thread.parent_id !== parent.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data: message, error } = await svc.from('chat_messages')
    .insert({ thread_id: thread.id, sender_type: 'parent', body })
    .select('*').single()
  if (error || !message) {
    console.error('[chat/send]', error)
    return NextResponse.json({ error: 'failed' }, { status: 500 })
  }
  await svc.from('chat_threads')
    .update({ last_message_at: message.created_at || new Date().toISOString(), last_message_preview: body.slice(0, 120) })
    .eq('id', thread.id)
  return NextResponse.json({ ok: true, message })
}
