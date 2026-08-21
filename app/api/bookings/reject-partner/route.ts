import { NextRequest, NextResponse } from 'next/server'
import { requireParent } from '@/lib/api-auth'
import { sendEmail } from '@/lib/email'
import { formatTime12h } from '@/lib/date'
import { readJson, badRequest } from '@/lib/http'

export async function POST(req: NextRequest) {
  const auth = await requireParent()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { parent, svc } = auth

  const body = await readJson(req)
  if (!body) return badRequest()
  const { booking_id } = body

  const { data: pending } = await svc
    .from('bookings')
    .select('id, parent_id, student_id, class_session_id, partner_parent_id, partner_booking_id, status, lesson_group_id')
    .eq('id', booking_id)
    .single()

  if (!pending || pending.status !== 'pending_partner') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // Only the invited parent may reject this invitation
  if (pending.parent_id !== parent.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // An hour lesson is four pending rows on one lesson_group_id; declining any
  // one of them declines the lesson, so cancel the whole group. Rows without a
  // group id are the original 30-minute pair.
  let targetIds: string[] = [booking_id]
  if (pending.lesson_group_id) {
    const { data: groupRows } = await svc.from('bookings')
      .select('id').eq('lesson_group_id', pending.lesson_group_id).eq('status', 'pending_partner')
    targetIds = (groupRows || []).map((r: any) => r.id)
    if (!targetIds.includes(booking_id)) targetIds.push(booking_id)
  } else if (pending.partner_booking_id) {
    targetIds.push(pending.partner_booking_id)
  }
  await svc.from('bookings')
    .update({ status: 'cancelled', pending_action: null, cancellation_reason: 'partner_rejected' })
    .in('id', targetIds)

  // Notify the initiator (two-step queries)
  try {
    if (pending.partner_parent_id) {
      const { data: initiator } = await svc
        .from('parents').select('first_name, email').eq('id', pending.partner_parent_id).single()
      const { data: sess } = await svc
        .from('class_sessions').select('session_date, start_time, course_type_id').eq('id', pending.class_session_id).single()
      const { data: ct } = sess
        ? await svc.from('course_types').select('name').eq('id', sess.course_type_id).single()
        : { data: null }
      const { data: pStudent } = await svc
        .from('students').select('full_name').eq('id', pending.student_id).single()
      if (initiator?.email && sess) {
        await sendEmail({
          type: 'partner_booking_rejected',
          to: initiator.email,
          parentName: initiator.first_name,
          studentName: pStudent?.full_name || '',
          courseName: ct?.name || '',
          date: sess.session_date,
          time: formatTime12h(sess.start_time),
        })
      }
    }
  } catch {}

  return NextResponse.json({ ok: true })
}
