// The Swim Assessment report and the assessment credit (owner's rules, 2026-09-30).
//
// Report: when an admin confirms an assessment in Reviews, they also pick the
// course and how many lessons a week the school recommends, with an optional
// one-line reason. The family then sees the whole report on the dashboard
// (student card -> "Assessment report") and gets an email saying it is there.
//
// Credit: once the swimmer has taken 8 lessons within 60 days of the
// assessment, the family receives ASSESSMENT_POINTS (85) granted points -- the
// assessment fee, handed back. A lesson counts when it is:
//   - this swimmer's, not cancelled, and its date is already past;
//   - paid at least partly with PURCHASED points (not all granted) and not
//     refunded in full -- which also leaves out Swim Team, a subscription that
//     never touches points;
//   - OR a make-up booked with a voucher (補課券), when the lesson the voucher
//     replaced was paid that way (owner, 2026-10-07). The make-up row itself
//     carries 0 points and the replaced lesson is cancelled, so neither used
//     to count: one leave or grace cost the family a lesson toward the 8 even
//     though the child swam it (found 2026-10-07). A voucher with no source
//     lesson (issued by hand) paid for nothing and does not count;
//   - not the assessment itself;
//   - dated from the assessment day up to and including the deadline.
// A 60-minute lesson is two half-hour bookings and counts as 2 (owner, same day).
// When the 60 days pass without 8 lessons the credit simply lapses -- no notice.
//
// Everything here runs with the service client; student_assessments has RLS on
// and no policy, so the browser only ever sees what these functions return.

import { applyPoints } from '@/lib/points-wallet'
import { ASSESSMENT_POINTS, ASSESSMENT_CREDIT_LESSONS, ASSESSMENT_CREDIT_DAYS } from '@/lib/points'
import { getTodayLA } from '@/lib/date'
import { allRows } from '@/lib/db-paging'
import { detectNoteLanguage, SUPPORTED_NOTE_LANGUAGES } from '@/lib/ai/models'
import { loadGlossary, translateOnce } from '@/lib/ai/translate-note'

type Svc = any

export const CREDIT_LESSONS = ASSESSMENT_CREDIT_LESSONS
export const CREDIT_DAYS = ASSESSMENT_CREDIT_DAYS
export const CREDIT_POINTS = ASSESSMENT_POINTS

export const RECOMMENDED_COURSES = ['1on1', '1on2', '1on4', 'team'] as const
export type RecommendedCourse = (typeof RECOMMENDED_COURSES)[number]
export const WEEKLY_FREQUENCIES = ['1', '1-2', '2', '2-3', '3'] as const
export type WeeklyFrequency = (typeof WEEKLY_FREQUENCIES)[number]

export const isRecommendedCourse = (v: unknown): v is RecommendedCourse =>
  (RECOMMENDED_COURSES as readonly string[]).includes(String(v))
export const isWeeklyFrequency = (v: unknown): v is WeeklyFrequency =>
  (WEEKLY_FREQUENCIES as readonly string[]).includes(String(v))

export const RECOMMENDATION_NOTE_MAX = 300

/** 'YYYY-MM-DD' + n days, as a date (no time zone involved). */
export function addDays(date: string, n: number): string {
  const d = new Date(date + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/** Whole days from today to the deadline, counting the deadline day itself. */
export function daysLeft(deadline: string, today: string): number {
  const ms = Date.parse(deadline + 'T00:00:00Z') - Date.parse(today + 'T00:00:00Z')
  return Math.floor(ms / 86_400_000) + 1
}

/** The recommendation line in all three languages. The admin may write it in
 *  any of them; whatever cannot be translated falls back to the original. */
export async function translateRecommendation(svc: Svc, text: string): Promise<Record<string, string>> {
  const source = text.trim()
  if (!source) return {}
  const lang = detectNoteLanguage(source, 'en')
  const out: Record<string, string> = { [lang]: source }
  const glossary = await loadGlossary(svc).catch(() => [] as string[])
  for (const target of SUPPORTED_NOTE_LANGUAGES) {
    if (target === lang) continue
    const t = await translateOnce(source, target, glossary) ?? await translateOnce(source, target, glossary)
    if (t) out[target] = t
  }
  return out
}

/** How many lessons count toward the credit so far (see the rules above). */
export async function countCreditLessons(
  svc: Svc,
  row: { student_id: string; assessed_on: string; credit_deadline: string },
  today = getTodayLA(),
): Promise<number> {
  const { data: bookings, error: bookingsErr } = await svc.from('bookings')
    .select('class_session_id, points_charged, points_granted, points_refunded, is_trial, voucher_id')
    .eq('student_id', row.student_id)
    .not('points_charged', 'is', null)
    .not('status', 'in', '("cancelled","in_cart","pending_partner","pending_payment")')
  if (bookingsErr) throw new Error(bookingsErr.message)
  const boughtWithPurchased = (b: any) =>
    (b.points_charged ?? 0) > (b.points_granted ?? 0)
    && (b.points_refunded ?? 0) < (b.points_charged ?? 0)

  // Make-ups: what did the replaced lesson cost? The voucher names one source
  // row; a sibling 1-on-2 voucher covers two children, so for the second
  // child the row read is their own seat in that same lesson when there is one.
  const voucherIds = [...new Set((bookings || [])
    .filter((b: any) => !b.is_trial && b.voucher_id && !boughtWithPurchased(b))
    .map((b: any) => b.voucher_id as string))]
  const fundedVouchers = new Set<string>()
  if (voucherIds.length > 0) {
    const { data: vouchers, error: vErr } = await svc.from('make_up_vouchers')
      .select('id, source_booking_id').in('id', voucherIds)
    if (vErr) throw new Error(vErr.message)
    const sourceIds = [...new Set((vouchers || []).map((v: any) => v.source_booking_id).filter(Boolean))] as string[]
    if (sourceIds.length > 0) {
      const { data: sources, error: sErr } = await svc.from('bookings')
        .select('id, student_id, class_session_id, points_charged, points_granted, points_refunded')
        .in('id', sourceIds)
      if (sErr) throw new Error(sErr.message)
      const sourceById = new Map<string, any>((sources || []).map((x: any) => [x.id, x]))
      const otherSeatSessions = [...new Set((sources || [])
        .filter((x: any) => x.student_id !== row.student_id && x.class_session_id)
        .map((x: any) => x.class_session_id))] as string[]
      const ownSeat = new Map<string, any>()
      if (otherSeatSessions.length > 0) {
        const { data: seats, error: seatErr } = await svc.from('bookings')
          .select('class_session_id, points_charged, points_granted, points_refunded')
          .eq('student_id', row.student_id).in('class_session_id', otherSeatSessions)
        if (seatErr) throw new Error(seatErr.message)
        for (const x of seats || []) ownSeat.set(x.class_session_id, x)
      }
      for (const v of vouchers || []) {
        const src = sourceById.get(v.source_booking_id)
        if (!src) continue
        const paidRow = src.student_id === row.student_id ? src : (ownSeat.get(src.class_session_id) || src)
        if (boughtWithPurchased(paidRow)) fundedVouchers.add(v.id)
      }
    }
  }

  const paid = (bookings || []).filter((b: any) =>
    !b.is_trial
    && (boughtWithPurchased(b) || (b.voucher_id && fundedVouchers.has(b.voucher_id))))
  if (paid.length === 0) return 0
  const { data: sessions } = await svc.from('class_sessions')
    .select('id, session_date')
    .in('id', [...new Set(paid.map((b: any) => b.class_session_id))])
    .gte('session_date', row.assessed_on)
    .lte('session_date', row.credit_deadline)
    .lt('session_date', today)
  const inWindow = new Set((sessions || []).map((s: any) => s.id))
  return paid.filter((b: any) => inWindow.has(b.class_session_id)).length
}

/** Was this swimmer's Swim Assessment payment taken back (a chargeback or a
 *  returned payment)? The assessment purchase is found through its
 *  assessment credit, which every way of paying for one writes. */
export async function assessmentPaymentReversed(svc: Svc, studentId: string): Promise<boolean> {
  const { data: credits, error } = await svc.from('lesson_credits')
    .select('purchase_id').eq('student_id', studentId).eq('is_trial', true)
  if (error) throw new Error(error.message)
  const ids = [...new Set((credits || []).map((c: { purchase_id: string | null }) => c.purchase_id).filter(Boolean))] as string[]
  if (ids.length === 0) return false
  const { data: rev, error: revErr } = await svc.from('purchases')
    .select('id').in('id', ids).not('reversed_at', 'is', null).limit(1)
  if (revErr) throw new Error(revErr.message)
  return !!(rev && rev.length > 0)
}

/**
 * Pays every assessment credit that has now reached 8 lessons, and closes the
 * ones whose 60 days are over. Run daily with the other points jobs.
 *
 * Claimed (pending -> awarded) BEFORE the points move, so two overlapping runs
 * cannot pay twice; if the grant then fails, the claim is put back for
 * tomorrow. The lesson on the deadline day itself is only "past" the day after,
 * so a row is expired only once today is later than the deadline.
 */
export async function settleAssessmentCredits(svc: Svc): Promise<{ awarded: number; expired: number; failed: number }> {
  const today = getTodayLA()
  // Paged (lib/db-paging): past 1,000 open credits a single read left the
  // rest neither paid nor closed. A failed read throws, so the cron reports it.
  const { data: pending, error: pendingErr } = await allRows(() => svc.from('student_assessments')
    .select('id, student_id, parent_id, assessed_on, credit_deadline')
    .eq('credit_status', 'pending')
    .order('id'))
  if (pendingErr) throw new Error(`pending assessment credits not read: ${pendingErr.message || pendingErr}`)
  let awarded = 0, expired = 0, failed = 0

  for (const r of pending) {
    let count = 0
    try { count = await countCreditLessons(svc, r, today) } catch (e) {
      console.error(`assessment credit ${r.id}: could not count lessons:`, e)
      failed++
      continue
    }

    if (count < CREDIT_LESSONS) {
      if (today > r.credit_deadline) {
        const { data: closed } = await svc.from('student_assessments')
          .update({ credit_status: 'expired' }).eq('id', r.id).eq('credit_status', 'pending').select('id')
        if (closed && closed.length) expired++
      }
      continue
    }

    // An assessment whose payment was charged back (or returned) earns no
    // credit: the family would get the fee back twice (owner, 2026-10-08).
    // The webhook closes the credit when the dispute arrives; this catches a
    // report confirmed after that, which starts out pending again.
    let reversed = false
    try { reversed = await assessmentPaymentReversed(svc, r.student_id) } catch (e) {
      console.error(`assessment credit ${r.id}: could not check the assessment payment:`, e)
      failed++
      continue
    }
    if (reversed) {
      const { data: closed } = await svc.from('student_assessments')
        .update({ credit_status: 'expired' }).eq('id', r.id).eq('credit_status', 'pending').select('id')
      if (closed && closed.length) expired++
      continue
    }

    const { data: claimed } = await svc.from('student_assessments')
      .update({ credit_status: 'awarded', credit_awarded_at: new Date().toISOString() })
      .eq('id', r.id).eq('credit_status', 'pending')
      .select('id')
    if (!claimed || claimed.length === 0) continue

    const { data: st } = await svc.from('students').select('full_name').eq('id', r.student_id).maybeSingle()
    try {
      const res = await applyPoints(svc, {
        parentId: r.parent_id, reason: 'assessment_credit', points: CREDIT_POINTS,
        toGranted: true, actor: 'system', note: st?.full_name || undefined,
      })
      await svc.from('student_assessments').update({ credit_ledger_id: res.ledgerId }).eq('id', r.id)
      awarded++
    } catch (e) {
      console.error(`assessment credit ${r.id}: could not credit the family; will retry tomorrow:`, e)
      await svc.from('student_assessments')
        .update({ credit_status: 'pending', credit_awarded_at: null }).eq('id', r.id)
      failed++
    }
  }
  return { awarded, expired, failed }
}

export type AssessmentReport = {
  studentId: string
  assessedOn: string
  coachName: string | null
  level: number
  /** The level the coach scored against; differs from `level` only when the admin placed the swimmer elsewhere. */
  scoredLevel: number | null
  skills: { id: string; name: string; stage: number; sortOrder: number; percent: number }[]
  note: string | null
  course: RecommendedCourse
  frequency: WeeklyFrequency
  reason: string | null
  credit: {
    status: 'pending' | 'awarded' | 'expired'
    lessons: number
    needed: number
    points: number
    deadline: string
    daysLeft: number
  }
}

/** Every assessment report for one family, in the language they are reading. */
export async function assessmentsForParent(svc: Svc, parentId: string, lang: string): Promise<AssessmentReport[]> {
  const { data: rows } = await svc.from('student_assessments')
    .select('id, student_id, progress_history_id, lesson_note_id, assessed_on, level_number, recommended_course, weekly_frequency, recommendation_note, recommendation_note_i18n, credit_deadline, credit_status')
    .eq('parent_id', parentId)
  if (!rows || rows.length === 0) return []
  const today = getTodayLA()

  const histIds = rows.map((r: any) => r.progress_history_id).filter(Boolean)
  const noteIds = rows.map((r: any) => r.lesson_note_id).filter(Boolean)
  const [{ data: hists }, { data: notes }, { data: trans }] = await Promise.all([
    histIds.length ? svc.from('progress_history').select('id, snapshot, coach_id').in('id', histIds) : { data: [] },
    noteIds.length ? svc.from('lesson_notes').select('id, note, language, status').in('id', noteIds) : { data: [] },
    noteIds.length ? svc.from('lesson_note_translations').select('lesson_note_id, text').in('lesson_note_id', noteIds).eq('language', lang) : { data: [] },
  ])
  const histById = new Map((hists || []).map((h: any) => [h.id, h]))
  const noteById = new Map((notes || []).map((n: any) => [n.id, n]))
  const transById = new Map((trans || []).map((t: any) => [t.lesson_note_id, t.text]))

  const coachIds = [...new Set((hists || []).map((h: any) => h.coach_id).filter(Boolean))]
  const skillIds = [...new Set((hists || []).flatMap((h: any) => Object.keys(h.snapshot || {})))]
  const [{ data: coaches }, { data: skills }] = await Promise.all([
    coachIds.length ? svc.from('coaches').select('id, first_name').in('id', coachIds) : { data: [] },
    skillIds.length ? svc.from('skills').select('id, name, stage, sort_order, level_id').in('id', skillIds) : { data: [] },
  ])
  const levelIds = [...new Set((skills || []).map((s: any) => s.level_id).filter(Boolean))]
  const { data: levels } = levelIds.length
    ? await svc.from('levels').select('id, level_number').in('id', levelIds)
    : { data: [] as any[] }
  const coachName = new Map((coaches || []).map((c: any) => [c.id, c.first_name]))
  const skillById = new Map((skills || []).map((s: any) => [s.id, s]))
  const levelNumber = new Map<string, number>((levels || []).map((l: any) => [l.id, Number(l.level_number)]))

  const out: AssessmentReport[] = []
  for (const r of rows as any[]) {
    const h: any = histById.get(r.progress_history_id)
    const snap: Record<string, number> = h?.snapshot || {}
    const list = Object.entries(snap)
      .map(([id, pct]) => {
        const s: any = skillById.get(id)
        return s ? { id, name: s.name, stage: Number(s.stage) || 1, sortOrder: Number(s.sort_order) || 0, percent: Number(pct) || 0, levelId: s.level_id } : null
      })
      .filter(Boolean) as any[]
    list.sort((a, b) => a.stage - b.stage || a.sortOrder - b.sortOrder)
    const scoredLevel = list.length ? (levelNumber.get(list[0].levelId) ?? null) : null

    const n: any = noteById.get(r.lesson_note_id)
    const noteText = n && n.status === 'approved'
      ? (n.language === lang ? n.note : (transById.get(n.id) || n.note)) : null

    const i18n = r.recommendation_note_i18n || {}
    const reason = r.recommendation_note ? (i18n[lang] || r.recommendation_note) : null

    const lessons = r.credit_status === 'pending' ? await countCreditLessons(svc, r, today).catch(() => 0) : 0
    out.push({
      studentId: r.student_id,
      assessedOn: r.assessed_on,
      coachName: h?.coach_id ? (coachName.get(h.coach_id) as string) || null : null,
      level: Number(r.level_number),
      scoredLevel,
      skills: list.map(({ levelId, ...s }) => s),
      note: noteText ? String(noteText) : null,
      course: r.recommended_course,
      frequency: r.weekly_frequency,
      reason,
      credit: {
        status: r.credit_status,
        lessons: Math.min(lessons, CREDIT_LESSONS),
        needed: CREDIT_LESSONS,
        points: CREDIT_POINTS,
        deadline: r.credit_deadline,
        daysLeft: daysLeft(r.credit_deadline, today),
      },
    })
  }
  return out
}
