import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'
import { sendEmail } from '@/lib/email'
import { formatTime12h } from '@/lib/date'
import { tokenExpiryFromNow } from '@/lib/tokens'

export async function POST(req: NextRequest) {
  const auth = await requireAdmin()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { session_id } = await req.json()
  if (!session_id) return NextResponse.json({ error: 'Missing session_id' }, { status: 400 })

  const svc = auth.svc

  const { data: bookings } = await svc
    .from('bookings')
    .select('id, lesson_credit_id, token_package_id, parent_id, student_id, status')
    .eq('class_session_id', session_id)
    .neq('status', 'cancelled')

  const { data: sessRow } = await svc
    .from('class_sessions').select('course_type_id').eq('id', session_id).single()

  const notified: { parent_id: string; student_id: string }[] = []

  for (const b of bookings || []) {
    if (b.status === 'confirmed') {
      // Claim: only refund if we are the one flipping confirmed -> cancelled
      const { data: c } = await svc
        .from('bookings')
        .update({
          status: 'cancelled',
          pending_action: null,
          cancellation_reason: 'cancelled_by_school',
          cancelled_by: 'admin',
          cancelled_at: new Date().toISOString(),
        })
        .eq('id', b.id)
        .eq('status', 'confirmed')
        .select('id')
      if (!c || c.length === 0) continue
      if (b.lesson_credit_id) {
        await svc.rpc('decrement_used_credits', { credit_id: b.lesson_credit_id })
      } else if (b.token_package_id && sessRow?.course_type_id) {
        // School cancelled a token lesson: reissue a fresh 60-day token rather
        // than crediting back the original package (its remaining days may be
        // nearly gone). source is 'school_cancellation', NOT 'cancellation' —
        // the latter is counted against the parent's late-cancellation quota.
        await svc.from('token_packages').insert({
          parent_id: b.parent_id,
          course_type_id: sessRow.course_type_id,
          total_tokens: 1,
          source: 'school_cancellation',
          source_booking_id: b.id,
          expires_at: tokenExpiryFromNow(),
          note: 'Reissued: lesson cancelled by school',
        })
      }
      notified.push({ parent_id: b.parent_id, student_id: b.student_id })
    } else {
      // pending_partner etc.: no credits were deducted, cancel without refund
      const { data: c } = await svc
        .from('bookings')
        .update({
          status: 'cancelled',
          pending_action: null,
          cancellation_reason: 'cancelled_by_school',
          cancelled_by: 'admin',
          cancelled_at: new Date().toISOString(),
        })
        .eq('id', b.id)
        .eq('status', b.status)
        .select('id')
      if (!c || c.length === 0) continue
      notified.push({ parent_id: b.parent_id, student_id: b.student_id })
    }
  }

  await svc
    .from('class_sessions')
    .update({ status: 'cancelled' })
    .eq('id', session_id)
    .neq('status', 'cancelled')

  // Notify affected parents (best effort)
  try {
    const { data: sess } = await svc
      .from('class_sessions')
      .select('session_date, start_time, end_time, course_type_id, coach_id')
      .eq('id', session_id)
      .single()
    if (sess) {
      const { data: ct } = await svc.from('course_types').select('name').eq('id', sess.course_type_id).single()
      const { data: coach } = await svc.from('coaches').select('first_name, last_name').eq('id', sess.coach_id).single()
      const coachName = coach ? (coach.first_name + ' ' + (coach.last_name || '')).trim() : ''
      const timeStr = formatTime12h(sess.start_time) + ' \u2013 ' + formatTime12h(sess.end_time)
      const seen = new Set<string>()
      for (const t of notified) {
        if (!t.parent_id || seen.has(t.parent_id)) continue
        seen.add(t.parent_id)
        const { data: p } = await svc.from('parents').select('first_name, email').eq('id', t.parent_id).single()
        const { data: s } = await svc.from('students').select('full_name').eq('id', t.student_id).single()
        if (p?.email) {
          await sendEmail({
            type: 'booking_cancelled',
            to: p.email,
            parentName: p.first_name,
            studentName: s?.full_name || '',
            courseName: ct?.name || '',
            coachName,
            date: sess.session_date,
            time: timeStr,
          })
        }
      }
    }
  } catch {}

  return NextResponse.json({ ok: true })
}
