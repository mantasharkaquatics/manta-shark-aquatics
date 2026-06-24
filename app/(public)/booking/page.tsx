'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import ChatWidget from '@/components/ChatWidget'

const NAVY = '#1a2744'
const DARK = '#111d38'
const GOLD = '#c9a84c'

interface Student { id: string; full_name: string; current_level: number; parent_id?: string }
interface PartnerStudent { id: string; full_name: string; current_level: number; parent_id: string; isPartner: true; partnerParentId: string; partnershipId: string }
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

  const [step, setStep] = useState(0)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [isReschedule, setIsReschedule] = useState(false)
  const [rescheduleBookingId, setRescheduleBookingId] = useState<string | null>(null)
  const rescheduleBookingIdRef = useRef<string | null>(null)
  const [countdown, setCountdown] = useState(30)

  const [parentId, setParentId] = useState<string | null>(null)
  const [students, setStudents] = useState<Student[]>([])
  const [courseTypes, setCourseTypes] = useState<CourseType[]>([])
  const [coaches, setCoaches] = useState<Coach[]>([])
  const [credits, setCredits] = useState<Credit[]>([])
  const [partnerStudents, setPartnerStudents] = useState<PartnerStudent[]>([])
  const [selectedStudent2, setSelectedStudent2] = useState<Student | PartnerStudent | null>(null)

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
        supabase.from('lesson_credits')
          .select('id, total_credits, used_credits, course_type_id, student_id, created_at')
          .eq('parent_id', parent.id)
          .filter('total_credits', 'gt', 0),
      ])

      setStudents(studs || [])
      setCourseTypes(cts || [])
      setCoaches(coachs || [])
      setCredits((crds || []).filter((c: any) => (c.total_credits - c.used_credits) > 0))

      try {
        const res = await fetch('/api/partnerships/list')
        if (res.ok) {
          const { partnerships, partner_students } = await res.json()
          const pStudents: PartnerStudent[] = (partner_students || []).map((s: any) => {
            const p = (partnerships || []).find((pp: any) =>
              pp.initiator_parent_id === s.parent_id || pp.partner_parent_id === s.parent_id
            )
            return { id: s.id, full_name: s.full_name, current_level: s.current_level, parent_id: s.parent_id, isPartner: true as const, partnerParentId: s.parent_id, partnershipId: p?.id || null }
          })
          setPartnerStudents(pStudents)
        }
      } catch {}

      const params = new URLSearchParams(window.location.search)
      const rbId = params.get('reschedule_booking_id')
      const rSlug = params.get('reschedule_slug')
      const rStudentId = params.get('reschedule_student_id')

      if (rbId && rSlug) {
        setIsReschedule(true)
        setRescheduleBookingId(rbId)
        rescheduleBookingIdRef.current = rbId
        const matchCourse = (cts || []).find((c: any) => c.slug === rSlug) || null
        const matchStudent = (studs || []).find((s: any) => s.id === rStudentId) || (studs || [])[0] || null
        if (matchCourse) setSelectedCourse(matchCourse as any)
        if (matchStudent) setSelectedStudent(matchStudent as any)
        setLoading(false)
        setStep(2)
        return
      }

      setLoading(false)
    }
    init()
  }, [])

  useEffect(() => {
    if (!success) return
    setCountdown(30)
    const interval = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) { clearInterval(interval); router.push('/dashboard'); return 0 }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [success])

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

    // 用 server API 繞過 RLS，取得教練當天所有 active booking 時段
    const bookedRes = await fetch(`/api/coach/booked-times?coach_id=${selectedCoach.id}&session_date=${dateStr}`)
    const { times: bookedTimes } = await bookedRes.json()

    const blockedTimes = new Set<string>()
    const sameTypeSessions: Record<string, any> = {}
    const studentBookedTimes = new Set<string>()

    for (const b of bookedTimes || []) {
      blockedTimes.add(b.time)
      if (b.student_id === selectedStudent?.id) {
        studentBookedTimes.add(b.time)
      }
    }

    // 仍需查同課程類型的 session 資訊（enrolled_count/max_students）
    const { data: coachBookings } = await supabase
      .from('class_sessions')
      .select('start_time, course_type_id, enrolled_count, max_students, id')
      .eq('coach_id', selectedCoach.id)
      .eq('session_date', dateStr)
      .eq('course_type_id', selectedCourse.id)

    for (const cs of coachBookings || []) {
      const t = cs.start_time.slice(0, 5)
      sameTypeSessions[t] = cs
    }

    const slots: TimeSlot[] = allSlots.map(t => {
      const maxStudents = selectedCourse.max_students
      if (blockedTimes.has(t) || studentBookedTimes.has(t)) {
        return { time: t, label: formatTime(t), available: false, enrolled: 1, max: 1 }
      }
      const existing = sameTypeSessions[t]
      if (existing) {
        const isFull = existing.enrolled_count >= existing.max_students
        return {
          time: t, label: formatTime(t),
          available: !isFull,
          enrolled: existing.enrolled_count, max: existing.max_students, session_id: isFull ? undefined : existing.id,
        }
      }
      return { time: t, label: formatTime(t), available: true, enrolled: 0, max: maxStudents }
    })

    setTimeSlots(slots)
  }

  const availableCredit = selectedCourse
    ? [...credits]
        .filter(c => c.course_type_id === selectedCourse.id && (c.total_credits - c.used_credits) > 0)
        .sort((a, b) => ((a as any).created_at || '').localeCompare((b as any).created_at || ''))
        [0] || null
    : null
  const totalRemainingCredits = selectedCourse
    ? credits.filter(c => c.course_type_id === selectedCourse.id).reduce((sum, c) => sum + (c.total_credits - c.used_credits), 0)
    : 0
  const remainingCredits = totalRemainingCredits

  async function handleConfirm() {
    if (!selectedStudent || !selectedCourse || !selectedCoach || !selectedDate || !selectedSlot || !parentId || !availableCredit) return
    setSubmitting(true)

    const dateStr = selectedDate.toISOString().split('T')[0]
    const startTime = selectedSlot.time
    const [h, m] = startTime.split(':').map(Number)
    const endMin = h * 60 + m + selectedCourse.duration_minutes
    const endTime = `${String(Math.floor(endMin/60)).padStart(2,'0')}:${String(endMin%60).padStart(2,'0')}`

    let sessionId = selectedSlot.session_id

    // 永遠先檢查教練時段衝突(不限課程類型)
    const { data: conflicts } = await supabase
      .from('class_sessions')
      .select('id, course_type_id, enrolled_count, max_students')
      .eq('coach_id', selectedCoach.id)
      .eq('session_date', dateStr)
      .eq('start_time', startTime)
      .eq('status', 'open')
      .gt('enrolled_count', 0)

    // 如果教練這個時段已有任何課程有人(含同課程類型),且不是可以加入的同課程 session
    const sameCourseSession = (conflicts || []).find(c => c.course_type_id === selectedCourse.id)
    const otherCourseConflict = (conflicts || []).some(c => c.course_type_id !== selectedCourse.id)

    if (otherCourseConflict) {
      alert('此時段教練已有其他課程，請選擇其他時間')
      setSubmitting(false)
      return
    }

    // 同課程類型但已有 session 且已額滿
    if (sameCourseSession && sameCourseSession.enrolled_count >= sameCourseSession.max_students) {
      alert('此時段已額滿，請選擇其他時間')
      setSubmitting(false)
      return
    }

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

    const isPartnerBooking = selectedCourse?.slug === '1on2' && selectedStudent2 && (selectedStudent2 as any).isPartner === true

    const { error: bookErr, data: initiatorBookingData } = await supabase
      .from('bookings')
      .insert({
        class_session_id: sessionId,
        parent_id: parentId,
        lesson_credit_id: isPartnerBooking ? null : availableCredit.id,
        student_id: selectedStudent.id,
        status: isPartnerBooking ? 'pending_partner' : 'confirmed',
        pending_action: isPartnerBooking ? 'await_partner' : null,
        pending_expires_at: isPartnerBooking ? new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString() : null,
      })
      .select('id')
      .single()

    if (bookErr) {
      if (bookErr.message?.includes('coach_timeslot_conflict')) {
        alert('此時段教練已有其他課程，請選擇其他時間')
      } else {
        alert('預約失敗，請稍後再試')
      }
      setSubmitting(false)
      return
    }

    if (!isPartnerBooking) {
      await supabase
        .from('lesson_credits')
        .update({ used_credits: availableCredit.used_credits + 1 })
        .eq('id', availableCredit.id)

      await supabase.rpc('increment_enrolled', { session_id: sessionId })
    }

    // 1-on-2：處理第二位學生
    if (selectedCourse.slug === '1on2' && selectedStudent2) {
      const isPartnerS = (selectedStudent2 as any).isPartner === true
      if (isPartnerS) {
        // 跨帳戶：用 server API 建立 pending 預約（繞過 RLS）
        const ps2 = selectedStudent2 as PartnerStudent
        const pendingRes = await fetch('/api/bookings/create-partner-pending', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            class_session_id: sessionId,
            partner_parent_id: ps2.partnerParentId,
            partner_student_id: ps2.id,
            initiator_parent_id: parentId,
            initiator_booking_id: initiatorBookingData?.id || null,
            partnership_id: ps2.partnershipId || null,
            courseName: selectedCourse?.name,
            coachName: selectedCoach?.first_name,
            date: dateStr,
            time: formatTime(startTime),
            studentName: ps2.full_name,
          })
        })


      } else {
        // 同帳戶：扣第二個 credit，建立 confirmed 預約
        const creditForS2 = [...credits]
          .filter(c => c.course_type_id === selectedCourse.id)
          .sort((a, b) => ((a as any).created_at || '').localeCompare((b as any).created_at || ''))
          .find(c => {
            const usedNow = c.id === availableCredit.id ? availableCredit.used_credits + 1 : c.used_credits
            return (c.total_credits - usedNow) > 0
          }) || null
        if (creditForS2) {
          const usedNow = creditForS2.id === availableCredit.id ? availableCredit.used_credits + 1 : creditForS2.used_credits
          await supabase.from('bookings').insert({
            class_session_id: sessionId,
            parent_id: parentId,
            lesson_credit_id: creditForS2.id,
            student_id: selectedStudent2.id,
            status: 'confirmed',
          })
          await supabase.from('lesson_credits').update({ used_credits: usedNow + 1 }).eq('id', creditForS2.id)
          await supabase.rpc('increment_enrolled', { session_id: sessionId })
        }
      }
    }

    const rbIdToCancel = rescheduleBookingIdRef.current || rescheduleBookingId
    if (rbIdToCancel) {
      const { data: oldBookingData } = await supabase
        .from('bookings')
        .select('lesson_credit_id, class_session_id')
        .eq('id', rbIdToCancel)
        .single()
      await supabase.from('bookings')
        .update({ status: 'cancelled', cancellation_reason: 'rescheduled' })
        .eq('id', rbIdToCancel)
      if (oldBookingData?.class_session_id) {
        await supabase.rpc('decrement_enrolled', { session_id: oldBookingData.class_session_id })
      }
      const { data: oldBooking } = await supabase
        .from('bookings')
        .select('lesson_credit_id')
        .eq('id', rbIdToCancel)
        .single()
      if (oldBooking?.lesson_credit_id) {
        const { data: oldCredit } = await supabase
          .from('lesson_credits')
          .select('used_credits')
          .eq('id', oldBooking.lesson_credit_id)
          .single()
        if (oldCredit) {
          await supabase
            .from('lesson_credits')
            .update({ used_credits: Math.max(0, oldCredit.used_credits - 1) })
            .eq('id', oldBooking.lesson_credit_id)
        }
      }
    }

    try {
      const { data: parentData } = await supabase.from('parents').select('first_name, last_name, email').eq('id', parentId).single()
      if (parentData) {
        await fetch('/api/email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: rbIdToCancel ? 'booking_rescheduled' : 'booking_confirmed',
            to: parentData.email,
            parentName: parentData.first_name,
            studentName: selectedStudent.full_name,
            courseName: selectedCourse.name,
            coachName: `${selectedCoach.first_name} ${selectedCoach.last_name}`,
            date: dateStr,
            time: `${startTime} – ${endTime}`,
          }),
        })
      }
    } catch (e) { console.error('Email error:', e) }

    setSubmitting(false)
    setSuccess(true)
  }

  function getDaysInMonth(y: number, m: number) { return new Date(y, m + 1, 0).getDate() }
  function getFirstDayOfMonth(y: number, m: number) { return new Date(y, m, 1).getDay() }

  function isDateAvailable(date: Date): boolean {
    const todayMidnight = new Date(today)
    todayMidnight.setHours(0, 0, 0, 0)
    if (date < todayMidnight) return false
    const maxDate = new Date(today)
    maxDate.setDate(maxDate.getDate() + 60)
    if (date > maxDate) return false
    return true
  }

  function isToday(date: Date): boolean {
    const todayMidnight = new Date(today)
    todayMidnight.setHours(0, 0, 0, 0)
    const dateMidnight = new Date(date)
    dateMidnight.setHours(0, 0, 0, 0)
    return dateMidnight.getTime() === todayMidnight.getTime()
  }

  function isNextDayBlocked(date: Date): boolean {
    const nowLA = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }))
    const isPastCutoff = nowLA.getHours() > 19 || (nowLA.getHours() === 19 && nowLA.getMinutes() >= 30)
    if (!isPastCutoff) return false
    const tomorrow = new Date(nowLA)
    tomorrow.setDate(tomorrow.getDate() + 1)
    tomorrow.setHours(0, 0, 0, 0)
    const tomorrowEnd = new Date(tomorrow)
    tomorrowEnd.setHours(23, 59, 59, 999)
    return date >= tomorrow && date <= tomorrowEnd
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
          {isReschedule ? 'Lesson Rescheduled!' : 'Lesson Booked!'}
        </h2>
        <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.6)', lineHeight: 1.7, marginBottom: '4px' }}>
          <strong style={{ color: '#fff' }}>{selectedStudent?.full_name}</strong> is booked for
        </p>
        <p style={{ fontSize: '14px', color: GOLD, fontWeight: 600, marginBottom: '4px' }}>
          {selectedCourse?.name} with {selectedCoach?.first_name}
        </p>
        <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.6)', marginBottom: '20px' }}>
          {selectedDate?.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })} at {selectedSlot?.label}
        </p>

        <div style={{
          display: 'flex', alignItems: 'center', gap: '10px',
          background: 'rgba(201,168,76,0.08)', border: '1px solid rgba(201,168,76,0.2)',
          borderRadius: '10px', padding: '12px 16px', marginBottom: '24px', textAlign: 'left',
        }}>
          <span style={{ fontSize: '20px', flexShrink: 0 }}>📧</span>
          <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.6)', margin: 0, lineHeight: 1.5 }}>
            A confirmation email has been sent to your inbox.
          </p>
        </div>

        <Link href="/dashboard" style={{
          display: 'block', padding: '13px 32px',
          background: GOLD, color: NAVY, borderRadius: '8px',
          fontSize: '13px', fontWeight: 700, letterSpacing: '1.5px',
          textTransform: 'uppercase', textDecoration: 'none', marginBottom: '12px',
        }}>
          Back to Dashboard
        </Link>
        <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.3)', margin: 0 }}>
          Redirecting in {countdown}s...
        </p>
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
            <img src="/logo.png" alt="Manta Shark" style={{ height: '64px' }} />
          </Link>
          <div style={{ width: 1, height: 20, background: 'rgba(255,255,255,0.12)' }} />
          <span style={{ fontSize: '13px', fontWeight: 600, color: 'rgba(255,255,255,0.6)' }}>
            {isReschedule ? 'Reschedule Lesson' : 'Book a Lesson'}
          </span>
        </div>
        <Link href="/dashboard" style={{ fontSize: '13px', color: 'rgba(255,255,255,0.5)', textDecoration: 'none' }}>
          ← Dashboard
        </Link>
      </div>

      <div style={{ maxWidth: '800px', margin: '0 auto', padding: 'clamp(24px,4vw,48px) clamp(20px,5vw,48px)' }}>

        {isReschedule && (
          <div style={{ marginBottom: '20px', padding: '14px 18px', background: 'rgba(201,168,76,0.1)', border: '1px solid rgba(201,168,76,0.3)', borderRadius: '10px', fontSize: '13px', color: '#c9a84c', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>📅</span> Rescheduling — pick a new coach, date and time below. Your current lesson will be cancelled only after you confirm.
          </div>
        )}

        <Steps current={step} />

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
            >Continue →</button>
          </div>
        )}

        {step === 1 && (
          <div>
            <SectionTitle eyebrow="Step 2" title="What type of lesson?" />
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {courseTypes.filter(ct => ct.slug !== 'team').map(ct => {
                const color = COURSE_COLORS[ct.slug] || GOLD
                const remaining = credits
                  .filter(c => c.course_type_id === ct.id)
                  .reduce((sum, c) => sum + (c.total_credits - c.used_credits), 0)
                return (
                  <SelectCard key={ct.id} selected={selectedCourse?.id === ct.id} onClick={() => setSelectedCourse(ct)} color={color}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                        <span style={{ fontSize: '28px' }}>{COURSE_ICONS[ct.slug]}</span>
                        <div>
                          <div style={{ fontSize: '15px', fontWeight: 700, color: '#fff', marginBottom: '2px' }}>{ct.name}</div>
                          <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)' }}>
                            {ct.duration_minutes} min · Max {ct.max_students} student{ct.max_students > 1 ? 's' : ''}
                          </div>
                        </div>
                      </div>
                      {remaining > 0 ? (
                        <div style={{
                          background: `${color}20`, border: `1px solid ${color}40`,
                          borderRadius: '20px', padding: '4px 12px',
                          fontSize: '12px', fontWeight: 700, color,
                        }}>{remaining} credits</div>
                      ) : (
                        <div style={{
                          background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
                          borderRadius: '20px', padding: '4px 12px',
                          fontSize: '11px', color: 'rgba(255,255,255,0.3)',
                        }}>No credits</div>
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

            {/* 1-on-2：選第二位學生 */}
            {selectedCourse?.slug === '1on2' && availableCredit && (
              <div style={{ marginTop: '20px' }}>
                <div style={{ fontSize: '12px', fontWeight: 700, color: 'rgba(255,255,255,0.5)', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: '12px' }}>
                  👥 Select 2nd Student
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {students.filter(s => s.id !== selectedStudent?.id).map(s => (
                    <SelectCard key={s.id} selected={selectedStudent2?.id === s.id} onClick={() => setSelectedStudent2(s)} color="#4a90c4">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: '#4a90c4', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', fontWeight: 900, color: '#fff', fontFamily: "'Playfair Display', serif", flexShrink: 0 }}>
                          {s.full_name.split(' ').map((n: string) => n[0]).join('').slice(0, 2)}
                        </div>
                        <div>
                          <div style={{ fontSize: '14px', fontWeight: 700, color: '#fff' }}>{s.full_name}</div>
                          <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)' }}>{s.current_level ? `Level ${s.current_level}` : 'Pending Assessment'} · Same account</div>
                        </div>
                      </div>
                    </SelectCard>
                  ))}
                  {partnerStudents.map(s => (
                    <SelectCard key={s.id} selected={selectedStudent2?.id === s.id} onClick={() => setSelectedStudent2(s)} color="#4a90c4">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: '#7b61c4', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', fontWeight: 900, color: '#fff', fontFamily: "'Playfair Display', serif", flexShrink: 0 }}>
                          {s.full_name.split(' ').map((n: string) => n[0]).join('').slice(0, 2)}
                        </div>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <div style={{ fontSize: '14px', fontWeight: 700, color: '#fff' }}>{s.full_name}</div>
                            <span style={{ fontSize: '10px', background: 'rgba(123,97,196,0.2)', border: '1px solid rgba(123,97,196,0.4)', borderRadius: '4px', padding: '1px 5px', color: '#a78bfa' }}>連動</span>
                          </div>
                          <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)' }}>{s.current_level ? `Level ${s.current_level}` : 'Pending Assessment'} · 需對方 12 小時內確認</div>
                        </div>
                      </div>
                    </SelectCard>
                  ))}
                  {students.filter(s => s.id !== selectedStudent?.id).length === 0 && partnerStudents.length === 0 && (
                    <div style={{ padding: '16px', background: 'rgba(255,255,255,0.04)', borderRadius: '10px', fontSize: '13px', color: 'rgba(255,255,255,0.4)', textAlign: 'center' }}>
                      No other students available. Add a student or link an account.
                    </div>
                  )}
                </div>
                {selectedStudent2 && !(selectedStudent2 as any).isPartner && remainingCredits < 2 && (
                  <div style={{ marginTop: '10px', padding: '10px 14px', background: 'rgba(224,90,74,0.1)', border: '1px solid rgba(224,90,74,0.3)', borderRadius: '8px', fontSize: '12px', color: '#e05a4a' }}>
                    ⚠️ 1-on-2 需要 2 堂 credit。目前剩餘 {remainingCredits} 堂。{' '}
                    <Link href="/plans" style={{ color: GOLD, fontWeight: 700 }}>購買方案 →</Link>
                  </div>
                )}
                {selectedStudent2 && (selectedStudent2 as any).isPartner && (
                  <div style={{ marginTop: '10px', padding: '10px 14px', background: 'rgba(123,97,196,0.1)', border: '1px solid rgba(123,97,196,0.3)', borderRadius: '8px', fontSize: '12px', color: '#a78bfa' }}>
                    📋 跨帳戶預約：對方需在 12 小時內確認並扣除其帳戶 1 堂 credit。
                  </div>
                )}
              </div>
            )}

            <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
              <button onClick={() => setStep(0)} style={{
                flex: 1, padding: '14px', background: 'transparent',
                color: 'rgba(255,255,255,0.5)', border: '1px solid rgba(255,255,255,0.15)',
                borderRadius: '10px', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
              }}>← Back</button>
              <button
                onClick={() => {
                  if (!selectedCourse || !availableCredit) return
                  if (selectedCourse.slug === '1on2') {
                    if (!selectedStudent2) return
                    if (!(selectedStudent2 as any).isPartner && remainingCredits < 2) return
                  }
                  setStep(2)
                }}
                disabled={
                  !selectedCourse || !availableCredit ||
                  (selectedCourse?.slug === '1on2' && !selectedStudent2) ||
                  (selectedCourse?.slug === '1on2' && !(selectedStudent2 as any)?.isPartner && remainingCredits < 2)
                }
                style={{
                  flex: 2, padding: '14px',
                  background: (!selectedCourse || !availableCredit || (selectedCourse?.slug === '1on2' && (!selectedStudent2 || (!(selectedStudent2 as any)?.isPartner && remainingCredits < 2)))) ? 'rgba(255,255,255,0.1)' : GOLD,
                  color: (!selectedCourse || !availableCredit || (selectedCourse?.slug === '1on2' && (!selectedStudent2 || (!(selectedStudent2 as any)?.isPartner && remainingCredits < 2)))) ? 'rgba(255,255,255,0.3)' : NAVY,
                  border: 'none', borderRadius: '10px',
                  fontSize: '13px', fontWeight: 700, letterSpacing: '1.5px',
                  textTransform: 'uppercase', cursor: 'pointer',
                }}
              >Continue →</button>
            </div>
          </div>
        )}

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
              <button onClick={() => isReschedule ? window.location.href = '/dashboard' : setStep(1)} style={{
                flex: 1, padding: '14px', background: 'transparent',
                color: 'rgba(255,255,255,0.5)', border: '1px solid rgba(255,255,255,0.15)',
                borderRadius: '10px', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
              }}>{isReschedule ? '← Cancel' : '← Back'}</button>
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
                  const isTodayDate = date.toDateString() === today.toDateString()
                  return (
                    <button key={i}
                      onClick={() => { if (available) { setSelectedDate(date); setSelectedSlot(null); setTimeSlots([]) } }}
                      style={{
                        padding: '8px 4px', borderRadius: '8px', border: 'none',
                        background: isSelected ? GOLD : isTodayDate ? 'rgba(255,255,255,0.08)' : 'transparent',
                        color: isSelected ? NAVY : available ? '#fff' : 'rgba(255,255,255,0.2)',
                        fontSize: '13px', fontWeight: isSelected ? 700 : 400,
                        cursor: available ? 'pointer' : 'not-allowed',
                        outline: isTodayDate && !isSelected ? `1px solid ${GOLD}40` : 'none',
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
                {isToday(selectedDate) && (
                  <div style={{ background: 'rgba(201,168,76,0.1)', border: '1px solid rgba(201,168,76,0.3)', borderRadius: '10px', padding: '14px 16px', marginBottom: '16px', display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                    <span style={{ fontSize: '16px' }}>📅</span>
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 700, color: '#c9a84c', marginBottom: '4px' }}>Same-Day Booking</div>
                      <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.6)', lineHeight: 1.5 }}>Same-day bookings must be made through us. Please contact us and we'll reserve your spot.</div>
                      <button onClick={() => { const btn = document.querySelector('[data-chat-toggle]') as HTMLButtonElement; if (btn) btn.click() }} style={{ display: 'inline-block', marginTop: '8px', fontSize: '12px', color: '#c9a84c', fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>💬 Chat with Us →</button>
                    </div>
                  </div>
                )}
                {isNextDayBlocked(selectedDate) && (
                  <div style={{ background: 'rgba(201,168,76,0.1)', border: '1px solid rgba(201,168,76,0.3)', borderRadius: '10px', padding: '14px 16px', marginBottom: '16px', display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                    <span style={{ fontSize: '16px' }}>⚠️</span>
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 700, color: '#c9a84c', marginBottom: '4px' }}>Advance Booking Required</div>
                      <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.6)', lineHeight: 1.5 }}>Bookings for the next day must be made through us after 7:30 PM. Please contact us and we'll reserve your spot.</div>
                      <button onClick={() => { const btn = document.querySelector('[data-chat-toggle]') as HTMLButtonElement; if (btn) btn.click() }} style={{ display: 'inline-block', marginTop: '8px', fontSize: '12px', color: '#c9a84c', fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>💬 Chat with Us →</button>
                    </div>
                  </div>
                )}
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
                        {selectedCourse && (selectedCourse.slug === '1on4' || selectedCourse.slug === 'team') && (
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
                onClick={() => { if (selectedSlot && !isNextDayBlocked(selectedDate!) && !isToday(selectedDate!)) setStep(4) }}
                disabled={!selectedSlot || isNextDayBlocked(selectedDate!) || isToday(selectedDate!)}
                style={{
                  flex: 2, padding: '14px',
                  background: (selectedSlot && !isNextDayBlocked(selectedDate!) && !isToday(selectedDate!)) ? GOLD : 'rgba(255,255,255,0.1)',
                  color: (selectedSlot && !isNextDayBlocked(selectedDate!) && !isToday(selectedDate!)) ? NAVY : 'rgba(255,255,255,0.3)',
                  border: 'none', borderRadius: '10px',
                  fontSize: '13px', fontWeight: 700, letterSpacing: '1.5px',
                  textTransform: 'uppercase', cursor: (selectedSlot && !isNextDayBlocked(selectedDate!) && !isToday(selectedDate!)) ? 'pointer' : 'not-allowed',
                }}
              >Continue →</button>
            </div>
          </div>
        )}

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
                { label: 'Credits Used', value: (selectedCourse?.slug === '1on2' && selectedStudent2 && !(selectedStudent2 as any).isPartner) ? '2 credits' : '1 credit' },
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
                <span style={{ fontSize: '13px', fontWeight: 700, color: GOLD }}>{isReschedule ? remainingCredits : (selectedCourse?.slug === '1on2' && selectedStudent2 && !(selectedStudent2 as any).isPartner) ? remainingCredits - 2 : remainingCredits - 1} credits</span>
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
              >{submitting ? 'Booking...' : isReschedule ? 'Confirm Reschedule ✓' : 'Confirm Booking ✓'}</button>
            </div>
          </div>
        )}
      </div>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,700;0,900;1,700&family=DM+Sans:wght@400;500;600;700&display=swap');`}</style>
      {parentId && <ChatWidget parentId={parentId} />}
    </div>
  )
}
