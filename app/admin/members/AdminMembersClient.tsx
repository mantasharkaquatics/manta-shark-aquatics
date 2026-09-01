'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import StudentNotesPanel from '@/components/StudentNotesPanel'
import AlertModal from '@/components/AlertModal'
import { createClient } from '@/lib/supabase/client'
import { getTodayLA, formatTime12h, getNowMinutesLA } from '@/lib/date'
import { LEVEL_NAMES, LEVEL_BADGE_CLASSES as LEVEL_COLORS } from '@/lib/levels'

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
  lesson_group_id?: string | null
  is_hour?: boolean
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



function calcAge(dob: string | null): string {
  if (!dob) return '—'
  const birth = new Date(dob)
  const today = new Date()
  let age = today.getFullYear() - birth.getFullYear()
  const m = today.getMonth() - birth.getMonth()
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--
  if (age >= 1) return `${age} yrs`
  let mo = (today.getFullYear() - birth.getFullYear()) * 12 + (today.getMonth() - birth.getMonth())
  if (today.getDate() < birth.getDate()) mo--
  return mo >= 1 ? `${mo} mo` : '<1 mo'
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

function MemberEditPanel({ parent }: { parent: any }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const [emailVal, setEmailVal] = useState(parent.email || '')
  const [phoneVal, setPhoneVal] = useState(parent.phone || '')
  const [pending, setPending] = useState<{ id: string; field: 'email' | 'phone'; sent_to: string } | null>(null)
  const [code, setCode] = useState('')
  const [forceField, setForceField] = useState<'email' | 'phone' | null>(null)
  const [reason, setReason] = useState('')

  const [a1, setA1] = useState(parent.address_line1 || '')
  const [a2, setA2] = useState(parent.address_line2 || '')
  const [city, setCity] = useState(parent.city || '')
  const [stateV, setStateV] = useState(parent.state || '')
  const [zip, setZip] = useState(parent.zip_code || '')

  const [studentEdits, setStudentEdits] = useState<Record<string, { name: string; dob: string }>>(() => {
    const o: Record<string, { name: string; dob: string }> = {}
    for (const s of parent.students || []) o[s.id] = { name: s.full_name || '', dob: (s.date_of_birth || '').slice(0, 10) }
    return o
  })

  const post = async (body: any) => {
    const res = await fetch('/api/admin/members/contact-change', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    })
    const j = await res.json().catch(() => ({}))
    return { ok: res.ok, j }
  }
  const flash = (m: string) => { setMsg(m); setErr(null); setTimeout(() => setMsg(null), 4000) }

  const requestCode = async (field: 'email' | 'phone') => {
    setBusy(true); setErr(null); setMsg(null)
    const { ok, j } = await post({ action: 'request_code', parent_id: parent.id, field, new_value: field === 'email' ? emailVal : phoneVal })
    setBusy(false)
    if (!ok) {
      if (j.error === 'no_channel') { setErr(j.message); setForceField(field) }
      else setErr(j.error || 'Could not send the code.')
      return
    }
    setPending({ id: j.request_id, field, sent_to: j.sent_to })
    setCode('')
    flash(`Code sent to ${j.sent_to}${j.delivered ? '' : ' (delivery may be delayed)'}`)
  }

  const confirmCode = async () => {
    if (!pending) return
    setBusy(true); setErr(null)
    const { ok, j } = await post({ action: 'confirm', request_id: pending.id, code })
    setBusy(false)
    if (!ok) { setErr(j.error + (j.attempts_left != null ? ` ${j.attempts_left} attempts left.` : '')); return }
    if (pending.field === 'email') { parent.email = j.new_value; setEmailVal(j.new_value) }
    else { parent.phone = j.new_value; setPhoneVal(j.new_value) }
    setPending(null); setCode('')
    flash(`${pending.field === 'email' ? 'Email' : 'Phone'} updated. Notifications sent.`)
    router.refresh()
  }

  const forceUpdate = async () => {
    if (!forceField) return
    setBusy(true); setErr(null)
    const { ok, j } = await post({ action: 'force_update', parent_id: parent.id, field: forceField, new_value: forceField === 'email' ? emailVal : phoneVal, reason })
    setBusy(false)
    if (!ok) { setErr(j.error || 'Override failed.'); return }
    if (forceField === 'email') { parent.email = j.new_value; setEmailVal(j.new_value) }
    else { parent.phone = j.new_value; setPhoneVal(j.new_value) }
    setForceField(null); setReason('')
    flash('Updated by override — reason recorded.')
    router.refresh()
  }

  const saveAddress = async () => {
    setBusy(true); setErr(null)
    const { ok, j } = await post({ action: 'direct_update', target: 'parent', id: parent.id, fields: { address_line1: a1, address_line2: a2, city, state: stateV, zip_code: zip } })
    setBusy(false)
    if (!ok) { setErr(j.error || 'Save failed.'); return }
    parent.address_line1 = a1.trim() || null; parent.address_line2 = a2.trim() || null
    parent.city = city.trim() || null; parent.state = stateV.trim() || null; parent.zip_code = zip.trim() || null
    flash('Address saved.')
    router.refresh()
  }

  const saveStudent = async (s: any) => {
    const e = studentEdits[s.id]
    setBusy(true); setErr(null)
    const { ok, j } = await post({ action: 'direct_update', target: 'student', id: s.id, fields: { full_name: e.name, date_of_birth: e.dob } })
    setBusy(false)
    if (!ok) { setErr(j.error || 'Save failed.'); return }
    s.full_name = e.name.trim(); s.date_of_birth = e.dob || null
    flash(`${e.name.trim()} saved.`)
    router.refresh()
  }

  const inputCls = 'w-full bg-[#0d1729] border border-[#1e3a6e] rounded px-2 py-1.5 text-sm text-white'
  const goldBtn = 'bg-[#c9a84c] text-[#1a2744] font-bold text-xs px-3 py-1.5 rounded disabled:opacity-40'
  const ghostBtn = 'border border-[#1e3a6e] text-gray-300 font-semibold text-xs px-3 py-1.5 rounded disabled:opacity-40'
  const label = 'text-gray-500 text-xs uppercase tracking-wider mb-1'

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="text-xs text-gray-400 hover:text-[#c9a84c]">&#9998; Edit details</button>
    )
  }

  return (
    <div className="border border-[#1e3a6e] rounded-lg p-4 space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-[#c9a84c] text-xs uppercase tracking-wider font-bold">Edit details</p>
        <button onClick={() => { setOpen(false); setPending(null); setForceField(null); setErr(null) }} className="text-xs text-gray-400">Close</button>
      </div>
      {msg && <p className="text-green-400 text-xs">{msg}</p>}
      {err && <p className="text-red-400 text-xs">{err}</p>}

      <div className="space-y-3">
        <p className="text-gray-400 text-xs">Email and phone need the family to confirm a code sent to their other contact method.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <p className={label}>Email (login)</p>
            <div className="flex gap-2">
              <input className={inputCls} value={emailVal} onChange={e => setEmailVal(e.target.value)} />
              <button className={ghostBtn} disabled={busy || emailVal === parent.email} onClick={() => requestCode('email')}>Send code</button>
            </div>
            <p className="text-gray-500 text-[11px] mt-1">Code goes to their phone by SMS.</p>
          </div>
          <div>
            <p className={label}>Phone</p>
            <div className="flex gap-2">
              <input className={inputCls} value={phoneVal} onChange={e => setPhoneVal(e.target.value)} />
              <button className={ghostBtn} disabled={busy || phoneVal === parent.phone} onClick={() => requestCode('phone')}>Send code</button>
            </div>
            <p className="text-gray-500 text-[11px] mt-1">Code goes to their email.</p>
          </div>
        </div>

        {pending && (
          <div className="border border-[#c9a84c]/40 rounded p-3 space-y-2">
            <p className="text-gray-300 text-xs">Code sent to <span className="text-[#c9a84c]">{pending.sent_to}</span> — ask the family to read it back.</p>
            <div className="flex gap-2 items-center">
              <input className={inputCls + ' max-w-[160px] tracking-[4px] text-center'} value={code} onChange={e => setCode(e.target.value)} placeholder="000000" maxLength={6} />
              <button className={goldBtn} disabled={busy || code.length < 6} onClick={confirmCode}>Confirm change</button>
              <button className={ghostBtn} disabled={busy} onClick={() => requestCode(pending.field)}>Resend</button>
              <button className={ghostBtn} onClick={() => { setPending(null); setCode('') }}>Cancel</button>
            </div>
          </div>
        )}

        {forceField && (
          <div className="border border-red-500/40 rounded p-3 space-y-2">
            <p className="text-red-300 text-xs font-semibold">Override without verification</p>
            <p className="text-gray-400 text-[11px]">Only after checking ID in person. The reason is recorded.</p>
            <textarea className={inputCls} rows={2} value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. Parent at front desk with photo ID, old phone disconnected" />
            <div className="flex gap-2">
              <button className={goldBtn} disabled={busy || reason.trim().length < 10} onClick={forceUpdate}>Apply override</button>
              <button className={ghostBtn} onClick={() => { setForceField(null); setReason('') }}>Cancel</button>
            </div>
          </div>
        )}
      </div>

      <div className="border-t border-[#1e3a6e] pt-4 space-y-2">
        <p className={label}>Address</p>
        <input className={inputCls} value={a1} onChange={e => setA1(e.target.value)} placeholder="Address line 1" />
        <input className={inputCls} value={a2} onChange={e => setA2(e.target.value)} placeholder="Address line 2" />
        <div className="grid grid-cols-3 gap-2">
          <input className={inputCls} value={city} onChange={e => setCity(e.target.value)} placeholder="City" />
          <input className={inputCls} value={stateV} onChange={e => setStateV(e.target.value)} placeholder="State" />
          <input className={inputCls} value={zip} onChange={e => setZip(e.target.value)} placeholder="ZIP" />
        </div>
        <button className={goldBtn} disabled={busy} onClick={saveAddress}>Save address</button>
      </div>

      {(parent.students || []).length > 0 && (
        <div className="border-t border-[#1e3a6e] pt-4 space-y-3">
          <p className={label}>Swimmers</p>
          {(parent.students || []).map((s: any) => (
            <div key={s.id} className="flex flex-wrap gap-2 items-center">
              <input className={inputCls + ' max-w-[220px]'} value={studentEdits[s.id]?.name || ''}
                onChange={e => setStudentEdits(p => ({ ...p, [s.id]: { ...p[s.id], name: e.target.value } }))} />
              <input type="date" className={inputCls + ' max-w-[170px]'} value={studentEdits[s.id]?.dob || ''}
                onChange={e => setStudentEdits(p => ({ ...p, [s.id]: { ...p[s.id], dob: e.target.value } }))} />
              <button className={goldBtn} disabled={busy} onClick={() => saveStudent(s)}>Save</button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
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
      className="tap-auto ml-2 p-1.5 -m-1.5 ml-1 inline-flex items-center justify-center text-gray-500 hover:text-[#c9a84c] transition-colors flex-shrink-0"
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
  const [alertMsg, setAlertMsg] = useState<string | null>(null)

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
      .select('id, status, student_id, class_session_id, lesson_group_id')
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
        return { id: b.id, session_date: cs.session_date, start_time: cs.start_time, end_time: cs.end_time, course_name: cs.ct?.name || '', coach_name: cs.coach?.first_name || '', status: b.status, student_id: b.student_id, class_session_id: b.class_session_id, lesson_group_id: b.lesson_group_id }
      })
      .filter(Boolean) as Booking[]
    // A 60-minute lesson is two linked bookings. Every other screen shows it as
    // ONE row, so this page must too — and the row has to make clear the family
    // booked a full hour, not a lesson that merely runs long. Attendance still
    // works off the first half's id; the server cascades to the sibling.
    const mergeHours = (list: Booking[]): Booking[] => {
      const byGroup: Record<string, Booking[]> = {}
      const out: Booking[] = []
      for (const b of list) {
        if (!b.lesson_group_id) { out.push(b); continue }
        ;(byGroup[b.lesson_group_id] ||= []).push(b)
      }
      for (const halves of Object.values(byGroup)) {
        if (halves.length === 1) { out.push(halves[0]); continue }
        const sorted = [...halves].sort((a, b) => (a.start_time || '').localeCompare(b.start_time || ''))
        out.push({ ...sorted[0], end_time: sorted[sorted.length - 1].end_time, is_hour: true })
      }
      return out
    }
    const merged = mergeHours(bookings)
    const nowMin = getNowMinutesLA()
    const isPast = (b: Booking) => {
      if (b.session_date < today) return true
      if (b.session_date > today) return false
      const [eh, em] = b.end_time.split(':').map(Number)
      return (eh * 60 + em) <= nowMin
    }
    const upcoming = merged.filter(b => !isPast(b)).sort((a, b) => a.session_date.localeCompare(b.session_date))
    let past = merged.filter(isPast).sort((a, b) => b.session_date.localeCompare(a.session_date))
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
      setAlertMsg((checkedIn ? 'Could not mark this student as checked in. ' : 'Could not mark this student as absent. ') + (data.error || res.statusText))
      return
    }
    setStudentBookings(prev => {
      const sb = prev[studentId]
      if (!sb) return prev
      return {
        ...prev,
        [studentId]: {
          ...sb,
          // A 60-minute lesson is two linked bookings and the server toggles BOTH.
          // Mirror that locally, or the sibling row keeps its old state until a
          // reload and the operator thinks the cascade failed.
          past: sb.past.map(b => (b.id === booking.id || (booking.lesson_group_id && b.lesson_group_id === booking.lesson_group_id)) ? { ...b, checked_in: checkedIn } : b),
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
      <AlertModal message={alertMsg} onClose={() => setAlertMsg(null)} />
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
                className="w-full flex items-center justify-between gap-3 p-4 sm:p-5 text-left hover:bg-[#1e3a6e]/30 transition-all"
              >
                {/* This row is an avatar, a name, a long email and three status items.
                    The card is overflow-hidden, so at phone width the right-hand
                    column was being cut off rather than wrapped -- the student count
                    and the expand arrow simply vanished. The email truncates now and
                    the last-seen stamp, the least useful of the three, drops out on
                    phones so the count and the arrow always survive. */}
                <div className="flex items-center gap-3 sm:gap-4 min-w-0 flex-1">
                  <div className="relative w-10 h-10 rounded-full bg-[#1e3a6e] flex items-center justify-center flex-shrink-0">
                    <span className="text-[#c9a84c] font-bold">{parent.first_name.charAt(0)}</span>
                    {isOnline(parent) && (
                      <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-green-500 border-2 border-[#111d38]" title="Online now" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-white font-medium truncate">{parent.first_name} {parent.last_name}</p>
                    <p className="text-gray-400 text-sm truncate">{parent.email}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                  {isUnread(parent) && (
                    <span className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0" title="New activity" />
                  )}
                  <span className={`hidden sm:inline text-xs ${isOnline(parent) ? 'text-green-400' : 'text-gray-500'}`}>{isOnline(parent) ? 'Online' : timeAgo(parent.last_activity_at)}</span>
                  <span className="text-gray-500 text-sm whitespace-nowrap">{parent.students.length} student{parent.students.length !== 1 ? 's' : ''}</span>
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
                          <p className="text-gray-300 text-sm leading-relaxed min-w-0 break-words">
                            {[parent.address_line1, parent.address_line2, [parent.city, parent.state, parent.zip_code].filter(Boolean).join(', ')].filter(Boolean).join(', ')}
                          </p>
                          <span className="mt-0.5"><CopyButton value={addressText} /></span>
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

                  <MemberEditPanel parent={parent} />

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
                          className={`tap-auto relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${
                            parent.newsletter_subscribed ? 'bg-green-500' : 'bg-gray-600'
                          }`}
                        >
                          <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform duration-200 ${
                            parent.newsletter_subscribed ? 'translate-x-5' : 'translate-x-0'
                          }`} />
                        </button>
                        <span className="text-sm text-gray-400">
                          {parent.newsletter_subscribed ? 'Subscribed' : 'Not subscribed'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Tokens */}
                  <ParentPointsSection parentId={parent.id} />

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
                            {/* Identity on the left, a level pill and four buttons on the
                                right, in one unwrapping row inside an overflow-hidden card:
                                at phone width the row wanted ~460px in a 270px box, so
                                History, Notes and SDP were cut away with no scrollbar and
                                no sign they existed. Both halves wrap now. */}
                            <div className="flex flex-wrap items-center gap-3 p-3">
                              <div className="flex items-center gap-3 min-w-0">
                                <div className="w-7 h-7 rounded-full bg-[#1e3a6e] flex items-center justify-center">
                                  <span className="text-[#c9a84c] text-xs font-bold">{student.full_name.charAt(0)}</span>
                                </div>
                                <div className="min-w-0">
                                  <p className="text-white text-sm truncate">{student.full_name}</p>
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
                              <div className="flex flex-wrap items-center gap-2 sm:ml-4">
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
                                        {b.is_hour && <span className="px-1.5 py-0.5 rounded border border-[#c9a84c]/50 text-[#c9a84c] text-[10px] font-semibold flex-shrink-0">60 min</span>}
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

type LedgerRow = {
  id: string
  at: string
  points: number
  purchased: number
  granted: number
  balanceAfter: number
  reason: string
  note: string | null
  amountCents: number | null
  actor: string | null
}
type WalletView = {
  balance: number
  balancePurchased: number
  balanceGranted: number
  lessonsCompleted: number
  vipLevel: number
  vipDiscount: number
  nextTier: { level: number; discount: number; lessonsToGo: number } | null
  forgiveness: number
  ledger: LedgerRow[]
}

/**
 * A family's wallet, and the one place an exception can be handled.
 *
 * Every adjustment carries a reason and it is not optional — the parent reads
 * the same line on their own statement, and a movement nobody can account for
 * is worse than whatever it was meant to fix. Points added here are granted:
 * they book lessons like any other point but cannot be refunded for cash,
 * because no cash came in for them.
 */
function ParentPointsSection({ parentId }: { parentId: string }) {
  const [open, setOpen] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [w, setW] = useState<WalletView | null>(null)
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)

  async function load() {
    setErr(null)
    const res = await fetch('/api/admin/points?parent_id=' + parentId)
    if (!res.ok) { setErr('Failed to load points'); return }
    setW(await res.json())
    setLoaded(true)
  }

  function toggle() {
    const next = !open
    setOpen(next)
    if (next && !loaded) load()
  }

  const n = Math.trunc(Number(amount))
  const valid = Number.isFinite(n) && n !== 0 && note.trim().length >= 3

  async function submit() {
    setConfirming(false)
    setBusy(true); setErr(null)
    const res = await fetch('/api/admin/points', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ parent_id: parentId, points: n, note: note.trim() }),
    })
    setBusy(false)
    if (!res.ok) { const d = await res.json().catch(() => null); setErr(d?.error || 'Adjustment failed'); return }
    setAmount(''); setNote('')
    load()
  }

  const reasonStyle = (r: string) =>
    r === 'purchase' ? 'border-emerald-400/50 text-emerald-300'
    : r === 'admin_grant' ? 'border-purple-400/50 text-purple-300'
    : r === 'admin_deduct' ? 'border-red-400/50 text-red-300'
    : r === 'cash_refund' ? 'border-red-400/50 text-red-300'
    : r === 'school_cancel' ? 'border-orange-400/50 text-orange-300'
    : 'border-[#c9a84c]/50 text-[#c9a84c]'

  return (
    <div className="border-t border-[#1e3a6e]/40 pt-4">
      <button onClick={toggle} className="text-gray-500 text-xs uppercase tracking-wider mb-1 hover:text-[#c9a84c] transition-colors">
        Points {open ? '▾' : '▸'}
      </button>
      {open && (
        <div className="mt-2 space-y-3">
          {err && <p className="text-red-400 text-xs">{err}</p>}
          {!loaded && !err && <p className="text-gray-500 text-xs">Loading…</p>}

          {loaded && w && (
            <>
              <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm">
                <span className="text-[#c9a84c] text-xl font-semibold tabular-nums">{w.balance.toLocaleString()}</span>
                <span className="text-gray-500 text-xs">
                  {w.balancePurchased.toLocaleString()} purchased · {w.balanceGranted.toLocaleString()} granted
                </span>
                <span className="text-gray-400 text-xs">
                  VIP {w.vipLevel} ({Math.round(w.vipDiscount * 100)}% off) · {w.lessonsCompleted} lessons
                  {w.nextTier ? ` · ${w.nextTier.lessonsToGo} to VIP ${w.nextTier.level}` : ''}
                </span>
                <span className="text-gray-400 text-xs">{w.forgiveness} late-cancel allowance{w.forgiveness === 1 ? '' : 's'}</span>
              </div>
              {/* Refundable is the purchased side only — spelled out here so the
                  figure is never worked out in someone's head at the counter. */}
              <p className="text-gray-500 text-xs">
                Cash refundable today: ${w.balancePurchased.toLocaleString()}. Granted points are not refundable.
              </p>

              <div className="flex flex-wrap items-center gap-2 text-sm">
                <input type="number" placeholder="± points" value={amount} onChange={e => setAmount(e.target.value)}
                  className="w-24 bg-transparent border border-[#1e3a6e] rounded px-2 py-1 text-gray-300 text-xs" />
                <input type="text" placeholder="Reason (the parent sees this)" value={note} onChange={e => setNote(e.target.value)}
                  className="flex-1 min-w-[180px] bg-transparent border border-[#1e3a6e] rounded px-2 py-1 text-gray-300 text-xs" />
                <button onClick={() => valid && setConfirming(true)} disabled={busy || !valid}
                  className="text-xs px-3 py-1 rounded border border-purple-400/50 text-purple-300 hover:bg-purple-400/10 disabled:opacity-40">
                  Adjust
                </button>
              </div>

              {w.ledger.length === 0 && <p className="text-gray-500 text-xs">No movements yet</p>}
              {w.ledger.map(row => (
                <div key={row.id} className="flex flex-wrap items-center gap-3 text-sm border border-[#1e3a6e] rounded-lg px-3 py-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full border ${reasonStyle(row.reason)}`}>{row.reason.replace(/_/g, ' ')}</span>
                  <span className={`tabular-nums font-semibold ${row.points >= 0 ? 'text-emerald-300' : 'text-gray-300'}`}>
                    {row.points >= 0 ? '+' : '−'}{Math.abs(row.points).toLocaleString()}
                  </span>
                  <span className="text-gray-500 text-xs tabular-nums">→ {row.balanceAfter.toLocaleString()}</span>
                  {row.amountCents ? <span className="text-gray-500 text-xs">${(row.amountCents / 100).toLocaleString()}</span> : null}
                  {row.note && <span className="text-gray-400 text-xs truncate max-w-[260px]" title={row.note}>{row.note}</span>}
                  <span className="text-gray-600 text-xs ml-auto">
                    {new Date(row.at).toLocaleString('en-US', { timeZone: 'America/Los_Angeles', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })}
                    {row.actor && row.actor !== 'system' && row.actor !== 'parent' ? ` · ${row.actor}` : ''}
                  </span>
                </div>
              ))}
            </>
          )}
        </div>
      )}

      {confirming && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setConfirming(false)}>
          <div className="bg-[#1a2744] border border-[#1e3a6e] rounded-xl p-6 max-w-sm w-full mx-4" onClick={e => e.stopPropagation()}>
            <p className="text-xs text-purple-300 font-semibold tracking-wide mb-2">POINTS ADJUSTMENT</p>
            <h3 className="text-white font-semibold text-lg mb-3">{n > 0 ? `Add ${n.toLocaleString()} points?` : `Take back ${Math.abs(n).toLocaleString()} points?`}</h3>
            <div className="text-sm text-gray-300 space-y-1 mb-4">
              <p className="text-gray-400 text-xs">Reason: {note.trim()}</p>
              <p className="text-gray-400 text-xs">
                New balance: {((w?.balance ?? 0) + n).toLocaleString()} points
              </p>
            </div>
            <p className="text-gray-500 text-xs mb-4">
              {n > 0
                ? 'These are granted points: they book lessons like any other point, and are not refundable for cash.'
                : 'Granted points are taken back first, then purchased ones.'}
              {' '}The reason above appears on the parent’s own points history.
            </p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setConfirming(false)} className="text-xs px-4 py-2 rounded border border-[#1e3a6e] text-gray-300 hover:bg-white/5">Cancel</button>
              <button onClick={submit} className="text-xs px-4 py-2 rounded bg-purple-500/80 text-white font-semibold hover:bg-purple-500">Confirm</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
