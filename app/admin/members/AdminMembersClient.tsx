'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type Student = {
  id: string
  full_name: string
  current_level: string
  is_active: boolean
  date_of_birth: string | null
}

type Parent = {
  id: string
  first_name: string
  last_name: string
  email: string
  phone: string
  registered_at: string | null
  terms_accepted_at: string | null
  last_login_at: string | null
  newsletter_subscribed: boolean
  students: Student[]
}

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

function calcAge(dob: string | null): string {
  if (!dob) return '—'
  const birth = new Date(dob)
  const today = new Date()
  let age = today.getFullYear() - birth.getFullYear()
  const m = today.getMonth() - birth.getMonth()
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--
  return `${age} yrs`
}

function formatDate(ts: string | null): string {
  if (!ts) return '—'
  return new Date(ts).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

function formatDateTime(ts: string | null): string {
  if (!ts) return '—'
  return new Date(ts).toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default function AdminMembersClient({ parents: initialParents }: { parents: Parent[] }) {
  const supabase = createClient()
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [parents, setParents] = useState<Parent[]>(initialParents)

  const filtered = parents.filter(p =>
    `${p.first_name} ${p.last_name} ${p.email}`.toLowerCase().includes(search.toLowerCase()) ||
    p.students.some(s => s.full_name.toLowerCase().includes(search.toLowerCase()))
  )

  async function toggleNewsletter(parentId: string, current: boolean) {
    const newVal = !current
    await supabase.from('parents').update({ newsletter_subscribed: newVal }).eq('id', parentId)
    setParents(prev => prev.map(p => p.id === parentId ? { ...p, newsletter_subscribed: newVal } : p))
  }

  return (
    <div>
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white font-['Playfair_Display']">Members</h1>
          <p className="text-gray-400 mt-1">
            {parents.length} families · {parents.reduce((a, p) => a + p.students.length, 0)} students
          </p>
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
                {/* Newsletter badge */}
                <button
                  onClick={e => { e.stopPropagation(); toggleNewsletter(parent.id, parent.newsletter_subscribed) }}
                  className={`relative inline-flex h-5 w-9 flex-shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${
                    parent.newsletter_subscribed ? 'bg-green-500' : 'bg-gray-600'
                  }`}
                  title={parent.newsletter_subscribed ? 'Subscribed to newsletter' : 'Not subscribed'}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform duration-200 ${
                    parent.newsletter_subscribed ? 'translate-x-4' : 'translate-x-0'
                  }`} />
                </button>
                <span className="text-gray-500 text-sm">{parent.students.length} student{parent.students.length !== 1 ? 's' : ''}</span>
                <span className="text-gray-500">{expanded === parent.id ? '▲' : '▼'}</span>
              </div>
            </button>

            {expanded === parent.id && (
              <div className="border-t border-[#1e3a6e] p-5 space-y-4">
                {/* Contact info */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <p className="text-gray-500 text-xs uppercase tracking-wider mb-1">Phone</p>
                    <p className="text-gray-300 text-sm">{parent.phone || '—'}</p>
                  </div>
                  <div>
                    <p className="text-gray-500 text-xs uppercase tracking-wider mb-1">Email</p>
                    <p className="text-gray-300 text-sm">{parent.email}</p>
                  </div>
                  <div>
                    <p className="text-gray-500 text-xs uppercase tracking-wider mb-1">Registered</p>
                    <p className="text-gray-300 text-sm">{formatDate(parent.registered_at)}</p>
                  </div>
                  <div>
                    <p className="text-gray-500 text-xs uppercase tracking-wider mb-1">Last Login</p>
                    <p className="text-gray-300 text-sm">{formatDateTime(parent.last_login_at)}</p>
                  </div>
                </div>

                {/* T&C + Newsletter */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-gray-500 text-xs uppercase tracking-wider mb-1">Terms Accepted</p>
                    <p className="text-gray-300 text-sm">
                      {parent.terms_accepted_at
                        ? <span className="text-green-400">✓ {formatDateTime(parent.terms_accepted_at)}</span>
                        : <span className="text-red-400">✗ Not accepted</span>
                      }
                    </p>
                  </div>
                  <div>
                    <p className="text-gray-500 text-xs uppercase tracking-wider mb-1">Newsletter</p>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => toggleNewsletter(parent.id, parent.newsletter_subscribed)}
                        className={`relative inline-flex h-5 w-9 flex-shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${
                          parent.newsletter_subscribed ? 'bg-green-500' : 'bg-gray-600'
                        }`}
                      >
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform duration-200 ${
                          parent.newsletter_subscribed ? 'translate-x-4' : 'translate-x-0'
                        }`} />
                      </button>
                      <span className="text-sm text-gray-400">
                        {parent.newsletter_subscribed ? 'Subscribed' : 'Not subscribed'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Students */}
                <div>
                  <p className="text-gray-500 text-xs uppercase tracking-wider mb-3">Students</p>
                  <div className="space-y-2">
                    {parent.students.map(student => (
                      <div key={student.id} className="flex items-center justify-between bg-[#0d1529] rounded-lg p-3">
                        <div className="flex items-center gap-3">
                          <div className="w-7 h-7 rounded-full bg-[#1e3a6e] flex items-center justify-center">
                            <span className="text-[#c9a84c] text-xs font-bold">{student.full_name.charAt(0)}</span>
                          </div>
                          <div>
                            <p className="text-white text-sm">{student.full_name}</p>
                            <p className="text-gray-500 text-xs">
                              {student.date_of_birth
                                ? `${new Date(student.date_of_birth).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} · ${calcAge(student.date_of_birth)}`
                                : 'No birthday on file'
                              }
                            </p>
                          </div>
                        </div>
                        <span className={`text-xs px-2 py-1 rounded-full ${LEVEL_COLORS[student.current_level] || 'bg-gray-700 text-gray-300'}`}>
                          L{student.current_level} {LEVEL_NAMES[student.current_level] || ''}
                        </span>
                      </div>
                    ))}
                  </div>
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
