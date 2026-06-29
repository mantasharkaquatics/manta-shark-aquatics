'use client'

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

export default function CoachProgressClient({ coach, sessions, today, completedStudentIds }: {
  coach: { id: string; first_name: string }
  sessions: any[]
  today: string
  completedStudentIds: string[]
}) {
  const [expandedStudent, setExpandedStudent] = useState<string | null>(null)
  const [studentDataMap, setStudentDataMap] = useState<Record<string, StudentProgress>>({})
  const [localProgressMap, setLocalProgressMap] = useState<Record<string, Record<string, number>>>({})
  const [savingMap, setSavingMap] = useState<Record<string, boolean>>({})
  const [completedSet, setCompletedSet] = useState<Set<string>>(new Set(completedStudentIds))
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

  const allStudents = sessions.flatMap(s =>
    s.bookings.map((b: any) => ({
      ...b.students,
      sessionTime: `${s.start_time?.slice(0,5)} - ${s.end_time?.slice(0,5)}`,
      courseName: s.course_types?.name || ''
    }))
  )
  const seen = new Set<string>()
  const uniqueStudents = allStudents.filter(s => {
    if (seen.has(s.id)) return false
    seen.add(s.id); return true
  })

  async function toggleStudent(studentId: string) {
    if (expandedStudent === studentId) {
      setExpandedStudent(null)
      return
    }
    setExpandedStudent(studentId)
    if (studentDataMap[studentId]) return

    setLoadingMap(prev => ({ ...prev, [studentId]: true }))
    const [res, recRes] = await Promise.all([
      fetch(`/api/coach/progress?student_id=${studentId}`),
      fetch(`/api/coach/pending-recommendation?student_id=${studentId}`)
    ])
    const data = await res.json()
    const recData = await recRes.json()

    setStudentDataMap(prev => ({ ...prev, [studentId]: data }))
    setLocalProgressMap(prev => ({ ...prev, [studentId]: { ...data.progress } }))
    if (data.todayLocked) setCompletedSet(prev => new Set([...prev, studentId]))
    if (recData.recommended_level) {
      setRecommendedLevelMap(prev => ({ ...prev, [studentId]: String(recData.recommended_level) }))
    }
    setLoadingMap(prev => ({ ...prev, [studentId]: false }))
  }

  async function saveProgress(studentId: string) {
    if (locked || completedSet.has(studentId)) return
    setSavingMap(prev => ({ ...prev, [studentId]: true }))
    const progress = localProgressMap[studentId] || {}
    const res = await fetch('/api/coach/progress', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ student_id: studentId, progress, coach_id: coach.id })
    })
    if (res.ok) {
      setCompletedSet(prev => new Set([...prev, studentId]))
    }
    setSavingMap(prev => ({ ...prev, [studentId]: false }))
  }

  async function submitRecommendation(studentId: string, isChange: boolean) {
    const level = recommendLevelInput[studentId]
    if (!level || locked) return
    setRecommendingMap(prev => ({ ...prev, [studentId]: true }))
    const prevLevel = isChange ? recommendedLevelMap[studentId] : null
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
    setRecommendedLevelMap(prev => ({ ...prev, [studentId]: level }))
    setShowChangeMap(prev => ({ ...prev, [studentId]: false }))
    setRecommendingMap(prev => ({ ...prev, [studentId]: false }))
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Progress Entry</h1>
          <p className="text-gray-400 text-sm mt-1">{today} · {uniqueStudents.length} students today</p>
        </div>

      </div>

      {uniqueStudents.length === 0 ? (
        <div className="bg-[#111d38] rounded-xl border border-[#1e3a6e] p-8 text-center text-gray-400">今天沒有排課</div>
      ) : (
        <div className="space-y-3">
          {uniqueStudents.map(s => {
            const lvl = s.current_level || ''
            const color = LEVEL_COLORS[lvl] || '#6b7280'
            const isCompleted = completedSet.has(s.id)
            const isExpanded = expandedStudent === s.id
            const data = studentDataMap[s.id]
            const loading = loadingMap[s.id]
            const localProgress = localProgressMap[s.id] || {}
            const saving = savingMap[s.id]
            const hasChanges = data && JSON.stringify(localProgress) !== JSON.stringify(data.progress)
            const recLevel = recommendedLevelMap[s.id]
            const showChange = showChangeMap[s.id]
            const recommending = recommendingMap[s.id]
            const recInput = recommendLevelInput[s.id] || ''

            return (
              <div key={s.id} className="bg-[#111d38] rounded-xl border border-[#1e3a6e] overflow-hidden">
                {/* Header row */}
                <button
                  onClick={() => toggleStudent(s.id)}
                  className={`w-full flex items-center justify-between p-4 text-left transition-all ${isExpanded ? 'bg-[#1e3a6e]/40' : 'hover:bg-[#1e3a6e]/20'}`}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-[#1a2744] flex items-center justify-center flex-shrink-0">
                      <span className="text-[#c9a84c] font-bold text-sm">{s.full_name.charAt(0)}</span>
                    </div>
                    <div>
                      <p className="text-white font-medium text-sm">{s.full_name}</p>
                      <p className="text-gray-500 text-xs">{s.sessionTime} · {s.courseName}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {/* 完成狀態 */}
                    {isCompleted ? (
                      <span className="text-xs px-2 py-1 rounded-full bg-green-900/40 text-green-400 font-medium">✓ 已完成</span>
                    ) : (
                      <span className="text-xs px-2 py-1 rounded-full bg-gray-700/50 text-gray-400">○ 未填寫</span>
                    )}
                    {/* Level badge */}
                    {lvl ? (
                      <span className="text-xs px-2 py-1 rounded-full font-medium" style={{ backgroundColor: color + '33', color }}>L{lvl}</span>
                    ) : (
                      <span className="text-xs px-2 py-1 rounded-full bg-gray-700/50 text-gray-400">未分級</span>
                    )}
                    <span className="text-gray-500 text-xs">{isExpanded ? '▲' : '▼'}</span>
                  </div>
                </button>

                {/* Expanded content */}
                {isExpanded && (
                  <div className="border-t border-[#1e3a6e] p-4">
                    {loading ? (
                      <div className="text-center text-gray-400 py-6">載入中...</div>
                    ) : data ? (
                      <>
                        {/* 未分級 — 建議 Level */}
                        {!data.student.level && (
                          <div className="bg-[#0d1529] rounded-xl border border-[#c9a84c]/30 p-4 mb-3">
                            <div className="flex items-center justify-between mb-3">
                              <p className="text-[#c9a84c] text-xs font-semibold uppercase tracking-wider">建議等級（送交主管審核）</p>
                              {recLevel && !showChange && (
                                <button onClick={() => { setShowChangeMap(prev => ({ ...prev, [s.id]: true })); setRecommendLevelInput(prev => ({ ...prev, [s.id]: recLevel })) }}
                                  disabled={locked}
                                  className="text-xs text-gray-400 hover:text-white border border-[#1e3a6e] px-2 py-1 rounded-lg transition-all disabled:opacity-40">
                                  更改
                                </button>
                              )}
                            </div>
                            {recLevel && !showChange ? (
                              <div className="flex items-center gap-3 py-2">
                                <div className="w-2 h-2 rounded-full bg-green-400"></div>
                                <p className="text-green-400 text-sm font-medium">已送出建議：Level {recLevel} · {LEVEL_NAMES[recLevel]}</p>
                              </div>
                            ) : (
                              <>
                                <div className="grid grid-cols-3 gap-2 mb-3">
                                  {[1,2,3,4,5,6,7,8,9].map(n => (
                                    <button key={n} onClick={() => setRecommendLevelInput(prev => ({ ...prev, [s.id]: String(n) }))}
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
                                    <button onClick={() => setShowChangeMap(prev => ({ ...prev, [s.id]: false }))}
                                      className="px-3 py-2 rounded-lg border border-[#1e3a6e] text-gray-400 text-xs hover:bg-[#1e3a6e]/40 transition-all">取消</button>
                                  )}
                                  <button onClick={() => submitRecommendation(s.id, showChange)}
                                    disabled={!recInput || recommending || locked}
                                    className={`flex-1 py-2 rounded-lg font-semibold text-xs transition-all ${recInput && !locked ? 'bg-[#c9a84c] text-[#1a2744]' : 'bg-gray-700 text-gray-500 cursor-not-allowed'}`}
                                  >
                                    {recommending ? '送出中...' : showChange ? `確認更改為 L${recInput}` : recInput ? `送出建議：L${recInput} · ${LEVEL_NAMES[recInput]}` : '請選擇建議等級'}
                                  </button>
                                </div>
                              </>
                            )}
                          </div>
                        )}

                        {/* 已分級 — 技能進度 */}
                        {data.skills.length > 0 && (
                          <>
                            <div className="flex justify-between items-center mb-3">
                              <p className="text-gray-500 text-xs uppercase tracking-wider">技能進度</p>
                              <button
                                onClick={() => saveProgress(s.id)}
                                disabled={saving || !hasChanges || locked || isCompleted}
                                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                                  isCompleted ? 'bg-green-700/50 text-green-400 cursor-not-allowed' :
                                  hasChanges && !locked ? 'bg-[#c9a84c] text-[#1a2744] hover:opacity-90' :
                                  'bg-gray-700 text-gray-500 cursor-not-allowed'
                                }`}
                              >
                                {saving ? '儲存中...' : isCompleted ? '✓ 今日已完成' : locked ? '已截止' : '儲存進度'}
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
                                          onClick={() => { if (!locked && !isCompleted) setLocalProgressMap(prev => ({ ...prev, [s.id]: { ...prev[s.id], [skill.id]: v } })) }}
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
