import { NextRequest, NextResponse } from 'next/server'
import { requireParent } from '@/lib/api-auth'
import { allRows } from '@/lib/db-paging'
import { getTodayLA } from '@/lib/date'

export const runtime = 'nodejs'

// The swimmer's most recent lesson of one course, for the booking page's
// "same as last time" card (owner, 2026-11-01, BK15): that weekday, time and
// coach, offered as a weekly class. Only a lesson already taught (on or
// before today) counts -- one booked for next month is not "last time" --
// and never the Swim Assessment.
//
// GET ?student_id=...&course_slug=1on1|1on2|1on4&student2_id=...
//   student2_id: a sibling 1-on-2 -- the lesson must be one they shared.
//   -> { last: { date, weekday, time, minutes, coachId, coachName } | null,
//        assessCoachId: the coach of the swimmer's latest Swim Assessment, or null }
// assessCoachId is the coach the booking page picks first (owner, 2026-11-02:
// "if this family's assessment was with Mitch, choose Mitch for them").

const toMin = (t: string) => { const [h, m] = String(t).slice(0, 5).split(':').map(Number); return h * 60 + m }

export async function GET(req: NextRequest) {
  const ctx = await requireParent()
  if (!ctx) return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
  const { svc, parent } = ctx
  const q = req.nextUrl.searchParams
  const studentId = q.get('student_id')
  const slug = q.get('course_slug') || ''
  const s2 = q.get('student2_id')
  if (!studentId || !['1on1', '1on2', '1on4'].includes(slug)) return NextResponse.json({ error: 'Bad request' }, { status: 400 })
  try {
    const ids = [studentId, ...(slug === '1on2' && s2 && s2 !== studentId ? [s2] : [])]
    const [{ data: kids }, { data: ct }] = await Promise.all([
      svc.from('students').select('id, parent_id').in('id', ids),
      svc.from('course_types').select('id').eq('slug', slug).maybeSingle(),
    ])
    if ((kids || []).length !== ids.length || (kids || []).some((k: any) => k.parent_id !== parent.id))
      return NextResponse.json({ error: 'Student not found' }, { status: 403 })
    if (!ct) return NextResponse.json({ last: null, assessCoachId: null })

    const { data: rows } = await allRows(() => svc.from('bookings')
      .select('id, student_id, lesson_group_id, class_session_id, is_trial, class_sessions!bookings_class_session_id_fkey(coach_id, session_date, start_time, end_time, course_type_id)')
      .in('student_id', ids)
      .not('status', 'in', '("cancelled","pending_partner")').order('id'))
    const today = getTodayLA()
    const sessOf = (b: any) => Array.isArray(b.class_sessions) ? b.class_sessions[0] : b.class_sessions
    const trials = (rows || []).filter((b: any) => b.student_id === studentId && b.is_trial && sessOf(b))
      .map(sessOf).sort((a: any, b: any) => String(b.session_date).localeCompare(String(a.session_date)))
    const assessCoachId: string | null = trials[0]?.coach_id ?? null
    const mine = (rows || []).filter((b: any) => {
      const s = sessOf(b)
      return b.student_id === studentId && !b.is_trial && s && s.course_type_id === ct.id && s.session_date <= today
    })
    // A sibling 1-on-2: only a lesson the second swimmer was in too.
    const theirs = ids.length > 1 ? new Set((rows || []).filter((b: any) => b.student_id === ids[1]).map((b: any) => b.class_session_id)) : null
    const shared = theirs ? mine.filter((b: any) => theirs.has(b.class_session_id)) : mine
    if (shared.length === 0) return NextResponse.json({ last: null, assessCoachId })

    const key = (b: any) => { const s = sessOf(b); return `${s.session_date} ${String(s.start_time).slice(0, 5)}` }
    const latest = shared.reduce((a: any, b: any) => (key(b) > key(a) ? b : a))
    // An hour is two half-hour sessions under one lesson_group_id: the lesson
    // starts at the first and ends with the last.
    const group = latest.lesson_group_id ? mine.filter((b: any) => b.lesson_group_id === latest.lesson_group_id) : [latest]
    const sess = group.map(sessOf)
    const start = sess.map((s: any) => String(s.start_time).slice(0, 5)).sort()[0]
    const endMin = Math.max(...sess.map((s: any) => (s.end_time ? toMin(s.end_time) : toMin(s.start_time) + 30)))
    const s0 = sessOf(latest)
    const { data: coach } = await svc.from('coaches').select('first_name').eq('id', s0.coach_id).maybeSingle()
    return NextResponse.json({
      last: {
        date: s0.session_date,
        weekday: new Date(s0.session_date + 'T00:00:00').getDay(),
        time: start,
        minutes: endMin - toMin(start) > 40 ? 60 : 30,
        coachId: s0.coach_id,
        coachName: coach?.first_name || '',
      },
      assessCoachId,
    })
  } catch (e) {
    console.error('parent/last-lesson failed:', e)
    return NextResponse.json({ error: 'Could not load the last lesson' }, { status: 500 })
  }
}
