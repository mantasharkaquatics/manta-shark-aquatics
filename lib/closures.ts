/* eslint-disable @typescript-eslint/no-explicit-any */
/* A pool closed for a day, several days or part of one day (owner,
   2026-10-23: "一鍵全場停課"). docs/migration-pool-closures.sql, used by
   /api/admin/closures (the desk), /api/closures (the banner) and the AI.

   One closure does four things, in this order:
     1. Reads what it touches: every lesson at the pool in that time that has
        not already happened, and every Swim Team practice there. The desk
        sees this first (preview) and nothing changes.
     2. Blocks the coaches' hours at that pool (coach_time_off rows of type
        'admin_block' carrying closure_id), so the booking page, the AI and the
        desk tools -- which all read coach_time_off already -- offer nothing in
        it. A coach who is at another pool later that day keeps those hours.
     3. Cancels the lessons the way the school cancels a lesson
        (cancellation_reason 'cancelled_by_school'): points and make-up
        vouchers back in full with no late-cancel allowance spent; a paid Swim
        Assessment stays owed and waits in Reviews.
     4. Tells the families: one email per lesson (block_cancellation_notice
        with the closure reason), a text per family when a lesson is within
        48 hours, and the same for Swim Team practices (team_practice_cancelled;
        the monthly fee does not change -- owner, 2026-10-23).

   The banner at the top of every page shows a closure from when it is made
   until it ends, unless the desk turns it off sooner. */

import type { SupabaseClient } from '@supabase/supabase-js'
import Stripe from 'stripe'
import { allRows, allRowsIn } from '@/lib/db-paging'
import { formatTime12h, getTodayLA, getNowMinutesLA } from '@/lib/date'
import { getEffectiveZones } from '@/lib/zones'
import { DEFAULT_LOCATION_ID, getLocations, lessonLocationLine, showLocations } from '@/lib/locations'
import { refundBookingPoints } from '@/lib/bookings/refund'
import { giveBackVouchers } from '@/lib/vouchers'
import { closeTrialCheckout } from '@/lib/trial-booking'
import { assessmentPaymentReversed, reopenReversedAssessment } from '@/lib/assessments'
import { lessonCalendar } from '@/lib/lesson-calendar'
import { sendEmail } from '@/lib/email'
import { textClosure } from '@/lib/lesson-cancel-sms'
import { addDaysISO } from '@/lib/time-off'

export const CLOSURE_REASONS = ['weather', 'power', 'water', 'venue', 'other'] as const
export type ClosureReason = typeof CLOSURE_REASONS[number]

/** The most days one closure covers. A closure is for an emergency; a
 *  longer shutdown is a schedule change, not one button. */
export const MAX_CLOSURE_DAYS = 14

/** The reason in English, for the text message, the coach block note and the
 *  AI (texts and AI context are English; emails and the banner translate). */
export const REASON_EN: Record<Exclude<ClosureReason, 'other'>, string> = {
  weather: 'bad weather',
  power: 'a power outage',
  water: 'a pool water or equipment issue',
  venue: 'a notice from the venue',
}

export type ClosureInput = {
  location_id: string
  start_date: string
  end_date: string
  start_time: string | null
  end_time: string | null
  reason_key: ClosureReason
  reason_text: string | null
}

export type ClosureRow = ClosureInput & {
  id: string
  banner_off_at: string | null
  reopened_at: string | null
  created_by: string | null
  created_at: string
  result: any
}

export const reasonEnglish = (c: Pick<ClosureInput, 'reason_key' | 'reason_text'>) =>
  c.reason_key === 'other' ? String(c.reason_text || '').trim() : REASON_EN[c.reason_key]

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const TIME_RE = /^\d{2}:\d{2}$/
const toM = (t: string) => { const [h, m] = String(t).slice(0, 5).split(':').map(Number); return h * 60 + m }
const hm = (t: string | null | undefined) => (t == null ? null : String(t).slice(0, 5))

/** Checks the desk's form. Returns the cleaned input or an error code. */
export function parseClosureInput(b: any, today: string): { ok: true; input: ClosureInput } | { ok: false; code: string } {
  if (!b || typeof b !== 'object') return { ok: false, code: 'bad_request' }
  const location_id = String(b.location_id || '').trim()
  const start_date = String(b.start_date || '')
  const end_date = String(b.end_date || b.start_date || '')
  if (!location_id) return { ok: false, code: 'pool' }
  if (!DATE_RE.test(start_date) || !DATE_RE.test(end_date)) return { ok: false, code: 'dates' }
  if (end_date < start_date) return { ok: false, code: 'dates' }
  if (end_date < today) return { ok: false, code: 'past' }
  if (dayCount(start_date, end_date) > MAX_CLOSURE_DAYS) return { ok: false, code: 'too_long' }
  let start_time: string | null = null
  let end_time: string | null = null
  if (!b.all_day) {
    if (start_date !== end_date) return { ok: false, code: 'times_one_day' }
    if (!TIME_RE.test(String(b.start_time || '')) || !TIME_RE.test(String(b.end_time || ''))) return { ok: false, code: 'times' }
    if (b.start_time >= b.end_time) return { ok: false, code: 'times' }
    start_time = b.start_time
    end_time = b.end_time
  }
  const reason_key = CLOSURE_REASONS.includes(b.reason_key) ? b.reason_key as ClosureReason : null
  if (!reason_key) return { ok: false, code: 'reason' }
  const reason_text = reason_key === 'other' ? String(b.reason_text || '').trim().slice(0, 120) : null
  if (reason_key === 'other' && !reason_text) return { ok: false, code: 'reason' }
  return { ok: true, input: { location_id, start_date, end_date, start_time, end_time, reason_key, reason_text } }
}

const dayCount = (a: string, b: string) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000) + 1
const daysOf = (c: Pick<ClosureInput, 'start_date' | 'end_date'>) => {
  const out: string[] = []
  for (let d = c.start_date; d <= c.end_date && out.length <= MAX_CLOSURE_DAYS; d = addDaysISO(d, 1)) out.push(d)
  return out
}
const inWindow = (c: Pick<ClosureInput, 'start_time' | 'end_time'>, start: string, end: string) =>
  c.start_time == null || c.end_time == null || (toM(start) < toM(c.end_time) && toM(end) > toM(c.start_time))

/** When a closure is over (Los Angeles wall clock), as 'YYYY-MM-DD HH:MM'. */
export const closureEndKey = (c: Pick<ClosureInput, 'end_date' | 'end_time'>) => `${c.end_date} ${hm(c.end_time) || '24:00'}`
const nowKeyLA = () => {
  const m = getNowMinutesLA()
  return `${getTodayLA()} ${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

/** Closures still running or still to come (the banner, the AI). A failed
 *  read -- or the table not there yet -- is no closures. */
export async function activeClosures(svc: SupabaseClient, opts: { forBanner?: boolean } = {}): Promise<ClosureRow[]> {
  const { data, error } = await svc.from('pool_closures').select('*')
    .gte('end_date', getTodayLA()).is('reopened_at', null).order('start_date')
  if (error || !data) return []
  const now = nowKeyLA()
  return (data as ClosureRow[]).filter(c => closureEndKey(c) > now && (!opts.forBanner || !c.banner_off_at))
}

/** One line per active closure for the AI's dynamic context, or ''. */
const withDay = (d: string) => `${new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' })} ${d}`

export async function closuresForAi(svc: SupabaseClient): Promise<string> {
  const list = await activeClosures(svc)
  if (!list.length) return ''
  const pools = await getLocations(svc).catch(() => [])
  const name = (id: string) => pools.find(p => p.id === id)?.name || id
  return [
    'POOL CLOSURES (the school closed the pool; every lesson in that time is cancelled and the points are back in the family\'s account; nothing can be booked in it). If a parent asks about a lesson or a visit then, tell them not to come:',
    // With the weekday spelled out: tested live 2026-10-23, the AI turned
    // 2026-11-06 into "Thursday" on its own (it is a Friday).
    ...list.map(c => `- ${name(c.location_id)}: ${c.start_date === c.end_date ? withDay(c.start_date) : `${withDay(c.start_date)} to ${withDay(c.end_date)}`}${c.start_time ? ` ${formatTime12h(c.start_time)} - ${formatTime12h(c.end_time)}` : ' (all day)'}; reason: ${reasonEnglish(c)}`),
  ].join('\n')
}

// ---------------------------------------------------------------------------
// What a closure touches

const BOOKING_COLS = 'id, class_session_id, parent_id, student_id, status, points_charged, points_refunded, block_notice_sent_at, cancellation_reason, lesson_group_id, voucher_id, is_trial, stripe_session_id, pending_expires_at, pending_action'
// A live booking: a seat (confirmed), an invitation not answered yet, an
// unpaid assessment hold, or a lesson waiting in a basket.
const LIVE = 'status.eq.confirmed,status.eq.pending_partner,status.eq.in_cart,and(status.eq.pending_payment,is_trial.eq.true)'
const live = (b: any) => b.status !== 'pending_partner' || (!!b.pending_expires_at && new Date(b.pending_expires_at) > new Date())

export type Affected = {
  sessions: any[]
  bookings: any[]
  /** lesson keys (lesson_group_id or session | student) already taught */
  delivered: Set<string>
  team: TeamPractice[]
}

export type TeamPractice = {
  date: string
  start: string
  end: string
  team_tier_id: string
  team_name: string
  coach_id: string
  /** members: student id, name, parent id */
  members: { student_id: string; name: string; parent_id: string | null }[]
}

const lessonKey = (b: any) => `${b.lesson_group_id || b.class_session_id}|${b.student_id}`

export async function affectedBy(svc: SupabaseClient, c: ClosureInput): Promise<Affected> {
  const atPool = c.location_id === DEFAULT_LOCATION_ID
    ? `location_id.eq.${c.location_id},location_id.is.null`
    : `location_id.eq.${c.location_id}`
  const { data: sess, error } = await allRows(() => svc.from('class_sessions')
    .select('id, coach_id, session_date, start_time, end_time, course_type_id, status, location_id')
    .gte('session_date', c.start_date).lte('session_date', c.end_date)
    .neq('status', 'cancelled').or(atPool).order('id'))
  if (error) throw new Error('sessions not read')
  const sessions: any[] = (sess || []).filter((s: any) => inWindow(c, s.start_time, s.end_time))

  let bookings: any[] = []
  if (sessions.length) {
    const { data: bs, error: bErr } = await allRowsIn(sessions.map(s => s.id), ch => svc.from('bookings')
      .select(BOOKING_COLS).in('class_session_id', ch).or(LIVE).order('id'))
    if (bErr) throw new Error('bookings not read')
    bookings = (bs || []).filter(live)
    // A 60-minute lesson goes as a whole, even when only half is in the window.
    const groups = [...new Set(bookings.map(b => b.lesson_group_id).filter(Boolean))]
    if (groups.length) {
      const { data: more } = await svc.from('bookings').select(BOOKING_COLS).in('lesson_group_id', groups).or(LIVE)
      const seen = new Set(bookings.map(b => b.id))
      const extra = (more || []).filter((b: any) => !seen.has(b.id) && live(b))
      bookings = bookings.concat(extra)
      const missing = [...new Set(extra.map((b: any) => b.class_session_id))].filter(id => !sessions.some(s => s.id === id))
      if (missing.length) {
        const { data: ms } = await svc.from('class_sessions')
          .select('id, coach_id, session_date, start_time, end_time, course_type_id, status, location_id').in('id', missing)
        sessions.push(...(ms || []))
      }
    }
  }

  // Already taught: checked in, or over. Left alone.
  const sessMap = new Map(sessions.map(s => [s.id, s]))
  const today = getTodayLA()
  const nowMin = getNowMinutesLA()
  const ended = (s: any) => !!s && (s.session_date < today || (s.session_date === today && toM(s.end_time) <= nowMin))
  const { data: att } = bookings.length
    ? await svc.from('attendance').select('booking_id').in('booking_id', bookings.map(b => b.id))
    : { data: [] as any[] }
  const attended = new Set((att || []).map((a: any) => a.booking_id))
  const delivered = new Set<string>()
  for (const b of bookings) if (attended.has(b.id) || ended(sessMap.get(b.class_session_id))) delivered.add(lessonKey(b))

  return { sessions, bookings, delivered, team: await teamPractices(svc, c) }
}

/** Swim Team practices at the pool in the closure, with their members. */
async function teamPractices(svc: SupabaseClient, c: ClosureInput): Promise<TeamPractice[]> {
  const { data: coaches } = await svc.from('coaches').select('id').eq('is_active', true)
  const today = getTodayLA()
  const nowMin = getNowMinutesLA()
  const out: TeamPractice[] = []
  for (const date of daysOf(c)) {
    for (const coach of coaches || []) {
      const eff = await getEffectiveZones(svc, coach.id, date, c.location_id)
      for (const r of eff.rows) {
        if (r.zone_type !== 'team' || !r.team_tier_id || !inWindow(c, r.start_time, r.end_time)) continue
        if (date < today || (date === today && toM(r.end_time) <= nowMin)) continue
        out.push({ date, start: r.start_time, end: r.end_time, team_tier_id: r.team_tier_id, team_name: '', coach_id: coach.id, members: [] })
      }
    }
  }
  if (!out.length) return out
  const tierIds = [...new Set(out.map(p => p.team_tier_id))]
  const [{ data: tiers }, { data: mem }] = await Promise.all([
    svc.from('team_tiers').select('id, name').in('id', tierIds),
    svc.from('team_memberships').select('team_tier_id, student_id').in('team_tier_id', tierIds)
      .in('status', ['active', 'past_due']).or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`),
  ])
  const sIds = [...new Set((mem || []).map((m: any) => m.student_id).filter(Boolean))]
  const { data: studs } = sIds.length ? await svc.from('students').select('id, full_name, parent_id').in('id', sIds) : { data: [] as any[] }
  const sMap = new Map((studs || []).map((s: any) => [s.id, s]))
  for (const p of out) {
    p.team_name = (tiers || []).find((x: any) => x.id === p.team_tier_id)?.name || ''
    const ids = [...new Set((mem || []).filter((m: any) => m.team_tier_id === p.team_tier_id).map((m: any) => m.student_id))]
    p.members = ids.map(id => ({ student_id: id as string, name: (sMap.get(id) as any)?.full_name || '', parent_id: (sMap.get(id) as any)?.parent_id || null }))
  }
  return out.sort((a, b) => `${a.date} ${a.start}`.localeCompare(`${b.date} ${b.start}`))
}

/** What the desk sees before pressing the button. */
export async function previewClosure(svc: SupabaseClient, c: ClosureInput) {
  const a = await affectedBy(svc, c)
  const sessMap = new Map(a.sessions.map(s => [s.id, s]))
  const todo = a.bookings.filter(b => !a.delivered.has(lessonKey(b)) && b.status !== 'in_cart')
  const stuIds = [...new Set(todo.map(b => b.student_id).filter(Boolean))]
  const parIds = [...new Set(todo.map(b => b.parent_id).filter(Boolean))]
  const coachIds = [...new Set([...a.sessions.map(s => s.coach_id), ...a.team.map(p => p.coach_id)])]
  const [{ data: stus }, { data: pars }, { data: cs }] = await Promise.all([
    stuIds.length ? svc.from('students').select('id, full_name').in('id', stuIds) : Promise.resolve({ data: [] as any[] }),
    parIds.length ? svc.from('parents').select('id, first_name, last_name').in('id', parIds) : Promise.resolve({ data: [] as any[] }),
    coachIds.length ? svc.from('coaches').select('id, first_name').in('id', coachIds) : Promise.resolve({ data: [] as any[] }),
  ])
  const stu = new Map((stus || []).map((x: any) => [x.id, x.full_name]))
  const par = new Map((pars || []).map((x: any) => [x.id, `${x.first_name || ''} ${x.last_name || ''}`.trim()]))
  const coach = new Map((cs || []).map((x: any) => [x.id, x.first_name || '']))
  // One row per lesson (a 60-minute lesson and a sibling pair are one).
  const byLesson = new Map<string, any>()
  for (const b of todo) {
    const s = sessMap.get(b.class_session_id)
    if (!s) continue
    const k = b.lesson_group_id || b.class_session_id
    const cur = byLesson.get(k) || { date: s.session_date, start: hm(s.start_time), end: hm(s.end_time), coach: coach.get(s.coach_id) || '', students: [] as string[], families: [] as string[], assessment: false }
    if (hm(s.start_time)! < cur.start) cur.start = hm(s.start_time)
    if (hm(s.end_time)! > cur.end) cur.end = hm(s.end_time)
    const n = stu.get(b.student_id); if (n && !cur.students.includes(n)) cur.students.push(n)
    const f = par.get(b.parent_id); if (f && !cur.families.includes(f)) cur.families.push(f)
    cur.assessment = cur.assessment || !!b.is_trial
    byLesson.set(k, cur)
  }
  const lessons = [...byLesson.values()].sort((x, y) => `${x.date} ${x.start}`.localeCompare(`${y.date} ${y.start}`))
  const team = a.team.map(p => ({ date: p.date, start: p.start, end: p.end, team: p.team_name, coach: coach.get(p.coach_id) || '', members: p.members.map(m => m.name).filter(Boolean) }))
  const families = new Set([...todo.map(b => b.parent_id), ...a.team.flatMap(p => p.members.map(m => m.parent_id))].filter(Boolean))
  return { lessons, team, families: families.size, delivered: a.delivered.size }
}

// ---------------------------------------------------------------------------
// Doing it

/** The coaches' hours at the pool inside the closure, as admin blocks. A
 *  coach whose day is all at this pool gets one block for the window (the
 *  whole day when the closure is all day); one who is also at another pool
 *  that day gets a block per stretch at this pool, so the other pool stays
 *  bookable. Returns the rows to insert. */
async function blocksFor(svc: SupabaseClient, c: ClosureInput, closureId: string) {
  const { data: coaches } = await svc.from('coaches').select('id').eq('is_active', true)
  const note = `Pool closed: ${reasonEnglish(c)}`
  const rows: any[] = []
  for (const date of daysOf(c)) {
    for (const coach of coaches || []) {
      const here = await getEffectiveZones(svc, coach.id, date, c.location_id)
      if (here.legacy) {
        rows.push({ coach_id: coach.id, date, start_time: c.start_time, end_time: c.end_time, reason: note, block_type: 'admin_block', closure_id: closureId })
        continue
      }
      if (!here.rows.length) continue
      const all = await getEffectiveZones(svc, coach.id, date)
      if (all.rows.every(r => r.location_id === c.location_id)) {
        rows.push({ coach_id: coach.id, date, start_time: c.start_time, end_time: c.end_time, reason: note, block_type: 'admin_block', closure_id: closureId })
        continue
      }
      for (const r of here.rows) {
        const st = c.start_time && toM(c.start_time) > toM(r.start_time) ? hm(c.start_time)! : r.start_time
        const en = c.end_time && toM(c.end_time) < toM(r.end_time) ? hm(c.end_time)! : r.end_time
        if (toM(st) >= toM(en)) continue
        rows.push({ coach_id: coach.id, date, start_time: st, end_time: en, reason: note, block_type: 'admin_block', closure_id: closureId })
      }
    }
  }
  return rows
}

export type ClosureResult = {
  cancelled: number
  emailed: number
  emailFailed: number
  texted: number
  teamEmailed: number
  refundPending: number
  blocks: number
}

const stripe = () => new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2026-05-27.dahlia' as any })

/**
 * Close the pool. Returns the new closure's id and what was done, or an error
 * code ('stripe' when an unpaid Swim Assessment's payment page could not be
 * closed -- then nothing at all has changed).
 */
export async function createClosure(svc: SupabaseClient, c: ClosureInput, adminId: string): Promise<{ ok: true; id: string; result: ClosureResult } | { ok: false; code: string }> {
  const a = await affectedBy(svc, c)
  const sessMap = new Map(a.sessions.map(s => [s.id, s]))
  const todo = a.bookings.filter(b => !a.delivered.has(lessonKey(b)))

  // An unpaid assessment: close its Stripe page first, so it cannot be paid
  // for a lesson that is not happening. Stripe unreachable = change nothing.
  const st = todo.some(b => b.status === 'pending_payment') ? stripe() : null
  for (const b of todo) {
    if (b.status !== 'pending_payment' || !st) continue
    const r = await closeTrialCheckout(svc, st, b.stripe_session_id)
    if (r === 'unknown') return { ok: false, code: 'stripe' }
    if (r === 'paid') b.status = 'confirmed'
  }

  const { data: row, error } = await svc.from('pool_closures').insert({ ...c, created_by: adminId }).select('id').single()
  if (error || !row) return { ok: false, code: 'save' }
  const closureId = (row as any).id as string

  const blocks = await blocksFor(svc, c, closureId)
  if (blocks.length) {
    const { error: bErr } = await svc.from('coach_time_off').insert(blocks)
    if (bErr) console.error('[closures] blocks not saved:', bErr.message)
  }

  const result: ClosureResult = { cancelled: 0, emailed: 0, emailFailed: 0, texted: 0, teamEmailed: 0, refundPending: 0, blocks: blocks.length }
  const now = () => new Date().toISOString()
  const touched = new Set<string>()
  const pendingRefund = new Set<string>()
  const toTell: any[] = []

  for (const b of todo) {
    const from = b.status
    const { data: done } = await svc.from('bookings').update({
      status: 'cancelled', pending_action: null, cancellation_reason: 'cancelled_by_school', cancelled_by: 'admin', cancelled_at: now(),
    }).eq('id', b.id).eq('status', from).select('id')
    if (!done || done.length === 0) continue
    b.status = 'cancelled'
    touched.add(b.class_session_id)
    result.cancelled++
    // Only a seat the family held gets an email; a basket item, an unpaid
    // hold or an invitation nobody accepted just goes from their page.
    if (from !== 'confirmed') continue
    const back = await refundBookingPoints(svc, { booking: b, parentId: b.parent_id, reason: 'school_cancel', actor: 'admin', note: 'Pool closed' })
    b.points_refunded = (Number(b.points_refunded) || 0) + back
    await giveBackVouchers(svc, [b.id])
    if (!b.is_trial && !b.voucher_id && (Number(b.points_charged) || 0) > (Number(b.points_refunded) || 0)) pendingRefund.add(b.id)
    if (b.is_trial && await assessmentPaymentReversed(svc, b.student_id).catch(() => false)) await reopenReversedAssessment(svc, b.student_id)
    toTell.push(b)
  }
  result.refundPending = pendingRefund.size

  // A session with nothing left on it is cancelled too.
  for (const sid of touched) {
    const { data: remain } = await svc.from('bookings').select('id').eq('class_session_id', sid).neq('status', 'cancelled').limit(1)
    if (!remain || remain.length === 0) await svc.from('class_sessions').update({ status: 'cancelled' }).eq('id', sid).neq('status', 'cancelled')
  }

  const pools = await getLocations(svc).catch(() => [])
  const stuIds = [...new Set([...toTell.map(b => b.student_id), ...a.team.flatMap(p => p.members.map(m => m.student_id))].filter(Boolean))]
  const parIds = [...new Set([...toTell.map(b => b.parent_id), ...a.team.flatMap(p => p.members.map(m => m.parent_id))].filter(Boolean))]
  const ctIds = [...new Set(a.sessions.map(s => s.course_type_id).filter(Boolean))]
  const coachIds = [...new Set(a.sessions.map(s => s.coach_id))]
  const [{ data: stus }, { data: pars }, { data: cts }, { data: cs }] = await Promise.all([
    stuIds.length ? svc.from('students').select('id, full_name, trial_used_at').in('id', stuIds) : Promise.resolve({ data: [] as any[] }),
    parIds.length ? svc.from('parents').select('id, first_name, email').in('id', parIds) : Promise.resolve({ data: [] as any[] }),
    ctIds.length ? svc.from('course_types').select('id, name').in('id', ctIds) : Promise.resolve({ data: [] as any[] }),
    coachIds.length ? svc.from('coaches').select('id, first_name, last_name').in('id', coachIds) : Promise.resolve({ data: [] as any[] }),
  ])
  const stu = new Map((stus || []).map((x: any) => [x.id, x]))
  const par = new Map((pars || []).map((x: any) => [x.id, x]))
  const ct = new Map((cts || []).map((x: any) => [x.id, x.name]))
  const coach = new Map((cs || []).map((x: any) => [x.id, `${x.first_name || ''} ${x.last_name || ''}`.trim()]))
  const reason = { closureReasonKey: c.reason_key, closureReasonText: c.reason_text || undefined }

  // One email per family per lesson (a 60-minute lesson's halves and a
  // sibling pair's seats are one lesson).
  const byLesson = new Map<string, any[]>()
  for (const b of toTell) {
    const k = `${b.parent_id}|${b.lesson_group_id || b.class_session_id}`
    byLesson.set(k, [...(byLesson.get(k) || []), b])
  }
  const textItems = new Map<string, { who: Set<string>; times: { date: string; start: string }[] }>()
  for (const rows of byLesson.values()) {
    const sorted = [...rows].sort((x, y) => String(sessMap.get(x.class_session_id)?.start_time || '').localeCompare(String(sessMap.get(y.class_session_id)?.start_time || '')))
    const b = sorted[0]
    const s = sessMap.get(b.class_session_id)
    const sLast = sessMap.get(sorted[sorted.length - 1].class_session_id) || s
    const p: any = par.get(b.parent_id)
    const names = [...new Set(rows.map(r => (stu.get(r.student_id) as any)?.full_name).filter(Boolean))] as string[]
    if (!s || !p?.email) { result.emailFailed++; continue }
    const ids = rows.map(r => r.id)
    const { data: claimed } = await svc.from('bookings').update({ block_notice_sent_at: now() }).in('id', ids).is('block_notice_sent_at', null).select('id')
    if (!claimed || claimed.length === 0) continue
    const kind = rows.some(r => pendingRefund.has(r.id)) ? 'none'
      : rows.some(r => r.points_charged) ? 'points'
      : rows.some(r => r.voucher_id) ? 'voucher'
      : rows.some(r => r.is_trial && (stu.get(r.student_id) as any)?.trial_used_at) ? 'assessment'
      : 'none'
    const ok = await sendEmail({
      type: 'block_cancellation_notice', refundKind: kind, to: p.email, parentName: p.first_name,
      studentName: names.join(' & '), courseName: ct.get(s.course_type_id) || '', coachName: coach.get(s.coach_id) || '',
      date: s.session_date, time: `${formatTime12h(s.start_time)} – ${formatTime12h(sLast.end_time)}`,
      location: await lessonLocationLine(svc, s.location_id, pools),
      calendar: await lessonCalendar(svc, b.parent_id, ids),
      ...reason,
    }).catch(() => false)
    if (ok) {
      result.emailed++
      const t = textItems.get(b.parent_id) || { who: new Set<string>(), times: [] }
      names.forEach(n => t.who.add(n))
      t.times.push({ date: s.session_date, start: s.start_time })
      textItems.set(b.parent_id, t)
    } else {
      await svc.from('bookings').update({ block_notice_sent_at: null }).in('id', claimed.map((r: any) => r.id))
      result.emailFailed++
    }
  }
  for (const [parentId, t] of textItems) {
    if (await textClosure(svc, { parentId, who: [...t.who].join(' & '), items: t.times, reason: reasonEnglish(c), kind: 'lesson' })) result.texted++
  }

  // Swim Team: one email per family per practice, a text per family.
  const teamText = new Map<string, { who: Set<string>; times: { date: string; start: string }[] }>()
  for (const pr of a.team) {
    const byFamily = new Map<string, string[]>()
    for (const m of pr.members) {
      if (!m.parent_id) continue
      byFamily.set(m.parent_id, [...(byFamily.get(m.parent_id) || []), m.name].filter(Boolean))
    }
    for (const [parentId, names] of byFamily) {
      const p: any = par.get(parentId)
      if (!p?.email) continue
      const ok = await sendEmail({
        type: 'team_practice_cancelled', to: p.email, parentName: p.first_name, studentName: names.join(' & '),
        courseName: pr.team_name, date: pr.date, time: `${formatTime12h(pr.start)} – ${formatTime12h(pr.end)}`,
        location: await lessonLocationLine(svc, c.location_id, pools),
        ...reason,
      }).catch(() => false)
      if (!ok) continue
      result.teamEmailed++
      const t = teamText.get(parentId) || { who: new Set<string>(), times: [] }
      names.forEach(n => t.who.add(n))
      t.times.push({ date: pr.date, start: pr.start })
      teamText.set(parentId, t)
    }
  }
  for (const [parentId, t] of teamText) {
    if (await textClosure(svc, { parentId, who: [...t.who].join(' & '), items: t.times, reason: reasonEnglish(c), kind: 'team' })) result.texted++
  }

  await svc.from('pool_closures').update({ result }).eq('id', closureId)
  return { ok: true, id: closureId, result }
}

/** Reopen booking in a closure's time (the lessons stay cancelled). */
export async function reopenClosure(svc: SupabaseClient, id: string): Promise<boolean> {
  const { error } = await svc.from('coach_time_off').delete().eq('closure_id', id)
  if (error) return false
  const { error: e2 } = await svc.from('pool_closures').update({ reopened_at: new Date().toISOString(), banner_off_at: new Date().toISOString() }).eq('id', id)
  return !e2
}

/** The banner's view of active closures: only what it shows. */
export async function bannerClosures(svc: SupabaseClient) {
  const list = await activeClosures(svc, { forBanner: true })
  if (!list.length) return []
  const pools = await getLocations(svc).catch(() => [])
  const many = showLocations(pools)
  return list.map(c => ({
    id: c.id,
    pool: many ? (pools.find(p => p.id === c.location_id)?.name || null) : null,
    start_date: c.start_date, end_date: c.end_date,
    start_time: hm(c.start_time), end_time: hm(c.end_time),
    reason_key: c.reason_key, reason_text: c.reason_key === 'other' ? c.reason_text : null,
  }))
}
