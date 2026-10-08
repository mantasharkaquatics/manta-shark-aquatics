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
   docs/migration-fix5-A.sql). The read mark moves up to the guest thread's
   last message; it never moves back. Skipped quietly before the migration. */
async function markGuestRead(svc: any, threadId: string, lastAt: string | null) {
  if (!lastAt) return
  const { data, error } = await svc.from('chat_threads').select('parent_last_read_at').eq('id', threadId).maybeSingle()
  if (error || !data) return
  if (data.parent_last_read_at && Date.parse(data.parent_last_read_at) >= Date.parse(lastAt)) return
  await svc.from('chat_threads').update({ parent_last_read_at: lastAt }).eq('id', threadId)
}

export async function POST(req: NextRequest) {
  const auth = await requireParent()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { parent, svc } = auth
  const body = await readJson(req)
  if (!body || typeof body.key !== 'string' || !UUID_RE.test(body.key)) return badRequest()

  const { data: guest } = await svc.from('chat_threads').select('id, parent_id, last_message_at, last_message_preview')
    .eq('guest_key', body.key).maybeSingle()
  if (!guest || guest.parent_id) return NextResponse.json({ ok: true, moved: false })

  // The guest assistant's buttons ("Create a free account") are wrong once the
  // family is signed in, and the widget shows the last message's buttons.
  await svc.from('chat_messages').update({ metadata: null }).eq('thread_id', guest.id).not('metadata', 'is', null)

  const { data: mine } = await svc.from('chat_threads').select('id').eq('parent_id', parent.id).maybeSingle()
  if (!mine) {
    const { error } = await svc.from('chat_threads')
      .update({ parent_id: parent.id, guest_key: null, guest_ip_hash: null }).eq('id', guest.id)
    if (error) { console.error('[chat/guest/claim]', error); return NextResponse.json({ error: 'failed' }, { status: 500 }) }
    await markGuestRead(svc, guest.id, guest.last_message_at)
    return NextResponse.json({ ok: true, moved: true })
  }

  const { error: moveErr } = await svc.from('chat_messages').update({ thread_id: mine.id }).eq('thread_id', guest.id)
  if (moveErr) { console.error('[chat/guest/claim] move', moveErr); return NextResponse.json({ error: 'failed' }, { status: 500 }) }
  await svc.from('chat_threads').delete().eq('id', guest.id)
  await markGuestRead(svc, mine.id, guest.last_message_at)
  return NextResponse.json({ ok: true, moved: true })
}
