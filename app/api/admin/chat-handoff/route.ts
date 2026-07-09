import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'

// POST { thread_id, mode: 'ai' | 'human' } — 主管接管 / 交還 AI
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
    await svc.from('chat_threads').update({ mode: 'human', handled_by: auth.admin.id }).eq('id', thread_id)
  } else {
    const cutoff = new Date().toISOString()
    await svc.from('chat_messages').insert({
      thread_id,
      sender_type: 'system',
      body: 'Front desk session has ended. Our AI assistant will continue to help you here.',
    })
    // 分界點:AI 之後只讀此時間以後的訊息,真人服務段的對話不再進入 AI 上下文
    await svc.from('chat_threads').update({ mode: 'ai', escalation_summary: null, ai_context_from: cutoff }).eq('id', thread_id)
  }
  return NextResponse.json({ ok: true, mode })
}
