'use client'

import { formatTime12h } from '@/lib/date'

import { useState, useEffect } from 'react'

type Skill = { id: string; name: string; sort_order: number }
type StudentProgress = {
  student: { id: string; full_name: string; current_level: string | null; level: { level_number: number; name: string } | null }
  skills: Skill[]
  progress: Record<string, number>
  todayLocked: boolean
}

const LEVEL_NAMES: Record<string, string> = {
  '1': 'Water Intro', '2': 'Water Comfort', '3': 'Pool Safety',
  '4': 'Beginner', '5': 'Intermediate', '6': 'Advanced',
  '7': 'Bronze', '8': 'Silver', '9': 'Gold',
}
const LEVEL_COLORS: Record<string, string> = {
  '1': '#ef4444', '2': '#f97316', '3': '#eab308', '4': '#22c55e',
  '5': '#3b82f6', '6': '#a855f7', '7': '#f59e0b', '8': '#6b7280', '9': '#ca8a04',
}

function barColor(pct: number): string {
  if (pct >= 70) return '#3ecf8e'
  if (pct >= 30) return '#f5a623'
  if (pct > 0) return '#f56565'
  return 'rgba(255,255,255,0.1)'
}

export default function CoachProgressClient({ coach, sessions, today, completedSessionIds }: {
  coach: { id: string; first_name: string }
  sessions: any[]
  today: string
  completedSessionIds: string[]
}) {
  const [expandedStudent, setExpandedStudent] = useState<string | null>(null)
  const [studentDataMap, setStudentDataMap] = useState<Record<string, StudentProgress>>({})
  const [localProgressMap, setLocalProgressMap] = useState<Record<string, Record<string, number>>>({})
  const [savingMap, setSavingMap] = useState<Record<string, boolean>>({})
  const [completedSet, setCompletedSet] = useState<Set<string>>(new Set(completedSessionIds))
  const [loadingMap, setLoadingMap] = useState<Record<string, boolean>>({})
  const [recommendedLevelMap, setRecommendedLevelMap] = useState<Record<string, string>>({})
  const [recommendLevelInput, setRecommendLevelInput] = useState<Record<string, string>>({})
  const [recommendingMap, setRecommendingMap] = useState<Record<string, boolean>>({})
  const [showChangeMap, setShowChangeMap] = useState<Record<string, boolean>>({})
  const [locked, setLocked] = useState(false)

  useEffect(() => {
    const check = () => {
      const la = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }))
      setLocked(la.getHours() === 0)
    }
    check()
    const t = setInterval(check, 60000)
    return () => clearInterval(t)
  }, [])

  // Display per session; same student in different lessons stays independent (keyed by sessionId)
  const sessionEntries = sessions.flatMap(s =>
    s.bookings.map((b: any) => ({
      studentId: b.students?.id || '',
      full_name: b.students?.full_name || '',
      current_level: b.students?.current_level || null,
      sessionId: s.id,
      sessionDate: s.session_date || today,
      sessionTime: `${formatTime12h(s.start_time)} - ${formatTime12h(s.end_time)}`,
      courseName: s.course_types?.name || '',
      entryKey: `${b.students?.id}_${s.id}`,
    }))
  ).filter(e => e.studentId)

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
    if (data.todayLocked) setCompletedSet(prev => new Set([...prev, sessionId]))
    if (recData.recommended_level) {
      setRecommendedLevelMap(prev => ({ ...prev, [entryKey]: String(recData.recommended_level) }))
    }
    setLoadingMap(prev => ({ ...prev, [entryKey]: false }))
  }

  async function saveProgress(entryKey: string, studentId: string, sessionId: string) {
    if (locked || completedSet.has(sessionId)) return
    setSavingMap(prev => ({ ...prev, [entryKey]: true }))
    const progress = localProgressMap[entryKey] || {}
    const res = await fetch('/api/coach/progress', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ student_id: studentId, progress, coach_id: coach.id, class_session_id: sessionId })
    })
    if (res.ok) {
      // Mark completed and collapse this card
      setCompletedSet(prev => new Set([...prev, sessionId]))
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
          <p className="text-gray-400 text-sm mt-1">{today} · {sessionEntries.length} students today</p>
        </div>

      </div>

      {sessionEntries.length === 0 ? (
        <div className="bg-[#111d38] rounded-xl border border-[#1e3a6e] p-8 text-center text-gray-400">No lessons scheduled today</div>
      ) : (
        <div className="space-y-3">
          {sessionEntries.map(s => {
            const lvl = s.current_level || ''
            const color = LEVEL_COLORS[lvl] || '#6b7280'
            const isCompleted = completedSet.has(s.sessionId)
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
                  className={`w-full flex items-center justify-between p-4 text-left transition-all ${isExpanded ? 'bg-[#1e3a6e]/40' : 'hover:bg-[#1e3a6e]/20'}`}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-[#1a2744] flex items-center justify-center flex-shrink-0">
                      <span className="text-[#c9a84c] font-bold text-sm">{s.full_name.charAt(0)}</span>
                    </div>
                    <div>
                      <p className="text-white font-medium text-sm">{s.full_name}</p>
                      <p className="text-gray-500 text-xs">
                        {new Date((s.sessionDate || today) + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })} · {s.sessionTime} · {s.courseName}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {/* Completion status */}
                    {isCompleted ? (
                      <span className="text-xs px-2 py-1 rounded-full bg-green-900/40 text-green-400 font-medium">✓ Completed</span>
                    ) : (
                      <span className="text-xs px-2 py-1 rounded-full bg-gray-700/50 text-gray-400">○ Not filled</span>
                    )}
                    {/* Level badge */}
                    {lvl ? (
                      <span className="text-xs px-2 py-1 rounded-full font-medium" style={{ backgroundColor: color + '33', color }}>L{lvl}</span>
                    ) : (
                      <span className="text-xs px-2 py-1 rounded-full bg-gray-700/50 text-gray-400">Unassigned</span>
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
                            <div className="flex justify-between items-center mb-3">
                              <p className="text-gray-500 text-xs uppercase tracking-wider">Skill Progress</p>
                              <button
                                onClick={() => saveProgress(s.entryKey, s.studentId, s.sessionId)}
                                disabled={saving || !hasChanges || locked || isCompleted}
                                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                                  isCompleted ? 'bg-green-700/50 text-green-400 cursor-not-allowed' :
                                  hasChanges && !locked ? 'bg-[#c9a84c] text-[#1a2744] hover:opacity-90' :
                                  'bg-gray-700 text-gray-500 cursor-not-allowed'
                                }`}
                              >
                                {saving ? 'Saving...' : isCompleted ? '✓ Done for Today' : locked ? 'Locked' : 'Save Progress'}
                              </button>
                            </div>
                            <div className="space-y-3">
                              {data.skills.map(skill => {
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
                                          onClick={() => { if (!locked && !isCompleted) setLocalProgressMap(prev => ({ ...prev, [s.entryKey]: { ...prev[s.entryKey], [skill.id]: v } })) }}
                                          className={`flex-1 py-1 rounded text-xs font-medium transition-all ${pct === v ? 'font-bold' : 'text-gray-400 bg-white/5 hover:bg-white/10'} ${locked || isCompleted ? 'cursor-not-allowed opacity-50' : ''}`}
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
