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
    await svc.from('chat_messages').insert({
      thread_id,
      sender_type: 'system',
      body: '[context note] A human team member handled the previous messages and has now handed the conversation back. Do not re-answer or apologize for anything above this line; simply respond to whatever the parent asks NEXT.',
    })
    await svc.from('chat_threads').update({ mode: 'ai', escalation_summary: null }).eq('id', thread_id)
  }
  return NextResponse.json({ ok: true, mode })
}
