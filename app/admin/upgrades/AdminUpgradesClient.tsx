'use client'

import { useState, useMemo } from 'react'

type Level = { id: string; level_number: number; name: string }
type Skill = { id: string; name: string; sort_order: number; level_id: string }
type Student = { id: string; full_name: string; current_level: string | null; parents: { first_name: string; last_name: string } | null }
type UpgradeHistory = {
  id: string; from_level: string | null; to_level: string
  upgraded_at: string; notes: string | null
  students: { full_name: string }; admins: { first_name: string; last_name: string }
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

export default function AdminUpgradesClient({ upgradeHistory: initialHistory, adminId, levels, skills, students }: {
  upgradeHistory: UpgradeHistory[]
  adminId: string
  levels: Level[]
  skills: Skill[]
  students: Student[]
}) {
  const [upgradeHistory, setUpgradeHistory] = useState(initialHistory)
  const [search, setSearch] = useState('')
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null)
  const [selectedLevel, setSelectedLevel] = useState<string>('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [expandedLevel, setExpandedLevel] = useState<string | null>(null)
  const [showSearch, setShowSearch] = useState(false)

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
    const level = levels.find(l => String(l.level_number) === selectedLevel)
    if (!level) { setSaving(false); return }

    const res = await fetch('/api/admin/assign-level', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        student_id: selectedStudent.id,
        level_number: selectedLevel,
        notes,
        admin_id: adminId,
        from_level: selectedStudent.current_level,
      })
    })

    if (res.ok) {
      const record = await res.json()
      setUpgradeHistory(prev => [record, ...prev])
      setSaved(true)
      setTimeout(() => {
        setSelectedStudent(null)
        setSelectedLevel('')
        setNotes('')
        setSaved(false)
        setShowSearch(false)
        setSearch('')
      }, 1500)
    }
    setSaving(false)
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white font-['Playfair_Display']">Level Management</h1>
        <p className="text-gray-400 mt-1">Assign or upgrade student swim levels</p>
      </div>

      {/* Assign Level */}
      <div className="bg-[#111d38] rounded-xl border border-[#1e3a6e] p-5 mb-8">
        <h2 className="text-sm font-semibold text-[#c9a84c] uppercase tracking-wider mb-4">Assign Level to Student</h2>

        {!selectedStudent ? (
          <div>
            <input
              type="text"
              placeholder="Search student by name or parent..."
              value={search}
              onChange={e => { setSearch(e.target.value); setShowSearch(true) }}
              onFocus={() => setShowSearch(true)}
              className="w-full bg-[#0d1529] border border-[#1e3a6e] rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-[#c9a84c] transition-colors placeholder-gray-500"
            />
            {showSearch && filteredStudents.length > 0 && (
              <div className="mt-2 space-y-1">
                {filteredStudents.map(s => (
                  <button
                    key={s.id}
                    onClick={() => {
                      setSelectedStudent(s)
                      setSelectedLevel(s.current_level || '')
                      setSearch('')
                      setShowSearch(false)
                    }}
                    className="w-full flex items-center justify-between bg-[#0d1529] border border-[#1e3a6e] rounded-lg px-4 py-2.5 text-left hover:border-[#c9a84c]/50 transition-all"
                  >
                    <div>
                      <p className="text-white text-sm">{s.full_name}</p>
                      {s.parents && <p className="text-gray-500 text-xs">{s.parents.first_name} {s.parents.last_name}</p>}
                    </div>
                    <span className="text-xs px-2 py-1 rounded-full text-white" style={{
                      backgroundColor: (LEVEL_COLORS[s.current_level || ''] || '#374151') + '33',
                      color: LEVEL_COLORS[s.current_level || ''] || '#9ca3af'
                    }}>
                      {s.current_level ? `L${s.current_level}` : 'No Level'}
                    </span>
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
                    Current: {selectedStudent.current_level ? `Level ${selectedStudent.current_level} · ${LEVEL_NAMES[selectedStudent.current_level]}` : 'No Level Assigned'}
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
                  <button
                    key={l.id}
                    onClick={() => setSelectedLevel(String(l.level_number))}
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

            <input
              type="text"
              placeholder="Notes (optional)"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              className="w-full bg-[#0d1529] border border-[#1e3a6e] rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-[#c9a84c] transition-colors placeholder-gray-600"
            />

            <button
              onClick={handleAssign}
              disabled={!selectedLevel || saving}
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
                <button
                  onClick={() => setExpandedLevel(isOpen ? null : l.id)}
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

      {/* Upgrade History */}
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
                    {h.from_level ? `L${h.from_level} (${LEVEL_NAMES[h.from_level]}) → ` : 'No Level → '}
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
    </div>
  )
}
