import { NextResponse } from 'next/server'
import { requireParent } from '@/lib/api-auth'
import { getTodayLA, getNowMinutesLA, minutesUntil } from '@/lib/date'
import { addDaysStr } from '@/lib/vouchers'
import { FC_COLUMNS, HOLD_RELEASE_DAYS, classState, holdLive, isUpcoming, lessonsOf, renewOpen, type FixedClass } from '@/lib/fixed-classes'

export const runtime = 'nodejs'

// The family's fixed classes that still have lessons to come: the dashboard
// line for each, and the class page (續報 / 換時段) behind it.
export async function GET() {
  const ctx = await requireParent()
  if (!ctx) return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
  const { svc, parent } = ctx
  try {
    const { data: fcs } = await svc.from('fixed_classes').select(FC_COLUMNS)
      .eq('parent_id', parent.id).eq('status', 'active').order('created_at')
    const list = (fcs || []) as FixedClass[]
    if (list.length === 0) return NextResponse.json({ classes: [] })
    const [lessons, { data: kids }, { data: coaches }, { data: cts }] = await Promise.all([
      lessonsOf(svc, list.map(f => f.id)),
      svc.from('students').select('id, full_name').eq('parent_id', parent.id),
      svc.from('coaches').select('id, first_name'),
      svc.from('course_types').select('id, slug, name'),
    ])
    const kid = new Map<string, string>((kids || []).map((k: any) => [k.id, k.full_name]))
    const coach = new Map<string, string>((coaches || []).map((c: any) => [c.id, c.first_name]))
    const ctOf = new Map<string, any>((cts || []).map((c: any) => [c.id, c]))
    const today = getTodayLA(), nowMin = getNowMinutesLA()
    const classes = list.map(f => {
      const ls = lessons.get(f.id) || []
      const st = classState(ls, today, nowMin)
      const upcoming = ls.filter(l => isUpcoming(l, today, nowMin) && l.rows.some(r => r.status === 'confirmed'))
      const ct = ctOf.get(f.course_type_id)
      return {
        id: f.id,
        studentId: f.student_id, student2Id: f.student2_id,
        studentNames: [kid.get(f.student_id), f.student2_id ? kid.get(f.student2_id) : null].filter(Boolean),
        courseSlug: ct?.slug || '', courseName: ct?.name || '', courseTypeId: f.course_type_id, minutes: f.minutes,
        coachId: f.coach_id, coachName: coach.get(f.coach_id) || '',
        weekday: f.weekday, time: String(f.start_time).slice(0, 5),
        left: st.left, next: st.next, last: st.last, total: st.total,
        renewOpen: renewOpen(st.last, today),
        holdUntil: holdLive(st.last, today) ? addDaysStr(st.last!, -HOLD_RELEASE_DAYS) : null,
        lessons: upcoming.map(l => ({
          date: l.date, start: l.start, coachId: l.coachId, coachName: coach.get(l.coachId) || '',
          within24h: minutesUntil(l.date, l.start, today, nowMin) < 24 * 60,
          // Any row of the lesson: cancelling one cancels the whole lesson
          // (both halves of an hour, both seats of a sibling 1-on-2).
          bookingId: l.rows.find(r => r.status === 'confirmed')?.id ?? null,
        })),
      }
    }).filter(c => c.left > 0)
    return NextResponse.json({ classes })
  } catch (e) {
    console.error('parent/fixed-classes failed:', e)
    return NextResponse.json({ error: 'Could not load the fixed classes' }, { status: 500 })
  }
}
