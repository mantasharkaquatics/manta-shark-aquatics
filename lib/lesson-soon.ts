import type { SupabaseClient } from '@supabase/supabase-js'
import { getT } from '@/lib/i18n/all'
import { joinList, type Locale } from '@/lib/i18n'
import { courseIn } from '@/lib/email-family'
import { pushFamily } from '@/lib/push'

/* A push about an hour before each lesson (owner, 2026-11-14, of four:
   "App 推播 1 小時前"). On top of the day-before reminder (sms-reminder),
   to phones with the app only -- no text and no email, and nothing in the
   family's calendar, so a lesson never rings twice at the same time. It
   follows the 上課提醒 switch in 通知設定 (category 'reminders').

   Run from the 15-minute cleanup cron. A lesson starting 60 to 80 minutes
   from now (Los Angeles wall clock) gets it once: bookings.reminder_1h_sent_at
   (docs/migration-reminder-1h.sql) is stamped on every row of the lesson
   first, so two runs never push the same lesson. One push per family per
   lesson: an hour lesson is two half-hour rows (lesson_group_id) and goes
   by its first half; siblings on one session share a push. Before the
   migration has run, nothing is sent (the column is missing). */

const FROM_MIN = 60
const TO_MIN = 80

type Row = { id: string; class_session_id: string; student_id: string | null; parent_id: string; lesson_group_id: string | null }
type Session = { id: string; session_date: string; start_time: string | null; course_type_id: string | null; coach_id: string | null }
type T = (key: string, vars?: Record<string, string | number>) => string

function laWall(d: Date): number {
  const date = d.toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' })
  const time = d.toLocaleTimeString('en-GB', { timeZone: 'America/Los_Angeles', hour12: false })
  return Date.parse(`${date}T${time}Z`)
}
const wallOf = (s: Session) => Date.parse(`${s.session_date}T${s.start_time || '00:00:00'}Z`)

/** "3:35 PM" from "15:35:00". */
function clock(t: string | null): string {
  const [h, m] = String(t || '0:0').split(':').map(Number)
  return `${((h + 11) % 12) + 1}:${String(m || 0).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`
}

export async function sendSoonReminders(svc: SupabaseClient): Promise<{ lessons: number; pushed: number; note?: string }> {
  const now = laWall(new Date())
  const from = now + FROM_MIN * 60000, to = now + TO_MIN * 60000
  const dates = [...new Set([from, to].map(t => new Date(t).toISOString().slice(0, 10)))]
  const { data: sess, error: sErr } = await svc.from('class_sessions')
    .select('id, session_date, start_time, course_type_id, coach_id').in('session_date', dates)
  if (sErr) { console.error('lesson-soon: sessions', sErr.message); return { lessons: 0, pushed: 0, note: 'db error' } }
  const soon = ((sess || []) as Session[]).filter(s => { const t = wallOf(s); return t >= from && t < to })
  if (!soon.length) return { lessons: 0, pushed: 0 }

  const { data: rows, error: bErr } = await svc.from('bookings')
    .select('id, class_session_id, student_id, parent_id, lesson_group_id')
    .eq('status', 'confirmed').is('block_notice_sent_at', null).is('reminder_1h_sent_at', null)
    .in('class_session_id', soon.map(s => s.id))
  if (bErr) {
    // Before docs/migration-reminder-1h.sql: say nothing rather than push twice.
    if (/reminder_1h_sent_at/.test(bErr.message || '')) return { lessons: 0, pushed: 0, note: 'migration-reminder-1h.sql not run' }
    console.error('lesson-soon: bookings', bErr.message)
    return { lessons: 0, pushed: 0, note: 'db error' }
  }
  const found = (rows || []) as Row[]
  if (!found.length) return { lessons: 0, pushed: 0 }

  // An hour lesson goes by its first half: a second half in the window whose
  // group started earlier is only stamped.
  const sessions = new Map(soon.map(s => [s.id, s]))
  const groupIds = [...new Set(found.map(r => r.lesson_group_id).filter(Boolean))] as string[]
  const groupStart = new Map<string, number>()
  if (groupIds.length) {
    const { data: g } = await svc.from('bookings').select('lesson_group_id, class_session_id').eq('status', 'confirmed').in('lesson_group_id', groupIds)
    const sids = [...new Set(((g || []) as { class_session_id: string }[]).map(x => x.class_session_id))].filter(id => !sessions.has(id))
    if (sids.length) {
      const { data: more } = await svc.from('class_sessions').select('id, session_date, start_time, course_type_id, coach_id').in('id', sids)
      for (const s of (more || []) as Session[]) sessions.set(s.id, s)
    }
    for (const x of (g || []) as { lesson_group_id: string; class_session_id: string }[]) {
      const s = sessions.get(x.class_session_id)
      if (!s) continue
      const t = wallOf(s)
      groupStart.set(x.lesson_group_id, Math.min(groupStart.get(x.lesson_group_id) ?? t, t))
    }
  }

  // Family + start time -> its rows (siblings, the halves of an hour).
  const lessons = new Map<string, { rows: Row[]; session: Session; push: boolean }>()
  for (const r of found) {
    const s = sessions.get(r.class_session_id)
    if (!s) continue
    const first = !r.lesson_group_id || (groupStart.get(r.lesson_group_id) ?? wallOf(s)) >= wallOf(s)
    const key = r.parent_id + '|' + wallOf(s)
    const l = lessons.get(key) || { rows: [], session: s, push: false }
    l.rows.push(r)
    if (first) l.push = true
    lessons.set(key, l)
  }

  // Stamp first, so a run that overlaps this one cannot send it again.
  const ids = found.map(r => r.id)
  const { error: stErr } = await svc.from('bookings').update({ reminder_1h_sent_at: new Date().toISOString() }).in('id', ids).is('reminder_1h_sent_at', null)
  if (stErr) { console.error('lesson-soon: stamp', stErr.message); return { lessons: 0, pushed: 0, note: 'db error' } }

  const uniq = (a: (string | null)[]) => [...new Set(a.filter(Boolean))] as string[]
  const all = [...lessons.values()].filter(l => l.push)
  const [st, ct, co] = await Promise.all([
    svc.from('students').select('id, full_name').in('id', uniq(all.flatMap(l => l.rows.map(r => r.student_id)))),
    svc.from('course_types').select('id, name').in('id', uniq(all.map(l => l.session.course_type_id))),
    svc.from('coaches').select('id, first_name').in('id', uniq(all.map(l => l.session.coach_id))),
  ])
  const firstName = new Map(((st.data || []) as { id: string; full_name: string | null }[]).map(s => [s.id, String(s.full_name || '').trim().split(/\s+/)[0] || '']))
  const courseName = new Map(((ct.data || []) as { id: string; name: string }[]).map(c => [c.id, c.name]))
  const coachName = new Map(((co.data || []) as { id: string; first_name: string | null }[]).map(c => [c.id, String(c.first_name || '').trim()]))

  let pushed = 0
  for (const l of all) {
    const names = uniq(l.rows.map(r => r.student_id)).map(id => firstName.get(id) || '').filter(Boolean)
    const coach = l.session.coach_id ? coachName.get(l.session.coach_id) || '' : ''
    const course = l.session.course_type_id ? courseName.get(l.session.course_type_id) || '' : ''
    pushed += await pushFamily(svc, l.rows[0].parent_id, {
      category: 'reminders',
      kind: 'reminder_1h',
      viewerOk: true,
      url: '/dashboard/schedule',
      text: (L: Locale) => {
        const t = getT(L) as T
        const v = { who: names.length ? joinList(L, names) : t('push.yourSwimmer'), course: courseIn(L, t, course), coach, time: clock(l.session.start_time) }
        return { title: t('push.soon.title'), body: t(coach ? 'push.soon.body' : 'push.soon.bodyNoCoach', v) }
      },
    })
  }
  return { lessons: all.length, pushed }
}
