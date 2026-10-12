import { NextRequest, NextResponse } from 'next/server'
import { requireParent } from '@/lib/api-auth'
import { readJson, badRequest } from '@/lib/http'

// A visitor who chatted before signing up, now signed in: their guest
// conversation becomes (part of) their account's chat, so they do not have to
// ask again and the team sees what they already asked (owner, 2026-09-28).
//
// No account thread yet -- the usual case for a brand-new family -- and the
// guest thread simply becomes theirs. Otherwise its messages move into the
// account thread (keeping their times, so they sort before anything newer)
// and the empty guest thread is deleted.
//
// POST { key } -> { ok, moved }

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/* The visitor read the guest conversation as it happened, so it must not come
   back as unread on the chat button once it is the family's (the unread dot,
   docs/migration-fix5-A.sql). The read mark moves up to what the visitor was
   there for; it never moves back. Skipped quietly before the migration.

   2026-10-12: "what the visitor was there for" is the guest thread's newest
   message that is NOT a desk reply -- the rule the migration's backfill uses.
   It used to be last_message_at, but the desk can take over a guest chat, and
   a desk reply the visitor never saw was then marked read: no dot, and the
   reply email (app/api/cron/chat-reply-email) never went out.
   When the guest messages join a family thread that already exists, the mark
   also stays below that thread's earliest unread desk reply (capAt), so
   signing in does not swallow a reply the family has not seen yet. */
// The visitor's own messages and the AI's answers to them -- not the desk's
// replies, and not a 'system' line such as the desk's "handed back to the AI"
// (chat-handoff), which is posted while the visitor may be long gone
// (2026-10-12; a hand-back after an unseen reply swallowed that reply).
async function newestSeenGuestAt(svc: any, guestThreadId: string): Promise<string | null> {
  const { data } = await svc.from('chat_messages').select('created_at')
    .eq('thread_id', guestThreadId).in('sender_type', ['parent', 'ai'])
    .order('created_at', { ascending: false }).limit(1).maybeSingle()
  return data?.created_at ?? null
}

/** The family thread's read mark, and its earliest desk reply after that mark
 *  (null if none). null overall before the migration. */
async function readState(svc: any, threadId: string): Promise<{ mark: string | null; capAt: string | null } | null> {
  const { data, error } = await svc.from('chat_threads').select('parent_last_read_at').eq('id', threadId).maybeSingle()
  if (error || !data) return null
  const mark: string | null = data.parent_last_read_at ?? null
  let q = svc.from('chat_messages').select('created_at').eq('thread_id', threadId).eq('sender_type', 'admin')
  if (mark) q = q.gt('created_at', mark)
  const { data: first } = await q.order('created_at', { ascending: true }).limit(1).maybeSingle()
  return { mark, capAt: first?.created_at ?? null }
}

async function markGuestRead(svc: any, threadId: string, lastAt: string | null, capAt: string | null = null) {
  if (!lastAt) return
  let target = lastAt
  // Unread is "created_at > mark", so the mark sits just before the reply.
  if (capAt && Date.parse(target) >= Date.parse(capAt)) target = new Date(Date.parse(capAt) - 1).toISOString()
  const { data, error } = await svc.from('chat_threads').select('parent_last_read_at').eq('id', threadId).maybeSingle()
  if (error || !data) return
  if (data.parent_last_read_at && Date.parse(data.parent_last_read_at) >= Date.parse(target)) return
  await svc.from('chat_threads').update({ parent_last_read_at: target }).eq('id', threadId)
}

export async function POST(req: NextRequest) {
  const auth = await requireParent()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { parent, svc } = auth
  const body = await readJson(req)
  if (!body || typeof body.key !== 'string' || !UUID_RE.test(body.key)) return badRequest()

  const { data: guest } = await svc.from('chat_threads').select('id, parent_id')
    .eq('guest_key', body.key).maybeSingle()
  if (!guest || guest.parent_id) return NextResponse.json({ ok: true, moved: false })

  // The guest assistant's buttons ("Create a free account") are wrong once the
  // family is signed in, and the widget shows the last message's buttons.
  await svc.from('chat_messages').update({ metadata: null }).eq('thread_id', guest.id).not('metadata', 'is', null)

  const { data: mine } = await svc.from('chat_threads').select('id').eq('parent_id', parent.id).maybeSingle()
  // Read before anything moves: after the move the two threads' messages are mixed.
  const seenAt = await newestSeenGuestAt(svc, guest.id)
  if (!mine) {
    const { error } = await svc.from('chat_threads')
      .update({ parent_id: parent.id, guest_key: null, guest_ip_hash: null }).eq('id', guest.id)
    if (error) { console.error('[chat/guest/claim]', error); return NextResponse.json({ error: 'failed' }, { status: 500 }) }
    await markGuestRead(svc, guest.id, seenAt)
    return NextResponse.json({ ok: true, moved: true })
  }

  const mineRead = await readState(svc, mine.id)
  const { error: moveErr } = await svc.from('chat_messages').update({ thread_id: mine.id }).eq('thread_id', guest.id)
  if (moveErr) { console.error('[chat/guest/claim] move', moveErr); return NextResponse.json({ error: 'failed' }, { status: 500 }) }
  await svc.from('chat_threads').delete().eq('id', guest.id)
  if (mineRead) await markGuestRead(svc, mine.id, seenAt, mineRead.capAt)
  return NextResponse.json({ ok: true, moved: true })
}
