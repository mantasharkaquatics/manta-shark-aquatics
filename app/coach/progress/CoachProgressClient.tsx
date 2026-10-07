'use client'
import { tDb, dateTag } from '@/lib/i18n'
import { useT, useLocale } from '@/lib/i18n/provider'
import { levelNameKey } from '@/lib/levels'

import { formatTime12h, getNowMinutesLA } from '@/lib/date'

import { useState, useEffect, useRef } from 'react'
import LessonNoteCapture, { type Capture } from './LessonNoteCapture'
import SkillTree from '@/app/(public)/dashboard/SkillTree'
import { LEVEL_COLORS, LEVEL_NUMBERS, STAGES } from '@/lib/levels'
import { MASTERY_LEVELS, MASTERY_VALUE, MASTERY_COLOR, MASTERY_FILL, masteryOf, masteryKey } from '@/lib/mastery'
import StageRibbon from '@/components/StageRibbon'

type Skill = { id: string; name: string; sort_order: number; stage: number | null; pass_criteria?: string | null }
type StudentProgress = {
  student: { id: string; full_name: string; current_level: string | null; current_stage: number | null; level: { level_number: number; name: string } | null }
  skills: Skill[]
  progress: Record<string, number>
  todayLocked: boolean
  /** No level yet: this lesson is their assessment. */
  assessment?: boolean
  /** The level whose skills are shown during an assessment. */
  assessedLevel?: number | null
}


// The lesson-note route answers in English (it is also read by logs and the
// admin side). A coach on the zh-Hant portal used to see that English raw
// (found 2026-10-04), so the errors a coach can act on map to a key here and
// anything else falls back to the generic "could not send".
const SEND_ERROR_KEYS: Record<string, string> = {
  'Unauthorized': 'coach.progress.err.signIn',
  'Not a coach': 'coach.progress.err.signIn',
  'Not your lesson': 'coach.progress.err.notYourLesson',
  'This swimmer is not booked in this lesson.': 'coach.progress.err.notYourLesson',
  'Skill progress is missing': 'coach.progress.needSkills',
  'Pick the level to recommend first': 'coach.progress.err.pickLevel',
  'Could not transcribe the recording': 'coach.progress.err.transcribe',
  'Nothing was heard in that recording': 'coach.progress.err.silent',
  'This report has already been approved.': 'coach.progress.err.approved',
  'This report was approved while you were sending it. Ask an admin to correct it.': 'coach.progress.err.approvedMeanwhile',
  'The scores were approved while you were sending this report. Your note was saved for review; the scores were not changed.': 'coach.progress.err.scoresApprovedMeanwhile',
}

function barColor(pct: number): string {
  if (pct >= 70) return '#3ecf8e'
  if (pct >= 30) return '#f5a623'
  if (pct > 0) return '#f56565'
  return 'rgba(255,255,255,0.1)'
}

export default function CoachProgressClient({ coach, sessions, today, completedKeys, scheduledToday = 0 }: {
  coach: { id: string; first_name: string }
  sessions: any[]
  today: string
  completedKeys: string[]
  scheduledToday?: number
}) {
  const t = useT()
  const locale = useLocale()
  const [expandedStudent, setExpandedStudent] = useState<string | null>(null)
  const [studentDataMap, setStudentDataMap] = useState<Record<string, StudentProgress>>({})
  /* The marks a coach has tapped on each card, kept apart from what the server
     says (found 2026-10-05). They used to live in one map the server answer
     overwrote: reopening a card refetched, and every chip set before the coach
     moved on to the next swimmer in the 1-on-4 was gone. On screen a card is
     the server's picture with these laid over it. */
  const [editsMap, setEditsMap] = useState<Record<string, Record<string, number>>>({})
  const [savingMap, setSavingMap] = useState<Record<string, boolean>>({})
  const [completedSet, setCompletedSet] = useState<Set<string>>(new Set(completedKeys))
  const [loadingMap, setLoadingMap] = useState<Record<string, boolean>>({})
  // The level picked for a swimmer's assessment, per lesson card.
  const [assessLevelMap, setAssessLevelMap] = useState<Record<string, string>>({})
  const [locked, setLocked] = useState(false)
  const [captureMap, setCaptureMap] = useState<Record<string, Capture | null>>({})
  const [errorMap, setErrorMap] = useState<Record<string, string>>({})
  // Which stage is unfolded, per student. Unset means "follow the swimmer" --
  // the stage they are actually in opens, and the other two stay shut, so a
  // coach lands on the right list without scrolling past work that is locked.
  const [openStageMap, setOpenStageMap] = useState<Record<string, number>>({})
  /* The whole curriculum from the coach's side. Same component the family sees,
     with forCoach on -- that is what adds the pass standard and the list of what
     each skill is waiting on, neither of which belongs on a family's screen. */
  const [treeFor, setTreeFor] = useState<
    { name: string; level: number; stage: number; percents: Record<string, number> } | null>(null)

  useEffect(() => {
    // Locked for the whole 00:00 hour in Los Angeles. This used to read the hour
    // off `new Date(new Date().toLocaleString(..., { timeZone: 'LA' }))`, which
    // formats to LA wall time and then reparses it as the BROWSER's zone -- the
    // offset lands twice, so the lock fired at the wrong hour for anyone whose
    // machine was not set to Los Angeles. getNowMinutesLA reads LA directly.
    const check = () => setLocked(getNowMinutesLA() < 60)
    check()
    const t = setInterval(check, 60000)
    return () => clearInterval(t)
  }, [])

  // One entry per (student, lesson). A lesson is lesson_group_id when set, else the session,
  // so an hour lesson's two halves collapse into a single card spanning both.
  const entryMap = new Map<string, any>()
  for (const s of sessions) {
    for (const b of ((s as any).bookings || [])) {
      const studentId = b.students?.id || ''
      if (!studentId) continue
      const lessonKey = b.lesson_group_id || s.id
      const entryKey = `${studentId}_${lessonKey}`
      const prev = entryMap.get(entryKey)
      if (prev) {
        if ((s.start_time || '') < prev.start_time) { prev.start_time = s.start_time; prev.sessionId = s.id }
        if ((s.end_time || '') > prev.end_time) prev.end_time = s.end_time
        continue
      }
      entryMap.set(entryKey, {
        studentId,
        lessonGroupId: b.lesson_group_id || null,
        full_name: b.students?.full_name || '',
        current_level: b.students?.current_level || null,
        sessionId: s.id,
        start_time: s.start_time || '',
        end_time: s.end_time || '',
        sessionDate: (s as any).session_date || today,
        courseName: b.is_trial ? t('common.assessment') : s.course_types?.id
          ? tDb(locale, 'course_types', s.course_types.id, s.course_types?.name || '')
          : (s.course_types?.name || ''),
        entryKey,
      })
    }
  }
  const sessionEntries = Array.from(entryMap.values())
    .sort((a, b) => a.start_time.localeCompare(b.start_time))
    .map(e => ({ ...e, sessionTime: `${formatTime12h(e.start_time)} - ${formatTime12h(e.end_time)}` }))

  /* Lessons, not swimmers, for the heading (found 2026-10-05). It counted the
     cards -- one per checked-in swimmer -- so a 1-on-4 read "4 lesson(s)
     today", while the same page before check-in counted 1. A lesson is a
     session with someone checked in, and an hour's two halves (sessions joined
     by a lesson_group_id) are one lesson, as the server counts scheduledToday. */
  const lessonCount = (() => {
    const parent: Record<string, string> = {}
    const find = (x: string): string => {
      while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x] }
      return x
    }
    const add = (x: string) => { if (!(x in parent)) parent[x] = x }
    const sessionIds: string[] = []
    for (const s of sessions) {
      const bookings = ((s as any).bookings || []).filter((b: any) => b.students?.id)
      if (bookings.length === 0) continue
      const sid = 's:' + s.id
      add(sid)
      sessionIds.push(sid)
      for (const b of bookings) {
        if (!b.lesson_group_id) continue
        const gid = 'g:' + b.lesson_group_id
        add(gid)
        parent[find(gid)] = find(sid)
      }
    }
    return new Set(sessionIds.map(find)).size
  })()

  // Latest request per card. A coach tapping L3 then L4 quickly must end up
  // looking at L4's skills: an older response that lands late is dropped.
  const loadSeq = useRef<Record<string, number>>({})

  /** quiet: keep the card on screen while it loads (a level switch), so the
   *  recorder stays mounted and its take survives. */
  async function loadStudent(entryKey: string, studentId: string, sessionId: string, level?: string, quiet = false): Promise<'ok' | 'stale' | 'failed'> {
    const seq = (loadSeq.current[entryKey] || 0) + 1
    loadSeq.current[entryKey] = seq
    if (!quiet) setLoadingMap(prev => ({ ...prev, [entryKey]: true }))
    const q = `/api/coach/progress?student_id=${studentId}&class_session_id=${sessionId}${level ? `&level=${level}` : ''}`
    const res = await fetch(q).catch(() => null)
    const data = res && res.ok ? await res.json().catch(() => null) : null
    if (loadSeq.current[entryKey] !== seq) return 'stale'
    if (!data) {
      setErrorMap(prev => ({ ...prev, [entryKey]: t('coach.progress.loadFailed') }))
      setLoadingMap(prev => ({ ...prev, [entryKey]: false }))
      return 'failed'
    }
    setErrorMap(prev => ({ ...prev, [entryKey]: '' }))
    setStudentDataMap(prev => ({ ...prev, [entryKey]: data }))
    if (data.todayLocked) setCompletedSet(prev => new Set([...prev, entryKey]))
    setLoadingMap(prev => ({ ...prev, [entryKey]: false }))
    return 'ok'
  }

  async function toggleStudent(entryKey: string, studentId: string, sessionId: string) {
    if (expandedStudent === entryKey) {
      setExpandedStudent(null)
      return
    }
    setExpandedStudent(entryKey)
    // Re-fetch on every expand to get the latest progress (reflects saves from
    // the previous lesson). The coach's own marks sit in editsMap, so this
    // cannot overwrite them; a card already loaded refreshes in place rather
    // than flashing "Loading" over its recorder.
    if (studentDataMap[entryKey]?.todayLocked) return
    await loadStudent(entryKey, studentId, sessionId, assessLevelMap[entryKey], !!studentDataMap[entryKey])
  }

  /* An assessment: the coach says which level the swimmer belongs in, and that
     level's skills open underneath to be scored. Changing the pick starts the
     scores over -- they were marks against a different list. The recording is
     kept: it is about the swimmer, not about the list. */
  async function pickAssessLevel(entryKey: string, studentId: string, sessionId: string, level: string) {
    if (locked || completedSet.has(entryKey)) return
    const shown = studentDataMap[entryKey]?.assessedLevel
    if (assessLevelMap[entryKey] === level && String(shown ?? '') === level) return
    const before = assessLevelMap[entryKey]
    setAssessLevelMap(prev => ({ ...prev, [entryKey]: level }))
    setOpenStageMap(prev => { const n = { ...prev }; delete n[entryKey]; return n })
    const result = await loadStudent(entryKey, studentId, sessionId, level, true)
    // A failed load leaves the old list on screen; the highlight goes back to it.
    if (result === 'failed') setAssessLevelMap(prev => ({ ...prev, [entryKey]: before || '' }))
    // The new level's list starts unmarked: the old marks were for other skills.
    if (result === 'ok') setEditsMap(prev => { const n = { ...prev }; delete n[entryKey]; return n })
  }

  // Progress and the recording leave together. The owner's rule is that a coach
  // cannot send one without the other, so there is no half-submission to handle.
  async function sendReport(entryKey: string, studentId: string, sessionId: string, lessonGroupId: string | null, sessionDate: string) {
    if (locked || completedSet.has(entryKey)) return
    const capture = captureMap[entryKey]
    if (!capture) return
    setSavingMap(prev => ({ ...prev, [entryKey]: true }))
    setErrorMap(prev => ({ ...prev, [entryKey]: '' }))
    const progress = { ...(studentDataMap[entryKey]?.progress || {}), ...(editsMap[entryKey] || {}) }

    const form = new FormData()
    form.append('audio', capture.blob, 'note.' + (capture.blob.type.includes('mp4') ? 'mp4' : 'webm'))
    form.append('student_id', studentId)
    form.append('class_session_id', sessionId)
    if (lessonGroupId) form.append('lesson_group_id', lessonGroupId)
    form.append('session_date', sessionDate)
    form.append('language', capture.language)
    form.append('seconds', String(capture.seconds))
    form.append('progress', JSON.stringify(progress))
    const data = studentDataMap[entryKey]
    if (data?.assessment && data.assessedLevel) form.append('recommended_level', String(data.assessedLevel))

    // A dropped connection used to throw here and leave the button on "Sending…".
    const res = await fetch('/api/coach/lesson-note', { method: 'POST', body: form }).catch(() => null)
    if (!res || !res.ok) {
      const j = res ? await res.json().catch(() => ({})) : {}
      const key = SEND_ERROR_KEYS[String(j.error || '')] || 'coach.progress.sendFailed'
      setErrorMap(prev => ({ ...prev, [entryKey]: t(key) }))
    }
    if (res && res.ok) {
      // Mark completed and collapse this card
      setCompletedSet(prev => new Set([...prev, entryKey]))
      setExpandedStudent(null)
      // Update studentData for this entryKey (next lesson expand gets fresh progress)
      setStudentDataMap(prev => ({
        ...prev,
        [entryKey]: { ...prev[entryKey], progress, todayLocked: true }
      }))
      setEditsMap(prev => { const n = { ...prev }; delete n[entryKey]; return n })
      setCaptureMap(prev => ({ ...prev, [entryKey]: null }))
    }
    setSavingMap(prev => ({ ...prev, [entryKey]: false }))
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">{t('coach.progress.title')}</h1>
          <p className="text-gray-400 text-sm mt-1">
            {/* Was the raw '2026-10-04' (found 2026-10-04); dates follow the
                coach's language like the rest of the portal. */}
            {new Date(today + 'T12:00:00').toLocaleDateString(dateTag(locale), { weekday: 'long', month: 'long', day: 'numeric' })} · {sessionEntries.length === 0 && scheduledToday > 0
              ? t('coach.progress.countScheduled', { n: scheduledToday })
              : t('coach.progress.countToday', { n: lessonCount })}
          </p>
        </div>

      </div>

      {/* This page only lists students with an attendance row, because an absent
          student needs no progress written. That made a day with lessons but no
          check-ins yet look identical to a day off -- so say which one it is. */}
      {sessionEntries.length === 0 ? (
        <div className="bg-[#111d38] rounded-xl border border-[#1e3a6e] p-8 text-center">
          {scheduledToday > 0 ? (
            <>
              <p className="text-gray-300">{t('coach.progress.noCheckins')}</p>
              <p className="text-gray-500 text-sm mt-1.5">
                {t('coach.progress.noCheckinsHint', { n: scheduledToday })}
              </p>
            </>
          ) : (
            <p className="text-gray-400">{t('coach.progress.noLessons')}</p>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {sessionEntries.map(s => {
            const lvl = s.current_level || ''
            const color = LEVEL_COLORS[lvl] || '#6b7280'
            const isCompleted = completedSet.has(s.entryKey)
            const isExpanded = expandedStudent === s.entryKey
            const data = studentDataMap[s.entryKey]
            const loading = loadingMap[s.entryKey]
            const edits = editsMap[s.entryKey] || {}
            const localProgress = { ...(data?.progress || {}), ...edits }
            const saving = savingMap[s.entryKey]
            const hasChanges = !!data && Object.entries(edits).some(([id, v]) => data.progress[id] !== v)
            /* A lesson where nothing moved is still a lesson to report (found
               2026-10-05): Send used to need a changed mark, so a swimmer with
               every skill already scored could not be sent a note without the
               coach inventing a change. Scores on file for this level are a
               complete report as they stand. An assessment has nothing on file,
               so it still needs marks. */
            const hasScores = !!data && !data.assessment && data.skills.some(k => data.progress[k.id] !== undefined)
            const canSend = hasChanges || hasScores
            const assessPick = assessLevelMap[s.entryKey] || (data?.assessedLevel ? String(data.assessedLevel) : '')
            // The level the stage ribbons and the learning map are drawn for.
            const shownLevel = Number(data?.student.current_level) || Number(data?.assessedLevel) || 1

            return (
              <div key={s.entryKey} className="bg-[#111d38] rounded-xl border border-[#1e3a6e] overflow-hidden">
                {/* Header row */}
                <button
                  onClick={() => toggleStudent(s.entryKey, s.studentId, s.sessionId)}
                  className={`w-full flex items-center justify-between gap-2 p-4 text-left transition-all ${isExpanded ? 'bg-[#1e3a6e]/40' : 'hover:bg-[#1e3a6e]/20'}`}
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="w-9 h-9 rounded-full bg-[#1a2744] flex items-center justify-center flex-shrink-0">
                      <span className="text-[#c9a84c] font-bold text-sm">{s.full_name.charAt(0)}</span>
                    </div>
                    <div className="min-w-0">
                      <p className="text-white font-medium text-sm">{s.full_name}</p>
                      {/* No date: the page heading above already says which day
                          these lessons are. Each part is nowrap so a phone breaks
                          between them, never inside "3:00 PM - 3:30 PM". */}
                      <p className="text-gray-500 text-xs leading-snug">
                        <span className="whitespace-nowrap">{s.sessionTime}</span>
                        {' · '}<span className="whitespace-nowrap">{s.courseName}</span>
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {/* Completion status */}
                    {isCompleted ? (
                      <span className="text-xs px-2 py-1 rounded-full bg-green-900/40 text-green-400 font-medium whitespace-nowrap">{t('coach.progress.completed')}</span>
                    ) : (
                      <span className="text-xs px-2 py-1 rounded-full bg-gray-700/50 text-gray-400 whitespace-nowrap">{t('coach.progress.notFilled')}</span>
                    )}
                    {/* Level badge */}
                    {lvl ? (
                      <span className="text-xs px-2 py-1 rounded-full font-medium whitespace-nowrap" style={{ backgroundColor: color + '33', color }}>L{lvl}</span>
                    ) : (
                      <span className="text-xs px-2 py-1 rounded-full bg-gray-700/50 text-gray-400 whitespace-nowrap">{t('coach.progress.unassigned')}</span>
                    )}
                    <span className="text-gray-500 text-xs">{isExpanded ? '▲' : '▼'}</span>
                  </div>
                </button>

                {/* Expanded content */}
                {isExpanded && (
                  <div className="border-t border-[#1e3a6e] p-4">
                    {loading ? (
                      <div className="text-center text-gray-400 py-6">{t('coach.loading')}</div>
                    ) : data ? (
                      <>
                        {/* No level yet: this lesson is the assessment. The level
                            is chosen here and travels with the report, so the
                            admin confirms level, note and scores as one card. */}
                        {data.assessment && (
                          <div className="bg-[#0d1529] rounded-xl border border-[#c9a84c]/30 p-4 mb-3">
                            <p className="text-[#c9a84c] text-xs font-semibold uppercase tracking-wider mb-1">{t('coach.progress.assessTitle')}</p>
                            <p className="text-gray-400 text-xs mb-3">{isCompleted
                              ? t('coach.progress.assessSent')
                              : t('coach.progress.assessHint')}</p>
                            {!isCompleted && (
                              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                                {LEVEL_NUMBERS.map(n => (
                                  <button key={n}
                                    onClick={() => pickAssessLevel(s.entryKey, s.studentId, s.sessionId, String(n))}
                                    disabled={locked || saving}
                                    className={`py-2 px-2 rounded-lg border text-xs font-medium transition-all disabled:opacity-40 ${
                                      assessPick === String(n) ? 'border-[#c9a84c] bg-[#c9a84c]/20 text-[#c9a84c]' : 'border-[#1e3a6e] bg-[#111d38] text-gray-400 hover:border-[#c9a84c]/50'
                                    }`}
                                  >
                                    <div>L{n}</div>
                                    <div className="opacity-70">{t(levelNameKey(String(n)))}</div>
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        )}

                        {/* Assigned — skill progress */}
                        {data.skills.length > 0 && (
                          <>
                            {!isCompleted && (
                              <LessonNoteCapture
                                key={s.entryKey}
                                studentName={s.full_name}
                                defaultLanguage={(data as any).coachDefaultLanguage === 'zh-Hant' ? 'zh-Hant' : 'en'}
                                disabled={locked || saving}
                                initial={captureMap[s.entryKey] || null}
                                onChange={cap => setCaptureMap(prev => ({ ...prev, [s.entryKey]: cap }))}
                              />
                            )}

                            <div className="flex justify-between items-center mb-3">
                              <p className="text-gray-500 text-xs uppercase tracking-wider">{t('coach.skillProgress')}</p>
                              <button
                                onClick={() => sendReport(s.entryKey, s.studentId, s.sessionId, s.lessonGroupId, s.sessionDate)}
                                disabled={saving || !canSend || !captureMap[s.entryKey] || locked || isCompleted}
                                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                                  isCompleted ? 'bg-green-700/50 text-green-400 cursor-not-allowed' :
                                  canSend && captureMap[s.entryKey] && !locked ? 'bg-[#c9a84c] text-[#1a2744] hover:opacity-90' :
                                  'bg-gray-700 text-gray-500 cursor-not-allowed'
                                }`}
                              >
                                {saving ? t('coach.progress.sending')
                                  : isCompleted ? t('coach.progress.doneToday')
                                  : locked ? t('coach.progress.locked')
                                  // Only when nothing is on file and nothing is marked
                                  // does "set the skills first" hold.
                                  : !canSend ? t('coach.progress.needSkills')
                                  : !captureMap[s.entryKey] ? t('coach.progress.needNote')
                                  // Says so, so a coach who meant to mark something notices.
                                  : !hasChanges ? t('coach.progress.sendNoChange')
                                  : t('coach.progress.send')}
                              </button>
                            </div>
                            {errorMap[s.entryKey] && (
                              <p className="text-red-400 text-xs mb-3">{errorMap[s.entryKey]}</p>
                            )}
                            <button
                              type="button"
                              onClick={() => setTreeFor({
                                name: s.full_name,
                                level: shownLevel,
                                stage: Number(data.student.current_stage) || 1,
                                // what is on screen, including marks not yet sent
                                percents: localProgress,
                              })}
                              className="w-full mb-3 py-2.5 px-3 rounded-lg border border-[#c9a84c]/45 bg-[#c9a84c]/10 text-[#c9a84c] text-xs font-bold flex items-center justify-between"
                            >
                              <span>{t('tree.title')}</span><span className="text-[11px]">›</span>
                            </button>
                            {/* Six steps, and only the last one had any words behind it -- the
                                pass criteria printed under each skill describes "mastered". The
                                four in between were left to each coach's judgement, which is the
                                exact thing the six-step scale was meant to remove: two coaches
                                watching the same swimmer landed on different chips. The
                                boundaries are written out here, in the place where the marking
                                actually happens, rather than in a handbook nobody has open on
                                the pool deck. */}
                            <details className="mb-3 rounded-lg border border-white/10 bg-white/5">
                              <summary className="cursor-pointer select-none px-3 py-2 text-[11px] font-semibold text-gray-400">
                                {t('mastery.legend')}
                              </summary>
                              <div className="space-y-1.5 px-3 pb-3">
                                {MASTERY_LEVELS.map(b => (
                                  <p key={b} className="text-[11px] leading-relaxed text-gray-400">
                                    <span className="font-bold" style={{ color: MASTERY_COLOR[b] }}>{t(masteryKey(b))}</span>
                                    {' \u2014 '}{t(`mastery.def.${b}`)}
                                  </p>
                                ))}
                                <p className="pt-1 text-[11px] leading-relaxed text-[#c9a84c]">{t('mastery.hint')}</p>
                              </div>
                            </details>
                            <div className="space-y-3">
                              {/* Skills are taught a stage at a time. Grouping them here is what
                                  stops a coach signing off stage 3 work before stage 1 is done. */}
                              {STAGES.map(st => {
                                const inStage = data.skills.filter(k => Number(k.stage || 1) === st)
                                if (inStage.length === 0) return null
                                const done = inStage.filter(k => (localProgress[k.id] ?? 0) >= 100).length
                                const curStage = Number(data.student.current_stage || 1)
                                const isCurrent = curStage === st
                                /* Every stage of the level the swimmer is in is recordable, and a
                                   later stage is no longer dimmed or marked with a padlock (owner,
                                   2026-09-29): stages keep the order of teaching and the ribbons,
                                   but when the coach judges a swimmer ready for a later-stage skill
                                   they score it. The API accepts any skill in the current level. */
                                const stageOpen = true
                                const expanded = (openStageMap[s.entryKey] ?? curStage) === st
                                const allDone = done === inStage.length
                                return (
                              <div key={'stage' + st} className="space-y-3">
                                <button
                                  type="button"
                                  onClick={() => setOpenStageMap(prev => ({ ...prev, [s.entryKey]: expanded ? 0 : st }))}
                                  aria-expanded={expanded}
                                  className="w-full flex items-center gap-2 pt-1 flex-wrap text-left"
                                >
                                  {/* The stage's ribbon, lit on the same test the
                                      coach is marking against: every skill in the
                                      stage at 100. It tells them what the swimmer
                                      is one or two boxes away from collecting. */}
                                  <StageRibbon
                                    level={shownLevel}
                                    stage={st} size={26} earned={allDone} />
                                  <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${isCurrent ? 'bg-[#c9a84c] text-[#1a2744]' : 'bg-white/5 text-gray-500'}`}>
                                    {t('coach.stage', { n: st })}
                                  </span>
                                  {isCurrent
                                    ? <span className="text-[10px] text-[#c9a84c] font-semibold">{t('coach.stage.current')}</span>
                                    : st < curStage
                                      ? <span className="text-[10px] text-gray-500">{allDone ? '🎊 ' + t('coach.stage.done') : t('coach.stage.passedEditable')}</span>
                                      : <span className="text-[10px] text-gray-400">{t('coach.stage.scoreAhead')}</span>}
                                  <span className="text-[10px] text-gray-500 ml-auto font-mono">{done}/{inStage.length}</span>
                                  <span className="text-[10px] text-gray-500 w-3 text-right">{expanded ? '▴' : '▾'}</span>
                                </button>
                                {expanded && (
                                <div className="space-y-3">
                              {inStage.map(skill => {
                                const pct = localProgress[skill.id] ?? 0
                                const color = barColor(pct)
                                return (
                                  <div key={skill.id} className="bg-[#0d1529] rounded-lg p-3">
                                    <div className="flex items-center justify-between mb-2">
                                      <span className="text-white text-sm">{tDb(locale, 'skills', skill.id, skill.name)}</span>
                                      <span className="text-xs font-semibold" style={{ color: MASTERY_COLOR[masteryOf(pct)] }}>{t(masteryKey(masteryOf(pct)))}</span>
                                    </div>
                                    {skill.pass_criteria && (
                                      <p className="text-[11px] leading-relaxed text-gray-400 mb-2">
                                        <span className="text-[#c9a84c] font-semibold">{t('coach.criteria')} </span>{tDb(locale, 'skill_criteria', skill.id, skill.pass_criteria)}
                                      </p>
                                    )}
                                    <div className="h-1.5 bg-white/10 rounded-full overflow-hidden mb-2">
                                      <div className="h-full rounded-full transition-all" style={{ width: `${MASTERY_FILL[masteryOf(pct)]}%`, backgroundColor: MASTERY_COLOR[masteryOf(pct)] }} />
                                    </div>
                                    <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
                                      {MASTERY_LEVELS.map(b => {
                                        const v = MASTERY_VALUE[b]
                                        const on = masteryOf(pct) === b
                                        return (
                                        <button key={b}
                                          disabled={!stageOpen || locked || isCompleted}
                                          onClick={() => { if (stageOpen && !locked && !isCompleted) setEditsMap(prev => ({ ...prev, [s.entryKey]: { ...prev[s.entryKey], [skill.id]: v } })) }}
                                          className={`w-full py-2 rounded text-[11px] leading-tight font-medium transition-all ${on ? 'font-bold' : 'text-gray-400 bg-white/5'} ${stageOpen && !locked && !isCompleted ? 'hover:bg-white/10' : 'cursor-not-allowed'}`}
                                          style={on ? { backgroundColor: MASTERY_COLOR[b], color: '#1a2744' } : {}}
                                        >
                                          {t(masteryKey(b))}
                                        </button>
                                        )
                                      })}
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
                          </>
                        )}
                      </>
                    ) : errorMap[s.entryKey] ? (
                      <p className="text-red-400 text-xs">{errorMap[s.entryKey]}</p>
                    ) : null}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
      {treeFor && (
        <SkillTree
          studentName={treeFor.name}
          currentLevel={treeFor.level}
          currentStage={treeFor.stage}
          percentBySkillId={treeFor.percents}
          forCoach
          onClose={() => setTreeFor(null)}
        />
      )}
    </div>
  )
}
