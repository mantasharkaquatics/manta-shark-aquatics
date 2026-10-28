import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { requireAdmin, requireParent } from '@/lib/api-auth'
import { alertDeskChat } from '@/lib/chat-desk-alert'
import { getT } from '@/lib/i18n/all'
import { toLocale } from '@/lib/i18n'

export const runtime = 'nodejs'

/* Photos in the chat (owner, 2026-10-28). A family sends a picture; only the
   desk sees it -- never the AI (owner: a child's photo is not sent to an AI).
   The AI, when the thread is with it, answers once that the desk will look,
   and the desk is told as for a hand-off (lib/chat-desk-alert, throttled).

   Kept in the private bucket chat-photos (docs/migration-app-inbox.sql) at
   <family>/<thread>/<uuid>.<ext>; the message carries the path in
   metadata.photo. Shown through GET here, to the family of the thread and
   to staff, as a short-lived signed link.

   POST multipart { thread_id, locale, file } -> { message, ack }
   GET  ?id=<message id>                      -> 302 to the picture */

const MAX_BYTES = 10 * 1024 * 1024
const PER_DAY = 30
const BUCKET = 'chat-photos'

function kindOf(b: Uint8Array): { ext: string; type: string } | null {
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { ext: 'jpg', type: 'image/jpeg' }
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return { ext: 'png', type: 'image/png' }
  if (String.fromCharCode(...b.slice(0, 4)) === 'RIFF' && String.fromCharCode(...b.slice(8, 12)) === 'WEBP') return { ext: 'webp', type: 'image/webp' }
  return null
}

export async function POST(req: NextRequest) {
  const auth = await requireParent({ viewer: true })
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { parent, svc } = auth
  const form = await req.formData().catch(() => null)
  const threadId = form?.get('thread_id')
  const file = form?.get('file')
  if (typeof threadId !== 'string' || !(file instanceof Blob)) return NextResponse.json({ error: 'Bad request' }, { status: 400 })
  if (file.size === 0 || file.size > MAX_BYTES) return NextResponse.json({ error: 'Too large', code: 'too_large' }, { status: 413 })
  const locale = toLocale(String(form?.get('locale') || 'en'))

  const { data: thread } = await svc.from('chat_threads').select('id, parent_id, mode').eq('id', threadId).maybeSingle()
  if (!thread || thread.parent_id !== parent.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { count } = await svc.from('chat_messages').select('id', { count: 'exact', head: true })
    .eq('thread_id', thread.id).eq('sender_type', 'parent').not('metadata->>photo', 'is', null)
    .gte('created_at', new Date(Date.now() - 86400000).toISOString())
  if ((count || 0) >= PER_DAY) return NextResponse.json({ error: 'Too many', code: 'limited' }, { status: 429 })

  const bytes = new Uint8Array(await file.arrayBuffer())
  const kind = kindOf(bytes)
  if (!kind) return NextResponse.json({ error: 'Not a picture', code: 'not_image' }, { status: 415 })
  const path = `${parent.id}/${thread.id}/${randomUUID()}.${kind.ext}`
  const up = await svc.storage.from(BUCKET).upload(path, bytes, { contentType: kind.type, upsert: false })
  if (up.error) {
    console.error('[chat/photo] upload', up.error.message)
    return NextResponse.json({ error: 'failed' }, { status: 500 })
  }

  const t = getT(locale)
  const { data: message, error } = await svc.from('chat_messages')
    .insert({ thread_id: thread.id, sender_type: 'parent', body: '📷', metadata: { photo: path } })
    .select('*').single()
  if (error || !message) {
    console.error('[chat/photo] message', error?.message)
    await svc.storage.from(BUCKET).remove([path])
    return NextResponse.json({ error: 'failed' }, { status: 500 })
  }

  // The thread is with the AI: it says, once per photo, that a person will
  // look. With the desk, the desk simply has it.
  let ack: unknown = null
  if (thread.mode !== 'human') {
    const { data } = await svc.from('chat_messages')
      .insert({ thread_id: thread.id, sender_type: 'ai', body: t('chat.photo.ack'), ai_handled: true, metadata: { key: 'photo_ack' } })
      .select('*').single()
    ack = data
  }
  await svc.from('chat_threads').update({
    last_message_at: new Date().toISOString(),
    last_message_preview: '📷 Photo',
    unread_by_admin: true,
  }).eq('id', thread.id)
  await alertDeskChat(svc, { threadId: thread.id, parentFirstName: parent.first_name, reason: 'They sent a photo in the chat.' })

  return NextResponse.json({ ok: true, message, ack })
}

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id') || ''
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'Bad request' }, { status: 400 })
  const fam = await requireParent({ viewer: true })
  const svc = fam?.svc ?? (await requireAdmin())?.svc
  if (!svc) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: msg } = await svc.from('chat_messages').select('thread_id, metadata, recalled_at').eq('id', id).maybeSingle()
  const path = (msg?.metadata as { photo?: string } | null)?.photo
  if (!msg || !path || msg.recalled_at) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (fam) {
    const { data: thread } = await svc.from('chat_threads').select('parent_id').eq('id', msg.thread_id).maybeSingle()
    if (thread?.parent_id !== fam.parent.id) {
      // A family member who is also staff may still look.
      if (!(await requireAdmin())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }
  const { data: signed, error } = await svc.storage.from(BUCKET).createSignedUrl(path, 300)
  if (error || !signed?.signedUrl) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.redirect(signed.signedUrl, { headers: { 'Cache-Control': 'private, max-age=240' } })
}
