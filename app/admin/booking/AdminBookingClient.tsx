'use client'

import { useState, useEffect, useCallback } from 'react'
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
  parents: { id: string; first_name: string; last_name: string } | { id: string; first_name: string; last_name: string }[]
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

const WORK_START = 8
const WORK_END = 21
const SLOT_MINUTES = 30

function getWeekDates(anchor: Date): Date[] {
  const start = new Date(anchor)
  start.setDate(anchor.getDate() - anchor.getDay())
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    return d
  })
}

function toDateStr(d: Date): string {
  return d.toISOString().split('T')[0]
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

function isCoachAvailable(coach_id: string, date: Date, time: string): boolean {
  const dow = date.getDay()
  const mins = timeToMinutes(time)
  if (dow >= 1 && dow <= 5) {
    return mins >= timeToMinutes('15:30') && mins < timeToMinutes('19:30')
  } else {
    return (
      (mins >= timeToMinutes('08:00') && mins < timeToMinutes('12:00')) ||
      (mins >= timeToMinutes('14:30') && mins < timeToMinutes('20:30'))
    )
  }
}

function getSessionCourseType(s: Session): { name: string; slug: string } {
  const ct = Array.isArray(s.course_types) ? s.course_types[0] : s.course_types
  return ct || { name: '', slug: '' }
}

const COURSE_COLORS: Record<string, string> = {
  '1on1': 'bg-blue-500',
  '1on2': 'bg-purple-500',
  '1on4': 'bg-green-500',
  'team': 'bg-amber-500',
}

function generateTimeSlots(): string[] {
  const slots: string[] = []
  for (let m = WORK_START * 60; m < WORK_END * 60; m += SLOT_MINUTES) {
    slots.push(minutesToTime(m))
  }
  return slots
}
const TIME_SLOTS = generateTimeSlots()

export default function AdminBookingClient({ coaches, students, courseTypes, initialSessions }: Props) {
  const supabase = createClient()
  const [view, setView] = useState<'week' | 'day'>('week')
  const [anchor, setAnchor] = useState(new Date())
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

  const weekDates = getWeekDates(anchor)
  const dayDate = anchor

  const loadSessions = useCallback(async () => {
    setLoading(true)
    const from = view === 'week' ? toDateStr(weekDates[0]) : toDateStr(dayDate)
    const to = view === 'week' ? toDateStr(weekDates[6]) : toDateStr(dayDate)
    const { data } = await supabase
      .from('class_sessions')
      .select('id, coach_id, session_date, start_time, end_time, max_students, enrolled_count, status, course_type_id, course_types(name, slug, duration_minutes)')
      .gte('session_date', from)
      .lte('session_date', to)
      .neq('status', 'cancelled')
      .order('session_date')
      .order('start_time')
    if (data) setSessions(data as Session[])
    setLoading(false)
  }, [anchor, view]) // eslint-disable-line

  useEffect(() => { loadSessions() }, [loadSessions])

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
      setError('建立課程失敗：' + (sessErr?.message || ''))
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

    setSuccess('預約成功！')
    await loadSessions()
    setTimeout(() => {
      setModal(null)
      setSuccess('')
    }, 1200)
    setSaving(false)
  }

  function getSessionAt(date: string, time: string, coachId: string): Session | null {
    return sessions.find(s =>
      s.session_date === date &&
      s.coach_id === coachId &&
      s.start_time.slice(0, 5) === time
    ) || null
  }

  return (
    <div className="min-h-screen bg-[#0d1529] text-white -mx-6 -my-8">
      <div className="border-b border-white/10 px-6 py-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-white" style={{ fontFamily: 'Playfair Display, serif' }}>
          Booking Calendar
        </h1>
        <div className="flex items-center gap-3">
          <div className="flex rounded-lg overflow-hidden border border-white/20">
            {(['week', 'day'] as const).map(v => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`px-4 py-1.5 text-sm transition-colors ${
                  view === v ? 'bg-[#c9a84c] text-[#0d1529] font-medium' : 'text-white/60 hover:text-white'
                }`}
              >
                {v === 'week' ? '週' : '日'}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                const d = new Date(anchor)
                d.setDate(d.getDate() - (view === 'week' ? 7 : 1))
                setAnchor(new Date(d))
              }}
              className="p-1.5 rounded hover:bg-white/10 transition-colors text-white/60 hover:text-white text-lg leading-none"
            >
              ‹
            </button>
            <span className="text-sm text-white/80 min-w-[160px] text-center">
              {view === 'week'
                ? `${weekDates[0].toLocaleDateString('zh-TW', { month: 'short', day: 'numeric' })} – ${weekDates[6].toLocaleDateString('zh-TW', { month: 'short', day: 'numeric' })}`
                : dayDate.toLocaleDateString('zh-TW', { month: 'long', day: 'numeric', weekday: 'long' })
              }
            </span>
            <button
              onClick={() => {
                const d = new Date(anchor)
                d.setDate(d.getDate() + (view === 'week' ? 7 : 1))
                setAnchor(new Date(d))
              }}
              className="p-1.5 rounded hover:bg-white/10 transition-colors text-white/60 hover:text-white text-lg leading-none"
            >
              ›
            </button>
            <button
              onClick={() => setAnchor(new Date())}
              className="px-3 py-1 text-xs rounded border border-white/20 hover:bg-white/10 transition-colors text-white/60 hover:text-white"
            >
              今天
            </button>
          </div>
          {loading && <span className="text-xs text-white/40">載入中...</span>}
        </div>
      </div>

      <div className="overflow-auto" style={{ height: 'calc(100vh - 130px)' }}>
        {view === 'week' ? (
          <WeekView
            dates={weekDates}
            coaches={coaches}
            sessions={sessions}
            getSessionAt={getSessionAt}
            isCoachAvailable={isCoachAvailable}
            onSlotClick={openBookModal}
            onSessionClick={openDetailModal}
          />
        ) : (
          <DayView
            date={dayDate}
            coaches={coaches}
            sessions={sessions}
            getSessionAt={getSessionAt}
            isCoachAvailable={isCoachAvailable}
            onSlotClick={openBookModal}
            onSessionClick={openDetailModal}
          />
        )}
      </div>

      {modal === 'book' && selectedSlot && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-[#1a2744] rounded-2xl w-full max-w-md shadow-2xl">
            <div className="p-6 border-b border-white/10">
              <h2 className="text-lg font-semibold" style={{ fontFamily: 'Playfair Display, serif' }}>
                新增預約
              </h2>
              <p className="text-sm text-white/50 mt-1">
                {new Date(selectedSlot.date + 'T12:00:00').toLocaleDateString('zh-TW', { month: 'long', day: 'numeric', weekday: 'long' })}
                {' · '}
                {formatTime(selectedSlot.time)}
                {' · '}
                Coach {coaches.find(c => c.id === selectedSlot.coachId)?.first_name}
              </p>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm text-white/60 mb-2">課程類型</label>
                <div className="grid grid-cols-2 gap-2">
                  {courseTypes.map(ct => (
                    <button
                      key={ct.id}
                      onClick={() => setFormCourse(ct.id)}
                      className={`px-3 py-2.5 rounded-lg border text-sm text-left transition-all ${
                        formCourse === ct.id
                          ? 'border-[#c9a84c] bg-[#c9a84c]/10 text-[#c9a84c]'
                          : 'border-white/10 text-white/60 hover:border-white/30 hover:text-white'
                      }`}
                    >
                      <span className="block font-medium">{ct.name}</span>
                      <span className="block text-xs opacity-60 mt-0.5">{ct.duration_minutes} 分鐘 · 最多 {ct.max_students} 人</span>
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm text-white/60 mb-2">選擇學生</label>
                <select
                  value={formStudent}
                  onChange={e => setFormStudent(e.target.value)}
                  className="w-full bg-[#111d38] border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[#c9a84c] transition-colors"
                >
                  <option value="">— 請選擇學生 —</option>
                  {students.map(s => {
                    const parent = Array.isArray(s.parents) ? s.parents[0] : s.parents
                    return (
                      <option key={s.id} value={s.id}>
                        {s.full_name} (Lv.{s.current_level}) — {parent?.first_name} {parent?.last_name}
                      </option>
                    )
                  })}
                </select>
              </div>
              {error && <p className="text-red-400 text-sm bg-red-400/10 rounded-lg px-3 py-2">{error}</p>}
              {success && <p className="text-green-400 text-sm bg-green-400/10 rounded-lg px-3 py-2">{success}</p>}
            </div>
            <div className="p-6 pt-0 flex gap-3">
              <button
                onClick={() => setModal(null)}
                className="flex-1 py-2.5 rounded-lg border border-white/20 text-white/60 hover:text-white hover:border-white/40 transition-colors text-sm"
              >
                取消
              </button>
              <button
                onClick={handleBook}
                disabled={saving}
                className="flex-1 py-2.5 rounded-lg bg-[#c9a84c] text-[#0d1529] font-semibold hover:bg-[#d4b86a] transition-colors text-sm disabled:opacity-50"
              >
                {saving ? '建立中...' : '確認預約'}
              </button>
            </div>
          </div>
        </div>
      )}

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

function WeekView({ dates, coaches, sessions, getSessionAt, isCoachAvailable, onSlotClick, onSessionClick }: {
  dates: Date[]
  coaches: Coach[]
  sessions: Session[]
  getSessionAt: (date: string, time: string, coachId: string) => Session | null
  isCoachAvailable: (id: string, date: Date, time: string) => boolean
  onSlotClick: (date: string, time: string, coachId: string) => void
  onSessionClick: (s: Session) => void
}) {
  const today = toDateStr(new Date())
  const colCount = dates.length * coaches.length

  return (
    <div className="relative min-w-max">
      <div className="sticky top-0 z-20 bg-[#0d1529] border-b border-white/10">
        <div className="grid" style={{ gridTemplateColumns: `64px repeat(${colCount}, 120px)` }}>
          <div className="h-16" />
          {dates.map(date =>
            coaches.map(coach => (
              <div
                key={`${toDateStr(date)}-${coach.id}`}
                className={`h-16 flex flex-col items-center justify-center border-l border-white/5 ${
                  toDateStr(date) === today ? 'bg-[#c9a84c]/10' : ''
                }`}
              >
                <span className="text-xs text-white/40">
                  {date.toLocaleDateString('zh-TW', { weekday: 'short' })}
                </span>
                <span className={`text-sm font-medium ${toDateStr(date) === today ? 'text-[#c9a84c]' : 'text-white/70'}`}>
                  {date.getDate()}
                </span>
                <span className="text-[10px] text-white/30">{coach.first_name}</span>
              </div>
            ))
          )}
        </div>
      </div>
      <div className="grid" style={{ gridTemplateColumns: `64px repeat(${colCount}, 120px)` }}>
        {TIME_SLOTS.map(time => (
          <div key={time} className="contents">
            <div className="h-10 flex items-center justify-end pr-2 text-[10px] text-white/25 border-t border-white/5">
              {time.endsWith(':00') ? formatTime(time) : ''}
            </div>
            {dates.map(date =>
              coaches.map(coach => {
                const ds = toDateStr(date)
                const session = getSessionAt(ds, time, coach.id)
                const available = isCoachAvailable(coach.id, date, time)
                return (
                  <div key={`${ds}-${coach.id}-${time}`} className="h-10 border-t border-l border-white/5 relative">
                    {session ? (
                      <SessionChip session={session} onClick={() => onSessionClick(session)} compact />
                    ) : available ? (
                      <button
                        onClick={() => onSlotClick(ds, time, coach.id)}
                        className="absolute inset-0 hover:bg-[#c9a84c]/10 transition-colors group flex items-center justify-center"
                      >
                        <span className="hidden group-hover:block text-[10px] text-[#c9a84c]">+ 預約</span>
                      </button>
                    ) : (
                      <div className="absolute inset-0 bg-white/[0.015]" />
                    )}
                  </div>
                )
              })
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function DayView({ date, coaches, sessions, getSessionAt, isCoachAvailable, onSlotClick, onSessionClick }: {
  date: Date
  coaches: Coach[]
  sessions: Session[]
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
              <span className="text-sm font-medium text-white/80">{coach.first_name}</span>
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
                    <button
                      onClick={() => onSlotClick(ds, time, coach.id)}
                      className="absolute inset-0 hover:bg-[#c9a84c]/10 transition-colors group flex items-center justify-center"
                    >
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

function SessionChip({ session, onClick, compact = false }: {
  session: Session
  onClick: () => void
  compact?: boolean
}) {
  const ct = getSessionCourseType(session)
  const colorClass = COURSE_COLORS[ct.slug] || 'bg-gray-500'
  const isFull = session.enrolled_count >= session.max_students
  return (
    <button
      onClick={onClick}
      className={`absolute inset-0.5 rounded ${colorClass} ${isFull ? 'opacity-50' : 'opacity-75'} hover:opacity-100 transition-opacity flex flex-col items-start justify-start p-1 overflow-hidden`}
    >
      {!compact && (
        <span className="text-[10px] font-semibold text-white leading-tight truncate w-full">
          {ct.name}
        </span>
      )}
      <span className="text-[9px] text-white/80">
        {session.enrolled_count}/{session.max_students}
      </span>
    </button>
  )
}

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
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-[#1a2744] rounded-2xl w-full max-w-md shadow-2xl">
        <div className="p-6 border-b border-white/10 flex items-start justify-between">
          <div>
            <div className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium mb-2 ${COURSE_COLORS[ct.slug] || 'bg-gray-500'} bg-opacity-20 text-white`}>
              {ct.name}
            </div>
            <p className="text-white font-medium">
              {new Date(session.session_date + 'T12:00:00').toLocaleDateString('zh-TW', { month: 'long', day: 'numeric', weekday: 'long' })}
            </p>
            <p className="text-sm text-white/50 mt-0.5">
              {formatTime(session.start_time)} – {formatTime(session.end_time)}
              {' · '}
              Coach {coach?.first_name} {coach?.last_name}
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
                const parent = Array.isArray(b.parents) ? b.parents[0] : b.parents
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
          <button
            onClick={cancelSession}
            disabled={cancelling}
            className="flex-1 py-2.5 rounded-lg border border-red-500/40 text-red-400 hover:bg-red-500/10 transition-colors text-sm disabled:opacity-50"
          >
            {cancelling ? '取消中...' : '取消這堂課'}
          </button>
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-lg bg-white/10 hover:bg-white/15 transition-colors text-sm text-white"
          >
            關閉
          </button>
        </div>
      </div>
    </div>
  )
}
