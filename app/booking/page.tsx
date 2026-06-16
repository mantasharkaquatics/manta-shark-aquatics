'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

const NAVY = '#1a2744'
const DARK = '#111d38'
const GOLD = '#c9a84c'

interface Student { id: string; full_name: string; current_level: number }
interface CourseType { id: string; name: string; slug: string; duration_minutes: number; max_students: number; description: string }
interface Coach { id: string; first_name: string; last_name: string }
interface TimeSlot { time: string; label: string; available: boolean; enrolled: number; max: number; session_id?: string }
interface Credit { id: string; total_credits: number; used_credits: number; course_type_id: string; student_id: string | null }

const COURSE_COLORS: Record<string, string> = {
  '1on1': GOLD, '1on2': '#4a90c4', '1on4': '#4caf72', 'team': '#e05a4a',
}
const COURSE_ICONS: Record<string, string> = {
  '1on1': '👤', '1on2': '👥', '1on4': '👨‍👩‍👧‍👦', 'team': '🏊',
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']

function generateSlots(start: string, end: string): string[] {
  const slots: string[] = []
  const [sh, sm] = start.split(':').map(Number)
  const [eh, em] = end.split(':').map(Number)
  let cur = sh * 60 + sm
  const endMin = eh * 60 + em
  while (cur + 30 <= endMin) {
    const h = Math.floor(cur / 60)
    const m = cur % 60
    slots.push(`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`)
    cur += 30
  }
  return slots
}

function formatTime(t: string): string {
  const [h, m] = t.split(':').map(Number)
  const ampm = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 || 12
  return `${h12}:${String(m).padStart(2,'0')} ${ampm}`
}

function Steps({ current }: { current: number }) {
  const steps = ['Select Student', 'Course Type', 'Choose Coach', 'Pick Date & Time', 'Confirm']
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0', marginBottom: '36px', overflowX: 'auto' }}>
      {steps.map((s, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
            <div style={{
              width: '32px', height: '32px', borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '13px', fontWeight: 700,
              background: i < current ? GOLD : i === current ? '#fff' : 'rgba(255,255,255,0.1)',
              color: i <= current ? NAVY : 'rgba(255,255,255,0.3)',
              border: `2px solid ${i === current ? '#fff' : i < current ? GOLD : 'rgba(255,255,255,0.15)'}`,
            }}>
              {i < current ? '✓' : i + 1}
            </div>
            <span style={{
              fontSize: '10px', fontWeight: 600, letterSpacing: '0.5px',
              color: i === current ? '#fff' : i < current ? GOLD : 'rgba(255,255,255,0.3)',
              whiteSpace: 'nowrap',
            }}>{s}</span>
          </div>
          {i < steps.length - 1 && (
            <div style={{
              width: '40px', height: '2px', margin: '0 4px', marginBottom: '20px',
              background: i < current ? GOLD : 'rgba(255,255,255,0.1)',
            }} />
          )}
        </div>
      ))}
    </div>
  )
}

function SectionTitle({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div style={{ marginBottom: '24px' }}>
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: '8px',
        fontSize: '10px', fontWeight: 600, letterSpacing: '3px',
        textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)', marginBottom: '8px',
      }}>
        <span style={{ width: 5, height: 5, borderRadius: '50%', background: GOLD, display: 'inline-block' }} />
        {eyebrow}
      </div>
      <h2 style={{
        fontFamily: "'Playfair Display', serif",
        fontSize: 'clamp(20px,2.5vw,28px)', fontWeight: 900,
        color: '#fff', margin: 0,
      }}>{title}</h2>
    </div>
  )
}

function SelectCard({ selected, onClick, color = GOLD, children }: {
  selected: boolean; onClick: () => void; color?: string; children: React.ReactNode
}) {
  return (
    <div onClick={onClick} style={{
      background: selected ? `${color}18` : NAVY,
      border: `2px solid ${selected ? color : 'rgba(255,255,255,0.08)'}`,
      borderRadius: '14px', padding: '20px', cursor: 'pointer',
      transition: 'all 0.15s', position: 'relative',
    }}>
      {selected && (
        <div style={{
          position: 'absolute', top: '12px', right: '12px',
          width: '20px', height: '20px', borderRadius: '50%',
          background: color, display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '11px', color: '#fff', fontWeight: 700,
        }}>✓</div>
      )}
      {children}
    </div>
  )
}

export default function BookingPage() {
  const router = useRouter()
  const supabase = createClient()
  const [wasRescheduled, setWasRescheduled] = useState(false)

  // 直接從 URL 讀取，不用 state（避免非同步問題）
  const urlParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null
  const rescheduleBookingId = urlParams?.get('reschedule_booking_id') || null
  const rescheduleCreditId = urlParams?.get('reschedule_credit_id') || null
  const rescheduleSlug = urlParams?.get('reschedule_slug') || null

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search)
      if (params.get('rescheduled') === '1') setWasRescheduled(true)
    }
  }, [])

  const [step, setStep] = useState(0)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)

  const [parentId, setParentId] = useState<string | null>(null)
  const [students, setStudents] = useState<Student[]>([])
  const [courseTypes, setCourseTypes] = useState<CourseType[]>([])
  const [coaches, setCoaches] = useState<Coach[]>([])
  const [credits, setCredits] = useState<Credit[]>([])

  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null)
  const [selectedCourse, setSelectedCourse] = useState<CourseType | null>(null)
  const [selectedCoach, setSelectedCoach] = useState<Coach | null>(null)
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [selectedSlot, setSelectedSlot] = useState<TimeSlot | null>(null)
  const [timeSlots, setTimeSlots] = useState<TimeSlot[]>([])

  const today = new Date()
  const [calMonth, setCalMonth] = useState(today.getMonth())
  const [calYear, setCalYear] = useState(today.getFullYear())

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      const { data: parent } = await supabase.from('parents').select('id').eq('auth_user_id', user.id).single()
      if (!parent) { router.push('/dashboard'); return }
      setParentId(parent.id)

      const [{ data: studs }, { data: cts }, { data: coachs }, { data: crds }] = await Promise.all([
        supabase.from('students').select('id, full_name, current_level').eq('parent_id', parent.id).eq('is_active', true),
        supabase.from('course_types').select('*').eq('is_active', true).order('sort_order'),
        supabase.from('coaches').select('id, first_name, last_name').eq('is_active', true),
        // ✅ 用 parent_id 查，不用 student_id
        supabase.from('lesson_credits')
          .select('id, total_credits, used_credits, course_type_id, student_id')
          .eq('parent_id', parent.id)
          .filter('total_credits', 'gt', 0),
      ])

      setStudents(studs || [])
      setCourseTypes(cts || [])
      setCoaches(coachs || [])
      // ✅ 只保留還有剩餘 credits 的
      setCredits((crds || []).filter((c: any) => (c.total_credits - c.used_credits) > 0))
      setLoading(false)
    }
    init()
  }, [])

  useEffect(() => {
    if (!selectedDate || !selectedCoach || !selectedCourse) return
    loadTimeSlots()
  }, [selectedDate, selectedCoach, selectedCourse])

  async function loadTimeSlots() {
    if (!selectedDate || !selectedCoach || !selectedCourse) return

    const dow = selectedDate.getDay()
    const dateStr = selectedDate.toISOString().split('T')[0]

    const { data: avail } = await supabase
      .from('coach_availability')
      .select('start_time, end_time')
      .eq('coach_id', selectedCoach.id)
      .eq('day_of_week', dow)
      .eq('is_active', true)

    if (!avail || avail.length === 0) { setTimeSlots([]); return }

    const allSlots: string[] = []
    for (const a of avail) {
      allSlots.push(...generateSlots(a.start_time, a.end_time))
    }

    const { data: sessions } = await supabase
      .from('class_sessions')
      .select('id, start_time, enrolled_count, max_students, status')
      .eq('coach_id', selectedCoach.id)
      .eq('session_date', dateStr)
      .eq('course_type_id', selectedCourse.id)

    const sessionMap: Record<string, any> = {}
    for (const s of sessions || []) {
      sessionMap[s.start_time.slice(0, 5)] = s
    }

    const slots: TimeSlot[] = allSlots.map(t => {
      const existing = sessionMap[t]
      const maxStudents = selectedCourse.max_students
      if (existing) {
        return {
          time: t, label: formatTime(t),
          available: existing.enrolled_count < existing.max_students && existing.status !== 'cancelled',
          enrolled: existing.enrolled_count, max: existing.max_students, session_id: existing.id,
        }
      }
      return { time: t, label: formatTime(t), available: true, enrolled: 0, max: maxStudents }
    })

    setTimeSlots(slots)
  }

  // ✅ 修正：只比對 course_type_id，不比對 student_id（全家共用）
  const availableCredit = selectedCourse
    ? credits.find(c => c.course_type_id === selectedCourse.id && (c.total_credits - c.used_credits) > 0)
    : null
  const remainingCredits = availableCredit ? availableCredit.total_credits - availableCredit.used_credits : 0

  async function handleConfirm() {
    if (!selectedStudent || !selectedCourse || !selectedCoach || !selectedDate || !selectedSlot || !parentId || !availableCredit) return
    setSubmitting(true)

    const dateStr = selectedDate.toISOString().split('T')[0]
    const startTime = selectedSlot.time
    const [h, m] = startTime.split(':').map(Number)
    const endMin = h * 60 + m + selectedCourse.duration_minutes
    const endTime = `${String(Math.floor(endMin/60)).padStart(2,'0')}:${String(endMin%60).padStart(2,'0')}`

    let sessionId = selectedSlot.session_id

    if (!sessionId) {
      const { data: newSession, error } = await supabase
        .from('class_sessions')
        .insert({
          course_type_id: selectedCourse.id,
          coach_id: selectedCoach.id,
          session_date: dateStr,
          start_time: startTime,
          end_time: endTime,
          max_students: selectedCourse.max_students,
          enrolled_count: 0,
          status: 'open',
        })
        .select('id')
        .single()

      if (error || !newSession) { setSubmitting(false); return }
      sessionId = newSession.id
    }

    const { error: bookErr } = await supabase
      .from('bookings')
      .insert({
        class_session_id: sessionId,
        parent_id: parentId,
        lesson_credit_id: availableCredit.id,
        student_id: selectedStudent.id,
        status: 'confirmed',
      })

    if (bookErr) { setSubmitting(false); return }

    await supabase
      .from('lesson_credits')
      .update({ used_credits: availableCredit.used_credits + 1 })
      .eq('id', availableCredit.id)

    await supabase.rpc('increment_enrolled', { session_id: sessionId })

    // 如果是 reschedule，取消舊課（credit 不動，因為新課已扣）
    if (rescheduleBookingId) {
      await supabase.from('bookings').update({ status: 'cancelled', cancellation_reason: 'rescheduled' }).eq('id', rescheduleBookingId)
    }

    setSubmitting(false)
    setSuccess(true)
  }

  function getDaysInMonth(y: number, m: number) { return new Date(y, m + 1, 0).getDate() }
  function getFirstDayOfMonth(y: number, m: number) { return new Date(y, m, 1).getDay() }

  function isDateAvailable(date: Date): boolean {
    if (date < today) return false
    const maxDate = new Date(today)
    maxDate.setDate(maxDate.getDate() + 60)
    return date <= maxDate
  }

  if (loading) return (
    <div style={{ minHeight: '100vh', background: DARK, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '32px', marginBottom: '16px' }}>🦈</div>
        <div style={{ fontSize: '14px', color: 'rgba(255,255,255,0.5)' }}>Loading...</div>
      </div>
    </div>
  )

  if (success) return (
    <div style={{ minHeight: '100vh', background: DARK, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
      <div style={{
        background: NAVY, borderRadius: '20px', padding: '48px',
        textAlign: 'center', maxWidth: '480px', width: '100%',
        border: `1px solid ${GOLD}30`,
      }}>
        <div style={{ fontSize: '48px', marginBottom: '20px' }}>✅</div>
        <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: '28px', fontWeight: 900, color: '#fff', marginBottom: '12px' }}>
          {rescheduleBookingId ? 'Lesson Rescheduled!' : 'Lesson Booked!'}
        </h2>
        <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.6)', lineHeight: 1.7, marginBottom: '8px' }}>
          <strong style={{ color: '#fff' }}>{selectedStudent?.full_name}</strong> is booked for
        </p>
        <p style={{ fontSize: '14px', color: GOLD, fontWeight: 600, marginBottom: '8px' }}>
          {selectedCourse?.name} with {selectedCoach?.first_name}
        </p>
        <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.6)', marginBottom: '32px' }}>
          {selectedDate?.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })} at {selectedSlot?.label}
        </p>
        <Link href="/dashboard" style={{
          display: 'inline-block', padding: '13px 32px',
          background: GOLD, color: NAVY, borderRadius: '8px',
          fontSize: '13px', fontWeight: 700, letterSpacing: '1.5px',
          textTransform: 'uppercase', textDecoration: 'none',
        }}>
          Back to Dashboard
        </Link>
      </div>
    </div>
  )

  return (
    <div style={{ fontFamily: "'DM Sans', sans-serif", background: DARK, minHeight: '100vh' }}>
      <div style={{
        background: NAVY, borderBottom: '1px solid rgba(255,255,255,0.08)',
        padding: '16px clamp(20px,5vw,48px)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Link href="/" style={{ textDecoration: 'none' }}>
            <img src="/logo.png" alt="Manta Shark" style={{ height: '32px' }} />
          </Link>
          <div style={{ width: 1, height: 20, background: 'rgba(255,255,255,0.12)' }} />
          <span style={{ fontSize: '13px', fontWeight: 600, color: 'rgba(255,255,255,0.6)' }}>Book a Lesson</span>
        </div>
        <Link href="/dashboard" style={{ fontSize: '13px', color: 'rgba(255,255,255,0.5)', textDecoration: 'none' }}>
          ← Dashboard
        </Link>
      </div>

      <div style={{ maxWidth: '800px', margin: '0 auto', padding: 'clamp(24px,4vw,48px) clamp(20px,5vw,48px)' }}>
        {(wasRescheduled || rescheduleBookingId) && (
          <div style={{ marginBottom: '20px', padding: '14px 18px', background: 'rgba(201,168,76,0.1)', border: '1px solid rgba(201,168,76,0.3)', borderRadius: '10px', fontSize: '13px', color: '#c9a84c', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>📅</span> Rescheduling your lesson — please pick a new date and time below.
          </div>
        )}
        <Steps current={step} />

        {/* STEP 0: Select Student */}
        {step === 0 && (
          <div>
            <SectionTitle eyebrow="Step 1" title="Who is this lesson for?" />
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {students.map(s => (
                <SelectCard key={s.id} selected={selectedStudent?.id === s.id} onClick={() => setSelectedStudent(s)}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                    <div style={{
                      width: '44px', height: '44px', borderRadius: '50%',
                      background: GOLD, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontFamily: "'Playfair Display', serif", fontSize: '16px', fontWeight: 900, color: NAVY,
                    }}>
                      {s.full_name.split(' ').map((n: string) => n[0]).join('').slice(0, 2)}
                    </div>
                    <div>
                      <div style={{ fontSize: '15px', fontWeight: 700, color: '#fff' }}>{s.full_name}</div>
                      <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)' }}>
                        {s.current_level ? `Level ${s.current_level}` : 'Pending Assessment'}
                      </div>
                    </div>
                  </div>
                </SelectCard>
              ))}
            </div>
            <button
              onClick={() => { if (selectedStudent) setStep(1) }}
              disabled={!selectedStudent}
              style={{
                marginTop: '24px', width: '100%', padding: '14px',
                background: selectedStudent ? GOLD : 'rgba(255,255,255,0.1)',
                color: selectedStudent ? NAVY : 'rgba(255,255,255,0.3)',
                border: 'none', borderRadius: '10px',
                fontSize: '13px', fontWeight: 700, letterSpacing: '1.5px',
                textTransform: 'uppercase', cursor: selectedStudent ? 'pointer' : 'not-allowed',
              }}
            >
              Continue →
            </button>
          </div>
        )}

        {/* STEP 1: Course Type */}
        {step === 1 && (
          <div>
            <SectionTitle eyebrow="Step 2" title="What type of lesson?" />
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {courseTypes.filter(ct => ct.slug !== 'team').map(ct => {
                const color = COURSE_COLORS[ct.slug] || GOLD
                // ✅ 加總同課程所有 credits
                const remaining = credits
                  .filter(c => c.course_type_id === ct.id)
                  .reduce((sum, c) => sum + (c.total_credits - c.used_credits), 0)
                // ✅ Reschedule 時鎖定課程類型
                const isLocked = !!rescheduleSlug && ct.slug !== rescheduleSlug
                return (
                  <SelectCard key={ct.id} selected={selectedCourse?.id === ct.id} onClick={() => !isLocked && setSelectedCourse(ct)} color={isLocked ? 'rgba(255,255,255,0.2)' : color}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                        <span style={{ fontSize: '28px' }}>{COURSE_ICONS[ct.slug]}</span>
                        <div>
                          <div style={{ fontSize: '15px', fontWeight: 700, color: isLocked ? 'rgba(255,255,255,0.3)' : '#fff', marginBottom: '2px' }}>{ct.name}</div>
                          <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)' }}>
                            {ct.duration_minutes} min · Max {ct.max_students} student{ct.max_students > 1 ? 's' : ''}
                            {isLocked && <span style={{ marginLeft: '6px', color: 'rgba(255,255,255,0.25)' }}>— not available for reschedule</span>}
                          </div>
                        </div>
                      </div>
                      {remaining > 0 ? (
                        <div style={{
                          background: `${color}20`, border: `1px solid ${color}40`,
                          borderRadius: '20px', padding: '4px 12px',
                          fontSize: '12px', fontWeight: 700, color,
                        }}>
                          {remaining} credits
                        </div>
                      ) : (
                        <div style={{
                          background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
                          borderRadius: '20px', padding: '4px 12px',
                          fontSize: '11px', color: 'rgba(255,255,255,0.3)',
                        }}>
                          No credits
                        </div>
                      )}
                    </div>
                  </SelectCard>
                )
              })}
            </div>

            {selectedCourse && !availableCredit && (
              <div style={{
                marginTop: '16px', padding: '14px 18px',
                background: 'rgba(224,90,74,0.1)', border: '1px solid rgba(224,90,74,0.3)',
                borderRadius: '10px', fontSize: '13px', color: '#e05a4a',
              }}>
                ⚠️ You don't have credits for this course type.{' '}
                <Link href="/plans" style={{ color: GOLD, fontWeight: 700 }}>Browse Plans →</Link>
              </div>
            )}

            <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
              <button onClick={() => setStep(0)} style={{
                flex: 1, padding: '14px', background: 'transparent',
                color: 'rgba(255,255,255,0.5)', border: '1px solid rgba(255,255,255,0.15)',
                borderRadius: '10px', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
              }}>← Back</button>
              <button
                onClick={() => { if (selectedCourse && availableCredit) setStep(2) }}
                disabled={!selectedCourse || !availableCredit}
                style={{
                  flex: 2, padding: '14px',
                  background: selectedCourse && availableCredit ? GOLD : 'rgba(255,255,255,0.1)',
                  color: selectedCourse && availableCredit ? NAVY : 'rgba(255,255,255,0.3)',
                  border: 'none', borderRadius: '10px',
                  fontSize: '13px', fontWeight: 700, letterSpacing: '1.5px',
                  textTransform: 'uppercase', cursor: selectedCourse && availableCredit ? 'pointer' : 'not-allowed',
                }}
              >Continue →</button>
            </div>
          </div>
        )}

        {/* STEP 2: Choose Coach */}
        {step === 2 && (
          <div>
            <SectionTitle eyebrow="Step 3" title="Choose your coach" />
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {coaches.map((coach, i) => {
                const colors = [GOLD, '#4a90c4', '#e05a4a']
                const color = colors[i % colors.length]
                return (
                  <SelectCard key={coach.id} selected={selectedCoach?.id === coach.id} onClick={() => setSelectedCoach(coach)} color={color}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                      <div style={{
                        width: '48px', height: '48px', borderRadius: '50%',
                        background: color, display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontFamily: "'Playfair Display', serif", fontSize: '18px', fontWeight: 900, color: '#fff',
                      }}>
                        {coach.first_name[0]}
                      </div>
                      <div>
                        <div style={{ fontSize: '15px', fontWeight: 700, color: '#fff' }}>{coach.first_name}</div>
                        <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)' }}>Swim Coach</div>
                      </div>
                    </div>
                  </SelectCard>
                )
              })}
            </div>
            <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
              <button onClick={() => setStep(1)} style={{
                flex: 1, padding: '14px', background: 'transparent',
                color: 'rgba(255,255,255,0.5)', border: '1px solid rgba(255,255,255,0.15)',
                borderRadius: '10px', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
              }}>← Back</button>
              <button
                onClick={() => { if (selectedCoach) setStep(3) }}
                disabled={!selectedCoach}
                style={{
                  flex: 2, padding: '14px',
                  background: selectedCoach ? GOLD : 'rgba(255,255,255,0.1)',
                  color: selectedCoach ? NAVY : 'rgba(255,255,255,0.3)',
                  border: 'none', borderRadius: '10px',
                  fontSize: '13px', fontWeight: 700, letterSpacing: '1.5px',
                  textTransform: 'uppercase', cursor: selectedCoach ? 'pointer' : 'not-allowed',
                }}
              >Continue →</button>
            </div>
          </div>
        )}

        {/* STEP 3: Date & Time */}
        {step === 3 && (
          <div>
            <SectionTitle eyebrow="Step 4" title="Pick a date & time" />
            <div style={{ background: NAVY, borderRadius: '16px', padding: '24px', marginBottom: '20px', border: '1px solid rgba(255,255,255,0.08)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
                <button onClick={() => {
                  if (calMonth === 0) { setCalMonth(11); setCalYear(calYear - 1) }
                  else setCalMonth(calMonth - 1)
                }} style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.5)', fontSize: '18px', cursor: 'pointer' }}>‹</button>
                <span style={{ fontSize: '15px', fontWeight: 700, color: '#fff' }}>{MONTHS[calMonth]} {calYear}</span>
                <button onClick={() => {
                  if (calMonth === 11) { setCalMonth(0); setCalYear(calYear + 1) }
                  else setCalMonth(calMonth + 1)
                }} style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.5)', fontSize: '18px', cursor: 'pointer' }}>›</button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px', marginBottom: '8px' }}>
                {DAYS.map(d => (
                  <div key={d} style={{ textAlign: 'center', fontSize: '11px', fontWeight: 600, color: 'rgba(255,255,255,0.3)', padding: '4px 0' }}>{d}</div>
                ))}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px' }}>
                {Array.from({ length: getFirstDayOfMonth(calYear, calMonth) }).map((_, i) => <div key={`e-${i}`} />)}
                {Array.from({ length: getDaysInMonth(calYear, calMonth) }).map((_, i) => {
                  const date = new Date(calYear, calMonth, i + 1)
                  const available = isDateAvailable(date)
                  const isSelected = selectedDate?.toDateString() === date.toDateString()
                  const isToday = date.toDateString() === today.toDateString()
                  return (
                    <button key={i}
                      onClick={() => { if (available) { setSelectedDate(date); setSelectedSlot(null); setTimeSlots([]) } }}
                      style={{
                        padding: '8px 4px', borderRadius: '8px', border: 'none',
                        background: isSelected ? GOLD : isToday ? 'rgba(255,255,255,0.08)' : 'transparent',
                        color: isSelected ? NAVY : available ? '#fff' : 'rgba(255,255,255,0.2)',
                        fontSize: '13px', fontWeight: isSelected ? 700 : 400,
                        cursor: available ? 'pointer' : 'not-allowed',
                        outline: isToday && !isSelected ? `1px solid ${GOLD}40` : 'none',
                      }}
                    >{i + 1}</button>
                  )
                })}
              </div>
            </div>

            {selectedDate && (
              <div>
                <div style={{ fontSize: '13px', fontWeight: 600, color: 'rgba(255,255,255,0.6)', marginBottom: '12px' }}>
                  Available times for {selectedDate.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
                </div>
                {timeSlots.length === 0 ? (
                  <div style={{ background: NAVY, borderRadius: '12px', padding: '24px', textAlign: 'center', border: '1px dashed rgba(255,255,255,0.12)' }}>
                    <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '14px' }}>No available slots for this day.</p>
                  </div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: '8px' }}>
                    {timeSlots.map(slot => (
                      <button key={slot.time}
                        onClick={() => { if (slot.available) setSelectedSlot(slot) }}
                        disabled={!slot.available}
                        style={{
                          padding: '12px 8px', borderRadius: '10px',
                          border: `2px solid ${selectedSlot?.time === slot.time ? GOLD : slot.available ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.05)'}`,
                          background: selectedSlot?.time === slot.time ? `${GOLD}20` : slot.available ? NAVY : 'rgba(255,255,255,0.03)',
                          color: selectedSlot?.time === slot.time ? GOLD : slot.available ? '#fff' : 'rgba(255,255,255,0.2)',
                          fontSize: '13px', fontWeight: 600, cursor: slot.available ? 'pointer' : 'not-allowed',
                          textAlign: 'center',
                        }}
                      >
                        {slot.label}
                        {selectedCourse && selectedCourse.max_students > 1 && (
                          <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)', marginTop: '2px' }}>{slot.max - slot.enrolled} left</div>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
              <button onClick={() => { setStep(2); setSelectedDate(null); setSelectedSlot(null) }} style={{
                flex: 1, padding: '14px', background: 'transparent',
                color: 'rgba(255,255,255,0.5)', border: '1px solid rgba(255,255,255,0.15)',
                borderRadius: '10px', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
              }}>← Back</button>
              <button
                onClick={() => { if (selectedSlot) setStep(4) }}
                disabled={!selectedSlot}
                style={{
                  flex: 2, padding: '14px',
                  background: selectedSlot ? GOLD : 'rgba(255,255,255,0.1)',
                  color: selectedSlot ? NAVY : 'rgba(255,255,255,0.3)',
                  border: 'none', borderRadius: '10px',
                  fontSize: '13px', fontWeight: 700, letterSpacing: '1.5px',
                  textTransform: 'uppercase', cursor: selectedSlot ? 'pointer' : 'not-allowed',
                }}
              >Continue →</button>
            </div>
          </div>
        )}

        {/* STEP 4: Confirm */}
        {step === 4 && (
          <div>
            <SectionTitle eyebrow="Step 5" title="Confirm your booking" />
            <div style={{ background: NAVY, borderRadius: '16px', padding: '28px', border: '1px solid rgba(255,255,255,0.08)', marginBottom: '20px' }}>
              {[
                { label: 'Swimmer', value: selectedStudent?.full_name },
                { label: 'Course', value: selectedCourse?.name },
                { label: 'Coach', value: selectedCoach?.first_name },
                { label: 'Date', value: selectedDate?.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) },
                { label: 'Time', value: selectedSlot?.label },
                { label: 'Duration', value: `${selectedCourse?.duration_minutes} minutes` },
                { label: 'Credits Used', value: '1 credit' },
              ].map(row => (
                <div key={row.label} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '12px 0', borderBottom: '1px solid rgba(255,255,255,0.06)',
                }}>
                  <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.4)' }}>{row.label}</span>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: '#fff' }}>{row.value}</span>
                </div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '12px' }}>
                <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.4)' }}>Remaining Credits After</span>
                <span style={{ fontSize: '13px', fontWeight: 700, color: GOLD }}>{remainingCredits - 1} credits</span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '12px' }}>
              <button onClick={() => setStep(3)} style={{
                flex: 1, padding: '14px', background: 'transparent',
                color: 'rgba(255,255,255,0.5)', border: '1px solid rgba(255,255,255,0.15)',
                borderRadius: '10px', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
              }}>← Back</button>
              <button
                onClick={handleConfirm}
                disabled={submitting}
                style={{
                  flex: 2, padding: '14px',
                  background: submitting ? 'rgba(255,255,255,0.1)' : GOLD,
                  color: submitting ? 'rgba(255,255,255,0.3)' : NAVY,
                  border: 'none', borderRadius: '10px',
                  fontSize: '13px', fontWeight: 700, letterSpacing: '1.5px',
                  textTransform: 'uppercase', cursor: submitting ? 'not-allowed' : 'pointer',
                }}
              >{submitting ? 'Booking...' : 'Confirm Booking ✓'}</button>
            </div>
          </div>
        )}
      </div>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,700;0,900;1,700&family=DM+Sans:wght@400;500;600;700&display=swap');`}</style>
    </div>
  )
}
