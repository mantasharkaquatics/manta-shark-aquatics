import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'
import { readJson, badRequest } from '@/lib/http'
import { cancelEmail } from '@/lib/email'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/* Recall a message from Admin > Messages (owner, 2026-10-23).

   POST { message_id } -> { ok, recalled_at, recalled_by, email: 'stopped' | 'sent' | null }

   Any admin may recall a desk reply or an AI reply up to 24 hours old; a
   family's or visitor's own message cannot be recalled. The row stays: the
   desk still sees it, folded, marked recalled, with who and when. The family
   sees nothing -- the RLS policy hides recalled rows
   (docs/migration-chat-recall.sql), every server read of the conversation
   skips them (the guest chat, the AI's history, the unread-reply email), and
   an open chat window drops it on a 'recall' broadcast on its channel.

   A visitor's reply email is held 2 minutes (/api/admin/chat-message); a
   recall before then cancels it ('stopped'), after it the email is out
   ('sent'). A family's unread-reply email carries no text and is not sent for
   a reply recalled within its 10 minutes. */

const RECALL_WINDOW_MS = 24 * 60 * 60 * 1000
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(req: NextRequest) {
  const auth = await requireAdmin()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { admin, svc } = auth
  const input = await readJson(req)
  if (!input || typeof input.message_id !== 'string' || !UUID_RE.test(input.message_id)) return badRequest()

  const { data: msg, error: readErr } = await svc.from('chat_messages')
    .select('id, thread_id, sender_type, created_at, recalled_at, email_id')
    .eq('id', input.message_id).maybeSingle()
  if (readErr) {
    console.error('[admin/chat-recall]', readErr.message)
    return NextResponse.json({ error: 'unavailable', code: 'unavailable' }, { status: 503 })
  }
  if (!msg) return NextResponse.json({ error: 'Not found', code: 'not_found' }, { status: 404 })
  if (msg.sender_type !== 'admin' && msg.sender_type !== 'ai') {
    return NextResponse.json({ error: 'Only replies from the school can be recalled', code: 'not_ours' }, { status: 400 })
  }
  if (msg.recalled_at) return NextResponse.json({ error: 'Already recalled', code: 'already' }, { status: 409 })
  if (Date.now() - Date.parse(msg.created_at) > RECALL_WINDOW_MS) {
    return NextResponse.json({ error: 'Older than 24 hours', code: 'too_old' }, { status: 400 })
  }

  const now = new Date().toISOString()
  const { data: done, error } = await svc.from('chat_messages')
    .update({ recalled_at: now, recalled_by: admin.id })
    .eq('id', msg.id).is('recalled_at', null).select('id')
  if (error) {
    console.error('[admin/chat-recall]', error.message)
    return NextResponse.json({ error: 'failed', code: 'failed' }, { status: 500 })
  }
  if (!done?.length) return NextResponse.json({ error: 'Already recalled', code: 'already' }, { status: 409 })

  // The visitor's held email: stopped if it has not gone out yet.
  let email: 'stopped' | 'sent' | null = null
  if (msg.email_id) email = (await cancelEmail(msg.email_id)) ? 'stopped' : 'sent'

  // The thread's preview line is now the newest message still shown.
  const { data: prev } = await svc.from('chat_messages').select('body')
    .eq('thread_id', msg.thread_id).is('recalled_at', null)
    .order('created_at', { ascending: false }).limit(1).maybeSingle()
  await svc.from('chat_threads').update({ last_message_preview: (prev?.body || '').slice(0, 120) }).eq('id', msg.thread_id)

  // A family with the chat open drops it now (components/ChatWidget). The
  // database change itself never reaches them: the row no longer passes
  // their read policy.
  const ch = svc.channel(`chat:${msg.thread_id}`)
  try {
    await ch.httpSend('recall', { id: msg.id }, { timeout: 5000 })
  } catch (e) {
    console.error('[admin/chat-recall] broadcast', e)
  } finally {
    svc.removeChannel(ch).catch(() => {})
  }

  return NextResponse.json({ ok: true, recalled_at: now, recalled_by: admin.id, email })
}
