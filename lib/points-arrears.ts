// What happens after a payment we already credited turns out not to have been
// paid: a bank return, or a dispute raised with the customer's bank.
//
// Taking the points back is lib/points-wallet's job. This file is the part
// after that -- the family's balance is negative, and lessons they have not
// swum yet are sitting on coaches' calendars, paid for with money that never
// arrived. Releasing those lessons is both the fair thing (they get the points
// back, which pays down the debt) and the effective thing: the pressure to
// settle is that next week's lesson is gone, not a letter.
//
// Deliberately not automatic beyond this. A family two lessons into a package
// still owes those two lessons; that remainder stays as a negative balance for
// a human to chase.

import { arrears, getWallet } from '@/lib/points-wallet'
import { cancelLesson } from '@/lib/bookings/cancel'

type Svc = any

export type ReclaimResult = {
  /** Points owed before anything was released. */
  arrearsBefore: number
  /** Points owed after -- zero if the released lessons covered the debt. */
  arrearsAfter: number
  cancelledBookingIds: string[]
  /** Whole lessons released: an hour is two rows, a sibling 1-on-2 two seats. */
  lessonsReleased: number
  pointsReturned: number
}

/** Today in the school's timezone, as YYYY-MM-DD. Lessons are dated, not timestamped. */
function todayLA(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date())
}

/**
 * Release the family's unswum lessons and put their points back, up to the
 * amount owed. Soonest lessons are kept and the furthest-out ones released
 * first, so a family who settles quickly loses as little of next week as
 * possible.
 *
 * Never touches a lesson that has already been checked in: the coach was
 * there, so it was delivered whatever happened to the payment.
 *
 * Whole lessons only, through the same cancelLesson the rest of the site uses
 * (found 2026-10-05). This used to cancel booking rows one at a time, so it
 * could release one half of a 60-minute lesson or one seat of a sibling
 * 1-on-2 and leave the coach holding the rest. It also counted today's
 * lessons as releasable -- one starting in an hour could vanish -- so only
 * lessons from tomorrow (LA) on are released now.
 *
 * A 1-on-2 shared with another family is skipped. Releasing it would cancel
 * that family's lesson for a debt that is not theirs; it stays for a person.
 */
export async function reclaimForArrears(
  svc: Svc,
  parentId: string,
  note: string,
): Promise<ReclaimResult> {
  const wallet = await getWallet(svc, parentId)
  const owedAtStart = arrears(wallet)
  const empty: ReclaimResult = {
    arrearsBefore: owedAtStart, arrearsAfter: owedAtStart,
    cancelledBookingIds: [], lessonsReleased: 0, pointsReturned: 0,
  }
  if (owedAtStart === 0) return empty

  const { data: bookings } = await svc
    .from('bookings')
    .select('id, class_session_id, lesson_group_id, points_charged, points_refunded, status')
    .eq('parent_id', parentId)
    .eq('status', 'confirmed')
    .not('points_charged', 'is', null)
  if (!bookings || bookings.length === 0) return empty

  // Two steps rather than a nested join: nested joins have been unreliable in
  // production here, and this one decides whether a lesson gets cancelled.
  const sessionIds = [...new Set(bookings.map((b: any) => b.class_session_id).filter(Boolean))]
  const { data: sessions } = await svc
    .from('class_sessions')
    .select('id, session_date, start_time, coach_id, course_type_id')
    .in('id', sessionIds)
    .gt('session_date', todayLA())
  const futureById = new Map((sessions || []).map((s: any) => [s.id, s]))

  const { data: attended } = await svc
    .from('attendance')
    .select('booking_id')
    .in('booking_id', bookings.map((b: any) => b.id))
  const checkedIn = new Set((attended || []).map((a: any) => a.booking_id))

  const ctIds = [...new Set((sessions || []).map((s: any) => s.course_type_id).filter(Boolean))]
  const { data: cts } = ctIds.length
    ? await svc.from('course_types').select('id, slug').in('id', ctIds)
    : { data: [] as any[] }
  const slugOf = new Map((cts || []).map((c: any) => [c.id, c.slug]))

  // One lesson per key: the rows of an hour share lesson_group_id; the seats
  // of a 30-minute sibling 1-on-2 share the class_session.
  const lessons = new Map<string, any[]>()
  for (const b of bookings) {
    const key = b.lesson_group_id || b.class_session_id
    if (!key) continue
    lessons.set(key, [...(lessons.get(key) || []), b])
  }

  type Lesson = { rows: any[]; sess: any[] }
  const releasable: Lesson[] = []
  for (const rows of lessons.values()) {
    const sess = rows.map((r: any) => futureById.get(r.class_session_id))
    // Every part of the lesson must be in the future and none checked in;
    // anything else is not a whole unswum lesson.
    if (sess.some((s: any) => !s) || rows.some((r: any) => checkedIn.has(r.id))) continue
    const owedBack = rows.reduce((a: number, r: any) => a + (r.points_charged ?? 0) - (r.points_refunded ?? 0), 0)
    if (owedBack <= 0) continue
    releasable.push({ rows, sess })
  }
  releasable.sort((a, b) => {
    const at = (l: Lesson) => l.sess.map((s: any) => `${s.session_date} ${String(s.start_time).slice(0, 5)}`).sort()[0]
    return at(b).localeCompare(at(a))
  })

  const cancelledBookingIds: string[] = []
  let lessonsReleased = 0
  let pointsReturned = 0
  let owed = owedAtStart

  for (const lesson of releasable) {
    if (owed <= 0) break

    // Another family on the same 1-on-2 slot? cancelBookingWithPartner would
    // take their seat down too. Skip it.
    const shared = lesson.sess.filter((s: any) => slugOf.get(s.course_type_id) === '1on2')
    let crossFamily = false
    for (const s of shared) {
      const { data: same } = await svc.from('class_sessions').select('id')
        .eq('session_date', s.session_date).eq('start_time', s.start_time).eq('coach_id', s.coach_id)
      const ids = (same || []).map((x: any) => x.id)
      if (ids.length === 0) continue
      const { data: others } = await svc.from('bookings').select('id')
        .in('class_session_id', ids).neq('parent_id', parentId)
        .not('status', 'in', '("cancelled","pending_payment","in_cart")')
        .limit(1)
      if (others && others.length > 0) { crossFamily = true; break }
    }
    if (crossFamily) continue

    // A system cancel (callerParentId null) always refunds, sweeps both halves
    // of an hour and both seats of a sibling 1-on-2. The family's email about
    // this comes from the caller (payment_reversed), so cancelLesson's own
    // booking_cancelled email is suppressed. A 1-on-4 has no seat cascade, so
    // any row of the family's not swept by the first call gets its own.
    let released = false
    for (const r of lesson.rows) {
      if (cancelledBookingIds.includes(r.id)) continue
      const res = await cancelLesson(svc, r.id, null, { skipEmail: true })
      const mine = (res.cancelledBookingIds || []).filter((id: string) => !cancelledBookingIds.includes(id))
      cancelledBookingIds.push(...mine)
      pointsReturned += res.pointsRefunded ?? 0
      if (mine.length > 0) released = true
      if (!res.ok) console.error(`reclaimForArrears: booking ${r.id} not fully released (${res.status} ${res.error ?? ''}) -- ${note}`)
    }
    if (!released) continue
    lessonsReleased++

    // cancelLesson labels its rows as a parent's cancellation; this one was
    // the school's, as it always was on this path.
    await svc.from('bookings')
      .update({ cancellation_reason: 'cancelled_by_school', cancelled_by: 'system' })
      .in('id', cancelledBookingIds).eq('parent_id', parentId).eq('status', 'cancelled')

    // Granted points come back as granted and do not pay down the debt, so
    // read what is still owed rather than adding it up.
    owed = arrears(await getWallet(svc, parentId))
  }

  const after = await getWallet(svc, parentId)
  return {
    arrearsBefore: owedAtStart,
    arrearsAfter: arrears(after),
    cancelledBookingIds,
    lessonsReleased,
    pointsReturned,
  }
}
