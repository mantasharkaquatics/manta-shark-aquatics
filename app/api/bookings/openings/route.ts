import { NextRequest, NextResponse } from 'next/server'
import { requireParent } from '@/lib/api-auth'
import { type CoachBlock } from '@/lib/availability'
import { meetsLeadTime } from '@/lib/booking-time'
import { getTodayLA, SLOT_STEP_MINUTES } from '@/lib/date'
import { renewalHolds, allRows, allRowsIn } from '@/lib/fixed-classes'
import { inviteHeldSessions } from '@/lib/bookings/invite-holds'
import { privateSlotOpen } from '@/lib/bookings/private-slot'

// Every coach's open private-lesson times over the booking window, in one call.
//
// The booking page used to ask one coach at a time for one day at a time, which
// is why a family had to pick a coach before they could see a single time. This
// answers "who is free when" for all of them at once, so the page can show the
// times first and the coaches under each time, or fade the days a chosen coach
// is not working.
//
// It is for DISPLAY. Nothing is held or booked from here: the booking routes
// re-check the slot against the chosen coach when the family confirms, exactly
// as before. The rules below mirror the ones the page applies per coach
// (loadTimeSlots): the coach's private zone (or legacy weekly hours), the
// 30-minute lead time, time off and admin blocks, the student's own lessons
// with any coach, and any other lesson already running in that coach's lane.
//
// GET ?course_slug=1on1|1on2&student_id=...&student2_id=...
//   -> { coaches: [{ id, first_name }], preferred: coachId | null,
//        days: { 'YYYY-MM-DD': { 'HH:MM': [coachId, ...] } } }

const WINDOW_DAYS = 60
const MAX_UNTIL_DAYS = 400
const LESSON_MIN = 30

const toMin = (t: string) => { const [h, m] = String(t).slice(0, 5).split(':').map(Number); return h * 60 + m }
const toTime = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
const addDays = (ds: string, n: number) => {
  const d = new Date(ds + 'T00:00:00'); d.setDate(d.getDate() + n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const dowOf = (ds: string) => new Date(ds + 'T00:00:00').getDay()

function gridTimes(start: string, end: string): number[] {
  const out: number[] = []
  for (let m = toMin(start); m + LESSON_MIN <= toMin(end); m += SLOT_STEP_MINUTES) out.push(m)
  return out
}

export async function GET(req: NextRequest) {
  const auth = await requireParent()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { parent, svc } = auth

  const q = new URL(req.url).searchParams
  const course_slug = q.get('course_slug') || '1on1'
  if (!['1on1', '1on2'].includes(course_slug))
    return NextResponse.json({ error: 'Unsupported course type' }, { status: 400 })
  const student_id = q.get('student_id')
  if (!student_id) return NextResponse.json({ error: 'Missing student' }, { status: 400 })

  // Round trips are what this route costs, so everything that does not depend
  // on an earlier answer is asked at the same time: two rounds after sign-in.
  const s2id = q.get('student2_id')
  const want2 = course_slug === '1on2' && !!s2id && s2id !== student_id
  const today = getTodayLA()
  const isDs = (x: string | null): x is string => !!x && /^\d{4}-\d{2}-\d{2}$/.test(x)
  const farthest = addDays(today, MAX_UNTIL_DAYS)
  // A make-up voucher may run past the usual window (a leave voucher for a
  // lesson months away): the booking page asks from the day its window opens
  // to its expiry, so only those weeks are worked out, never today..expiry.
  const fromQ = q.get('from')
  const from = isDs(fromQ) && fromQ > today ? (fromQ < farthest ? fromQ : farthest) : today
  const untilQ = q.get('until')
  const toWanted = isDs(untilQ) && untilQ > addDays(from, WINDOW_DAYS) ? untilQ : addDays(from, WINDOW_DAYS)
  const to = toWanted < farthest ? toWanted : farthest
  const dates: string[] = []
  for (let ds = from; ds <= to; ds = addDays(ds, 1)) dates.push(ds)

  const [{ data: student }, s2res, { data: ct }, { data: privateTypes }, { data: coachRows }] = await Promise.all([
    svc.from('students').select('id, parent_id').eq('id', student_id).maybeSingle(),
    want2 ? svc.from('students').select('id, parent_id').eq('id', s2id!).maybeSingle() : Promise.resolve({ data: null as any }),
    svc.from('course_types').select('id, max_students').eq('slug', course_slug).single(),
    svc.from('course_types').select('id').in('slug', ['1on1', '1on2']),
    svc.from('coaches').select('id, first_name').eq('is_active', true).order('first_name'),
  ])
  if (!student || student.parent_id !== parent.id)
    return NextResponse.json({ error: 'Student not found' }, { status: 403 })
  if (!ct) return NextResponse.json({ error: 'Course type missing' }, { status: 500 })

  // A second swimmer on the SAME account has their own calendar to respect.
  // Seats: a 1-on-2 is always booked for two swimmers -- two of yours, or
  // yours and an invited family's -- and bookings/create asks for both seats
  // up front either way (seatsNeeded). Counting a partner invite (which the
  // page does not send as student2_id) as one seat showed a 1-on-2 with one
  // seat left as open, and the booking was then refused (found 2026-10-05).
  // The one 1-seat 1-on-2 -- moving a lesson left with a lone swimmer -- is
  // indistinguishable here and is shown conservatively.
  const studentIds = [student.id]
  const seats = course_slug === '1on2' ? 2 : 1
  const s2 = s2res.data
  if (s2 && s2.parent_id === parent.id) studentIds.push(s2.id)
  const privateTypeIds = new Set((privateTypes || []).map((r: any) => r.id))

  const coaches = (coachRows || []) as { id: string; first_name: string }[]
  const coachIds = coaches.map(c => c.id)
  if (coachIds.length === 0) return NextResponse.json({ coaches: [], preferred: null, days: {} })

  const [{ data: zrows }, { data: zoned }, { data: legacyRows }, { data: offRows }, { data: sessRows }, myRes, holds] = await Promise.all([
    svc.from('coach_availability_zones')
      .select('coach_id, zone_type, kind, weekday, override_date, start_time, end_time')
      .in('coach_id', coachIds)
      .or(`kind.eq.weekly,and(kind.eq.date,override_date.gte.${from},override_date.lte.${to})`),
    // Whether a coach has ANY zone row decides which model their hours come
    // from (lib/zones.ts): none at all means the old weekly table.
    svc.from('coach_availability_zones').select('coach_id').in('coach_id', coachIds),
    svc.from('coach_availability')
      .select('coach_id, day_of_week, start_time, end_time')
      .in('coach_id', coachIds).eq('is_active', true),
    // Paged (allRows), ordered by id: up to 400 days of every coach's
    // sessions is far past the API's silent 1,000-row cap, and a session past
    // the cut read as a free lane (found 2026-10-05). Only sessions with
    // someone in them can make a time unbookable -- an empty session takes
    // no seat and blocks nothing below -- so the rest are not read at all.
    allRows(() => svc.from('coach_time_off')
      .select('id, coach_id, date, start_time, end_time, block_type')
      .in('coach_id', coachIds).gte('date', from).lte('date', to).order('id')),
    allRows(() => svc.from('class_sessions')
      .select('id, coach_id, session_date, start_time, end_time, course_type_id, enrolled_count, max_students')
      .in('coach_id', coachIds).gte('session_date', from).lte('session_date', to)
      .in('status', ['open', 'full']).gt('enrolled_count', 0).order('id')),
    // The student's own lessons come with their session in the same read.
    allRows(() => svc.from('bookings')
      .select('id, class_session_id, class_sessions!bookings_class_session_id_fkey(coach_id, session_date, start_time, end_time, course_type_id)')
      .in('student_id', studentIds)
      .not('status', 'in', '("cancelled","pending_partner")').order('id')),
    // Other families' renewal holds (lib/fixed-classes): a held slot is taken.
    renewalHolds(svc, from, to, parent.id),
  ])
  // A 1-on-2 invitation nobody has answered yet holds its session: it reads
  // as full here, same as on the booking routes (lib/bookings/invite-holds).
  const inviteHeld = await inviteHeldSessions(svc, { coachIds, from, to })

  const zonesByCoach = new Map<string, any[]>()
  for (const r of zrows || []) {
    const list = zonesByCoach.get(r.coach_id) || []
    list.push(r); zonesByCoach.set(r.coach_id, list)
  }
  const hasZones = new Set((zoned || []).map((r: any) => r.coach_id))

  const offKey = (c: string, d: string) => `${c}|${d}`
  const offBy = new Map<string, CoachBlock[]>()
  for (const b of (offRows || []) as CoachBlock[]) {
    const k = offKey(b.coach_id, b.date)
    offBy.set(k, [...(offBy.get(k) || []), b])
  }
  const sessBy = new Map<string, any[]>()
  const sessSeen = new Set((sessRows || []).map((s: any) => s.id))
  for (const s of [...(sessRows || []), ...inviteHeld.filter((h: any) => !sessSeen.has(h.id))]) {
    const k = offKey(s.coach_id, s.session_date)
    sessBy.set(k, [...(sessBy.get(k) || []), s])
  }

  // The student's own lessons, with every coach, as busy intervals by date --
  // and the coach they last had a private lesson with.
  let mine: any[] = (myRes.data || []).map((b: any) => Array.isArray(b.class_sessions) ? b.class_sessions[0] : b.class_sessions).filter(Boolean)
  if (myRes.error) {
    // No embeddable relation: fall back to two reads.
    const { data: ids } = await allRows(() => svc.from('bookings').select('id, class_session_id').in('student_id', studentIds)
      .not('status', 'in', '("cancelled","pending_partner")').order('id'))
    const myIds = [...new Set((ids || []).map((b: any) => b.class_session_id).filter(Boolean))] as string[]
    if (myIds.length) mine = (await allRowsIn(myIds, chunk => svc.from('class_sessions')
      .select('id, coach_id, session_date, start_time, end_time, course_type_id').in('id', chunk).order('id'))).data || []
  }
  const busyBy = new Map<string, { s: number; e: number }[]>()
  let preferred: string | null = null
  {
    let latest = ''
    for (const m of mine) {
      if (m.session_date >= from && m.session_date <= to && m.start_time) {
        const s = toMin(m.start_time)
        const e = m.end_time ? toMin(m.end_time) : s + LESSON_MIN
        busyBy.set(m.session_date, [...(busyBy.get(m.session_date) || []), { s, e }])
      }
      // "Last" means the most recent lesson on or before today; a lesson
      // booked for next month is not who they have been swimming with.
      if (privateTypeIds.has(m.course_type_id) && m.session_date <= today && m.session_date > latest
          && coachIds.includes(m.coach_id)) {
        latest = m.session_date; preferred = m.coach_id
      }
    }
    if (!preferred) {
      const upcoming = (mine || []).filter((m: any) => privateTypeIds.has(m.course_type_id) && coachIds.includes(m.coach_id))
        .sort((a: any, b: any) => a.session_date.localeCompare(b.session_date))[0]
      if (upcoming) preferred = upcoming.coach_id
    }
  }

  const days: Record<string, Record<string, string[]>> = {}
  for (const ds of dates) {
    const dow = dowOf(ds)
    for (const c of coaches) {
      let windows: { start_time: string; end_time: string }[] = []
      if (hasZones.has(c.id)) {
        const all = zonesByCoach.get(c.id) || []
        const dateRows = all.filter(r => r.kind === 'date' && r.override_date === ds)
        const picked = dateRows.length > 0 ? dateRows : all.filter(r => r.kind === 'weekly' && r.weekday === dow)
        if (picked.some(r => r.zone_type === 'closed')) continue
        windows = picked.filter(r => r.zone_type === 'private')
      } else {
        windows = (legacyRows || []).filter((r: any) => r.coach_id === c.id && r.day_of_week === dow)
      }
      if (windows.length === 0) continue

      const blocks = offBy.get(offKey(c.id, ds)) || []
      const sess = sessBy.get(offKey(c.id, ds)) || []
      const busy = busyBy.get(ds) || []
      const seen = new Set<number>()
      for (const w of windows) {
        for (const m of gridTimes(String(w.start_time), String(w.end_time))) {
          if (seen.has(m)) continue
          seen.add(m)
          const t = toTime(m), end = m + LESSON_MIN
          // Only today can fall inside the lead time; checking every slot of 60
          // days reformatted the clock thousands of times.
          if (ds === today && !meetsLeadTime(ds, t)) continue
          // Blocks, the swimmers' own lessons, renewal holds, room for every
          // seat in a same-course lesson, and anything ELSE in the coach's
          // lane (found 2026-10-05: an empty session left by a cancellation
          // used to hide the lesson overlapping it). Shared with the public
          // preview (api/public/schedule) and the same rule as evalSlot in
          // lib/fixed-classes.
          if (!privateSlotOpen({ coachId: c.id, date: ds, startMin: m, endMin: end, courseTypeId: ct.id, seats, blocks, sessions: sess, busy, holds })) continue
          ;((days[ds] ||= {})[t] ||= []).push(c.id)
        }
      }
    }
  }

  return NextResponse.json({ coaches, preferred, days })
}
