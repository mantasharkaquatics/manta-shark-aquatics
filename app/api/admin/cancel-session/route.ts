import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'
import { sendEmail } from '@/lib/email'
import { formatTime12h, getTodayLA, getNowMinutesLA } from '@/lib/date'
import { tokenExpiryFromNow } from '@/lib/tokens'
import { refundCredit } from '@/lib/ledger'
import { readJson, badRequest } from '@/lib/http'

export async function POST(req: NextRequest) {
  const auth = await requireAdmin()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await readJson(req)
  if (!body) return badRequest()
  const { session_id } = body
  if (!session_id) return NextResponse.json({ error: 'Missing session_id' }, { status: 400 })

  const svc = auth.svc

  const { data: bookings } = await svc
    .from('bookings')
    .select('id, lesson_credit_id, token_package_id, parent_id, student_id, status, class_session_id, lesson_group_id')
    .eq('class_session_id', session_id)
    .neq('status', 'cancelled')

  const { data: sessRow } = await svc
    .from('class_sessions').select('course_type_id, session_date, end_time').eq('id', session_id).single()

  // A lesson that already happened cannot be un-happened. If the swimmer showed
  // up — or the class has simply ended — the lesson was delivered and stays on
  // the books. When the school wants to make it good, that is a judgement call
  // handled by granting a token by hand, not by erasing the lesson.
  if (sessRow?.session_date) {
    const today = getTodayLA()
    const ended = sessRow.session_date < today ||
      (sessRow.session_date === today && sessRow.end_time &&
       (() => { const [h, m] = String(sessRow.end_time).slice(0, 5).split(':').map(Number); return h * 60 + m <= getNowMinutesLA() })())
    if (ended)
      return NextResponse.json({ error: 'This lesson has already taken place and cannot be cancelled. To compensate the family, issue a token from the Members page.' }, { status: 409 })
  }

  // A 60-minute lesson is two linked bookings living in two different sessions.
  // Cancelling one half from the admin calendar has to take the whole group:
  // otherwise the other half survives as an unsellable orphan slot and the
  // parent is refunded only half of what they actually paid.
  const allBookings: any[] = [...(bookings || [])]
  const extraSessionIds = new Set<string>()
  const groupIds = Array.from(new Set(allBookings.map(b => b.lesson_group_id).filter(Boolean)))
  if (groupIds.length > 0) {
    const { data: sibs } = await svc
      .from('bookings')
      .select('id, lesson_credit_id, token_package_id, parent_id, student_id, status, class_session_id, lesson_group_id')
      .in('lesson_group_id', groupIds)
      .neq('status', 'cancelled')
    for (const sb of sibs || []) {
      if (allBookings.some(b => b.id === sb.id)) continue
      allBookings.push(sb)
      if (sb.class_session_id && sb.class_session_id !== session_id) extraSessionIds.add(sb.class_session_id)
    }
  }

  const { data: attended } = await svc
    .from('attendance').select('booking_id').in('booking_id', allBookings.map(b => b.id))
  if ((attended || []).length > 0)
    return NextResponse.json({ error: 'This swimmer has already checked in, so the lesson counts as delivered and cannot be cancelled. To compensate the family, issue a token from the Members page.' }, { status: 409 })

  const notified: { parent_id: string; student_id: string; kind: 'credit' | 'token' | 'none' }[] = []

  for (const b of allBookings) {
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
        await refundCredit(svc, b.lesson_credit_id)
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
      notified.push({ parent_id: b.parent_id, student_id: b.student_id, kind: b.lesson_credit_id ? 'credit' : (b.token_package_id && sessRow?.course_type_id ? 'token' : 'none') })
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
      notified.push({ parent_id: b.parent_id, student_id: b.student_id, kind: 'none' })
    }
  }

  await svc
    .from('class_sessions')
    .update({ status: 'cancelled' })
    .in('id', [session_id, ...Array.from(extraSessionIds)])
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
      let endStr = sess.end_time
      if (extraSessionIds.size > 0) {
        const { data: gs } = await svc
          .from('class_sessions').select('end_time').in('id', Array.from(extraSessionIds))
        for (const g of gs || []) if (g.end_time && g.end_time > endStr) endStr = g.end_time
      }
      const timeStr = formatTime12h(sess.start_time) + ' \u2013 ' + formatTime12h(endStr)
      const kindsByParent = new Map<string, Set<string>>()
      for (const n of notified) {
        if (!n.parent_id || n.kind === 'none') continue
        if (!kindsByParent.has(n.parent_id)) kindsByParent.set(n.parent_id, new Set())
        kindsByParent.get(n.parent_id)!.add(n.kind)
      }
      const seen = new Set<string>()
      for (const t of notified) {
        if (!t.parent_id || seen.has(t.parent_id)) continue
        seen.add(t.parent_id)
        const ks = kindsByParent.get(t.parent_id)
        // One currency now, so there is nothing to mix: either points came
        // back or nothing did.
        const refundKind = !ks || ks.size === 0 ? 'none' as const : 'points' as const
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
            refundKind,
          })
        }
      }
    }
  } catch {}

  return NextResponse.json({ ok: true })
}
