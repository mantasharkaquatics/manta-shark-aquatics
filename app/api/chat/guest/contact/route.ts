/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createHash, randomUUID } from 'crypto'
import { readJson, badRequest } from '@/lib/http'
import { translate, isLocale } from '@/lib/i18n/all'
import { takeSlots, releaseSlot, ipHash as rateIpHash } from '@/lib/ip-rate-limit'
import { alertDeskChat } from '@/lib/chat-desk-alert'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/* A visitor who has not signed up asks for a person (owner, 2026-10-22,
   tier 3). Before this the guest chat could only say "create an account".

   POST { key?, name, email, phone?, text?, locale } -> { key, messages }

   The conversation (made here if the visitor has not written yet) goes to
   the desk: mode 'human', so the assistant stops answering, the name, email
   and phone are kept on the thread (docs/migration-tier3.sql) and shown in
   Admin > Messages, and the desk gets the same email + text as a family
   hand-off (lib/chat-desk-alert). Every desk reply is emailed to the visitor
   (/api/admin/chat-message). No texts go to visitors: they have not agreed
   to the SMS terms. Fenced like the guest chat: 3 requests a day from one
   network. */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const service = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

function ipHash(req: NextRequest) {
  const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || req.headers.get('x-real-ip') || 'unknown'
  const salt = process.env.GUEST_CHAT_SALT || process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  return createHash('sha256').update(salt + '|' + ip).digest('hex').slice(0, 32)
}

export async function POST(req: NextRequest) {
  const b = await readJson(req)
  if (!b) return badRequest()
  const name = String(b.name || '').trim().slice(0, 80)
  const email = String(b.email || '').trim().toLowerCase().slice(0, 120)
  const phone = String(b.phone || '').trim().slice(0, 40)
  const text = String(b.text || '').trim().slice(0, 800)
  const locale = isLocale(b.locale) ? b.locale : 'en'
  if (!name || !email) return NextResponse.json({ error: 'Name and email are needed', code: 'missing' }, { status: 400 })
  if (!EMAIL_RE.test(email)) return NextResponse.json({ error: 'Not an email address', code: 'bad_email' }, { status: 400 })

  const svc = service()
  const DAY_MS = 86400000
  const slots = await takeSlots(svc, [{ scope: 'guest-chat-contact', key: rateIpHash(req), max: 3, windowMs: DAY_MS }])
  if (slots.result === 'error') return NextResponse.json({ error: 'unavailable' }, { status: 503 })
  if (slots.result === 'limited') return NextResponse.json({ limited: 'day' }, { status: 429 })

  let key = typeof b.key === 'string' && UUID_RE.test(b.key) ? b.key : ''
  let thread: any = null
  if (key) {
    const { data } = await svc.from('chat_threads').select('id, parent_id').eq('guest_key', key).maybeSingle()
    thread = data
    if (thread?.parent_id) return NextResponse.json({ gone: true }, { status: 409 })
  }
  if (!thread) {
    key = randomUUID()
    const { data, error } = await svc.from('chat_threads').insert({ guest_key: key, guest_ip_hash: ipHash(req) }).select('id, parent_id').single()
    if (error || !data) {
      for (const id of slots.ids) await releaseSlot(svc, id)
      return NextResponse.json({ error: 'unavailable' }, { status: 503 })
    }
    thread = data
  }

  const now = new Date().toISOString()
  const { error: upErr } = await svc.from('chat_threads').update({
    guest_name: name, guest_email: email, guest_phone: phone || null, guest_lang: locale, guest_contact_at: now,
    mode: 'human', human_since: now, unread_by_admin: true,
    escalation_summary: text || null, last_message_at: now,
    last_message_preview: (text || `${name} <${email}>`).slice(0, 120),
  }).eq('id', thread.id)
  if (upErr) {
    console.error('[chat/guest/contact]', upErr.message)
    return NextResponse.json({ error: 'unavailable', code: 'unavailable' }, { status: 503 })
  }
  if (text) await svc.from('chat_messages').insert({ thread_id: thread.id, sender_type: 'parent', body: text })
  await svc.from('chat_messages').insert({
    thread_id: thread.id, sender_type: 'ai', body: translate(locale, 'chat.contact.done', { email }),
  })
  await alertDeskChat(svc, { threadId: thread.id, parentFirstName: `${name} (visitor)`, reason: [text, `Email: ${email}`, phone ? `Phone: ${phone}` : ''].filter(Boolean).join(' · ') })

  const { data: messages } = await svc.from('chat_messages').select('id, sender_type, body, metadata, created_at')
    .eq('thread_id', thread.id).is('recalled_at', null).order('created_at', { ascending: true }).limit(200)
  return NextResponse.json({ key, messages: messages || [] })
}
