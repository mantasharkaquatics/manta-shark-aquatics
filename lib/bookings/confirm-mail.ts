/* eslint-disable @typescript-eslint/no-explicit-any */
import type { SupabaseClient } from '@supabase/supabase-js'
import { sendEmail } from '@/lib/email'
import { formatTime12h } from '@/lib/date'
import { sessionLocationLine } from '@/lib/locations'
import { lessonCalendar } from '@/lib/lesson-calendar'

/** The "booking confirmed" email for one booked lesson, read back from the
 *  database (for routes that book through /api/bookings/create quietly). */
export async function sendBookingConfirmation(svc: SupabaseClient, parentId: string, bookingId: string): Promise<void> {
  try {
    const { data: b } = await svc.from('bookings').select('id, student_id, class_session_id').eq('id', bookingId).eq('parent_id', parentId).maybeSingle()
    if (!b) return
    const [{ data: p }, { data: kid }, { data: s }] = await Promise.all([
      svc.from('parents').select('first_name, email').eq('id', parentId).maybeSingle(),
      svc.from('students').select('full_name').eq('id', b.student_id).maybeSingle(),
      svc.from('class_sessions').select('session_date, start_time, end_time, course_type_id, coach_id').eq('id', b.class_session_id).maybeSingle(),
    ])
    if (!p?.email || !s) return
    const [{ data: ct }, { data: coach }] = await Promise.all([
      svc.from('course_types').select('name').eq('id', (s as any).course_type_id).maybeSingle(),
      svc.from('coaches').select('first_name, last_name').eq('id', (s as any).coach_id).maybeSingle(),
    ])
    await sendEmail({
      type: 'booking_confirmed', to: p.email, parentName: p.first_name,
      studentName: kid?.full_name || '', courseName: ct?.name || '',
      coachName: coach ? `${coach.first_name || ''} ${coach.last_name || ''}`.trim() : '',
      date: (s as any).session_date,
      time: `${formatTime12h((s as any).start_time)} – ${formatTime12h((s as any).end_time)}`,
      location: await sessionLocationLine(svc, b.class_session_id),
      calendar: await lessonCalendar(svc, parentId, [b.id]),
    })
  } catch (e) {
    console.error('booking confirmation email failed for', bookingId, e instanceof Error ? e.message : '')
  }
}
