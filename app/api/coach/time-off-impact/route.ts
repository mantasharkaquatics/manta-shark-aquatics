import { NextRequest, NextResponse } from 'next/server'
import { requireCoach } from '@/lib/api-auth'
import { bookedLessonsInWindow } from '@/lib/time-off'

// Before a coach sends a time-off request, the form lists the lessons families
// have already booked in that time so the coach knows what the request touches
// (owner, 2026-10-04). Read-only: the admin's Time Off page still does the
// notifying and cancelling. The lessons come from lib/time-off.ts, the same
// reading the send's desk alert and the admin Reviews item use.
//
// GET ?date=YYYY-MM-DD[&start=HH:MM&end=HH:MM] -- no start/end means whole day.

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/

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

  const lessons = await bookedLessonsInWindow(svc, coach.id, date, partDay ? start : null, partDay ? end : null)
  if (!lessons) return NextResponse.json({ error: 'Lookup failed' }, { status: 500 })
  if (lessons.length === 0) return NextResponse.json({ lessons: [] })

  const stuIds = [...new Set(lessons.flatMap(l => l.students.map(x => x.id)))]
  const ctIds = [...new Set(lessons.map(l => l.course_type_id).filter(Boolean))] as string[]
  const [{ data: stus }, { data: cts }] = await Promise.all([
    stuIds.length ? svc.from('students').select('id, full_name').in('id', stuIds) : Promise.resolve({ data: [] as { id: string; full_name: string }[] }),
    ctIds.length ? svc.from('course_types').select('id, name').in('id', ctIds) : Promise.resolve({ data: [] as { id: string; name: string }[] }),
  ])
  const stuName = new Map<string, string>((stus || []).map((x: { id: string; full_name: string }) => [x.id, x.full_name]))
  const ctName = new Map<string, string>((cts || []).map((x: { id: string; name: string }) => [x.id, x.name]))

  return NextResponse.json({
    lessons: lessons.map(l => ({
      start: l.start,
      end: l.end,
      course_type_id: l.course_type_id,
      course_name: l.course_type_id ? (ctName.get(l.course_type_id) || '') : '',
      is_trial: l.is_trial,
      // First names only: the coach needs to know who, not the family's details.
      swimmers: l.students
        .map(x => String(stuName.get(x.id) || '').trim().split(/\s+/)[0])
        .filter(Boolean),
    })),
  })
}
