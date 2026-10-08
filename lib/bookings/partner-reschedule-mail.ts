// What both families of a cross-account 1-on-2 are told when a reschedule
// request ends (found 2026-10-07).
//
// /api/bookings/reschedule-partner emails the other family a request; every
// way the request could END was silent. Confirming moved both children's
// lesson with no new-time confirmation to either family; declining,
// withdrawing, the 15 minutes running out (cleanup cron) and the new time
// being taken at the last moment all left the family who asked looking at
// "invited" with no word of the outcome. Each of those now tells both
// families, from one place so the wording cannot drift between routes.
//
// Best effort throughout: the lesson has already been moved (or not) by the
// time this runs, and a failed email must never undo or block that.

import type { SupabaseClient } from '@supabase/supabase-js'
import { sendEmail } from '@/lib/email'
import { formatTime12h } from '@/lib/date'

export type RescheduleOutcome = 'declined' | 'withdrawn' | 'expired' | 'unavailable' | 'too_late' | 'coach_unavailable'

type Lesson = { date: string; time: string; courseName: string; coachName: string }

async function lessonAt(svc: SupabaseClient, sessionId: string | null | undefined): Promise<Lesson | null> {
  if (!sessionId) return null
  const { data: s } = await svc.from('class_sessions')
    .select('session_date, start_time, end_time, course_type_id, coach_id').eq('id', sessionId).maybeSingle()
  if (!s) return null
  const [{ data: ct }, { data: coach }] = await Promise.all([
    s.course_type_id ? svc.from('course_types').select('name').eq('id', s.course_type_id).maybeSingle() : Promise.resolve({ data: null as any }),
    s.coach_id ? svc.from('coaches').select('first_name, last_name').eq('id', s.coach_id).maybeSingle() : Promise.resolve({ data: null as any }),
  ])
  return {
    date: s.session_date,
    time: formatTime12h(s.start_time) + (s.end_time ? ' – ' + formatTime12h(s.end_time) : ''),
    courseName: ct?.name || '',
    coachName: coach ? `${coach.first_name || ''} ${coach.last_name || ''}`.trim() : '',
  }
}

/** Each family on these booking rows, with its own swimmers and the other family's. */
async function familiesOf(svc: SupabaseClient, bookingIds: string[]) {
  const ids = [...new Set(bookingIds.filter(Boolean))]
  if (ids.length === 0) return { rows: [] as any[], families: [] as { parent: any; own: string; other: string }[] }
  const { data: rows } = await svc.from('bookings')
    .select('id, parent_id, student_id, class_session_id').in('id', ids)
  const list = rows || []
  const parentIds = [...new Set(list.map((r: any) => r.parent_id).filter(Boolean))] as string[]
  const kidIds = [...new Set(list.map((r: any) => r.student_id).filter(Boolean))] as string[]
  const [{ data: parents }, { data: kids }] = await Promise.all([
    parentIds.length ? svc.from('parents').select('id, first_name, email').in('id', parentIds) : Promise.resolve({ data: [] as any[] }),
    kidIds.length ? svc.from('students').select('id, full_name').in('id', kidIds) : Promise.resolve({ data: [] as any[] }),
  ])
  const kidName = new Map((kids || []).map((k: any) => [k.id, k.full_name]))
  const names = (rs: any[]) => [...new Set(rs.map((r: any) => kidName.get(r.student_id)).filter(Boolean))].join(' & ')
  const families = (parents || []).map((p: any) => ({
    parent: p,
    own: names(list.filter((r: any) => r.parent_id === p.id)),
    other: names(list.filter((r: any) => r.parent_id !== p.id)),
  }))
  return { rows: list, families }
}

/**
 * The request ended without moving anything. `bookingIds` are both families'
 * rows (still at the original time); `newSessionId` is the time that was asked for.
 */
export async function mailRescheduleNotMoved(
  svc: SupabaseClient,
  opts: { bookingIds: string[]; newSessionId: string | null; outcome: RescheduleOutcome },
): Promise<void> {
  try {
    const { rows, families } = await familiesOf(svc, opts.bookingIds)
    if (rows.length === 0) return
    const [current, proposed] = await Promise.all([
      lessonAt(svc, rows[0].class_session_id),
      lessonAt(svc, opts.newSessionId),
    ])
    if (!current) return
    for (const f of families) {
      if (!f.parent?.email) continue
      await sendEmail({
        type: 'partner_reschedule_not_moved',
        to: f.parent.email,
        parentName: f.parent.first_name,
        studentName: f.own,
        partnerName: f.other,
        courseName: current.courseName,
        coachName: current.coachName,
        date: current.date,
        time: current.time,
        newDate: proposed?.date,
        newTime: proposed?.time,
        rescheduleOutcome: opts.outcome,
      }).catch(e => console.error('partner reschedule email failed:', e))
    }
  } catch (e) {
    console.error('mailRescheduleNotMoved:', e)
  }
}

/** The lesson moved: both families get the new-time confirmation. `bookingIds` are the NEW rows. */
export async function mailRescheduleDone(svc: SupabaseClient, opts: { bookingIds: string[] }): Promise<void> {
  try {
    const { rows, families } = await familiesOf(svc, opts.bookingIds)
    if (rows.length === 0) return
    const lesson = await lessonAt(svc, rows[0].class_session_id)
    if (!lesson) return
    for (const f of families) {
      if (!f.parent?.email) continue
      await sendEmail({
        type: 'booking_rescheduled',
        to: f.parent.email,
        parentName: f.parent.first_name,
        studentName: f.own,
        partnerName: f.other,
        ...lesson,
      }).catch(e => console.error('partner reschedule email failed:', e))
    }
  } catch (e) {
    console.error('mailRescheduleDone:', e)
  }
}
