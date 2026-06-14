'use client'

import { useState } from 'react'

type Student = { id: string; full_name: string; current_level: string; is_active: boolean }
type Parent = { id: string; first_name: string; last_name: string; email: string; phone: string; students: Student[] }

const LEVEL_COLORS: Record<string, string> = {
  '1': 'bg-red-900/40 text-red-300',
  '2': 'bg-orange-900/40 text-orange-300',
  '3': 'bg-yellow-900/40 text-yellow-300',
  '4': 'bg-green-900/40 text-green-300',
  '5': 'bg-blue-900/40 text-blue-300',
  '6': 'bg-purple-900/40 text-purple-300',
  '7': 'bg-amber-900/40 text-amber-300',
  '8': 'bg-gray-700/40 text-gray-300',
  '9': 'bg-yellow-700/40 text-yellow-200',
}

const LEVEL_NAMES: Record<string, string> = {
  '1': 'Water Intro', '2': 'Water Comfort', '3': 'Pool Safety',
  '4': 'Beginner', '5': 'Intermediate', '6': 'Advanced',
  '7': 'Bronze', '8': 'Silver', '9': 'Gold',
}

export default function AdminMembersClient({ parents }: { parents: Parent[] }) {
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)

  const filtered = parents.filter(p =>
    `${p.first_name} ${p.last_name} ${p.email}`.toLowerCase().includes(search.toLowerCase()) ||
    p.students.some(s => s.full_name.toLowerCase().includes(search.toLowerCase()))
  )

  return (
    <div>
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white font-['Playfair_Display']">Members</h1>
          <p className="text-gray-400 mt-1">{parents.length} families · {parents.reduce((a, p) => a + p.students.length, 0)} students</p>
        </div>
      </div>

      <div className="mb-6">
        <input
          type="text"
          placeholder="Search by name or email..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full max-w-md bg-[#111d38] border border-[#1e3a6e] rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-[#c9a84c] transition-colors placeholder-gray-500"
        />
      </div>

      <div className="space-y-3">
        {filtered.map(parent => (
          <div key={parent.id} className="bg-[#111d38] rounded-xl border border-[#1e3a6e] overflow-hidden">
            <button
              onClick={() => setExpanded(expanded === parent.id ? null : parent.id)}
              className="w-full flex items-center justify-between p-5 text-left hover:bg-[#1e3a6e]/30 transition-all"
            >
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-[#1e3a6e] flex items-center justify-center flex-shrink-0">
                  <span className="text-[#c9a84c] font-bold">{parent.first_name.charAt(0)}</span>
                </div>
                <div>
                  <p className="text-white font-medium">{parent.first_name} {parent.last_name}</p>
                  <p className="text-gray-400 text-sm">{parent.email}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-gray-500 text-sm">{parent.students.length} student{parent.students.length !== 1 ? 's' : ''}</span>
                <span className="text-gray-500">{expanded === parent.id ? '▲' : '▼'}</span>
              </div>
            </button>

            {expanded === parent.id && (
              <div className="border-t border-[#1e3a6e] p-5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  <div>
                    <p className="text-gray-500 text-xs uppercase tracking-wider mb-1">Phone</p>
                    <p className="text-gray-300 text-sm">{parent.phone || '—'}</p>
                  </div>
                  <div>
                    <p className="text-gray-500 text-xs uppercase tracking-wider mb-1">Email</p>
                    <p className="text-gray-300 text-sm">{parent.email}</p>
                  </div>
                </div>
                <p className="text-gray-500 text-xs uppercase tracking-wider mb-3">Students</p>
                <div className="space-y-2">
                  {parent.students.map(student => (
                    <div key={student.id} className="flex items-center justify-between bg-[#0d1529] rounded-lg p-3">
                      <div className="flex items-center gap-3">
                        <div className="w-7 h-7 rounded-full bg-[#1e3a6e] flex items-center justify-center">
                          <span className="text-[#c9a84c] text-xs font-bold">{student.full_name.charAt(0)}</span>
                        </div>
                        <p className="text-white text-sm">{student.full_name}</p>
                      </div>
                      <span className={`text-xs px-2 py-1 rounded-full ${LEVEL_COLORS[student.current_level] || 'bg-gray-700 text-gray-300'}`}>
                        L{student.current_level} {LEVEL_NAMES[student.current_level] || ''}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}

        {filtered.length === 0 && (
          <div className="text-center py-12 text-gray-400">No members found</div>
        )}
      </div>
    </div>
  )
}
