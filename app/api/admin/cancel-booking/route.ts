import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'
import { getTodayLA, getNowMinutesLA } from '@/lib/date'
import { refundBookingPoints } from '@/lib/bookings/refund'
import { notifyCancellation, type CancelTarget } from '@/lib/bookings/cancel'
import { giveBackVouchers, issueVoucher, voucherExpiry } from '@/lib/vouchers'
import { readJson, badRequest } from '@/lib/http'
import Stripe from 'stripe'
import { closeTrialCheckout } from '@/lib/trial-booking'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2026-05-27.dahlia' as any })

// Cancels ONE swimmer's place in a lesson, from the admin calendar -- or, for
// a 1-on-2, the whole lesson.
//
// /api/admin/cancel-session takes the whole lesson down -- every family, full
// refund, everyone emailed. That is right when the school cancels, and wrong
// when one family in a group of four calls to drop out: the other families
// keep their lesson. Owner's rule, 2026-09-29.
//
// The admin chooses what happens to the points:
//   refund   -> returned in full (the usual case, or a school reason)
//   keep     -> kept, as a late cancellation. The same thing the 24-hour
//               rule does to a parent, applied by the desk.
//   voucher  -> the lesson becomes a make-up voucher instead of points.
//
// A 60-minute lesson is two rows linked by lesson_group_id, so both halves go
// together. In a 1-on-4 only this swimmer's rows move; nobody else's row is
// touched.
//
// A 1-on-2 is ONE lesson and always has two swimmers (owner, 2026-10-07; this
// replaces the per-seat rule of 2026-09-29 for 1-on-2). Cancelling one seat
// left a one-swimmer 1-on-2 behind, and a make-up voucher later made from it
// named one child, which nothing can book. So both seats go together -- same
// family or two families, both halves of an hour -- with the chosen mode
// applied to both, and every family is emailed. A voucher is ONE 1-on-2
// voucher for both children of a sibling pair, as lib/bookings/cancel.ts
// makes; two families cannot share one voucher, so that case is refused and
// the desk refunds (or keeps) instead.
export async function POST(req: NextRequest) {
  const auth = await requireAdmin()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await readJson(req)
  if (!body) return badRequest()
  const bookingId = String(body.booking_id || '')
  // refund: true | false is the original shape; mode adds the third choice,
  // turning the lesson into a make-up voucher instead of points (2026-10-01).
  const mode: 'refund' | 'keep' | 'voucher' =
    body.mode === 'voucher' ? 'voucher' : body.mode === 'keep' ? 'keep' : body.mode === 'refund' ? 'refund'
      : body.refund === true ? 'refund' : body.refund === false ? 'keep' : ('' as any)
  if (!bookingId || !mode)
    return NextResponse.json({ error: 'Missing booking_id or refund choice' }, { status: 400 })
  const refund = mode === 'refund'
  const svc = auth.svc

  const cols = 'id, status, class_session_id, points_charged, points_refunded, points_granted, points_granted_expires_at, parent_id, student_id, lesson_group_id, is_trial, fixed_class_id, voucher_id, stripe_session_id'
  const { data: primary } = await svc.from('bookings').select(cols).eq('id', bookingId).single()
  if (!primary) return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
  if (primary.status === 'cancelled') return NextResponse.json({ error: 'This booking is already cancelled.' }, { status: 409 })
  const { data: s1 } = await svc.from('class_sessions').select('course_types(slug)').eq('id', primary.class_session_id).single()
  const ct1: any = Array.isArray((s1 as any)?.course_types) ? (s1 as any).course_types[0] : (s1 as any)?.course_types
  const slug: string = ct1?.slug || ''
  const isPair = slug === '1on2'
  if (mode === 'voucher') {
    // A Swim Assessment is not a lesson the family can make up: turning it into
    // a voucher handed out a free lesson (found 2026-10-04).
    if (primary.is_trial)
      return NextResponse.json({ error: 'A Swim Assessment cannot be turned into a make-up voucher. Refund it or keep the points instead.' }, { status: 400 })
    if (!['1on1', '1on2', '1on4'].includes(slug))
      return NextResponse.json({ error: 'A make-up voucher from here is for 1-on-1, 1-on-2 and 1-on-4 lessons. Refund it or keep the points instead.' }, { status: 400 })
  }

  let rows: any[] = [primary]
  if (isPair) {
    // Every seat of this 1-on-2: the sessions of both halves of an hour, and
    // every row in them in the same state as this one (confirmed with
    // confirmed, an invitation with its invitation). A 1-on-2 session holds
    // two seats, so those are this lesson's -- whichever family they belong
    // to, linked or not (a desk-made pair used to carry no link).
    const sids = new Set<string>([primary.class_session_id])
    if (primary.lesson_group_id) {
      const { data: g } = await svc.from('bookings').select('class_session_id')
        .eq('lesson_group_id', primary.lesson_group_id).neq('status', 'cancelled')
      for (const r of g || []) if (r.class_session_id) sids.add(r.class_session_id)
    }
    const { data: seats } = await svc.from('bookings').select(cols)
      .in('class_session_id', [...sids]).eq('status', primary.status)
    rows = seats && seats.length ? seats : rows
  } else if (primary.lesson_group_id) {
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

  // One 1-on-2 voucher carries both children of ONE family. Checked before
  // anything is cancelled, so a refusal leaves the lesson as it was.
  const pairKids = [...new Set(rows.map(r => r.student_id).filter(Boolean))] as string[]
  if (mode === 'voucher' && isPair) {
    if (new Set(rows.map(r => r.parent_id)).size > 1)
      return NextResponse.json({ error: 'This 1-on-2 is shared by two families, so it cannot become one make-up voucher. Refund it instead (both families get their points back), or keep the points.' }, { status: 400 })
    if (pairKids.length < 2)
      return NextResponse.json({ error: 'Only one swimmer is booked in this 1-on-2, and a 1-on-2 make-up voucher needs two. Refund it or keep the points instead.' }, { status: 400 })
  }

  // An assessment awaiting payment: close the checkout first (see
  // closeTrialCheckout). One that turns out paid is cancelled as paid.
  for (const r of rows) {
    if (r.status !== 'pending_payment' || !r.is_trial) continue
    const res = await closeTrialCheckout(svc, stripe, r.stripe_session_id)
    if (res === 'unknown')
      return NextResponse.json({ error: 'Could not close the Swim Assessment payment page in Stripe, so nothing was cancelled. Try again in a minute.' }, { status: 502 })
    if (res === 'paid') r.status = 'confirmed'
  }
  const wasPaidAssessment = rows.some(r => r.is_trial && r.status === 'confirmed')

  const cancelled: string[] = []
  let refundedTotal = 0
  // Per family: a 1-on-2 can hold two, and each is told what THEY got back.
  const refundedBy = new Map<string, number>()
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
      const got = await refundBookingPoints(svc, {
        booking: r, parentId: r.parent_id, reason: 'cancel_refund', actor: 'admin',
      })
      refundedTotal += got
      refundedBy.set(r.parent_id, (refundedBy.get(r.parent_id) || 0) + got)
    }
  }
  if (cancelled.length === 0)
    return NextResponse.json({ error: 'This booking changed while you were looking at it. Refresh and try again.' }, { status: 409 })

  // A make-up lesson the desk cancels with "refund" gives its voucher back --
  // and the email says so, with its date (found 2026-10-07: a voucher-paid
  // make-up refunds 0 points, so the email said nothing came back at all).
  const back = refund ? await giveBackVouchers(svc, cancelled) : 0
  const backBy = new Map<string, { expires_on: string; usable_from: string | null }>()
  if (back > 0) {
    const { data: vb } = await svc.from('bookings').select('voucher_id').in('id', cancelled).not('voucher_id', 'is', null)
    const vids = [...new Set((vb || []).map((x: any) => x.voucher_id).filter(Boolean))]
    if (vids.length) {
      const { data: vs } = await svc.from('make_up_vouchers').select('parent_id, expires_on, usable_from').in('id', vids).eq('status', 'active')
      for (const v of vs || []) backBy.set((v as any).parent_id, { expires_on: (v as any).expires_on, usable_from: (v as any).usable_from ?? null })
    }
  }

  // Or the lesson becomes a voucher: this swimmer's, or for a 1-on-2 ONE
  // voucher naming both children (checked above to be one family's two).
  let voucherExpires: string | undefined
  if (mode === 'voucher') {
    const { data: s0 } = await svc.from('class_sessions').select('session_date').eq('id', primary.class_session_id).single()
    const halvesGone = new Set(rows.filter(r => cancelled.includes(r.id)).map(r => r.class_session_id)).size
    const r = await issueVoucher(svc, {
      parentId: primary.parent_id, studentId: primary.student_id,
      student2Id: isPair ? pairKids.find(k => k !== primary.student_id) ?? null : null,
      // 60 only when both halves were cancelled here: a 60-minute lesson whose
      // other half was already cancelled used to yield a 60-minute voucher
      // for 30 minutes of lesson (found 2026-10-04). Counted in sessions, so
      // the two seats of a 1-on-2 are not mistaken for two halves.
      courseSlug: slug, minutes: primary.lesson_group_id && halvesGone >= 2 ? 60 : 30,
      reason: 'admin', expiresOn: voucherExpiry(s0?.session_date || getTodayLA()),
      sourceBookingId: primary.id, fixedClassId: primary.fixed_class_id ?? null,
      createdBy: auth.admin.id, note: null, // reason 'admin' + the source lesson already say it; an English sentence showed on the Chinese admin page
    })
    if (!r.voucher) {
      console.error('admin cancel: voucher not issued', r)
      return NextResponse.json({ error: 'The lesson was cancelled but the make-up voucher could not be issued. Issue one from the Make-up vouchers page.' }, { status: 500 })
    }
    voucherExpires = r.voucher.expires_on
  }

  // A session with nobody left in it is closed, so it stops showing as a
  // lesson anywhere. Sessions that still hold another family stay open.
  for (const sid of new Set(rows.map(r => r.class_session_id))) {
    const { count } = await svc.from('bookings').select('id', { count: 'exact', head: true })
      .eq('class_session_id', sid).neq('status', 'cancelled')
    if ((count || 0) === 0) await svc.from('class_sessions').update({ status: 'cancelled' }).eq('id', sid).neq('status', 'cancelled')
  }

  // Every family in the lesson, each with what they got back (both families
  // of a 1-on-2 are told). notifyCancellation sends one email per family,
  // naming each of their swimmers.
  const targets: CancelTarget[] = []
  for (const r of rows) {
    if (!cancelled.includes(r.id) || targets.some(x => x.parent_id === r.parent_id && x.student_id === r.student_id)) continue
    const gotBack = backBy.get(r.parent_id)
    targets.push({
      parent_id: r.parent_id, student_id: r.student_id,
      // "Refund" on a paid Swim Assessment means the school cancelled it: the
      // payment stays owed and the desk books it again (owner, 2026-10-06).
      kind: mode === 'voucher' ? 'voucher'
        : (refundedBy.get(r.parent_id) || 0) > 0 ? 'points'
        : gotBack ? 'voucher'
        : (refund && wasPaidAssessment) ? 'assessment' : 'none',
      voucherExpires: mode === 'voucher' ? voucherExpires : gotBack?.expires_on,
      voucherFrom: mode === 'voucher' ? undefined : gotBack?.usable_from ?? undefined,
      voucherBack: mode !== 'voucher' && !!gotBack,
    })
  }
  await notifyCancellation(svc, { bookingIds: cancelled, targets })

  return NextResponse.json({ ok: true, cancelled: cancelled.length, pointsRefunded: refundedTotal })
}
