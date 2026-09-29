import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'
import { getTodayLA, getNowMinutesLA } from '@/lib/date'
import { refundBookingPoints } from '@/lib/bookings/refund'
import { notifyCancellation, type CancelTarget } from '@/lib/bookings/cancel'
import { readJson, badRequest } from '@/lib/http'

// Cancels ONE swimmer's place in a lesson, from the admin calendar.
//
// /api/admin/cancel-session takes the whole lesson down -- every family, full
// refund, everyone emailed. That is right when the school cancels, and wrong
// when one family in a group of four (or one side of a 1-on-2) calls to drop
// out: the other families keep their lesson. Owner's rule, 2026-09-29.
//
// The admin chooses what happens to the points:
//   refund: true   -> returned in full (the usual case, or a school reason)
//   refund: false  -> kept, as a late cancellation. The same thing the
//                     24-hour rule does to a parent, applied by the desk.
//
// Only this swimmer's rows move. A 60-minute lesson is two rows linked by
// lesson_group_id, so both halves for THIS student go together; nobody else's
// row is touched, including the other seat of a 1-on-2.
export async function POST(req: NextRequest) {
  const auth = await requireAdmin()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await readJson(req)
  if (!body) return badRequest()
  const bookingId = String(body.booking_id || '')
  if (!bookingId || typeof body.refund !== 'boolean')
    return NextResponse.json({ error: 'Missing booking_id or refund choice' }, { status: 400 })
  const refund: boolean = body.refund
  const svc = auth.svc

  const cols = 'id, status, class_session_id, points_charged, points_refunded, points_granted, points_granted_expires_at, parent_id, student_id, lesson_group_id, is_trial'
  const { data: primary } = await svc.from('bookings').select(cols).eq('id', bookingId).single()
  if (!primary) return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
  if (primary.status === 'cancelled') return NextResponse.json({ error: 'This booking is already cancelled.' }, { status: 409 })

  let rows: any[] = [primary]
  if (primary.lesson_group_id) {
    const { data: halves } = await svc.from('bookings').select(cols)
      .eq('lesson_group_id', primary.lesson_group_id)
      .eq('student_id', primary.student_id)
      .neq('status', 'cancelled')
    rows = halves && halves.length ? halves : rows
  }

  // Same guards as cancelling the whole lesson: a lesson that happened, or a
  // swimmer who checked in, was delivered.
  const { data: sessions } = await svc.from('class_sessions')
    .select('id, session_date, end_time').in('id', rows.map(r => r.class_session_id))
  const today = getTodayLA()
  const nowMin = getNowMinutesLA()
  const ended = (sessions || []).some((s: any) => s.session_date < today || (s.session_date === today && s.end_time &&
    (() => { const [h, m] = String(s.end_time).slice(0, 5).split(':').map(Number); return h * 60 + m <= nowMin })()))
  if (ended)
    return NextResponse.json({ error: 'This lesson has already taken place and cannot be cancelled. To compensate the family, grant points from the Members page.' }, { status: 409 })
  const { data: attended } = await svc.from('attendance').select('booking_id').in('booking_id', rows.map(r => r.id))
  if ((attended || []).length > 0)
    return NextResponse.json({ error: 'This swimmer has already checked in, so the lesson counts as delivered and cannot be cancelled.' }, { status: 409 })

  const cancelled: string[] = []
  let refundedTotal = 0
  for (const r of rows) {
    // Conditional flip: only the call that moves the row off its current
    // status refunds it, so a double click cannot refund twice.
    const { data: c } = await svc.from('bookings')
      .update({
        status: 'cancelled',
        pending_action: null,
        cancellation_reason: refund ? 'cancelled_by_school' : 'cancelled_by_parent',
        cancelled_by: 'admin',
        cancelled_at: new Date().toISOString(),
      })
      .eq('id', r.id).eq('status', r.status)
      .select('id')
    if (!c || c.length === 0) continue
    cancelled.push(r.id)
    if (refund && r.status === 'confirmed' && (Number(r.points_charged) || 0) > 0) {
      refundedTotal += await refundBookingPoints(svc, {
        booking: r, parentId: r.parent_id, reason: 'cancel_refund', actor: 'admin',
      })
    }
  }
  if (cancelled.length === 0)
    return NextResponse.json({ error: 'This booking changed while you were looking at it. Refresh and try again.' }, { status: 409 })

  // A session with nobody left in it is closed, so it stops showing as a
  // lesson anywhere. Sessions that still hold another family stay open.
  for (const sid of new Set(rows.map(r => r.class_session_id))) {
    const { count } = await svc.from('bookings').select('id', { count: 'exact', head: true })
      .eq('class_session_id', sid).neq('status', 'cancelled')
    if ((count || 0) === 0) await svc.from('class_sessions').update({ status: 'cancelled' }).eq('id', sid).neq('status', 'cancelled')
  }

  const targets: CancelTarget[] = [{
    parent_id: primary.parent_id, student_id: primary.student_id,
    kind: refundedTotal > 0 ? 'points' : 'none',
  }]
  await notifyCancellation(svc, { bookingIds: cancelled, targets })

  return NextResponse.json({ ok: true, cancelled: cancelled.length, pointsRefunded: refundedTotal })
}
