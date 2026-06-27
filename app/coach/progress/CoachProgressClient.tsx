'use client'

import { useState } from 'react'

type Skill = { id: string; name: string; sort_order: number }
type StudentProgress = {
  student: { id: string; full_name: string; current_level: string | null; level: { level_number: number; name: string } | null }
  skills: Skill[]
  progress: Record<string, number>
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

export default function CoachProgressClient({ coach, sessions, today }: {
  coach: { id: string; first_name: string }
  sessions: any[]
  today: string
}) {
  const [selectedStudent, setSelectedStudent] = useState<string | null>(null)
  const [studentData, setStudentData] = useState<StudentProgress | null>(null)
  const [localProgress, setLocalProgress] = useState<Record<string, number>>({})
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(false)
  const [recommendLevel, setRecommendLevel] = useState<string>('')
  const [recommendNotes, setRecommendNotes] = useState('')
  const [recommending, setRecommending] = useState(false)
  const [recommended, setRecommended] = useState(false)

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

  async function selectStudent(studentId: string) {
    setSelectedStudent(studentId)
    setStudentData(null)
    setSaved(false)
    setRecommended(false)
    setRecommendLevel('')
    setRecommendNotes('')
    setLoading(true)
    const res = await fetch(`/api/coach/progress?student_id=${studentId}`)
    const data = await res.json()
    setStudentData(data)
    setLocalProgress({ ...data.progress })
    setLoading(false)
  }

  function handleProgress(skillId: string, val: number) {
    setLocalProgress(prev => ({ ...prev, [skillId]: val }))
    setSaved(false)
  }

  async function saveProgress() {
    if (!selectedStudent) return
    setSaving(true)
    await fetch('/api/coach/progress', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ student_id: selectedStudent, progress: localProgress })
    })
    setSaving(false)
    setSaved(true)
  }

  async function submitRecommendation() {
    if (!selectedStudent || !recommendLevel) return
    setRecommending(true)
    await fetch('/api/coach/recommend-level', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        student_id: selectedStudent,
        recommended_level: parseInt(recommendLevel),
        notes: recommendNotes || null
      })
    })
    setRecommending(false)
    setRecommended(true)
  }

  const hasChanges = studentData && JSON.stringify(localProgress) !== JSON.stringify(studentData.progress)

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Progress Entry</h1>
        <p className="text-gray-400 text-sm mt-1">{today} · {uniqueStudents.length} students today</p>
      </div>

      {uniqueStudents.length === 0 ? (
        <div className="bg-[#111d38] rounded-xl border border-[#1e3a6e] p-8 text-center text-gray-400">
          今天沒有排課
        </div>
      ) : (
        <div className="space-y-2 mb-6">
          {uniqueStudents.map(s => {
            const lvl = s.current_level || ''
            const color = LEVEL_COLORS[lvl] || '#6b7280'
            return (
              <button
                key={s.id}
                onClick={() => selectStudent(s.id)}
                className={`w-full flex items-center justify-between p-4 rounded-xl border transition-all text-left ${
                  selectedStudent === s.id
                    ? 'bg-[#1e3a6e] border-[#c9a84c]'
                    : 'bg-[#111d38] border-[#1e3a6e] hover:border-[#c9a84c]/50'
                }`}
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
                {lvl ? (
                  <span className="text-xs px-2 py-1 rounded-full font-medium" style={{ backgroundColor: color + '33', color }}>
                    L{lvl}
                  </span>
                ) : (
                  <span className="text-xs px-2 py-1 rounded-full bg-gray-700/50 text-gray-400">未分級</span>
                )}
              </button>
            )
          })}
        </div>
      )}

      {loading && <div className="text-center text-gray-400 py-8">載入中...</div>}

      {studentData && !loading && (
        <div className="bg-[#111d38] rounded-xl border border-[#1e3a6e] p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-white font-semibold">{studentData.student.full_name}</p>
              <p className="text-gray-400 text-xs">
                {studentData.student.level
                  ? `Level ${studentData.student.level.level_number} · ${studentData.student.level.name}`
                  : 'No level assigned'}
              </p>
            </div>
            {studentData.skills.length > 0 && (
              <button
                onClick={saveProgress}
                disabled={saving || !hasChanges}
                className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                  saved ? 'bg-green-600 text-white' :
                  hasChanges ? 'bg-[#c9a84c] text-[#1a2744] hover:opacity-90' :
                  'bg-gray-700 text-gray-500 cursor-not-allowed'
                }`}
              >
                {saving ? '儲存中...' : saved ? '\u2713 已儲存' : '儲存進度'}
              </button>
            )}
          </div>

          {!studentData.student.level && (
            <div className="bg-[#0d1529] rounded-xl border border-[#c9a84c]/30 p-4">
              <p className="text-[#c9a84c] text-xs font-semibold uppercase tracking-wider mb-3">建議等級（送交主管審核）</p>
              <div className="grid grid-cols-3 gap-2 mb-3">
                {[1,2,3,4,5,6,7,8,9].map(n => (
                  <button
                    key={n}
                    onClick={() => setRecommendLevel(String(n))}
                    className={`py-2 px-3 rounded-lg border text-sm font-medium transition-all ${
                      recommendLevel === String(n)
                        ? 'border-[#c9a84c] bg-[#c9a84c]/20 text-[#c9a84c]'
                        : 'border-[#1e3a6e] bg-[#111d38] text-gray-400 hover:border-[#c9a84c]/50'
                    }`}
                  >
                    <div className="text-xs">L{n}</div>
                    <div className="text-xs opacity-70">{LEVEL_NAMES[String(n)]}</div>
                  </button>
                ))}
              </div>
              <input
                type="text"
                placeholder="備註（選填）"
                value={recommendNotes}
                onChange={e => setRecommendNotes(e.target.value)}
                className="w-full bg-[#111d38] border border-[#1e3a6e] rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#c9a84c] transition-colors placeholder-gray-600 mb-3"
              />
              <button
                onClick={submitRecommendation}
                disabled={!recommendLevel || recommending || recommended}
                className={`w-full py-2.5 rounded-lg font-semibold text-sm transition-all ${
                  recommended ? 'bg-green-600 text-white' :
                  recommendLevel ? 'bg-[#c9a84c] text-[#1a2744] hover:opacity-90' :
                  'bg-gray-700 text-gray-500 cursor-not-allowed'
                }`}
              >
                {recommending ? '送出中...' :
                 recommended ? '\u2713 已送交主管審核' :
                 recommendLevel ? `送出建議：Level ${recommendLevel} · ${LEVEL_NAMES[recommendLevel]}` : '請選擇建議等級'}
              </button>
            </div>
          )}

          {studentData.skills.length > 0 && (
            <div className="space-y-3 mt-2">
              {studentData.skills.map(skill => {
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
                        <button
                          key={v}
                          onClick={() => handleProgress(skill.id, v)}
                          className={`flex-1 py-1 rounded text-xs font-medium transition-all ${
                            pct === v ? 'font-bold' : 'text-gray-400 bg-white/5 hover:bg-white/10'
                          }`}
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
      )}
    </div>
  )
}
