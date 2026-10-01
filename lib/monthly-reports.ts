// The monthly progress report (owner's rules, 2026-09-30).
//
//  - One report per swimmer per month, for every swimmer who had at least one
//    lesson that month -- even a single lesson. Swim Team is not part of it
//    (practices are not bookings, and a 'team' course is skipped anyway).
//  - Written on the last day of the month by the hourly cron (after 11 PM Los
//    Angeles time), or on demand from /admin/monthly-reports ("Generate now").
//  - The numbers, the stage bars, the skills and the lesson list come straight
//    from the data and are frozen in `data` when the report is written. Only the
//    summary and next month's focus are written by the model, in English; the
//    manager reads and edits English, and approving translates them.
//  - Nothing is sent until EVERY report of that month is approved, and never
//    before the 1st of the following month. Then the whole month goes out at
//    once: the family sees it on the dashboard and gets one email.
//  - Families can answer with thumbs up or down and an optional comment, which
//    only managers see.
//
// Everything runs with the service client; monthly_reports has RLS on and no
// policy.

import { POLISH_MODEL, SUPPORTED_NOTE_LANGUAGES, LANGUAGE_NAMES } from '@/lib/ai/models'
import { loadGlossary } from '@/lib/ai/translate-note'
import { getTodayLA, getNowMinutesLA } from '@/lib/date'
import { getT, tDb, type Locale } from '@/lib/i18n'
import { stageProgress, stageNameKey, type StageProgress } from '@/lib/levels'
import { masteryOf, MASTERY_LABEL } from '@/lib/mastery'
import { TEAM_SLUG } from '@/lib/points'
import { sendEmail } from '@/lib/email'

type Svc = any

const SKIP_STATUSES = '("cancelled","in_cart","pending_partner","pending_payment")'

// ---- Dates -------------------------------------------------------------------

/** '2026-09-17' -> '2026-09-01' */
export const monthOf = (date: string) => date.slice(0, 7) + '-01'

/** '2026-09-01' -> '2026-09-30' */
export function monthEnd(month: string): string {
  const d = new Date(month + 'T00:00:00Z')
  d.setUTCMonth(d.getUTCMonth() + 1, 0)
  return d.toISOString().slice(0, 10)
}

/** '2026-09-01' -> '2026-10-01' */
export function nextMonth(month: string): string {
  const d = new Date(month + 'T00:00:00Z')
  d.setUTCMonth(d.getUTCMonth() + 1, 1)
  return d.toISOString().slice(0, 10)
}

export function previousMonth(month: string): string {
  const d = new Date(month + 'T00:00:00Z')
  d.setUTCMonth(d.getUTCMonth() - 1, 1)
  return d.toISOString().slice(0, 10)
}

export const isMonth = (v: unknown): v is string => /^\d{4}-\d{2}-01$/.test(String(v))

/** Hour of the day in Los Angeles, 0-23. */
export function hourLA(now = new Date()): number {
  return Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', hour: 'numeric', hourCycle: 'h23' }).format(now))
}

// ---- What a report is made of -------------------------------------------------

export type ReportLesson = {
  date: string
  start: string | null
  end: string | null
  courseTypeId: string | null
  courseName: string
  coachName: string | null
  isTrial: boolean
  attended: boolean
  /** lesson_group_id || class_session_id -- what a lesson note is keyed on */
  key: string
}

export type ReportData = {
  version: 1
  studentName: string
  level: number | null
  stage: 1 | 2 | 3 | null
  coachName: string | null
  lessons: ReportLesson[]
  attended: number
  /** The current level's three stages, as of the end of the month. */
  stages: StageProgress[]
  /** The current stage's skills, with where they stood when the month began. */
  stageSkills: { id: string; name: string; start: number; end: number }[]
  /** Skills of the current level that read "mastered" at the end of the month. */
  mastered: number
  /** Approved coach notes from this month's lessons. */
  notes: { id: string; date: string; coachName: string | null }[]
  /** Lessons of this month still waiting in Reviews when the report was written. */
  pendingReviews: number
  /** The model could not write the text; the manager has to. */
  aiFailed?: boolean
}

type Booking = { id: string; student_id: string; parent_id: string; class_session_id: string; lesson_group_id: string | null; is_trial: boolean }

const toMin = (t: string | null | undefined) => { const [h, m] = String(t || '00:00').slice(0, 5).split(':').map(Number); return h * 60 + m }

/**
 * Every swimmer with at least one lesson in the month, with their bookings.
 * Only lessons that have already ended count: a report written mid-afternoon
 * must not list this evening's lesson as missed. A swimmer whose only lesson
 * was the Swim Assessment gets no monthly report -- the assessment report
 * already covers that lesson.
 */
export async function lessonsByStudent(svc: Svc, month: string, today = getTodayLA(), nowMin = getNowMinutesLA()) {
  const last = monthEnd(month) < today ? monthEnd(month) : today
  const { data: allSessions } = await svc.from('class_sessions')
    .select('id, session_date, start_time, end_time, coach_id, course_type_id')
    .gte('session_date', month).lte('session_date', last)
  const sessions = (allSessions || []).filter((s: any) => s.session_date < today || toMin(s.end_time) <= nowMin)
  const sessionById = new Map<string, any>(sessions.map((s: any) => [s.id, s]))
  if (sessionById.size === 0) return { byStudent: new Map<string, Booking[]>(), sessionById }

  const ids = [...sessionById.keys()]
  const bookings: Booking[] = []
  for (let i = 0; i < ids.length; i += 300) {
    const { data } = await svc.from('bookings')
      .select('id, student_id, parent_id, class_session_id, lesson_group_id, is_trial')
      .in('class_session_id', ids.slice(i, i + 300))
      .not('status', 'in', SKIP_STATUSES)
    bookings.push(...(data || []))
  }

  const typeIds = [...new Set(sessions.map((s: any) => s.course_type_id).filter(Boolean))]
  const { data: types } = typeIds.length
    ? await svc.from('course_types').select('id, slug').in('id', typeIds)
    : { data: [] as any[] }
  const teamTypes = new Set((types || []).filter((t: any) => t.slug === TEAM_SLUG).map((t: any) => t.id))

  const byStudent = new Map<string, Booking[]>()
  for (const b of bookings) {
    const s = sessionById.get(b.class_session_id)
    if (!s || !b.student_id || teamTypes.has(s.course_type_id)) continue
    const list = byStudent.get(b.student_id) || []
    list.push(b)
    byStudent.set(b.student_id, list)
  }
  for (const [id, list] of byStudent) if (list.every(b => b.is_trial)) byStudent.delete(id)
  return { byStudent, sessionById }
}

/** Newest-first merge of approved snapshots: the value each skill had at `onOrBefore`. */
function percentsAt(history: { session_date: string; snapshot: Record<string, number> }[], before: (d: string) => boolean) {
  const out: Record<string, number> = {}
  for (const h of history) {
    if (!before(h.session_date)) continue
    for (const [id, v] of Object.entries(h.snapshot || {})) if (!(id in out)) out[id] = Number(v) || 0
  }
  return out
}

/** Everything the report shows except the two pieces of text. */
export async function buildReportData(
  svc: Svc, studentId: string, month: string, bookings: Booking[], sessionById: Map<string, any>,
): Promise<{ data: ReportData; parentId: string; noteTexts: { date: string; text: string }[] }> {
  const end = monthEnd(month)
  const { data: student } = await svc.from('students')
    .select('id, full_name, parent_id, current_level, current_stage').eq('id', studentId).single()

  // Lessons: the two halves of a 60-minute lesson are one lesson here.
  const coachIds = [...new Set(bookings.map(b => sessionById.get(b.class_session_id)?.coach_id).filter(Boolean))]
  const typeIds = [...new Set(bookings.map(b => sessionById.get(b.class_session_id)?.course_type_id).filter(Boolean))]
  const [{ data: coaches }, { data: types }, { data: att }] = await Promise.all([
    coachIds.length ? svc.from('coaches').select('id, first_name').in('id', coachIds) : { data: [] },
    typeIds.length ? svc.from('course_types').select('id, name').in('id', typeIds) : { data: [] },
    svc.from('attendance').select('booking_id').in('booking_id', bookings.map(b => b.id)),
  ])
  // Present when checked in, or when the coach filed a report for the lesson --
  // not every lesson is checked in at the desk, and a report means they swam.
  const lessonKeys = [...new Set(bookings.map(b => b.lesson_group_id || b.class_session_id))]
  const { data: reported } = await svc.from('progress_history')
    .select('lesson_key').eq('student_id', studentId).in('lesson_key', lessonKeys).neq('status', 'rejected')
  const reportedKeys = new Set((reported || []).map((r: any) => r.lesson_key))
  const coachName = new Map<string, string>((coaches || []).map((c: any) => [c.id, c.first_name]))
  const typeName = new Map<string, string>((types || []).map((t: any) => [t.id, t.name]))
  const attended = new Set((att || []).map((a: any) => a.booking_id))

  const byKey = new Map<string, ReportLesson>()
  for (const b of bookings) {
    const s = sessionById.get(b.class_session_id)
    const key = b.lesson_group_id || b.class_session_id
    const prev = byKey.get(key)
    const lesson: ReportLesson = prev || {
      date: s.session_date, start: s.start_time, end: s.end_time,
      courseTypeId: b.is_trial ? null : s.course_type_id,
      courseName: typeName.get(s.course_type_id) || '',
      coachName: coachName.get(s.coach_id) || null,
      isTrial: !!b.is_trial, attended: false, key,
    }
    if (prev) {
      if (s.start_time && (!lesson.start || s.start_time < lesson.start)) lesson.start = s.start_time
      if (s.end_time && (!lesson.end || s.end_time > lesson.end)) lesson.end = s.end_time
    }
    if (attended.has(b.id) || reportedKeys.has(key)) lesson.attended = true
    byKey.set(key, lesson)
  }
  const lessons = [...byKey.values()].sort((a, b) => (a.date + (a.start || '')).localeCompare(b.date + (b.start || '')))

  // The coach the family saw most this month.
  const count = new Map<string, number>()
  for (const l of lessons) if (l.coachName) count.set(l.coachName, (count.get(l.coachName) || 0) + 1)
  const mainCoach = [...count.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null

  // Skills of the current level, and where each stood at both ends of the month.
  const level = student?.current_level != null ? Number(student.current_level) : null
  let stages: StageProgress[] = []
  let stageSkills: ReportData['stageSkills'] = []
  let mastered = 0
  let stage: 1 | 2 | 3 | null = null
  if (level) {
    const { data: lvl } = await svc.from('levels').select('id').eq('level_number', level).maybeSingle()
    const { data: skills } = lvl
      ? await svc.from('skills').select('id, name, stage, sort_order').eq('level_id', lvl.id).eq('is_active', true)
      : { data: [] as any[] }
    const { data: hist } = await svc.from('progress_history')
      .select('session_date, snapshot, created_at').eq('student_id', studentId).eq('status', 'approved')
      .lte('session_date', end)
      .order('session_date', { ascending: false }).order('created_at', { ascending: false })
    const atEnd = percentsAt(hist || [], d => d <= end)
    const atStart = percentsAt(hist || [], d => d < month)
    const list = (skills || []).map((s: any) => ({ id: s.id, name: s.name, stage: Number(s.stage) || 1, sort: Number(s.sort_order) || 0 }))
    stages = stageProgress(list, atEnd)
    const stored = Number(student?.current_stage)
    stage = (stored === 1 || stored === 2 || stored === 3 ? stored : (stages.find(p => !p.complete)?.stage ?? 3)) as 1 | 2 | 3
    stageSkills = list.filter((s: any) => s.stage === stage).sort((a: any, b: any) => a.sort - b.sort)
      .map((s: any) => ({ id: s.id, name: s.name, start: atStart[s.id] ?? 0, end: atEnd[s.id] ?? 0 }))
    mastered = list.filter((s: any) => masteryOf(atEnd[s.id] ?? 0) === 5).length
  }

  // Approved coach notes from these lessons.
  const keys = lessons.map(l => l.key)
  const { data: notes } = keys.length
    ? await svc.from('lesson_notes').select('id, lesson_key, note, status')
      .eq('student_id', studentId).eq('status', 'approved').in('lesson_key', keys)
    : { data: [] as any[] }
  const lessonByKey = new Map(lessons.map(l => [l.key, l]))
  const noteRows = (notes || [])
    .filter((n: any) => String(n.note || '').trim())
    .map((n: any) => ({ id: n.id, text: String(n.note).trim(), lesson: lessonByKey.get(n.lesson_key)! }))
    .sort((a: any, b: any) => a.lesson.date.localeCompare(b.lesson.date))

  const { count: pending } = await svc.from('progress_history')
    .select('id', { count: 'exact', head: true })
    .eq('student_id', studentId).eq('status', 'pending_review')
    .gte('session_date', month).lte('session_date', end)

  return {
    parentId: student?.parent_id,
    noteTexts: noteRows.map((n: any) => ({ date: n.lesson.date, text: n.text })),
    data: {
      version: 1,
      studentName: student?.full_name || '',
      level, stage,
      coachName: mainCoach,
      lessons,
      attended: lessons.filter(l => l.attended).length,
      stages, stageSkills, mastered,
      notes: noteRows.map((n: any) => ({ id: n.id, date: n.lesson.date, coachName: n.lesson.coachName })),
      pendingReviews: pending ?? 0,
    },
  }
}

// ---- The two pieces of text --------------------------------------------------

const SYSTEM_PROMPT = [
  'You write the monthly progress report that Manta Shark Aquatics, a swim school, sends to a swimmer\'s family.',
  'Write in English, in the school\'s voice ("we"). Warm, specific and plain. No emoji, no exclamation marks, no hype.',
  'Use ONLY the facts in the data. Never invent a skill, a time, a distance, an achievement or a plan the data does not support.',
  'Never mention prices, points, payments or policies, and never promise an outcome or a date.',
  'Lessons the swimmer did not attend are only mentioned as a count, without judgement.',
  'Skill progress uses these steps, lowest to highest: Not taught, Trying it, Needs help, On their own, Getting solid, Mastered.',
  'Return JSON only, no preamble: {"summary": string, "focus": string[]}',
  '- summary: 2 to 4 sentences, under 90 words, about this month: lessons taken, what changed in their skills, where they are in the current stage.',
  '- focus: 1 or 2 short items for next month, each under 20 words, grounded in skills not yet mastered.',
].join('\n')

function promptFor(data: ReportData, notes: { date: string; text: string }[]): string {
  const t = getT('en')
  const first = data.studentName.split(' ')[0] || data.studentName
  const lines: string[] = []
  lines.push(`Swimmer: ${first}`)
  if (data.level) {
    lines.push(`Level ${data.level} (${t('level.' + data.level + '.name')}), currently Stage ${data.stage} (${t(stageNameKey(data.level, data.stage || 1))})`)
    lines.push(`Stage progress at month end: ${data.stages.map(s => `Stage ${s.stage} ${s.percent}%`).join(', ')}`)
    lines.push(`Skills of Stage ${data.stage}:`)
    for (const s of data.stageSkills) {
      const a = MASTERY_LABEL[masteryOf(s.start)], b = MASTERY_LABEL[masteryOf(s.end)]
      lines.push(`- ${s.name}: ${a === b ? b + ' (no change this month)' : a + ' -> ' + b}`)
    }
  } else {
    lines.push('No level yet (the assessment is still being reviewed).')
  }
  lines.push(`Lessons this month: ${data.lessons.length}, attended: ${data.attended}`)
  for (const l of data.lessons) lines.push(`- ${l.date} ${l.isTrial ? 'Swim Assessment' : l.courseName}${l.attended ? '' : ' (did not attend)'}`)
  if (notes.length) {
    lines.push('Coach notes this month (may be in Chinese; write in English regardless):')
    for (const n of notes) lines.push(`- ${n.date}: ${n.text}`)
  }
  return lines.join('\n')
}

export async function writeText(data: ReportData, notes: { date: string; text: string }[]): Promise<{ summary: string; focus: string } | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY!,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: POLISH_MODEL, max_tokens: 600, system: SYSTEM_PROMPT,
          messages: [{ role: 'user', content: promptFor(data, notes) }],
        }),
      })
      if (!res.ok) { console.error('monthly report: model error', res.status, (await res.text()).slice(0, 300)); continue }
      const json = await res.json()
      const raw = (json?.content || []).map((c: any) => c.text || '').join('').trim()
      const body = raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1)
      const out = JSON.parse(body)
      const summary = String(out.summary || '').trim()
      const focus = (Array.isArray(out.focus) ? out.focus : [out.focus]).map((f: any) => String(f || '').trim()).filter(Boolean).slice(0, 2)
      if (summary) return { summary, focus: focus.join('\n') }
    } catch (e) {
      console.error('monthly report: could not write the text', e)
    }
  }
  return null
}

// ---- Writing a month -----------------------------------------------------------

/**
 * Writes the missing reports of a month (or rewrites the given drafts), until
 * the time budget runs out -- a function call cannot run for ever, and each
 * report waits on the model. Call again until `remaining` is 0.
 */
export async function generateMonth(svc: Svc, month: string, opts: { budgetMs?: number; studentIds?: string[] } = {}) {
  const started = Date.now()
  // Each report is roughly ten seconds (most of it the model); stop starting new
  // ones well before the function's 60-second limit.
  const budget = opts.budgetMs ?? 25_000
  const { byStudent, sessionById } = await lessonsByStudent(svc, month)
  const { data: existing } = await svc.from('monthly_reports').select('student_id, status').eq('month', month)
  const status = new Map<string, string>((existing || []).map((r: any) => [r.student_id, r.status]))

  // A report nobody has sent yet, for a swimmer who no longer qualifies (the
  // lesson was cancelled, or it turned out to be only the assessment), goes.
  const stale = [...status.entries()].filter(([id, st]) => st !== 'sent' && !byStudent.has(id)).map(([id]) => id)
  if (stale.length && !opts.studentIds) {
    await svc.from('monthly_reports').delete().eq('month', month).in('student_id', stale).neq('status', 'sent')
  }

  // Rewriting: only reports nobody has sent yet.
  const todo = opts.studentIds
    ? opts.studentIds.filter(id => byStudent.has(id) && status.get(id) !== 'sent')
    : [...byStudent.keys()].filter(id => !status.has(id))

  let written = 0
  const failed: string[] = []
  for (const studentId of todo) {
    if (Date.now() - started > budget) break
    try {
      const { data, parentId, noteTexts } = await buildReportData(svc, studentId, month, byStudent.get(studentId)!, sessionById)
      const text = await writeText(data, noteTexts)
      if (!text) data.aiFailed = true
      const { error } = await svc.from('monthly_reports').upsert({
        student_id: studentId, parent_id: parentId, month, status: 'draft', data,
        summary: text?.summary || '', focus: text?.focus || '',
        summary_i18n: {}, focus_i18n: {},
        generated_at: new Date().toISOString(),
        edited_by: null, edited_at: null, approved_by: null, approved_at: null,
      }, { onConflict: 'student_id,month' })
      if (error) throw new Error(error.message)
      written++
    } catch (e) {
      console.error(`monthly report ${month} ${studentId}: not written`, e)
      failed.push(studentId)
    }
  }
  const done = written + failed.length
  return { eligible: byStudent.size, written, failed: failed.length, remaining: Math.max(0, todo.length - done) }
}

/**
 * The names a family already sees on the site, so a translated report says
 * 「岸上打水」 where the dashboard says 「岸上打水」 rather than the model's own
 * rendering of "Flutter Kick on Deck".
 */
function namesFor(data: ReportData, lang: Locale): { en: string; local: string }[] {
  const en = getT('en'), t = getT(lang)
  const out: { en: string; local: string }[] = []
  const add = (a: string, b: string) => { if (a && b && a !== b) out.push({ en: a, local: b }) }
  if (data.level) {
    add(en('level.' + data.level + '.name'), t('level.' + data.level + '.name'))
    for (const st of [1, 2, 3]) add(en(stageNameKey(data.level, st)), t(stageNameKey(data.level, st)))
    add(`Level ${data.level}`, t('level.badge', { n: data.level, name: '' }).replace(/[\s·]+$/, ''))
  }
  for (const st of [1, 2, 3]) add(`Stage ${st}`, t('dash.stageN', { n: st }))
  for (const s of data.stageSkills) add(s.name, tDb(lang, 'skills', s.id, s.name))
  for (const l of data.lessons) if (l.courseTypeId) add(l.courseName, tDb(lang, 'course_types', l.courseTypeId, l.courseName))
  add('Swim Assessment', t('common.assessment'))
  for (const m of [0, 1, 2, 3, 4, 5] as const) add(MASTERY_LABEL[m], t('mastery.' + m))
  return out
}

async function translateReportText(text: string, lang: Locale, names: { en: string; local: string }[], glossary: string[]): Promise<string | null> {
  if (!text.trim()) return ''
  const system = [
    `Translate this part of a swim school's monthly progress report for a swimmer's family into ${LANGUAGE_NAMES[lang]}.`,
    names.length ? `Use exactly these names wherever the English appears: ${names.map(n => `"${n.en}" = "${n.local}"`).join('; ')}.` : '',
    glossary.length ? `Keep these swim terms in English exactly as written: ${glossary.join(', ')}.` : '',
    'Keep the line breaks. Say only what the text says. Add nothing, drop nothing.',
    'Return the translation alone, with no preamble.',
  ].filter(Boolean).join('\n')
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY!, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: POLISH_MODEL, max_tokens: 800, system, messages: [{ role: 'user', content: text }] }),
      })
      if (!res.ok) { console.error('monthly report: translation error', res.status, (await res.text()).slice(0, 300)); continue }
      const json = await res.json()
      const out = (json?.content || []).map((c: any) => c.text || '').join('').trim()
      if (out) return out
    } catch (e) {
      console.error('monthly report: translation failed', e)
    }
  }
  return null
}

/** The manager's approval: their text, translated. A failed translation blocks
 *  the approval rather than sending a family English they did not choose. */
export async function approveReport(svc: Svc, id: string, adminId: string, summary: string, focus: string): Promise<'ok' | 'sent' | 'translation'> {
  const { data: row } = await svc.from('monthly_reports').select('data, status').eq('id', id).maybeSingle()
  if (!row || row.status === 'sent') return 'sent'
  const glossary = await loadGlossary(svc).catch(() => [] as string[])
  const s: Record<string, string> = { en: summary }
  const f: Record<string, string> = { en: focus }
  for (const lang of SUPPORTED_NOTE_LANGUAGES) {
    if (lang === 'en') continue
    const names = namesFor(row.data as ReportData, lang as Locale)
    const [ts, tf] = await Promise.all([
      translateReportText(summary, lang as Locale, names, glossary),
      translateReportText(focus, lang as Locale, names, glossary),
    ])
    if (ts == null || tf == null) return 'translation'
    s[lang] = ts
    f[lang] = tf
  }
  const now = new Date().toISOString()
  const { data, error } = await svc.from('monthly_reports').update({
    summary, focus, summary_i18n: s, focus_i18n: f,
    status: 'approved', approved_by: adminId, approved_at: now, edited_by: adminId, edited_at: now,
  }).eq('id', id).neq('status', 'sent').select('id')
  if (error) throw new Error(error.message)
  return (data || []).length > 0 ? 'ok' : 'sent'
}

// ---- Sending ---------------------------------------------------------------------

/**
 * Sends every month that is ready: all of its reports approved, and the month
 * over (today is on or after the 1st of the next one). The rows are marked sent
 * first -- that is what puts them on the dashboard -- and then each family gets
 * one email naming their swimmers. Safe to run as often as you like.
 */
export async function sendReadyMonths(svc: Svc, today = getTodayLA()) {
  const { data: waiting } = await svc.from('monthly_reports').select('month, status').in('status', ['draft', 'approved'])
  const months: string[] = [...new Set<string>((waiting || []).filter((r: any) => r.status === 'approved').map((r: any) => String(r.month)))]
  const result: { month: string; sent: number; heldBy: number }[] = []
  for (const month of months) {
    if (nextMonth(month) > today) continue
    const drafts = (waiting || []).filter((r: any) => r.month === month && r.status === 'draft').length
    if (drafts > 0) { result.push({ month, sent: 0, heldBy: drafts }); continue }
    const { data: claimed } = await svc.from('monthly_reports')
      .update({ status: 'sent', sent_at: new Date().toISOString() })
      .eq('month', month).eq('status', 'approved')
      .select('id, parent_id, student_id')
    result.push({ month, sent: (claimed || []).length, heldBy: 0 })
    if (!claimed?.length) continue
    await emailFamilies(svc, month, claimed)
  }
  return result
}

async function emailFamilies(svc: Svc, month: string, rows: { id: string; parent_id: string; student_id: string }[]) {
  const parentIds = [...new Set(rows.map(r => r.parent_id))]
  const [{ data: parents }, { data: students }] = await Promise.all([
    svc.from('parents').select('id, email, first_name, preferred_language').in('id', parentIds),
    svc.from('students').select('id, full_name').in('id', rows.map(r => r.student_id)),
  ])
  const nameOf = new Map<string, string>((students || []).map((s: any) => [s.id, s.full_name]))
  for (const p of parents || []) {
    const mine = rows.filter(r => r.parent_id === p.id)
    if (!p.email || mine.length === 0) continue
    try {
      const ok = await sendEmail({
        type: 'monthly_report', to: p.email, parentName: p.first_name || '',
        lang: p.preferred_language || 'en', month,
        studentNames: mine.map(r => nameOf.get(r.student_id) || '').filter(Boolean),
        reportId: mine[0].id,
      })
      if (ok) await svc.from('monthly_reports').update({ emailed_at: new Date().toISOString() }).in('id', mine.map(r => r.id))
    } catch (e) {
      console.error(`monthly report ${month}: email to parent ${p.id} failed`, e)
    }
  }
}
