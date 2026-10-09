import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'
import { sendEmail } from '@/lib/email'
import { formatTime12h, getTodayLA, getNowMinutesLA } from '@/lib/date'
import { refundBookingPoints } from '@/lib/bookings/refund'
import { giveBackVouchers } from '@/lib/vouchers'
import Stripe from 'stripe'
import { closeTrialCheckout } from '@/lib/trial-booking'
import { reopenReversedAssessment } from '@/lib/assessments'
import { getEffectiveZones } from '@/lib/zones'
import { getLocations, lessonLocationLine } from '@/lib/locations'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2026-05-27.dahlia' as any })

// pending_partner is a 1-on-2 invitation the other family has not answered.
// Left out, it could still be accepted after the time off was handled, which
// booked and charged both families for a lesson the coach is not there for
// (found 2026-10-07). It is cancelled with the rest; nothing was charged yet.
const AFFECTED = 'status.eq.confirmed,status.eq.pending_partner,and(status.eq.pending_payment,is_trial.eq.true),and(status.eq.cancelled,cancellation_reason.eq.coach_time_off)'
// An invitation past its 15 minutes is dead already; the cleanup cron closes it.
const live = (b: any) => b.status !== 'pending_partner' || (!!b.pending_expires_at && new Date(b.pending_expires_at) > new Date())

const toM = (t: string) => { const [h, m] = String(t).slice(0, 5).split(':').map(Number); return h * 60 + m }

// Find sessions and bookings overlapping the block range (confirmed + cancelled-by-leave, for history).
// A Swim Assessment still waiting for payment is included too: it was invisible
// here, so it was never cancelled, and paying for it afterwards put a paid
// assessment inside the coach's time off (found 2026-10-07).
async function getAffected(svc: any, block: any) {
  const { data: sessions } = await svc
    .from('class_sessions')
    .select('id, session_date, start_time, end_time, course_type_id, status, location_id')
    .eq('coach_id', block.coach_id)
    .eq('session_date', block.date)
  const overlapped = (sessions || []).filter((s: any) => {
    if (block.start_time == null || block.end_time == null) return true
    return toM(s.start_time) < toM(block.end_time) && toM(s.end_time) > toM(block.start_time)
  })
  if (!overlapped.length) return { sessions: [], bookings: [] }
  const ids = overlapped.map((s: any) => s.id)
  const COLS = 'id, class_session_id, parent_id, student_id, status, points_charged, points_refunded, block_notice_sent_at, cancellation_reason, lesson_group_id, voucher_id, is_trial, stripe_session_id, pending_expires_at, pending_action'
  const { data: bookings } = await svc
    .from('bookings')
    .select(COLS)
    .in('class_session_id', ids)
    .or(AFFECTED)
  // A 60-minute lesson is two linked halves. Time off covering only one of
  // them used to cancel and refund that half and leave the other booked
  // (found 2026-10-03): the lesson goes as a whole.
  let all: any[] = (bookings || []).filter(live)
  const groups = [...new Set(all.map((b: any) => b.lesson_group_id).filter(Boolean))]
  if (groups.length) {
    const { data: more } = await svc.from('bookings').select(COLS)
      .in('lesson_group_id', groups)
      .or(AFFECTED)
    const seen = new Set(all.map((b: any) => b.id))
    const extra = (more || []).filter((b: any) => !seen.has(b.id) && live(b))
    if (extra.length) {
      all = all.concat(extra)
      const missing = [...new Set(extra.map((b: any) => b.class_session_id))].filter(id => !ids.includes(id))
      if (missing.length) {
        const { data: ms } = await svc.from('class_sessions')
          .select('id, session_date, start_time, end_time, course_type_id, status, location_id').in('id', missing)
        overlapped.push(...(ms || []))
      }
    }
  }
  return { sessions: overlapped, bookings: all }
}

/* Swim Team practices the time off covers. A practice is a 'team' zone of the
   coach's day (date rows replace the weekly ones, as everywhere), not a
   session with bookings, so the lesson list above never showed it: the page
   said "no affected lessons" over a practice nobody would be at (found
   2026-10-08). Owner, 2026-10-08: list it, with the team's current members,
   so the desk finds a substitute coach -- no email to the families and no
   change to their monthly fee. Read-only, best effort: a failed read leaves
   the list without it rather than failing the lessons. */
async function teamPractices(svc: any, block: any) {
  try {
    const eff = await getEffectiveZones(svc, block.coach_id, block.date)
    const rows = eff.rows.filter(r => r.zone_type === 'team' && (block.start_time == null || block.end_time == null
      || (toM(r.start_time) < toM(block.end_time) && toM(r.end_time) > toM(block.start_time))))
    if (rows.length === 0) return []
    const tierIds = [...new Set(rows.map(r => r.team_tier_id).filter(Boolean))] as string[]
    const [{ data: tiers }, { data: members }] = await Promise.all([
      tierIds.length ? svc.from('team_tiers').select('id, name').in('id', tierIds) : Promise.resolve({ data: [] }),
      tierIds.length ? svc.from('team_memberships').select('team_tier_id, student_id')
        .in('team_tier_id', tierIds).in('status', ['active', 'past_due'])
        .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`) : Promise.resolve({ data: [] }),
    ])
    const tierName = new Map((tiers || []).map((x: any) => [x.id, x.name]))
    // Two steps rather than an embed: names by id.
    const sIds = [...new Set((members || []).map((m: any) => m.student_id).filter(Boolean))] as string[]
    const { data: studs } = sIds.length ? await svc.from('students').select('id, full_name').in('id', sIds) : { data: [] }
    const sName = new Map((studs || []).map((x: any) => [x.id, x.full_name]))
    return rows.map(r => {
      const mine = (members || []).filter((m: any) => m.team_tier_id === r.team_tier_id)
      const names = [...new Set(mine.map((m: any) => sName.get(m.student_id)).filter(Boolean))] as string[]
      return {
        team_tier_id: r.team_tier_id,
        team_name: tierName.get(r.team_tier_id) || '',
        time: `${formatTime12h(r.start_time)} \u2013 ${formatTime12h(r.end_time)}`,
        members: names.sort(),
      }
    })
  } catch (e) {
    console.error('time-off impact: team practices not read:', e instanceof Error ? e.message : e)
    return []
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const svc = auth.svc

  const body = await req.json().catch(() => null)
  const { action, block_id } = body || {}
  if (!action || !block_id) return NextResponse.json({ error: 'Missing action or block_id' }, { status: 400 })

  const { data: block } = await svc
    .from('coach_time_off')
    .select('id, coach_id, date, start_time, end_time, block_type')
    .eq('id', block_id)
    .single()
  if (!block) return NextResponse.json({ error: 'Block not found' }, { status: 404 })

  const { sessions, bookings } = await getAffected(svc, block)
  const sessMap = new Map(sessions.map((s: any) => [s.id, s]))

  // A lesson that has ended, or where the swimmer checked in, was delivered:
  // "cancel & refund" used to cancel and refund it anyway (found 2026-10-04).
  // Same rule as cancel-session / cancel-booking, applied per swimmer-lesson so
  // both halves of a 60-minute lesson stay together.
  const lessonKey = (b: any) => `${b.lesson_group_id || b.class_session_id}|${b.student_id}`
  const today = getTodayLA()
  const nowMin = getNowMinutesLA()
  const hasEnded = (s: any) => !!s && (s.session_date < today || (s.session_date === today && !!s.end_time && toM(s.end_time) <= nowMin))
  const { data: attended } = bookings.length
    ? await svc.from('attendance').select('booking_id').in('booking_id', bookings.map((b: any) => b.id))
    : { data: [] }
  const attendedIds = new Set((attended || []).map((a: any) => a.booking_id))
  // A lesson the family was already emailed about as cancelled (the old
  // two-step flow sent the email first) is not "delivered" just because its
  // time passed: the clock used to lock it out of the cancel, so the points
  // the email promised could never come back as purchased points (found
  // 2026-10-07). Only a check-in proves it happened. Only a lesson still
  // booked counts: an old cancelled row with a notice must not lift the clock
  // off a later booking of the same swimmer in the same session.
  const noticed = new Set(bookings.filter((b: any) => b.status === 'confirmed' && b.block_notice_sent_at).map(lessonKey))
  const delivered = new Set<string>()
  for (const b of bookings) {
    const k = lessonKey(b)
    if (attendedIds.has(b.id) || (hasEnded(sessMap.get(b.class_session_id)) && !noticed.has(k))) delivered.add(k)
  }

  // Two-step queries: students / parents / course_types
  const stuIds = [...new Set(bookings.map((b: any) => b.student_id).filter(Boolean))]
  const parIds = [...new Set(bookings.map((b: any) => b.parent_id).filter(Boolean))]
  const ctIds = [...new Set(sessions.map((s: any) => s.course_type_id).filter(Boolean))]
  const [{ data: stus }, { data: pars }, { data: cts }, { data: coach }] = await Promise.all([
    stuIds.length ? svc.from('students').select('id, full_name, trial_used_at').in('id', stuIds) : Promise.resolve({ data: [] }),
    parIds.length ? svc.from('parents').select('id, first_name, last_name, email').in('id', parIds) : Promise.resolve({ data: [] }),
    ctIds.length ? svc.from('course_types').select('id, name').in('id', ctIds) : Promise.resolve({ data: [] }),
    svc.from('coaches').select('first_name, last_name').eq('id', block.coach_id).single(),
  ])
  const stuMap = new Map((stus || []).map((x: any) => [x.id, x]))
  const parMap = new Map((pars || []).map((x: any) => [x.id, x]))
  const ctMap = new Map((cts || []).map((x: any) => [x.id, x]))
  const coachName = coach ? (coach.first_name + ' ' + (coach.last_name || '')).trim() : ''

  // Sorted on sort_key (raw date + 24-hour start): sorting the formatted
  // 12-hour text put "1:00 PM" before "9:00 AM" (found 2026-10-04).
  const items = bookings.map((b: any) => {
    const s: any = sessMap.get(b.class_session_id)
    const stu: any = stuMap.get(b.student_id)
    const par: any = parMap.get(b.parent_id)
    return {
      booking_id: b.id,
      lesson_key: lessonKey(b),
      delivered: delivered.has(lessonKey(b)),
      sort_key: s ? `${s.session_date} ${String(s.start_time).slice(0, 5)}` : '',
      status: b.status,
      notice_sent_at: b.block_notice_sent_at,
      student_name: stu?.full_name || '',
      parent_name: par ? `${par.first_name} ${par.last_name || ''}`.trim() : '',
      course_name: (ctMap.get(s?.course_type_id) as any)?.name || '',
      course_type_id: s?.course_type_id || null,
      date: s?.session_date || '',
      time: s ? `${formatTime12h(s.start_time)} \u2013 ${formatTime12h(s.end_time)}` : '',
    }
  }).sort((a: any, b: any) => a.sort_key.localeCompare(b.sort_key))

  if (action === 'list') {
    return NextResponse.json({ items, team: await teamPractices(svc, block) })
  }

  // "Notify" and "cancel & refund" were two buttons. Between them the family
  // had an email saying the lesson was cancelled while the booking stayed
  // confirmed: the day-before SMS still went out, a parent cancelling it spent
  // their monthly grace, and once the lesson time passed it could not be
  // refunded at all (found 2026-10-07). They are one action now (owner,
  // 2026-10-07): cancel and return what was paid first, then email. An old
  // page still offering the two buttons is told to reload instead of
  // half-doing either.
  if (action === 'notify' || action === 'cancel') {
    return NextResponse.json({ error: 'This page is out of date. Reload it: cancelling and notifying are now one step.' }, { status: 409 })
  }

  if (action === 'cancel_notify') {
    const outstanding = bookings.filter((b: any) =>
      (b.status === 'confirmed' || b.status === 'pending_partner' || (b.status === 'pending_payment' && b.is_trial)) && !delivered.has(lessonKey(b)))

    // An assessment still waiting for payment: close its Stripe checkout
    // before the hold goes, so it cannot be paid for a lesson that is not
    // happening. One paid a moment ago is now a confirmed, paid assessment and
    // is cancelled as one (it stays owed). If Stripe cannot be asked, nothing
    // is cancelled -- same rule as cancel-session.
    for (const b of outstanding) {
      if (b.status !== 'pending_payment') continue
      const r = await closeTrialCheckout(svc, stripe, b.stripe_session_id)
      if (r === 'unknown')
        return NextResponse.json({ error: 'Could not close a Swim Assessment payment page in Stripe, so nothing was cancelled. Try again in a minute.' }, { status: 502 })
      if (r === 'paid') {
        b.status = 'confirmed'
        const st: any = stuMap.get(b.student_id)
        if (st) st.trial_used_at = st.trial_used_at || new Date().toISOString()
      }
    }

    let cancelled = 0
    const touchedSessions = new Set<string>()
    // The invited family's seat of an unanswered 1-on-2 invitation: they never
    // took the lesson, so they get no "your lesson is cancelled" email (the
    // invitation simply goes from their dashboard). The inviting family does.
    const quietIds: string[] = []
    for (const b of outstanding) {
      const from = b.status
      // claim: only the side that flips the row to cancelled refunds the credit (prevents concurrent double refunds)
      const { data: c } = await svc
        .from('bookings')
        .update({
          status: 'cancelled',
          pending_action: null,
          cancellation_reason: 'coach_time_off',
          cancelled_by: 'admin',
          cancelled_at: new Date().toISOString(),
        })
        .eq('id', b.id)
        .eq('status', from)
        .select('id')
      if (!c || c.length === 0) continue
      b.status = 'cancelled'
      b.cancellation_reason = 'coach_time_off'
      touchedSessions.add(b.class_session_id)
      cancelled++
      if (from === 'pending_partner' && b.pending_action === 'confirm') quietIds.push(b.id)
      // An unpaid hold or an unanswered invitation took nothing, so there is
      // nothing to give back.
      if (from !== 'confirmed') continue
      // Coach time-off is a school-side cancellation: full points back, no
      // allowance spent, however close to the lesson it happens. A paid Swim
      // Assessment has no points: it stays owed and shows on the admin
      // Reviews page until the desk books it again.
      const back = await refundBookingPoints(svc, {
        booking: b, parentId: b.parent_id, reason: 'school_cancel',
        actor: 'admin', note: 'Coach unavailable',
      })
      b.points_refunded = (Number(b.points_refunded) || 0) + back
      // A make-up lesson cost a voucher, not points: that comes back instead.
      await giveBackVouchers(svc, [b.id])
    }
    // A cancelled Swim Assessment whose payment was refunded in full or
    // charged back is not owed: clear "assessment used" so the family can pay
    // again on the site, and the email below does not say the payment is kept
    // (owner, 2026-10-08).
    for (const b of outstanding) {
      if (!b.is_trial || b.status !== 'cancelled') continue
      const st: any = stuMap.get(b.student_id)
      if (st?.trial_used_at && await reopenReversedAssessment(svc, b.student_id)) st.trial_used_at = null
    }
    // If the session has no remaining active bookings → mark cancelled (enrolled_count handled by trigger)
    for (const sid of touchedSessions) {
      const { data: remain } = await svc
        .from('bookings')
        .select('id')
        .eq('class_session_id', sid)
        .neq('status', 'cancelled')
        .limit(1)
      if (!remain || remain.length === 0) {
        await svc.from('class_sessions').update({ status: 'cancelled' }).eq('id', sid).neq('status', 'cancelled')
      }
    }

    // Then the email, to every family whose lesson is cancelled for this time
    // off and has not been told yet -- just now, or on an earlier press whose
    // email failed (pressing again retries it). A lesson emailed under the old
    // two-step flow already has its notice and is not emailed twice.
    if (quietIds.length) {
      const stamp = new Date().toISOString()
      await svc.from('bookings').update({ block_notice_sent_at: stamp }).in('id', quietIds).is('block_notice_sent_at', null)
      for (const b of bookings) if (quietIds.includes(b.id)) b.block_notice_sent_at = stamp
    }
    const toTell = bookings.filter((b: any) => b.status === 'cancelled' && b.cancellation_reason === 'coach_time_off' && !b.block_notice_sent_at)
    let sent = 0
    let failed = 0
    let refundPending = 0
    // One email per family per lesson: a 60-minute lesson's two halves and a
    // sibling pair's two seats used to send two (found 2026-10-03).
    const byLesson = new Map<string, any[]>()
    for (const b of toTell) {
      const k = `${b.parent_id}|${b.lesson_group_id || b.class_session_id}`
      byLesson.set(k, [...(byLesson.get(k) || []), b])
    }
    // The pool list once for every email; no line while one pool is open.
    const allLocations = byLesson.size ? await getLocations(svc) : []
    for (const rows of byLesson.values()) {
      const sorted = [...rows].sort((x: any, y: any) => String((sessMap.get(x.class_session_id) as any)?.start_time || '').localeCompare(String((sessMap.get(y.class_session_id) as any)?.start_time || '')))
      const b = sorted[0]
      const s: any = sessMap.get(b.class_session_id)
      const sLast: any = sessMap.get(sorted[sorted.length - 1].class_session_id) || s
      const par: any = parMap.get(b.parent_id)
      const names = [...new Set(rows.map((r: any) => (stuMap.get(r.student_id) as any)?.full_name).filter(Boolean))]
      if (!s || !par?.email) { failed++; continue }
      // The email says the points are back. When the wallet write failed they
      // are not, and the lesson waits in Reviews ("refund not finished"); the
      // email goes on a later press, once the desk has retried the refund
      // there (found 2026-10-07).
      if (rows.some((r: any) => (Number(r.points_charged) || 0) > (Number(r.points_refunded) || 0))) { refundPending++; continue }
      // Claim the notice first, so two presses at once cannot both email.
      const ids = rows.map((r: any) => r.id)
      const { data: claimed } = await svc.from('bookings')
        .update({ block_notice_sent_at: new Date().toISOString() })
        .in('id', ids).is('block_notice_sent_at', null).select('id')
      if (!claimed || claimed.length === 0) continue
      // A make-up was paid with a voucher, which comes back -- not points.
      // A paid Swim Assessment stays owed: the desk books a new time. An
      // assessment that was never paid for had nothing to return. "Paid" is
      // read from the swimmer (trial_used_at, the same rule the Reviews
      // rebook card uses), not from this request: a retried email for an
      // earlier press used to call an unpaid hold "paid, we will rebook".
      const kind = rows.some((r: any) => r.points_charged) ? 'points'
        : rows.some((r: any) => r.voucher_id) ? 'voucher'
        : rows.some((r: any) => r.is_trial && (stuMap.get(r.student_id) as any)?.trial_used_at) ? 'assessment'
        : 'none'
      const ok = await sendEmail({
        type: 'block_cancellation_notice',
        refundKind: kind,
        to: par.email,
        parentName: par.first_name,
        studentName: names.join(' & '),
        courseName: (ctMap.get(s.course_type_id) as any)?.name || '',
        coachName,
        date: s.session_date,
        time: `${formatTime12h(s.start_time)} – ${formatTime12h(sLast.end_time)}`,
        location: await lessonLocationLine(svc, s.location_id, allLocations),
      })
      if (ok) {
        sent++
      } else {
        // Hand the notice back so the next press tries the email again.
        await svc.from('bookings').update({ block_notice_sent_at: null }).in('id', claimed.map((r: any) => r.id))
        failed++
      }
    }
    if (cancelled === 0 && sent === 0 && failed === 0 && refundPending === 0)
      return NextResponse.json({ error: 'Nothing left to cancel or notify for this time off.' }, { status: 400 })
    return NextResponse.json({ ok: true, cancelled, sent, failed, refundPending })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
