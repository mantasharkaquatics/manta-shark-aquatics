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
  bookings?: { id: string; students?: { full_name: string } | { full_name: string }[] | null; parents?: { first_name: string; last_name: string } | { first_name: string; last_name: string }[] | null }[]
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
  '1on1': 'bg-[#1d4ed8] hover:bg-[#3b82f6]',
  '1on2': 'bg-[#6d28d9] hover:bg-[#a78bfa]',
  '1on4': 'bg-[#15803d] hover:bg-[#4ade80]',
  'team': 'bg-[#b45309] hover:bg-[#fbbf24]',
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
function StudentSearch({ students, value, onChange }: {
  students: Student[]
  value: string
  onChange: (id: string) => void
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
  const [formCourse, setFormCourse] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const monthDates = getMonthDates(anchor)

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
      .select('id, coach_id, session_date, start_time, end_time, max_students, enrolled_count, status, course_type_id, course_types(name, slug, duration_minutes), bookings(id, students(full_name), parents(first_name, last_name))')
      .gte('session_date', from)
      .lte('session_date', to)
      .neq('status', 'cancelled')
      .order('session_date')
      .order('start_time')
    if (data) setSessions(data as Session[])
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

  function openBookModal(date: string, time: string, coachId: string) {
    setSelectedSlot({ date, time, coachId })
    setFormStudent('')
    setFormCourse(courseTypes[0]?.id || '')
    setError('')
    setSuccess('')
    setModal('book')
  }

  function openDetailModal(session: Session) {
    setSelectedSession(session)
    setModal('detail')
  }

  async function handleBook() {
    if (!formStudent || !formCourse || !selectedSlot) {
      setError('請選擇學生和課程類型')
      return
    }
    setSaving(true)
    setError('')
    const ct = courseTypes.find(c => c.id === formCourse)!
    const endMins = timeToMinutes(selectedSlot.time) + ct.duration_minutes
    const endTime = minutesToTime(endMins)

    const { data: sess, error: sessErr } = await supabase
      .from('class_sessions')
      .insert({
        coach_id: selectedSlot.coachId,
        course_type_id: formCourse,
        session_date: selectedSlot.date,
        start_time: selectedSlot.time,
        end_time: endTime,
        max_students: ct.max_students,
        enrolled_count: 1,
        status: 'open',
      })
      .select()
      .single()

    if (sessErr || !sess) {
      setError('建立課程失敗：' + (sessErr?.message || '未知錯誤'))
      setSaving(false)
      return
    }

    const student = students.find(s => s.id === formStudent)!
    const parentId = student.parent_id

    const { data: credits } = await supabase
      .from('lesson_credits')
      .select('id, used_credits, total_credits')
      .eq('student_id', formStudent)
      .eq('course_type_id', formCourse)
      .order('expires_at', { ascending: true })

    const validCredit = credits?.find(c => c.used_credits < c.total_credits)

    const { error: bookErr } = await supabase
      .from('bookings')
      .insert({
        class_session_id: sess.id,
        parent_id: parentId,
        student_id: formStudent,
        lesson_credit_id: validCredit?.id || null,
        status: 'confirmed',
      })

    if (bookErr) {
      setError('建立預約失敗：' + bookErr.message)
      setSaving(false)
      return
    }

    if (validCredit) {
      await supabase
        .from('lesson_credits')
        .update({ used_credits: validCredit.used_credits + 1 })
        .eq('id', validCredit.id)
    }

    // 寄送預約確認 email
    try {
      const { data: parentData } = await supabase.from('parents').select('first_name, email').eq('id', parentId).single()
      const coach = coaches.find(c => c.id === selectedSlot.coachId)
      if (parentData && coach) {
        const endMinsForEmail = timeToMinutes(selectedSlot.time) + ct.duration_minutes
        const endTimeForEmail = minutesToTime(endMinsForEmail)
        await fetch('/api/email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'booking_confirmed',
            to: parentData.email,
            parentName: parentData.first_name,
            studentName: student.full_name,
            courseName: ct.name,
            coachName: `${coach.first_name} ${coach.last_name}`,
            date: selectedSlot.date,
            time: `${selectedSlot.time} – ${endTimeForEmail}`,
          }),
        })
      }
    } catch (e) { console.error('Email error:', e) }

    setSuccess('預約成功！')
    await loadSessions()
    setTimeout(() => { setModal(null); setSuccess('') }, 1500)
    setSaving(false)
  }

  function getSessionAt(date: string, time: string, coachId: string): Session | null {
    return sessions.find(s =>
      s.session_date === date &&
      s.coach_id === coachId &&
      s.start_time.slice(0, 5) === time
    ) || null
  }

  function getSessionsOnDate(date: string): Session[] {
    return sessions.filter(s => s.session_date === date)
  }

  const todayStr = toDateStr(new Date())
  const currentMonth = anchor.getMonth()

  const headerLabel = view === 'month'
    ? `${anchor.getFullYear()} ${MONTH_NAMES[anchor.getMonth()]}`
    : anchor.toLocaleDateString('zh-TW', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })

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
                {v === 'month' ? '月' : '日'}
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
            >今天</button>
          </div>
          {loading && <span className="text-xs text-white/40 animate-pulse">載入中...</span>}
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
              date={anchor}
              coaches={coaches}
              getSessionAt={getSessionAt}
              isCoachAvailable={isCoachAvailable}
              onSlotClick={openBookModal}
              onSessionClick={openDetailModal}
            />
          )}
        </div>
      </div>

      {/* Book Modal */}
      {modal === 'book' && selectedSlot && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setModal(null) }}>
          <div className="bg-[#1a2744] rounded-2xl w-full max-w-md shadow-2xl">
            <div className="p-6 border-b border-white/10 flex items-start justify-between">
              <div>
                <h2 className="text-lg font-semibold" style={{ fontFamily: 'Playfair Display, serif' }}>新增預約</h2>
                <p className="text-sm text-white/50 mt-1">
                  {new Date(selectedSlot.date + 'T12:00:00').toLocaleDateString('zh-TW', { month: 'long', day: 'numeric', weekday: 'long' })}
                  {' · '}{formatTime(selectedSlot.time)}
                  {' · '}Coach {coaches.find(c => c.id === selectedSlot.coachId)?.first_name}
                </p>
              </div>
              <button onClick={() => setModal(null)} className="text-white/30 hover:text-white transition-colors text-2xl leading-none mt-1">×</button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm text-white/60 mb-2">課程類型</label>
                <div className="grid grid-cols-2 gap-2">
                  {courseTypes.map(ct => (
                    <button key={ct.id} onClick={() => setFormCourse(ct.id)}
                      className={`px-3 py-2.5 rounded-lg border text-sm text-left transition-all ${
                        formCourse === ct.id
                          ? 'border-[#c9a84c] bg-[#c9a84c]/10 text-[#c9a84c]'
                          : 'border-white/10 text-white/60 hover:border-white/30 hover:text-white'
                      }`}>
                      <span className="block font-medium">{ct.name}</span>
                      <span className="block text-xs opacity-60 mt-0.5">{ct.duration_minutes} 分鐘 · 最多 {ct.max_students} 人</span>
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm text-white/60 mb-2">選擇學生</label>
                <StudentSearch students={students} value={formStudent} onChange={setFormStudent} />
              </div>
              {error && <p className="text-red-400 text-sm bg-red-400/10 rounded-lg px-3 py-2">{error}</p>}
              {success && <p className="text-green-400 text-sm bg-green-400/10 rounded-lg px-3 py-2">{success}</p>}
            </div>
            <div className="p-6 pt-0 flex gap-3">
              <button onClick={() => setModal(null)} className="flex-1 py-2.5 rounded-lg border border-white/20 text-white/60 hover:text-white transition-colors text-sm">取消</button>
              <button onClick={handleBook} disabled={saving}
                className="flex-1 py-2.5 rounded-lg bg-[#c9a84c] text-[#0d1529] font-semibold hover:bg-[#d4b86a] transition-colors text-sm disabled:opacity-50">
                {saving ? '建立中...' : '確認預約'}
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
          onClose={() => setModal(null)}
          supabase={supabase}
          onRefresh={loadSessions}
        />
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
                  return (
                    <div key={s.id} className={`${COURSE_COLORS[slug] || 'bg-gray-500'} rounded px-1 py-0.5`}>
                      <div className="flex items-center justify-between">
                        <span className="text-[9px] text-white font-medium">{s.start_time.slice(0, 5)}</span>
                        <span className="text-[9px] text-white/70 ml-1">{s.enrolled_count}/{s.max_students}</span>
                      </div>
                      {(s as any).bookings && (s as any).bookings.map((b: any) => {
                        const st = Array.isArray(b.students) ? b.students[0] : b.students
                        return st ? <div key={b.id} className="text-[8px] text-white/90 truncate leading-tight">{st.full_name}</div> : null
                      })}
                    </div>
                  )
                })}
                {daySessions.filter(s => s.enrolled_count > 0).length > 3 && <p className="text-[9px] text-white/30 pl-1">+{daySessions.filter(s => s.enrolled_count > 0).length - 3} 更多</p>}
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
function DayView({ date, coaches, getSessionAt, isCoachAvailable, onSlotClick, onSessionClick }: {
  date: Date
  coaches: Coach[]
  getSessionAt: (date: string, time: string, coachId: string) => Session | null
  isCoachAvailable: (id: string, date: Date, time: string) => boolean
  onSlotClick: (date: string, time: string, coachId: string) => void
  onSessionClick: (s: Session) => void
}) {
  const ds = toDateStr(date)
  return (
    <div className="relative">
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
              return (
                <div key={`${coach.id}-${time}`} className="h-14 border-t border-l border-white/5 relative">
                  {session ? (
                    <SessionChip session={session} onClick={() => onSessionClick(session)} />
                  ) : available ? (
                    <button onClick={() => onSlotClick(ds, time, coach.id)}
                      className="absolute inset-0 hover:bg-[#c9a84c]/10 transition-colors group flex items-center justify-center">
                      <span className="hidden group-hover:flex items-center gap-1 text-xs text-[#c9a84c]">
                        <span className="text-base leading-none">+</span> 預約
                      </span>
                    </button>
                  ) : (
                    <div className="absolute inset-0 bg-white/[0.015]" />
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
function SessionChip({ session, onClick }: { session: Session; onClick: () => void }) {
  if (session.enrolled_count === 0) return null
  const ct = getSessionCourseType(session)
  const colorClass = COURSE_COLORS[ct.slug] || 'bg-gray-500'
  const isFull = session.enrolled_count >= session.max_students
  return (
    <button onClick={onClick}
      className={`absolute inset-0.5 rounded ${colorClass} ${isFull ? 'opacity-50' : 'opacity-100'} flex flex-col items-start justify-start p-1.5 overflow-hidden`}>
      <span className="text-xs font-semibold text-white leading-tight truncate w-full">{ct.name}</span>
      <span className="text-[11px] text-white/80">{session.enrolled_count}/{session.max_students}</span>
      {session.bookings && session.bookings.map(b => {
        const st = Array.isArray(b.students) ? b.students[0] : b.students
        const pa = Array.isArray(b.parents) ? b.parents[0] : b.parents
        return st ? (
          <span key={b.id} className="text-[11px] text-white/90 truncate w-full leading-tight block">
            {pa ? `${pa.first_name} ${pa.last_name}` : ''} · {st.full_name}
          </span>
        ) : null
      })}
    </button>
  )
}

// ══════════════════════════════════════════════════════════════════════
// Detail Modal
// ══════════════════════════════════════════════════════════════════════
function DetailModal({ session, coaches, onClose, supabase, onRefresh }: {
  session: Session
  coaches: Coach[]
  onClose: () => void
  supabase: ReturnType<typeof createClient>
  onRefresh: () => void
}) {
  const [bookings, setBookings] = useState<any[]>([])
  const [cancelling, setCancelling] = useState(false)
  const ct = getSessionCourseType(session)
  const coach = coaches.find(c => c.id === session.coach_id)

  useEffect(() => {
    supabase
      .from('bookings')
      .select('id, status, students(full_name, current_level), parents(first_name, last_name)')
      .eq('class_session_id', session.id)
      .neq('status', 'cancelled')
      .then(({ data }) => setBookings(data || []))
  }, [session.id]) // eslint-disable-line

  async function cancelSession() {
    if (!confirm('確定要取消這堂課？所有預約都會一起取消。')) return
    setCancelling(true)
    await supabase.from('class_sessions').update({ status: 'cancelled' }).eq('id', session.id)
    await supabase.from('bookings').update({ status: 'cancelled' }).eq('class_session_id', session.id)
    onRefresh()
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-[#1a2744] rounded-2xl w-full max-w-md shadow-2xl">
        <div className="p-6 border-b border-white/10 flex items-start justify-between">
          <div>
            <div className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium mb-2 ${COURSE_COLORS[ct.slug] || 'bg-gray-500'} text-white`}>
              {ct.name}
            </div>
            <p className="text-white font-medium">
              {new Date(session.session_date + 'T12:00:00').toLocaleDateString('zh-TW', { month: 'long', day: 'numeric', weekday: 'long' })}
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
            已預約學生 ({session.enrolled_count}/{session.max_students})
          </p>
          {bookings.length === 0 ? (
            <p className="text-sm text-white/30 italic">尚無學生預約</p>
          ) : (
            <div className="space-y-2">
              {bookings.map(b => {
                const student = Array.isArray(b.students) ? b.students[0] : b.students
                const parent  = Array.isArray(b.parents)  ? b.parents[0]  : b.parents
                return (
                  <div key={b.id} className="flex items-center justify-between bg-[#111d38] rounded-lg px-3 py-2.5">
                    <span className="text-sm text-white font-medium">{student?.full_name}</span>
                    <span className="text-xs text-white/40">Lv.{student?.current_level} · {parent?.first_name} {parent?.last_name}</span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
        <div className="p-6 pt-0 flex gap-3">
          <button onClick={cancelSession} disabled={cancelling}
            className="flex-1 py-2.5 rounded-lg border border-red-500/40 text-red-400 hover:bg-red-500/10 transition-colors text-sm disabled:opacity-50">
            {cancelling ? '取消中...' : '取消這堂課'}
          </button>
          <button onClick={onClose} className="flex-1 py-2.5 rounded-lg bg-white/10 hover:bg-white/15 transition-colors text-sm text-white">
            關閉
          </button>
        </div>
      </div>
    </div>
  )
}
