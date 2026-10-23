import { NextRequest, NextResponse } from 'next/server'
import { requireParent, serviceClient } from '@/lib/api-auth'
import { readJson, badRequest } from '@/lib/http'
import { alertDeskChat } from '@/lib/chat-desk-alert'

// The writes a signed-in family's chat widget makes to its own thread row,
// done here with the service role instead of from the browser (found
// 2026-10-15; see app/api/chat/send for why). Each action writes one field it
// names and nothing else:
//
//   { action: 'open' }               -> { id, mode }  the family's thread, made if there is none
//   { action: 'read', thread_id, at } -> parent_last_read_at, forward only, never past now
//   { action: 'flag', thread_id }     -> unread_by_admin = true (the AI did not answer)
//
// Reading the thread and its messages stays in the browser, under RLS.

// The oldest, as the widget, the payment notices (stripe webhook) and
// lib/trial-booking pick it.
async function oldestThread(svc: ReturnType<typeof serviceClient>, parentId: string) {
  return svc.from('chat_threads').select('id, mode')
    .eq('parent_id', parentId).order('created_at', { ascending: true }).limit(1).maybeSingle()
}

export async function POST(req: NextRequest) {
  const auth = await requireParent({ viewer: true })
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { parent, svc } = auth
  const input = await readJson(req)
  if (!input || typeof input.action !== 'string') return badRequest()

  if (input.action === 'open') {
    const found = await oldestThread(svc, parent.id)
    if (found.error) return NextResponse.json({ error: 'failed' }, { status: 500 })
    if (found.data) return NextResponse.json({ id: found.data.id, mode: found.data.mode === 'human' ? 'human' : 'ai' })
    const { data: created, error } = await svc.from('chat_threads').insert({ parent_id: parent.id }).select('id').single()
    if (error || !created) {
      console.error('[chat/thread] create', error)
      return NextResponse.json({ error: 'failed' }, { status: 500 })
    }
    // Two tabs opening the chat at once each found none and each made one,
    // and a family with two threads lost messages between them (audit F123).
    // The newest of a pair, still empty, gives way to the oldest.
    const again = await oldestThread(svc, parent.id)
    if (again.data && again.data.id !== created.id) {
      await svc.from('chat_threads').delete().eq('id', created.id)
      return NextResponse.json({ id: again.data.id, mode: again.data.mode === 'human' ? 'human' : 'ai' })
    }
    return NextResponse.json({ id: created.id, mode: 'ai' })
  }

  if (typeof input.thread_id !== 'string') return badRequest()
  const { data: thread } = await svc.from('chat_threads').select('id, parent_id').eq('id', input.thread_id).maybeSingle()
  if (!thread || thread.parent_id !== parent.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  if (input.action === 'read') {
    if (typeof input.at !== 'string' || !Number.isFinite(Date.parse(input.at))) return badRequest()
    // The mark is the newest message's own created_at, as stored (to the
    // microsecond), and it only moves forward -- compared in the database.
    // Rebuilt through Date it lost the microseconds, so the message just read
    // stayed "unread" and its dot never cleared (found 2026-10-15 in review).
    // Reading the message row also caps the mark at a real message, so a
    // client cannot set it in the future.
    const { data: m } = await svc.from('chat_messages').select('created_at')
      .eq('thread_id', thread.id).lte('created_at', input.at)
      .order('created_at', { ascending: false }).limit(1).maybeSingle()
    if (!m?.created_at) return NextResponse.json({ ok: true })
    // Skipped quietly before docs/migration-fix5-A.sql (no such column).
    const { error } = await svc.from('chat_threads').update({ parent_last_read_at: m.created_at })
      .eq('id', thread.id)
      .or(`parent_last_read_at.is.null,parent_last_read_at.lt.${m.created_at}`)
    return NextResponse.json(error ? { ok: true, skipped: true } : { ok: true })
  }

  if (input.action === 'flag') {
    await svc.from('chat_threads').update({ unread_by_admin: true }).eq('id', thread.id)
    // The assistant could not answer: the desk hears of it as of a hand-off
    // (lib/chat-desk-alert.ts, at most once per 30 minutes per conversation).
    await alertDeskChat(svc, { threadId: thread.id, parentFirstName: (parent as any).first_name, reason: 'The assistant could not answer their last message.' })
    return NextResponse.json({ ok: true })
  }

  return badRequest()
}
