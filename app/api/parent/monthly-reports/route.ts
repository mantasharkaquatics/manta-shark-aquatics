import { NextRequest, NextResponse } from 'next/server'
import { requireParent } from '@/lib/api-auth'
import { readJson, badRequest } from '@/lib/http'
import { toLocale } from '@/lib/i18n'

export const runtime = 'nodejs'

// The family's monthly reports -- only the ones that have been sent -- in the
// language the page is being read in (?lang=). The numbers come from the frozen
// `data`; the text and the coach notes come back translated.
export async function GET(req: NextRequest) {
  const ctx = await requireParent()
  if (!ctx) return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
  const svc = ctx.svc
  const lang = toLocale(req.nextUrl.searchParams.get('lang'))

  const { data: rows } = await svc.from('monthly_reports')
    .select('id, student_id, month, data, summary, focus, summary_i18n, focus_i18n, feedback, feedback_comment, sent_at')
    .eq('parent_id', ctx.parent.id).eq('status', 'sent')
    .order('month', { ascending: false })
  const noteIds = (rows || []).flatMap((r: any) => (r.data?.notes || []).map((n: any) => n.id))
  const [{ data: notes }, { data: trans }] = await Promise.all([
    noteIds.length ? svc.from('lesson_notes').select('id, note, language').in('id', noteIds) : { data: [] },
    noteIds.length ? svc.from('lesson_note_translations').select('lesson_note_id, text').in('lesson_note_id', noteIds).eq('language', lang) : { data: [] },
  ])
  const noteById = new Map((notes || []).map((n: any) => [n.id, n]))
  const transById = new Map((trans || []).map((t: any) => [t.lesson_note_id, t.text]))

  const reports = (rows || []).map((r: any) => ({
    id: r.id,
    studentId: r.student_id,
    month: r.month,
    data: r.data,
    summary: r.summary_i18n?.[lang] || r.summary,
    focus: (r.focus_i18n?.[lang] || r.focus || '').split('\n').map((l: string) => l.trim()).filter(Boolean),
    notes: (r.data?.notes || []).map((n: any) => {
      const row: any = noteById.get(n.id)
      const text = row ? (row.language === lang ? row.note : (transById.get(n.id) || row.note)) : ''
      return { date: n.date, coachName: n.coachName, text: String(text || '').trim() }
    }).filter((n: any) => n.text),
    feedback: r.feedback,
    feedbackComment: r.feedback_comment,
  }))
  return NextResponse.json({ reports })
}

/** 👍 / 👎 and an optional comment. Only managers read it. */
export async function POST(req: NextRequest) {
  const ctx = await requireParent()
  if (!ctx) return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
  const body = await readJson(req)
  if (!body) return badRequest()
  const feedback = body.feedback
  if (feedback !== 'up' && feedback !== 'down') return badRequest()
  const comment = String(body.comment ?? '').trim().slice(0, 1000)
  const { data, error } = await ctx.svc.from('monthly_reports')
    .update({ feedback, feedback_comment: comment || null, feedback_at: new Date().toISOString() })
    .eq('id', String(body.id || '')).eq('parent_id', ctx.parent.id).eq('status', 'sent')
    .select('id')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data?.length) return NextResponse.json({ error: 'Report not found' }, { status: 404 })
  return NextResponse.json({ ok: true })
}
