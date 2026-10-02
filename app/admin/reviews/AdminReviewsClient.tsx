'use client'

import { useState } from 'react'
import { formatTime12h } from '@/lib/date'
import AdminLessonNoteReview from '../upgrades/AdminLessonNoteReview'
import AlertModal from '@/components/AlertModal'
import NoteTranslationHealth from './NoteTranslationHealth'
import AssessmentPanel, { type AssessmentRec } from './AssessmentPanel'
import { LEVEL_NAMES, LEVEL_COLORS, LEVEL_NUMBERS } from '@/lib/levels'
import { MASTERY_LEVELS, MASTERY_VALUE, MASTERY_COLOR, MASTERY_FILL, masteryOf, masteryKey, type Mastery } from '@/lib/mastery'
import { useT, useLocale } from '@/lib/i18n/provider'
import { tDb, dateTag, type Locale, type TFunction } from '@/lib/i18n'

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
}

/** Mastery chip text. Step 0 reads "Not taught" here, not the parent site's "Not taught yet". */
function masteryLabel(t: TFunction, m: Mastery): string {
  return m === 0 ? t('admin.progress.mastery0') : t(masteryKey(m))
}

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
}: {
  adminId: string
  levels: Level[]
  skills: Skill[]
  recommendations: Recommendation[]
  pendingProgressList: PendingProgress[]
  pastPendingProgressList: PendingProgress[]
  missingProgressList: MissingProgress[]
}) {
  const t = useT()
  const locale = useLocale()
  const [recommendations, setRecommendations] = useState(initialRecs)
  const [pendingProgressList, setPendingProgressList] = useState(initialPending)
  const [pastPendingProgressList, setPastPendingProgressList] = useState(initialPastPending)
  const [editingPendingId, setEditingPendingId] = useState<string | null>(null)
  const [editedSnapshots, setEditedSnapshots] = useState<Record<string, Record<string, number>>>({})
  const [editedNotes, setEditedNotes] = useState<Record<string, string>>({})
  const [alertMsg, setAlertMsg] = useState<string | null>(null)
  const [reviewingId, setReviewingId] = useState<string | null>(null)
  const [missingProgressList, setMissingProgressList] = useState(initialMissing)
  const [missingProgress, setMissingProgress] = useState<Record<string, Record<string, number>>>({})
  const [submittingMissing, setSubmittingMissing] = useState<string | null>(null)
  const [expandedMissing, setExpandedMissing] = useState<Set<string>>(new Set())
  const [overrideLevel, setOverrideLevel] = useState<Record<string, string>>({})
  const [assessRec, setAssessRec] = useState<Record<string, AssessmentRec>>({})

  const waiting = missingProgressList.length + pendingProgressList.length
    + pastPendingProgressList.length + recommendations.length

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
      setAlertMsg(data.error || t('admin.reviews.err.reviewFailed'))
      setReviewingId(null)
      return
    }
    setRecommendations(prev => prev.filter(r => r.id !== rec.id))
    setReviewingId(null)
    window.location.reload()
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
        : (data as any).error || t('admin.reviews.err.publishFailed'))
      setReviewingId(null)
      return
    }
    setPendingProgressList(prev => prev.filter(x => x.id !== historyId))
    setPastPendingProgressList(prev => prev.filter(x => x.id !== historyId))
    setEditingPendingId(null)
    setReviewingId(null)
    window.location.reload()
  }

  function setEditedPct(historyId: string, skillId: string, pct: number) {
    setEditedSnapshots(prev => ({
      ...prev,
      [historyId]: { ...(prev[historyId] || {}), [skillId]: pct }
    }))
  }

  async function submitMissingProgress(listId: string, studentId: string, coachId: string | null, sessionDate: string | null, classSessionId: string | null, shown: Record<string, number>) {
    setSubmittingMissing(listId)
    // What the card shows: the marks made on it, else the swimmer's skills as
    // they stand. Sending only the marks sent nothing when the card was never
    // opened, and the record that went for review was blank.
    const prog = missingProgress[listId] || shown
    const res = await fetch('/api/coach/progress', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
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
      setMissingProgressList(prev => prev.filter(s => s.id !== listId))
      window.location.reload()
    } else {
      const data = await res.json().catch(() => ({}))
      setAlertMsg(data.error || t('admin.reviews.err.submitFailed'))
    }
    setSubmittingMissing(null)
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
              const prog = missingProgress[s.id] || s.existingProgress || {}
              const levelSkills = skills.filter(sk => {
                const lvl = levels.find(l => l.id === sk.level_id)
                return lvl && String(lvl.level_number) === String(s.current_level)
              })
              return (
                <div key={s.id} className="bg-[#111d38] rounded-xl border border-red-500/30 p-5 cursor-pointer"
                  onClick={() => setExpandedMissing(prev => { const n = new Set(prev); n.has(s.id) ? n.delete(s.id) : n.add(s.id); return n })}
                >
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <p className="text-white font-semibold flex items-center gap-2">
                        {s.full_name}
                        <span className="text-gray-500 text-xs">{expandedMissing.has(s.id) ? '▲' : '▼'}</span>
                      </p>
                      <p className="text-gray-400 text-xs">
                        {s.session?.session_date ? `${new Date(s.session.session_date + 'T00:00:00').toLocaleDateString(dateTag(locale, 'en-US'), { month: 'short', day: 'numeric', weekday: 'short' })} · ` : ''}
                        {s.session?.session_date === new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' }) && (
                          <span className="text-[#c9a84c] font-semibold">{t('admin.reviews.today')} · </span>
                        )}
                        {s.session ? `${t('admin.coachName', { name: s.session.coach?.first_name ?? '' })} · ${s.session.ct?.id ? tDb(locale, 'course_types', s.session.ct.id, s.session.ct.name) : s.session.ct?.name} · ${formatTime12h(s.session.start_time)}–${formatTime12h(s.session.end_time)}` : t('admin.reviews.scheduled')}
                        {s.current_level ? ` · ${t('admin.levelN', { n: s.current_level })}` : ''}
                      </p>
                    </div>
                    {/* No level means this was the assessment. Its report carries
                        the level, and the coach files it on the day from their
                        Progress page. Once the day has gone that page no longer
                        lists it, so the way out is a level set by hand first. */}
                    {!s.current_level ? (
                      <span className="text-xs text-gray-500 text-right max-w-[260px]">{t('admin.reviews.missing.assessmentHint')}</span>
                    ) : (
                    <button
                      onClick={e => { e.stopPropagation(); submitMissingProgress(s.id, s.student_id, s.session?.coach_id || null, s.session?.session_date || null, s.session?.id || null, s.existingProgress || {}) }}
                      disabled={submittingMissing === s.id}
                      className="px-4 py-2 rounded-lg bg-red-500/20 border border-red-500/40 text-red-400 font-semibold text-sm hover:bg-red-500/30 transition-all disabled:opacity-50"
                    >
                      {submittingMissing === s.id ? t('admin.progress.saving') : t('admin.reviews.missing.fillSubmit')}
                    </button>
                    )}
                  </div>
                  {levelSkills.length > 0 && expandedMissing.has(s.id) && (
                    <div className="space-y-2">
                      {levelSkills.map(sk => {
                        const pct = prog[sk.id] ?? 0
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
                                    [s.id]: { ...(prev[s.id] || s.existingProgress || {}), [sk.id]: v }
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
            {pendingProgressList.map(p => {
              const lvl = p.student?.current_level || ''
              const skillMap: Record<string, string> = {}
              for (const sk of p.skills) skillMap[sk.id] = tDb(locale, 'skills', sk.id, sk.name)
              // Show all skills (incl. missing from snapshot); snapshot values as defaults
              // An assessment's scores are for the level the coach recommends.
              const scoredLevel = p.assessment ? String(p.assessment.recommended_level) : String(p.student?.current_level)
              const levelSkillIds = p.skills
                .filter((sk: any) => {
                  const lvlObj = levels.find(l => String(l.level_number) === scoredLevel)
                  return lvlObj && sk.level_id === lvlObj.id
                })
                .sort((a: any, b: any) => (a.stage || 1) - (b.stage || 1) || a.sort_order - b.sort_order)
              const allEntries: [string, number][] = levelSkillIds.length > 0
                ? levelSkillIds.map((sk: any) => [sk.id, (p.snapshot || {})[sk.id] ?? 0])
                : Object.entries(p.snapshot || {}).map(([k, v]) => [k, v as number])
              const isEditing = editingPendingId === p.id
              const edited = editedSnapshots[p.id] || {}
              return (
                <div key={p.id} className="bg-[#111d38] rounded-xl border border-[#1e3a6e] p-5">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <p className="text-white font-semibold">{p.student?.full_name}</p>
                      <p className="text-gray-400 text-xs">
                        {p.session_info ? `${p.assessment ? t('common.assessment') : (p.session_info.course_type_id ? tDb(locale, 'course_types', p.session_info.course_type_id, p.session_info.course_name) : p.session_info.course_name)} · ${formatTime12h(p.session_info.start_time)}–${formatTime12h(p.session_info.end_time)} · ` : ''}
                        {t('admin.coachName', { name: p.coach?.first_name ?? '' })} · {lvl ? t('admin.levelN', { n: lvl }) : t('admin.reviews.noLevelYet')} · {new Date(p.created_at).toLocaleString('en-US', { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setEditingPendingId(isEditing ? null : p.id)}
                        className="px-3 py-2 rounded-lg border border-gray-600 text-gray-300 font-semibold text-sm hover:border-[#c9a84c]/50 hover:text-[#c9a84c] transition-all"
                      >
                        {isEditing ? t('admin.reviews.doneEditing') : t('admin.progress.edit')}
                      </button>
                      <button
                        onClick={() => reviewProgress(p)}
                        disabled={reviewingId === p.id}
                        className="px-4 py-2 rounded-lg bg-[#c9a84c] text-[#111d38] font-semibold text-sm hover:opacity-90 transition-all disabled:opacity-50"
                      >
                        {reviewingId === p.id ? t('admin.reviews.publishing')
                          : p.assessment ? t('admin.reviews.confirmLevelPublish', { n: overrideLevel[p.id] || p.assessment.recommended_level })
                          : t('admin.reviews.confirmPublish')}
                      </button>
                    </div>
                  </div>
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
                        const color = p2 >= 70 ? '#3ecf8e' : p2 >= 30 ? '#f5a623' : p2 > 0 ? '#f56565' : 'rgba(255,255,255,0.1)'
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
            })}
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
            {pastPendingProgressList.map(p => {
              const lvl = p.student?.current_level || ''
              const skillMap: Record<string, string> = {}
              for (const sk of p.skills) skillMap[sk.id] = tDb(locale, 'skills', sk.id, sk.name)
              // Show all skills (incl. missing from snapshot); snapshot values as defaults
              // An assessment's scores are for the level the coach recommends.
              const scoredLevel = p.assessment ? String(p.assessment.recommended_level) : String(p.student?.current_level)
              const levelSkillIds = p.skills
                .filter((sk: any) => {
                  const lvlObj = levels.find(l => String(l.level_number) === scoredLevel)
                  return lvlObj && sk.level_id === lvlObj.id
                })
                .sort((a: any, b: any) => (a.stage || 1) - (b.stage || 1) || a.sort_order - b.sort_order)
              const allEntries: [string, number][] = levelSkillIds.length > 0
                ? levelSkillIds.map((sk: any) => [sk.id, (p.snapshot || {})[sk.id] ?? 0])
                : Object.entries(p.snapshot || {}).map(([k, v]) => [k, v as number])
              const isEditing = editingPendingId === p.id
              const edited = editedSnapshots[p.id] || {}
              return (
                <div key={p.id} className="bg-[#111d38] rounded-xl border border-orange-500/30 p-5">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <p className="text-white font-semibold">{p.student?.full_name}</p>
                      <p className="text-gray-400 text-xs">
                        {new Date(p.session_date + 'T00:00:00').toLocaleDateString(dateTag(locale, 'en-US'), { month: 'short', day: 'numeric', weekday: 'short' })}
                        {p.session_info ? ` · ${p.assessment ? t('common.assessment') : (p.session_info.course_type_id ? tDb(locale, 'course_types', p.session_info.course_type_id, p.session_info.course_name) : p.session_info.course_name)} · ${formatTime12h(p.session_info.start_time)}–${formatTime12h(p.session_info.end_time)}` : ''}
                        {` · ${t('admin.coachName', { name: p.coach?.first_name ?? '' })} · ${lvl ? t('admin.levelN', { n: lvl }) : t('admin.reviews.noLevelYet')}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setEditingPendingId(isEditing ? null : p.id)}
                        className="px-3 py-2 rounded-lg border border-gray-600 text-gray-300 font-semibold text-sm hover:border-[#c9a84c]/50 hover:text-[#c9a84c] transition-all"
                      >
                        {isEditing ? t('admin.reviews.doneEditing') : t('admin.progress.edit')}
                      </button>
                      <button
                        onClick={() => reviewProgress(p)}
                        disabled={reviewingId === p.id}
                        className="px-4 py-2 rounded-lg bg-[#c9a84c] text-[#111d38] font-semibold text-sm hover:opacity-90 transition-all disabled:opacity-50"
                      >
                        {reviewingId === p.id ? t('admin.reviews.publishing')
                          : p.assessment ? t('admin.reviews.confirmLevelPublish', { n: overrideLevel[p.id] || p.assessment.recommended_level })
                          : t('admin.reviews.confirmPublish')}
                      </button>
                    </div>
                  </div>
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
                        const color = p2 >= 70 ? '#3ecf8e' : p2 >= 30 ? '#f5a623' : p2 > 0 ? '#f56565' : 'rgba(255,255,255,0.1)'
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
            })}
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
