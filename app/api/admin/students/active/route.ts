import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'
import { readJson, badRequest } from '@/lib/http'
import { getTodayLA } from '@/lib/date'

// POST { student_id, active: boolean } -- Admin > Members: deactivate or
// reactivate a swimmer (owner, 2026-10-09).
//
// A deactivated swimmer disappears from the family's pages, the booking page,
// check-in and the chat assistant's list; the desk still sees them here,
// marked. Nothing else in the app sets students.is_active, so this route is
// the only way it changes -- and it records who and when
// (docs/migration-student-deactivation.sql), which is what was missing the
// first time a swimmer turned up deactivated with nobody able to say why.
//
// Refused while the swimmer still has something running, so a lesson can never
// stay booked for a child the family can no longer see:
//   - a lesson today or later that is not cancelled (pending 1-on-2 invites too),
//   - a fixed class that is still active,
//   - a swim team membership that is active or past due.
// The desk cancels those first, through the screens that refund and notify.

export async function POST(req: NextRequest) {
  const auth = await requireAdmin()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const svc = auth.svc

  const body = await readJson(req)
  if (!body) return badRequest()
  const studentId = typeof body.student_id === 'string' ? body.student_id : ''
  if (!studentId || typeof body.active !== 'boolean') return badRequest()
  const active: boolean = body.active

  const { data: student } = await svc.from('students').select('id, is_active').eq('id', studentId).maybeSingle()
  if (!student) return NextResponse.json({ error: 'Student not found', code: 'not_found' }, { status: 404 })

  if (!active) {
    const today = getTodayLA()
    const [lessonsRes, fixedRes, teamRes] = await Promise.all([
      // bookings has more than one link to class_sessions, so the embed names
      // its foreign key (a bare embed is an error, which read as "no lessons").
      svc.from('bookings')
        .select('id, lesson_group_id, class_sessions!bookings_class_session_id_fkey!inner(session_date)')
        .eq('student_id', studentId)
        .neq('status', 'cancelled')
        .gte('class_sessions.session_date', today),
      svc.from('fixed_classes')
        .select('id')
        .eq('status', 'active')
        .or(`student_id.eq.${studentId},student2_id.eq.${studentId}`),
      svc.from('team_memberships')
        .select('id')
        .eq('student_id', studentId)
        .in('status', ['active', 'past_due'])
        .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`),
    ])
    // A failed check refuses rather than lets a swimmer with lessons through.
    if (lessonsRes.error || fixedRes.error || teamRes.error) {
      return NextResponse.json({ error: (lessonsRes.error || fixedRes.error || teamRes.error)!.message }, { status: 500 })
    }
    // A 60-minute lesson is two half-hour bookings sharing a lesson_group_id;
    // count lessons, as the Members page's "Upcoming" does, not rows.
    const lessonCount = new Set((lessonsRes.data || []).map((b: any) => b.lesson_group_id || b.id)).size
    const fixedCount = (fixedRes.data || []).length
    const teamCount = (teamRes.data || []).length
    if (lessonCount || fixedCount || teamCount) {
      return NextResponse.json({
        error: 'This swimmer still has lessons, a fixed class or a swim team membership. Cancel those first.',
        code: 'busy',
        lessons: lessonCount, fixed: fixedCount, team: teamCount,
      }, { status: 409 })
    }
  }

  const now = new Date().toISOString()
  const withRecord = active
    ? { is_active: true, deactivated_at: null, deactivated_by: null }
    : { is_active: false, deactivated_at: now, deactivated_by: auth.admin.id }
  let { error } = await svc.from('students').update(withRecord).eq('id', studentId)
  // Before the migration the two record columns do not exist: still switch the
  // swimmer, just without the record.
  if (error && /deactivated_(at|by)/.test(error.message || '')) {
    ({ error } = await svc.from('students').update({ is_active: active }).eq('id', studentId))
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    ok: true,
    is_active: active,
    deactivated_at: active ? null : now,
    deactivated_by_name: active ? null : [auth.admin.first_name, auth.admin.last_name].filter(Boolean).join(' '),
  })
}
