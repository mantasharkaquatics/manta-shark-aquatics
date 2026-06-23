'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'

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
  bookings?: { id: string; parent_id: string; lesson_credit_id: string | null; status: string; students?: { full_name: string } | { full_name: string }[] | null; parents?: { first_name: string; last_name: string } | { first_name: string; last_name: string }[] | null }[]
}

interface BookingSlot {
  date: string
  time: string
  coachId: string
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

const WEEKDAY_HEADERS = ['日', '一', '二', '三', '四', '五', '六']
const MONTH_NAMES = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月']

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
        回到今天
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
          placeholder="輸入學生姓名、家長姓名或 email..."
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
                <span className="text-xs text-white/30 ml-2 flex-shrink-0">Lv.{s.current_level}</span>
                {(() => { const p = Array.isArray(s.parents) ? s.parents[0] : s.parents; const rem = p?.id ? parentCreditsCache[p.id] : undefined; return rem !== undefined ? <span className="text-xs text-white/50 ml-1">· {rem} 堂</span> : null })()}
              </button>
            )
          })}
        </div>
      )}
      {open && query.trim().length >= 1 && filtered.length === 0 && (
        <div className="absolute z-50 top-full mt-1 w-full bg-[#1a2744] border border-white/10 rounded-xl shadow-2xl px-3 py-3">
          <p className="text-sm text-white/30 text-center">找不到符合的學生</p>
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
  const [modal, setModal] = useState<'book' | 'detail' | null>(null)
  const [selectedSlot, setSelectedSlot] = useState<BookingSlot | null>(null)
  const [selectedSession, setSelectedSession] = useState<Session | null>(null)
  const [formStudent, setFormStudent] = useState('')
  const [formStudent2, setFormStudent2] = useState('')
  const [formCourse, setFormCourse] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [parentCreditsCache, setParentCreditsCache] = useState<Record<string, number>>({})
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
