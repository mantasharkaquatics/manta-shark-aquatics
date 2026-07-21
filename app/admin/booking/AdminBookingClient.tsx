'use client'

import { zoneFill } from '@/lib/zone-colors'

import { formatTime12h } from '@/lib/date'
import StudentNotesPanel from '@/components/StudentNotesPanel'

import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { TRIAL_PRICE_CENTS } from '@/lib/plans'

interface Coach {
  id: string
  first_name: string
  last_name: string
}

interface Student {
  id: string
  full_name: string
  current_level: string
  parent_id: string
  trial_used_at: string | null
  parents: { id: string; first_name: string; last_name: string; email: string } | { id: string; first_name: string; last_name: string; email: string }[]
}

interface CourseType {
  id: string
  name: string
  slug: string
  duration_minutes: number
  max_students: number
}

interface Session {
  id: string
  coach_id: string
  session_date: string
  start_time: string
  end_time: string
  max_students: number
  enrolled_count: number
  status: string
  course_type_id: string
  course_types: { name: string; slug: string; duration_minutes: number } | { name: string; slug: string; duration_minutes: number }[]
  bookings?: { id: string; parent_id: string; lesson_credit_id: string | null; status: string; is_trial?: boolean; students?: { full_name: string } | { full_name: string }[] | null; parents?: { first_name: string; last_name: string } | { first_name: string; last_name: string }[] | null }[]
}

interface BookingSlot {
  date: string
  time: string
  coachId: string
}

interface Block {
  id: string
  coach_id: string
  date: string
  start_time: string | null
  end_time: string | null
  block_type: string
  reason: string | null
}

interface Props {
  coaches: Coach[]
  students: Student[]
  courseTypes: CourseType[]
  initialSessions: Session[]
}

const WORK_START = 6
const WORK_END = 22
const SLOT_MINUTES = 30

function toDateStr(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function formatTime(t: string): string {
  const [h, m] = t.split(':').map(Number)
  const ampm = h >= 12 ? 'PM' : 'AM'
  const hour = h % 12 || 12
  return `${hour}:${m.toString().padStart(2, '0')} ${ampm}`
}

function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

function minutesToTime(m: number): string {
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

function isCoachAvailable(_id: string, _date: Date, _time: string): boolean {
  // Admin can book any time slot
  return true
}

function getSessionCourseType(s: Session): { name: string; slug: string } {
  const ct = Array.isArray(s.course_types) ? s.course_types[0] : s.course_types
  return ct || { name: '', slug: '' }
}

function getMonthDates(anchor: Date): Date[] {
  const year = anchor.getFullYear()
  const month = anchor.getMonth()
  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0)
  const startPad = firstDay.getDay()
  const endPad = 6 - lastDay.getDay()
  const dates: Date[] = []
  for (let i = -startPad; i <= lastDay.getDate() - 1 + endPad; i++) {
    dates.push(new Date(year, month, 1 + i))
  }
  return dates
}

function generateTimeSlots(): string[] {
  const slots: string[] = []
  for (let m = WORK_START * 60; m < WORK_END * 60; m += SLOT_MINUTES) {
    slots.push(minutesToTime(m))
  }
  return slots
}
const TIME_SLOTS = generateTimeSlots()

const COURSE_COLORS: Record<string, string> = {
  '1on1': '#2563eb',
  '1on2': '#7c3aed',
  '1on4': '#059669',
  'team': '#ea580c',
}

const WEEKDAY_HEADERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

// ══════════════════════════════════════════════════════════════════════
// Mini Calendar (left sidebar)
// ══════════════════════════════════════════════════════════════════════
function MiniCalendar({ selected, onSelect }: { selected: Date; onSelect: (d: Date) => void }) {
  const [mini, setMini] = useState(new Date(selected.getFullYear(), selected.getMonth(), 1))
  const dates = getMonthDates(mini)
  const todayStr = toDateStr(new Date())
  const selectedStr = toDateStr(selected)

  return (
    <div className="w-56 flex-shrink-0 bg-[#111d38] rounded-xl p-3 self-start sticky top-4">
      {/* Mini header */}
      <div className="flex items-center justify-between mb-2">
        <button onClick={() => setMini(new Date(mini.getFullYear(), mini.getMonth() - 1, 1))}
          className="p-1 rounded hover:bg-white/10 text-white/50 hover:text-white transition-colors text-sm">‹</button>
        <span className="text-xs font-semibold text-white/70">
          {mini.getFullYear()} {MONTH_NAMES[mini.getMonth()]}
        </span>
        <button onClick={() => setMini(new Date(mini.getFullYear(), mini.getMonth() + 1, 1))}
          className="p-1 rounded hover:bg-white/10 text-white/50 hover:text-white transition-colors text-sm">›</button>
      </div>
      {/* Weekday labels */}
      <div className="grid grid-cols-7 mb-1">
        {WEEKDAY_HEADERS.map(d => (
          <div key={d} className="text-center text-[9px] text-white/20 py-0.5">{d}</div>
        ))}
      </div>
      {/* Days */}
      <div className="grid grid-cols-7 gap-0.5">
        {dates.map(date => {
          const ds = toDateStr(date)
          const isToday = ds === todayStr
          const isSelected = ds === selectedStr
          const isCurrentMonth = date.getMonth() === mini.getMonth()
          return (
            <button
              key={ds}
              onClick={() => onSelect(date)}
              className={`h-7 w-full rounded text-[10px] transition-colors ${
                isSelected
                  ? 'bg-[#c9a84c] text-[#0d1529] font-bold'
                  : isToday
                  ? 'border border-[#c9a84c]/60 text-[#c9a84c]'
                  : isCurrentMonth
                  ? 'text-white/60 hover:bg-white/10'
                  : 'text-white/15 hover:bg-white/5'
              }`}
            >
              {date.getDate()}
            </button>
          )
        })}
      </div>
      {/* Today button */}
      <button
        onClick={() => {
          const t = new Date()
          const today = new Date(t.getFullYear(), t.getMonth(), t.getDate())
          setMini(new Date(today.getFullYear(), today.getMonth(), 1))
          onSelect(today)
        }}
        className="mt-2 w-full text-[10px] text-white/30 hover:text-[#c9a84c] transition-colors text-center py-1"
      >
        Back to today
      </button>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════
// Student Search
// ══════════════════════════════════════════════════════════════════════
function StudentSearch({ students, value, onChange, parentCreditsCache }: {
  students: Student[]
  value: string
  onChange: (id: string) => void
  parentCreditsCache: Record<string, number>
}) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const filtered = query.trim().length < 1 ? [] : students.filter(s => {
    const parent = Array.isArray(s.parents) ? s.parents[0] : s.parents
    const q = query.toLowerCase()
    return (
      s.full_name.toLowerCase().includes(q) ||
      (parent?.first_name + ' ' + parent?.last_name).toLowerCase().includes(q) ||
      parent?.email?.toLowerCase().includes(q)
    )
  }).slice(0, 8)

  const selected = students.find(s => s.id === value)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  function select(s: Student) {
    onChange(s.id)
    const parent = Array.isArray(s.parents) ? s.parents[0] : s.parents
    setQuery(s.full_name + (parent ? ` (${parent.first_name} ${parent.last_name})` : ''))
    setOpen(false)
  }

  function clear() {
    onChange('')
    setQuery('')
    setOpen(false)
  }

  return (
    <div ref={ref} className="relative">
      <div className="relative">
        <input
          type="text"
          value={selected && !open ? ((() => {
            const parent = Array.isArray(selected.parents) ? selected.parents[0] : selected.parents
            return `${selected.full_name} (${parent?.first_name} ${parent?.last_name})`
          })()) : query}
          onChange={e => { setQuery(e.target.value); setOpen(true); if (!e.target.value) onChange('') }}
          onFocus={() => { setOpen(true); if (selected) setQuery('') }}
          placeholder="Search student, parent name or email..."
          className="w-full bg-[#111d38] border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white placeholder-white/30 focus:outline-none focus:border-[#c9a84c] transition-colors pr-8"
        />
        {(query || selected) && (
          <button onClick={clear} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/30 hover:text-white transition-colors text-lg leading-none">×</button>
        )}
      </div>
      {open && filtered.length > 0 && (
        <div className="absolute z-50 top-full mt-1 w-full bg-[#1a2744] border border-white/10 rounded-xl shadow-2xl overflow-hidden">
          {filtered.map(s => {
            const parent = Array.isArray(s.parents) ? s.parents[0] : s.parents
            return (
              <button
                key={s.id}
                onClick={() => select(s)}
                className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-white/5 transition-colors text-left border-b border-white/5 last:border-0"
              >
                <div>
                  <p className="text-sm text-white font-medium">{s.full_name}</p>
                  <p className="text-xs text-white/40">{parent?.first_name} {parent?.last_name} · {parent?.email}</p>
                </div>
                <span className="text-xs ml-2 flex-shrink-0" style={{ color: s.current_level == null ? '#fbbf24' : 'rgba(255,255,255,0.3)' }}>{s.current_level == null ? '⚠ Not assessed' : `Lv.${s.current_level}`}</span>
                {(() => { const p = Array.isArray(s.parents) ? s.parents[0] : s.parents; const rem = p?.id ? parentCreditsCache[p.id] : undefined; return rem !== undefined ? <span className="text-xs text-white/50 ml-1">· {rem}</span> : null })()}
              </button>
            )
          })}
        </div>
      )}
      {open && query.trim().length >= 1 && filtered.length === 0 && (
        <div className="absolute z-50 top-full mt-1 w-full bg-[#1a2744] border border-white/10 rounded-xl shadow-2xl px-3 py-3">
          <p className="text-sm text-white/30 text-center">No matching students</p>
        </div>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════
// Main Component
// ══════════════════════════════════════════════════════════════════════
export default function AdminBookingClient({ coaches, students, courseTypes, initialSessions }: Props) {
  const supabase = createClient()
  const [view, setView] = useState<'month' | 'day'>('month')
  const [anchor, setAnchor] = useState(() => {
    const d = new Date()
    return new Date(d.getFullYear(), d.getMonth(), d.getDate())
  })
  const [sessions, setSessions] = useState<Session[]>(initialSessions)
  const [loading, setLoading] = useState(false)
  const [modal, setModal] = useState<'book' | 'detail' | 'block' | null>(null)
  const [selectedSlot, setSelectedSlot] = useState<BookingSlot | null>(null)
  const [selectedSession, setSelectedSession] = useState<Session | null>(null)
  const [formStudent, setFormStudent] = useState('')
  const [formStudent2, setFormStudent2] = useState('')
  const [formCourse, setFormCourse] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [parentCreditsCache, setParentCreditsCache] = useState<Record<string, number>>({})
  const [bookMode, setBookMode] = useState<'single' | 'recurring'>('single')
  const [recurCount, setRecurCount] = useState(10)
  const [recurSkips, setRecurSkips] = useState<string[]>([])
  const [recurPreview, setRecurPreview] = useState<{ candidates: { date: string; status: string }[]; credits: any } | null>(null)
  const [recurLoading, setRecurLoading] = useState(false)
  const [blocks, setBlocks] = useState<Block[]>([])
  const [blockAllDay, setBlockAllDay] = useState(false)
  const [blockStart, setBlockStart] = useState('')
  const [blockEnd, setBlockEnd] = useState('')
  const [blockReason, setBlockReason] = useState('')
  const [blockSaving, setBlockSaving] = useState(false)
  const [blockError, setBlockError] = useState('')
  const [viewingBlock, setViewingBlock] = useState<Block | null>(null)
  const [unblocking, setUnblocking] = useState(false)
  const [unblockErr, setUnblockErr] = useState('')

  const fmtBlk = (t: string) => {
    const [h, m] = t.slice(0, 5).split(':').map(Number)
    const ap = h >= 12 ? 'PM' : 'AM'
    const hh = h % 12 === 0 ? 12 : h % 12
    return `${hh}:${String(m).padStart(2, '0')} ${ap}`
  }

  async function removeViewingBlock() {
    if (!viewingBlock || unblocking) return
    setUnblocking(true)
    setUnblockErr('')
    try {
      const res = await fetch('/api/admin/time-off', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: viewingBlock.id }) })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        setBlocks(prev => prev.filter(b => b.id !== viewingBlock.id))
        setViewingBlock(null)
      } else {
        setUnblockErr(data.error || 'Failed to remove block')
      }
    } finally { setUnblocking(false) }
  }

  const [editingBlock, setEditingBlock] = useState(false)
  const [editAllDay, setEditAllDay] = useState(false)
  const [editStart, setEditStart] = useState('')
  const [editEnd, setEditEnd] = useState('')
  const [editReason, setEditReason] = useState('')
  const [savingBlock, setSavingBlock] = useState(false)

  function startEditBlock() {
    if (!viewingBlock) return
    setEditAllDay(viewingBlock.start_time == null)
    setEditStart(viewingBlock.start_time ? String(viewingBlock.start_time).slice(0, 5) : TIME_SLOTS[0])
    setEditEnd(viewingBlock.end_time ? String(viewingBlock.end_time).slice(0, 5) : TIME_SLOTS[1])
    setEditReason(viewingBlock.reason || '')
    setUnblockErr('')
    setEditingBlock(true)
  }

  async function saveBlockEdit() {
    if (!viewingBlock || savingBlock) return
    if (!editAllDay && (!editStart || !editEnd || editStart >= editEnd)) { setUnblockErr('Please select a valid time range'); return }
    setSavingBlock(true); setUnblockErr('')
    try {
      const res = await fetch('/api/admin/time-off', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: viewingBlock.id, all_day: editAllDay, start_time: editStart, end_time: editEnd, reason: editReason }) })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        await loadBlocks()
        setEditingBlock(false)
        setViewingBlock(null)
      } else {
        setUnblockErr(data.error || 'Failed to update block')
      }
    } finally { setSavingBlock(false) }
  }

  const loadBlocks = useCallback(async () => {
    let from: string, to: string
    if (view === 'month') {
      const dates = getMonthDates(anchor)
      from = toDateStr(dates[0])
      to = toDateStr(dates[dates.length - 1])
    } else {
      from = toDateStr(anchor)
      to = toDateStr(anchor)
    }
    const { data } = await supabase
      .from('coach_time_off')
      .select('id, coach_id, date, start_time, end_time, block_type, reason')
      .gte('date', from)
      .lte('date', to)
    setBlocks((data || []) as Block[])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anchor, view])

  useEffect(() => { loadBlocks() }, [loadBlocks])

  async function handleCreateBlock() {
    if (!selectedSlot) return
    if (!blockAllDay && (!blockStart || !blockEnd || blockStart >= blockEnd)) {
      setBlockError('Please select a valid time range')
      return
    }
    setBlockSaving(true)
    setBlockError('')
    const res = await fetch('/api/admin/time-off', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        coach_id: selectedSlot.coachId,
        date: selectedSlot.date,
        all_day: blockAllDay,
        start_time: blockStart,
        end_time: blockEnd,
        reason: blockReason,
      }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      setBlockError(data.error || 'Failed to create block')
      setBlockSaving(false)
      return
    }
    await loadBlocks()
    setBlockSaving(false)
    setModal(null)
  }

  async function fetchRecurPreview(skips: string[]) {
    if (!selectedSlot || !formCourse || !formStudent) { setError('Please select a course type and student first'); return }
    setRecurLoading(true)
    setError('')
    try {
      const res = await fetch('/api/admin/bookings/bulk-create', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'preview',
          coach_id: selectedSlot.coachId,
          course_type_id: formCourse,
          student_id: formStudent,
          student2_id: courseTypes.find(c => c.id === formCourse)?.slug === '1on2' && formStudent2 ? formStudent2 : undefined,
          start_time: selectedSlot.time,
          start_date: selectedSlot.date,
          count: recurCount,
          skip_dates: skips,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Preview failed'); setRecurPreview(null) }
      else setRecurPreview(data)
    } catch { setError('Preview failed, please try again') }
    setRecurLoading(false)
  }

  async function handleRecurCommit() {
    if (!selectedSlot || !recurPreview) return
    const okDates = recurPreview.candidates.filter(c => c.status === 'ok').map(c => c.date)
    if (okDates.length === 0) { setError('No bookable dates'); return }
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/admin/bookings/bulk-create', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'commit',
          coach_id: selectedSlot.coachId,
          course_type_id: formCourse,
          student_id: formStudent,
          student2_id: courseTypes.find(c => c.id === formCourse)?.slug === '1on2' && formStudent2 ? formStudent2 : undefined,
          start_time: selectedSlot.time,
          dates: okDates,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Creation failed') }
      else {
        setSuccess(`Created ${okDates.length} lessons!`)
        await loadSessions()
        setTimeout(() => { setModal(null); setSuccess(''); setRecurPreview(null) }, 1500)
      }
    } catch { setError('Creation failed, please try again') }
    setSaving(false)
  }

  function toggleRecurSkip(date: string) {
    const next = recurSkips.includes(date) ? recurSkips.filter(d => d !== date) : [...recurSkips, date]
    setRecurSkips(next)
    fetchRecurPreview(next)
  }
  const [crossAccountSessionIds, setCrossAccountSessionIds] = useState<Set<string>>(new Set())

  const monthDates = getMonthDates(anchor)

  useEffect(() => {
    if (!formCourse) return
    const uniqueParentIds = [...new Set(students.map((s: any) => {
      const p = Array.isArray(s.parents) ? s.parents[0] : s.parents
      return p?.id
    }).filter(Boolean))]
    const fetchAll = async () => {
      const cache: Record<string, number> = {}
      await Promise.all(uniqueParentIds.map(async (pid) => {
        const res = await fetch(`/api/admin/parent-credits?parent_id=${pid}&course_type_id=${formCourse}`)
        if (res.ok) {
          const credits = await res.json()
          const remaining = credits.reduce((sum: number, c: any) => sum + (c.total_credits - c.used_credits), 0)
          cache[pid] = remaining
        }
      }))
      setParentCreditsCache(cache)
    }
    fetchAll()
  }, [formCourse, students])

  const [dragMove, setDragMove] = useState<any>(null)
  const [dragMoving, setDragMoving] = useState(false)
  const [dragMoveError, setDragMoveError] = useState('')

  async function confirmDragMove() {
    if (!dragMove) return
    setDragMoving(true); setDragMoveError('')
    const res = await fetch('/api/admin/bookings/move-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: dragMove.session_id, coach_id: dragMove.to_coach_id, date: dragMove.to_date, time: dragMove.to_time }),
    })
    const data = await res.json()
    setDragMoving(false)
    if (!res.ok) { setDragMoveError(data.error || 'Reschedule failed'); return }
    setDragMove(null)
    loadSessions()
  }

  const loadSessions = useCallback(async () => {
    setLoading(true)
    let from: string, to: string
    if (view === 'month') {
      const dates = getMonthDates(anchor)
      from = toDateStr(dates[0])
      to = toDateStr(dates[dates.length - 1])
    } else {
      from = toDateStr(anchor)
      to = toDateStr(anchor)
    }
    const { data } = await supabase
      .from('class_sessions')
      .select('id, coach_id, session_date, start_time, end_time, max_students, enrolled_count, status, course_type_id, course_types(name, slug, duration_minutes)')
      .lte('session_date', to)
      .neq('status', 'cancelled')
      .order('session_date')
      .order('start_time')
    if (data) {
      // Fetch bookings via server API (bypasses RLS); only sessions with enrolled > 0
      const sessionsWithBookings = await Promise.all(data.map(async (s: any) => {
        if (s.enrolled_count === 0) return s
        try {
          const res = await fetch(`/api/admin/session-bookings?session_id=${s.id}`)
          if (!res.ok) return s
          const bookings = await res.json()
          return { ...s, bookings: Array.isArray(bookings) ? bookings : [] }
        } catch { return s }
      }))
      setSessions(sessionsWithBookings as Session[])
      // Compute cross-account 1on2 sessions
      const crossIds = new Set<string>()
      sessionsWithBookings.forEach((s: any) => {
        const ct = s.course_types?.slug
        if (ct !== '1on2') return
        const active = (s.bookings || []).filter((b: any) => b.status !== 'cancelled' && b.status !== 'pending_partner')
        if (active.length === 2 && active[0].parent_id !== active[1].parent_id) {
          crossIds.add(s.id)
        }
      })
      setCrossAccountSessionIds(crossIds)
    }
    setLoading(false)
  }, [anchor, view]) // eslint-disable-line

  useEffect(() => { loadSessions() }, [loadSessions])

  function handleMiniSelect(date: Date) {
    setAnchor(new Date(date.getFullYear(), date.getMonth(), date.getDate()))
    setView('day')
  }

  function navigate(dir: number) {
    if (view === 'month') {
      setAnchor(new Date(anchor.getFullYear(), anchor.getMonth() + dir, 1))
    } else {
      const d = new Date(anchor)
      d.setDate(d.getDate() + dir)
      setAnchor(d)
    }
  }

  const [isTrial, setIsTrial] = useState(false)
  const [trialUrl, setTrialUrl] = useState('')
  const [trialSaving, setTrialSaving] = useState(false)
  const [trialCopied, setTrialCopied] = useState(false)
  const [trialCreditStatus, setTrialCreditStatus] = useState<'none' | 'checking' | 'available' | 'active'>('none')

  useEffect(() => {
    if (!isTrial || !formStudent) {
      setTrialCreditStatus('none')
      return
    }
    const student = students.find(s => s.id === formStudent)
    if (!student?.trial_used_at) {
      setTrialCreditStatus('none')
      return
    }
    setTrialCreditStatus('checking')
    fetch(`/api/bookings/trial-eligibility?student_id=${formStudent}`)
      .then(r => r.json())
      .then(data => {
        setTrialCreditStatus(data.hasActiveTrial ? 'active' : 'available')
      })
      .catch(() => setTrialCreditStatus('none'))
  }, [isTrial, formStudent]) // eslint-disable-line

  function openBookModal(date: string, time: string, coachId: string) {
    setSelectedSlot({ date, time, coachId })
    setFormStudent('')
    setFormStudent2('')
    setFormCourse(courseTypes[0]?.id || '')
    setIsTrial(false)
    setTrialUrl('')
    setError('')
    setSuccess('')
    setBookMode('single')
    setRecurSkips([])
    setRecurPreview(null)
    setModal('book')
  }

  function openDetailModal(session: Session) {
    setSelectedSession(session)
    setModal('detail')
  }

  async function handleBook() {
    const ct = courseTypes.find(c => c.id === formCourse)!
    const is1on2 = ct?.slug === '1on2'

    if (!formStudent || !formCourse || !selectedSlot) {
      setError('Please select a student and course type')
      return
    }
    if (is1on2 && !formStudent2) {
      setError('1-on-2 lessons require two students')
      return
    }
    setSaving(true)
    setError('')

    const student1 = students.find(s => s.id === formStudent)!
    const student2 = is1on2 ? students.find(s => s.id === formStudent2)! : null
    const parentId1 = student1.parent_id
    const parentId2 = student2?.parent_id || null
    const sameParent = parentId2 && parentId1 === parentId2

    // Server API (bulk-create single-day path): validation, session creation, credit deduction (atomic RPC), and emails all server-side
    try {
      const res = await fetch('/api/admin/bookings/bulk-create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'commit',
          coach_id: selectedSlot.coachId,
          course_type_id: formCourse,
          student_id: formStudent,
          student2_id: is1on2 && formStudent2 ? formStudent2 : undefined,
          start_time: selectedSlot.time,
          dates: [selectedSlot.date],
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Failed to create booking')
        setSaving(false)
        return
      }
    } catch (e: any) {
      setError('Failed to create booking: ' + (e?.message || 'please try again'))
      setSaving(false)
      return
    }

    setSuccess('Booking created!')
    await loadSessions()
    setTimeout(() => { setModal(null); setSuccess('') }, 1500)
    setSaving(false)
  }

  async function handleTrialBook() {
    if (!formStudent || !selectedSlot) {
      setError('Please select a student')
      return
    }
    setTrialSaving(true)
    setError('')
    setTrialUrl('')

    try {
      const res = await fetch('/api/stripe/trial-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId: formStudent,
          coachId: selectedSlot.coachId,
          date: selectedSlot.date,
          time: selectedSlot.time,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Failed to create assessment payment link')
        setTrialSaving(false)
        return
      }
      setTrialUrl(data.url)
      await loadSessions()
    } catch (e: any) {
      setError('Failed to create assessment payment link: ' + e.message)
    }
    setTrialSaving(false)
  }

  async function handleTrialCreditBook() {
    if (!formStudent || !selectedSlot) {
      setError('Please select a student')
      return
    }
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/admin/bookings/trial-credit-book', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId: formStudent,
          coachId: selectedSlot.coachId,
          date: selectedSlot.date,
          time: selectedSlot.time,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Failed to create booking')
        setSaving(false)
        return
      }
    } catch (e: any) {
      setError('Failed to create booking: ' + e.message)
      setSaving(false)
      return
    }
    setSuccess('Booked using the prepaid single lesson!')
    await loadSessions()
    setTimeout(() => { setModal(null); setSuccess('') }, 1500)
    setSaving(false)
  }

  function getSessionAt(date: string, time: string, coachId: string): Session | null {
    const matches = sessions.filter(s =>
      s.session_date === date &&
      s.coach_id === coachId &&
      s.start_time.slice(0, 5) === time
    )
    if (matches.length === 0) return null
    return matches.sort((a, b) => b.enrolled_count - a.enrolled_count)[0]
  }

  function getSessionsOnDate(date: string): Session[] {
    return sessions.filter(s => s.session_date === date)
  }

  const todayStr = toDateStr(new Date())
  const currentMonth = anchor.getMonth()

  const headerLabel = view === 'month'
    ? `${anchor.getFullYear()} ${MONTH_NAMES[anchor.getMonth()]}`
    : anchor.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })

  return (
    <div className="min-h-screen bg-[#0d1529] text-white -mx-6 -my-8">
      {/* Header */}
      <div className="border-b border-white/10 px-6 py-4 flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-xl font-semibold text-white" style={{ fontFamily: 'Playfair Display, serif' }}>
          Booking Calendar
        </h1>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex rounded-lg overflow-hidden border border-white/20">
            {(['month', 'day'] as const).map(v => (
              <button key={v} onClick={() => setView(v)}
                className={`px-4 py-1.5 text-sm transition-colors ${view === v ? 'bg-[#c9a84c] text-[#0d1529] font-semibold' : 'text-white/60 hover:text-white'}`}>
                {v === 'month' ? 'Month' : 'Day'}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => navigate(-1)} className="p-1.5 rounded hover:bg-white/10 text-white/60 hover:text-white text-lg leading-none transition-colors">‹</button>
            <span className="text-sm text-white/80 min-w-[200px] text-center">{headerLabel}</span>
            <button onClick={() => navigate(1)} className="p-1.5 rounded hover:bg-white/10 text-white/60 hover:text-white text-lg leading-none transition-colors">›</button>
            <button
              onClick={() => {
                const t = new Date()
                setAnchor(new Date(t.getFullYear(), t.getMonth(), t.getDate()))
                setView('month')
              }}
              className="px-3 py-1 text-xs rounded border border-white/20 hover:bg-white/10 text-white/60 hover:text-white transition-colors"
            >Today</button>
          </div>
          {loading && <span className="text-xs text-white/40 animate-pulse">Loading...</span>}
        </div>
      </div>

      {/* Body: sidebar + main */}
      <div className="flex gap-4 p-4" style={{ height: 'calc(100vh - 130px)' }}>
        {/* Left: Mini Calendar */}
        <MiniCalendar selected={anchor} onSelect={handleMiniSelect} />

        {/* Right: Main Calendar */}
        <div className="flex-1 overflow-auto">
          {view === 'month' ? (
            <MonthView
              dates={monthDates}
              currentMonth={currentMonth}
              todayStr={todayStr}
              getSessionsOnDate={getSessionsOnDate}
              onDayClick={(date) => {
                setAnchor(new Date(date.getFullYear(), date.getMonth(), date.getDate()))
                setView('day')
              }}
            />
          ) : (
            <DayView
              onBookingDrop={(payload, date, time, coachId) => { setDragMove({ ...payload, to_date: date, to_time: time, to_coach_id: coachId }); setDragMoveError('') }}
              crossAccountSessionIds={crossAccountSessionIds}
              blocks={blocks}
              date={anchor}
              coaches={coaches}
              getSessionAt={getSessionAt}
              isCoachAvailable={isCoachAvailable}
              onSlotClick={openBookModal}
              onSessionClick={openDetailModal}
              onBlockClick={(blk) => { setUnblockErr(''); setEditingBlock(false); setViewingBlock(blk) }}
            />
          )}
        </div>
      </div>

      {/* Drag Reschedule Confirm */}
      {dragMove && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
          onClick={(e) => { if (e.target === e.currentTarget && !dragMoving) setDragMove(null) }}>
          <div className="bg-[#1a2744] rounded-2xl w-full max-w-md shadow-2xl p-6">
            <h2 className="text-lg font-semibold mb-4" style={{ fontFamily: 'Playfair Display, serif' }}>Confirm Reschedule</h2>
            <div className="rounded-lg bg-[#111d38] p-4 mb-4 space-y-1.5">
              <p className="text-sm text-white font-medium">{dragMove.student_names} · {dragMove.course_name}</p>
              <p className="text-xs text-white/50">{dragMove.from_date} {formatTime12h(dragMove.from_time)} → {dragMove.to_date} {formatTime12h(dragMove.to_time)}</p>
              <p className="text-xs text-white/50">New coach: {(() => { const c = coaches.find(cc => cc.id === dragMove.to_coach_id); return c ? c.first_name + ' ' + c.last_name : '' })()}</p>
              <p className="text-xs text-white/40 pt-1">The whole session moves together; on confirm, reschedule notices are emailed to all affected parents. Credits carry over unchanged.</p>
            </div>
            {dragMoveError && <p className="text-xs text-red-300 mb-3">{dragMoveError}</p>}
            <div className="flex gap-3">
              <button onClick={confirmDragMove} disabled={dragMoving}
                className="flex-1 py-2.5 rounded-lg text-sm font-medium disabled:opacity-50"
                style={{ backgroundColor: '#c9a84c', color: '#1a2744' }}>
                {dragMoving ? 'Working...' : 'Confirm Reschedule'}
              </button>
              <button onClick={() => setDragMove(null)} disabled={dragMoving}
                className="flex-1 py-2.5 rounded-lg bg-white/10 hover:bg-white/15 text-sm text-white disabled:opacity-50">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Book Modal */}
      {modal === 'book' && selectedSlot && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setModal(null) }}>
          <div className="bg-[#1a2744] rounded-2xl w-full max-w-md shadow-2xl">
            <div className="p-6 border-b border-white/10 flex items-start justify-between">
              <div>
                <h2 className="text-lg font-semibold" style={{ fontFamily: 'Playfair Display, serif' }}>New Booking</h2>
                <p className="text-sm text-white/50 mt-1">
                  {new Date(selectedSlot.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', weekday: 'long' })}
                  {' · '}{formatTime(selectedSlot.time)}
                  {' · '}Coach {coaches.find(c => c.id === selectedSlot.coachId)?.first_name}
                </p>
              </div>
              <button onClick={() => setModal(null)} className="text-white/30 hover:text-white transition-colors text-2xl leading-none mt-1">×</button>
            </div>
            <div className="p-6 space-y-4">
              {trialUrl ? (
                <div className="space-y-3">
                  <p className="text-sm text-white/60">Payment link created — copy it and send it to the parent:</p>
                  <div className="flex gap-2">
                    <input readOnly value={trialUrl}
                      className="flex-1 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-xs"
                      onFocus={(e) => e.target.select()} />
                    <button onClick={() => {
                        navigator.clipboard.writeText(trialUrl)
                        setTrialCopied(true)
                        setTimeout(() => setTrialCopied(false), 1500)
                      }}
                      className="px-3 py-2 rounded-lg bg-[#c9a84c] text-[#0d1529] text-xs font-semibold min-w-[64px]">
                      {trialCopied ? 'Copied ✓' : 'Copy'}
                    </button>
                  </div>
                  <p className="text-xs text-white/30">The booking auto-confirms once payment completes; the slot is released automatically if the link expires.</p>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <button onClick={() => { setBookMode('single'); setRecurPreview(null) }}
                      className={`px-3 py-2 rounded-lg border text-sm transition-all ${bookMode === 'single' ? 'border-[#c9a84c] bg-[#c9a84c]/10 text-[#c9a84c]' : 'border-white/10 text-white/60 hover:border-white/30'}`}>
                      Single Booking
                    </button>
                    <button onClick={() => { setBookMode('recurring'); setIsTrial(false) }}
                      className={`px-3 py-2 rounded-lg border text-sm transition-all ${bookMode === 'recurring' ? 'border-[#c9a84c] bg-[#c9a84c]/10 text-[#c9a84c]' : 'border-white/10 text-white/60 hover:border-white/30'}`}>
                      Recurring (weekly, same time)
                    </button>
                    <button onClick={() => {
                        setBlockAllDay(false)
                        setBlockStart(selectedSlot.time)
                        setBlockEnd(minutesToTime(timeToMinutes(selectedSlot.time) + SLOT_MINUTES))
                        setBlockReason('')
                        setBlockError('')
                        setModal('block')
                      }}
                      className="col-span-2 px-3 py-2 rounded-lg border text-sm transition-all border-white/10 text-white/60 hover:border-red-400/50 hover:text-red-300">
                      🚫 Block this coach slot (not bookable by parents)
                    </button>
                  </div>
                  {bookMode === 'single' && <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg border border-white/10 bg-white/5">
                    <input type="checkbox" id="isTrialCheckbox" checked={isTrial}
                      onChange={(e) => {
                        const checked = e.target.checked
                        setIsTrial(checked)
                        if (checked) {
                          const trialCt = courseTypes.find(ct => ct.slug === '1on1')
                          if (trialCt) setFormCourse(trialCt.id)
                        }
                      }}
                      className="w-4 h-4" />
                    <label htmlFor="isTrialCheckbox" className="text-sm text-white/80 cursor-pointer">
                      Swim Assessment ({'$'}{TRIAL_PRICE_CENTS / 100}, 1-on-1 only, parent pays online)
                    </label>
                  </div>}
                  <div>
                    <label className="block text-sm text-white/60 mb-2">Course type</label>
                    <div className="grid grid-cols-2 gap-2">
                      {courseTypes.map(ct => (
                        <button key={ct.id}
                          onClick={() => { if (!isTrial) setFormCourse(ct.id) }}
                          disabled={isTrial && ct.slug !== '1on1'}
                          className={`px-3 py-2.5 rounded-lg border text-sm text-left transition-all ${
                            formCourse === ct.id
                              ? 'border-[#c9a84c] bg-[#c9a84c]/10 text-[#c9a84c]'
                              : 'border-white/10 text-white/60 hover:border-white/30 hover:text-white'
                          } ${isTrial && ct.slug !== '1on1' ? 'opacity-30 cursor-not-allowed' : ''}`}>
                          <span className="block font-medium">{ct.name}</span>
                          <span className="block text-xs opacity-60 mt-0.5">{ct.duration_minutes} min · up to {ct.max_students} students</span>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm text-white/60 mb-2">Select student</label>
                    <StudentSearch students={students} value={formStudent} onChange={setFormStudent} parentCreditsCache={parentCreditsCache} />
                {courseTypes.find(c => c.id === formCourse)?.slug === '1on2' && (
                  <div className="mt-2">
                    <label className="block text-sm text-white/60 mb-2">Select student 2</label>
                    <StudentSearch students={students.filter(s => s.id !== formStudent)} value={formStudent2} onChange={setFormStudent2} parentCreditsCache={parentCreditsCache} />
                  </div>
                )}
                    {isTrial && trialCreditStatus === 'available' && (
                      <p className="text-xs text-[#c9a84c] mt-2">✓ This student has a paid, unused single assessment — book directly, no extra payment needed</p>
                    )}
                    {isTrial && trialCreditStatus === 'active' && (
                      <p className="text-xs text-red-400 mt-2">This student already has an active single-lesson booking. Cancel it first to rebook.</p>
                    )}
                  </div>
                  {bookMode === 'recurring' && (
                    <div className="space-y-3">
                      <div className="flex items-center gap-3">
                        <label className="text-sm text-white/60">Sessions</label>
                        <input type="number" min={1} max={50} value={recurCount}
                          onChange={(e) => { setRecurCount(Math.max(1, Math.min(50, Number(e.target.value) || 1))); setRecurPreview(null) }}
                          className="w-20 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm" />
                        <button onClick={() => fetchRecurPreview(recurSkips)} disabled={recurLoading}
                          className="px-4 py-2 rounded-lg bg-white/10 border border-white/20 text-white text-sm hover:bg-white/15 disabled:opacity-50">
                          {recurLoading ? 'Calculating...' : 'Generate date preview'}
                        </button>
                      </div>
                      {recurPreview && (
                        <div className="border border-white/10 rounded-lg overflow-hidden">
                          <div className="max-h-56 overflow-y-auto divide-y divide-white/5">
                            {recurPreview.candidates.map((c, idx) => {
                              const label = c.status === 'ok' ? '✓ Available'
                                : c.status === 'past' ? 'Past'
                                : c.status === 'coach_time_off' ? 'Coach time off'
                                : c.status === 'conflict' ? 'Time conflict'
                                : c.status === 'full' ? 'Full'
                                : 'Skipped'
                              const okIndex = recurPreview.candidates.slice(0, idx + 1).filter(x => x.status === 'ok').length
                              return (
                                <div key={c.date} className="flex items-center justify-between px-3 py-2 text-sm">
                                  <span className={c.status === 'ok' ? 'text-white' : 'text-white/35'}>
                                    {c.status === 'ok' ? `Lesson ${okIndex} · ` : ''}
                                    {new Date(c.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', weekday: 'short' })}
                                  </span>
                                  <span className="flex items-center gap-2">
                                    <span className={`text-xs ${c.status === 'ok' ? 'text-green-400' : c.status === 'skipped' ? 'text-white/40' : 'text-amber-400'}`}>{label}</span>
                                    {(c.status === 'ok' || c.status === 'skipped') && (
                                      <button onClick={() => toggleRecurSkip(c.date)} disabled={recurLoading}
                                        className="text-xs px-2 py-1 rounded border border-white/15 text-white/50 hover:text-white hover:border-white/40">
                                        {c.status === 'skipped' ? 'Restore' : 'Skip'}
                                      </button>
                                    )}
                                  </span>
                                </div>
                              )
                            })}
                          </div>
                          <div className="px-3 py-2 bg-white/5 text-xs text-white/50 border-t border-white/10">
                            {(() => {
                              const cr = recurPreview.credits
                              const n1 = cr.parent1_name || 'Parent 1'
                              const n2 = cr.parent2_name || 'Parent 2'
                              const p1 = `${n1} has ${cr.parent1_remaining} left (needs ${cr.parent1_needed})`
                              const p2 = cr.parent2_needed != null ? ` · ${n2} has ${cr.parent2_remaining} left (needs ${cr.parent2_needed})` : ''
                              return (cr.sufficient ? '✓ ' : '⚠ Not enough credits · ') + p1 + p2
                            })()}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                  {(() => { const st = students.find(s => s.id === formStudent); return st && st.current_level == null && !isTrial ? (
                    <p className="text-amber-300 text-xs bg-amber-400/10 border border-amber-400/30 rounded-lg px-3 py-2">⚠️ This student has not completed the Swim Assessment (no level assigned). Admins may still book directly, but please confirm you want to schedule this lesson without an assessment.</p>
                  ) : null })()}
                  {error && <p className="text-red-400 text-sm bg-red-400/10 rounded-lg px-3 py-2">{error}</p>}
                  {success && <p className="text-green-400 text-sm bg-green-400/10 rounded-lg px-3 py-2">{success}</p>}
                </>
              )}
            </div>
            <div className="p-6 pt-0 flex gap-3">
              <button onClick={() => setModal(null)} className="flex-1 py-2.5 rounded-lg border border-white/20 text-white/60 hover:text-white transition-colors text-sm">
                {trialUrl ? 'Done' : 'Cancel'}
              </button>
              {!trialUrl && (
                <button
                  onClick={bookMode === 'recurring' ? handleRecurCommit : (isTrial ? (trialCreditStatus === 'available' ? handleTrialCreditBook : handleTrialBook) : handleBook)}
                  disabled={saving || trialSaving || (isTrial && trialCreditStatus === 'active') || (bookMode === 'recurring' && (!recurPreview || !recurPreview.credits.sufficient || recurLoading))}
                  className="flex-1 py-2.5 rounded-lg bg-[#c9a84c] text-[#0d1529] font-semibold hover:bg-[#d4b86a] transition-colors text-sm disabled:opacity-50">
                  {bookMode === 'recurring'
                    ? (saving ? 'Creating...' : recurPreview ? `Confirm ${recurPreview.candidates.filter(c => c.status === 'ok').length} lessons` : 'Generate the date preview first')
                    : isTrial
                    ? (trialCreditStatus === 'available'
                        ? (saving ? 'Creating...' : 'Use prepaid single lesson')
                        : (trialSaving ? 'Creating payment link...' : 'Create payment link'))
                    : (saving ? 'Creating...' : 'Confirm Booking')}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Block Modal */}
      {modal === 'block' && selectedSlot && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setModal(null) }}>
          <div className="bg-[#1a2744] rounded-2xl w-full max-w-md shadow-2xl">
            <div className="p-6 border-b border-white/10 flex items-start justify-between">
              <div>
                <h2 className="text-lg font-semibold" style={{ fontFamily: 'Playfair Display, serif' }}>Block Time Slot</h2>
                <p className="text-sm text-white/50 mt-1">
                  {new Date(selectedSlot.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', weekday: 'long' })}
                  {' · '}Coach {coaches.find(c => c.id === selectedSlot.coachId)?.first_name}
                </p>
              </div>
              <button onClick={() => setModal(null)} className="text-white/30 hover:text-white transition-colors text-2xl leading-none mt-1">×</button>
            </div>
            <div className="p-6 space-y-4">
              <label className="flex items-center gap-2 px-3 py-2.5 rounded-lg border border-white/10 bg-white/5 cursor-pointer">
                <input type="checkbox" checked={blockAllDay} onChange={e => setBlockAllDay(e.target.checked)} className="w-4 h-4" />
                <span className="text-sm text-white/80">Block all day</span>
              </label>
              {!blockAllDay && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm text-white/60 mb-2">Start</label>
                    <select value={blockStart}
                      onChange={e => {
                        const v = e.target.value
                        setBlockStart(v)
                        if (blockEnd <= v) setBlockEnd(minutesToTime(timeToMinutes(v) + SLOT_MINUTES))
                      }}
                      className="w-full bg-[#0d1529] border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#c9a84c]">
                      {TIME_SLOTS.map(t => (
                        <option key={t} value={t}>{formatTime(t)}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm text-white/60 mb-2">End</label>
                    <select value={blockEnd} onChange={e => setBlockEnd(e.target.value)}
                      className="w-full bg-[#0d1529] border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#c9a84c]">
                      {[...TIME_SLOTS.slice(1), minutesToTime(WORK_END * 60)].filter(t => t > blockStart).map(t => (
                        <option key={t} value={t}>{formatTime(t)}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
              <div>
                <label className="block text-sm text-white/60 mb-2">Reason (optional)</label>
                <textarea value={blockReason} onChange={e => setBlockReason(e.target.value)} rows={2}
                  placeholder="e.g. Facility maintenance, private event..."
                  className="w-full bg-[#0d1529] border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#c9a84c] resize-none placeholder-white/20" />
              </div>
              <p className="text-xs text-white/30">Once blocked, parents cannot book this window (booking page, cart, AI assistant). Existing confirmed lessons are unaffected; admins can still schedule manually.</p>
              {blockError && <p className="text-red-400 text-sm bg-red-400/10 rounded-lg px-3 py-2">{blockError}</p>}
            </div>
            <div className="p-6 pt-0 flex gap-3">
              <button onClick={() => setModal(null)} className="flex-1 py-2.5 rounded-lg border border-white/20 text-white/60 hover:text-white transition-colors text-sm">Cancel</button>
              <button onClick={handleCreateBlock} disabled={blockSaving}
                className="flex-1 py-2.5 rounded-lg font-semibold text-sm disabled:opacity-50"
                style={{ backgroundColor: '#ef4444', color: '#fff' }}>
                {blockSaving ? 'Blocking...' : 'Confirm Block'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {modal === 'detail' && selectedSession && (
        <DetailModal
          session={selectedSession}
          coaches={coaches}
          students={students}
          onClose={() => setModal(null)}
          supabase={supabase}
          onRefresh={loadSessions}
        />
      )}
      {viewingBlock && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
          onClick={() => { if (!unblocking) setViewingBlock(null) }}>
          <div className="bg-[#1a2744] rounded-2xl w-full max-w-sm shadow-2xl p-6 space-y-4" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-semibold" style={{ fontFamily: 'Playfair Display, serif' }}>
              {viewingBlock.block_type === 'admin_block' ? 'Blocked Slot' : 'Coach Time Off'}
            </h2>
            <div className="space-y-1 text-sm text-white/80">
              <p>{new Date(viewingBlock.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', weekday: 'long' })}</p>
              <p>{viewingBlock.start_time == null ? 'All day' : `${fmtBlk(viewingBlock.start_time)} – ${fmtBlk(viewingBlock.end_time || '')}`}</p>
              {viewingBlock.reason && <p className="text-white/60">Reason: {viewingBlock.reason}</p>}
            </div>
            {viewingBlock.block_type === 'admin_block' ? (
              editingBlock ? (
                <div className="space-y-3">
                  <label className="flex items-center gap-2 px-3 py-2.5 rounded-lg border border-white/10 bg-white/5 cursor-pointer">
                    <input type="checkbox" checked={editAllDay} onChange={e => setEditAllDay(e.target.checked)} className="w-4 h-4" />
                    <span className="text-sm text-white/80">Block all day</span>
                  </label>
                  {!editAllDay && (
                    <div className="grid grid-cols-2 gap-3">
                      <select value={editStart} onChange={e => { const v = e.target.value; setEditStart(v); if (editEnd <= v) setEditEnd(minutesToTime(timeToMinutes(v) + SLOT_MINUTES)) }}
                        className="w-full bg-[#0d1529] border border-white/10 rounded-lg px-3 py-2 text-white text-sm">
                        {TIME_SLOTS.map(t => <option key={t} value={t}>{formatTime(t)}</option>)}
                      </select>
                      <select value={editEnd} onChange={e => setEditEnd(e.target.value)}
                        className="w-full bg-[#0d1529] border border-white/10 rounded-lg px-3 py-2 text-white text-sm">
                        {[...TIME_SLOTS.slice(1), minutesToTime(WORK_END * 60)].filter(t => t > editStart).map(t => <option key={t} value={t}>{formatTime(t)}</option>)}
                      </select>
                    </div>
                  )}
                  <textarea value={editReason} onChange={e => setEditReason(e.target.value)} rows={2} placeholder="Reason (optional)"
                    className="w-full bg-[#0d1529] border border-white/10 rounded-lg px-3 py-2 text-white text-sm resize-none placeholder-white/20" />
                  {unblockErr && <p className="text-red-400 text-xs">{unblockErr}</p>}
                  <div className="flex gap-3">
                    <button onClick={() => { setEditingBlock(false); setUnblockErr('') }} disabled={savingBlock}
                      className="flex-1 py-2.5 rounded-lg border border-white/15 text-gray-300 hover:border-white/30 text-sm transition-all disabled:opacity-50">Back</button>
                    <button onClick={saveBlockEdit} disabled={savingBlock}
                      className="flex-1 py-2.5 rounded-lg text-sm font-semibold disabled:opacity-50 transition-all"
                      style={{ backgroundColor: '#c9a84c', color: '#1a2744' }}>{savingBlock ? 'Saving...' : 'Save Changes'}</button>
                  </div>
                </div>
              ) : (
              <>
                {unblockErr && <p className="text-red-400 text-xs">{unblockErr}</p>}
                <div className="flex gap-3">
                  <button onClick={() => setViewingBlock(null)} disabled={unblocking}
                    className="flex-1 py-2.5 rounded-lg border border-white/15 text-gray-300 hover:border-white/30 text-sm transition-all disabled:opacity-50">Close</button>
                  <button onClick={startEditBlock} disabled={unblocking}
                    className="flex-1 py-2.5 rounded-lg border border-[#c9a84c]/50 text-[#c9a84c] hover:bg-[#c9a84c]/10 text-sm transition-all disabled:opacity-50">Edit</button>
                  <button onClick={removeViewingBlock} disabled={unblocking}
                    className="flex-1 py-2.5 rounded-lg text-sm font-semibold disabled:opacity-50 transition-all"
                    style={{ backgroundColor: '#ef4444', color: '#fff' }}>{unblocking ? 'Removing...' : 'Remove Block'}</button>
                </div>
              </>
              )
            ) : (
              <>
                <p className="text-xs text-white/40">Coach time off is created by the coach; to adjust or remove it, use the Time Off page.</p>
                <button onClick={() => setViewingBlock(null)}
                  className="w-full py-2.5 rounded-lg border border-white/15 text-gray-300 hover:border-white/30 text-sm transition-all">Close</button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════
// Month View
// ══════════════════════════════════════════════════════════════════════
function MonthView({ dates, currentMonth, todayStr, getSessionsOnDate, onDayClick }: {
  dates: Date[]
  currentMonth: number
  todayStr: string
  getSessionsOnDate: (date: string) => Session[]
  onDayClick: (date: Date) => void
}) {
  return (
    <div>
      <div className="grid grid-cols-7 mb-1">
        {WEEKDAY_HEADERS.map(d => (
          <div key={d} className="text-center text-xs text-white/30 py-2 font-medium">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {dates.map(date => {
          const ds = toDateStr(date)
          const isToday = ds === todayStr
          const isCurrentMonth = date.getMonth() === currentMonth
          const daySessions = getSessionsOnDate(ds)
          return (
            <button key={ds} onClick={() => onDayClick(date)}
              className={`rounded-xl p-2 text-left transition-all hover:border-[#c9a84c]/50 hover:bg-[#c9a84c]/5 group border min-h-[90px] flex flex-col ${
                isToday ? 'border-[#c9a84c]/60 bg-[#c9a84c]/5'
                : isCurrentMonth ? 'border-white/8 bg-[#111d38]/40'
                : 'border-white/4 bg-transparent'
              }`}>
              <p className={`text-sm font-semibold mb-1 ${isToday ? 'text-[#c9a84c]' : isCurrentMonth ? 'text-white/80' : 'text-white/20'}`}>
                {date.getDate()}
              </p>
              <div className="flex-1 space-y-0.5">
                {daySessions.filter(s => s.enrolled_count > 0).slice(0, 3).map(s => {
                  const ct = Array.isArray(s.course_types) ? s.course_types[0] : s.course_types
                  const slug = ct?.slug || ''
                  const miniTrial = !!(s as any).bookings?.some((b: any) => b.is_trial)
                  return (
                    <div key={s.id} className="rounded px-1 py-0.5" style={{ backgroundColor: miniTrial ? '#c9a84c' : (COURSE_COLORS[slug] || '#6b7280') }}>
                      <div className="flex items-center justify-between">
                        <span className="text-[9px] font-medium" style={{ color: miniTrial ? '#1a2744' : '#ffffff' }}>{formatTime12h(s.start_time)}</span>
                      </div>
                      {(s as any).bookings && (s as any).bookings.filter((b: any) => b.status !== 'cancelled' && b.status !== 'pending_partner').map((b: any) => {
                        const st = Array.isArray(b.students) ? b.students[0] : b.students
                        return st ? <div key={b.id} className="text-[8px] truncate leading-tight" style={{ color: miniTrial ? 'rgba(26,39,68,0.85)' : 'rgba(255,255,255,0.9)' }}>{st.full_name}</div> : null
                      })}
                    </div>
                  )
                })}
                {daySessions.filter(s => s.enrolled_count > 0).length > 3 && <p className="text-[9px] text-white/30 pl-1">+{daySessions.filter(s => s.enrolled_count > 0).length - 3} more</p>}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════
// Day View
// ══════════════════════════════════════════════════════════════════════
function getNowMinutesInLA(): number {
  const parts = new Date().toLocaleTimeString('en-GB', { hour12: false, timeZone: 'America/Los_Angeles' }).split(':')
  return parseInt(parts[0]) * 60 + parseInt(parts[1])
}

function NowLine({ ds }: { ds: string }) {
  const [nowMin, setNowMin] = useState(getNowMinutesInLA)
  const lineRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const id = setInterval(() => setNowMin(getNowMinutesInLA()), 60 * 1000)
    return () => clearInterval(id)
  }, [])
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      lineRef.current?.scrollIntoView({ block: 'center', behavior: 'auto' })
    })
    return () => cancelAnimationFrame(raf)
  }, [ds])
  const todayLA = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' })
  if (ds !== todayLA) return null
  const startMin = WORK_START * 60
  const endMin = WORK_END * 60
  if (nowMin < startMin || nowMin >= endMin) return null
  const HEADER_PX = 56  // h-14
  const ROW_PX = 80     // min-h-20
  const top = HEADER_PX + ((nowMin - startMin) / SLOT_MINUTES) * ROW_PX
  const label = formatTime(minutesToTime(nowMin))
  return (
    <div ref={lineRef} className="absolute left-0 right-0 z-10 pointer-events-none" style={{ top: `${top}px` }}>
      <div className="relative flex items-center">
        <span className="absolute left-1 -translate-y-1/2 bg-[#c9a84c] text-[#0d1529] text-[9px] font-bold px-1 py-0.5 rounded leading-none">{label}</span>
        <div className="w-full border-t border-[#c9a84c]/70" style={{ marginLeft: '80px' }} />
      </div>
    </div>
  )
}

function DayView({ date, coaches, getSessionAt, isCoachAvailable, onSlotClick, onSessionClick, onBookingDrop, crossAccountSessionIds, blocks, onBlockClick }: {
  date: Date
  blocks: Block[]
  onBlockClick: (blk: Block) => void
  coaches: Coach[]
  getSessionAt: (date: string, time: string, coachId: string) => Session | null
  isCoachAvailable: (id: string, date: Date, time: string) => boolean
  onSlotClick: (date: string, time: string, coachId: string) => void
  onSessionClick: (s: Session) => void
  onBookingDrop: (payload: any, date: string, time: string, coachId: string) => void
  crossAccountSessionIds: Set<string>
}) {
  const ds = toDateStr(date)
  const [overKey, setOverKey] = useState<string | null>(null)
  const [zoneMap, setZoneMap] = useState<Record<string, any[] | null>>({})
  const [tierOrder, setTierOrder] = useState<string[]>([])
  useEffect(() => {
    let alive = true
    fetch(`/api/admin/zones/effective?date=${ds}`)
      .then(r => r.json())
      .then(d => { if (alive) { setZoneMap(d?.zones || {}); setTierOrder(d?.tierOrder || []) } })
      .catch(() => {})
    return () => { alive = false }
  }, [ds])
  return (
    <div className="relative">
      <NowLine ds={ds} />
      <div className="sticky top-0 z-20 bg-[#0d1529] border-b border-white/10">
        <div className="grid" style={{ gridTemplateColumns: `80px repeat(${coaches.length}, 1fr)` }}>
          <div className="h-14" />
          {coaches.map(coach => (
            <div key={coach.id} className="h-14 flex flex-col items-center justify-center border-l border-white/5">
              <span className="text-sm font-semibold text-white/80">{coach.first_name}</span>
              <span className="text-xs text-white/30">{coach.last_name}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="grid" style={{ gridTemplateColumns: `80px repeat(${coaches.length}, 1fr)` }}>
        {TIME_SLOTS.map(time => (
          <div key={time} className="contents">
            <div className="h-14 flex items-start justify-end pr-3 pt-1.5 text-xs text-white/25 border-t border-white/5">
              {time.endsWith(':00') ? formatTime(time) : ''}
            </div>
            {coaches.map(coach => {
              const session = getSessionAt(ds, time, coach.id)
              const available = isCoachAvailable(coach.id, date, time)
              const blk = blocks.find(b =>
                b.date === ds && b.coach_id === coach.id && (
                  b.start_time == null ||
                  (timeToMinutes(time) < timeToMinutes(String(b.end_time).slice(0, 5)) &&
                   timeToMinutes(time) + SLOT_MINUTES > timeToMinutes(String(b.start_time).slice(0, 5)))
                ))
              const blkLabelHere = blk && (blk.start_time == null ? time === TIME_SLOTS[0] : String(blk.start_time).slice(0, 5) === time)
              return (
                <div key={`${coach.id}-${time}`} className="min-h-20 border-t border-l border-white/5 relative">
                  {(() => {
                    const zr = zoneMap[coach.id]
                    if (!zr) return null
                    const m = timeToMinutes(time)
                    const z = zr.find((z: any) => timeToMinutes(String(z.start_time).slice(0, 5)) <= m && m < timeToMinutes(String(z.end_time).slice(0, 5)))
                    const fill = z ? zoneFill(z, tierOrder) : null
                    return fill ? <div className="absolute inset-0 pointer-events-none" style={{ backgroundColor: fill + '2b' }} /> : null
                  })()}
                  {session && session.enrolled_count > 0 ? (
                    <SessionChip session={session} onClick={() => onSessionClick(session)} isCrossAccount={crossAccountSessionIds.has(session.id)} shiftDown={!!(blk && blkLabelHere)} />
                  ) : available ? (
                    <button onClick={() => onSlotClick(ds, time, coach.id)}
                      onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setOverKey(`${coach.id}-${time}`) }}
                      onDragLeave={() => setOverKey(k => (k === `${coach.id}-${time}` ? null : k))}
                      onDrop={e => {
                        e.preventDefault(); setOverKey(null)
                        try {
                          const payload = JSON.parse(e.dataTransfer.getData('text/plain'))
                          if (payload && payload.session_id) onBookingDrop(payload, ds, time, coach.id)
                        } catch {}
                      }}
                      className={`absolute inset-0 transition-colors group flex items-center justify-center ${overKey === `${coach.id}-${time}` ? 'bg-[#c9a84c]/20 ring-2 ring-[#c9a84c] ring-inset' : 'hover:bg-[#c9a84c]/10'}`}>
                      <span className="hidden group-hover:flex items-center gap-1 text-xs text-[#c9a84c]">
                        <span className="text-base leading-none">+</span> Book
                      </span>
                    </button>
                  ) : (
                    <div className="absolute inset-0 bg-white/[0.015]" />
                  )}
                  {blk && (
                    <>
                      <div className="absolute inset-0 pointer-events-none z-[1]"
                        style={{ backgroundColor: 'rgba(148,163,184,0.13)', backdropFilter: 'saturate(0.6)' }} />
                      {blkLabelHere && (
                        <button onClick={(e) => { e.stopPropagation(); onBlockClick(blk) }}
                          className={`absolute top-1 left-1 right-1 px-1.5 py-1 rounded text-[10px] font-bold leading-tight text-left whitespace-normal break-words pointer-events-auto border cursor-pointer transition-all hover:brightness-125 z-[6]`}
                          style={{
                            backgroundColor: blk.block_type === 'admin_block' ? 'rgba(70,18,18,0.94)' : 'rgba(35,42,60,0.94)',
                            color: blk.block_type === 'admin_block' ? '#f87171' : 'rgba(255,255,255,0.8)',
                            borderColor: blk.block_type === 'admin_block' ? 'rgba(248,113,113,0.5)' : 'rgba(255,255,255,0.3)',
                          }}>
                          {blk.block_type === 'admin_block' ? '🚫 Blocked' : 'Time off'}{blk.start_time == null ? ' (all day)' : ''}{blk.reason ? ` · ${blk.reason}` : ''}
                        </button>
                      )}
                    </>
                  )}
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════
// Session Chip
// ══════════════════════════════════════════════════════════════════════
function SessionChip({ session, onClick, isCrossAccount, shiftDown }: { session: Session; onClick: () => void; isCrossAccount?: boolean; shiftDown?: boolean }) {
  if (session.enrolled_count === 0) return null
  const ct = getSessionCourseType(session)
  const colorClass = COURSE_COLORS[ct.slug] || '#6b7280'
  const isFull = session.enrolled_count >= session.max_students
  const hasTrial = !!session.bookings?.some(b => b.is_trial)
  const isSingleLesson = !hasTrial && session.bookings?.some(b => b.lesson_credit_id === null)
  const is1on2 = ct.slug === '1on2'
  const activeBookings = session.bookings?.filter(b => b.status !== 'cancelled' && b.status !== 'pending_partner') || []
  const dragOk = activeBookings.length >= 1 && activeBookings.every(b => b.status === 'confirmed' || b.status === 'pending_payment')

  return (
    <>
      <button onClick={onClick}
        draggable={dragOk}
        onDragStart={e => {
          if (!dragOk) return
          const names = activeBookings.map(b => {
            const st = Array.isArray(b.students) ? b.students[0] : b.students
            return st?.full_name || ''
          }).filter(Boolean).join(', ')
          e.dataTransfer.setData('text/plain', JSON.stringify({
            session_id: session.id,
            student_names: names,
            from_date: session.session_date,
            from_time: session.start_time,
            course_name: hasTrial ? 'Swim Assessment' : ct.name,
          }))
          e.dataTransfer.effectAllowed = 'move'
        }}
        className={`absolute left-0.5 right-0.5 bottom-0.5 z-[2] ${shiftDown ? 'top-8' : 'top-0.5'} rounded flex flex-col items-start justify-start p-1.5 overflow-hidden ${isFull ? 'opacity-50' : ''} ${dragOk ? 'cursor-grab active:cursor-grabbing' : ''}`}
        style={{ backgroundColor: hasTrial ? '#c9a84c' : colorClass }}>
        <span className="text-sm font-bold leading-tight truncate w-full text-left" style={{ color: hasTrial ? '#1a2744' : '#ffffff' }}>{hasTrial ? 'Swim Assessment' : ct.name}</span>
        {session.bookings && session.bookings.filter(b => b.status !== 'cancelled' && b.status !== 'pending_partner').map(b => {
          const st = Array.isArray(b.students) ? b.students[0] : b.students
          const pa = Array.isArray(b.parents) ? b.parents[0] : b.parents
          return st ? (
            <span key={b.id} className="text-sm font-semibold truncate w-full leading-tight block text-left" style={{ color: hasTrial ? 'rgba(26,39,68,0.85)' : 'rgba(255,255,255,0.9)' }}>
              -{pa ? `${pa.first_name} ${pa.last_name}` : ''} ({st.full_name})
            </span>
          ) : null
        })}
      </button>
      {isCrossAccount && (
        <span className="absolute top-0.5 right-0.5 px-1 py-0.5 rounded text-[9px] font-bold leading-none pointer-events-none z-10"
          style={{ backgroundColor: '#6366f1', color: '#fff' }}>
          Linked
        </span>
      )}
      {isSingleLesson && (
        <span className="absolute top-0.5 right-0.5 px-1 py-0.5 rounded text-[9px] font-bold leading-none pointer-events-none"
          style={{ backgroundColor: '#c9a84c', color: '#1a2744' }}>
          Single
        </span>
      )}
    </>
  )
}

// ══════════════════════════════════════════════════════════════════════
// Detail Modal
// ══════════════════════════════════════════════════════════════════════
function DetailModal({ session, coaches, students, onClose, supabase, onRefresh }: {
  session: Session
  coaches: Coach[]
  students: any[]
  onClose: () => void
  supabase: ReturnType<typeof createClient>
  onRefresh: () => void
}) {
  const [bookings, setBookings] = useState<any[]>([])
  const [cancelling, setCancelling] = useState(false)
  const [confirmingCancel, setConfirmingCancel] = useState(false)
  const [showReschedule, setShowReschedule] = useState(false)
  const [newCoachId, setNewCoachId] = useState('')
  const [newDate, setNewDate] = useState('')
  const [newTime, setNewTime] = useState('')
  const [rescheduling, setRescheduling] = useState(false)
  const [rescheduleError, setRescheduleError] = useState('')
  const [addQuery, setAddQuery] = useState('')
  const [adding, setAdding] = useState<string | null>(null)
  const [addError, setAddError] = useState('')
  const [confirmAddId, setConfirmAddId] = useState<string | null>(null)
  const [bookingsLoaded, setBookingsLoaded] = useState(false)
  const [band, setBand] = useState<{ min: number; max: number } | null>(null)

  async function addStudent(studentId: string) {
    setAdding(studentId); setAddError(''); setConfirmAddId(null)
    const res = await fetch('/api/admin/bookings/bulk-create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'commit', coach_id: session.coach_id, course_type_id: session.course_type_id, start_time: session.start_time, student_id: studentId, dates: [session.session_date] }),
    })
    const data = await res.json().catch(() => ({}))
    setAdding(null)
    if (!res.ok) { setAddError(data.error || 'Add failed'); return }
    setAddQuery('')
    fetch(`/api/admin/session-bookings?session_id=${session.id}`).then(r => r.json()).then(d => setBookings(Array.isArray(d) ? d : []))
    onRefresh()
  }

  async function submitReschedule() {
    if (!showReschedule || !newCoachId || !newDate || !newTime) return
    setRescheduling(true); setRescheduleError('')
    const res = await fetch('/api/admin/bookings/move-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: session.id, coach_id: newCoachId, date: newDate, time: newTime }),
    })
    const data = await res.json()
    setRescheduling(false)
    if (!res.ok) { setRescheduleError(data.error || 'Reschedule failed'); return }
    onRefresh(); onClose()
  }
  const ct = getSessionCourseType(session)
  const coach = coaches.find(c => c.id === session.coach_id)
  const modalHasTrial = bookings.some((b: any) => b.is_trial)
  const liveCount = bookingsLoaded ? bookings.length : session.enrolled_count

  useEffect(() => {
    fetch(`/api/admin/session-bookings?session_id=${session.id}`)
      .then(r => r.json())
      .then(data => { setBookings(Array.isArray(data) ? data : []); setBookingsLoaded(true) })
  }, [session.id]) // eslint-disable-line

  useEffect(() => {
    if (ct.slug !== '1on4') return
    fetch(`/api/admin/zones/band?coach_id=${session.coach_id}&date=${session.session_date}&start=${session.start_time}&end=${session.end_time}`)
      .then(r => r.json())
      .then(d => setBand(d?.band ?? null))
      .catch(() => {})
  }, [session.id]) // eslint-disable-line

  async function cancelSession() {
    setCancelling(true)
    await fetch('/api/admin/cancel-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: session.id }),
    })
    onRefresh()
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-[#1a2744] rounded-2xl w-full max-w-md shadow-2xl">
        <div className="p-6 border-b border-white/10 flex items-start justify-between">
          <div>
            <div className="inline-block px-2 py-0.5 rounded-full text-xs font-medium mb-2" style={{ backgroundColor: modalHasTrial ? '#c9a84c' : (COURSE_COLORS[ct.slug] || '#6b7280'), color: modalHasTrial ? '#1a2744' : '#ffffff' }}>
              {modalHasTrial ? 'Swim Assessment' : ct.name}
            </div>
            <p className="text-white font-medium">
              {new Date(session.session_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', weekday: 'long' })}
            </p>
            <p className="text-sm text-white/50 mt-0.5">
              {formatTime(session.start_time)} – {formatTime(session.end_time)}
              {' · '}Coach {coach?.first_name} {coach?.last_name}
            </p>
          </div>
          <button onClick={onClose} className="text-white/30 hover:text-white transition-colors text-2xl leading-none mt-1">×</button>
        </div>
        <div className="p-6">
          <p className="text-xs text-white/40 uppercase tracking-wider mb-3">
            Booked students ({liveCount}/{session.max_students})
          </p>
          {bookings.length === 0 ? (
            <p className="text-sm text-white/30 italic">No students booked yet</p>
          ) : (
            <div className="space-y-2">
              {bookings.map(b => {
                const student = Array.isArray(b.students) ? b.students[0] : b.students
                const parent  = Array.isArray(b.parents)  ? b.parents[0]  : b.parents
                return (
                  <div key={b.id} className="bg-[#111d38] rounded-lg px-3 py-2.5">
                    <div className="flex items-center justify-between">
                    <span className="text-sm text-white font-medium flex items-center gap-1.5">
                      {student?.full_name}
                      {b.is_trial && (
                        <span className="px-1 py-0.5 rounded text-[9px] font-bold leading-none" style={{ backgroundColor: '#c9a84c', color: '#1a2744' }}>Assessment</span>
                      )}
                      {b.lesson_credit_id === null && !b.is_trial && (
                        <span className="px-1 py-0.5 rounded text-[9px] font-bold leading-none" style={{ backgroundColor: '#c9a84c', color: '#1a2744' }}>Single</span>
                      )}
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="text-xs text-white/40">Lv.{student?.current_level} · {parent?.first_name} {parent?.last_name}</span>

                    </span>
                    </div>
                    {student?.id && (
                      <div className="mt-2">
                        <StudentNotesPanel studentId={student.id} collapsible />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
          {liveCount < session.max_students && (
            <div className="mt-4 pt-4 border-t border-white/10">
              <p className="text-xs text-white/40 uppercase tracking-wider mb-2">Add student</p>
              <input value={addQuery} onChange={e => { setAddQuery(e.target.value); setAddError(''); setConfirmAddId(null) }} placeholder="Search by student or parent name..."
                className="w-full bg-[#111d38] text-white text-sm rounded-lg px-3 py-2 border border-white/10" />
              {addError && <p className="text-xs text-red-300 mt-2">{addError}</p>}
              {addQuery.trim().length >= 1 && (
                <div className="mt-2 space-y-1 max-h-40 overflow-y-auto">
                  {(() => {
                    const bookedNames = new Set(bookings.map((b: any) => { const st = Array.isArray(b.students) ? b.students[0] : b.students; return st?.full_name }))
                    const q = addQuery.toLowerCase()
                    const matches = students.filter((s: any) => {
                      const par = Array.isArray(s.parents) ? s.parents[0] : s.parents
                      return !bookedNames.has(s.full_name) && (s.full_name.toLowerCase().includes(q) || ((par?.first_name + ' ' + par?.last_name).toLowerCase().includes(q)))
                    }).slice(0, 6)
                    if (matches.length === 0) return <p className="text-xs text-white/30 italic">No matching students</p>
                    return matches.map((s: any) => {
                      const par = Array.isArray(s.parents) ? s.parents[0] : s.parents
                      return (
                        <div key={s.id} className="flex items-center justify-between bg-[#111d38] rounded-lg px-3 py-2">
                          <span className="text-sm text-white">{s.full_name} <span className="text-xs text-white/40">Lv.{s.current_level ?? '—'} · {par?.first_name} {par?.last_name}</span>{band && s.current_level != null && (Number(s.current_level) < band.min || Number(s.current_level) > band.max) && <span className="text-xs ml-1.5 font-medium" style={{ color: '#fb923c' }}>⚠ L{band.min}–{band.max} class</span>}</span>
                          <button onClick={() => confirmAddId === s.id ? addStudent(s.id) : setConfirmAddId(s.id)} disabled={adding !== null}
                            className="px-2.5 py-1 rounded-lg text-xs font-medium disabled:opacity-50"
                            style={confirmAddId === s.id ? { backgroundColor: '#e05a4a', color: '#fff' } : { backgroundColor: '#c9a84c', color: '#1a2744' }}>
                            {adding === s.id ? '...' : confirmAddId === s.id ? 'Confirm?' : 'Add'}
                          </button>
                        </div>
                      )
                    })
                  })()}
                </div>
              )}
            </div>
          )}
        </div>
        {showReschedule ? (
          <div className="p-6 pt-0">
            <div className="rounded-lg border border-white/15 bg-white/5 p-4 mb-3 space-y-3">
              <p className="text-sm text-white font-medium">Rescheduling this lesson ({bookings.length} student{bookings.length === 1 ? '' : 's'})</p>
              <select value={newCoachId} onChange={e => setNewCoachId(e.target.value)}
                className="w-full bg-[#111d38] text-white text-sm rounded-lg px-3 py-2 border border-white/10">
                {coaches.map(c => <option key={c.id} value={c.id}>{c.first_name} {c.last_name}</option>)}
              </select>
              <input type="date" value={newDate} onChange={e => setNewDate(e.target.value)}
                className="w-full bg-[#111d38] text-white text-sm rounded-lg px-3 py-2 border border-white/10" style={{ colorScheme: 'dark' }} />
              <select value={newTime} onChange={e => setNewTime(e.target.value)}
                className="w-full bg-[#111d38] text-white text-sm rounded-lg px-3 py-2 border border-white/10">
                {TIME_SLOTS.map(t => <option key={t} value={t}>{formatTime(t)}</option>)}
              </select>
              {rescheduleError && <p className="text-xs text-red-300">{rescheduleError}</p>}
              <p className="text-xs text-white/40">The whole session moves together — all booked students stay paired. Reschedule notices will be emailed to all affected parents; credits carry over unchanged.</p>
            </div>
            <div className="flex gap-3">
              <button onClick={submitReschedule} disabled={rescheduling}
                className="flex-1 py-2.5 rounded-lg text-sm font-medium disabled:opacity-50 transition-colors"
                style={{ backgroundColor: '#c9a84c', color: '#1a2744' }}>
                {rescheduling ? 'Working...' : 'Confirm Reschedule'}
              </button>
              <button onClick={() => { setShowReschedule(false); setRescheduleError('') }} disabled={rescheduling}
                className="flex-1 py-2.5 rounded-lg bg-white/10 hover:bg-white/15 transition-colors text-sm text-white disabled:opacity-50">
                Back
              </button>
            </div>
          </div>
        ) : confirmingCancel ? (
          <div className="p-6 pt-0">
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 mb-3">
              <p className="text-sm text-red-300 font-medium">Cancel this lesson?</p>
              <p className="text-xs text-red-300/70 mt-1">All bookings in this session will be cancelled together, credits or tokens will be returned, and cancellation notices will be emailed to the parents.</p>
            </div>
            <div className="flex gap-3">
              <button onClick={cancelSession} disabled={cancelling}
                className="flex-1 py-2.5 rounded-lg bg-red-500/80 hover:bg-red-500 transition-colors text-sm text-white font-medium disabled:opacity-50">
                {cancelling ? 'Cancelling...' : 'Yes, Cancel'}
              </button>
              <button onClick={() => setConfirmingCancel(false)} disabled={cancelling}
                className="flex-1 py-2.5 rounded-lg bg-white/10 hover:bg-white/15 transition-colors text-sm text-white disabled:opacity-50">
                Back
              </button>
            </div>
          </div>
        ) : (
          <div className="p-6 pt-0 flex gap-3">
            <button onClick={() => setConfirmingCancel(true)}
              className="flex-1 py-2.5 rounded-lg border border-red-500/40 text-red-400 hover:bg-red-500/10 transition-colors text-sm">
              Cancel this lesson
            </button>
            {bookings.length > 0 && (
              <button onClick={() => { setShowReschedule(true); setNewCoachId(session.coach_id); setNewDate(session.session_date); setNewTime((session.start_time || '').slice(0, 5)); setRescheduleError('') }}
                className="flex-1 py-2.5 rounded-lg border border-[#c9a84c]/50 text-[#c9a84c] hover:bg-[#c9a84c]/10 transition-colors text-sm">
                Reschedule this lesson
              </button>
            )}
            <button onClick={onClose} className="flex-1 py-2.5 rounded-lg bg-white/10 hover:bg-white/15 transition-colors text-sm text-white">
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
