/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * The queues behind /admin/reviews, in one place so the page and the
 * sidebar's badge cannot drift apart: missing progress, pending progress
 * (today and earlier), level recommendations, and refunds still owed.
 *
 * The missing-progress pass is the expensive one: it reads every confirmed
 * booking, its attendance, its session and the progress already recorded, then
 * takes the difference. Measured against the levels page it costs about a
 * second. That is fine on a page someone opened to work through; it is not
 * fine on every admin page, which is why the badge fetches this from the
 * client after paint and the route caches the answer.
 */
import { getTodayLA, getNowMinutesLA, laWallTimeToUtcMs } from '@/lib/date'
import { levelThenFromMoves } from '@/lib/level-change'
import { timeOffNeedingAction, type TimeOffActionItem } from '@/lib/time-off'
import { allRowsOrLog, IN_CHUNK } from '@/lib/db-paging'
import { SCHOOL_CANCEL_REASONS } from '@/lib/trial-booking'
import { assessmentPaymentsReversed } from '@/lib/assessments'
import { pictureAsOfRows } from '@/lib/skill-progress-sync'

/**
 * Every row a query matches, a page at a time. The API hands back at most
 * 1,000 rows per request, and a queue that silently stopped at the first
 * thousand would say "nothing waiting" about lessons it never read. Each
 * query must be ordered by something unique so the pages do not overlap.
 * Same shape as allRows in app/api/admin/finance/route.ts. An error is logged
 * and ends the read with what it has, which is what the single unpaged reads
 * here used to do (they ignored the error and saw no rows).
 */
const allRows = (make: () => any) => allRowsOrLog('review-queues', make)

/**
 * allRows over a long id list, cut into .in() requests of IN_CHUNK ids: a few
 * thousand uuids in one URL is past what the API will take. A few chunks run
 * at once; every caller folds the rows into a set or a map, so order is moot.
 */
const PARALLEL = 4
async function inChunks(ids: string[], make: (chunk: string[]) => any): Promise<any[]> {
  const chunks: string[][] = []
  for (let i = 0; i < ids.length; i += IN_CHUNK) chunks.push(ids.slice(i, i + IN_CHUNK))
  const out: any[] = []
  for (let i = 0; i < chunks.length; i += PARALLEL) {
    const got = await Promise.all(chunks.slice(i, i + PARALLEL).map(c => allRows(() => make(c))))
    for (const rows of got) out.push(...rows)
  }
  return out
}

// --- Refunds still owed ("退點未完成", owner 2026-10-04) -----------------------
//
// refundBookingPoints (lib/bookings/refund.ts) never throws: when the wallet
// write fails it logs and returns 0, and the booking stays cancelled with
// points_charged - points_refunded > 0. Every cancel path has already flipped
// the row to cancelled by then, so nothing ever comes back for it. This queue
// is that "something", and /api/admin/refund-retry is its button.

/**
 * Cancelled rows whose unrefunded points are NOT owed, by design:
 *   rescheduled            the points moved to the new row with the lesson.
 *   partner_double_booked  a booking that failed half-way (create route): the
 *                          whole debit went back as ONE 'booking_failed'
 *                          ledger row with no booking_id, and the row was
 *                          never stamped. Retrying it would refund twice.
 */
const NOT_OWED_REASONS = new Set(['rescheduled', 'partner_double_booked'])

export type RefundCheckRow = {
  id: string
  parent_id: string | null
  status: string | null
  points_charged: number | null
  points_refunded: number | null
  cancelled_by: string | null
  cancellation_reason: string | null
  class_session_id: string | null
  lesson_group_id: string | null
}

export const refundOwedPoints = (b: { points_charged?: number | null; points_refunded?: number | null }) =>
  (Number(b.points_charged) || 0) - (Number(b.points_refunded) || 0)

/**
 * The row-level half of "is a refund still owed". The other half -- was the
 * lesson turned into a make-up voucher instead -- needs the database; see
 * voucherCoveredIds. Both the queue and the retry route use these two, so the
 * button can never act on something the queue would not show.
 */
export function refundLooksOwed(b: RefundCheckRow): boolean {
  if (b.status !== 'cancelled') return false
  if (refundOwedPoints(b) <= 0) return false
  if (b.cancellation_reason && NOT_OWED_REASONS.has(b.cancellation_reason)) return false
  // A deliberate keep: the desk cancelled without a refund (admin
  // cancel-booking refund:false, fixed class ended "keep"/"voucher").
  if (b.cancelled_by === 'admin' && b.cancellation_reason === 'cancelled_by_parent') return false
  return true
}

/**
 * Which of `rows` were turned into a make-up voucher rather than refunded.
 * Mirrors converted / convertedGroups / convertedSessions in
 * app/api/parent/wallet/route.ts: a voucher names ONE source row, but the
 * lesson it replaced can be several -- both halves of an hour share a
 * lesson_group_id, both seats of a sibling 1-on-2 share the session (and the
 * family; another family in the same group class is not covered by ours).
 */
export async function voucherCoveredIds(svc: any, rows: RefundCheckRow[]): Promise<Set<string>> {
  if (rows.length === 0) return new Set()
  const groups = [...new Set(rows.map(r => r.lesson_group_id).filter(Boolean))] as string[]
  const sessions = [...new Set(rows.map(r => r.class_session_id).filter(Boolean))] as string[]
  const [byGroup, bySession] = await Promise.all([
    inChunks(groups, c => svc.from('bookings').select('id, parent_id, class_session_id, lesson_group_id').in('lesson_group_id', c).order('id')),
    inChunks(sessions, c => svc.from('bookings').select('id, parent_id, class_session_id, lesson_group_id').in('class_session_id', c).order('id')),
  ])
  // The lesson's other rows, and the candidates themselves.
  const related = new Map<string, any>()
  for (const b of [...rows, ...byGroup, ...bySession]) related.set(b.id, b)
  const vs = await inChunks([...related.keys()], c =>
    svc.from('make_up_vouchers').select('id, source_booking_id').in('source_booking_id', c).order('id'))
  const converted = new Set<string>(vs.map((v: any) => v.source_booking_id))
  const convertedGroups = new Set<string>()
  const convertedSeats = new Set<string>()
  for (const id of converted) {
    const src = related.get(id)
    if (!src) continue
    if (src.lesson_group_id) convertedGroups.add(src.lesson_group_id)
    if (src.class_session_id) convertedSeats.add(`${src.parent_id}|${src.class_session_id}`)
  }
  const out = new Set<string>()
  for (const r of rows) {
    if (converted.has(r.id)
      || (r.lesson_group_id && convertedGroups.has(r.lesson_group_id))
      || (r.class_session_id && convertedSeats.has(`${r.parent_id}|${r.class_session_id}`))) out.add(r.id)
  }
  return out
}

export type RefundOwedItem = {
  id: string
  parent_id: string | null
  student_id: string | null
  family_name: string
  student_name: string
  session_date: string | null
  start_time: string | null
  end_time: string | null
  points_owed: number
  cancelled_at: string | null
  cancellation_reason: string | null
}

const REFUND_COLS = 'id, parent_id, student_id, status, points_charged, points_refunded, cancelled_by, cancellation_reason, cancelled_at, class_session_id, lesson_group_id'

/** Cancelled lessons whose points never made it back. Oldest first. */
async function loadRefundOwed(svc: any, withDetails: boolean): Promise<RefundOwedItem[]> {
  // Server side narrows to cancelled rows that cost points; whether any are
  // still owed is a column-to-column comparison, done here.
  const cancelled = await allRows(() => svc.from('bookings').select(REFUND_COLS)
    .eq('status', 'cancelled').gt('points_charged', 0).order('id'))
  const looks = cancelled.filter(refundLooksOwed)
  if (looks.length === 0) return []
  const covered = await voucherCoveredIds(svc, looks)
  const owed = looks.filter((b: any) => !covered.has(b.id))
  if (owed.length === 0) return []

  const parentMap: Record<string, any> = {}
  const studentMap: Record<string, any> = {}
  const sessionMap: Record<string, any> = {}
  if (withDetails) {
    const pIds = [...new Set(owed.map((b: any) => b.parent_id).filter(Boolean))] as string[]
    const sIds = [...new Set(owed.map((b: any) => b.student_id).filter(Boolean))] as string[]
    const cIds = [...new Set(owed.map((b: any) => b.class_session_id).filter(Boolean))] as string[]
    const [ps, ss, cs] = await Promise.all([
      inChunks(pIds, c => svc.from('parents').select('id, first_name, last_name').in('id', c).order('id')),
      inChunks(sIds, c => svc.from('students').select('id, full_name').in('id', c).order('id')),
      inChunks(cIds, c => svc.from('class_sessions').select('id, session_date, start_time, end_time').in('id', c).order('id')),
    ])
    for (const p of ps) parentMap[p.id] = p
    for (const s of ss) studentMap[s.id] = s
    for (const c of cs) sessionMap[c.id] = c
  }

  return owed
    .map((b: any): RefundOwedItem => {
      const p = parentMap[b.parent_id]
      const se = sessionMap[b.class_session_id]
      return {
        id: b.id,
        parent_id: b.parent_id ?? null,
        student_id: b.student_id ?? null,
        family_name: p ? `${p.first_name || ''} ${p.last_name || ''}`.trim() : '',
        student_name: studentMap[b.student_id]?.full_name || '',
        session_date: se?.session_date ?? null,
        start_time: se?.start_time ?? null,
        end_time: se?.end_time ?? null,
        points_owed: refundOwedPoints(b),
        cancelled_at: b.cancelled_at ?? null,
        cancellation_reason: b.cancellation_reason ?? null,
      }
    })
    .sort((a, b) => String(a.cancelled_at || '').localeCompare(String(b.cancelled_at || '')) || a.id.localeCompare(b.id))
}

export type AssessmentRebookItem = {
  booking_id: string
  student_id: string
  parent_id: string | null
  student_name: string
  family_name: string
  session_date: string | null
  start_time: string | null
  cancelled_at: string | null
}

/**
 * Paid Swim Assessments the school cancelled and nobody has booked again
 * (owner, 2026-10-06). The family has paid and is never asked to pay again;
 * this card is the record of what is owed until the desk books a new time
 * (Booking -> tick Swim Assessment -> the paid-assessment path). Only admins
 * see it. A swimmer drops off once any later assessment booking exists, or
 * once they have a level.
 */
async function loadAssessmentsToRebook(svc: any, withDetails: boolean): Promise<AssessmentRebookItem[]> {
  const cancelled = await allRows(() => svc.from('bookings')
    .select('id, student_id, parent_id, class_session_id, cancelled_at, created_at')
    .eq('is_trial', true).eq('status', 'cancelled')
    .in('cancellation_reason', SCHOOL_CANCEL_REASONS as unknown as string[])
    .order('id'))
  if (cancelled.length === 0) return []
  const studentIds = [...new Set(cancelled.map((b: any) => b.student_id).filter(Boolean))] as string[]
  const [students, trials] = await Promise.all([
    inChunks(studentIds, c => svc.from('students').select('id, full_name, parent_id, current_level, trial_used_at').in('id', c).order('id')),
    inChunks(studentIds, c => svc.from('bookings').select('id, student_id, created_at').eq('is_trial', true).in('student_id', c).order('id')),
  ])
  const studentMap: Record<string, any> = {}
  for (const st of students) studentMap[st.id] = st
  // The newest assessment booking per swimmer decides: a school-cancelled one
  // that is still the newest has not been booked again.
  const newest: Record<string, any> = {}
  for (const b of trials) {
    const cur = newest[b.student_id]
    if (!cur || String(b.created_at) > String(cur.created_at)) newest[b.student_id] = b
  }
  const candidates = cancelled.filter((b: any) => {
    const st = studentMap[b.student_id]
    return st && st.current_level == null && st.trial_used_at && newest[b.student_id]?.id === b.id
  })
  if (candidates.length === 0) return []
  // A payment refunded in full or charged back is not owed: the family got
  // the money back, and rebooking from this card gave them a free assessment
  // (found 2026-10-08). The cancel normally clears trial_used_at already
  // (reopenReversedAssessment); this covers a refund that arrived later.
  // Only the few swimmers left here are read.
  const reversed = await assessmentPaymentsReversed(svc, candidates.map((b: any) => b.student_id))
    .catch((e: unknown) => { console.error('rebook card: assessment payments not read:', e); return new Set<string>() })
  const owed = candidates.filter((b: any) => !reversed.has(b.student_id))
  if (owed.length === 0) return []

  const parentMap: Record<string, any> = {}
  const sessionMap: Record<string, any> = {}
  if (withDetails) {
    const pIds = [...new Set(owed.map((b: any) => b.parent_id).filter(Boolean))] as string[]
    const cIds = [...new Set(owed.map((b: any) => b.class_session_id).filter(Boolean))] as string[]
    const [ps, cs] = await Promise.all([
      inChunks(pIds, c => svc.from('parents').select('id, first_name, last_name').in('id', c).order('id')),
      inChunks(cIds, c => svc.from('class_sessions').select('id, session_date, start_time').in('id', c).order('id')),
    ])
    for (const p of ps) parentMap[p.id] = p
    for (const c of cs) sessionMap[c.id] = c
  }
  return owed.map((b: any): AssessmentRebookItem => {
    const p = parentMap[b.parent_id]
    const se = sessionMap[b.class_session_id]
    return {
      booking_id: b.id,
      student_id: b.student_id,
      parent_id: b.parent_id ?? null,
      student_name: studentMap[b.student_id]?.full_name || '',
      family_name: p ? `${p.first_name || ''} ${p.last_name || ''}`.trim() : '',
      session_date: se?.session_date ?? null,
      start_time: se?.start_time ?? null,
      cancelled_at: b.cancelled_at ?? null,
    }
  }).sort((a: AssessmentRebookItem, b: AssessmentRebookItem) => String(a.cancelled_at || '').localeCompare(String(b.cancelled_at || '')))
}

export type MonthlyQuestionItem = {
  id: string
  student_id: string | null
  parent_id: string | null
  student_name: string
  family_name: string
  email: string | null
  phone: string | null
  /** The report's month, '2026-09-01'. */
  month: string
  /** What the family wrote; may be empty (they pressed the button only). */
  comment: string | null
  asked_at: string | null
}

/**
 * Monthly reports a family answered with "I have a question" (owner,
 * 2026-10-08). The question used to sit in monthly_reports.feedback_comment
 * with no alert anywhere; now the manager is emailed when it is sent
 * (/api/parent/monthly-reports) and it waits here until marked handled
 * (/api/admin/monthly-question). question_resolved_at comes from
 * docs/migration-fix5-A.sql; before that is run the queue is empty (there
 * would be no way to clear it), and the email still goes.
 */
async function loadMonthlyQuestions(svc: any, withDetails: boolean): Promise<MonthlyQuestionItem[]> {
  const { data: rows, error } = await svc.from('monthly_reports')
    .select('id, student_id, parent_id, month, feedback_comment, feedback_at')
    .eq('feedback', 'down').is('question_resolved_at', null)
    .order('feedback_at', { ascending: true }).limit(500)
  if (error || !rows?.length) return []
  const studentMap: Record<string, any> = {}
  const parentMap: Record<string, any> = {}
  if (withDetails) {
    const sIds = [...new Set(rows.map((r: any) => r.student_id).filter(Boolean))] as string[]
    const pIds = [...new Set(rows.map((r: any) => r.parent_id).filter(Boolean))] as string[]
    const [ss, ps] = await Promise.all([
      inChunks(sIds, c => svc.from('students').select('id, full_name').in('id', c).order('id')),
      inChunks(pIds, c => svc.from('parents').select('id, first_name, last_name, email, phone').in('id', c).order('id')),
    ])
    for (const x of ss) studentMap[x.id] = x
    for (const x of ps) parentMap[x.id] = x
  }
  return rows.map((r: any): MonthlyQuestionItem => {
    const p = parentMap[r.parent_id]
    return {
      id: r.id,
      student_id: r.student_id ?? null,
      parent_id: r.parent_id ?? null,
      student_name: studentMap[r.student_id]?.full_name || '',
      family_name: p ? `${p.first_name || ''} ${p.last_name || ''}`.trim() : '',
      email: p?.email ?? null,
      phone: p?.phone ?? null,
      month: r.month,
      comment: r.feedback_comment ?? null,
      asked_at: r.feedback_at ?? null,
    }
  })
}

export type SentBackItem = {
  id: string
  student_id: string
  student_name: string
  coach_name: string
  session_date: string | null
  reason: string | null
  sent_back_at: string | null
  /** What the admin needs to file it themselves (owner, 2026-10-08). */
  class_session_id: string | null
  current_level: string | null
  /** The lesson was the swimmer's paid assessment and they still have no level. */
  assessment: boolean
  /** The lesson's coach now: the report goes under them, and they see it on
   *  their Progress page. */
  lesson_coach_id: string | null
  lesson_coach_name: string
  /** That coach is active and holds the lesson, so they can file it again. */
  coach_can_file: boolean
  /** The lesson is now another coach's than the one who filed the report. */
  moved: boolean
  start_time: string | null
  end_time: string | null
  course_type_id: string | null
  course_name: string
  /** Where the swimmer stood as of the lesson, to start the admin's form from. */
  existingProgress: Record<string, number>
  /** The level the swimmer was in at the lesson (lib/level-change
   *  levelThenFromMoves): the admin's form scores that level's skills. */
  lesson_level: string | null
}

/**
 * Lesson reports an admin sent back (owner, 2026-10-08;
 * /api/admin/report-sendback), still waiting to be filed again. Not counted in
 * the badge: the lesson's coach files it again from their Progress page. Shown
 * so a report that never came back is not forgotten -- and the admin can file
 * it themselves from here (/api/admin/sent-back-fill, or the assessment
 * backfill), which is the way out when the coach has left. The reason needs
 * docs/migration-report-sendback.sql; before it is run the list still shows,
 * without one.
 */
async function loadSentBack(svc: any): Promise<SentBackItem[]> {
  // With the migration run, only rows sent back through this flow (an older
  // 'rejected' row, if any exists, has no sent_back_at).
  const probe = await svc.from('progress_history').select('id, sent_back_at').limit(1)
  const cols = 'id, student_id, coach_id, session_date, class_session_id'
  const rows: any[] = probe.error
    ? await allRowsOrLog('review-queues sent-back', () => svc.from('progress_history')
        .select(cols).eq('status', 'rejected').order('id'))
    : await allRowsOrLog('review-queues sent-back', () => svc.from('progress_history')
        .select(cols + ', sent_back_reason, sent_back_at')
        .eq('status', 'rejected').not('sent_back_at', 'is', null).order('id'))
  if (rows.length === 0) return []
  const sIds = [...new Set(rows.map((r: any) => r.student_id).filter(Boolean))] as string[]
  const sessIds = [...new Set(rows.map((r: any) => r.class_session_id).filter(Boolean))] as string[]
  const [ss, sessions, trials, live, history, moves] = await Promise.all([
    inChunks(sIds, c => svc.from('students').select('id, full_name, current_level').in('id', c).order('id')),
    inChunks(sessIds, c => svc.from('class_sessions')
      .select('id, coach_id, start_time, end_time, course_types(id, name)').in('id', c).order('id')),
    inChunks(sessIds, c => svc.from('bookings').select('id, student_id, class_session_id')
      .in('class_session_id', c).eq('is_trial', true).neq('status', 'cancelled').order('id')),
    inChunks(sIds, c => svc.from('student_skill_progress').select('student_id, skill_id, progress_percent')
      .in('student_id', c).order('student_id').order('skill_id')),
    inChunks(sIds, c => svc.from('progress_history').select('student_id, snapshot, status, session_date, created_at')
      .in('student_id', c).in('status', ['pending_review', 'approved'])
      .order('student_id').order('session_date').order('created_at')),
    inChunks(sIds, c => svc.from('level_upgrades').select('id, student_id, from_level, upgraded_at')
      .in('student_id', c).order('id')),
  ])
  const movesBy: Record<string, any[]> = {}
  for (const m of moves) (movesBy[m.student_id] ||= []).push(m)
  const sessMap = new Map<string, any>(sessions.map((x: any) => [x.id, x]))
  const cIds = [...new Set([
    ...rows.map((r: any) => r.coach_id),
    ...sessions.map((x: any) => x.coach_id),
  ].filter(Boolean))] as string[]
  const cs = await inChunks(cIds, c => svc.from('coaches').select('id, first_name, is_active').in('id', c).order('id'))
  const sMap = new Map<string, any>(ss.map((x: any) => [x.id, x]))
  const cMap = new Map<string, any>(cs.map((x: any) => [x.id, x]))
  const trialSet = new Set<string>(trials.map((b: any) => `${b.student_id}|${b.class_session_id}`))
  const liveBy: Record<string, Record<string, number>> = {}
  for (const p of live) (liveBy[p.student_id] ||= {})[p.skill_id] = p.progress_percent
  const historyBy: Record<string, any[]> = {}
  for (const h of history) (historyBy[h.student_id] ||= []).push(h)
  return rows.map((r: any): SentBackItem => {
    const st = sMap.get(r.student_id)
    const se = r.class_session_id ? sessMap.get(r.class_session_id) : null
    const ct = se ? (Array.isArray(se.course_types) ? se.course_types[0] : se.course_types) : null
    const lessonCoachId: string | null = se?.coach_id ?? null
    const lessonCoach = lessonCoachId ? cMap.get(lessonCoachId) : null
    return {
      id: r.id,
      student_id: r.student_id,
      student_name: st?.full_name || '',
      coach_name: cMap.get(r.coach_id)?.first_name || '',
      session_date: r.session_date ?? null,
      reason: r.sent_back_reason ?? null,
      sent_back_at: r.sent_back_at ?? null,
      class_session_id: r.class_session_id ?? null,
      current_level: st?.current_level ?? null,
      assessment: !st?.current_level && trialSet.has(`${r.student_id}|${r.class_session_id}`),
      lesson_coach_id: lessonCoachId,
      lesson_coach_name: lessonCoach?.first_name || '',
      coach_can_file: !!lessonCoach && lessonCoach.is_active !== false,
      moved: !!lessonCoachId && !!r.coach_id && lessonCoachId !== r.coach_id,
      start_time: se?.start_time ?? null,
      end_time: se?.end_time ?? null,
      course_type_id: ct?.id ?? null,
      course_name: ct?.name || '',
      existingProgress: pictureAsOfRows(liveBy[r.student_id] || {}, historyBy[r.student_id] || [], r.session_date),
      lesson_level: r.session_date
        ? levelThenFromMoves(movesBy[r.student_id] || [], laWallTimeToUtcMs(r.session_date, String(se?.start_time || '00:00').slice(0, 5)), st?.current_level ?? null)
        : (st?.current_level ?? null),
    }
  }).sort((a, b) => String(a.session_date || '').localeCompare(String(b.session_date || '')))
}

export type ReviewQueues = {
  assessmentRebookList: AssessmentRebookItem[]
  recommendations: any[]
  pendingProgressList: any[]
  pastPendingProgressList: any[]
  missingProgressList: any[]
  refundOwedList: RefundOwedItem[]
  /** Coach time off covering booked lessons the office has not handled
   *  (owner, 2026-10-08; lib/time-off.ts). */
  coachTimeOffList: TimeOffActionItem[]
  /** "I have a question" on a monthly report, not yet marked handled. */
  monthlyQuestionList: MonthlyQuestionItem[]
  /** Informational only; not part of any count. Empty when withDetails is off. */
  sentBackList: SentBackItem[]
}

export async function loadReviewQueues(
  svc: any,
  { withDetails = true }: { withDetails?: boolean } = {}
): Promise<ReviewQueues> {
  // Independent of everything below, so it runs alongside it.
  const assessmentRebookPromise = loadAssessmentsToRebook(svc, withDetails).catch((e: unknown) => {
    console.error('review-queues: assessment-rebook queue failed:', e)
    return [] as AssessmentRebookItem[]
  })
  const refundOwedPromise = loadRefundOwed(svc, withDetails).catch((e: unknown) => {
    console.error('review-queues: refund-owed queue failed:', e)
    return [] as RefundOwedItem[]
  })
  const coachTimeOffPromise = timeOffNeedingAction(svc, getTodayLA(), getNowMinutesLA(), withDetails).catch((e: unknown) => {
    console.error('review-queues: coach time-off queue failed:', e)
    return [] as TimeOffActionItem[]
  })
  const monthlyQuestionPromise = loadMonthlyQuestions(svc, withDetails).catch((e: unknown) => {
    console.error('review-queues: monthly-question queue failed:', e)
    return [] as MonthlyQuestionItem[]
  })
  const sentBackPromise = withDetails
    ? loadSentBack(svc).catch((e: unknown) => {
        console.error('review-queues: sent-back list failed:', e)
        return [] as SentBackItem[]
      })
    : Promise.resolve([] as SentBackItem[])

  // Two-step query: pending recommendations
  const { data: recs } = await svc
    .from('level_recommendations')
    .select('id, recommended_level, notes, created_at, student_id, coach_id, previous_recommended_level')
    .eq('status', 'pending')
    .order('created_at', { ascending: false })

  let recommendations: any[] = []
  if (recs && recs.length > 0) {
    const studentIds = [...new Set(recs.map((r: any) => r.student_id))]
    const coachIds = [...new Set(recs.map((r: any) => r.coach_id))]
    const { data: recStudents } = await svc.from('students').select('id, full_name, current_level').in('id', studentIds)
    const { data: recCoaches } = await svc.from('coaches').select('id, first_name').in('id', coachIds)
    const sMap: Record<string, any> = {}
    for (const s of recStudents || []) sMap[s.id] = s
    const cMap: Record<string, any> = {}
    for (const c of recCoaches || []) cMap[c.id] = c

    // Fetch all of the student's history today (incl. rejected)
    // "Today" is the school's day: the UTC date and UTC midnight cut the day at
    // 5pm (4pm in winter) LA time, so after that the history went missing
    // (found 2026-10-04). LA midnight, with LA's current UTC offset.
    const today = getTodayLA()
    const laOffset = (new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', timeZoneName: 'longOffset' })
      .formatToParts(new Date()).find(p => p.type === 'timeZoneName')?.value || 'GMT-08:00').replace('GMT', '') || '-08:00'
    const { data: allHistory } = await svc
      .from('level_recommendations')
      .select('student_id, coach_id, recommended_level, previous_recommended_level, status, created_at')
      .in('student_id', studentIds)
      .gte('created_at', today + 'T00:00:00' + laOffset)
      .order('created_at', { ascending: true })

    const historyByStudent: Record<string, any[]> = {}
    for (const h of allHistory || []) {
      if (!historyByStudent[h.student_id]) historyByStudent[h.student_id] = []
      historyByStudent[h.student_id].push(h)
    }

    recommendations = recs.map((r: any) => ({
      ...r,
      student: sMap[r.student_id],
      coach: cMap[r.coach_id],
      previous_recommended_level: r.previous_recommended_level ?? null,
      history: historyByStudent[r.student_id] || [],
    }))
  }

  // Pending progress (today + all past unreviewed; nothing may slip through)
  const todayDate = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' })
  const { data: allPendingProgress } = await svc
    .from('progress_history')
    .select('id, student_id, coach_id, snapshot, session_date, created_at, class_session_id, lesson_key')
    .eq('status', 'pending_review')
    .order('created_at', { ascending: false })

  let pendingProgressList: any[] = []
  let pastPendingProgressList: any[] = []
  if (allPendingProgress && allPendingProgress.length > 0) {
    const ppStudentIds = [...new Set(allPendingProgress.map((p: any) => p.student_id))]
    const ppCoachIds = [...new Set(allPendingProgress.map((p: any) => p.coach_id).filter(Boolean))]
    const ppSessionIds = [...new Set(allPendingProgress.map((p: any) => p.class_session_id).filter(Boolean))]
    const { data: ppStudents } = await svc.from('students').select('id, full_name, current_level').in('id', ppStudentIds)
    const { data: ppCoaches } = await svc.from('coaches').select('id, first_name').in('id', ppCoachIds)
    // Active skills only: a retired one showed on the card as "not taught"
    // (found 2026-10-08).
    const { data: ppSkills } = await svc.from('skills').select('id, name, stage, sort_order, level_id').eq('is_active', true).order('stage').order('sort_order')
    const ppSMap: Record<string, any> = {}
    for (const s of ppStudents || []) ppSMap[s.id] = s
    const ppCMap: Record<string, any> = {}
    for (const c of ppCoaches || []) ppCMap[c.id] = c
    const ppSessionMap: Record<string, any> = {}
    if (ppSessionIds.length > 0) {
      const { data: ppSessions } = await svc
        .from('class_sessions')
        .select('id, start_time, end_time, course_types(id, name)')
        .in('id', ppSessionIds)
      for (const s of ppSessions || []) {
        const ct = Array.isArray((s as any).course_types) ? (s as any).course_types[0] : (s as any).course_types
        ppSessionMap[s.id] = { start_time: s.start_time, end_time: s.end_time, course_name: ct?.name || '', course_type_id: ct?.id || null }
      }
    }
    const enriched = allPendingProgress.map((p: any) => ({
      ...p,
      student: ppSMap[p.student_id],
      coach: ppCMap[p.coach_id],
      skills: ppSkills || [],
      session_info: ppSessionMap[p.class_session_id] || null,
    }))
    // The note half of the same lesson. Paired on (student, lesson_key) rather
    // than by date, because a student can have two lessons in one day and an
    // hour lesson is two sessions but one lesson.
    // Notes and their signed audio URLs are for the cards only -- a count
    // never renders them, and signing storage URLs is not free.
    const ppKeys = withDetails
      ? [...new Set(enriched.map((p: any) => p.lesson_key).filter(Boolean))]
      : []
    const noteByPair: Record<string, any> = {}
    if (ppKeys.length > 0) {
      const { data: ppNotes } = await svc
        .from('lesson_notes')
        .select('id, student_id, lesson_key, transcript, note, language, audio_seconds, audio_path')
        .in('lesson_key', ppKeys)
        .neq('status', 'rejected')
      const notePaths = (ppNotes || []).map((n: any) => n.audio_path).filter(Boolean)
      const signedByPath: Record<string, string> = {}
      if (notePaths.length > 0) {
        const { data: signed } = await svc.storage
          .from('lesson-audio').createSignedUrls(notePaths, 60 * 60)
        for (const s of signed || []) {
          if (s.path && s.signedUrl) signedByPath[s.path] = s.signedUrl
        }
      }
      for (const n of ppNotes || []) {
        noteByPair[`${n.student_id}|${n.lesson_key}`] = {
          id: n.id,
          transcript: n.transcript || '',
          note: n.note || '',
          language: n.language || 'en',
          audio_seconds: n.audio_seconds,
          audio_url: n.audio_path ? (signedByPath[n.audio_path] || null) : null,
        }
      }
    }
    for (const p of enriched as any[]) {
      // Older rows predate the merge and have no note; the card copes with null.
      p.note = noteByPair[`${p.student_id}|${p.lesson_key}`] || null
    }

    /* An assessment is one report with a level attached: the coach's pending
       recommendation arrived with it (coaches have no other way to send one
       now). The two are paired here and shown as ONE card, confirmed with one
       button -- the note must never publish without the level it was written
       for, and the recommendation leaves the separate list so it is not
       counted twice. Paired on the swimmer, not on "has no level": a confirm
       that failed after moving the level must still come back as one card. */
    const recByStudent: Record<string, any> = {}
    for (const r of recommendations) if (!recByStudent[r.student_id]) recByStudent[r.student_id] = r
    const pairedRecIds = new Set<string>()
    for (const p of enriched as any[]) {
      const rec = recByStudent[p.student_id]
      if (rec && !pairedRecIds.has(rec.id)) {
        p.assessment = { recommendation_id: rec.id, recommended_level: Number(rec.recommended_level) }
        pairedRecIds.add(rec.id)
      }
    }
    recommendations = recommendations.filter((r: any) => !pairedRecIds.has(r.id))

    pendingProgressList = enriched.filter((p: any) => p.session_date === todayDate)
    pastPendingProgressList = enriched.filter((p: any) => p.session_date !== todayDate)
  }

  // Missing: students with a confirmed booking but no progress_history on any day, today or earlier (not just today, so forgotten days aren't lost)
  // Paged, and every .in() below is chunked: this reads every confirmed
  // booking ever made, which passed the API's 1,000-row cap long ago.
  const pastBookingsRaw = await allRows(() => svc
    .from('bookings')
    .select('id, student_id, class_session_id, lesson_group_id, is_trial')
    .eq('status', 'confirmed')
    .order('id'))

  // Absent students need no progress: keep only bookings with an attendance row (checked in)
  let pastBookings: any[] = []
  if (pastBookingsRaw.length > 0) {
    const attRows = await inChunks(pastBookingsRaw.map((b: any) => b.id), c => svc
      .from('attendance')
      .select('booking_id')
      .in('booking_id', c)
      .order('booking_id').order('student_id'))
    const attendedSet = new Set(attRows.map((r: any) => r.booking_id))
    pastBookings = pastBookingsRaw.filter((b: any) => attendedSet.has(b.id))
  }

  let missingProgressList: any[] = []
  if (pastBookings && pastBookings.length > 0) {
    const bSessionIds = [...new Set(pastBookings.map((b: any) => b.class_session_id).filter(Boolean))] as string[]
    const pastSessions = await inChunks(bSessionIds, c => svc
      .from('class_sessions')
      .select('id, session_date, coach_id, start_time, end_time, course_types(id, name), coaches(first_name)')
      .in('id', c)
      .lte('session_date', todayDate)
      .order('id'))

    const sessionMap: Record<string, any> = {}
    for (const s of pastSessions) {
      const ct = Array.isArray((s as any).course_types) ? (s as any).course_types[0] : (s as any).course_types
      const coach = Array.isArray((s as any).coaches) ? (s as any).coaches[0] : (s as any).coaches
      sessionMap[s.id] = { ...s, ct, coach }
    }

    // Each booking maps to one (student_id, session_date) pair: this student had a lesson that day
    const candidates = pastBookings
      .filter((b: any) => sessionMap[b.class_session_id])
      .map((b: any) => ({
        student_id: b.student_id,
        lessonKey: b.lesson_group_id || b.class_session_id,
        session: sessionMap[b.class_session_id],
        isTrial: !!b.is_trial,
      }))
      .filter((c: any) => c.student_id)

    if (candidates.length > 0) {
      const candidateStudentIds = [...new Set(candidates.map((c: any) => c.student_id))] as string[]
      // A swimmer has a row per lesson, so this passes 1,000 rows on its own;
      // a missing page here would report taught-and-recorded lessons as missing.
      const existingHistory = await inChunks(candidateStudentIds, c => svc
        .from('progress_history')
        .select('student_id, session_date, class_session_id')
        .in('student_id', c)
        .lte('session_date', todayDate)
        .order('id'))

      // A lesson = lesson_group_id when set, else the single session. An hour lesson is
      // two class_sessions but ONE lesson; two separate lessons the same day are two.
      const lessonOf: Record<string, string> = {}
      for (const b of pastBookings) {
        if (b.class_session_id) lessonOf[b.class_session_id] = b.lesson_group_id || b.class_session_id
      }
      const doneLessons = new Set<string>()
      const doneDays = new Set<string>()
      for (const p of existingHistory) {
        if (p.class_session_id) {
          doneLessons.add(`${p.student_id}|${lessonOf[p.class_session_id] || p.class_session_id}`)
        } else {
          // Legacy rows with no session reference: fall back to the old per-day rule
          doneDays.add(`${p.student_id}|${p.session_date}`)
        }
      }
      const missingCandidates = candidates.filter((c: any) =>
        !doneLessons.has(`${c.student_id}|${c.lessonKey}`) &&
        !doneDays.has(`${c.student_id}|${c.session.session_date}`)
      )
      missingCandidates.sort((a: any, b: any) =>
        String(a.session.session_date).localeCompare(String(b.session.session_date)) ||
        String(a.session.start_time).localeCompare(String(b.session.start_time)))

      // One row per lesson; an hour lesson's two halves merge into a single span
      const spanOf: Record<string, { start: string; end: string }> = {}
      for (const c of missingCandidates as any[]) {
        const k = `${c.student_id}|${c.lessonKey}`
        const cur = spanOf[k]
        if (!cur) { spanOf[k] = { start: c.session.start_time, end: c.session.end_time }; continue }
        if (String(c.session.start_time) < cur.start) cur.start = c.session.start_time
        if (String(c.session.end_time) > cur.end) cur.end = c.session.end_time
      }
      const assessmentLessons = new Set<string>(missingCandidates
        .filter((c: any) => c.isTrial).map((c: any) => `${c.student_id}|${c.lessonKey}`))
      const dedupKey = new Set<string>()
      const dedupedCandidates = missingCandidates.filter((c: any) => {
        const key = `${c.student_id}|${c.lessonKey}`
        if (dedupKey.has(key)) return false
        dedupKey.add(key)
        return true
      })

      if (dedupedCandidates.length > 0) {
        const missingIds = [...new Set(dedupedCandidates.map((c: any) => c.student_id))] as string[]
        const missingStudents = await inChunks(missingIds, c => svc
          .from('students')
          .select('id, full_name, current_level')
          .in('id', c)
          .order('id'))

        const studentMap: Record<string, any> = {}
        for (const s of missingStudents) studentMap[s.id] = s

        // Prefilled percentages are what the admin edits before submitting;
        // a count has nothing to prefill. One row per swimmer per skill, so
        // this one passes 1,000 rows with a few dozen swimmers.
        const existingProgress = withDetails
          ? await inChunks(missingIds, c => svc
              .from('student_skill_progress')
              .select('student_id, skill_id, progress_percent')
              .in('student_id', c)
              .order('student_id').order('skill_id'))
          : []

        const progressByStudent: Record<string, Record<string, number>> = {}
        for (const p of existingProgress) {
          if (!progressByStudent[p.student_id]) progressByStudent[p.student_id] = {}
          progressByStudent[p.student_id][p.skill_id] = p.progress_percent
        }
        // The live table is approved scores only. A coach's reports still in
        // Reviews, for lessons up to the missing one, are laid over it --
        // per lesson, by date -- so the card starts where the swimmer
        // actually stood, not before the coach's newer marks (found
        // 2026-10-06; /api/coach/progress fills untouched skills the same way).
        const historyRows = withDetails
          ? await inChunks(missingIds, c => svc
              .from('progress_history')
              .select('student_id, snapshot, status, session_date, created_at')
              .in('student_id', c)
              .in('status', ['pending_review', 'approved'])
              .order('student_id').order('session_date').order('created_at'))
          : []
        const historyByStudent: Record<string, any[]> = {}
        for (const h of historyRows) (historyByStudent[h.student_id] ||= []).push(h)
        // Level changes, so the form scores the level of the lesson rather
        // than today's (found 2026-10-08; /api/coach/progress POST files it so).
        const moveRows = withDetails
          ? await inChunks(missingIds, c => svc.from('level_upgrades')
              .select('id, student_id, from_level, upgraded_at').in('student_id', c).order('id'))
          : []
        const movesByStudent: Record<string, any[]> = {}
        for (const m of moveRows) (movesByStudent[m.student_id] ||= []).push(m)
        // The approved picture is rolled back to the missing lesson's date
        // too, not only the pending one: the live table holds scores approved
        // for LATER lessons (found 2026-10-07; lib/skill-progress-sync
        // pictureAsOfRows).
        const pictureAsOf = (studentId: string, date: string | null | undefined) =>
          pictureAsOfRows(progressByStudent[studentId] || {}, historyByStudent[studentId] || [], date)

        missingProgressList = dedupedCandidates
          .filter((c: any) => studentMap[c.student_id])
          .map((c: any) => {
            const sp = spanOf[`${c.student_id}|${c.lessonKey}`]
            return {
              ...studentMap[c.student_id],
              id: `${c.student_id}_${c.lessonKey}`,
              student_id: c.student_id,
              session: sp ? { ...c.session, start_time: sp.start, end_time: sp.end } : c.session,
              existingProgress: withDetails ? pictureAsOf(c.student_id, c.session?.session_date) : {},
              lesson_level: withDetails && c.session?.session_date
                ? levelThenFromMoves(movesByStudent[c.student_id] || [], laWallTimeToUtcMs(c.session.session_date, String((sp?.start || c.session.start_time) || '00:00').slice(0, 5)), studentMap[c.student_id].current_level ?? null)
                : (studentMap[c.student_id].current_level ?? null),
              // A paid Swim Assessment: with no level yet, the card offers to
              // backfill it (/api/admin/backfill-assessment).
              assessment: (assessmentLessons.has(`${c.student_id}|${c.lessonKey}`)) || undefined,
            }
          })
      }
    }
  }

  const refundOwedList = await refundOwedPromise
  const assessmentRebookList = await assessmentRebookPromise
  const coachTimeOffList = await coachTimeOffPromise
  const sentBackList = await sentBackPromise
  const monthlyQuestionList = await monthlyQuestionPromise

  return { assessmentRebookList, recommendations, pendingProgressList, pastPendingProgressList, missingProgressList, refundOwedList, coachTimeOffList, monthlyQuestionList, sentBackList }
}

/** Just the totals, for the sidebar badge. Skips the display-only enrichment. */
export async function countReviewQueues(svc: any): Promise<{ total: number; missing: number; pending: number; recommendations: number; refundOwed: number; assessmentRebook: number; coachTimeOff: number; monthlyQuestions: number }> {
  const q = await loadReviewQueues(svc, { withDetails: false })
  const pending = q.pendingProgressList.length + q.pastPendingProgressList.length
  return {
    total: q.missingProgressList.length + pending + q.recommendations.length + q.refundOwedList.length + q.assessmentRebookList.length + q.coachTimeOffList.length + q.monthlyQuestionList.length,
    missing: q.missingProgressList.length,
    pending,
    recommendations: q.recommendations.length,
    refundOwed: q.refundOwedList.length,
    assessmentRebook: q.assessmentRebookList.length,
    coachTimeOff: q.coachTimeOffList.length,
    monthlyQuestions: q.monthlyQuestionList.length,
  }
}
