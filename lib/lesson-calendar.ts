import type { SupabaseClient } from '@supabase/supabase-js'
import { DEFAULT_LOCATION_ID, getLocations, locationLine, poolHasDetails } from './locations'

/* What a lesson email's calendar file says (owner, 2026-10-22), read from the
   database AFTER the change the email is about.

   One event per family per lesson: the halves of a 60-minute lesson and the
   siblings in it are one event. Its UID is the smallest booking id the family
   has ever had in that lesson -- cancelled ones included -- so the booking,
   every move (bookings keep their ids when they move) and the cancellation all
   name the same event, and cancelling one sibling of two does not change it.

   A lesson the family still has a live booking in goes out as an update;
   one with nothing left goes out as cancelled. */

export type CalendarLesson = {
  uid: string
  date: string
  start: string
  minutes: number
  students: string[]
  course: string
  coach: string
  place?: string
  cancelled: boolean
}

const LIVE = new Set(['confirmed'])
const hm = (t: string) => String(t || '').slice(0, 5)
const mins = (t: string) => { const [h, m] = hm(t).split(':').map(Number); return h * 60 + m }

/**
 * The lessons of the given bookings, for one family. bookingIds may span
 * several lessons (a set of lessons, a fixed class); other families' bookings
 * among them are left out. undefined when there is nothing to put in a calendar.
 */
export async function lessonCalendar(svc: SupabaseClient, parentId: string | null | undefined, bookingIds: (string | null | undefined)[]): Promise<CalendarLesson[] | undefined> {
  try {
    const ids = [...new Set(bookingIds.filter((x): x is string => !!x))]
    if (!parentId || ids.length === 0) return undefined
    const { data: seed } = await svc.from('bookings').select('id, class_session_id, lesson_group_id').in('id', ids).eq('parent_id', parentId)
    if (!seed || seed.length === 0) return undefined
    const sessIds = [...new Set(seed.map(b => b.class_session_id).filter(Boolean))] as string[]
    const groupIds = [...new Set(seed.map(b => b.lesson_group_id).filter(Boolean))] as string[]

    // Every booking this family has had in those lessons, any status.
    const or = [`class_session_id.in.(${sessIds.join(',')})`, ...(groupIds.length ? [`lesson_group_id.in.(${groupIds.join(',')})`] : [])].join(',')
    const { data: rows } = await svc.from('bookings')
      .select('id, status, is_trial, student_id, class_session_id, lesson_group_id')
      .eq('parent_id', parentId).or(or)
    const all = (rows || []) as { id: string; status: string; is_trial: boolean; student_id: string; class_session_id: string; lesson_group_id: string | null }[]

    const allSess = [...new Set(all.map(b => b.class_session_id))]
    const [{ data: sessions }, pools] = await Promise.all([
      svc.from('class_sessions').select('id, session_date, start_time, end_time, course_type_id, coach_id, location_id').in('id', allSess),
      getLocations(svc),
    ])
    const sById = new Map((sessions || []).map((s: any) => [s.id, s]))
    const studentIds = [...new Set(all.map(b => b.student_id))]
    const courseIds = [...new Set((sessions || []).map((s: any) => s.course_type_id))]
    const coachIds = [...new Set((sessions || []).map((s: any) => s.coach_id))]
    const [{ data: kids }, { data: courses }, { data: coaches }] = await Promise.all([
      svc.from('students').select('id, full_name').in('id', studentIds),
      svc.from('course_types').select('id, name').in('id', courseIds),
      svc.from('coaches').select('id, first_name, last_name').in('id', coachIds),
    ])
    const kid = new Map((kids || []).map((k: any) => [k.id, k.full_name as string]))
    const courseName = new Map((courses || []).map((c: any) => [c.id, c.name as string]))
    const coachName = new Map((coaches || []).map((c: any) => [c.id, `${c.first_name || ''} ${c.last_name || ''}`.trim()]))

    // Group: a lesson is its group (60 minutes) or its session; the same
    // family's bookings at the same date and start are one lesson too.
    const key = (b: typeof all[number]) => b.lesson_group_id || b.class_session_id
    const groups = new Map<string, typeof all>()
    for (const b of all) groups.set(key(b), [...(groups.get(key(b)) || []), b])
    const merged = new Map<string, typeof all>()
    for (const g of groups.values()) {
      const live = g.filter(b => LIVE.has(b.status))
      const ss = (live.length ? live : g).map(b => sById.get(b.class_session_id)).filter(Boolean)
      if (!ss.length) continue
      const first = ss.reduce((a: any, s: any) => (mins(s.start_time) < mins(a.start_time) ? s : a))
      const at = `${first.session_date} ${hm(first.start_time)}`
      merged.set(at, [...(merged.get(at) || []), ...g])
    }

    // Only the lessons the given bookings belong to.
    const seedIds = new Set(ids)
    const out: CalendarLesson[] = []
    for (const g of merged.values()) {
      if (!g.some(b => seedIds.has(b.id))) continue
      const live = g.filter(b => LIVE.has(b.status))
      const use = live.length ? live : g
      const ss = [...new Set(use.map(b => b.class_session_id))].map(id => sById.get(id)).filter(Boolean) as any[]
      if (!ss.length) continue
      const start = Math.min(...ss.map(s => mins(s.start_time)))
      const end = Math.max(...ss.map(s => mins(s.end_time || s.start_time) || mins(s.start_time) + 30))
      const s0 = ss.find(s => mins(s.start_time) === start)
      const pool = pools.find(l => l.id === (s0.location_id || DEFAULT_LOCATION_ID))
      out.push({
        uid: `lesson-${[...g.map(b => b.id)].sort()[0]}@mantasharkaquatics.net`,
        date: s0.session_date,
        start: hm(s0.start_time),
        minutes: Math.max(15, end - start),
        students: [...new Set(use.map(b => kid.get(b.student_id)).filter(Boolean))] as string[],
        course: use.some(b => b.is_trial) ? 'Swim Assessment' : (courseName.get(s0.course_type_id) || '') + (end - start >= 55 ? ' (60 min)' : ''),
        coach: coachName.get(s0.coach_id) || '',
        place: pool ? (poolHasDetails(pool) ? locationLine(pool) : pool.name) : undefined,
        cancelled: live.length === 0,
      })
    }
    out.sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start))
    return out.length ? out : undefined
  } catch (e) {
    console.error('lessonCalendar failed', e instanceof Error ? e.message : '')
    return undefined
  }
}

/** lessonCalendar for the family's bookings in these sessions, for senders
 *  that hold the lesson's session rather than its booking ids. */
export async function lessonCalendarForSessions(svc: SupabaseClient, parentId: string | null | undefined, sessionIds: (string | null | undefined)[]): Promise<CalendarLesson[] | undefined> {
  const ids = [...new Set(sessionIds.filter((x): x is string => !!x))]
  if (!parentId || ids.length === 0) return undefined
  const { data } = await svc.from('bookings').select('id').eq('parent_id', parentId).in('class_session_id', ids)
  return lessonCalendar(svc, parentId, (data || []).map((r: { id: string }) => r.id))
}
