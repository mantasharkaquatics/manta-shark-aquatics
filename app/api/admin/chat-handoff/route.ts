import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'
import { CHAT_HANDBACK_EN, CHAT_HANDBACK_KEY } from '@/lib/chat-open'

// POST { thread_id, mode: 'ai' | 'human' } — admin takeover / hand back to AI
export async function POST(req: NextRequest) {
  const auth = await requireAdmin()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const svc = auth.svc
  const body = await req.json().catch(() => null)
  const thread_id = body?.thread_id
  const mode = body?.mode
  if (!thread_id || (mode !== 'ai' && mode !== 'human'))
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })

  const { data: thread } = await svc.from('chat_threads').select('id').eq('id', thread_id).single()
  if (!thread) return NextResponse.json({ error: 'Thread not found' }, { status: 404 })

  if (mode === 'human') {
    const { error: hErr } = await svc.from('chat_threads').update({ mode: 'human', handled_by: auth.admin.id }).eq('id', thread_id)
    if (hErr) return NextResponse.json({ error: 'Failed to take over: ' + hErr.message }, { status: 500 })
  } else {
    const cutoff = new Date().toISOString()
    // metadata.key lets the family's chat show this line in their language
    // (components/ChatWidget); the English body is for the admin screen.
    const { error: msgErr } = await svc.from('chat_messages').insert({
      thread_id,
      sender_type: 'system',
      body: CHAT_HANDBACK_EN,
      metadata: { key: CHAT_HANDBACK_KEY },
    })
    if (msgErr) return NextResponse.json({ error: 'Failed to post hand-back notice: ' + msgErr.message }, { status: 500 })
    // Cutoff: the AI only reads messages after this time; human-service conversation never re-enters AI context
    const { error: thErr } = await svc.from('chat_threads').update({ mode: 'ai', escalation_summary: null, ai_context_from: cutoff }).eq('id', thread_id)
    if (thErr) return NextResponse.json({ error: 'Failed to switch mode: ' + thErr.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true, mode })
}
