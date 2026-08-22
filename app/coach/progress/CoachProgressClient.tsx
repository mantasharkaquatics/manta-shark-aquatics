'use client'

import { formatTime12h, getNowMinutesLA } from '@/lib/date'

import { useState, useEffect } from 'react'
import LessonNoteCapture, { type Capture } from './LessonNoteCapture'
import { LEVEL_NAMES, LEVEL_COLORS, STAGES } from '@/lib/levels'

type Skill = { id: string; name: string; sort_order: number; stage: number | null }
type StudentProgress = {
  student: { id: string; full_name: string; current_level: string | null; current_stage: number | null; level: { level_number: number; name: string } | null }
  skills: Skill[]
  progress: Record<string, number>
  todayLocked: boolean
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
  const [expandedStudent, setExpandedStudent] = useState<string | null>(null)
  const [studentDataMap, setStudentDataMap] = useState<Record<string, StudentProgress>>({})
  const [localProgressMap, setLocalProgressMap] = useState<Record<string, Record<string, number>>>({})
  const [savingMap, setSavingMap] = useState<Record<string, boolean>>({})
  const [completedSet, setCompletedSet] = useState<Set<string>>(new Set(completedKeys))
  const [loadingMap, setLoadingMap] = useState<Record<string, boolean>>({})
  const [recommendedLevelMap, setRecommendedLevelMap] = useState<Record<string, string>>({})
  const [recommendLevelInput, setRecommendLevelInput] = useState<Record<string, string>>({})
  const [recommendingMap, setRecommendingMap] = useState<Record<string, boolean>>({})
  const [showChangeMap, setShowChangeMap] = useState<Record<string, boolean>>({})
  const [locked, setLocked] = useState(false)
  const [captureMap, setCaptureMap] = useState<Record<string, Capture | null>>({})
  const [errorMap, setErrorMap] = useState<Record<string, string>>({})
  // Which stage is unfolded, per student. Unset means "follow the swimmer" --
  // the stage they are actually in opens, and the other two stay shut, so a
  // coach lands on the right list without scrolling past work that is locked.
  const [openStageMap, setOpenStageMap] = useState<Record<string, number>>({})

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
        courseName: s.course_types?.name || '',
        entryKey,
      })
    }
  }
  const sessionEntries = Array.from(entryMap.values())
    .sort((a, b) => a.start_time.localeCompare(b.start_time))
    .map(e => ({ ...e, sessionTime: `${formatTime12h(e.start_time)} - ${formatTime12h(e.end_time)}` }))

  async function toggleStudent(entryKey: string, studentId: string, sessionId: string) {
    if (expandedStudent === entryKey) {
      setExpandedStudent(null)
      return
    }
    setExpandedStudent(entryKey)
    // Re-fetch on every expand to get the latest progress (reflects saves from the previous lesson)
    if (studentDataMap[entryKey]?.todayLocked) return

    setLoadingMap(prev => ({ ...prev, [entryKey]: true }))
    const [res, recRes] = await Promise.all([
      fetch(`/api/coach/progress?student_id=${studentId}&class_session_id=${sessionId}`),
      fetch(`/api/coach/pending-recommendation?student_id=${studentId}`)
    ])
    const data = await res.json()
    const recData = await recRes.json()

    setStudentDataMap(prev => ({ ...prev, [entryKey]: data }))
    setLocalProgressMap(prev => ({ ...prev, [entryKey]: { ...data.progress } }))
    if (data.todayLocked) setCompletedSet(prev => new Set([...prev, entryKey]))
    if (recData.recommended_level) {
      setRecommendedLevelMap(prev => ({ ...prev, [entryKey]: String(recData.recommended_level) }))
    }
    setLoadingMap(prev => ({ ...prev, [entryKey]: false }))
  }

  // Progress and the recording leave together. The owner's rule is that a coach
  // cannot send one without the other, so there is no half-submission to handle.
  async function sendReport(entryKey: string, studentId: string, sessionId: string, lessonGroupId: string | null, sessionDate: string) {
    if (locked || completedSet.has(entryKey)) return
    const capture = captureMap[entryKey]
    if (!capture) return
    setSavingMap(prev => ({ ...prev, [entryKey]: true }))
    setErrorMap(prev => ({ ...prev, [entryKey]: '' }))
    const progress = localProgressMap[entryKey] || {}

    const form = new FormData()
    form.append('audio', capture.blob, 'note.' + (capture.blob.type.includes('mp4') ? 'mp4' : 'webm'))
    form.append('student_id', studentId)
    form.append('class_session_id', sessionId)
    if (lessonGroupId) form.append('lesson_group_id', lessonGroupId)
    form.append('session_date', sessionDate)
    form.append('language', capture.language)
    form.append('seconds', String(capture.seconds))
    form.append('progress', JSON.stringify(progress))

    const res = await fetch('/api/coach/lesson-note', { method: 'POST', body: form })
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      setErrorMap(prev => ({ ...prev, [entryKey]: j.error || 'Could not send. Please try again.' }))
    }
    if (res.ok) {
      // Mark completed and collapse this card
      setCompletedSet(prev => new Set([...prev, entryKey]))
      setExpandedStudent(null)
      // Update studentData for this entryKey (next lesson expand gets fresh progress)
      setStudentDataMap(prev => ({
        ...prev,
        [entryKey]: { ...prev[entryKey], progress, todayLocked: true }
      }))
    }
    setSavingMap(prev => ({ ...prev, [entryKey]: false }))
  }

  async function submitRecommendation(entryKey: string, studentId: string, isChange: boolean) {
    const level = recommendLevelInput[entryKey]
    if (!level || locked) return
    setRecommendingMap(prev => ({ ...prev, [entryKey]: true }))
    const prevLevel = isChange ? recommendedLevelMap[entryKey] : null
    await fetch('/api/coach/recommend-level', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        student_id: studentId,
        recommended_level: parseInt(level),
        notes: null,
        previous_recommended_level: prevLevel ? parseInt(prevLevel) : null
      })
    })
    setRecommendedLevelMap(prev => ({ ...prev, [entryKey]: level }))
    setShowChangeMap(prev => ({ ...prev, [entryKey]: false }))
    setRecommendingMap(prev => ({ ...prev, [entryKey]: false }))
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Progress Entry</h1>
          <p className="text-gray-400 text-sm mt-1">
            {today} · {sessionEntries.length === 0 && scheduledToday > 0
              ? `${scheduledToday} ${scheduledToday === 1 ? 'lesson' : 'lessons'} scheduled`
              : `${sessionEntries.length} ${sessionEntries.length === 1 ? 'lesson' : 'lessons'} today`}
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
              <p className="text-gray-300">No students checked in yet</p>
              <p className="text-gray-500 text-sm mt-1.5">
                You have {scheduledToday} {scheduledToday === 1 ? 'lesson' : 'lessons'} today. Progress can be written once a student is checked in.
              </p>
            </>
          ) : (
            <p className="text-gray-400">No lessons scheduled today</p>
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
            const localProgress = localProgressMap[s.entryKey] || {}
            const saving = savingMap[s.entryKey]
            const hasChanges = data && JSON.stringify(localProgress) !== JSON.stringify(data.progress)
            const recLevel = recommendedLevelMap[s.entryKey]
            const showChange = showChangeMap[s.entryKey]
            const recommending = recommendingMap[s.entryKey]
            const recInput = recommendLevelInput[s.entryKey] || ''

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
                      <span className="text-xs px-2 py-1 rounded-full bg-green-900/40 text-green-400 font-medium whitespace-nowrap">Completed</span>
                    ) : (
                      <span className="text-xs px-2 py-1 rounded-full bg-gray-700/50 text-gray-400 whitespace-nowrap">Not filled</span>
                    )}
                    {/* Level badge */}
                    {lvl ? (
                      <span className="text-xs px-2 py-1 rounded-full font-medium whitespace-nowrap" style={{ backgroundColor: color + '33', color }}>L{lvl}</span>
                    ) : (
                      <span className="text-xs px-2 py-1 rounded-full bg-gray-700/50 text-gray-400 whitespace-nowrap">Unassigned</span>
                    )}
                    <span className="text-gray-500 text-xs">{isExpanded ? '▲' : '▼'}</span>
                  </div>
                </button>

                {/* Expanded content */}
                {isExpanded && (
                  <div className="border-t border-[#1e3a6e] p-4">
                    {loading ? (
                      <div className="text-center text-gray-400 py-6">Loading...</div>
                    ) : data ? (
                      <>
                        {/* Unassigned — recommend a level */}
                        {!data.student.level && (
                          <div className="bg-[#0d1529] rounded-xl border border-[#c9a84c]/30 p-4 mb-3">
                            <div className="flex items-center justify-between mb-3">
                              <p className="text-[#c9a84c] text-xs font-semibold uppercase tracking-wider">Recommended Level (sent for admin review)</p>
                              {recLevel && !showChange && (
                                <button onClick={() => { setShowChangeMap(prev => ({ ...prev, [s.entryKey]: true })); setRecommendLevelInput(prev => ({ ...prev, [s.entryKey]: recLevel })) }}
                                  disabled={locked}
                                  className="text-xs text-gray-400 hover:text-white border border-[#1e3a6e] px-2 py-1 rounded-lg transition-all disabled:opacity-40">
                                  Change
                                </button>
                              )}
                            </div>
                            {recLevel && !showChange ? (
                              <div className="flex items-center gap-3 py-2">
                                <div className="w-2 h-2 rounded-full bg-green-400"></div>
                                <p className="text-green-400 text-sm font-medium">Recommendation submitted: Level {recLevel} · {LEVEL_NAMES[recLevel]}</p>
                              </div>
                            ) : (
                              <>
                                <div className="grid grid-cols-3 gap-2 mb-3">
                                  {[1,2,3,4,5,6,7,8,9].map(n => (
                                    <button key={n} onClick={() => setRecommendLevelInput(prev => ({ ...prev, [s.entryKey]: String(n) }))}
                                      disabled={locked}
                                      className={`py-2 px-3 rounded-lg border text-xs font-medium transition-all disabled:opacity-40 ${
                                        recInput === String(n) ? 'border-[#c9a84c] bg-[#c9a84c]/20 text-[#c9a84c]' : 'border-[#1e3a6e] bg-[#111d38] text-gray-400 hover:border-[#c9a84c]/50'
                                      }`}
                                    >
                                      <div>L{n}</div>
                                      <div className="opacity-70">{LEVEL_NAMES[String(n)]}</div>
                                    </button>
                                  ))}
                                </div>
                                <div className="flex gap-2">
                                  {showChange && (
                                    <button onClick={() => setShowChangeMap(prev => ({ ...prev, [s.entryKey]: false }))}
                                      className="px-3 py-2 rounded-lg border border-[#1e3a6e] text-gray-400 text-xs hover:bg-[#1e3a6e]/40 transition-all">Cancel</button>
                                  )}
                                  <button onClick={() => submitRecommendation(s.entryKey, s.studentId, showChange)}
                                    disabled={!recInput || recommending || locked}
                                    className={`flex-1 py-2 rounded-lg font-semibold text-xs transition-all ${recInput && !locked ? 'bg-[#c9a84c] text-[#1a2744]' : 'bg-gray-700 text-gray-500 cursor-not-allowed'}`}
                                  >
                                    {recommending ? 'Submitting...' : showChange ? `Confirm Change to L${recInput}` : recInput ? `Submit: L${recInput} · ${LEVEL_NAMES[recInput]}` : 'Select a level to recommend'}
                                  </button>
                                </div>
                              </>
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
                                onChange={cap => setCaptureMap(prev => ({ ...prev, [s.entryKey]: cap }))}
                              />
                            )}

                            <div className="flex justify-between items-center mb-3">
                              <p className="text-gray-500 text-xs uppercase tracking-wider">Skill Progress</p>
                              <button
                                onClick={() => sendReport(s.entryKey, s.studentId, s.sessionId, s.lessonGroupId, s.sessionDate)}
                                disabled={saving || !hasChanges || !captureMap[s.entryKey] || locked || isCompleted}
                                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                                  isCompleted ? 'bg-green-700/50 text-green-400 cursor-not-allowed' :
                                  hasChanges && captureMap[s.entryKey] && !locked ? 'bg-[#c9a84c] text-[#1a2744] hover:opacity-90' :
                                  'bg-gray-700 text-gray-500 cursor-not-allowed'
                                }`}
                              >
                                {saving ? 'Sending...'
                                  : isCompleted ? '\u2713 Done for Today'
                                  : locked ? 'Locked'
                                  : !hasChanges ? 'Set the skills first'
                                  : !captureMap[s.entryKey] ? 'Record a note first'
                                  : 'Send Lesson Report'}
                              </button>
                            </div>
                            {errorMap[s.entryKey] && (
                              <p className="text-red-400 text-xs mb-3">{errorMap[s.entryKey]}</p>
                            )}
                            <div className="space-y-3">
                              {/* Skills are taught a stage at a time. Grouping them here is what
                                  stops a coach signing off stage 3 work before stage 1 is done. */}
                              {STAGES.map(st => {
                                const inStage = data.skills.filter(k => Number(k.stage || 1) === st)
                                if (inStage.length === 0) return null
                                const done = inStage.filter(k => (localProgress[k.id] ?? 0) >= 100).length
                                const curStage = Number(data.student.current_stage || 1)
                                const isCurrent = curStage === st
                                // A stage the swimmer has not reached cannot be marked, so the
                                // order of the curriculum is real rather than advisory. Stages
                                // already passed stay open: locking them would make a mistyped
                                // 100% unfixable, and there is no admin screen that edits a
                                // single skill.
                                const stageOpen = st <= curStage
                                const expanded = (openStageMap[s.entryKey] ?? curStage) === st
                                const allDone = done === inStage.length
                                return (
                              <div key={'stage' + st} className="space-y-3">
                                <button
                                  type="button"
                                  onClick={() => setOpenStageMap(prev => ({ ...prev, [s.entryKey]: expanded ? 0 : st }))}
                                  aria-expanded={expanded}
                                  className={`w-full flex items-center gap-2 pt-1 flex-wrap text-left ${stageOpen ? '' : 'opacity-40'}`}
                                >
                                  <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${isCurrent ? 'bg-[#c9a84c] text-[#1a2744]' : 'bg-white/5 text-gray-500'}`}>
                                    Stage {st}
                                  </span>
                                  {isCurrent
                                    ? <span className="text-[10px] text-[#c9a84c] font-semibold">current</span>
                                    : st < curStage
                                      ? <span className="text-[10px] text-gray-500">{allDone ? '🎊 done' : 'passed · editable'}</span>
                                      : <span className="text-[10px] text-gray-500">🔒 finish Stage {curStage} first</span>}
                                  <span className="text-[10px] text-gray-500 ml-auto font-mono">{done}/{inStage.length}</span>
                                  <span className="text-[10px] text-gray-500 w-3 text-right">{expanded ? '▴' : '▾'}</span>
                                </button>
                                {expanded && (
                                <div className={`space-y-3 ${stageOpen ? '' : 'opacity-40'}`}>
                              {inStage.map(skill => {
                                const pct = localProgress[skill.id] ?? 0
                                const color = barColor(pct)
                                return (
                                  <div key={skill.id} className="bg-[#0d1529] rounded-lg p-3">
                                    <div className="flex items-center justify-between mb-2">
                                      <span className="text-white text-sm">{skill.name}</span>
                                      <span className="text-xs font-mono" style={{ color }}>{pct}%</span>
                                    </div>
                                    <div className="h-1.5 bg-white/10 rounded-full overflow-hidden mb-2">
                                      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
                                    </div>
                                    <div className="flex gap-1.5">
                                      {[0, 20, 40, 60, 80, 100].map(v => (
                                        <button key={v}
                                          disabled={!stageOpen || locked || isCompleted}
                                          onClick={() => { if (stageOpen && !locked && !isCompleted) setLocalProgressMap(prev => ({ ...prev, [s.entryKey]: { ...prev[s.entryKey], [skill.id]: v } })) }}
                                          className={`flex-1 py-1 rounded text-xs font-medium transition-all ${pct === v ? 'font-bold' : 'text-gray-400 bg-white/5'} ${stageOpen && !locked && !isCompleted ? 'hover:bg-white/10' : 'cursor-not-allowed'}`}
                                          style={pct === v ? { backgroundColor: color, color: '#1a2744' } : {}}
                                        >
                                          {v}%
                                        </button>
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
                          </>
                        )}
                      </>
                    ) : null}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
