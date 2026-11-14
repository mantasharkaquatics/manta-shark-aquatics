import type { SupabaseClient } from '@supabase/supabase-js'
import { getT } from '@/lib/i18n/all'
import { joinList, type Locale } from '@/lib/i18n'
import { courseIn } from '@/lib/email-family'
import { pushFamily } from '@/lib/push'

/* A push shortly before each lesson (owner, 2026-11-14): on top of the
   day-before reminder (sms-reminder), to phones with the app only -- no
   text, no email, nothing in the family's calendar, so a lesson never rings
   twice at the same time. Each person chooses in 通知設定 › 課前提醒: not
   at all, 30 minutes or an hour before (push_settings.soon_minutes; none
   chosen = an hour, owner's default). The 上課提醒 switch (category
   'reminders') turns it off with the day-before one.

   Run from the 15-minute cleanup cron, in two passes: lessons starting 60-80
   minutes from now for the hour, 30-50 for the half hour (Los Angeles wall
   clock). Each pass stamps its own column on every row of the lesson first
   (bookings.reminder_1h_sent_at / reminder_30m_sent_at,
   docs/migration-reminder-1h.sql and docs/migration-reminder-soon.sql), so
   two runs never push the same lesson. One push per family per lesson: an
   hour lesson is two half-hour rows (lesson_group_id) and goes by its first
   half; siblings on one session share a push. A pass whose column is not
   there yet sends nothing. */

type Pass = { minutes: 60 | 30; from: number; to: number; stamp: 'reminder_1h_sent_at' | 'reminder_30m_sent_at'; title: string }
const PASSES: Pass[] = [
  { minutes: 60, from: 60, to: 80, stamp: 'reminder_1h_sent_at', title: 'push.soon.title' },
  { minutes: 30, from: 30, to: 50, stamp: 'reminder_30m_sent_at', title: 'push.soon30.title' },
]
/** What a person gets when they have not chosen (owner, 2026-11-14). */
export const SOON_DEFAULT = 60
export const SOON_CHOICES = [0, 30, 60] as const

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

export async function sendSoonReminders(svc: SupabaseClient): Promise<Record<string, { lessons: number; pushed: number; note?: string }>> {
  // Who chose what (no row, or no choice: the default).
  const { data: prefs } = await svc.from('push_settings').select('*')
  const chose = new Map(((prefs || []) as Record<string, unknown>[])
    .filter(r => typeof r.soon_minutes === 'number').map(r => [r.auth_user_id as string, r.soon_minutes as number]))
  const out: Record<string, { lessons: number; pushed: number; note?: string }> = {}
  for (const pass of PASSES) {
    try { out[pass.minutes + 'm'] = await runPass(svc, pass, u => (chose.get(u) ?? SOON_DEFAULT) === pass.minutes) }
    catch (e) { console.error('lesson-soon:', pass.minutes, e instanceof Error ? e.message : e); out[pass.minutes + 'm'] = { lessons: 0, pushed: 0, note: 'failed' } }
  }
  return out
}

async function runPass(svc: SupabaseClient, pass: Pass, wants: (userId: string) => boolean): Promise<{ lessons: number; pushed: number; note?: string }> {
  const now = laWall(new Date())
  const from = now + pass.from * 60000, to = now + pass.to * 60000
  const dates = [...new Set([from, to].map(t => new Date(t).toISOString().slice(0, 10)))]
  const { data: sess, error: sErr } = await svc.from('class_sessions')
    .select('id, session_date, start_time, course_type_id, coach_id').in('session_date', dates)
  if (sErr) { console.error('lesson-soon: sessions', sErr.message); return { lessons: 0, pushed: 0, note: 'db error' } }
  const soon = ((sess || []) as Session[]).filter(s => { const t = wallOf(s); return t >= from && t < to })
  if (!soon.length) return { lessons: 0, pushed: 0 }

  const { data: rows, error: bErr } = await svc.from('bookings')
    .select('id, class_session_id, student_id, parent_id, lesson_group_id')
    .eq('status', 'confirmed').is('block_notice_sent_at', null).is(pass.stamp, null)
    .in('class_session_id', soon.map(s => s.id))
  if (bErr) {
    // Before its migration: say nothing rather than push twice.
    if ((bErr.message || '').includes(pass.stamp)) return { lessons: 0, pushed: 0, note: pass.stamp + ' missing' }
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
  const { error: stErr } = await svc.from('bookings').update({ [pass.stamp]: new Date().toISOString() }).in('id', ids).is(pass.stamp, null)
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
      kind: pass.minutes === 60 ? 'reminder_1h' : 'reminder_30m',
      viewerOk: true,
      only: wants,
      url: '/dashboard/schedule',
      text: (L: Locale) => {
        const t = getT(L) as T
        const v = { who: names.length ? joinList(L, names) : t('push.yourSwimmer'), course: courseIn(L, t, course), coach, time: clock(l.session.start_time) }
        return { title: t(pass.title), body: t(coach ? 'push.soon.body' : 'push.soon.bodyNoCoach', v) }
      },
    })
  }
  return { lessons: all.length, pushed }
}
