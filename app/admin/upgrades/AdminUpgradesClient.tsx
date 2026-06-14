'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type ReadyStudent = {
  student_id: string
  student_name: string
  current_level: string
  next_level: string
  skill_count: number
}

type UpgradeHistory = {
  id: string
  from_level: string
  to_level: string
  upgraded_at: string
  notes: string | null
  students: { full_name: string }
  admins: { first_name: string; last_name: string }
}

const LEVEL_NAMES: Record<string, string> = {
  '1': 'Water Intro', '2': 'Water Comfort', '3': 'Pool Safety',
  '4': 'Beginner', '5': 'Intermediate', '6': 'Advanced',
  '7': 'Bronze', '8': 'Silver', '9': 'Gold',
}

export default function AdminUpgradesClient({
  readyStudents: initial,
  upgradeHistory: initialHistory,
  adminId,
}: {
  readyStudents: ReadyStudent[]
  upgradeHistory: UpgradeHistory[]
  adminId: string
}) {
  const supabase = createClient()
  const [readyStudents, setReadyStudents] = useState(initial)
  const [upgradeHistory, setUpgradeHistory] = useState(initialHistory)
  const [upgrading, setUpgrading] = useState<string | null>(null)
  const [notes, setNotes] = useState<Record<string, string>>({})

  const handleUpgrade = async (student: ReadyStudent) => {
    setUpgrading(student.student_id)
    const nextLevel = student.next_level

    // 更新學生 level
    const { error: updateErr } = await supabase
      .from('students')
      .update({ current_level: nextLevel })
      .eq('id', student.student_id)

    if (updateErr) { setUpgrading(null); return }

    // 寫入升等記錄
    const { data: record } = await supabase
      .from('level_upgrades')
      .insert({
        student_id: student.student_id,
        from_level: student.current_level,
        to_level: nextLevel,
        upgraded_by: adminId,
        notes: notes[student.student_id] || null,
      })
      .select('id, from_level, to_level, upgraded_at, notes, students(full_name), admins(first_name, last_name)')
      .single()

    setReadyStudents(prev => prev.filter(s => s.student_id !== student.student_id))
    if (record) setUpgradeHistory(prev => [record as any, ...prev])
    setUpgrading(null)
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white font-['Playfair_Display']">Level Upgrades</h1>
        <p className="text-gray-400 mt-1">Students who have completed all skills and are ready to advance</p>
      </div>

      {/* Ready for upgrade */}
      <div className="mb-10">
        <h2 className="text-sm font-semibold text-[#c9a84c] uppercase tracking-wider mb-4">
          Ready for Upgrade {readyStudents.length > 0 && <span className="ml-2 bg-[#c9a84c] text-[#111d38] text-xs px-2 py-0.5 rounded-full">{readyStudents.length}</span>}
        </h2>

        {readyStudents.length === 0 ? (
          <div className="bg-[#111d38] rounded-xl border border-[#1e3a6e] p-8 text-center">
            <p className="text-gray-400">No students ready for upgrade yet</p>
          </div>
        ) : (
          <div className="space-y-4">
            {readyStudents.map(student => (
              <div key={student.student_id} className="bg-[#111d38] rounded-xl border border-[#c9a84c]/30 p-5">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-[#c9a84c]/20 flex items-center justify-center">
                      <span className="text-[#c9a84c] font-bold">🏆</span>
                    </div>
                    <div>
                      <p className="text-white font-semibold">{student.student_name}</p>
                      <p className="text-gray-400 text-sm">
                        Level {student.current_level} ({LEVEL_NAMES[student.current_level]}) →{' '}
                        <span className="text-[#c9a84c]">Level {student.next_level} ({LEVEL_NAMES[student.next_level]})</span>
                      </p>
                    </div>
                  </div>
                  <span className="text-green-400 text-xs bg-green-900/30 px-2 py-1 rounded-full">
                    All {student.skill_count} skills complete
                  </span>
                </div>

                <div className="flex gap-3">
                  <input
                    type="text"
                    placeholder="Notes (optional)"
                    value={notes[student.student_id] || ''}
                    onChange={e => setNotes(prev => ({ ...prev, [student.student_id]: e.target.value }))}
                    className="flex-1 bg-[#0d1529] border border-[#1e3a6e] rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#c9a84c] transition-colors placeholder-gray-600"
                  />
                  <button
                    onClick={() => handleUpgrade(student)}
                    disabled={upgrading === student.student_id}
                    className="bg-[#c9a84c] hover:bg-[#b8963e] disabled:opacity-50 text-[#111d38] font-semibold px-6 py-2 rounded-lg transition-all text-sm"
                  >
                    {upgrading === student.student_id ? 'Upgrading...' : 'Confirm Upgrade'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Upgrade history */}
      <div>
        <h2 className="text-sm font-semibold text-[#c9a84c] uppercase tracking-wider mb-4">Upgrade History</h2>
        {upgradeHistory.length === 0 ? (
          <div className="bg-[#111d38] rounded-xl border border-[#1e3a6e] p-8 text-center">
            <p className="text-gray-400">No upgrades yet</p>
          </div>
        ) : (
          <div className="space-y-2">
            {upgradeHistory.map((h: any) => (
              <div key={h.id} className="bg-[#111d38] rounded-xl border border-[#1e3a6e] p-4 flex items-center justify-between">
                <div>
                  <p className="text-white text-sm font-medium">{h.students?.full_name}</p>
                  <p className="text-gray-400 text-xs mt-0.5">
                    L{h.from_level} ({LEVEL_NAMES[h.from_level]}) → L{h.to_level} ({LEVEL_NAMES[h.to_level]})
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
