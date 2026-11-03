/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server'
import { requireParent } from '@/lib/api-auth'
import { refundBookingPoints } from '@/lib/bookings/refund'
import { sendBookingConfirmation } from '@/lib/bookings/confirm-mail'
import { createBooking } from '@/lib/bookings/create-booking'
import { sendEmail } from '@/lib/email'
import { FIXED_CLASS_MIN_LESSONS } from '@/lib/booking-time'
import { POST as recurringPOST } from '../recurring/route'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

/* Several of the family's swimmers booked together (owner, 2026-11-03;
   app/(public)/booking/FamilyBooking.tsx): at the same time with a coach
   each, back to back with one coach, or into the same 1-on-4 class -- once,
   or every week.

   POST { mode: 'single' | 'weekly', course_slug: '1on1' | '1on4',
          lessons: [{ student_id, coach_id, time: 'HH:MM', dates: ['YYYY-MM-DD', ...] }] }
     one entry per swimmer (2 to MAX_KIDS). single: one date each.
     weekly: the same dates for every swimmer, each swimmer's own fixed
     class (10 or more lessons).

   All or nothing. Each swimmer goes through the route a lone booking uses
   (createBooking for one lesson, /api/bookings/recurring for a fixed class),
   quietly; when one cannot be booked -- or a weekly one comes back with a
   week missing -- every lesson already booked here is cancelled and its
   points go straight back, and the family is told why. The confirmation
   emails go only once everyone is in. */

const MAX_KIDS = 4
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const TIME_RE = /^\d{2}:\d{2}$/

export async function POST(req: NextRequest) {
  const ctx = await requireParent()
  if (!ctx) return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
  const { svc, parent } = ctx
  const body = await req.json().catch(() => null) as any
  const mode = body?.mode === 'weekly' ? 'weekly' : body?.mode === 'single' ? 'single' : null
  const slug = body?.course_slug === '1on4' ? '1on4' : body?.course_slug === '1on1' ? '1on1' : null
  const lessons: any[] = Array.isArray(body?.lessons) ? body.lessons : []
  const bad = () => NextResponse.json({ error: 'Invalid request', code: 'bad_request' }, { status: 400 })
  if (!mode || !slug || lessons.length < 2 || lessons.length > MAX_KIDS) return bad()
  const kids = lessons.map(l => String(l?.student_id || ''))
  if (new Set(kids).size !== kids.length || kids.some(k => !k)) return bad()
  for (const l of lessons) {
    if (typeof l.coach_id !== 'string' || !l.coach_id || typeof l.time !== 'string' || !TIME_RE.test(l.time)) return bad()
    if (!Array.isArray(l.dates) || l.dates.length === 0 || l.dates.some((d: any) => typeof d !== 'string' || !DATE_RE.test(d))) return bad()
    l.dates = [...new Set(l.dates as string[])].sort()
  }
  if (mode === 'single' && lessons.some(l => l.dates.length !== 1)) return bad()
  if (mode === 'weekly') {
    // One set of weeks for the whole family: that is what "together" means.
    const first = lessons[0].dates.join(',')
    if (lessons.some(l => l.dates.join(',') !== first) || lessons[0].dates.length < FIXED_CLASS_MIN_LESSONS) return bad()
  }
  const { data: own } = await svc.from('students').select('id').eq('parent_id', parent.id).in('id', kids)
  if ((own || []).length !== kids.length) return NextResponse.json({ error: 'Swimmer not found', code: 'student' }, { status: 404 })
  const { data: ct } = await svc.from('course_types').select('id').eq('slug', slug).single()
  if (!ct) return NextResponse.json({ error: 'Course type missing' }, { status: 500 })

  // What is booked so far, to take back if a later swimmer cannot be.
  const bookingIds: string[] = []
  const fixedIds: string[] = []
  const undo = async () => {
    if (bookingIds.length) {
      const { data: rows } = await svc.from('bookings')
        .update({ status: 'cancelled', cancellation_reason: 'family_not_booked', cancelled_by: 'parent', cancelled_at: new Date().toISOString() })
        .in('id', bookingIds).eq('status', 'confirmed').select('id, points_charged, points_refunded')
      for (const row of (rows || []) as any[])
        await refundBookingPoints(svc, { booking: row, parentId: parent.id, reason: 'booking_failed', actor: 'parent', note: 'Family booking: another swimmer could not be booked' })
    }
    if (fixedIds.length) {
      // The cancelled lessons stay on record; the class they belonged to goes.
      await svc.from('bookings').update({ fixed_class_id: null }).in('fixed_class_id', fixedIds)
      const { error } = await svc.from('fixed_classes').delete().in('id', fixedIds)
      if (error) console.error('[family] fixed class rollback failed:', error.message)
    }
  }
  const fail = async (i: number, error: string, code?: string, extra: object = {}) => {
    await undo()
    return NextResponse.json({ error, code, which: i, ...extra }, { status: 409 })
  }

  if (mode === 'single') {
    for (let i = 0; i < lessons.length; i++) {
      const l = lessons[i]
      const r = await createBooking(ctx, { course_type_id: ct.id, coach_id: l.coach_id, session_date: l.dates[0], start_time: l.time, student_id: l.student_id, quiet: true })
        .catch(err => { console.error('[family] booking threw', err); return null })
      const d: any = r ? await r.json().catch(() => ({})) : {}
      if (!r?.ok || !d.booking_id) return fail(i, d.error || 'Booking failed. Please try again.', d.code)
      bookingIds.push(d.booking_id)
    }
    for (const id of bookingIds) await sendBookingConfirmation(svc, parent.id, id)
    return NextResponse.json({ ok: true, booking_ids: bookingIds })
  }

  // Weekly: each swimmer's fixed class through the fixed-class route itself,
  // called in this request (it reads the same sign-in), quietly.
  const mails: any[] = []
  for (let i = 0; i < lessons.length; i++) {
    const l = lessons[i]
    const inner = new NextRequest(new URL('/api/bookings/recurring', req.url), {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'commit', course_slug: slug, student_id: l.student_id, coach_id: l.coach_id, quiet: true,
        slots: l.dates.map((date: string) => ({ date, start_time: l.time, coach_id: l.coach_id, fixed: 'family' })),
      }),
    })
    const r = await recurringPOST(inner).catch(err => { console.error('[family] weekly threw', err); return null })
    const d: any = r ? await r.json().catch(() => ({})) : {}
    if (Array.isArray(d.booking_ids)) bookingIds.push(...d.booking_ids)
    if (Array.isArray(d.fixed_class_ids)) fixedIds.push(...d.fixed_class_ids)
    if (!r?.ok || !d.ok) return fail(i, d.error || 'Booking failed. Please try again.', d.code, d.needed ? { needed: d.needed, available: d.available } : {})
    // A week that could not be had for this swimmer is a week the family is
    // not together: nothing is booked rather than half of it.
    if (d.booked !== l.dates.length) return fail(i, 'FAMILY_WEEK_GONE', 'week_gone', { skipped: d.skipped || [] })
    if (d.mail) mails.push(d.mail)
  }
  for (const m of mails) { try { await sendEmail(m) } catch (e) { console.error('[family] confirmation email failed:', e instanceof Error ? e.message : e) } }
  return NextResponse.json({ ok: true, booking_ids: bookingIds, fixed_classes: fixedIds.length })
}
