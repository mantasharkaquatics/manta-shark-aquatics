'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { formatTime12h } from '@/lib/date'
import AdminLessonNoteReview from '../upgrades/AdminLessonNoteReview'
import AlertModal from '@/components/AlertModal'
import NoteTranslationHealth from './NoteTranslationHealth'
import AssessmentPanel, { type AssessmentRec } from './AssessmentPanel'
import { LEVEL_NAMES, LEVEL_COLORS, LEVEL_NUMBERS } from '@/lib/levels'
import { MASTERY_LEVELS, MASTERY_VALUE, MASTERY_COLOR, MASTERY_FILL, masteryOf, masteryKey, type Mastery } from '@/lib/mastery'
import { useT, useLocale } from '@/lib/i18n/provider'
import { tDb, dateTag, type Locale, type TFunction } from '@/lib/i18n'
import type { TimeOffActionItem } from '@/lib/time-off'

type Level = { id: string; level_number: number; name: string }
type Skill = { id: string; name: string; sort_order: number; level_id: string }
type PendingProgress = {
  id: string; student_id: string; snapshot: Record<string, number>; session_date: string; created_at: string
  student: { id: string; full_name: string; current_level: string | null }
  coach: { first_name: string }
  skills: { id: string; name: string; sort_order: number; level_id: string }[]
  session_info: { start_time: string; end_time: string; course_name: string; course_type_id?: string | null } | null
  /** Set when this report is a swimmer's assessment: the level arrives with it. */
  assessment?: { recommendation_id: string; recommended_level: number }
  coach_id?: string | null
}
type Recommendation = {
  id: string; recommended_level: number; notes: string | null; created_at: string; previous_recommended_level: number | null
  student: { id: string; full_name: string; current_level: string | null }
  coach: { first_name: string }
  history: { recommended_level: number; previous_recommended_level: number | null; status: string; created_at: string }[]
}
type MissingProgress = {
  id: string
  student_id: string
  full_name: string
  current_level: string | null
  session: { id: string; session_date: string; start_time: string; end_time: string; coach_id: string; ct: { id?: string; name: string } | null; coach: { first_name: string } | null } | null
  existingProgress: Record<string, number>
  /** The lesson was a paid Swim Assessment (lib/admin/review-queues). */
  assessment?: boolean
}

/** A report sent back to its coach, waiting to be filed again (lib/admin/review-queues). */
type SentBack = {
  id: string
  student_name: string
  coach_name: string
  session_date: string | null
  reason: string | null
  // For the admin's own filing; absent on a row this screen just sent back.
  student_id?: string
  class_session_id?: string | null
  current_level?: string | null
  assessment?: boolean
  lesson_coach_id?: string | null
  lesson_coach_name?: string
  coach_can_file?: boolean
  moved?: boolean
  start_time?: string | null
  end_time?: string | null
  course_type_id?: string | null
  course_name?: string
  existingProgress?: Record<string, number>
}

/** A sent-back report as a missing-progress card, so the admin files it with the same form. */
function sentBackAsMissing(b: SentBack): MissingProgress {
  return {
    id: 'sb_' + b.id,
    student_id: b.student_id || '',
    full_name: b.student_name,
    current_level: b.current_level ?? null,
    session: b.class_session_id ? {
      id: b.class_session_id,
      session_date: b.session_date || '',
      start_time: b.start_time || '',
      end_time: b.end_time || '',
      coach_id: b.lesson_coach_id || '',
      ct: { id: b.course_type_id || undefined, name: b.course_name || '' },
      coach: { first_name: b.lesson_coach_name || '' },
    } : null,
    existingProgress: b.existingProgress || {},
    assessment: b.assessment || undefined,
  }
}

/** A cancelled lesson whose points never reached the wallet (lib/admin/review-queues.ts). */
type AssessmentRebook = {
  booking_id: string
  student_id: string
  student_name: string
  family_name: string
  session_date: string | null
  start_time: string | null
  cancelled_at: string | null
}
type RefundOwed = {
  id: string
  family_name: string
  student_name: string
  session_date: string | null
  start_time: string | null
  end_time: string | null
  points_owed: number
  cancelled_at: string | null
}

/** Mastery chip text. Step 0 reads "Not taught" here, not the parent site's "Not taught yet". */
function masteryLabel(t: TFunction, m: Mastery): string {
  return m === 0 ? t('admin.progress.mastery0') : t(masteryKey(m))
}

/**
 * The admin's words for a failed request. The routes answer in English (for
 * logs) with a `code`; the cases the desk will meet each have a line here, and
 * anything else gets the generic line for that button, never the raw English.
 */
const ERROR_KEYS: Record<string, string> = {
  pick_recommendation: 'admin.reviews.err.pickRecommendation',
  pick_level: 'admin.reviews.err.pickLevel',
  already_confirmed: 'admin.reviews.err.alreadyDone',
  already_reviewed: 'admin.reviews.err.alreadyDone',
  already_answered: 'admin.reviews.err.alreadyDone',
  already_filed: 'admin.reviews.err.alreadyFiled',
  has_level: 'admin.reviews.err.hasLevel',
  no_level: 'admin.reviews.err.noLevel',
  assessment_no_level: 'admin.reviews.err.noLevel',
  busy: 'admin.reviews.err.busy',
  mismatch: 'admin.reviews.err.mismatch',
  not_found: 'admin.reviews.err.notFound',
  note_too_long: 'admin.reviews.err.noteTooLong',
  not_assessment: 'admin.reviews.err.notAssessment',
  no_coach: 'admin.reviews.err.noCoach',
  reason_required: 'admin.reviews.sendBack.err.reason',
  reason_too_long: 'admin.reviews.sendBack.err.reasonTooLong',
  needs_migration: 'admin.reviews.sendBack.err.migration',
  confirm_started: 'admin.reviews.sendBack.err.confirmStarted',
  bad_score: 'admin.reviews.err.submitFailed',
}
function errorText(t: TFunction, data: unknown, fallbackKey: string): string {
  const code = String((data as { code?: unknown } | null)?.code || '')
  return t(ERROR_KEYS[code] || fallbackKey)
}

/**
 * The level a report was scored at: the level most of its snapshot's skills
 * belong to. Not the swimmer's level today -- a report still waiting after the
 * swimmer was moved used to list the NEW level's skills, all "not taught",
 * and hide every mark the coach made (found 2026-10-08).
 */
function reportLevelNumber(p: PendingProgress, levels: Level[]): string {
  if (p.assessment) return String(p.assessment.recommended_level)
  const byLevel: Record<string, number> = {}
  const skillLevel = new Map(p.skills.map(sk => [sk.id, sk.level_id]))
  for (const id of Object.keys(p.snapshot || {})) {
    const lv = skillLevel.get(id)
    if (lv) byLevel[lv] = (byLevel[lv] || 0) + 1
  }
  const top = Object.entries(byLevel).sort((a, b) => b[1] - a[1])[0]
  const lvl = top ? levels.find(l => l.id === top[0]) : null
  return lvl ? String(lvl.level_number) : String(p.student?.current_level ?? '')
}

const SENDBACK_REASON_MAX = 300

/** "Oct 2, 03:35 PM": the date in the admin's language, the clock time kept as 12-hour English. */
function dateTimeLabel(iso: string, locale: Locale): string {
  const d = new Date(iso)
  const date = d.toLocaleDateString(dateTag(locale, 'en-US'), { month: 'short', day: 'numeric' })
  const time = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
  return date + (locale === 'en' ? ', ' : ' ') + time
}

/**
 * Everything waiting on an admin, in one place. Split out of Level Management,
 * which had grown to seven sections mixing a daily queue with settings a person
 * touches once a month. Assigning levels, the skills reference and the change
 * log stayed behind on /admin/upgrades.
 */
export default function AdminReviewsClient({ adminId, levels, skills, recommendations: initialRecs,
  pendingProgressList: initialPending,
  pastPendingProgressList: initialPastPending,
  missingProgressList: initialMissing,
  refundOwedList: initialRefundOwed,
  assessmentRebookList,
  coachTimeOffList = [],
  sentBackList = [],
}: {
  adminId: string
  levels: Level[]
  skills: Skill[]
  recommendations: Recommendation[]
  pendingProgressList: PendingProgress[]
  pastPendingProgressList: PendingProgress[]
  missingProgressList: MissingProgress[]
  refundOwedList: RefundOwed[]
  assessmentRebookList: AssessmentRebook[]
  coachTimeOffList?: TimeOffActionItem[]
  sentBackList?: SentBack[]
}) {
  const t = useT()
  const locale = useLocale()
  const router = useRouter()
  const [recommendations, setRecommendations] = useState(initialRecs)
  const [pendingProgressList, setPendingProgressList] = useState(initialPending)
  const [pastPendingProgressList, setPastPendingProgressList] = useState(initialPastPending)
  const [missingProgressList, setMissingProgressList] = useState(initialMissing)
  /* Cards are taken off the screen one by one as they are confirmed; the page
     is never reloaded for it, so what is typed on the OTHER cards (scores,
     note text, the assessment's course and frequency) stays (found
     2026-10-08). When the server's lists do change (router.refresh() after a
     missing record is filed, which adds a card to the pending list), they are
     taken in here -- minus anything already handled on this screen. The edits
     live in their own maps keyed by card id, so they survive that too. */
  const [handled, setHandled] = useState<Set<string>>(new Set())
  const [seenProps, setSeenProps] = useState({ initialRecs, initialPending, initialPastPending, initialMissing })
  if (seenProps.initialRecs !== initialRecs || seenProps.initialPending !== initialPending
    || seenProps.initialPastPending !== initialPastPending || seenProps.initialMissing !== initialMissing) {
    setSeenProps({ initialRecs, initialPending, initialPastPending, initialMissing })
    setRecommendations(initialRecs.filter(x => !handled.has(x.id)))
    setPendingProgressList(initialPending.filter(x => !handled.has(x.id)))
    setPastPendingProgressList(initialPastPending.filter(x => !handled.has(x.id)))
    setMissingProgressList(initialMissing.filter(x => !handled.has(x.id)))
  }
  const markHandled = (id: string) => setHandled(prev => new Set(prev).add(id))
  // The sidebar's count, asked for again (app/admin/AdminNav.tsx).
  const nudgeBadge = () => { try { window.dispatchEvent(new Event('admin:reviews-changed')) } catch {} }
  const [editingPendingId, setEditingPendingId] = useState<string | null>(null)
  const [editedSnapshots, setEditedSnapshots] = useState<Record<string, Record<string, number>>>({})
  const [editedNotes, setEditedNotes] = useState<Record<string, string>>({})
  const [alertMsg, setAlertMsg] = useState<string | null>(null)
  const [reviewingId, setReviewingId] = useState<string | null>(null)
  const [missingProgress, setMissingProgress] = useState<Record<string, Record<string, number>>>({})
  const [submittingMissing, setSubmittingMissing] = useState<string | null>(null)
  const [expandedMissing, setExpandedMissing] = useState<Set<string>>(new Set())
  const [overrideLevel, setOverrideLevel] = useState<Record<string, string>>({})
  const [assessRec, setAssessRec] = useState<Record<string, AssessmentRec>>({})
  const [refundOwedList, setRefundOwedList] = useState(initialRefundOwed)
  const [retryingRefund, setRetryingRefund] = useState<string | null>(null)
  // Send back to the coach (owner, 2026-10-08): which card has the box open, and its text.
  const [sendBackOpen, setSendBackOpen] = useState<string | null>(null)
  const [sendBackReason, setSendBackReason] = useState<Record<string, string>>({})
  const [sentBack, setSentBack] = useState<SentBack[]>(sentBackList)
  // Backfilling a missed assessment from its missing-progress card.
  const [backfillLevel, setBackfillLevel] = useState<Record<string, string>>({})
  const [backfillRec, setBackfillRec] = useState<Record<string, AssessmentRec>>({})

  const waiting = missingProgressList.length + pendingProgressList.length
    + pastPendingProgressList.length + recommendations.length + refundOwedList.length
    + assessmentRebookList.length + coachTimeOffList.length

  // One booking at a time; the route re-checks everything before moving points.
  async function retryRefund(r: RefundOwed) {
    setRetryingRefund(r.id)
    const res = await fetch('/api/admin/refund-retry', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ booking_id: r.id }),
    }).catch(() => null)
    setRetryingRefund(null)
    if (!res) { setAlertMsg(t('admin.reviews.err.offline')); return }
    const data = await res.json().catch(() => ({} as any))
    if (res.ok && data.fixedStamp) {
      setRefundOwedList(prev => prev.filter(x => x.id !== r.id))
      setAlertMsg(t('admin.reviews.refund.fixedStamp'))
      return
    }
    if (res.ok && Number(data.refunded) > 0) {
      setRefundOwedList(prev => prev.filter(x => x.id !== r.id))
      setAlertMsg(t('admin.reviews.refund.done', { n: Number(data.refunded) }))
      return
    }
    // The server's words are English; the cases the desk will meet get ours.
    // busy: a refund for this lesson is in flight or just finished -- keep the
    // row. Any other 409 means it no longer qualifies: drop the row, a reload
    // shows whatever is still true.
    if (res.status === 409 && data.busy) {
      setAlertMsg(t('admin.reviews.refund.busy'))
      return
    }
    if (res.status === 409) {
      setRefundOwedList(prev => prev.filter(x => x.id !== r.id))
      setAlertMsg(t('admin.reviews.refund.stale'))
      return
    }
    setAlertMsg(t('admin.reviews.refund.failed'))
  }

  async function handleReview(rec: Recommendation, action: 'approved' | 'modified' | 'rejected') {
    setReviewingId(rec.id)
    const finalLevel = action === 'modified' ? parseInt(overrideLevel[rec.id] || String(rec.recommended_level)) : rec.recommended_level
    // .catch here, not try/catch: a dropped connection used to become an
    // unhandled rejection and the button just span forever.
    const res = await fetch('/api/admin/review-level', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recommendation_id: rec.id, action, final_level: finalLevel, admin_id: adminId })
    }).catch(() => null)
    if (!res) {
      setAlertMsg(t('admin.reviews.err.offline'))
      setReviewingId(null)
      return
    }
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setAlertMsg(errorText(t, data, 'admin.reviews.err.reviewFailed'))
      setReviewingId(null)
      return
    }
    markHandled(rec.id)
    setRecommendations(prev => prev.filter(r => r.id !== rec.id))
    setReviewingId(null)
    nudgeBadge()
  }

  async function reviewProgress(p: PendingProgress) {
    const historyId = p.id
    const note = (p as any).note as { id: string; note: string } | null
    const edited = editedSnapshots[historyId]
    setReviewingId(historyId)
    const noteText = note ? (editedNotes[historyId] ?? note.note ?? '') : undefined
    const rec = assessRec[historyId]
    if (p.assessment && (!rec?.course || !rec?.frequency)) {
      setAlertMsg(t('admin.reviews.err.pickRecommendation'))
      setReviewingId(null)
      return
    }
    // An assessment confirms its level in the same step; see review-assessment.
    const res = await fetch(p.assessment ? '/api/admin/review-assessment' : '/api/admin/review-progress', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(p.assessment ? {
        history_id: historyId,
        recommendation_id: p.assessment.recommendation_id,
        final_level: Number(overrideLevel[historyId] || p.assessment.recommended_level),
        updated_snapshot: edited ? { ...(p.snapshot || {}), ...edited } : undefined,
        note_id: note?.id || undefined,
        note_text: noteText,
        recommended_course: rec?.course,
        weekly_frequency: rec?.frequency,
        recommendation_note: rec?.note?.trim() || undefined,
      } : {
        history_id: historyId,
        admin_id: adminId,
        student_id: p.student_id,
        updated_snapshot: edited ? { ...(p.snapshot || {}), ...edited } : undefined,
        // Approved as one thing: the family sees the skills and the note together.
        note_id: note?.id || undefined,
        note_text: noteText,
      })
    }).catch(() => null)
    // The result used to be ignored: a failed confirm still removed the card
    // and reloaded, and the admin believed it had been published.
    if (!res || !res.ok) {
      const data = res ? await res.json().catch(() => ({})) : {}
      setAlertMsg(!res ? t('admin.reviews.err.offline')
        : errorText(t, data, 'admin.reviews.err.publishFailed'))
      setReviewingId(null)
      return
    }
    markHandled(historyId)
    setPendingProgressList(prev => prev.filter(x => x.id !== historyId))
    setPastPendingProgressList(prev => prev.filter(x => x.id !== historyId))
    if (editingPendingId === historyId) setEditingPendingId(null)
    setReviewingId(null)
    nudgeBadge()
  }

  /* Back to the coach (owner, 2026-10-08): the report is voided, never
     applied, and the lesson goes back on the coach's Progress page with this
     reason for them to record again. */
  async function sendBackReport(p: PendingProgress) {
    const reason = (sendBackReason[p.id] || '').trim()
    if (!reason) { setAlertMsg(t('admin.reviews.sendBack.err.reason')); return }
    setReviewingId(p.id)
    const res = await fetch('/api/admin/report-sendback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ history_id: p.id, reason, recommendation_id: p.assessment?.recommendation_id }),
    }).catch(() => null)
    setReviewingId(null)
    if (!res) { setAlertMsg(t('admin.reviews.err.offline')); return }
    const data = await res.json().catch(() => ({}))
    if (!res.ok) { setAlertMsg(errorText(t, data, 'admin.reviews.sendBack.err.failed')); return }
    markHandled(p.id)
    setPendingProgressList(prev => prev.filter(x => x.id !== p.id))
    setPastPendingProgressList(prev => prev.filter(x => x.id !== p.id))
    setSendBackOpen(null)
    setSentBack(prev => [...prev, {
      id: p.id, student_name: p.student?.full_name || '', coach_name: p.coach?.first_name || '',
      session_date: p.session_date, reason: data.reasonSaved === false ? null : reason,
    }])
    setAlertMsg(data.reasonSaved === false ? t('admin.reviews.sendBack.doneNoReason') : t('admin.reviews.sendBack.done'))
    nudgeBadge()
  }

  /* A paid assessment the coach never filed (owner, 2026-10-08): filed and
     confirmed here through the same confirm as a coach's assessment card, so
     the family gets the report, the email and the credit (its 60 days from
     today). */
  async function backfillAssessment(s: MissingProgress, shown: Record<string, number>, sentBackId?: string) {
    const level = backfillLevel[s.id]
    const rec = backfillRec[s.id]
    if (!level) { setAlertMsg(t('admin.reviews.err.pickLevel')); return }
    if (!rec?.course || !rec?.frequency) { setAlertMsg(t('admin.reviews.err.pickRecommendation')); return }
    setSubmittingMissing(s.id)
    const res = await fetch('/api/admin/backfill-assessment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        student_id: s.student_id,
        class_session_id: s.session?.id,
        level: Number(level),
        snapshot: shown,
        recommended_course: rec.course,
        weekly_frequency: rec.frequency,
        recommendation_note: rec.note?.trim() || undefined,
      }),
    }).catch(() => null)
    setSubmittingMissing(null)
    if (!res) { setAlertMsg(t('admin.reviews.err.offline')); return }
    const data = await res.json().catch(() => ({}))
    if (res.ok || data.queued) {
      markHandled(s.id)
      setMissingProgressList(prev => prev.filter(x => x.id !== s.id))
      if (sentBackId) setSentBack(prev => prev.filter(x => x.id !== sentBackId))
      // Filed but not confirmed: it is now an assessment card in the pending list.
      if (!res.ok) {
        setAlertMsg(t('admin.reviews.backfill.queued', { reason: errorText(t, data, 'admin.reviews.err.publishFailed') }))
        router.refresh()
      } else {
        setAlertMsg(t('admin.reviews.backfill.done'))
      }
      nudgeBadge()
      return
    }
    setAlertMsg(errorText(t, data, 'admin.reviews.err.submitFailed'))
  }

  function setEditedPct(historyId: string, skillId: string, pct: number) {
    setEditedSnapshots(prev => ({
      ...prev,
      [historyId]: { ...(prev[historyId] || {}), [skillId]: pct }
    }))
  }

  async function submitMissingProgress(listId: string, studentId: string, coachId: string | null, sessionDate: string | null, classSessionId: string | null, shown: Record<string, number>, sentBackId?: string) {
    setSubmittingMissing(listId)
    // What the card shows: the marks made on it, else the swimmer's skills as
    // they stand. Sending only the marks sent nothing when the card was never
    // opened, and the record that went for review was blank.
    const prog = missingProgress[listId] || shown
    // A sent-back report already has its row; the admin files that one again
    // (owner, 2026-10-08: the way out when its coach has left).
    const res = await fetch(sentBackId ? '/api/admin/sent-back-fill' : '/api/coach/progress', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(sentBackId ? { history_id: sentBackId, progress: prog } : {
        student_id: studentId,
        progress: prog,
        coach_id: coachId,
        session_date: sessionDate,
        class_session_id: classSessionId,
        admin_override: true,
      })
    }).catch(() => null)
    if (!res) {
      setAlertMsg(t('admin.reviews.err.offline'))
      setSubmittingMissing(null)
      return
    }
    if (res.ok) {
      markHandled(listId)
      setMissingProgressList(prev => prev.filter(s => s.id !== listId))
      if (sentBackId) setSentBack(prev => prev.filter(x => x.id !== sentBackId))
      // The record now waits for review: fetch the lists again so its card
      // appears below, without a reload that would drop other cards' edits.
      router.refresh()
      nudgeBadge()
    } else {
      const data = await res.json().catch(() => ({}))
      setAlertMsg(errorText(t, data, 'admin.reviews.err.submitFailed'))
    }
    setSubmittingMissing(null)
  }

  /**
   * The form under a missing-progress card, and under a sent-back report the
   * admin files themselves (sentBackId; owner, 2026-10-08). An assessment
   * (no level, paid assessment lesson) is backfilled with its level; any other
   * lesson is scored at the swimmer's level and goes for review.
   */
  function fillBody(s: MissingProgress, sentBackId?: string) {
    const prog = missingProgress[s.id] || s.existingProgress || {}
    // A missed assessment is scored against the level the admin picks for it.
    const backfill = !s.current_level && !!s.assessment
    const skillLevel = backfill ? (backfillLevel[s.id] || '') : String(s.current_level ?? '')
    const levelSkills = skills.filter(sk => {
      const lvl = levels.find(l => l.id === sk.level_id)
      return lvl && skillLevel && String(lvl.level_number) === skillLevel
    })
    // A backfill starts from nothing on file: only what is marked here.
    const backfillShown: Record<string, number> = missingProgress[s.id] || {}
    return (
      <>
      {backfill && (
        <div onClick={e => e.stopPropagation()} className="cursor-default">
          <p className="text-gray-400 text-xs mb-3">{t('admin.reviews.missing.assessmentHint')}</p>
          <AssessmentPanel
            recommendedLevel={null}
            level={backfillLevel[s.id]}
            onLevel={n => {
              // A new level is a new list of skills: the marks start over.
              if (n !== backfillLevel[s.id]) setMissingProgress(prev => { const x = { ...prev }; delete x[s.id]; return x })
              setBackfillLevel(prev => ({ ...prev, [s.id]: n }))
            }}
            rec={backfillRec[s.id] || { note: '' }}
            onRec={next => setBackfillRec(prev => ({ ...prev, [s.id]: next }))}
          />
        </div>
      )}
      {levelSkills.length > 0 && (
        <div className="space-y-2">
          {levelSkills.map(sk => {
            const pct = (backfill ? backfillShown[sk.id] : prog[sk.id]) ?? 0
            const options = MASTERY_LEVELS.map(b => MASTERY_VALUE[b])
            return (
              <div key={sk.id}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-gray-300 text-xs">{tDb(locale, 'skills', sk.id, sk.name)}</span>
                  <span className="text-xs font-semibold" style={{ color: MASTERY_COLOR[masteryOf(pct)] }}>{masteryLabel(t, masteryOf(pct))}</span>
                </div>
                <div className="flex gap-1">
                  {options.map(v => (
                    <button key={v}
                      onClick={e => { e.stopPropagation(); setMissingProgress(prev => ({
                        ...prev,
                        [s.id]: { ...(prev[s.id] || (backfill ? {} : s.existingProgress) || {}), [sk.id]: v }
                      }))}}
                      className={`flex-1 py-1 rounded text-xs font-medium transition-all ${
                        pct === v
                          ? 'bg-[#c9a84c] text-[#111d38]'
                          : 'bg-[#0d1529] border border-[#1e3a6e] text-gray-500 hover:border-[#c9a84c]/40'
                      }`}
                    >{masteryLabel(t, masteryOf(v))}</button>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
      {backfill && (
        <button
          onClick={e => { e.stopPropagation(); backfillAssessment(s, backfillShown, sentBackId) }}
          disabled={submittingMissing === s.id || !backfillLevel[s.id]}
          className="mt-4 w-full py-2.5 rounded-lg bg-[#c9a84c] text-[#111d38] font-semibold text-sm hover:opacity-90 transition-all disabled:opacity-50"
        >
          {submittingMissing === s.id ? t('admin.reviews.publishing')
            : backfillLevel[s.id] ? t('admin.reviews.backfill.confirm', { n: backfillLevel[s.id] })
            : t('admin.reviews.err.pickLevel')}
        </button>
      )}
      {/* The missing card has this button in its header; a sent-back one here. */}
      {sentBackId && !backfill && !!s.current_level && (
        <button
          onClick={e => { e.stopPropagation(); submitMissingProgress(s.id, s.student_id, s.session?.coach_id || null, s.session?.session_date || null, s.session?.id || null, s.existingProgress || {}, sentBackId) }}
          disabled={submittingMissing === s.id}
          className="mt-4 w-full py-2.5 rounded-lg bg-[#c9a84c] text-[#111d38] font-semibold text-sm hover:opacity-90 transition-all disabled:opacity-50"
        >
          {submittingMissing === s.id ? t('admin.progress.saving') : t('admin.reviews.missing.fillSubmit')}
        </button>
      )}
      </>
    )
  }

  /** One pending report card; today's and earlier days' differ only in the header and border. */
  function pendingCard(p: PendingProgress, past: boolean) {
    const lvl = p.student?.current_level || ''
    const skillMap: Record<string, string> = {}
    for (const sk of p.skills) skillMap[sk.id] = tDb(locale, 'skills', sk.id, sk.name)
    // Show all skills of the level the report was scored at (incl. missing
    // from the snapshot), snapshot values as defaults. An assessment's scores
    // are for the level the coach recommends.
    const scoredLevel = reportLevelNumber(p, levels)
    const scoredLvlObj = levels.find(l => String(l.level_number) === scoredLevel)
    const levelSkillIds = p.skills
      .filter((sk: any) => scoredLvlObj && sk.level_id === scoredLvlObj.id)
      .sort((a: any, b: any) => (a.stage || 1) - (b.stage || 1) || a.sort_order - b.sort_order)
    const allEntries: [string, number][] = levelSkillIds.length > 0
      ? levelSkillIds.map((sk: any) => [sk.id, (p.snapshot || {})[sk.id] ?? 0])
      : Object.entries(p.snapshot || {}).map(([k, v]) => [k, v as number])
    // Scored before the swimmer's level was changed: say so, the marks are the old level's.
    const scoredElsewhere = !p.assessment && !!lvl && !!scoredLevel && scoredLevel !== String(lvl)
    const isEditing = editingPendingId === p.id
    const edited = editedSnapshots[p.id] || {}
    const courseLabel = p.session_info
      ? (p.assessment ? t('common.assessment') : (p.session_info.course_type_id ? tDb(locale, 'course_types', p.session_info.course_type_id, p.session_info.course_name) : p.session_info.course_name))
      : ''
    const busy = reviewingId === p.id
    return (
      <div key={p.id} className={`bg-[#111d38] rounded-xl border p-5 ${past ? 'border-orange-500/30' : 'border-[#1e3a6e]'}`}>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <p className="text-white font-semibold">{p.student?.full_name}</p>
            {past ? (
              <p className="text-gray-400 text-xs">
                {new Date(p.session_date + 'T00:00:00').toLocaleDateString(dateTag(locale, 'en-US'), { month: 'short', day: 'numeric', weekday: 'short' })}
                {p.session_info ? ` · ${courseLabel} · ${formatTime12h(p.session_info.start_time)}–${formatTime12h(p.session_info.end_time)}` : ''}
                {` · ${t('admin.coachName', { name: p.coach?.first_name ?? '' })} · ${lvl ? t('admin.levelN', { n: lvl }) : t('admin.reviews.noLevelYet')}`}
              </p>
            ) : (
              <p className="text-gray-400 text-xs">
                {p.session_info ? `${courseLabel} · ${formatTime12h(p.session_info.start_time)}–${formatTime12h(p.session_info.end_time)} · ` : ''}
                {t('admin.coachName', { name: p.coach?.first_name ?? '' })} · {lvl ? t('admin.levelN', { n: lvl }) : t('admin.reviews.noLevelYet')} · {new Date(p.created_at).toLocaleString('en-US', { hour: '2-digit', minute: '2-digit' })}
              </p>
            )}
            {scoredElsewhere && (
              <p className="text-amber-400 text-xs mt-0.5">{t('admin.reviews.scoredAtLevel', { n: scoredLevel, now: lvl })}</p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setEditingPendingId(isEditing ? null : p.id)}
              className="px-3 py-2 rounded-lg border border-gray-600 text-gray-300 font-semibold text-sm hover:border-[#c9a84c]/50 hover:text-[#c9a84c] transition-all"
            >
              {isEditing ? t('admin.reviews.doneEditing') : t('admin.progress.edit')}
            </button>
            <button
              onClick={() => setSendBackOpen(sendBackOpen === p.id ? null : p.id)}
              disabled={busy}
              className="px-3 py-2 rounded-lg border border-red-500/40 text-red-400 font-semibold text-sm hover:bg-red-500/10 transition-all disabled:opacity-50"
            >
              {t('admin.reviews.sendBack.button')}
            </button>
            <button
              onClick={() => reviewProgress(p)}
              disabled={busy}
              className="px-4 py-2 rounded-lg bg-[#c9a84c] text-[#111d38] font-semibold text-sm hover:opacity-90 transition-all disabled:opacity-50"
            >
              {busy ? t('admin.reviews.publishing')
                : p.assessment ? t('admin.reviews.confirmLevelPublish', { n: overrideLevel[p.id] || p.assessment.recommended_level })
                : t('admin.reviews.confirmPublish')}
            </button>
          </div>
        </div>
        {sendBackOpen === p.id && (
          <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/5 p-3">
            <p className="text-red-300 text-xs font-semibold mb-1">{t('admin.reviews.sendBack.heading', { name: p.coach?.first_name ?? '' })}</p>
            <p className="text-gray-500 text-xs mb-2">{t('admin.reviews.sendBack.hint')}</p>
            <textarea
              value={sendBackReason[p.id] || ''}
              onChange={e => setSendBackReason(prev => ({ ...prev, [p.id]: e.target.value.slice(0, SENDBACK_REASON_MAX) }))}
              rows={2}
              placeholder={t('admin.reviews.sendBack.placeholder')}
              className="w-full rounded-lg bg-[#0a1428] border border-[#1e3a6e] text-gray-200 text-sm px-3 py-2 placeholder:text-gray-600 focus:outline-none focus:border-red-400/60"
            />
            <div className="flex justify-end gap-2 mt-2">
              <button onClick={() => setSendBackOpen(null)}
                className="px-3 py-1.5 rounded-lg border border-[#1e3a6e] text-gray-400 text-xs">{t('common.cancel')}</button>
              <button onClick={() => sendBackReport(p)} disabled={busy || !(sendBackReason[p.id] || '').trim()}
                className="px-3 py-1.5 rounded-lg bg-red-500/80 text-white font-semibold text-xs disabled:opacity-50">
                {busy ? t('admin.reviews.processing') : t('admin.reviews.sendBack.confirm')}
              </button>
            </div>
          </div>
        )}
        {p.assessment && (
          <AssessmentPanel
            recommendedLevel={p.assessment.recommended_level}
            level={overrideLevel[p.id]}
            onLevel={n => setOverrideLevel(prev => ({ ...prev, [p.id]: n }))}
            rec={assessRec[p.id] || { note: '' }}
            onRec={next => setAssessRec(prev => ({ ...prev, [p.id]: next }))}
          />
        )}
        {(p as any).note && (
          <AdminLessonNoteReview
            note={(p as any).note}
            value={editedNotes[p.id] ?? (p as any).note.note}
            onChange={v => setEditedNotes(prev => ({ ...prev, [p.id]: v }))}
          />
        )}
        {isEditing && (
          <div className="space-y-2 mt-3">
            {allEntries.map(([skillId, pct]) => {
              const skillName = skillMap[skillId] || skillId
              const p2 = (edited[skillId] ?? pct) as number
              return (
                <div key={skillId} className="flex items-center gap-3">
                  <p className="text-gray-300 text-xs w-48 flex-shrink-0">{skillName}</p>
                  <div className="flex gap-1">
                    {MASTERY_LEVELS.map(b => (
                      <button
                        key={b}
                        onClick={() => setEditedPct(p.id, skillId, MASTERY_VALUE[b])}
                        className={`px-2 py-1 rounded text-[10px] border transition-all ${masteryOf(p2) === b ? 'bg-[#c9a84c] text-[#111d38] border-[#c9a84c]' : 'border-gray-700 text-gray-500 hover:border-[#c9a84c]/40'}`}
                      >{masteryLabel(t, b)}</button>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}
        {!isEditing && (
          <div className="space-y-2 mt-2">
            {allEntries.map(([skillId, pct]) => {
              const skillName = skillMap[skillId] || skillId
              const p2 = (edited[skillId] ?? pct) as number
              return (
                <div key={skillId} className="flex items-center gap-3">
                  <p className="text-gray-300 text-xs w-48 flex-shrink-0">{skillName}</p>
                  <div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${MASTERY_FILL[masteryOf(p2)]}%`, backgroundColor: MASTERY_COLOR[masteryOf(p2)] }} />
                  </div>
                  <span className="text-xs w-24 text-right" style={{ color: MASTERY_COLOR[masteryOf(p2)] }}>{masteryLabel(t, masteryOf(p2))}</span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white font-['Playfair_Display']">{t('admin.reviews.title')}</h1>
        <p className="text-gray-400 mt-1">
          {waiting > 0
            ? t(waiting === 1 ? 'admin.reviews.waitingOne' : 'admin.reviews.waitingMany', { n: waiting })
            : t('admin.reviews.subtitle')}
        </p>
      </div>

      <NoteTranslationHealth />

      {/* Coach time off covering booked lessons (owner, 2026-10-08): families
          will arrive to no coach unless the desk acts, so it comes first. It
          stays until "Cancel & notify" has been run on the Time Off page. */}
      {coachTimeOffList.length > 0 && (
        <div className="mb-8">
          <h2 className="text-sm font-semibold text-red-400 uppercase tracking-wider mb-2 flex items-center gap-2">
            {t('admin.reviews.timeOff.heading')}
            <span className="bg-red-500 text-white text-xs px-2 py-0.5 rounded-full font-bold">{coachTimeOffList.length}</span>
          </h2>
          <p className="text-gray-400 text-xs mb-4">{t('admin.reviews.timeOff.hint')}</p>
          <div className="space-y-3">
            {coachTimeOffList.map(o => (
              <div key={o.id} className="bg-[#111d38] rounded-xl border border-red-500/30 p-4 flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-white font-semibold">
                    {o.coach_name || '—'}
                    <span className="text-gray-400 font-normal text-sm"> · {new Date(o.date + 'T00:00:00').toLocaleDateString(dateTag(locale, 'en-US'), { month: 'short', day: 'numeric', weekday: 'short' })} · {o.start_time && o.end_time ? `${formatTime12h(o.start_time)}–${formatTime12h(o.end_time)}` : t('admin.reviews.timeOff.allDay')}</span>
                  </p>
                  <p className="text-red-300 text-sm font-semibold mt-0.5">{t('admin.reviews.timeOff.affects', { n: o.lessons.length })}</p>
                  <ul className="mt-1 space-y-0.5">
                    {o.lessons.map((l, i) => (
                      <li key={i} className="text-gray-400 text-xs">
                        <span className="whitespace-nowrap">{formatTime12h(l.start)}–{formatTime12h(l.end)}</span>
                        {l.students.length > 0 ? ` · ${l.students.join(', ')}` : ''}
                      </li>
                    ))}
                  </ul>
                </div>
                <Link href="/admin/time-off"
                  className="px-4 py-2 rounded-lg bg-red-500/20 border border-red-500/40 text-red-400 font-semibold text-sm hover:bg-red-500/30 transition-all">
                  {t('admin.reviews.timeOff.open')}
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Refunds not completed: money first. */}
      {refundOwedList.length > 0 && (
        <div className="mb-8">
          <h2 className="text-sm font-semibold text-red-400 uppercase tracking-wider mb-2 flex items-center gap-2">
            {t('admin.reviews.refund.heading')}
            <span className="bg-red-500 text-white text-xs px-2 py-0.5 rounded-full font-bold">{refundOwedList.length}</span>
          </h2>
          <p className="text-gray-400 text-xs mb-4">{t('admin.reviews.refund.hint')}</p>
          <div className="space-y-3">
            {refundOwedList.map(r => (
              <div key={r.id} className="bg-[#111d38] rounded-xl border border-red-500/30 p-4 flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-white font-semibold">
                    {r.student_name || '—'}
                    <span className="text-gray-400 font-normal text-sm"> · {r.family_name || '—'}</span>
                  </p>
                  <p className="text-gray-400 text-xs">
                    {r.session_date
                      ? `${new Date(r.session_date + 'T00:00:00').toLocaleDateString(dateTag(locale, 'en-US'), { month: 'short', day: 'numeric', weekday: 'short', year: 'numeric' })}${r.start_time ? ` · ${formatTime12h(r.start_time)}${r.end_time ? `–${formatTime12h(r.end_time)}` : ''}` : ''}`
                      : t('admin.reviews.refund.noLesson')}
                    {r.cancelled_at ? ` · ${t('admin.reviews.refund.cancelledAt', { date: dateTimeLabel(r.cancelled_at, locale) })}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-red-300 font-semibold text-sm">{t('admin.reviews.refund.owed', { n: r.points_owed })}</span>
                  <button
                    onClick={() => retryRefund(r)}
                    disabled={retryingRefund !== null}
                    className="px-4 py-2 rounded-lg bg-red-500/20 border border-red-500/40 text-red-400 font-semibold text-sm hover:bg-red-500/30 transition-all disabled:opacity-50"
                  >
                    {retryingRefund === r.id ? t('admin.reviews.refund.retrying') : t('admin.reviews.refund.retry')}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Paid Swim Assessments the school cancelled (owner, 2026-10-06). The
          family has paid and is not asked to pay again; the card stays until
          the desk books a new time from Booking, where the swimmer's paid
          assessment is booked without a payment link. */}
      {assessmentRebookList.length > 0 && (
        <div className="mb-8">
          <h2 className="text-sm font-semibold text-[#c9a84c] uppercase tracking-wider mb-2 flex items-center gap-2">
            {t('admin.reviews.assessRebook.heading')}
            <span className="bg-[#c9a84c] text-[#1a2744] text-xs px-2 py-0.5 rounded-full font-bold">{assessmentRebookList.length}</span>
          </h2>
          <p className="text-gray-400 text-xs mb-4">{t('admin.reviews.assessRebook.hint')}</p>
          <div className="space-y-3">
            {assessmentRebookList.map(a => (
              <div key={a.booking_id} className="bg-[#111d38] rounded-xl border border-[#c9a84c]/30 p-4 flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-white font-semibold">
                    {a.student_name || '—'}
                    <span className="text-gray-400 font-normal text-sm"> · {a.family_name || '—'}</span>
                  </p>
                  <p className="text-gray-400 text-xs">
                    {a.session_date
                      ? t('admin.reviews.assessRebook.was', { when: `${new Date(a.session_date + 'T00:00:00').toLocaleDateString(dateTag(locale, 'en-US'), { month: 'short', day: 'numeric', weekday: 'short', year: 'numeric' })}${a.start_time ? ` · ${formatTime12h(a.start_time)}` : ''}` })
                      : t('admin.reviews.refund.noLesson')}
                    {a.cancelled_at ? ` · ${t('admin.reviews.refund.cancelledAt', { date: dateTimeLabel(a.cancelled_at, locale) })}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-[#c9a84c] font-semibold text-sm">{t('admin.reviews.assessRebook.paid')}</span>
                  <a href="/admin/booking"
                    className="px-4 py-2 rounded-lg bg-[#c9a84c]/20 border border-[#c9a84c]/40 text-[#c9a84c] font-semibold text-sm hover:bg-[#c9a84c]/30 transition-all">
                    {t('admin.reviews.assessRebook.book')}
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Missing progress notice */}
      {missingProgressList.length > 0 && (
        <div className="mb-8">
          <h2 className="text-sm font-semibold text-red-400 uppercase tracking-wider mb-4 flex items-center gap-2">
            {t('admin.reviews.missing.heading')}
            <span className="bg-red-500 text-white text-xs px-2 py-0.5 rounded-full font-bold">{missingProgressList.length}</span>
            <span className="text-gray-500 normal-case font-normal text-xs">{t('admin.reviews.missing.asOf', { date: new Date().toLocaleDateString(dateTag(locale, 'en-US'), { month: 'short', day: 'numeric', weekday: 'short' }) })}</span>
          </h2>
          <div className="space-y-4">
            {missingProgressList.map(s => {
              const backfill = !s.current_level && !!s.assessment
              const expanded = expandedMissing.has(s.id)
              return (
                <div key={s.id} className="bg-[#111d38] rounded-xl border border-red-500/30 p-5 cursor-pointer"
                  onClick={() => setExpandedMissing(prev => { const n = new Set(prev); n.has(s.id) ? n.delete(s.id) : n.add(s.id); return n })}
                >
                  <div className="flex items-center justify-between mb-4 gap-3">
                    <div>
                      <p className="text-white font-semibold flex items-center gap-2">
                        {s.full_name}
                        <span className="text-gray-500 text-xs">{expanded ? '▲' : '▼'}</span>
                      </p>
                      <p className="text-gray-400 text-xs">
                        {s.session?.session_date ? `${new Date(s.session.session_date + 'T00:00:00').toLocaleDateString(dateTag(locale, 'en-US'), { month: 'short', day: 'numeric', weekday: 'short' })} · ` : ''}
                        {s.session?.session_date === new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' }) && (
                          <span className="text-[#c9a84c] font-semibold">{t('admin.reviews.today')} · </span>
                        )}
                        {s.session ? `${t('admin.coachName', { name: s.session.coach?.first_name ?? '' })} · ${s.assessment ? t('common.assessment') : s.session.ct?.id ? tDb(locale, 'course_types', s.session.ct.id, s.session.ct.name) : s.session.ct?.name} · ${formatTime12h(s.session.start_time)}–${formatTime12h(s.session.end_time)}` : t('admin.reviews.scheduled')}
                        {s.current_level ? ` · ${t('admin.levelN', { n: s.current_level })}` : ''}
                      </p>
                    </div>
                    {/* No level means this lesson was the assessment, whose
                        report carries the level. The coach files it on the day;
                        once the day has gone their page no longer lists it, so
                        a missed one is backfilled here (owner, 2026-10-08) and
                        goes through the same confirm, report and email. */}
                    {backfill ? (
                      <button
                        onClick={e => { e.stopPropagation(); setExpandedMissing(prev => new Set(prev).add(s.id)) }}
                        className="px-4 py-2 rounded-lg bg-[#c9a84c]/20 border border-[#c9a84c]/40 text-[#c9a84c] font-semibold text-sm hover:bg-[#c9a84c]/30 transition-all shrink-0"
                      >
                        {t('admin.reviews.backfill.open')}
                      </button>
                    ) : !s.current_level ? (
                      <span className="text-xs text-gray-500 text-right max-w-[260px]">{t('admin.reviews.missing.noLevelHint')}</span>
                    ) : (
                    <button
                      onClick={e => { e.stopPropagation(); submitMissingProgress(s.id, s.student_id, s.session?.coach_id || null, s.session?.session_date || null, s.session?.id || null, s.existingProgress || {}) }}
                      disabled={submittingMissing === s.id}
                      className="px-4 py-2 rounded-lg bg-red-500/20 border border-red-500/40 text-red-400 font-semibold text-sm hover:bg-red-500/30 transition-all disabled:opacity-50 shrink-0"
                    >
                      {submittingMissing === s.id ? t('admin.progress.saving') : t('admin.reviews.missing.fillSubmit')}
                    </button>
                    )}
                  </div>
                  {expanded && fillBody(s)}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Today's progress review */}
      {pendingProgressList.length > 0 && (
        <div className="mb-8">
          <h2 className="text-sm font-semibold text-[#c9a84c] uppercase tracking-wider mb-4 flex items-center gap-2">
            {t('admin.reviews.todayPending')}
            <span className="bg-[#c9a84c] text-[#111d38] text-xs px-2 py-0.5 rounded-full font-bold">{pendingProgressList.length}</span>
          </h2>
          <div className="space-y-4">
            {pendingProgressList.map(p => pendingCard(p, false))}
          </div>
        </div>
      )}

      {/* Past pending progress (missed reviews from any date; stays until confirmed) */}
      {pastPendingProgressList.length > 0 && (
        <div className="mb-8">
          <h2 className="text-sm font-semibold text-orange-400 uppercase tracking-wider mb-4 flex items-center gap-2">
            {t('admin.reviews.pastPending')}
            <span className="bg-orange-500 text-[#111d38] text-xs px-2 py-0.5 rounded-full font-bold">{pastPendingProgressList.length}</span>
          </h2>
          <div className="space-y-4">
            {pastPendingProgressList.map(p => pendingCard(p, true))}
          </div>
        </div>
      )}
      {/* Pending level recommendations */}
      {recommendations.length > 0 && (
        <div className="mb-8">
          <h2 className="text-sm font-semibold text-[#c9a84c] uppercase tracking-wider mb-4 flex items-center gap-2">
            {t('admin.reviews.pendingRecs')}
            <span className="bg-[#c9a84c] text-[#111d38] text-xs px-2 py-0.5 rounded-full font-bold">{recommendations.length}</span>
          </h2>
          <div className="space-y-3">
            {recommendations.map(rec => {
              const lvl = rec.recommended_level
              const color = LEVEL_COLORS[String(lvl)] || '#6b7280'
              const override = overrideLevel[rec.id] || String(lvl)
              return (
                <div key={rec.id} className="bg-[#111d38] rounded-xl border border-[#c9a84c]/40 p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <p className="text-white font-semibold">{rec.student.full_name}</p>
                      <p className="text-gray-400 text-xs mt-0.5">
                        {t('admin.reviews.coachRecommends', { name: rec.coach.first_name ?? '' })}{' '}
                        {dateTimeLabel(rec.created_at, locale)}
                      </p>
                      {rec.history && rec.history.length > 1 && (
                      <div className="mt-2 space-y-1">
                        <p className="text-gray-600 text-xs uppercase tracking-wider">{t('admin.reviews.changeHistory')}</p>
                        {rec.history.map((h: any, i: number) => {
                          const when = dateTimeLabel(h.created_at, locale)
                          if (i === 0) return (
                            <p key={i} className="text-gray-500 text-xs flex items-center gap-1.5">
                              <span className="text-gray-600">{when}</span>
                              <span>{t('admin.reviews.submittedLevel', { n: h.recommended_level })}</span>
                            </p>
                          )
                          return (
                            <p key={i} className="text-amber-400/80 text-xs flex items-center gap-1.5">
                              <span className="text-gray-600">{when}</span>
                              <span>{t('admin.reviews.changed')}</span>
                              <span className="line-through text-gray-500">L{h.previous_recommended_level}</span>
                              <span>→</span>
                              <span className="text-amber-400 font-medium">L{h.recommended_level}</span>
                            </p>
                          )
                        })}
                      </div>
                    )}
                    {rec.notes && <p className="text-gray-500 text-xs mt-1">{t('admin.reviews.notes', { notes: rec.notes })}</p>}
                    </div>
                    <span className="text-sm px-3 py-1 rounded-full font-semibold" style={{ backgroundColor: color + '33', color }}>
                      {t('admin.reviews.recommendedLevel', { n: lvl, name: LEVEL_NAMES[String(lvl)] ? t(`level.${lvl}.name`) : '' })}
                    </span>
                  </div>

                  {/* Admin can override level */}
                  <div className="mb-3">
                    <p className="text-gray-500 text-xs mb-2">{t('admin.reviews.adminAdjust')}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {LEVEL_NUMBERS.map(n => (
                        <button key={n}
                          onClick={() => setOverrideLevel(prev => ({ ...prev, [rec.id]: String(n) }))}
                          className={`px-2.5 py-1 rounded-lg border text-xs font-medium transition-all ${
                            override === String(n)
                              ? 'border-[#c9a84c] bg-[#c9a84c]/20 text-[#c9a84c]'
                              : 'border-[#1e3a6e] text-gray-500 hover:border-[#c9a84c]/40'
                          }`}
                        >L{n}</button>
                      ))}
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => handleReview(rec, override !== String(lvl) ? 'modified' : 'approved')}
                      disabled={reviewingId === rec.id}
                      className="flex-1 py-2 rounded-lg bg-[#c9a84c] text-[#111d38] font-semibold text-sm hover:opacity-90 transition-all disabled:opacity-50"
                    >
                      {reviewingId === rec.id ? t('admin.reviews.processing') : override !== String(lvl) ? t('admin.reviews.confirmChangeTo', { n: override }) : t('admin.reviews.confirmLevel', { n: lvl })}
                    </button>
                    <button
                      onClick={() => handleReview(rec, 'rejected')}
                      disabled={reviewingId === rec.id}
                      className="px-4 py-2 rounded-lg border border-red-500/40 text-red-400 text-sm hover:bg-red-500/10 transition-all"
                    >
                      {t('admin.reviews.reject')}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
      {/* Reports sent back, waiting to be filed again. Not counted: the
          lesson's coach files them from their Progress page. The admin can
          file one here instead (owner, 2026-10-08) -- the way out when that
          coach has left. */}
      {sentBack.length > 0 && (
        <div className="mb-8">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-2">
            {t('admin.reviews.sentBack.heading')}
            <span className="bg-gray-600 text-white text-xs px-2 py-0.5 rounded-full font-bold">{sentBack.length}</span>
          </h2>
          <p className="text-gray-500 text-xs mb-3">{t('admin.reviews.sentBack.hint')}</p>
          <div className="space-y-2">
            {sentBack.map(b => {
              // A row sent back on this screen has no lesson details yet; a reload brings them.
              const fill = b.student_id && b.class_session_id ? sentBackAsMissing(b) : null
              const open = !!fill && expandedMissing.has(fill.id)
              return (
              <div key={b.id} className="bg-[#111d38] rounded-xl border border-[#1e3a6e] px-4 py-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-white text-sm font-semibold">
                      {b.student_name || '—'}
                      <span className="text-gray-400 font-normal text-xs">
                        {b.session_date ? ` · ${new Date(b.session_date + 'T00:00:00').toLocaleDateString(dateTag(locale, 'en-US'), { month: 'short', day: 'numeric', weekday: 'short' })}` : ''}
                        {b.coach_name ? ` · ${t('admin.coachName', { name: b.coach_name })}` : ''}
                      </span>
                    </p>
                    {b.reason && <p className="text-gray-400 text-xs mt-0.5">{t('admin.reviews.sentBack.reason', { reason: b.reason })}</p>}
                    {fill && !b.coach_can_file && (
                      <p className="text-amber-400 text-xs mt-0.5">{t('admin.reviews.sentBack.coachGone')}</p>
                    )}
                    {fill && b.coach_can_file && b.moved && (
                      <p className="text-gray-400 text-xs mt-0.5">{t('admin.reviews.sentBack.movedTo', { name: b.lesson_coach_name || '' })}</p>
                    )}
                  </div>
                  {fill && (
                    <button
                      onClick={() => setExpandedMissing(prev => { const n = new Set(prev); n.has(fill.id) ? n.delete(fill.id) : n.add(fill.id); return n })}
                      className="px-3 py-1.5 rounded-lg border border-[#c9a84c]/40 text-[#c9a84c] font-semibold text-xs hover:bg-[#c9a84c]/10 transition-all shrink-0"
                    >
                      {open ? t('common.cancel') : t('admin.reviews.sentBack.fillOpen')}
                    </button>
                  )}
                </div>
                {fill && open && (
                  <div className="mt-3">
                    <p className="text-gray-500 text-xs mb-3">{t('admin.reviews.sentBack.fillHint')}</p>
                    {!fill.current_level && !fill.assessment
                      ? <p className="text-xs text-gray-500">{t('admin.reviews.missing.noLevelHint')}</p>
                      : fillBody(fill, b.id)}
                  </div>
                )}
              </div>
              )
            })}
          </div>
        </div>
      )}
      {waiting === 0 && (
        <div className="bg-[#111d38] rounded-xl border border-[#1e3a6e] p-10 text-center">
          <p className="text-3xl mb-2">✓</p>
          <p className="text-white font-semibold">{t('admin.reviews.nothingWaiting')}</p>
          <p className="text-gray-500 text-sm mt-1">{t('admin.reviews.allClear')}</p>
        </div>
      )}

      <AlertModal message={alertMsg} onClose={() => setAlertMsg(null)} />
    </div>
  )
}
