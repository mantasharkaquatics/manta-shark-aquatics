import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createHash, randomUUID } from 'crypto'
import { buildKnowledgeBlock } from '@/lib/ai/knowledge'
import { buildSystemPromptParts } from '@/lib/ai/system-prompt'
import { getTodayLA } from '@/lib/date'
import { readJson, badRequest } from '@/lib/http'
import { translate, isLocale } from '@/lib/i18n/all'

// The chat for visitors who have not signed up (owner, 2026-09-28): every page
// has the chat button, and someone who is only looking can ask about lessons
// before creating an account.
//
// A guest conversation is an ordinary chat_threads row with no parent_id and a
// random guest_key that only the visitor's browser holds, so the admin
// Messages screen shows it next to the families' threads and a team member can
// read it. Everything goes through this route with the service key; the
// browser never touches the tables for a guest.
//
// The assistant here has NO tools and sees no account: it answers from the
// same knowledge block as the signed-in assistant (lib/ai/system-prompt.ts,
// mode 'guest') and sends anything that needs an account to /register. When
// the visitor signs up, /api/chat/guest/claim moves the thread into their
// account so the conversation carries over.
//
// It is open to anyone, so it is fenced: one message is at most MAX_LEN
// characters; a conversation takes PER_THREAD visitor messages; one network
// (hashed IP, never stored raw) gets PER_IP_DAY messages and NEW_THREADS_IP_DAY
// new conversations a day.
//
// GET  ?key=<guest_key>             -> { messages }
// POST { key?, text, locale? }      -> { key, messages }   (429 { limited } when fenced)

const MODEL = 'claude-sonnet-4-6'
const MAX_LEN = 800
const PER_THREAD = 30
const PER_IP_DAY = 60
const NEW_THREADS_IP_DAY = 5
const HISTORY = 12
const LINKS = new Set(['/register', '/login', '/assessment', '/programs', '/levels', '/plans', '/faq', '/adaptive-swim'])
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const service = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

function ipHash(req: NextRequest) {
  const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || req.headers.get('x-real-ip') || 'unknown'
  const salt = process.env.GUEST_CHAT_SALT || process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  return createHash('sha256').update(salt + '|' + ip).digest('hex').slice(0, 32)
}

async function threadFor(svc: any, key: unknown) {
  if (typeof key !== 'string' || !UUID_RE.test(key)) return null
  const { data } = await svc.from('chat_threads').select('id, mode, parent_id, ai_context_from').eq('guest_key', key).maybeSingle()
  return data
}

async function listMessages(svc: any, threadId: string) {
  const { data } = await svc.from('chat_messages').select('id, sender_type, body, metadata, created_at')
    .eq('thread_id', threadId).order('created_at', { ascending: true }).limit(200)
  return data || []
}

export async function GET(req: NextRequest) {
  const svc = service()
  const thread = await threadFor(svc, req.nextUrl.searchParams.get('key'))
  // A claimed thread belongs to an account now; the guest key no longer reads it.
  if (!thread || thread.parent_id) return NextResponse.json({ messages: [], gone: true })
  return NextResponse.json({ messages: await listMessages(svc, thread.id) })
}

export async function POST(req: NextRequest) {
  const body = await readJson(req)
  if (!body) return badRequest()
  const text = String(body.text || '').trim()
  if (!text || text.length > MAX_LEN) return badRequest()
  const locale = isLocale(body.locale) ? body.locale : 'en'

  const svc = service()
  const ip = ipHash(req)
  const since = new Date(Date.now() - 86400000).toISOString()

  let thread = body.key ? await threadFor(svc, body.key) : null
  if (thread?.parent_id) return NextResponse.json({ gone: true }, { status: 409 })
  let key: string = thread ? body.key : ''

  // Everything this network has started in the last day, for the fences.
  const { data: ipThreads } = await svc.from('chat_threads').select('id, created_at')
    .eq('guest_ip_hash', ip).gte('created_at', since).limit(50)
  const ipThreadIds = (ipThreads || []).map((r: any) => r.id)

  if (!thread) {
    if (ipThreadIds.length >= NEW_THREADS_IP_DAY) return NextResponse.json({ limited: 'day' }, { status: 429 })
    key = randomUUID()
    const { data: created, error } = await svc.from('chat_threads')
      .insert({ guest_key: key, guest_ip_hash: ip })
      .select('id, mode, parent_id, ai_context_from').single()
    if (error || !created) {
      console.error('[chat/guest] create thread', error)
      return NextResponse.json({ error: 'unavailable' }, { status: 503 })
    }
    thread = created
    ipThreadIds.push(created.id)
  } else {
    const { count } = await svc.from('chat_messages').select('id', { count: 'exact', head: true })
      .eq('thread_id', thread.id).eq('sender_type', 'parent')
    if ((count || 0) >= PER_THREAD) return NextResponse.json({ limited: 'thread' }, { status: 429 })
  }
  const allIds = [...new Set([...ipThreadIds, thread!.id])]
  const { count: dayCount } = await svc.from('chat_messages').select('id', { count: 'exact', head: true })
    .in('thread_id', allIds).eq('sender_type', 'parent').gte('created_at', since)
  if ((dayCount || 0) >= PER_IP_DAY) return NextResponse.json({ limited: 'day' }, { status: 429 })

  const threadId = thread!.id
  await svc.from('chat_messages').insert({ thread_id: threadId, sender_type: 'parent', body: text })
  const touch: Record<string, unknown> = { last_message_at: new Date().toISOString(), last_message_preview: text.slice(0, 120) }

  // A team member has taken this conversation over: no assistant, just flag it.
  if (thread!.mode === 'human') {
    await svc.from('chat_threads').update({ ...touch, unread_by_admin: true }).eq('id', threadId)
    return NextResponse.json({ key, messages: await listMessages(svc, threadId) })
  }
  await svc.from('chat_threads').update(touch).eq('id', threadId)

  let reply = ''
  let meta: Record<string, unknown> | null = null
  try {
    let hq = svc.from('chat_messages').select('sender_type, body').eq('thread_id', threadId)
      .order('created_at', { ascending: false }).limit(HISTORY)
    if (thread!.ai_context_from) hq = hq.gte('created_at', thread!.ai_context_from)
    const { data: hist } = await hq
    const merged: { role: 'user' | 'assistant'; content: string }[] = []
    for (const m of (hist || []).reverse()) {
      if (m.sender_type === 'system') continue
      const role = m.sender_type === 'parent' ? 'user' as const : 'assistant' as const
      const prev = merged[merged.length - 1]
      if (prev && prev.role === role) prev.content += '\n' + m.body
      else merged.push({ role, content: m.body })
    }
    while (merged.length && merged[0].role !== 'user') merged.shift()

    const { staticPart, dynamicPart } = buildSystemPromptParts({
      mode: 'guest', parentName: '', knowledge: await buildKnowledgeBlock(svc),
      dateLine: `Current date (Pacific Time): ${getTodayLA()}.`,
    })
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY!, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: MODEL, max_tokens: 700, messages: merged,
        system: [
          { type: 'text', text: staticPart, cache_control: { type: 'ephemeral' } },
          { type: 'text', text: dynamicPart },
        ],
      }),
    })
    if (!res.ok) throw new Error('anthropic status ' + res.status)
    const data = await res.json()
    const full = (data.content || []).filter((c: any) => c.type === 'text').map((c: any) => c.text).join('').trim()
    if (!full) throw new Error('empty reply')
    reply = full
    const at = full.lastIndexOf('<<OPTIONS>>')
    if (at !== -1) {
      reply = full.slice(0, at).trim() || full
      try {
        const arr = JSON.parse(full.slice(at + '<<OPTIONS>>'.length).trim())
        const clean = (Array.isArray(arr) ? arr : [])
          .filter((o: any) => o && typeof o.label === 'string' && o.label.length <= 60 &&
            (o.type === 'reply' || (o.type === 'link' && LINKS.has(o.url))))
          .slice(0, 3)
          .map((o: any) => o.type === 'link' ? { label: o.label, type: 'link', url: o.url } : { label: o.label, type: 'reply' })
        if (clean.length) meta = { options: clean }
      } catch {}
    }
  } catch (e) {
    console.error('[chat/guest] ai', e)
    reply = translate(locale, 'chat.guest.fallback')
    meta = { options: [{ label: translate(locale, 'chat.guest.signUp'), type: 'link', url: '/register' }] }
  }

  await svc.from('chat_messages').insert({ thread_id: threadId, sender_type: 'ai', body: reply, ...(meta ? { metadata: meta } : {}) })
  await svc.from('chat_threads').update({ last_message_at: new Date().toISOString(), last_message_preview: reply.slice(0, 120) }).eq('id', threadId)
  return NextResponse.json({ key, messages: await listMessages(svc, threadId) })
}
