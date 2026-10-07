// Make-up vouchers (補課券) -- docs/fixed-class-spec.md, sections 2 and 3.
//
// A voucher is one lesson of one course type, owed to a family because they
// gave notice. It is not points and never turns into points: it books one
// lesson of the same kind (1-on-1 30 or 60, sibling 1-on-2, 1-on-4) without a
// charge, and if it is not used within four weeks of the missed lesson it is
// gone. The lesson it replaced stays paid for.
//
// Where they come from:
//   leave        a fixed-class lesson cancelled 24 hours or more ahead
//   grace        any lesson cancelled inside 24 hours, using that child's one
//                grace of the month (LA calendar month)
//   admin        issued by the front desk
//   end_of_term  the front desk ended a fixed class and turned what was left
//                into vouchers
//   moved        a fixed class changed slot and a lesson could not be placed
//                on the new one, nor with another coach (lib/fixed-move)
//
// The database does the counting that must not race: one grace voucher per
// child per month, one voucher per missed lesson (two unique indexes). The
// grace index covered only student_id, so the second child of a sibling
// 1-on-2 (student2_id) could get a second grace from two simultaneous cancels;
// docs/migration-grace-both-children.sql adds a trigger that covers both
// children and fails with the same 23505 issueVoucher reads as `duplicate`
// (found 2026-10-07).
//
// When (owner, 2026-10-02): a LEAVE voucher is for a make-up within 14 days
// either side of the missed lesson (usable_from .. expires_on), so a family
// who takes leave for a week months away cannot spend it next week. Every
// other voucher is usable at once and lasts four weeks. A make-up cancelled in
// time gives the voucher back with its dates -- stretched once to 7 days from
// the cancellation when fewer are left (restoreVoucher).

import type { SupabaseClient } from '@supabase/supabase-js'
import { getTodayLA } from '@/lib/date'

type Svc = SupabaseClient

export const VOUCHER_DAYS = 28
export const VOUCHER_REMIND_DAYS = 7
/** A leave voucher: this many days either side of the missed lesson. */
export const LEAVE_WINDOW_DAYS = 14
/** A returned voucher with fewer days than this left is stretched to it, once. */
export const RETURN_MIN_DAYS = 7

export type VoucherReason = 'leave' | 'grace' | 'admin' | 'end_of_term' | 'moved'
export type Voucher = {
  id: string
  parent_id: string
  student_id: string
  student2_id: string | null
  course_slug: '1on1' | '1on2' | '1on4'
  minutes: 30 | 60
  reason: VoucherReason
  grace_month: string | null
  status: 'active' | 'used' | 'expired' | 'void'
  expires_on: string
  /** First date a make-up may be on (leave vouchers); null = at once. */
  usable_from: string | null
  extended_at: string | null
  source_booking_id: string | null
  fixed_class_id: string | null
  used_booking_id: string | null
  created_at: string
}

/** YYYY-MM-DD plus n days, on the calendar (no time zone involved). */
export function addDaysStr(d: string, n: number): string {
  const x = new Date(d + 'T12:00:00Z')
  x.setUTCDate(x.getUTCDate() + n)
  return x.toISOString().slice(0, 10)
}

/** The 1st of the LA month a date falls in. */
export function monthOfDate(d: string): string {
  return d.slice(0, 8) + '01'
}

/** Four weeks from the lesson that was missed. */
export function voucherExpiry(sessionDate: string): string {
  return addDaysStr(sessionDate, VOUCHER_DAYS)
}

/** The dates a new voucher covers: a leave voucher the 14 days either side of
 *  the missed lesson, anything else from now until four weeks after it. */
export function voucherWindow(reason: VoucherReason, sessionDate: string): { expiresOn: string; usableFrom: string | null } {
  return reason === 'leave'
    ? { expiresOn: addDaysStr(sessionDate, LEAVE_WINDOW_DAYS), usableFrom: addDaysStr(sessionDate, -LEAVE_WINDOW_DAYS) }
    : { expiresOn: voucherExpiry(sessionDate), usableFrom: null }
}

/** Can a make-up on this date use this voucher? */
export function voucherFitsDate(v: { expires_on: string; usable_from?: string | null }, date: string): boolean {
  return date <= v.expires_on && (!v.usable_from || date >= v.usable_from)
}

/** Which children have already used this month's grace. */
export async function graceUsedThisMonth(svc: Svc, studentIds: string[], today: string = getTodayLA()): Promise<Set<string>> {
  if (studentIds.length === 0) return new Set()
  // A sibling 1-on-2's grace voucher names both children and uses both
  // children's grace (owner, 2026-10-03), so the second child counts too.
  const ids = studentIds.filter(id => /^[0-9a-f-]{36}$/i.test(id))
  if (ids.length === 0) return new Set()
  const list = ids.join(',')
  const { data } = await svc.from('make_up_vouchers')
    .select('student_id, student2_id').eq('grace_month', monthOfDate(today))
    .or(`student_id.in.(${list}),student2_id.in.(${list})`)
  const want = new Set(ids)
  const out = new Set<string>()
  for (const r of data || []) for (const s of [r.student_id, r.student2_id]) if (s && want.has(s)) out.add(s)
  return out
}

export type IssueInput = {
  parentId: string
  studentId: string
  student2Id?: string | null
  courseSlug: string
  minutes: number
  reason: VoucherReason
  expiresOn: string
  usableFrom?: string | null
  sourceBookingId?: string | null
  fixedClassId?: string | null
  createdBy?: string | null
  note?: string | null
  today?: string
}

/**
 * Write one voucher. Returns it, or `{ duplicate: true }` when the database
 * refused it as a second grace this month or a second voucher for the same
 * lesson -- the two things that must never happen twice.
 */
export async function issueVoucher(svc: Svc, v: IssueInput): Promise<{ voucher?: Voucher; duplicate?: boolean; error?: string }> {
  if (!['1on1', '1on2', '1on4'].includes(v.courseSlug)) return { error: 'This course has no make-up voucher.' }
  const minutes = v.minutes === 60 ? 60 : 30
  const row = {
    parent_id: v.parentId, student_id: v.studentId, student2_id: v.student2Id ?? null,
    course_slug: v.courseSlug, minutes, reason: v.reason,
    grace_month: v.reason === 'grace' ? monthOfDate(v.today || getTodayLA()) : null,
    expires_on: v.expiresOn,
    usable_from: v.usableFrom ?? null,
    source_booking_id: v.sourceBookingId ?? null, fixed_class_id: v.fixedClassId ?? null,
    created_by: v.createdBy ?? null, note: v.note ?? null,
  }
  const { data, error } = await svc.from('make_up_vouchers').insert(row).select('*').single()
  if (error) {
    if ((error as any).code === '23505') return { duplicate: true }
    console.error('voucher insert failed:', error)
    return { error: error.message }
  }
  return { voucher: data as Voucher }
}

/** A make-up lesson cancelled in time gives its voucher back, expiry unchanged.
 *  Either half of a make-up hour may be the one cancelled first, so this keys
 *  on the voucher, not on which booking row it was attached to. */
export async function restoreVoucher(svc: Svc, voucherId: string, _bookingId?: string, today: string = getTodayLA()): Promise<boolean> {
  const { data } = await svc.from('make_up_vouchers')
    .update({ status: 'active', used_booking_id: null, used_at: null })
    .eq('id', voucherId).eq('status', 'used')
    .select('id, expires_on, extended_at')
  if (!data || data.length === 0) return false
  // Back with only a day or two left would be a voucher in name only: it is
  // stretched to a week from today, once per voucher, so a family can change
  // a make-up once without losing it -- but not keep pushing it along.
  const v = data[0] as { expires_on: string; extended_at: string | null }
  const floor = addDaysStr(today, RETURN_MIN_DAYS)
  if (!v.extended_at && v.expires_on < floor) {
    await svc.from('make_up_vouchers')
      .update({ expires_on: floor, extended_at: new Date().toISOString(), reminded_at: null })
      .eq('id', voucherId).is('extended_at', null)
  }
  return true
}

/**
 * Take a voucher for a booking that is about to be written. Conditional on it
 * still being active and unexpired, so two tabs cannot spend it twice. The
 * booking id is filled in afterwards with attachVoucher.
 */
export async function claimVoucher(svc: Svc, voucherId: string, parentId: string, today: string = getTodayLA()): Promise<Voucher | null> {
  const { data } = await svc.from('make_up_vouchers')
    .update({ status: 'used', used_at: new Date().toISOString() })
    .eq('id', voucherId).eq('parent_id', parentId).eq('status', 'active').gte('expires_on', today)
    .select('*')
  return data && data.length > 0 ? (data[0] as Voucher) : null
}

export async function attachVoucher(svc: Svc, voucherId: string, bookingId: string) {
  await svc.from('make_up_vouchers').update({ used_booking_id: bookingId }).eq('id', voucherId)
}

/** Undo a claim when the booking it was for could not be written. */
export async function releaseVoucher(svc: Svc, voucherId: string) {
  await svc.from('make_up_vouchers')
    .update({ status: 'active', used_at: null, used_booking_id: null })
    .eq('id', voucherId).eq('status', 'used')
}

/**
 * The family's usable vouchers for one kind of lesson: same course, same length,
 * the same child (or the same two children of a sibling 1-on-2). Earliest
 * expiry first. Used when a voucher is applied by itself in an ordinary
 * booking (owner, 2026-10-02) rather than chosen with 「用券預約」.
 */
export async function matchingVouchers(svc: Svc, parentId: string,
  want: { slug: string; minutes: number; studentIds: string[] }, today: string = getTodayLA()): Promise<Voucher[]> {
  const { data } = await svc.from('make_up_vouchers').select('*')
    .eq('parent_id', parentId).eq('status', 'active').gte('expires_on', today)
    .eq('course_slug', want.slug).eq('minutes', want.minutes)
    .order('expires_on', { ascending: true }).order('created_at', { ascending: true })
  const wanted = new Set(want.studentIds)
  return ((data || []) as Voucher[]).filter(v => {
    const has = [v.student_id, v.student2_id].filter(Boolean) as string[]
    return has.length === wanted.size && has.every(id => wanted.has(id))
  })
}

/**
 * Which lessons the vouchers pay for. Lessons in date order, each taking the
 * voucher that runs out soonest among those still valid on its date -- that
 * covers as many lessons as the vouchers can, and spends the ones about to
 * expire first. The booking page runs the same rule to show the family what
 * will happen (assignVoucherKeys below is the shared core).
 */
export function assignVoucherKeys<V extends { expires_on: string; usable_from?: string | null }, L extends { date: string; time: string }>(
  lessons: L[], vouchers: V[], keyOf: (l: L) => string): Map<string, V> {
  const out = new Map<string, V>()
  const left = [...vouchers].sort((a, b) => a.expires_on.localeCompare(b.expires_on))
  const ordered = [...lessons].sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))
  for (const l of ordered) {
    const i = left.findIndex(v => voucherFitsDate(v, l.date))
    if (i < 0) continue
    out.set(keyOf(l), left[i])
    left.splice(i, 1)
  }
  return out
}

/** Read one voucher the family owns and can still use. */
export async function usableVoucher(svc: Svc, voucherId: string, parentId: string, today: string = getTodayLA()): Promise<Voucher | null> {
  const { data } = await svc.from('make_up_vouchers').select('*')
    .eq('id', voucherId).eq('parent_id', parentId).eq('status', 'active').gte('expires_on', today).maybeSingle()
  return (data as Voucher) || null
}

/**
 * Daily: vouchers past their date expire, and families get one reminder a
 * week before. Returns counts for the cron's log.
 */
export async function sweepVouchers(svc: Svc, sendReminder: (v: Voucher) => Promise<boolean>, today: string = getTodayLA()) {
  const { data: gone } = await svc.from('make_up_vouchers')
    .update({ status: 'expired' }).eq('status', 'active').lt('expires_on', today).select('id')
  const remindBy = addDaysStr(today, VOUCHER_REMIND_DAYS)
  const { data: soon } = await svc.from('make_up_vouchers').select('*')
    .eq('status', 'active').is('reminded_at', null).gte('expires_on', today).lte('expires_on', remindBy)
  let reminded = 0
  for (const v of (soon || []) as Voucher[]) {
    // Claimed before sending, so two overlapping runs cannot both email.
    const stamp = new Date().toISOString()
    const { data: claimed } = await svc.from('make_up_vouchers')
      .update({ reminded_at: stamp }).eq('id', v.id).is('reminded_at', null).select('id')
    if (!claimed || claimed.length === 0) continue
    let ok = false
    try { ok = await sendReminder(v) } catch (e) { console.error('voucher reminder failed', e) }
    if (ok) { reminded++; continue }
    // Not sent: give the claim back so the next run tries again -- it used to
    // stay set and the family never got the reminder (found 2026-10-05).
    // Conditional on our own stamp, so anything that changed it since is kept.
    await svc.from('make_up_vouchers').update({ reminded_at: null }).eq('id', v.id).eq('reminded_at', stamp)
  }
  return { expired: (gone || []).length, reminded }
}

/**
 * The school cancelled lessons (coach time off, a session taken down, the
 * desk cancelling one swimmer). A make-up lesson among them had no points to
 * refund -- what it cost the family was a voucher, so the voucher comes back,
 * and with at least four weeks from the cancelled date: losing the make-up to
 * our cancellation must not also run their clock out.
 */
export async function giveBackVouchers(svc: Svc, bookingIds: string[]): Promise<number> {
  if (bookingIds.length === 0) return 0
  const { data: rows } = await svc.from('bookings')
    .select('id, voucher_id').in('id', bookingIds).not('voucher_id', 'is', null)
  const voucherIds = [...new Set(((rows || []) as { voucher_id: string }[]).map(r => r.voucher_id))]
  let n = 0
  for (const vid of voucherIds) {
    const { data: v } = await svc.from('make_up_vouchers')
      .select('id, parent_id, status, expires_on').eq('id', vid).maybeSingle()
    if (!v || v.status !== 'used') continue
    /* One voucher can pay for several rows: both seats of a sibling 1-on-2,
       both halves of an hour. It comes back only when the WHOLE lesson is
       gone. It used to come back as soon as the row it was attached to was
       cancelled, so refunding one child's seat returned the two-child voucher
       while the other child still had the lesson (found 2026-10-04, owner:
       handle it). */
    const { data: used } = await svc.from('bookings')
      .select('class_session_id, lesson_group_id').eq('voucher_id', vid)
    const sids = [...new Set((used || []).map((u: any) => u.class_session_id).filter(Boolean))] as string[]
    const gids = [...new Set((used || []).map((u: any) => u.lesson_group_id).filter(Boolean))] as string[]
    if (sids.length === 0) continue
    const filters = [`class_session_id.in.(${sids.join(',')})`, ...(gids.length ? [`lesson_group_id.in.(${gids.join(',')})`] : [])]
    const { data: live } = await svc.from('bookings').select('id')
      .eq('parent_id', v.parent_id).or(filters.join(','))
      .not('status', 'in', '("cancelled","in_cart","pending_payment")').limit(1)
    if (live && live.length > 0) continue
    const { data: cs } = await svc.from('class_sessions').select('session_date').in('id', sids)
      .order('session_date', { ascending: true }).limit(1)
    const first = (cs || [])[0]?.session_date as string | undefined
    const floor = first ? voucherExpiry(first) : v.expires_on
    const { data: ok } = await svc.from('make_up_vouchers')
      .update({ status: 'active', used_booking_id: null, used_at: null, expires_on: floor > v.expires_on ? floor : v.expires_on, reminded_at: null })
      .eq('id', v.id).eq('status', 'used').select('id')
    if (ok && ok.length) n++
  }
  return n
}

export const VOUCHER_GONE_ERROR = 'This make-up voucher has already been used or has expired.'
export const VOUCHER_TOO_EARLY_ERROR = 'That date is before this make-up voucher can be used.'
