import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'
import { readJson, badRequest } from '@/lib/http'
import { getTodayLA } from '@/lib/date'
import {
  generateMonth, approveReport, sendReadyMonths, emailPendingReports, emailFamilyReports, lessonsByStudent,
  isMonth, monthOf, monthEnd, previousMonth, nextMonth,
} from '@/lib/monthly-reports'

/** A database row as the API returns it (untyped client). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any

export const runtime = 'nodejs'
// Writing reports waits on the model; approving waits on two translations.
export const maxDuration = 60

const TEXT_MAX = 2000

/** The month's reports for /admin/monthly-reports. */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const svc = auth.svc
  const today = getTodayLA()
  const asked = req.nextUrl.searchParams.get('month')
  // Unless one is asked for: the newest month with reports, else the month
  // being written tonight (last day) or the one just finished.
  let month = isMonth(asked) ? asked : ''
  if (!month) {
    const { data: newest } = await svc.from('monthly_reports').select('month').order('month', { ascending: false }).limit(1)
    month = newest?.[0]?.month || (monthEnd(monthOf(today)) === today ? monthOf(today) : previousMonth(monthOf(today)))
  }

  // The month menu runs from the oldest month with reports to the newest.
  // It used to read every report's month in one go, which stopped at 1,000
  // rows and dropped months from the menu (found 2026-10-08); the two ends
  // are two one-row reads.
  const [{ data: rows }, { data: oldest }, { data: newestRow }, eligible] = await Promise.all([
    svc.from('monthly_reports')
      .select('id, student_id, parent_id, month, status, data, summary, focus, summary_i18n, focus_i18n, generated_at, approved_at, sent_at, emailed_at, feedback, feedback_comment, feedback_at')
      .eq('month', month),
    svc.from('monthly_reports').select('month').order('month', { ascending: true }).limit(1),
    svc.from('monthly_reports').select('month').order('month', { ascending: false }).limit(1),
    lessonsByStudent(svc, month).then(r => r.byStudent.size).catch(() => null),
  ])
  const allMonths: { month: string }[] = []
  const first = oldest?.[0]?.month
  const lastMonth = newestRow?.[0]?.month
  if (isMonth(first) && isMonth(lastMonth)) {
    // Bounded, in case of a stray far-past row: ten years of months at most.
    for (let m = lastMonth; m >= first && allMonths.length < 120; m = previousMonth(m)) allMonths.push({ month: m })
  }
  const studentIds = (rows || []).map((r: any) => r.student_id)
  const parentIds = [...new Set((rows || []).map((r: any) => r.parent_id))]
  const noteIds = (rows || []).flatMap((r: any) => (r.data?.notes || []).map((n: any) => n.id))
  const [{ data: students }, { data: parents }, { data: notes }, { data: noteTrans }] = await Promise.all([
    studentIds.length ? svc.from('students').select('id, full_name').in('id', studentIds) : { data: [] },
    parentIds.length ? svc.from('parents').select('id, first_name, last_name, email').in('id', parentIds) : { data: [] },
    noteIds.length ? svc.from('lesson_notes').select('id, note, language').in('id', noteIds) : { data: [] },
    noteIds.length ? svc.from('lesson_note_translations').select('lesson_note_id, language, text').in('lesson_note_id', noteIds) : { data: [] },
  ])
  const studentName = new Map((students || []).map((s: any) => [s.id, s.full_name]))
  const parentName = new Map((parents || []).map((p: any) => [p.id, `${p.first_name || ''} ${p.last_name || ''}`.trim()]))
  const parentHasEmail = new Map((parents || []).map((p: Row) => [p.id, !!p.email]))
  const noteText = new Map((notes || []).map((n: any) => [n.id, n.note]))
  const noteLang = new Map((notes || []).map((n: any) => [n.id, n.language]))
  const trans = new Map<string, Record<string, string>>()
  for (const t of (noteTrans || []) as any[]) trans.set(t.lesson_note_id, { ...(trans.get(t.lesson_note_id) || {}), [t.language]: t.text })

  const reports = (rows || []).map((r: any) => ({
    ...r,
    studentName: studentName.get(r.student_id) || r.data?.studentName || '',
    parentName: parentName.get(r.parent_id) || '',
    // Released but not emailed: the page says so, and offers to send it.
    parentHasEmail: parentHasEmail.get(r.parent_id) ?? true,
    noteTexts: (r.data?.notes || []).map((n: any) => ({ date: n.date, coachName: n.coachName, text: noteText.get(n.id) || '' })),
    // For "Preview as family": each note in the language it was recorded in, and its translations.
    previewNotes: (r.data?.notes || []).map((n: any) => ({
      date: n.date, coachName: n.coachName, text: noteText.get(n.id) || '',
      language: noteLang.get(n.id) || 'en', translations: trans.get(n.id) || {},
    })),
  })).sort((a: any, b: any) => a.studentName.localeCompare(b.studentName))

  const months = [...new Set([
    month, previousMonth(monthOf(today)), monthOf(today),
    ...(allMonths || []).map((r: any) => r.month),
  ])].sort().reverse()

  return NextResponse.json({
    month, months, today, reports,
    eligible,
    /** The 1st of the month after: before it nothing is sent, however many are approved. */
    sendsFrom: nextMonth(month),
  })
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const svc = auth.svc
  const body = await readJson(req)
  if (!body) return badRequest()
  const { action } = body

  if (action === 'generate') {
    if (!isMonth(body.month)) return NextResponse.json({ error: 'Pick a month' }, { status: 400 })
    if (body.month > monthOf(getTodayLA())) return NextResponse.json({ error: 'That month has not started yet' }, { status: 400 })
    return NextResponse.json(await generateMonth(svc, body.month, { budgetMs: 25_000 }))
  }

  const id = String(body.id || '')
  const { data: row } = await svc.from('monthly_reports').select('id, student_id, parent_id, month, status').eq('id', id).maybeSingle()
  if (!row) return NextResponse.json({ error: 'Report not found', code: 'not_found' }, { status: 404 })

  // The family's email for this month, now: one that has not gone (a failed
  // send, or one past the hourly retries), or again for a family who says it
  // never arrived. Released reports only.
  if (action === 'email') {
    if (row.status !== 'sent') return NextResponse.json({ error: 'This report has not been released yet', code: 'not_sent' }, { status: 409 })
    const r = await emailFamilyReports(svc, row.parent_id, String(row.month), { force: true })
    if (r === 'no_email') return NextResponse.json({ error: 'This family has no email address', code: 'no_email' }, { status: 409 })
    if (r !== 'sent') return NextResponse.json({ error: 'The email did not go out. Try again in a minute.', code: 'email_failed' }, { status: 502 })
    return NextResponse.json({ ok: true, emailedAt: new Date().toISOString() })
  }

  if (row.status === 'sent') return NextResponse.json({ error: 'This report has already been sent to the family', code: 'already_sent' }, { status: 409 })

  if (action === 'regenerate') {
    const r = await generateMonth(svc, row.month, { budgetMs: 25_000, studentIds: [row.student_id] })
    if (r.written !== 1) return NextResponse.json({ error: 'The report could not be rewritten. Try again in a minute.' }, { status: 502 })
    return NextResponse.json({ ok: true })
  }

  const summary = String(body.summary ?? '').trim()
  const focus = String(body.focus ?? '').split('\n').map((l: string) => l.trim()).filter(Boolean).join('\n')
  if (summary.length > TEXT_MAX || focus.length > TEXT_MAX) return NextResponse.json({ error: 'That text is too long' }, { status: 400 })

  if (action === 'save' || action === 'unapprove') {
    // Any change to an approved report sends it back to draft: what goes out is
    // exactly what was approved, translated from exactly that text.
    const { error } = await svc.from('monthly_reports').update({
      ...(action === 'save' ? { summary, focus } : {}),
      status: 'draft', summary_i18n: {}, focus_i18n: {},
      approved_by: null, approved_at: null,
      edited_by: auth.admin.id, edited_at: new Date().toISOString(),
    }).eq('id', id).neq('status', 'sent')
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  if (action === 'approve') {
    if (!summary) return NextResponse.json({ error: 'Write the summary before approving' }, { status: 400 })
    const result = await approveReport(svc, id, auth.admin.id, summary, focus)
    if (result === 'sent') return NextResponse.json({ error: 'This report has already been sent to the family' }, { status: 409 })
    if (result === 'translation') return NextResponse.json({ error: 'The translation did not come back, so nothing was approved. Try again in a minute.' }, { status: 502 })
    // The last approval of a finished month releases the whole month. The
    // emails start here, a few seconds' worth; the hourly cron sends the rest
    // and retries any that fail (lib/monthly-reports emailPendingReports).
    const sent = await sendReadyMonths(svc).catch(e => { console.error('monthly reports: release after approve failed', e); return [] })
    if (sent.some(r => r.sent > 0)) {
      await emailPendingReports(svc, { budgetMs: 10_000 }).catch(e => console.error('monthly reports: email after approve failed', e))
    }
    return NextResponse.json({ ok: true, sent })
  }

  return badRequest()
}
