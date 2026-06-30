'use client'

import { useState, useMemo } from 'react'

type Level = { id: string; level_number: number; name: string }
type Skill = { id: string; name: string; sort_order: number; level_id: string }
type Student = { id: string; full_name: string; current_level: string | null; parents: { first_name: string; last_name: string } | null }
type UpgradeHistory = {
  id: string; from_level: string | null; to_level: string; upgraded_at: string; notes: string | null
  students: { full_name: string }; admins: { first_name: string; last_name: string }
}
type PendingProgress = {
  id: string; student_id: string; snapshot: Record<string, number>; session_date: string; created_at: string
  student: { id: string; full_name: string; current_level: string | null }
  coach: { first_name: string }
  skills: { id: string; name: string; sort_order: number; level_id: string }[]
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
  session: { id: string; session_date: string; start_time: string; end_time: string; coach_id: string; ct: { name: string } | null; coach: { first_name: string } | null } | null
  existingProgress: Record<string, number>
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

export default function AdminUpgradesClient({ upgradeHistory: initialHistory, adminId, levels, skills, students, recommendations: initialRecs,
  pendingProgressList: initialPending,
  missingProgressList: initialMissing,
}: {
  upgradeHistory: UpgradeHistory[]
  adminId: string
  levels: Level[]
  skills: Skill[]
  students: Student[]
  recommendations: Recommendation[]
  pendingProgressList: PendingProgress[]
  missingProgressList: MissingProgress[]
}) {
  const [upgradeHistory, setUpgradeHistory] = useState(initialHistory)
  const [recommendations, setRecommendations] = useState(initialRecs)
  const [pendingProgressList, setPendingProgressList] = useState(initialPending)
  const [search, setSearch] = useState('')
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null)
  const [selectedLevel, setSelectedLevel] = useState<string>('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [expandedLevel, setExpandedLevel] = useState<string | null>(null)
  const [showSearch, setShowSearch] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [reviewingId, setReviewingId] = useState<string | null>(null)
  const [missingProgressList, setMissingProgressList] = useState(initialMissing)
  const [missingProgress, setMissingProgress] = useState<Record<string, Record<string, number>>>({})
  const [submittingMissing, setSubmittingMissing] = useState<string | null>(null)
  const [expandedMissing, setExpandedMissing] = useState<Set<string>>(new Set())
  const [overrideLevel, setOverrideLevel] = useState<Record<string, string>>({})

  const filteredStudents = useMemo(() => {
    if (!search || search.length < 2) return []
    const q = search.toLowerCase()
    return students.filter(s =>
      s.full_name.toLowerCase().includes(q) ||
      (s.parents && `${s.parents.first_name} ${s.parents.last_name}`.toLowerCase().includes(q))
    ).slice(0, 8)
  }, [search, students])

  const skillsByLevel = useMemo(() => {
    const map: Record<string, Skill[]> = {}
    for (const skill of skills) {
      if (!map[skill.level_id]) map[skill.level_id] = []
      map[skill.level_id].push(skill)
    }
    return map
  }, [skills])

  async function handleAssign() {
    if (!selectedStudent || !selectedLevel) return
    setSaving(true)
    const res = await fetch('/api/admin/assign-level', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        student_id: selectedStudent.id,
        level_number: selectedLevel,
        notes, admin_id: adminId,
        from_level: selectedStudent.current_level,
      })
    })
    if (res.ok) {
      const record = await res.json()
      setUpgradeHistory(prev => [record, ...prev])
      setSaved(true)
      setTimeout(() => {
        setSelectedStudent(null); setSelectedLevel(''); setNotes(''); setSaved(false); setShowSearch(false); setSearch('')
      }, 1500)
    }
    setSaving(false)
  }

  async function handleReview(rec: Recommendation, action: 'approved' | 'modified' | 'rejected') {
    setReviewingId(rec.id)
    const finalLevel = action === 'modified' ? parseInt(overrideLevel[rec.id] || String(rec.recommended_level)) : rec.recommended_level
    await fetch('/api/admin/review-level', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recommendation_id: rec.id, action, final_level: finalLevel, admin_id: adminId })
    })
    setRecommendations(prev => prev.filter(r => r.id !== rec.id))
    if (action !== 'rejected') {
      const newRecord = {
        id: rec.id,
        from_level: rec.student.current_level,
        to_level: String(finalLevel),
        upgraded_at: new Date().toISOString(),
        notes: null,
        students: { full_name: rec.student.full_name },
        admins: { first_name: 'Admin', last_name: '' }
      }
      setUpgradeHistory(prev => [newRecord as any, ...prev])
    }
    setReviewingId(null)
  }

  async function reviewProgress(historyId: string) {
    await fetch('/api/admin/review-progress', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ history_id: historyId, admin_id: adminId })
    })
    setPendingProgressList(prev => prev.filter(p => p.id !== historyId))
  }

  async function submitMissingProgress(listId: string, studentId: string, coachId: string | null, sessionDate: string | null) {
    setSubmittingMissing(listId)
    const prog = missingProgress[listId] || {}
    const res = await fetch('/api/coach/progress', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        student_id: studentId,
        progress: prog,
        coach_id: coachId || adminId,
        session_date: sessionDate,
        admin_override: true,
      })
    })
    if (res.ok) {
      setMissingProgressList(prev => prev.filter(s => s.id !== listId))
    }
    setSubmittingMissing(null)
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white font-['Playfair_Display']">Level Management</h1>
        <p className="text-gray-400 mt-1">Assign or upgrade student swim levels</p>
      </div>

      {/* 今日未填寫通知 */}
      {missingProgressList.length > 0 && (
        <div className="mb-8">
          <h2 className="text-sm font-semibold text-red-400 uppercase tracking-wider mb-4 flex items-center gap-2">
            ⚠️ 未填進度
            <span className="bg-red-500 text-white text-xs px-2 py-0.5 rounded-full font-bold">{missingProgressList.length}</span>
            <span className="text-gray-500 normal-case font-normal text-xs">（含過去未填，截至 {new Date().toLocaleDateString('zh-TW', { month: 'long', day: 'numeric', weekday: 'short' })}）</span>
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
                        {s.session?.session_date ? `${new Date(s.session.session_date + 'T00:00:00').toLocaleDateString('zh-TW', { month: 'long', day: 'numeric', weekday: 'short' })} · ` : ''}
                        {s.session ? `教練 ${s.session.coach?.first_name} · ${s.session.ct?.name} · ${s.session.start_time?.slice(0,5)}–${s.session.end_time?.slice(0,5)}` : '有課'}
                        {s.current_level ? ` · Level ${s.current_level}` : ''}
                      </p>
                    </div>
                    <button
                      onClick={e => { e.stopPropagation(); submitMissingProgress(s.id, s.student_id, s.session?.coach_id || null, s.session?.session_date || null) }}
                      disabled={submittingMissing === s.id}
                      className="px-4 py-2 rounded-lg bg-red-500/20 border border-red-500/40 text-red-400 font-semibold text-sm hover:bg-red-500/30 transition-all disabled:opacity-50"
                    >
                      {submittingMissing === s.id ? '儲存中...' : '代填送審'}
                    </button>
                  </div>
                  {levelSkills.length > 0 && expandedMissing.has(s.id) && (
                    <div className="space-y-2">
                      {levelSkills.map(sk => {
                        const pct = prog[sk.id] ?? 0
                        const options = [0, 20, 40, 60, 80, 100]
                        return (
                          <div key={sk.id}>
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-gray-300 text-xs">{sk.name}</span>
                              <span className="text-xs font-mono" style={{ color: pct >= 100 ? '#3ecf8e' : pct > 0 ? '#f5a623' : 'rgba(255,255,255,0.25)' }}>{pct}%</span>
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
                                >{v}%</button>
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

      {/* 今日進度審核 */}
      {pendingProgressList.length > 0 && (
        <div className="mb-8">
          <h2 className="text-sm font-semibold text-[#c9a84c] uppercase tracking-wider mb-4 flex items-center gap-2">
            今日待審核進度
            <span className="bg-[#c9a84c] text-[#111d38] text-xs px-2 py-0.5 rounded-full font-bold">{pendingProgressList.length}</span>
          </h2>
          <div className="space-y-4">
            {pendingProgressList.map(p => {
              const lvl = p.student?.current_level || ''
              const levelSkills = p.skills.filter((sk: any) => {
                return true // will filter by level below
              })
              const skillMap: Record<string, string> = {}
              for (const sk of p.skills) skillMap[sk.id] = sk.name
              const entries = Object.entries(p.snapshot || {})
              return (
                <div key={p.id} className="bg-[#111d38] rounded-xl border border-[#1e3a6e] p-5">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <p className="text-white font-semibold">{p.student?.full_name}</p>
                      <p className="text-gray-400 text-xs">教練 {p.coach?.first_name} · Level {lvl} · {new Date(p.created_at).toLocaleString('en-US', { hour: '2-digit', minute: '2-digit' })}</p>
                    </div>
                    <button
                      onClick={() => reviewProgress(p.id)}
                      className="px-4 py-2 rounded-lg bg-[#c9a84c] text-[#111d38] font-semibold text-sm hover:opacity-90 transition-all"
                    >
                      確認 → 發布給家長
                    </button>
                  </div>
                  <div className="space-y-2">
                    {entries.map(([skillId, pct]) => {
                      const skillName = skillMap[skillId] || skillId
                      const p2 = pct as number
                      const color = p2 >= 70 ? '#3ecf8e' : p2 >= 30 ? '#f5a623' : p2 > 0 ? '#f56565' : 'rgba(255,255,255,0.1)'
                      return (
                        <div key={skillId} className="flex items-center gap-3">
                          <p className="text-gray-300 text-xs w-48 flex-shrink-0">{skillName}</p>
                          <div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden">
                            <div className="h-full rounded-full" style={{ width: `${p2}%`, backgroundColor: color }} />
                          </div>
                          <span className="text-xs font-mono w-8 text-right" style={{ color }}>{p2}%</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* 待審核建議 */}
      {recommendations.length > 0 && (
        <div className="mb-8">
          <h2 className="text-sm font-semibold text-[#c9a84c] uppercase tracking-wider mb-4 flex items-center gap-2">
            待審核等級建議
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
                        教練 {rec.coach.first_name} 建議 ·{' '}
                        {new Date(rec.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </p>
                      {rec.history && rec.history.length > 1 && (
                      <div className="mt-2 space-y-1">
                        <p className="text-gray-600 text-xs uppercase tracking-wider">更改記錄</p>
                        {rec.history.map((h: any, i: number) => {
                          const t = new Date(h.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                          if (i === 0) return (
                            <p key={i} className="text-gray-500 text-xs flex items-center gap-1.5">
                              <span className="text-gray-600">{t}</span>
                              <span>送出 L{h.recommended_level}</span>
                            </p>
                          )
                          return (
                            <p key={i} className="text-amber-400/80 text-xs flex items-center gap-1.5">
                              <span className="text-gray-600">{t}</span>
                              <span>更改</span>
                              <span className="line-through text-gray-500">L{h.previous_recommended_level}</span>
                              <span>→</span>
                              <span className="text-amber-400 font-medium">L{h.recommended_level}</span>
                            </p>
                          )
                        })}
                      </div>
                    )}
                    {rec.notes && <p className="text-gray-500 text-xs mt-1">備註：{rec.notes}</p>}
                    </div>
                    <span className="text-sm px-3 py-1 rounded-full font-semibold" style={{ backgroundColor: color + '33', color }}>
                      建議 L{lvl} · {LEVEL_NAMES[String(lvl)]}
                    </span>
                  </div>

                  {/* 主管可以改 level */}
                  <div className="mb-3">
                    <p className="text-gray-500 text-xs mb-2">主管可修改等級：</p>
                    <div className="flex flex-wrap gap-1.5">
                      {[1,2,3,4,5,6,7,8,9].map(n => (
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
                      {reviewingId === rec.id ? '處理中...' : override !== String(lvl) ? `確認修改為 L${override}` : `確認 L${lvl}`}
                    </button>
                    <button
                      onClick={() => handleReview(rec, 'rejected')}
                      disabled={reviewingId === rec.id}
                      className="px-4 py-2 rounded-lg border border-red-500/40 text-red-400 text-sm hover:bg-red-500/10 transition-all"
                    >
                      拒絕
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Assign Level */}
      <div className="bg-[#111d38] rounded-xl border border-[#1e3a6e] p-5 mb-8">
        <h2 className="text-sm font-semibold text-[#c9a84c] uppercase tracking-wider mb-4">Assign Level to Student</h2>
        {!selectedStudent ? (
          <div>
            <input
              type="text" placeholder="Search student by name or parent..."
              value={search}
              onChange={e => { setSearch(e.target.value); setShowSearch(true) }}
              onFocus={() => setShowSearch(true)}
              className="w-full bg-[#0d1529] border border-[#1e3a6e] rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-[#c9a84c] transition-colors placeholder-gray-500"
            />
            {showSearch && filteredStudents.length > 0 && (
              <div className="mt-2 space-y-1">
                {filteredStudents.map(s => (
                  <button key={s.id}
                    onClick={() => { setSelectedStudent(s); setSelectedLevel(s.current_level || ''); setSearch(''); setShowSearch(false) }}
                    className="w-full flex items-center justify-between bg-[#0d1529] border border-[#1e3a6e] rounded-lg px-4 py-2.5 text-left hover:border-[#c9a84c]/50 transition-all"
                  >
                    <div>
                      <p className="text-white text-sm">{s.full_name}</p>
                      {s.parents && <p className="text-gray-500 text-xs">{s.parents.first_name} {s.parents.last_name}</p>}
                    </div>
                    <span className="text-xs px-2 py-1 rounded-full" style={{
                      backgroundColor: (LEVEL_COLORS[s.current_level || ''] || '#374151') + '33',
                      color: LEVEL_COLORS[s.current_level || ''] || '#9ca3af'
                    }}>{s.current_level ? `L${s.current_level}` : 'No Level'}</span>
                  </button>
                ))}
              </div>
            )}
            {showSearch && search.length >= 2 && filteredStudents.length === 0 && (
              <p className="text-gray-500 text-sm mt-2 px-1">No students found</p>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between bg-[#0d1529] rounded-lg px-4 py-3">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-[#1e3a6e] flex items-center justify-center">
                  <span className="text-[#c9a84c] font-bold text-sm">{selectedStudent.full_name.charAt(0)}</span>
                </div>
                <div>
                  <p className="text-white font-medium text-sm">{selectedStudent.full_name}</p>
                  <p className="text-gray-500 text-xs">
                    Current: {selectedStudent.current_level ? `Level ${selectedStudent.current_level} · ${LEVEL_NAMES[selectedStudent.current_level]}` : 'No Level'}
                  </p>
                </div>
              </div>
              <button onClick={() => { setSelectedStudent(null); setSelectedLevel(''); setNotes('') }}
                className="text-gray-500 hover:text-gray-300 text-xs">✕ Change</button>
            </div>
            <div>
              <p className="text-gray-400 text-xs uppercase tracking-wider mb-2">Assign Level</p>
              <div className="grid grid-cols-3 md:grid-cols-5 gap-2">
                {levels.map(l => (
                  <button key={l.id} onClick={() => setSelectedLevel(String(l.level_number))}
                    className={`py-2 px-3 rounded-lg border text-sm font-medium transition-all ${
                      selectedLevel === String(l.level_number)
                        ? 'border-[#c9a84c] bg-[#c9a84c]/20 text-[#c9a84c]'
                        : 'border-[#1e3a6e] bg-[#0d1529] text-gray-400 hover:border-[#c9a84c]/50'
                    }`}
                  >
                    <div className="text-xs">L{l.level_number}</div>
                    <div className="text-xs opacity-70">{LEVEL_NAMES[String(l.level_number)]}</div>
                  </button>
                ))}
              </div>
            </div>
            <input type="text" placeholder="Notes (optional)" value={notes} onChange={e => setNotes(e.target.value)}
              className="w-full bg-[#0d1529] border border-[#1e3a6e] rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-[#c9a84c] transition-colors placeholder-gray-600"
            />
            <button onClick={() => setShowConfirm(true)} disabled={!selectedLevel || saving}
              className={`w-full py-2.5 rounded-lg font-semibold text-sm transition-all ${
                saved ? 'bg-green-600 text-white' :
                selectedLevel ? 'bg-[#c9a84c] text-[#111d38] hover:opacity-90' :
                'bg-gray-700 text-gray-500 cursor-not-allowed'
              }`}
            >
              {saving ? 'Saving...' : saved ? '✓ Level Assigned' : `Assign Level ${selectedLevel}${selectedLevel ? ' · ' + LEVEL_NAMES[selectedLevel] : ''}`}
            </button>
          </div>
        )}
      </div>

      {/* Level Skills Reference */}
      <div className="mb-8">
        <h2 className="text-sm font-semibold text-[#c9a84c] uppercase tracking-wider mb-4">Level Skills Reference</h2>
        <div className="space-y-2">
          {levels.map(l => {
            const lvlSkills = skillsByLevel[l.id] || []
            const isOpen = expandedLevel === l.id
            return (
              <div key={l.id} className="bg-[#111d38] rounded-xl border border-[#1e3a6e] overflow-hidden">
                <button onClick={() => setExpandedLevel(isOpen ? null : l.id)}
                  className="w-full flex items-center justify-between px-5 py-3 text-left hover:bg-[#1e3a6e]/30 transition-all"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-xs px-2 py-1 rounded-full font-medium" style={{
                      backgroundColor: (LEVEL_COLORS[String(l.level_number)] || '#374151') + '33',
                      color: LEVEL_COLORS[String(l.level_number)] || '#9ca3af'
                    }}>L{l.level_number}</span>
                    <span className="text-white text-sm font-medium">{LEVEL_NAMES[String(l.level_number)]}</span>
                    <span className="text-gray-500 text-xs">{lvlSkills.length} skills</span>
                  </div>
                  <span className="text-gray-500 text-xs">{isOpen ? '▲' : '▼'}</span>
                </button>
                {isOpen && (
                  <div className="border-t border-[#1e3a6e] px-5 py-3 grid grid-cols-1 md:grid-cols-2 gap-1.5">
                    {lvlSkills.map((sk, i) => (
                      <div key={sk.id} className="flex items-center gap-2 text-sm text-gray-300">
                        <span className="text-gray-600 text-xs w-5 text-right">{i + 1}.</span>
                        {sk.name}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* History */}
      <div>
        <h2 className="text-sm font-semibold text-[#c9a84c] uppercase tracking-wider mb-4">Assignment History</h2>
        {upgradeHistory.length === 0 ? (
          <div className="bg-[#111d38] rounded-xl border border-[#1e3a6e] p-8 text-center">
            <p className="text-gray-400">No level assignments yet</p>
          </div>
        ) : (
          <div className="space-y-2">
            {upgradeHistory.map((h: any) => (
              <div key={h.id} className="bg-[#111d38] rounded-xl border border-[#1e3a6e] p-4 flex items-center justify-between">
                <div>
                  <p className="text-white text-sm font-medium">{h.students?.full_name}</p>
                  <p className="text-gray-400 text-xs mt-0.5">
                    {h.from_level ? `L${h.from_level} → ` : '未分級 → '}
                    <span className="text-[#c9a84c]">L{h.to_level} ({LEVEL_NAMES[h.to_level]})</span>
                    {h.notes && ` · ${h.notes}`}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-gray-500 text-xs">{new Date(h.upgraded_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</p>
                  <p className="text-gray-600 text-xs">by {h.admins?.first_name} {h.admins?.last_name}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Confirm Modal */}
      {showConfirm && selectedStudent && selectedLevel && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4">
          <div className="bg-[#111d38] border border-[#1e3a6e] rounded-2xl p-6 w-full max-w-sm">
            <h3 className="text-white font-bold text-lg mb-1">確認指定等級</h3>
            <p className="text-gray-400 text-sm mb-5">請確認以下操作：</p>
            <div className="bg-[#0d1529] rounded-xl p-4 mb-5 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">學生</span>
                <span className="text-white font-medium">{selectedStudent.full_name}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">目前等級</span>
                <span className="text-gray-300">{selectedStudent.current_level ? `Level ${selectedStudent.current_level} · ${LEVEL_NAMES[selectedStudent.current_level]}` : '未指定'}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">指定為</span>
                <span className="text-[#c9a84c] font-semibold">Level {selectedLevel} · {LEVEL_NAMES[selectedLevel]}</span>
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setShowConfirm(false)}
                className="flex-1 py-2.5 rounded-lg border border-[#1e3a6e] text-gray-300 text-sm hover:bg-[#1e3a6e]/40 transition-all">取消</button>
              <button onClick={() => { setShowConfirm(false); handleAssign() }}
                className="flex-1 py-2.5 rounded-lg bg-[#c9a84c] text-[#111d38] font-semibold text-sm hover:opacity-90 transition-all">確認指定</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
