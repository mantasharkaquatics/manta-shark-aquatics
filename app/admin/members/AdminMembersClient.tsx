'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getTodayLA, formatTime12h, getNowMinutesLA } from '@/lib/date'

type Student = {
  id: string
  full_name: string
  current_level: string
  is_active: boolean
  date_of_birth: string | null
  created_at: string | null
  added_by_parent: boolean
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
  address_line1: string | null
  address_line2: string | null
  city: string | null
  state: string | null
  zip_code: string | null
  last_activity_at: string | null
  activity_reviewed_at: string | null
  students: Student[]
}

type Booking = {
  id: string
  session_date: string
  start_time: string
  end_time: string
  course_name: string
  coach_name: string
  status: string
  student_id?: string
  class_session_id?: string
  checked_in?: boolean
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

function isUnread(p: Parent): boolean {
  if (!p.last_activity_at) return false
  if (!p.activity_reviewed_at) return true
  return new Date(p.last_activity_at).getTime() > new Date(p.activity_reviewed_at).getTime()
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)
  function handleCopy() {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }
  return (
    <button
      onClick={handleCopy}
      className="ml-2 text-gray-500 hover:text-[#c9a84c] transition-colors flex-shrink-0"
      title="Copy"
    >
      {copied
        ? <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5 text-green-400" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 00-1.414 0L8 12.586 4.707 9.293a1 1 0 00-1.414 1.414l4 4a1 1 0 001.414 0l8-8a1 1 0 000-1.414z" clipRule="evenodd" /></svg>
        : <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor"><path d="M8 3a1 1 0 011-1h2a1 1 0 110 2H9a1 1 0 01-1-1z"/><path d="M6 3a2 2 0 00-2 2v11a2 2 0 002 2h8a2 2 0 002-2V5a2 2 0 00-2-2 3 3 0 01-3 3H9a3 3 0 01-3-3z"/></svg>
      }
    </button>
  )
}

export default function AdminMembersClient({ parents: initialParents }: { parents: Parent[] }) {
  const supabase = createClient()
  const [search, setSearch] = useState('')
  const [studentBookings, setStudentBookings] = useState<Record<string, { upcoming: Booking[]; past: Booking[]; loaded: boolean }>>({})
  const [expandedBookings, setExpandedBookings] = useState<Record<string, 'upcoming' | 'past' | 'notes' | null>>({})
  const [confirmingBookingId, setConfirmingBookingId] = useState<string | null>(null)
  type StudentNote = { id: string; content: string; pinned: boolean; created_at: string; author: string }
  const [studentNotes, setStudentNotes] = useState<Record<string, { notes: StudentNote[]; loaded: boolean }>>({})
  const [noteCounts, setNoteCounts] = useState<Record<string, number>>({})
  const [noteDraft, setNoteDraft] = useState('')
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState('')
  const [deletingNoteId, setDeletingNoteId] = useState<string | null>(null)
  const [noteBusy, setNoteBusy] = useState(false)

  useEffect(() => {
    fetch('/api/admin/student-notes?counts=1')
      .then(r => r.json())
      .then(d => setNoteCounts(d.counts || {}))
      .catch(() => {})
  }, [])

  async function loadStudentBookings(studentId: string) {
    if (studentBookings[studentId]?.loaded) return
    const today = getTodayLA()
    const { data: rawBookings } = await supabase
      .from('bookings')
      .select('id, status, student_id, class_session_id')
      .eq('student_id', studentId)
      .neq('status', 'cancelled')
    if (!rawBookings || rawBookings.length === 0) {
      setStudentBookings(prev => ({ ...prev, [studentId]: { upcoming: [], past: [], loaded: true } }))
      return
    }
    const sessionIds = rawBookings.map((b: any) => b.class_session_id).filter(Boolean)
    const { data: sessions } = await supabase
      .from('class_sessions')
      .select('id, session_date, start_time, end_time, course_types(name), coaches(first_name)')
      .in('id', sessionIds)
    const sessionMap: Record<string, any> = {}
    for (const s of sessions || []) {
      const ct = Array.isArray((s as any).course_types) ? (s as any).course_types[0] : (s as any).course_types
      const coach = Array.isArray((s as any).coaches) ? (s as any).coaches[0] : (s as any).coaches
      sessionMap[s.id] = { ...s, ct, coach }
    }
    const bookings: Booking[] = rawBookings
      .map((b: any) => {
        const cs = sessionMap[b.class_session_id]
        if (!cs) return null
        return { id: b.id, session_date: cs.session_date, start_time: cs.start_time, end_time: cs.end_time, course_name: cs.ct?.name || '', coach_name: cs.coach?.first_name || '', status: b.status, student_id: b.student_id, class_session_id: b.class_session_id }
      })
      .filter(Boolean) as Booking[]
    const nowMin = getNowMinutesLA()
    const isPast = (b: Booking) => {
      if (b.session_date < today) return true
      if (b.session_date > today) return false
      const [eh, em] = b.end_time.split(':').map(Number)
      return (eh * 60 + em) <= nowMin
    }
    const upcoming = bookings.filter(b => !isPast(b)).sort((a, b) => a.session_date.localeCompare(b.session_date))
    let past = bookings.filter(isPast).sort((a, b) => b.session_date.localeCompare(a.session_date))
    if (past.length > 0) {
      const res = await fetch('/api/admin/attendance?booking_ids=' + past.map(b => b.id).join(','))
      const json = await res.json().catch(() => ({ checkedInBookingIds: [] }))
      const checkedInSet = new Set((json.checkedInBookingIds || []) as string[])
      past = past.map(b => ({ ...b, checked_in: checkedInSet.has(b.id) }))
    }
    setStudentBookings(prev => ({ ...prev, [studentId]: { upcoming, past, loaded: true } }))
  }

  function toggleStudentBookings(studentId: string, type: 'upcoming' | 'past') {
    loadStudentBookings(studentId)
    setExpandedBookings(prev => ({ ...prev, [studentId]: prev[studentId] === type ? null : type }))
  }

  async function loadStudentNotes(studentId: string) {
    try {
      const res = await fetch(`/api/admin/student-notes?student_id=${studentId}`)
      const d = await res.json()
      setStudentNotes(prev => ({ ...prev, [studentId]: { notes: d.notes || [], loaded: true } }))
    } catch {
      setStudentNotes(prev => ({ ...prev, [studentId]: { notes: [], loaded: true } }))
    }
  }

  function toggleStudentNotes(studentId: string) {
    const cur = expandedBookings[studentId]
    setExpandedBookings(prev => ({ ...prev, [studentId]: cur === 'notes' ? null : 'notes' }))
    setNoteDraft(''); setEditingNoteId(null); setDeletingNoteId(null)
    if (cur !== 'notes' && !studentNotes[studentId]?.loaded) loadStudentNotes(studentId)
  }

  async function addNote(studentId: string) {
    const content = noteDraft.trim()
    if (!content || noteBusy) return
    setNoteBusy(true)
    try {
      const res = await fetch('/api/admin/student-notes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ student_id: studentId, content }) })
      if (res.ok) {
        setNoteDraft('')
        setNoteCounts(prev => ({ ...prev, [studentId]: (prev[studentId] || 0) + 1 }))
        await loadStudentNotes(studentId)
      }
    } finally { setNoteBusy(false) }
  }

  async function saveNote(studentId: string, noteId: string) {
    const content = editDraft.trim()
    if (!content || noteBusy) return
    setNoteBusy(true)
    try {
      const res = await fetch('/api/admin/student-notes', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: noteId, content }) })
      if (res.ok) { setEditingNoteId(null); await loadStudentNotes(studentId) }
    } finally { setNoteBusy(false) }
  }

  async function togglePinNote(studentId: string, noteId: string, pinned: boolean) {
    if (noteBusy) return
    setNoteBusy(true)
    try {
      const res = await fetch('/api/admin/student-notes', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: noteId, pinned: !pinned }) })
      if (res.ok) await loadStudentNotes(studentId)
    } finally { setNoteBusy(false) }
  }

  async function deleteNote(studentId: string, noteId: string) {
    if (noteBusy) return
    setNoteBusy(true)
    try {
      const res = await fetch('/api/admin/student-notes', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: noteId }) })
      if (res.ok) {
        setDeletingNoteId(null)
        setNoteCounts(prev => ({ ...prev, [studentId]: Math.max(0, (prev[studentId] || 1) - 1) }))
        await loadStudentNotes(studentId)
      }
    } finally { setNoteBusy(false) }
  }

  async function setAttendance(studentId: string, booking: Booking, checkedIn: boolean) {
    const res = await fetch('/api/admin/attendance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        booking_id: booking.id,
        student_id: booking.student_id,
        class_session_id: booking.class_session_id,
        checked_in: checkedIn,
      }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      alert((checkedIn ? 'Failed to mark as checked in: ' : 'Failed to mark as absent: ') + (data.error || res.statusText))
      return
    }
    setStudentBookings(prev => {
      const sb = prev[studentId]
      if (!sb) return prev
      return {
        ...prev,
        [studentId]: {
          ...sb,
          past: sb.past.map(b => b.id === booking.id ? { ...b, checked_in: checkedIn } : b),
        },
      }
    })
    setConfirmingBookingId(null)
  }
  const [expanded, setExpanded] = useState<string | null>(null)
  const [parents, setParents] = useState<Parent[]>(initialParents)

  async function markReviewed(parentId: string) {
    await fetch('/api/admin/parents/mark-reviewed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ parent_id: parentId }),
    })
    setParents(prev => prev.map(p => p.id === parentId ? { ...p, activity_reviewed_at: new Date().toISOString() } : p))
  }

  const filtered = parents.filter(p =>
    (p.first_name + ' ' + p.last_name + ' ' + p.email).toLowerCase().includes(search.toLowerCase()) ||
    p.students.some(s => s.full_name.toLowerCase().includes(search.toLowerCase()))
  )

  const sortedFiltered = [...filtered].sort((a, b) => {
    const aUnread = isUnread(a)
    const bUnread = isUnread(b)
    if (aUnread && !bUnread) return -1
    if (!aUnread && bUnread) return 1
    if (aUnread && bUnread) {
      return new Date(b.last_activity_at || 0).getTime() - new Date(a.last_activity_at || 0).getTime()
    }
    return a.first_name.localeCompare(b.first_name)
  })

  async function loadAllStudentsForParent(students: Student[]) {
    for (const s of students) {
      loadStudentBookings(s.id)
    }
  }

  async function toggleNewsletter(parentId: string, current: boolean) {
    const newVal = !current
    await fetch('/api/admin/parents/newsletter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ parent_id: parentId, newsletter_subscribed: newVal }),
    })
    setParents(prev => prev.map(p => p.id === parentId ? { ...p, newsletter_subscribed: newVal } : p))
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white font-['Playfair_Display']">Members</h1>
        <p className="text-gray-400 mt-1">
          {parents.length} families · {parents.reduce((a, p) => a + p.students.length, 0)} students
        </p>
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
        {sortedFiltered.map(parent => {
          const addressText = [
            parent.address_line1,
            parent.address_line2,
            [parent.city, parent.state, parent.zip_code].filter(Boolean).join(', ')
          ].filter(Boolean).join(', ')

          return (
            <div key={parent.id} className="bg-[#111d38] rounded-xl border border-[#1e3a6e] overflow-hidden">
              {/* Row header */}
              <button
                onClick={() => {
                  const next = expanded === parent.id ? null : parent.id
                  setExpanded(next)
                  if (next) {
                    loadAllStudentsForParent(parent.students)
                    if (isUnread(parent)) markReviewed(parent.id)
                  }
                }}
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
                  {isUnread(parent) && (
                    <span className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0" title="New activity" />
                  )}
                  <span className="text-gray-500 text-sm">{parent.students.length} student{parent.students.length !== 1 ? 's' : ''}</span>
                  <span className="text-gray-500">{expanded === parent.id ? '▲' : '▼'}</span>
                </div>
              </button>

              {/* Expanded content */}
              {expanded === parent.id && (
                <div className="border-t border-[#1e3a6e] p-5 space-y-4">
                  {/* Row 1: Email, Phone, Address */}
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div>
                      <p className="text-gray-500 text-xs uppercase tracking-wider mb-1">Email</p>
                      <div className="flex items-center">
                        <p className="text-gray-300 text-sm">{parent.email}</p>
                        <CopyButton value={parent.email} />
                      </div>
                    </div>
                    <div>
                      <p className="text-gray-500 text-xs uppercase tracking-wider mb-1">Phone</p>
                      <div className="flex items-center">
                        <p className="text-gray-300 text-sm">{parent.phone || '—'}</p>
                        {parent.phone && <CopyButton value={parent.phone} />}
                      </div>
                    </div>
                    <div>
                      <p className="text-gray-500 text-xs uppercase tracking-wider mb-1">Address</p>
                      {addressText ? (
                        <div className="flex items-start">
                          <p className="text-gray-300 text-sm leading-relaxed">
                            {[parent.address_line1, parent.address_line2, [parent.city, parent.state, parent.zip_code].filter(Boolean).join(', ')].filter(Boolean).join(', ')}
                          </p>
                          <CopyButton value={addressText} />
                        </div>
                      ) : (
                        <p className="text-gray-300 text-sm">—</p>
                      )}
                    </div>
                  </div>

                  {/* Row 2: Registered, Terms Accepted, Newsletter, Last Login */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 border-t border-[#1e3a6e]/40 pt-4">
                    <div>
                      <p className="text-gray-500 text-xs uppercase tracking-wider mb-1">Registered</p>
                      <p className="text-gray-300 text-sm">{formatDate(parent.registered_at)}</p>
                    </div>
                    <div>
                      <p className="text-gray-500 text-xs uppercase tracking-wider mb-1">Terms Accepted</p>
                      <p className="text-sm">
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
                    <div>
                      <p className="text-gray-500 text-xs uppercase tracking-wider mb-1">Last Login</p>
                      <p className="text-gray-300 text-sm">{formatDateTime(parent.last_login_at)}</p>
                    </div>
                  </div>

                  {/* Students */}
                  <div>
                    <p className="text-gray-500 text-xs uppercase tracking-wider mb-3">Students</p>
                    <div className="space-y-2">
                      {parent.students.map(student => {
                        const sb = studentBookings[student.id]
                        const expandedType = expandedBookings[student.id]
                        const displayList = expandedType === 'upcoming' ? sb?.upcoming : expandedType === 'past' ? sb?.past : []
                        return (
                          <div key={student.id} className="bg-[#0d1529] rounded-lg overflow-hidden">
                            <div className="flex items-center gap-3 p-3">
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
                                  {student.added_by_parent && (
                                    <p className="text-[#c9a84c] text-[10px] mt-0.5">
                                      Added by parent{student.created_at ? ' · ' + formatDate(student.created_at) : ''}
                                    </p>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center gap-2 ml-4">
                                <span className={`text-xs px-2 py-1 rounded-full ${student.current_level ? (LEVEL_COLORS[student.current_level] || 'bg-gray-700 text-gray-300') : 'bg-gray-700/50 text-gray-400 italic'}`}>
                                  {student.current_level ? `L${student.current_level} ${LEVEL_NAMES[student.current_level] || ''}` : 'Pending Assessment'}
                                </span>
                                <button
                                  onClick={() => toggleStudentBookings(student.id, 'upcoming')}
                                  className={`text-xs px-2 py-1 rounded-full border transition-all ${expandedType === 'upcoming' ? 'border-[#c9a84c] bg-[#c9a84c]/20 text-[#c9a84c]' : 'border-[#1e3a6e] text-gray-500 hover:border-[#c9a84c]/40'}`}
                                >Upcoming {sb?.loaded ? `(${sb.upcoming.length})` : ''}</button>
                                <button
                                  onClick={() => toggleStudentBookings(student.id, 'past')}
                                  className={`text-xs px-2 py-1 rounded-full border transition-all ${expandedType === 'past' ? 'border-blue-400 bg-blue-400/20 text-blue-400' : 'border-[#1e3a6e] text-gray-500 hover:border-blue-400/40'}`}
                                >History {sb?.loaded ? `(${sb.past.length})` : ''}</button>
                                <button
                                  onClick={() => toggleStudentNotes(student.id)}
                                  className={`text-xs px-2 py-1 rounded-full border transition-all ${expandedType === 'notes' ? 'border-emerald-400 bg-emerald-400/20 text-emerald-300' : 'border-[#1e3a6e] text-gray-500 hover:border-emerald-400/40'}`}
                                >📝 Notes{noteCounts[student.id] ? ` (${noteCounts[student.id]})` : ''}</button>
                              </div>
                            </div>
                            {expandedType === 'notes' && (
                              <div className="border-t border-[#1e3a6e]/50 px-3 pb-3 pt-2">
                                <div className="flex gap-2 mb-2">
                                  <textarea value={noteDraft} onChange={e => setNoteDraft(e.target.value)} rows={2}
                                    placeholder="Add a note (visible to admins only)..."
                                    className="flex-1 bg-[#0d1529] border border-[#1e3a6e] rounded-lg px-3 py-2 text-xs text-white placeholder-gray-600 resize-none focus:outline-none focus:border-[#c9a84c]/60" />
                                  <button onClick={() => addNote(student.id)} disabled={noteBusy || !noteDraft.trim()}
                                    className="px-3 rounded-lg bg-[#c9a84c] hover:bg-[#b8963e] text-[#111d38] text-xs font-semibold disabled:opacity-40 transition-all">Add</button>
                                </div>
                                {!studentNotes[student.id]?.loaded ? (
                                  <p className="text-gray-500 text-xs py-1">Loading...</p>
                                ) : studentNotes[student.id].notes.length === 0 ? (
                                  <p className="text-gray-600 text-xs py-1">No notes yet.</p>
                                ) : (
                                  <div className="space-y-1.5">
                                    {studentNotes[student.id].notes.map(n => (
                                      <div key={n.id} className="group flex items-start gap-2 bg-[#0d1529] rounded-lg px-3 py-2">
                                        <div className="flex-1 min-w-0">
                                          {editingNoteId === n.id ? (
                                            <div className="flex items-start gap-2">
                                              <textarea value={editDraft} onChange={e => setEditDraft(e.target.value)} rows={2}
                                                className="flex-1 bg-[#111d38] border border-[#1e3a6e] rounded px-2 py-1 text-xs text-white resize-none focus:outline-none focus:border-[#c9a84c]/60" />
                                              <button onClick={() => saveNote(student.id, n.id)} disabled={noteBusy || !editDraft.trim()}
                                                className="text-[10px] text-[#c9a84c] font-semibold disabled:opacity-40 mt-1">Save</button>
                                              <button onClick={() => setEditingNoteId(null)} className="text-[10px] text-gray-500 mt-1">Cancel</button>
                                            </div>
                                          ) : (
                                            <>
                                              <p className="text-gray-200 text-xs whitespace-pre-wrap">{n.pinned && <span className="mr-1">📌</span>}{n.content}</p>
                                              <p className="text-gray-600 text-[10px] mt-0.5">{new Date(n.created_at).toLocaleString('en-US', { timeZone: 'America/Los_Angeles', weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })} · {n.author}</p>
                                            </>
                                          )}
                                        </div>
                                        {editingNoteId !== n.id && (
                                          <div className="flex items-center gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                                            {deletingNoteId === n.id ? (
                                              <>
                                                <span className="text-gray-400 text-[10px]">Delete?</span>
                                                <button onClick={() => deleteNote(student.id, n.id)} disabled={noteBusy}
                                                  className="px-2 py-0.5 rounded-full border border-red-400 bg-red-500/20 text-red-300 text-[10px] font-semibold">Yes</button>
                                                <button onClick={() => setDeletingNoteId(null)}
                                                  className="px-2 py-0.5 rounded-full border border-gray-700 text-gray-500 text-[10px] font-semibold">No</button>
                                              </>
                                            ) : (
                                              <>
                                                <button onClick={() => togglePinNote(student.id, n.id, n.pinned)} title={n.pinned ? 'Unpin' : 'Pin'}
                                                  className={`px-1.5 py-0.5 rounded text-[11px] transition-colors ${n.pinned ? 'text-[#c9a84c]' : 'text-gray-500 hover:text-[#c9a84c]'}`}>📌</button>
                                                <button onClick={() => { setEditingNoteId(n.id); setEditDraft(n.content); setDeletingNoteId(null) }}
                                                  className="px-1.5 py-0.5 rounded text-[11px] text-gray-500 hover:text-[#c9a84c] transition-colors">✏️</button>
                                                <button onClick={() => setDeletingNoteId(n.id)}
                                                  className="px-1.5 py-0.5 rounded text-[11px] text-gray-500 hover:text-red-400 transition-colors">🗑</button>
                                              </>
                                            )}
                                          </div>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )}
                            {(expandedType === 'upcoming' || expandedType === 'past') && (
                              <div className="border-t border-[#1e3a6e]/50 px-3 pb-3 pt-2">
                                {!sb?.loaded ? (
                                  <p className="text-gray-500 text-xs py-2">Loading...</p>
                                ) : displayList && displayList.length > 0 ? (
                                  <div className="space-y-1.5">
                                    {displayList.map(b => (
                                      <div key={b.id} className="flex items-center gap-3 text-xs">
                                        <span className="text-gray-400 flex-shrink-0">{new Date(b.session_date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}</span>
                                        <span className="text-gray-500 flex-shrink-0">{formatTime12h(b.start_time)}–{formatTime12h(b.end_time)}</span>
                                        <span className="text-gray-300">{b.course_name}</span>
                                        <span className="text-gray-500">Coach {b.coach_name}</span>
                                        {expandedType === 'past' && (
                                          <div className="flex items-center gap-1 ml-auto flex-shrink-0">
                                            {confirmingBookingId === b.id ? (
                                              <>
                                                <span className="text-gray-400 text-[10px]">Confirm?</span>
                                                <button
                                                  onClick={() => setAttendance(student.id, b, !b.checked_in)}
                                                  className="px-2 py-0.5 rounded-full border border-[#c9a84c] bg-[#c9a84c]/20 text-[#c9a84c] text-[10px] font-semibold"
                                                >Yes</button>
                                                <button
                                                  onClick={() => setConfirmingBookingId(null)}
                                                  className="px-2 py-0.5 rounded-full border border-gray-700 text-gray-500 text-[10px] font-semibold"
                                                >No</button>
                                              </>
                                            ) : (
                                              <>
                                                <button
                                                  onClick={() => setConfirmingBookingId(b.id)}
                                                  className={`px-2 py-0.5 rounded-full border text-[10px] font-semibold transition-all ${b.checked_in ? 'bg-green-500/25 border-green-400 text-green-300' : 'bg-transparent border-gray-700 text-gray-600 hover:border-green-400/40'}`}
                                                >Checked In</button>
                                                <button
                                                  onClick={() => setConfirmingBookingId(b.id)}
                                                  className={`px-2 py-0.5 rounded-full border text-[10px] font-semibold transition-all ${!b.checked_in ? 'bg-red-500/25 border-red-400 text-red-300' : 'bg-transparent border-gray-700 text-gray-600 hover:border-red-400/40'}`}
                                                >Absent</button>
                                              </>
                                            )}
                                          </div>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <p className="text-gray-600 text-xs py-2">No records</p>
                                )}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )
        })}

        {sortedFiltered.length === 0 && (
          <div className="text-center py-12 text-gray-400">No members found</div>
        )}
      </div>
    </div>
  )
}
