/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server'
import { requireParent } from '@/lib/api-auth'
import { refundBookingPoints } from '@/lib/bookings/refund'
import { sendBookingConfirmation } from '@/lib/bookings/confirm-mail'
import { createBooking } from '@/lib/bookings/create-booking'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/* Two of the family's swimmers booked together (owner, 2026-10-22): back to
   back with one coach, at the same time with two coaches, or into the same
   1-on-4 class.

   POST { lessons: [{ student_id, course_type_id, coach_id, date, time }, x2] }

   Each lesson is booked by createBooking (lib/bookings/create-booking.ts,
   the code behind /api/bookings/create) -- every rule a single booking
   meets, the points, the holds -- quietly. All or nothing: when the
   second cannot be booked, the first is cancelled and its points go straight
   back, and the family is told why. Both confirmation emails go once both
   are in. */

export async function POST(req: NextRequest) {
  const ctx = await requireParent()
  if (!ctx) return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
  const { svc, parent } = ctx
  const body = await req.json().catch(() => null) as { lessons?: any[] } | null
  const lessons = Array.isArray(body?.lessons) ? body!.lessons : []
  if (lessons.length !== 2) return NextResponse.json({ error: 'Two lessons are needed', code: 'bad_request' }, { status: 400 })
  const [a, b] = lessons
  if (!a?.student_id || !b?.student_id || a.student_id === b.student_id || a.date !== b.date)
    return NextResponse.json({ error: 'Two different swimmers on one day', code: 'bad_request' }, { status: 400 })
  const { data: kids } = await svc.from('students').select('id').eq('parent_id', parent.id).in('id', [a.student_id, b.student_id])
  if ((kids || []).length !== 2) return NextResponse.json({ error: 'Swimmer not found', code: 'student' }, { status: 404 })

  // Each lesson goes through the same code as a single booking, called
  // directly. Over HTTP it went to NEXT_PUBLIC_APP_URL, by every sign the bare domain,
  // whose redirect to www dropped the cookie: nobody was signed in.
  const book = async (l: any) => {
    const r = await createBooking(ctx, { course_type_id: l.course_type_id, coach_id: l.coach_id, session_date: l.date, start_time: String(l.time).slice(0, 5), student_id: l.student_id, quiet: true })
      .catch(err => { console.error('[siblings] booking threw', err); return null })
    const d = r ? await r.json().catch(() => ({})) : {}
    return r?.ok && d.booking_id ? { ok: true as const, id: d.booking_id as string } : { ok: false as const, error: d.error || 'Booking failed. Please try again.', code: d.code }
  }

  const first = await book(a)
  if (!first.ok) return NextResponse.json({ error: first.error, code: first.code, which: 0 }, { status: 409 })
  const second = await book(b)
  if (!second.ok) {
    // Undo the first: cancelled, and every point back.
    const { data: row } = await svc.from('bookings').update({ status: 'cancelled', cancellation_reason: 'sibling_not_booked', cancelled_by: 'parent', cancelled_at: new Date().toISOString() })
      .eq('id', first.id).eq('status', 'confirmed').select('id, points_charged, points_refunded').maybeSingle()
    if (row) await refundBookingPoints(svc, { booking: row as any, parentId: parent.id, reason: 'booking_failed', actor: 'parent', note: 'Sibling booking: the second lesson could not be booked' })
    return NextResponse.json({ error: second.error, code: second.code, which: 1 }, { status: 409 })
  }

  await sendBookingConfirmation(svc, parent.id, first.id)
  await sendBookingConfirmation(svc, parent.id, second.id)
  return NextResponse.json({ ok: true, booking_ids: [first.id, second.id] })
}
