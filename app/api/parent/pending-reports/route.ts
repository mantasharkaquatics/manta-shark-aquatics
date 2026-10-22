import { NextRequest, NextResponse } from 'next/server'
import { requireParent } from '@/lib/api-auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/* Lessons whose report the coach has written and a manager has not approved
   yet (owner, 2026-10-22): the family's lesson history says "Coach has
   recorded this lesson, under review" instead of showing nothing.

   GET ?student=<id> -> { pending: [{ date, start }] }. Only the dates: the
   scores and note stay unreadable until approved (progress_history's
   browser rule, docs/migration-fix5-E.sql). */
export async function GET(req: NextRequest) {
  const ctx = await requireParent()
  if (!ctx) return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
  const { svc, parent } = ctx
  const studentId = req.nextUrl.searchParams.get('student') || ''
  if (!/^[0-9a-f-]{36}$/i.test(studentId)) return NextResponse.json({ error: 'Invalid student' }, { status: 400 })
  const { data: kid } = await svc.from('students').select('id').eq('id', studentId).eq('parent_id', parent.id).maybeSingle()
  if (!kid) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: rows, error } = await svc.from('progress_history')
    .select('session_date, class_session_id').eq('student_id', studentId).eq('status', 'pending_review')
  if (error) return NextResponse.json({ pending: [] })
  const sessIds = [...new Set((rows || []).map((r: { class_session_id: string | null }) => r.class_session_id).filter(Boolean))] as string[]
  const { data: sess } = sessIds.length
    ? await svc.from('class_sessions').select('id, start_time').in('id', sessIds)
    : { data: [] as { id: string; start_time: string }[] }
  const startOf = new Map((sess || []).map((s: { id: string; start_time: string }) => [s.id, String(s.start_time).slice(0, 5)]))
  const pending = (rows || []).map((r: { session_date: string; class_session_id: string | null }) => ({
    date: r.session_date,
    start: r.class_session_id ? startOf.get(r.class_session_id) || null : null,
  }))
  return NextResponse.json({ pending }, { headers: { 'Cache-Control': 'no-store' } })
}
