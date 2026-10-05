import { NextRequest, NextResponse } from 'next/server'
import { requireCoach } from '@/lib/api-auth'
import { isRealBooking } from '@/app/coach/real-booking'

// Before a coach sends a time-off request, the form lists the lessons families
// have already booked in that time so the coach knows what the request touches
// (owner, 2026-10-04). Read-only: the admin's Time Off page still does the
// notifying and cancelling.
//
// GET ?date=YYYY-MM-DD[&start=HH:MM&end=HH:MM] -- no start/end means whole day.

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/
const toM = (t: string) => { const [h, m] = String(t).slice(0, 5).split(':').map(Number); return h * 60 + m }

export async function GET(req: NextRequest) {
  const auth = await requireCoach()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { svc, coach } = auth

  const sp = new URL(req.url).searchParams
  const date = sp.get('date') || ''
  const start = sp.get('start') || ''
  const end = sp.get('end') || ''
  if (!DATE_RE.test(date)) return NextResponse.json({ error: 'Bad date' }, { status: 400 })
  const partDay = !!(start || end)
  if (partDay && (!TIME_RE.test(start) || !TIME_RE.test(end) || start >= end)) {
    return NextResponse.json({ error: 'Bad time range' }, { status: 400 })
  }

  const { data: sessions, error } = await svc
    .from('class_sessions')
    .select('id, start_time, end_time, course_type_id, status')
    .eq('coach_id', coach.id)
    .eq('session_date', date)
    .neq('status', 'cancelled')
  if (error) return NextResponse.json({ error: 'Lookup failed' }, { status: 500 })
  if (!sessions || sessions.length === 0) return NextResponse.json({ lessons: [] })

  const { data: bookings, error: bErr } = await svc
    .from('bookings')
    .select('class_session_id, student_id, status, lesson_group_id, is_trial')
    .in('class_session_id', sessions.map((s: any) => s.id))
  if (bErr) return NextResponse.json({ error: 'Lookup failed' }, { status: 500 })

  // Only real bookings (not cancelled / in a basket / unpaid / an unaccepted
  // invite), dropped BEFORE merging so a dead row's lesson_group_id cannot
  // pull an unrelated session into an hour.
  const real = (bookings || []).filter(isRealBooking)
  const bySession = new Map<string, any[]>()
  for (const b of real) bySession.set(b.class_session_id, [...(bySession.get(b.class_session_id) || []), b])

  const stuIds = [...new Set(real.map((b: any) => b.student_id).filter(Boolean))]
  const ctIds = [...new Set(sessions.map((s: any) => s.course_type_id).filter(Boolean))]
  const [{ data: stus }, { data: cts }] = await Promise.all([
    stuIds.length ? svc.from('students').select('id, full_name').in('id', stuIds) : Promise.resolve({ data: [] as any[] }),
    ctIds.length ? svc.from('course_types').select('id, name').in('id', ctIds) : Promise.resolve({ data: [] as any[] }),
  ])
  const stuMap = new Map((stus || []).map((x: any) => [x.id, x]))
  const ctMap = new Map((cts || []).map((x: any) => [x.id, x]))

  // A 60-minute lesson is two sessions sharing a lesson_group_id: one item
  // spanning the hour, same rule as the coach Today / Schedule pages.
  type Lesson = { start: string; end: string; course_type_id: string | null; studentIds: Set<string>; allTrial: boolean }
  const byKey = new Map<string, Lesson>()
  for (const s of sessions as any[]) {
    const bs = bySession.get(s.id) || []
    if (bs.length === 0) continue
    const groups = [...new Set(bs.map((b: any) => b.lesson_group_id).filter(Boolean))]
    const key = groups.length === 1 ? 'g:' + groups[0] : 's:' + s.id
    const st = String(s.start_time).slice(0, 5)
    const en = String(s.end_time).slice(0, 5)
    const prev = byKey.get(key)
    if (!prev) {
      byKey.set(key, {
        start: st, end: en, course_type_id: s.course_type_id || null,
        studentIds: new Set(bs.map((b: any) => b.student_id).filter(Boolean)),
        allTrial: bs.every((b: any) => !!b.is_trial),
      })
      continue
    }
    if (st < prev.start) prev.start = st
    if (en > prev.end) prev.end = en
    for (const b of bs) if (b.student_id) prev.studentIds.add(b.student_id)
    prev.allTrial = prev.allTrial && bs.every((b: any) => !!b.is_trial)
  }

  // The whole lesson counts when time off covers any part of it: a 60-minute
  // lesson goes as a whole (admin/time-off/impact does the same).
  const lessons = [...byKey.values()]
    .filter(l => !partDay || (toM(l.start) < toM(end) && toM(l.end) > toM(start)))
    .sort((a, b) => a.start.localeCompare(b.start))
    .map(l => ({
      start: l.start,
      end: l.end,
      course_type_id: l.course_type_id,
      course_name: l.course_type_id ? ((ctMap.get(l.course_type_id) as any)?.name || '') : '',
      is_trial: l.allTrial,
      swimmers: [...l.studentIds]
        .map(id => String((stuMap.get(id) as any)?.full_name || '').trim().split(/\s+/)[0])
        .filter(Boolean),
    }))

  return NextResponse.json({ lessons })
}
