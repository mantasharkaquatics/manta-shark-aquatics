import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendEmail } from '@/lib/email'
import { formatTime12h } from '@/lib/date'
import Stripe from 'stripe'
import { syncTrialBooking } from '@/lib/trial-booking'
import { mailRescheduleNotMoved } from '@/lib/bookings/partner-reschedule-mail'
import { requireCron } from '@/lib/cron-auth'
import { getLocations, lessonLocationLine } from '@/lib/locations'

type ExpiryNotice = {
  to: string
  parentName: string
  studentName: string
  courseName: string
  coachName: string
  date: string
  time: string
  location?: string
}

export async function GET(req: NextRequest) {
  const denied = requireCron(req)
  if (denied) return denied

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Find all expired pending_partner bookings
  const now = new Date().toISOString()
  const EXPIRED_STATUSES = ['pending_partner', 'in_cart']
  const { data: expiredCandidates } = await supabase
    .from('bookings')
    .select('id, class_session_id, parent_id, student_id, status, lesson_group_id')
    .in('status', EXPIRED_STATUSES)
    .lt('pending_expires_at', now)

  // Also clean up expired reschedule pendings
  const { data: expiredReschedule } = await supabase
    .from('bookings')
    .select('id, partner_booking_id, pending_new_session_id')
    .in('pending_action', ['reschedule', 'reschedule_initiator'])
    .lt('pending_expires_at', now)

  let reschedulesLapsed = 0
  if ((expiredReschedule || []).length > 0) {
    const rids = (expiredReschedule || []).map((b: any) => b.id)
    // Same condition as the select, re-checked in the write (found
    // 2026-10-05): a reschedule confirmed or re-requested between the two
    // queries must not have its fresh pending fields wiped.
    const { data: lapsed } = await supabase.from('bookings').update({
      pending_action: null,
      pending_new_session_id: null,
      pending_expires_at: null,
    }).in('id', rids)
      .in('pending_action', ['reschedule', 'reschedule_initiator'])
      .lt('pending_expires_at', now)
      .select('id')

    // Both families hear that the request lapsed and the lesson stays put
    // (found 2026-10-07): it used to be cleared in silence, and the family who
    // asked never learned the outcome. One notice per request -- the two rows
    // of a request point at each other -- and only for rows this run cleared.
    const lapsedIds = new Set((lapsed || []).map((r: any) => r.id))
    const done = new Set<string>()
    for (const b of (expiredReschedule || []) as any[]) {
      if (!lapsedIds.has(b.id) || done.has(b.id)) continue
      done.add(b.id)
      if (b.partner_booking_id) done.add(b.partner_booking_id)
      reschedulesLapsed++
      await mailRescheduleNotMoved(supabase, {
        bookingIds: [b.id, b.partner_booking_id].filter(Boolean),
        newSessionId: b.pending_new_session_id,
        outcome: 'expired',
      })
    }
  }

  // Delete FIRST, and only rows that still match the select's condition
  // (found 2026-10-05). The old delete went by id alone, so an invitation the
  // other family confirmed (or a cart checked out) between the select and the
  // delete was deleted as a confirmed, paid lesson. The status + expiry filter
  // makes the delete skip it, and .select() returns what really went, so the
  // expiry emails below go only to families whose invitation actually lapsed.
  // The rows' parent / swimmer / session ids are still in memory, which is all
  // the notices need.
  const candidateIds = (expiredCandidates || []).map((b: any) => b.id)
  let expired: any[] = []
  if (candidateIds.length > 0) {
    const { data: gone, error: delErr } = await supabase.from('bookings').delete()
      .in('id', candidateIds)
      .in('status', EXPIRED_STATUSES)
      .lt('pending_expires_at', now)
      .select('id')
    if (delErr) console.error('cleanup-pending-bookings: delete failed', delErr)
    const goneIds = new Set((gone || []).map((r: any) => r.id))
    expired = (expiredCandidates || []).filter((b: any) => goneIds.has(b.id))
  }
  const deleted = expired.length

  // Work out who to tell from the rows that were deleted (held in memory
  // above). Cart holds are skipped — an abandoned cart is not something to
  // email anyone about.
  const invites = expired.filter((b: any) => b.status === 'pending_partner')
  const notices: ExpiryNotice[] = []

  if (invites.length > 0) {
    try {
      const sessionIds = [...new Set(invites.map((b: any) => b.class_session_id).filter(Boolean))]
      const { data: sessions } = await supabase
        .from('class_sessions')
        .select('id, session_date, start_time, end_time, course_type_id, coach_id, location_id')
        .in('id', sessionIds)
      // The pool list once for every notice; lessonLocationLine gives
      // nothing while only one pool is open to families.
      const allLocations = await getLocations(supabase)
      const sessionById: Record<string, any> = {}
      for (const s of sessions || []) { sessionById[(s as any).id] = s }

      const { data: cts } = await supabase
        .from('course_types').select('id, name')
        .in('id', [...new Set((sessions || []).map((s: any) => s.course_type_id).filter(Boolean))])
      const courseName: Record<string, string> = {}
      for (const c of cts || []) { courseName[(c as any).id] = (c as any).name }

      const { data: coaches } = await supabase
        .from('coaches').select('id, first_name, last_name')
        .in('id', [...new Set((sessions || []).map((s: any) => s.coach_id).filter(Boolean))])
      const coachName: Record<string, string> = {}
      for (const c of coaches || []) {
        coachName[(c as any).id] = ((c as any).first_name + ' ' + ((c as any).last_name || '')).trim()
      }

      const { data: parents } = await supabase
        .from('parents').select('id, first_name, email')
        .in('id', [...new Set(invites.map((b: any) => b.parent_id).filter(Boolean))])
      const parentById: Record<string, any> = {}
      for (const p of parents || []) { parentById[(p as any).id] = p }

      const { data: students } = await supabase
        .from('students').select('id, full_name')
        .in('id', [...new Set(invites.map((b: any) => b.student_id).filter(Boolean))])
      const studentName: Record<string, string> = {}
      for (const s of students || []) { studentName[(s as any).id] = (s as any).full_name }

      // One lesson per key. A 60-minute invitation is four rows sharing a
      // lesson_group_id; an old 30-minute pairing has no group id, but both
      // families sit on the same class_session, so that works as the key.
      const groups = new Map<string, any[]>()
      for (const b of invites) {
        const key = b.lesson_group_id || b.class_session_id
        if (!key) continue
        groups.set(key, [...(groups.get(key) || []), b])
      }

      for (const rows of groups.values()) {
        // Distinct sessions in start order, so an hour reads 9:10 – 10:10
        // rather than one message per half.
        const seen = new Set<string>()
        const sess: any[] = []
        for (const r of rows) {
          const s = sessionById[r.class_session_id]
          if (s && !seen.has(s.id)) { seen.add(s.id); sess.push(s) }
        }
        if (!sess.length) continue
        sess.sort((a, b) => (a.start_time < b.start_time ? -1 : 1))
        const first = sess[0]
        const last = sess[sess.length - 1]
        const timeStr = formatTime12h(first.start_time) + ' \u2013 ' + formatTime12h(last.end_time)

        // One message per family, naming every swimmer of theirs in the lesson.
        const byParent = new Map<string, string[]>()
        for (const r of rows) {
          if (!r.parent_id) continue
          const names = byParent.get(r.parent_id) || []
          const n = studentName[r.student_id]
          if (n && !names.includes(n)) names.push(n)
          byParent.set(r.parent_id, names)
        }

        for (const [parentId, names] of byParent) {
          const p = parentById[parentId]
          if (!p?.email) continue
          notices.push({
            to: p.email,
            parentName: p.first_name,
            studentName: names.join(' & '),
            courseName: courseName[first.course_type_id] || '',
            coachName: coachName[first.coach_id] || '',
            date: first.session_date,
            time: timeStr,
            location: await lessonLocationLine(supabase, first.location_id, allLocations),
          })
        }
      }
    } catch (err) {
      // Notification is a courtesy; never let it stop the cleanup below.
      console.error('cleanup-pending-bookings: could not build expiry notices', err)
    }
  }

  // Deletion is done and committed; emails are best effort from here.
  let notified = 0
  for (const n of notices) {
    try {
      const ok = await sendEmail({ type: 'partner_invite_expired', ...n })
      if (ok) notified++
    } catch (err) {
      console.error('cleanup-pending-bookings: expiry email failed', err)
    }
  }

  // Swim Assessments whose payment hold has run out. Normally Stripe's
  // expired webhook (or the family's own dashboard) releases these; this is
  // the backstop so an unpaid hold never keeps a coach's slot for good.
  // Held ones stamped before the hold time existed are caught by age.
  let trialsReleased = 0, trialsConfirmed = 0
  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2026-05-27.dahlia' as any })
    const oldCutoff = new Date(Date.now() - 35 * 60 * 1000).toISOString()
    const { data: stale } = await supabase
      .from('bookings')
      .select('id, status, stripe_session_id, class_session_id, pending_expires_at')
      .eq('status', 'pending_payment').eq('is_trial', true)
      .or(`pending_expires_at.lt.${now},and(pending_expires_at.is.null,created_at.lt.${oldCutoff})`)
      .limit(50)
    for (const b of stale || []) {
      try {
        const r = await syncTrialBooking(supabase, stripe, b as any)
        if (r.state === 'released') trialsReleased++
        if (r.state === 'confirmed') trialsConfirmed++
      } catch (err) {
        console.error('cleanup-pending-bookings: trial sync failed', (b as any).id, err)
      }
    }
  } catch (err) {
    console.error('cleanup-pending-bookings: trial sweep failed', err)
  }

  return NextResponse.json({ deleted, checked: candidateIds.length, notified, reschedulesLapsed, trialsReleased, trialsConfirmed })
}
