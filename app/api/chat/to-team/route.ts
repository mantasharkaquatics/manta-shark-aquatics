import { NextRequest, NextResponse } from 'next/server'
import { requireParent } from '@/lib/api-auth'
import { readJson, badRequest } from '@/lib/http'
import { translate, isLocale } from '@/lib/i18n/all'
import { alertDeskChat } from '@/lib/chat-desk-alert'

/* A signed-in family's message for a person, not the assistant (owner,
   2026-11-04, 問題 15 選項 A: the adaptive-swim page's 跟老師談談). The message
   is written as the family's and the thread goes to the desk (mode 'human', as a guest's "ask the team"
   does, so the assistant stays out of it), the desk is told by email and text (lib/chat-desk-alert), and the
   family sees a note in their language saying a teacher will answer.
   The usual rule still holds afterwards: a desk quiet for 30 minutes hands
   the family's next message back to the assistant (lib/chat-handback).

   POST { thread_id, body, locale } -> { ok, messages } */

const MAX_LEN = 800

export async function POST(req: NextRequest) {
  const auth = await requireParent({ viewer: true })
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { parent, svc } = auth
  const input = await readJson(req)
  if (!input || typeof input.thread_id !== 'string' || typeof input.body !== 'string') return badRequest()
  const body = input.body.trim()
  if (!body || body.length > MAX_LEN) return badRequest('Message is empty or too long')
  const locale = isLocale(input.locale) ? input.locale : 'en'

  const { data: thread } = await svc.from('chat_threads').select('id, parent_id, escalation_summary').eq('id', input.thread_id).maybeSingle()
  if (!thread || thread.parent_id !== parent.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data: msg, error } = await svc.from('chat_messages')
    .insert({ thread_id: thread.id, sender_type: 'parent', body })
    .select('*').single()
  if (error || !msg) {
    console.error('[chat/to-team]', error)
    return NextResponse.json({ error: 'failed' }, { status: 500 })
  }
  const { data: note } = await svc.from('chat_messages')
    .insert({ thread_id: thread.id, sender_type: 'system', body: translate(locale, 'chat.toTeam.done') })
    .select('*').single()

  const now = new Date().toISOString()
  const stamp = new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })
  const reason = 'Asked for a teacher directly (adaptive swim): ' + body.slice(0, 300)
  const summary = (((thread as { escalation_summary?: string | null }).escalation_summary ? (thread as { escalation_summary?: string | null }).escalation_summary + '\n\n' : '') + `[${stamp}] ` + reason).slice(-4000)
  const upd = { mode: 'human', human_since: now, unread_by_admin: true, escalation_summary: summary, last_message_at: now, last_message_preview: body.slice(0, 120) }
  let { error: uErr } = await svc.from('chat_threads').update(upd).eq('id', thread.id)
  // Before docs/migration-tier3.sql there is no human_since column.
  if (uErr) {
    const { human_since: _drop, ...rest } = upd
    void _drop
    ;({ error: uErr } = await svc.from('chat_threads').update(rest).eq('id', thread.id))
    if (uErr) console.error('[chat/to-team] thread update', uErr)
  }
  await alertDeskChat(svc, { threadId: thread.id, parentFirstName: parent.first_name, reason })
  return NextResponse.json({ ok: true, messages: [msg, ...(note ? [note] : [])] })
}
