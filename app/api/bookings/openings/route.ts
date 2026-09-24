import { NextRequest, NextResponse } from 'next/server'
import { requireParent } from '@/lib/api-auth'
import { isBlocked, type CoachBlock } from '@/lib/availability'
import { meetsLeadTime } from '@/lib/booking-time'
import { getTodayLA, SLOT_STEP_MINUTES } from '@/lib/date'

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
  const from = getTodayLA()
  const to = addDays(from, WINDOW_DAYS)
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

  // A second swimmer on the SAME account takes a second seat in the lesson and
  // has their own calendar to respect. One from a linked family takes a seat
  // of its own when they accept, which is settled on their side.
  const studentIds = [student.id]
  let seats = 1
  const s2 = s2res.data
  if (s2 && s2.parent_id === parent.id) { studentIds.push(s2.id); seats = 2 }
  const privateTypeIds = new Set((privateTypes || []).map((r: any) => r.id))

  const coaches = (coachRows || []) as { id: string; first_name: string }[]
  const coachIds = coaches.map(c => c.id)
  if (coachIds.length === 0) return NextResponse.json({ coaches: [], preferred: null, days: {} })

  const [{ data: zrows }, { data: zoned }, { data: legacyRows }, { data: offRows }, { data: sessRows }, myRes] = await Promise.all([
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
    svc.from('coach_time_off')
      .select('coach_id, date, start_time, end_time, block_type')
      .in('coach_id', coachIds).gte('date', from).lte('date', to),
    svc.from('class_sessions')
      .select('id, coach_id, session_date, start_time, end_time, course_type_id, enrolled_count, max_students')
      .in('coach_id', coachIds).gte('session_date', from).lte('session_date', to)
      .in('status', ['open', 'full']),
    // The student's own lessons come with their session in the same read.
    svc.from('bookings')
      .select('class_session_id, class_sessions(coach_id, session_date, start_time, end_time, course_type_id)')
      .in('student_id', studentIds)
      .not('status', 'in', '("cancelled","pending_partner")'),
  ])

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
  for (const s of sessRows || []) {
    const k = offKey(s.coach_id, s.session_date)
    sessBy.set(k, [...(sessBy.get(k) || []), s])
  }

  // The student's own lessons, with every coach, as busy intervals by date --
  // and the coach they last had a private lesson with.
  let mine: any[] = (myRes.data || []).map((b: any) => Array.isArray(b.class_sessions) ? b.class_sessions[0] : b.class_sessions).filter(Boolean)
  if (myRes.error) {
    // No embeddable relation: fall back to two reads.
    const { data: ids } = await svc.from('bookings').select('class_session_id').in('student_id', studentIds)
      .not('status', 'in', '("cancelled","pending_partner")')
    const myIds = (ids || []).map((b: any) => b.class_session_id).filter(Boolean)
    if (myIds.length) mine = (await svc.from('class_sessions').select('coach_id, session_date, start_time, end_time, course_type_id').in('id', myIds)).data || []
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
      if (privateTypeIds.has(m.course_type_id) && m.session_date <= from && m.session_date > latest
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
          if (ds === from && !meetsLeadTime(ds, t)) continue
          if (isBlocked(blocks, c.id, t, toTime(end))) continue
          if (busy.some(iv => m < iv.e && end > iv.s)) continue
          // A lesson of this kind already at this time has room or it does not.
          const same = sess.find((s: any) => s.course_type_id === ct.id && toMin(s.start_time) === m)
          if (same) {
            if (same.enrolled_count + seats > same.max_students) continue
          } else if (sess.some((s: any) => {
            if (s.enrolled_count <= 0) return false
            const ss = toMin(s.start_time)
            const se = s.end_time ? toMin(s.end_time) : ss + LESSON_MIN
            return m < se && end > ss
          })) continue
          ;((days[ds] ||= {})[t] ||= []).push(c.id)
        }
      }
    }
  }

  return NextResponse.json({ coaches, preferred, days })
}
