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

export async function POST(req: NextRequest) {
  const auth = await requireParent()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { parent, svc } = auth
  const body = await readJson(req)
  if (!body || typeof body.key !== 'string' || !UUID_RE.test(body.key)) return badRequest()

  const { data: guest } = await svc.from('chat_threads').select('id, parent_id, last_message_at, last_message_preview')
    .eq('guest_key', body.key).maybeSingle()
  if (!guest || guest.parent_id) return NextResponse.json({ ok: true, moved: false })

  const { data: mine } = await svc.from('chat_threads').select('id').eq('parent_id', parent.id).maybeSingle()
  if (!mine) {
    const { error } = await svc.from('chat_threads')
      .update({ parent_id: parent.id, guest_key: null, guest_ip_hash: null }).eq('id', guest.id)
    if (error) { console.error('[chat/guest/claim]', error); return NextResponse.json({ error: 'failed' }, { status: 500 }) }
    return NextResponse.json({ ok: true, moved: true })
  }

  const { error: moveErr } = await svc.from('chat_messages').update({ thread_id: mine.id }).eq('thread_id', guest.id)
  if (moveErr) { console.error('[chat/guest/claim] move', moveErr); return NextResponse.json({ error: 'failed' }, { status: 500 }) }
  await svc.from('chat_threads').delete().eq('id', guest.id)
  return NextResponse.json({ ok: true, moved: true })
}
