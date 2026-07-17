'use client'

import { useState, useEffect } from 'react'
import StudentNotesPanel from '@/components/StudentNotesPanel'
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
  legal_full_name: string | null
  uci_number: string | null
  service_code: string | null
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
  media_release_accepted: boolean | null
  media_release_at: string | null
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

function isOnline(p: Parent): boolean {
  if (!p.last_activity_at) return false
  return Date.now() - new Date(p.last_activity_at).getTime() < 5 * 60 * 1000
}

function timeAgo(ts: string | null): string {
  if (!ts) return 'Never'
  const mins = Math.floor((Date.now() - new Date(ts).getTime()) / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  return new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function isUnread(p: Parent): boolean {
  if (!p.last_activity_at) return false
  if (!p.activity_reviewed_at) return true
  return new Date(p.last_activity_at).getTime() > new Date(p.activity_reviewed_at).getTime()
}

function SdpPanel({ student }: { student: Student }) {
  const [legalName, setLegalName] = useState(student.legal_full_name || '')
  const [uci, setUci] = useState(student.uci_number || '')
  const [code, setCode] = useState(student.service_code || '')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const save = async () => {
    setSaving(true); setMsg(null)
    const res = await fetch('/api/admin/student-sdp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        student_id: student.id,
        legal_full_name: legalName,
        uci_number: uci,
        service_code: uci.trim() ? (code.trim() || '331') : code,
      }),
    })
    setSaving(false)
    if (res.ok) {
      setMsg('Saved')
      student.legal_full_name = legalName.trim() || null
      student.uci_number = uci.trim() || null
      student.service_code = uci.trim() ? (code.trim() || '331') : (code.trim() || null)
      if (uci.trim() && !code.trim()) setCode('331')
      setTimeout(() => setMsg(null), 2000)
    } else {
      setMsg('Save failed')
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-gray-500 text-xs">SDP / Regional Center billing info. Leave UCI empty for non-SDP students — invoices stay standard.</p>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div>
          <p className="text-gray-500 text-[10px] uppercase tracking-wider mb-1">Legal Full Name</p>
          <input value={legalName} onChange={e => setLegalName(e.target.value)} placeholder="As registered with RC"
            className="w-full bg-[#111d38] border border-[#1e3a6e] rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-[#c9a84c]" />
        </div>
        <div>
          <p className="text-gray-500 text-[10px] uppercase tracking-wider mb-1">UCI Number</p>
          <input value={uci} onChange={e => setUci(e.target.value)} placeholder="e.g. 1234567"
            className="w-full bg-[#111d38] border border-[#1e3a6e] rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-[#c9a84c]" />
        </div>
        <div>
          <p className="text-gray-500 text-[10px] uppercase tracking-wider mb-1">Service Code</p>
          <input value={code} onChange={e => setCode(e.target.value)} placeholder="331 (default when UCI set)"
            className="w-full bg-[#111d38] border border-[#1e3a6e] rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-[#c9a84c]" />
        </div>
      </div>
      <div className="flex items-center gap-3">
        <button onClick={save} disabled={saving}
          className="bg-[#c9a84c] hover:bg-[#b8963e] disabled:opacity-50 text-[#111d38] text-xs font-semibold px-4 py-2 rounded-lg transition-all">
          {saving ? 'Saving...' : 'Save SDP Info'}
        </button>
        {msg && <span className={`text-xs ${msg === 'Saved' ? 'text-green-400' : 'text-red-400'}`}>{msg}</span>}
      </div>
    </div>
  )
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

  useEffect(() => {
    const id = setInterval(async () => {
      const { data } = await supabase
        .from('parents')
        .select('id, last_activity_at')
      if (data) {
        const m = new Map(data.map((r: any) => [r.id, r.last_activity_at]))
        setParents(prev => prev.map(p => m.has(p.id) ? { ...p, last_activity_at: m.get(p.id) ?? p.last_activity_at } : p))
      }
    }, 60 * 1000)
    return () => clearInterval(id)
  }, [supabase])
  const [studentBookings, setStudentBookings] = useState<Record<string, { upcoming: Booking[]; past: Booking[]; loaded: boolean }>>({})
  const [expandedBookings, setExpandedBookings] = useState<Record<string, 'upcoming' | 'past' | 'notes' | 'sdp' | null>>({})
  const [confirmingBookingId, setConfirmingBookingId] = useState<string | null>(null)
  const [noteCounts, setNoteCounts] = useState<Record<string, number>>({})

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

  function toggleStudentNotes(studentId: string) {
    const cur = expandedBookings[studentId]
    setExpandedBookings(prev => ({ ...prev, [studentId]: cur === 'notes' ? null : 'notes' }))
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
                  <div className="relative w-10 h-10 rounded-full bg-[#1e3a6e] flex items-center justify-center flex-shrink-0">
                    <span className="text-[#c9a84c] font-bold">{parent.first_name.charAt(0)}</span>
                    {isOnline(parent) && (
                      <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-green-500 border-2 border-[#111d38]" title="Online now" />
                    )}
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
                  <span className={`text-xs ${isOnline(parent) ? 'text-green-400' : 'text-gray-500'}`}>{isOnline(parent) ? 'Online' : timeAgo(parent.last_activity_at)}</span>
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
                    <div>
                      <p className="text-gray-500 text-xs uppercase tracking-wider mb-1">Last Login</p>
                      <p className="text-gray-300 text-sm">{formatDateTime(parent.last_login_at)}</p>
                    </div>
                  </div>

                  {/* Row 2: Registered, Terms Accepted, Photo Release, Newsletter */}
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
                      <p className="text-gray-500 text-xs uppercase tracking-wider mb-1">Photo Release</p>
                      <p className="text-gray-300 text-sm">
                        {parent.media_release_accepted
                          ? <span className="text-green-400">✓ {formatDateTime(parent.media_release_at)}</span>
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

                  {/* Tokens */}
                  <ParentTokensSection parentId={parent.id} />

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
                                <button
                                  onClick={() => setExpandedBookings(prev => ({ ...prev, [student.id]: prev[student.id] === 'sdp' ? null : 'sdp' }))}
                                  className={`text-xs px-2 py-1 rounded-full border transition-all ${expandedType === 'sdp' ? 'border-purple-400 bg-purple-400/20 text-purple-300' : student.uci_number ? 'border-[#c9a84c]/60 text-[#c9a84c] hover:border-[#c9a84c]' : 'border-[#1e3a6e] text-gray-500 hover:border-purple-400/40'}`}
                                >SDP{student.uci_number ? ' ✓' : ''}</button>
                              </div>
                            </div>
                            {expandedType === 'notes' && (
                              <div className="border-t border-[#1e3a6e]/50 px-3 pb-3 pt-2">
                                <StudentNotesPanel studentId={student.id} onCountChange={(c) => setNoteCounts(prev => ({ ...prev, [student.id]: c }))} />
                              </div>
                            )}
                            {expandedType === 'sdp' && (
                              <div className="border-t border-[#1e3a6e]/50 px-3 pb-3 pt-2">
                                <SdpPanel student={student} />
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

type TokenPack = { id: string; course_type_id: string; total_tokens: number; used_tokens: number; expires_at: string; source: string; note: string | null; created_at: string }

function ParentTokensSection({ parentId }: { parentId: string }) {
  const [open, setOpen] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [packs, setPacks] = useState<TokenPack[]>([])
  const [courseTypes, setCourseTypes] = useState<{ id: string; name: string }[]>([])
  const [newCourse, setNewCourse] = useState('')
  const [newQty, setNewQty] = useState('1')
  const [newNote, setNewNote] = useState('')
  const [editTotals, setEditTotals] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function load() {
    setErr(null)
    const res = await fetch('/api/admin/tokens?parent_id=' + parentId)
    if (!res.ok) { setErr('Failed to load tokens'); return }
    const d = await res.json()
    setPacks(d.packages)
    setCourseTypes(d.courseTypes)
    setLoaded(true)
    if (d.courseTypes.length > 0) setNewCourse((prev: string) => prev || d.courseTypes[0].id)
  }

  function toggle() {
    const next = !open
    setOpen(next)
    if (next && !loaded) load()
  }

  async function createPack() {
    const qty = parseInt(newQty, 10)
    if (!newCourse || !Number.isInteger(qty) || qty < 1) { setErr('Pick a course and a quantity of at least 1'); return }
    setBusy(true); setErr(null)
    const res = await fetch('/api/admin/tokens', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ parent_id: parentId, course_type_id: newCourse, total_tokens: qty, note: newNote.trim() || undefined }),
    })
    setBusy(false)
    if (!res.ok) { const d = await res.json().catch(() => null); setErr(d?.error || 'Create failed'); return }
    setNewQty('1'); setNewNote('')
    load()
  }

  async function adjust(pack: TokenPack) {
    const raw = editTotals[pack.id]
    const total = parseInt(raw ?? '', 10)
    if (!Number.isInteger(total) || total < 0) { setErr('Enter a valid total'); return }
    if (total === pack.total_tokens) return
    setBusy(true); setErr(null)
    const res = await fetch('/api/admin/tokens', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ package_id: pack.id, total_tokens: total }),
    })
    setBusy(false)
    if (!res.ok) { const d = await res.json().catch(() => null); setErr(d?.error || 'Adjust failed'); return }
    setEditTotals(prev => { const n = { ...prev }; delete n[pack.id]; return n })
    load()
  }

  const courseName = (id: string) => courseTypes.find(c => c.id === id)?.name || '—'
  const srcStyle = (src: string) =>
    src === 'manual' ? 'border-purple-400/50 text-purple-300'
    : src === 'cancellation' ? 'border-orange-400/50 text-orange-300'
    : src === 'school_cancellation' ? 'border-red-400/50 text-red-300'
    : 'border-[#c9a84c]/50 text-[#c9a84c]'

  // Badge text: raw source values are DB-facing; school_cancellation is too long for the pill.
  const srcLabel = (src: string) => src === 'school_cancellation' ? 'school' : src

  return (
    <div className="border-t border-[#1e3a6e]/40 pt-4">
      <button onClick={toggle} className="text-gray-500 text-xs uppercase tracking-wider mb-1 hover:text-[#c9a84c] transition-colors">
        Tokens {open ? '▾' : '▸'}
      </button>
      {open && (
        <div className="mt-2 space-y-3">
          {err && <p className="text-red-400 text-xs">{err}</p>}
          {!loaded && !err && <p className="text-gray-500 text-xs">Loading…</p>}
          {loaded && packs.length === 0 && <p className="text-gray-500 text-xs">No token packages</p>}
          {loaded && packs.map(pk => {
            const expired = new Date(pk.expires_at) < new Date()
            const remaining = pk.total_tokens - pk.used_tokens
            return (
              <div key={pk.id} className="flex flex-wrap items-center gap-3 text-sm border border-[#1e3a6e] rounded-lg px-3 py-2">
                <span className="text-gray-300">{courseName(pk.course_type_id)}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full border ${srcStyle(pk.source)}`}>{srcLabel(pk.source)}</span>
                <span className={remaining > 0 && !expired ? 'text-gray-300' : 'text-gray-500'}>
                  {remaining} left ({pk.used_tokens}/{pk.total_tokens} used)
                </span>
                <span className={expired ? 'text-red-400 text-xs' : 'text-gray-500 text-xs'}>
                  {expired ? 'Expired' : 'Expires'} {new Date(pk.expires_at).toLocaleDateString('en-US')}
                </span>
                {pk.note && <span className="text-gray-500 text-xs truncate max-w-[200px]" title={pk.note}>{pk.note.split('\n')[0]}</span>}
                <span className="flex items-center gap-1 ml-auto">
                  <input
                    type="number" min={pk.used_tokens}
                    value={editTotals[pk.id] ?? String(pk.total_tokens)}
                    onChange={e => setEditTotals(prev => ({ ...prev, [pk.id]: e.target.value }))}
                    className="w-16 bg-transparent border border-[#1e3a6e] rounded px-2 py-1 text-gray-300 text-xs"
                  />
                  <button onClick={() => adjust(pk)} disabled={busy}
                    className="text-xs px-2 py-1 rounded border border-[#c9a84c]/50 text-[#c9a84c] hover:bg-[#c9a84c]/10 disabled:opacity-40">
                    Save
                  </button>
                </span>
              </div>
            )
          })}
          {loaded && (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <select value={newCourse} onChange={e => setNewCourse(e.target.value)}
                className="bg-[#111d38] border border-[#1e3a6e] rounded px-2 py-1 text-gray-300 text-xs">
                {courseTypes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <input type="number" min={1} value={newQty} onChange={e => setNewQty(e.target.value)}
                className="w-16 bg-transparent border border-[#1e3a6e] rounded px-2 py-1 text-gray-300 text-xs" />
              <input type="text" placeholder="Note (optional)" value={newNote} onChange={e => setNewNote(e.target.value)}
                className="flex-1 min-w-[140px] bg-transparent border border-[#1e3a6e] rounded px-2 py-1 text-gray-300 text-xs" />
              <button onClick={createPack} disabled={busy}
                className="text-xs px-3 py-1 rounded border border-purple-400/50 text-purple-300 hover:bg-purple-400/10 disabled:opacity-40">
                + Manual Token
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
