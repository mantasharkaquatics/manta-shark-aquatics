'use client'
import PartnershipSection from './PartnershipSection'
import ChatWidget from '@/components/ChatWidget'

import { useEffect, useState, useRef } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import QRCode from 'qrcode'

const NAVY = '#1a2744'
const DARK = '#111d38'
const GOLD = '#c9a84c'

const LEVEL_COLORS: Record<number, string> = {
  1: '#e05a4a', 2: '#e8883a', 3: '#d4a825', 4: '#4caf72',
  5: '#4a90c4', 6: '#7b5ea7', 7: '#9c7a3c', 8: '#a0a0a0', 9: '#c9a84c',
}
const LEVEL_NAMES: Record<number, string> = {
  1: 'Water Intro', 2: 'Water Comfort', 3: 'Pool Safety', 4: 'Beginner',
  5: 'Intermediate', 6: 'Advanced', 7: 'Bronze', 8: 'Silver', 9: 'Gold',
}

interface Parent { id: string; first_name: string; last_name: string; email: string }
interface Student { id: string; full_name: string; date_of_birth: string; current_level: number | null; gender: string; trial_used_at: string | null }
interface Credit {
  id: string
  total_credits: number
  used_credits: number
  course_type_id: string
  student_id: string | null
  created_at?: string
  course_types?: { name: string } | { name: string }[]
  purchases?: { paid_at: string | null; created_at: string } | { paid_at: string | null; created_at: string }[]
}
interface Booking {
  id: string; status: string
  session_date: string; start_time: string; end_time: string
  course_name: string; coach_name: string; student_name?: string
  lesson_credit_id?: string
  course_slug?: string
  student_id?: string
  is_trial?: boolean
}

function getAge(dob: string): number {
  const birth = new Date(dob)
  const today = new Date()
  let age = today.getFullYear() - birth.getFullYear()
  const m = today.getMonth() - birth.getMonth()
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--
  return age
}

function getInitials(name: string): string {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
}

function formatTime(t: string): string {
  const [h, m] = t.split(':').map(Number)
  const ampm = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 || 12
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`
}

function formatDate(d: string): string {
  const date = new Date(d + 'T00:00:00')
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

function getDaysUntil(d: string): number {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const date = new Date(d + 'T00:00:00')
  return Math.round((date.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
}

// QR payload: base64 encode of student_id so it's not raw UUID
function makeQRPayload(studentId: string): string {
  return `MSA:${btoa(studentId)}`
}

const QUICK_LINKS = [
  { label: 'Book a Lesson', icon: '📅', href: '/booking', color: GOLD, desc: 'Schedule your next session' },
  { label: 'Swim Levels', icon: '🏊', href: '/levels', color: '#4a90c4', desc: 'View curriculum & progress' },
  { label: 'Swim Plans', icon: '📦', href: '/plans', color: '#4caf72', desc: 'Browse lesson packages' },
  { label: 'Policies', icon: '📋', href: '/policies', color: '#9c7a3c', desc: 'Rules & terms' },
]

const STATUS_COLORS: Record<string, string> = {
  confirmed: '#4caf72',
  cancelled: '#e05a4a',
  completed: '#a0a0a0',
  pending: GOLD,
}

// QR Modal Component
function QRModal({ student, onClose }: { student: Student; onClose: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [qrDataUrl, setQrDataUrl] = useState<string>('')

  useEffect(() => {
    const payload = makeQRPayload(student.id)
    QRCode.toDataURL(payload, {
      width: 280,
      margin: 2,
      color: { dark: '#1a2744', light: '#ffffff' },
      errorCorrectionLevel: 'H',
    }).then(setQrDataUrl)
  }, [student.id])

  const handleDownload = () => {
    if (!qrDataUrl) return
    const a = document.createElement('a')
    a.href = qrDataUrl
    a.download = `${student.full_name.replace(/\s+/g, '_')}_QR.png`
    a.click()
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1000, padding: '20px',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: NAVY, borderRadius: '20px',
          border: '1px solid rgba(255,255,255,0.12)',
          padding: '36px', maxWidth: '360px', width: '100%',
          textAlign: 'center', position: 'relative',
        }}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          style={{
            position: 'absolute', top: '16px', right: '16px',
            background: 'rgba(255,255,255,0.08)', border: 'none',
            borderRadius: '50%', width: '32px', height: '32px',
            color: 'rgba(255,255,255,0.6)', fontSize: '16px',
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >×</button>

        {/* Header */}
        <div style={{ marginBottom: '24px' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase', color: GOLD, marginBottom: '6px' }}>
            Check-in QR Code
          </div>
          <div style={{ fontFamily: "'Playfair Display', serif", fontSize: '22px', fontWeight: 900, color: '#fff' }}>
            {student.full_name}
          </div>
        </div>

        {/* QR Code */}
        <div style={{
          background: '#fff', borderRadius: '16px', padding: '20px',
          display: 'inline-block', marginBottom: '20px',
          boxShadow: `0 0 0 4px ${GOLD}30`,
        }}>
          {qrDataUrl ? (
            <img src={qrDataUrl} alt="QR Code" style={{ display: 'block', width: '200px', height: '200px' }} />
          ) : (
            <div style={{ width: '200px', height: '200px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#999' }}>
              Loading...
            </div>
          )}
        </div>

        {/* Instructions */}
        <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.45)', margin: '0 0 20px', lineHeight: 1.6 }}>
          Show this QR code at the front desk to check in for today's lesson.
        </p>

        {/* Download button */}
        <button
          onClick={handleDownload}
          style={{
            width: '100%', padding: '12px', borderRadius: '10px',
            background: GOLD, color: NAVY, border: 'none',
            fontSize: '13px', fontWeight: 700, cursor: 'pointer',
            letterSpacing: '0.5px',
          }}
        >
          Download QR Code
        </button>
      </div>
    </div>
  )
}

function CreditCard({ g, remaining, pct, note }: {
  g: { name: string; total: number; used: number; items: { credits: number; used: number; date: string | null }[] }
  remaining: number
  pct: number
  note?: string
}) {
  const [expanded, setExpanded] = useState(false)
  return (
    <div style={{ background: '#1a2744', borderRadius: '14px', border: '1px solid rgba(255,255,255,0.08)', padding: '20px' }}>
      <div style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)', marginBottom: '8px' }}>
        {g.name}
      </div>
      <div style={{ fontFamily: "'Playfair Display', serif", fontSize: '36px', fontWeight: 900, color: '#c9a84c', lineHeight: 1 }}>{remaining}</div>
      <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', marginTop: '4px', marginBottom: note ? '2px' : '12px' }}>of {g.total} remaining</div>
      {note && <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.3)', marginBottom: '12px' }}>{note}</div>}
      <div style={{ height: '4px', background: 'rgba(255,255,255,0.08)', borderRadius: '2px', marginBottom: '12px' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: '#c9a84c', borderRadius: '2px' }} />
      </div>
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          background: 'none', border: 'none', padding: 0,
          fontSize: '11px', color: 'rgba(255,255,255,0.35)',
          cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px',
          letterSpacing: '0.5px',
        }}
      >
        <span style={{ fontSize: '9px' }}>{expanded ? '▲' : '▼'}</span>
        {expanded ? 'Hide' : 'Show'} {g.items.length} package{g.items.length > 1 ? 's' : ''}
      </button>
      {expanded && (
        <div style={{ marginTop: '12px', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {g.items.map((item, i) => {
            const itemRemaining = item.credits - item.used
            const dateStr = item.date ? new Date(item.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.35)' }}>{dateStr}</div>
                <div style={{ fontSize: '12px', fontWeight: 600, color: itemRemaining > 0 ? '#c9a84c' : 'rgba(255,255,255,0.2)' }}>
                  {itemRemaining} / {item.credits} left
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default function DashboardPage() {
  const supabase = createClient()
  const [parent, setParent] = useState<Parent | null>(null)
  const [students, setStudents] = useState<Student[]>([])
  const [credits, setCredits] = useState<Credit[]>([])
  const [activeTrialStudentIds, setActiveTrialStudentIds] = useState<Set<string>>(new Set())
  const [upcomingBookings, setUpcomingBookings] = useState<Booking[]>([])
  const [pastBookings, setPastBookings] = useState<Booking[]>([])
  const [loading, setLoading] = useState(true)
  const [greeting, setGreeting] = useState('Good morning')
  const [cancellingId, setCancellingId] = useState<string | null>(null)
  const [reschedulingId, setReschedulingId] = useState<string | null>(null)
  const [rescheduleTarget, setRescheduleTarget] = useState<{ id: string; creditId: string; slug: string; studentId: string; courseName: string; date: string; time: string } | null>(null)
  const [cancelTarget, setCancelTarget] = useState<{ id: string; courseName: string; date: string; time: string } | null>(null)
  const [qrStudent, setQrStudent] = useState<Student | null>(null)
  const [pendingPartnerBookings, setPendingPartnerBookings] = useState<any[]>([])
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const [rejectingId, setRejectingId] = useState<string | null>(null)

  useEffect(() => {
    const hour = new Date().getHours()
    if (hour < 12) setGreeting('Good morning')
    else if (hour < 17) setGreeting('Good afternoon')
    else setGreeting('Good evening')
  }, [])

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: parentData } = await supabase
      .from('parents').select('*').eq('auth_user_id', user.id).single()
    if (!parentData) return
    setParent(parentData)

    const today = new Date().toISOString().split('T')[0]

    console.log('fetchAll: parentId =', parentData.id)
    const [{ data: studs }, { data: credData }, { data: rawBookings }] = await Promise.all([
      supabase.from('students').select('*').eq('parent_id', parentData.id).eq('is_active', true).order('sort_order'),
      supabase
        .from('lesson_credits')
        .select('id, total_credits, used_credits, course_type_id, student_id, created_at, course_types(name), purchases(paid_at, created_at)')
        .eq('parent_id', parentData.id)
        .gt('total_credits', 0),
      supabase.from('bookings')
        .select('id, status, student_id, lesson_credit_id, is_trial, class_session_id')
        .eq('parent_id', parentData.id)
        .neq('status', 'cancelled')
        .order('created_at', { ascending: true }),
    ])

    // 分開查 class_sessions 和 students
    const sessionIds = [...new Set((rawBookings || []).map((b: any) => b.class_session_id).filter(Boolean))]
    const studentIds = [...new Set((rawBookings || []).map((b: any) => b.student_id).filter(Boolean))]

    const [{ data: sessionsData }, { data: studentsData }] = await Promise.all([
      sessionIds.length > 0
        ? supabase.from('class_sessions').select('id, session_date, start_time, end_time, course_types(name, slug), coaches(first_name)').in('id', sessionIds)
        : Promise.resolve({ data: [] }),
      studentIds.length > 0
        ? supabase.from('students').select('id, full_name').in('id', studentIds)
        : Promise.resolve({ data: [] }),
    ])

    const sessionMap: Record<string, any> = {}
    for (const s of sessionsData || []) {
      const ct = Array.isArray((s as any).course_types) ? (s as any).course_types[0] : (s as any).course_types
      const coach = Array.isArray((s as any).coaches) ? (s as any).coaches[0] : (s as any).coaches
      sessionMap[(s as any).id] = { ...(s as any), ct, coach }
    }
    const studentMap: Record<string, any> = {}
    for (const s of studentsData || []) { studentMap[(s as any).id] = s }

    setStudents(studs || [])
    setCredits((credData || []).filter((c: any) => (c.total_credits - c.used_credits) > 0))
    setActiveTrialStudentIds(new Set((rawBookings || []).filter((b: any) => b.is_trial).map((b: any) => b.student_id)))

    // 查詢待確認的跨帳戶預約
    const { data: pendingRaw } = await supabase
      .from('bookings')
      .select('id, student_id, pending_expires_at, partner_parent_id, class_session_id')
      .eq('parent_id', parentData.id)
      .eq('status', 'pending_partner')
      .eq('pending_action', 'confirm')
      .gt('pending_expires_at', new Date().toISOString())

    // 補齊 pending 的 session/student 資料
    const pendingSessionIds = [...new Set((pendingRaw || []).map((b: any) => b.class_session_id).filter(Boolean))]
    const pendingStudentIds = [...new Set((pendingRaw || []).map((b: any) => b.student_id).filter(Boolean))]
    const [{ data: pSessions }, { data: pStudents }] = await Promise.all([
      pendingSessionIds.length > 0
        ? supabase.from('class_sessions').select('id, session_date, start_time, end_time, course_types(name), coaches(first_name)').in('id', pendingSessionIds)
        : Promise.resolve({ data: [] }),
      pendingStudentIds.length > 0
        ? supabase.from('students').select('id, full_name').in('id', pendingStudentIds)
        : Promise.resolve({ data: [] }),
    ])
    const pSessionMap: Record<string, any> = {}
    for (const s of pSessions || []) {
      const ct = Array.isArray((s as any).course_types) ? (s as any).course_types[0] : (s as any).course_types
      const coach = Array.isArray((s as any).coaches) ? (s as any).coaches[0] : (s as any).coaches
      pSessionMap[(s as any).id] = { ...(s as any), course_types: ct, coaches: coach }
    }
    const pStudentMap: Record<string, any> = {}
    for (const s of pStudents || []) { pStudentMap[(s as any).id] = s }

    console.log('rawBookings:', JSON.stringify(rawBookings?.slice(0,2)))
    console.log('sessionIds:', sessionIds)
    console.log('sessionsData:', JSON.stringify(sessionsData?.slice(0,2)))
    setPendingPartnerBookings((pendingRaw || []).map((b: any) => ({
      ...b,
      class_sessions: pSessionMap[b.class_session_id] || null,
      students: pStudentMap[b.student_id] || null,
    })))

    const parseBookings = (data: any[]): Booking[] =>
      (data || []).map((b: any) => {
        const cs = sessionMap[b.class_session_id]
        return {
          id: b.id,
          status: b.status,
          session_date: cs?.session_date,
          start_time: cs?.start_time,
          end_time: cs?.end_time,
          course_name: cs?.ct?.name,
          coach_name: cs?.coach?.first_name,
          student_name: studentMap[b.student_id]?.full_name,
          lesson_credit_id: b.lesson_credit_id,
          course_slug: cs?.ct?.slug,
          student_id: b.student_id,
          is_trial: b.is_trial,
        }
      }).filter(b => b.session_date)

    const allUpcoming = parseBookings(rawBookings || []).filter(b => b.session_date >= today)
    const allPast = parseBookings(rawBookings || []).filter(b => b.session_date < today)

    setUpcomingBookings(allUpcoming.sort((a, b) => a.session_date.localeCompare(b.session_date)))
    setPastBookings(allPast.sort((a, b) => b.session_date.localeCompare(a.session_date)).slice(0, 10))
    setLoading(false)
  }

  async function confirmPartnerBooking(bookingId: string) {
    setConfirmingId(bookingId)
    const booking = pendingPartnerBookings.find(b => b.id === bookingId)
    if (!booking || !parent) { setConfirmingId(null); return }

    // 找對應課程類型的 credit
    const cs = Array.isArray(booking.class_sessions) ? booking.class_sessions[0] : booking.class_sessions
    const ct = cs ? (Array.isArray(cs.course_types) ? cs.course_types[0] : cs.course_types) : null

    const { data: myCredits } = await supabase
      .from('lesson_credits')
      .select('id, total_credits, used_credits, course_type_id, course_types(name)')
      .eq('parent_id', parent.id)
      .filter('total_credits', 'gt', 0)

    const creditToUse = (myCredits || [])
      .filter((c: any) => (c.total_credits - c.used_credits) > 0)
      .sort((a: any, b: any) => (a.created_at || '').localeCompare(b.created_at || ''))[0] || null

    if (!creditToUse) {
      alert('您沒有足夠的 credit 確認此預約，請先購買方案。')
      setConfirmingId(null)
      return
    }

    await supabase.from('bookings').update({
      status: 'confirmed',
      lesson_credit_id: creditToUse.id,
      pending_action: null,
      pending_expires_at: null,
    }).eq('id', bookingId)

    await supabase.from('lesson_credits').update({ used_credits: creditToUse.used_credits + 1 }).eq('id', creditToUse.id)
    // 寄確認通知給發起方
    try {
      const b = pendingPartnerBookings.find(x => x.id === bookingId)
      const cs = b ? (Array.isArray(b.class_sessions) ? b.class_sessions[0] : b.class_sessions) : null
      const ct = cs ? (Array.isArray(cs.course_types) ? cs.course_types[0] : cs.course_types) : null
      const coach = cs ? (Array.isArray(cs.coaches) ? cs.coaches[0] : cs.coaches) : null
      const partnerParentId = b?.partner_parent_id
      const stu = b ? (Array.isArray(b.students) ? b.students[0] : b.students) : null
      if (partnerParentId && cs && ct && coach && stu) {
        const { data: initiatorParent } = await supabase.from('parents').select('first_name, email').eq('id', partnerParentId).single()
        if (initiatorParent) {
          await fetch('/api/email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              type: 'partner_booking_confirmed',
              to: initiatorParent.email,
              parentName: initiatorParent.first_name,
              studentName: stu.full_name,
              courseName: ct.name,
              coachName: coach.first_name,
              date: cs.session_date,
              time: formatTime(cs.start_time),
            })
          })
        }
      }
    } catch {}
    await fetchAll()
    setConfirmingId(null)
  }

  async function rejectPartnerBooking(bookingId: string) {
    setRejectingId(bookingId)
    const { data: b } = await supabase.from('bookings').select('class_session_id').eq('id', bookingId).single()
    await supabase.from('bookings').update({ status: 'cancelled', pending_action: null }).eq('id', bookingId)
    if (b?.class_session_id) await supabase.rpc('decrement_enrolled', { session_id: b.class_session_id })

    // 寄拒絕通知給發起方
    try {
      const pending = pendingPartnerBookings.find(x => x.id === bookingId)
      const cs = pending ? (Array.isArray(pending.class_sessions) ? pending.class_sessions[0] : pending.class_sessions) : null
      const ct = cs ? (Array.isArray(cs.course_types) ? cs.course_types[0] : cs.course_types) : null
      const stu = pending ? (Array.isArray(pending.students) ? pending.students[0] : pending.students) : null
      const partnerParentId = pending?.partner_parent_id
      if (partnerParentId && cs && ct && stu) {
        const { data: initiatorParent } = await supabase.from('parents').select('first_name, email').eq('id', partnerParentId).single()
        if (initiatorParent) {
          await fetch('/api/email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              type: 'partner_booking_rejected',
              to: initiatorParent.email,
              parentName: initiatorParent.first_name,
              studentName: stu.full_name,
              courseName: ct.name,
              coachName: '',
              date: cs.session_date,
              time: formatTime(cs.start_time),
            })
          })
        }
      }
    } catch {}
    await fetchAll()
    setRejectingId(null)
  }

  function isWithin24Hours(sessionDate: string, startTime: string): boolean {
    const nowUTC = new Date()
    // 把課程時間當作 LA 時間，轉換成 UTC
    const sessionLAString = `${sessionDate}T${startTime}`
    const sessionUTC = new Date(new Date(sessionLAString).toLocaleString('en-US', { timeZone: 'UTC' }))
    const sessionLA = new Date(new Date(sessionLAString + ' America/Los_Angeles').toLocaleString('en-US', { timeZone: 'UTC' }))
    // 用 Intl 正確解析 LA 時間
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Los_Angeles',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
    })
    const parts = formatter.formatToParts(nowUTC)
    const get = (type: string) => parts.find(p => p.type === type)?.value ?? '0'
    const nowLA = new Date(`${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}`)
    const sessionStart = new Date(`${sessionDate}T${startTime}`)
    const diffMs = sessionStart.getTime() - nowLA.getTime()
    return diffMs <= 24 * 60 * 60 * 1000
  }

  async function cancelBooking(bookingId: string) {
    setCancellingId(bookingId)
    // 先取得 booking 詳細資料（含課程、學生、教練）
    const { data: bookingData } = await supabase
      .from('bookings')
      .select('lesson_credit_id, student_id, class_session_id, students(full_name), class_sessions(session_date, start_time, end_time, course_types(name), coaches(first_name, last_name))')
      .eq('id', bookingId)
      .single()
    // 取消 booking
    await supabase.from('bookings').update({ status: 'cancelled' }).eq('id', bookingId)
    // 退回 credit
    if (bookingData?.lesson_credit_id) {
      await supabase.rpc('increment_credit', { credit_id: bookingData.lesson_credit_id })
    }
    // 寄送取消 email
    try {
      if (bookingData && parent) {
        const session = Array.isArray(bookingData.class_sessions) ? bookingData.class_sessions[0] : bookingData.class_sessions
        const student = Array.isArray(bookingData.students) ? bookingData.students[0] : bookingData.students
        const courseType = session ? (Array.isArray(session.course_types) ? session.course_types[0] : session.course_types) : null
        const coach = session ? (Array.isArray(session.coaches) ? session.coaches[0] : session.coaches) : null
        if (session && student && courseType && coach) {
          await fetch('/api/email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              type: 'booking_cancelled',
              to: parent.email,
              parentName: parent.first_name,
              studentName: student.full_name,
              courseName: courseType.name,
              coachName: `${coach.first_name} ${coach.last_name}`,
              date: session.session_date,
              time: `${session.start_time} – ${session.end_time}`,
            }),
          })
        }
      }
    } catch (e) { console.error('Cancel email error:', e) }
    await fetchAll()
    setCancellingId(null)
  }

  function confirmReschedule() {
    if (!rescheduleTarget) return
    // 只跳到 booking 頁面，帶舊 booking ID，新課確認後才取消舊課
    window.location.href = `/booking?reschedule_booking_id=${rescheduleTarget.id}&reschedule_credit_id=${rescheduleTarget.creditId}&reschedule_slug=${rescheduleTarget.slug}&reschedule_student_id=${rescheduleTarget.studentId}`
  }

  if (loading) return (
    <div style={{ minHeight: '100vh', background: DARK, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '32px', marginBottom: '16px' }}>🦈</div>
        <div style={{ fontSize: '14px', color: 'rgba(255,255,255,0.5)' }}>Loading your dashboard...</div>
      </div>
    </div>
  )

  return (
    <div style={{ fontFamily: "'DM Sans', sans-serif", background: DARK, minHeight: '100vh' }}>
      {/* QR Modal */}
      {qrStudent && <QRModal student={qrStudent} onClose={() => setQrStudent(null)} />}

      {/* Cancel Confirm Modal */}
      {cancelTarget && (
        <div onClick={() => setCancelTarget(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#1a2744', borderRadius: '20px', border: '1px solid rgba(255,255,255,0.12)', padding: '32px', maxWidth: '380px', width: '100%' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase', color: '#e05a4a', marginBottom: '8px' }}>Cancel Lesson</div>
            <div style={{ fontFamily: "'Playfair Display', serif", fontSize: '20px', fontWeight: 900, color: '#fff', marginBottom: '16px' }}>Cancel this booking?</div>
            <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: '10px', padding: '14px 16px', marginBottom: '20px' }}>
              <div style={{ fontSize: '14px', fontWeight: 600, color: '#fff', marginBottom: '4px' }}>{cancelTarget.courseName}</div>
              <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.45)' }}>{cancelTarget.date} · {cancelTarget.time}</div>
            </div>
            <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.5)', lineHeight: 1.6, marginBottom: '24px' }}>
              This lesson will be cancelled and your credit will be returned to your account.
            </p>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={() => setCancelTarget(null)} style={{ flex: 1, padding: '12px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.15)', background: 'transparent', color: 'rgba(255,255,255,0.6)', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
                Keep Lesson
              </button>
              <button onClick={async () => { await cancelBooking(cancelTarget.id); setCancelTarget(null) }} style={{ flex: 1, padding: '12px', borderRadius: '10px', border: 'none', background: '#e05a4a', color: '#fff', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}>
                Yes, Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reschedule Confirm Modal */}
      {rescheduleTarget && (
        <div onClick={() => setRescheduleTarget(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#1a2744', borderRadius: '20px', border: '1px solid rgba(255,255,255,0.12)', padding: '32px', maxWidth: '380px', width: '100%' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase', color: '#c9a84c', marginBottom: '8px' }}>Reschedule Lesson</div>
            <div style={{ fontFamily: "'Playfair Display', serif", fontSize: '20px', fontWeight: 900, color: '#fff', marginBottom: '16px' }}>Change this booking?</div>
            <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: '10px', padding: '14px 16px', marginBottom: '20px' }}>
              <div style={{ fontSize: '14px', fontWeight: 600, color: '#fff', marginBottom: '4px' }}>{rescheduleTarget.courseName}</div>
              <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.45)' }}>{rescheduleTarget.date} · {rescheduleTarget.time}</div>
            </div>
            <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.5)', lineHeight: 1.6, marginBottom: '24px' }}>
              You'll be taken to the booking page to pick a new time. Your current lesson will only be cancelled after you confirm the new booking.
            </p>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={() => setRescheduleTarget(null)} style={{ flex: 1, padding: '12px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.15)', background: 'transparent', color: 'rgba(255,255,255,0.6)', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
                Keep Lesson
              </button>
              <button onClick={confirmReschedule} style={{ flex: 1, padding: '12px', borderRadius: '10px', border: 'none', background: '#c9a84c', color: '#1a2744', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}>
                Yes, Reschedule
              </button>
            </div>
          </div>
        </div>
      )}

<div style={{ maxWidth: '1100px', margin: '0 auto', padding: 'clamp(24px,4vw,48px) clamp(20px,5vw,48px)' }}>

        {/* GREETING */}
        <div style={{ marginBottom: '36px' }}>
          <div style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '2px', textTransform: 'uppercase', color: GOLD, marginBottom: '6px' }}>
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </div>
          <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: 'clamp(22px,3vw,34px)', fontWeight: 900, color: '#fff', margin: 0 }}>
            {greeting}, <em style={{ color: GOLD, fontStyle: 'italic' }}>{parent?.first_name}!</em>
          </h1>
          <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.5)', marginTop: '6px' }}>Here's a summary of your swimmers.</p>
        </div>

        {/* STUDENTS */}
        <section style={{ marginBottom: '36px' }}>
          <h2 style={{ fontSize: '13px', fontWeight: 700, color: 'rgba(255,255,255,0.5)', margin: '0 0 16px', letterSpacing: '1.5px', textTransform: 'uppercase' }}>My Swimmers</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
            {students.map((student) => {
              const hasLevel = student.current_level && Number(student.current_level) >= 1
              const levelColor = hasLevel ? (LEVEL_COLORS[Number(student.current_level)] || GOLD) : 'rgba(255,255,255,0.2)'
              const levelName = hasLevel ? LEVEL_NAMES[Number(student.current_level)] : null
              const age = student.date_of_birth ? getAge(student.date_of_birth) : null
              return (
                <div key={student.id} style={{ background: NAVY, borderRadius: '16px', border: '1px solid rgba(255,255,255,0.08)', padding: '24px', position: 'relative', overflow: 'hidden' }}>
                  <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '3px', background: levelColor }} />
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px' }}>
                    <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: levelColor, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Playfair Display', serif", fontSize: '18px', fontWeight: 900, color: '#fff', flexShrink: 0 }}>
                      {getInitials(student.full_name)}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '16px', fontWeight: 700, color: '#fff', marginBottom: '2px' }}>{student.full_name}</div>
                      <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)' }}>
                        {age !== null ? `Age ${age}` : 'Age unknown'}
                        {student.gender === 'male' ? ' · 👦' : student.gender === 'female' ? ' · 👧' : ''}
                      </div>
                    </div>
                  </div>
                  <div style={{ marginTop: '16px', background: hasLevel ? `${levelColor}18` : 'rgba(255,255,255,0.04)', border: `1px solid ${hasLevel ? levelColor + '35' : 'rgba(255,255,255,0.1)'}`, borderRadius: '10px', padding: '12px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                      <div style={{ fontSize: '10px', fontWeight: 600, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)', marginBottom: '2px' }}>Current Level</div>
                      {hasLevel ? (
                        <div style={{ fontSize: '14px', fontWeight: 700, color: '#fff' }}>Level {student.current_level} · {levelName}</div>
                      ) : (
                        <div style={{ fontSize: '14px', fontWeight: 700, color: 'rgba(255,255,255,0.4)' }}>Pending Assessment</div>
                      )}
                    </div>
                    {hasLevel ? (
                      <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: levelColor, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', fontWeight: 700, color: '#fff' }}>
                        {student.current_level}
                      </div>
                    ) : (
                      <div style={{ fontSize: '20px' }}>📋</div>
                    )}
                  </div>

                  {/* QR Code Button */}
                  <button
                    onClick={() => setQrStudent(student)}
                    style={{
                      marginTop: '12px', width: '100%', padding: '10px',
                      borderRadius: '10px', border: `1px solid ${GOLD}40`,
                      background: 'transparent', color: GOLD,
                      fontSize: '12px', fontWeight: 700, cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                      letterSpacing: '0.5px',
                    }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = `${GOLD}15` }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                  >
                    <span style={{ fontSize: '14px' }}>⊞</span> View Check-in QR Code
                  </button>
                </div>
              )
            })}
          </div>
        </section>

        {/* PENDING PARTNER BOOKINGS 通知 */}
        {pendingPartnerBookings.length > 0 && (
          <section style={{ marginBottom: '28px' }}>
            <h2 style={{ fontSize: '13px', fontWeight: 700, color: 'rgba(255,255,255,0.5)', margin: '0 0 12px', letterSpacing: '1.5px', textTransform: 'uppercase' }}>⏳ 待確認邀請</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {pendingPartnerBookings.map((b: any) => {
                const cs = Array.isArray(b.class_sessions) ? b.class_sessions[0] : b.class_sessions
                const student = Array.isArray(b.students) ? b.students[0] : b.students
                const coach = cs ? (Array.isArray(cs.coaches) ? cs.coaches[0] : cs.coaches) : null
                const ct = cs ? (Array.isArray(cs.course_types) ? cs.course_types[0] : cs.course_types) : null
                const expiresAt = new Date(b.pending_expires_at)
                const hoursLeft = Math.max(0, Math.round((expiresAt.getTime() - Date.now()) / 3600000))
                return (
                  <div key={b.id} style={{ background: 'rgba(123,97,196,0.1)', border: '1px solid rgba(123,97,196,0.35)', borderRadius: '14px', padding: '16px 20px' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
                      <div>
                        <div style={{ fontSize: '11px', color: '#a78bfa', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '4px' }}>🔔 跨帳戶預約邀請</div>
                        <div style={{ fontSize: '14px', fontWeight: 700, color: '#fff', marginBottom: '2px' }}>
                          {student?.full_name} 被邀請上課
                        </div>
                        <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)', marginBottom: '2px' }}>
                          {ct?.name} · {coach?.first_name} · {cs?.session_date ? formatDate(cs.session_date) : ''} {cs?.start_time ? formatTime(cs.start_time) : ''}
                        </div>
                        <div style={{ fontSize: '11px', color: hoursLeft <= 3 ? '#f87171' : 'rgba(255,255,255,0.35)' }}>
                          ⏱ 剩餘 {hoursLeft} 小時確認，否則自動取消
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                        <button
                          onClick={() => rejectPartnerBooking(b.id)}
                          disabled={rejectingId === b.id || confirmingId === b.id}
                          style={{ padding: '8px 16px', background: 'rgba(248,113,113,0.15)', border: '1px solid rgba(248,113,113,0.4)', borderRadius: '8px', color: '#f87171', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>
                          {rejectingId === b.id ? '...' : '拒絕'}
                        </button>
                        <button
                          onClick={() => confirmPartnerBooking(b.id)}
                          disabled={confirmingId === b.id || rejectingId === b.id}
                          style={{ padding: '8px 16px', background: '#7b61c4', border: 'none', borderRadius: '8px', color: '#fff', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}>
                          {confirmingId === b.id ? '確認中...' : '確認參加（扣 1 credit）'}
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
        )}

        {/* UPCOMING LESSONS */}
        <section style={{ marginBottom: '36px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
            <h2 style={{ fontSize: '13px', fontWeight: 700, color: 'rgba(255,255,255,0.5)', margin: 0, letterSpacing: '1.5px', textTransform: 'uppercase' }}>Upcoming Lessons</h2>
            <button onClick={() => window.location.href = '/booking'} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 700, color: GOLD, textDecoration: 'none', border: `1px solid ${GOLD}40`, borderRadius: '8px', padding: '6px 14px', background: 'transparent', cursor: 'pointer' }}>
              + Book a Lesson
            </button>
          </div>
          {upcomingBookings.length === 0 ? (
            <div style={{ background: NAVY, borderRadius: '14px', border: '1px dashed rgba(255,255,255,0.12)', padding: '32px', textAlign: 'center' }}>
              <div style={{ fontSize: '28px', marginBottom: '10px' }}>📅</div>
              <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.4)', margin: '0 0 16px' }}>No upcoming lessons.</p>
              <button onClick={() => window.location.href = '/booking'} style={{ display: 'inline-block', padding: '10px 24px', background: GOLD, color: NAVY, borderRadius: '8px', fontSize: '12px', fontWeight: 700, border: 'none', cursor: 'pointer', letterSpacing: '1px', textTransform: 'uppercase' }}>Book Now</button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {upcomingBookings.map((booking) => {
                const daysUntil = getDaysUntil(booking.session_date)
                const isToday = daysUntil === 0
                const isTomorrow = daysUntil === 1
                const statusColor = STATUS_COLORS[booking.status] || GOLD
                return (
                  <div key={booking.id} style={{ background: NAVY, borderRadius: '14px', border: `1px solid ${isToday ? GOLD + '40' : 'rgba(255,255,255,0.08)'}`, padding: '18px 20px', display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <div style={{ width: '52px', height: '52px', borderRadius: '12px', background: isToday ? GOLD : 'rgba(255,255,255,0.06)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <div style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: isToday ? NAVY : 'rgba(255,255,255,0.4)' }}>
                        {new Date(booking.session_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short' })}
                      </div>
                      <div style={{ fontSize: '20px', fontWeight: 900, color: isToday ? NAVY : '#fff', lineHeight: 1 }}>
                        {new Date(booking.session_date + 'T00:00:00').getDate()}
                      </div>
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                        <span style={{ fontSize: '14px', fontWeight: 700, color: '#fff' }}>{booking.course_name}</span>
                        {booking.is_trial && <span style={{ fontSize: '10px', fontWeight: 700, background: 'transparent', border: `1px solid ${GOLD}`, color: GOLD, borderRadius: '10px', padding: '2px 8px' }}>單堂</span>}
                        {isToday && <span style={{ fontSize: '10px', fontWeight: 700, background: GOLD, color: NAVY, borderRadius: '10px', padding: '2px 8px' }}>TODAY</span>}
                        {isTomorrow && <span style={{ fontSize: '10px', fontWeight: 700, background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.7)', borderRadius: '10px', padding: '2px 8px' }}>TOMORROW</span>}
                      </div>
                      <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)' }}>
                        with {booking.coach_name} {booking.student_name ? '· ' + booking.student_name : ''} · {formatTime(booking.start_time)} – {formatTime(booking.end_time)} · {formatDate(booking.session_date)}
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
                      <span style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: statusColor, background: `${statusColor}18`, border: `1px solid ${statusColor}30`, borderRadius: '20px', padding: '3px 10px' }}>
                        {booking.status}
                      </span>
                      <div style={{ display: 'flex', gap: '8px' }}>
                          <button
                            onClick={() => booking.lesson_credit_id && setRescheduleTarget({ id: booking.id, creditId: booking.lesson_credit_id, slug: booking.course_slug || '', studentId: booking.student_id || '', courseName: booking.course_name, date: formatDate(booking.session_date), time: formatTime(booking.start_time) })}
                            disabled={reschedulingId === booking.id || isWithin24Hours(booking.session_date, booking.start_time)}
                            style={{ padding: '6px 12px', borderRadius: '8px', border: reschedulingId === booking.id || isWithin24Hours(booking.session_date, booking.start_time) ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(201,168,76,0.4)', background: 'transparent', color: reschedulingId === booking.id || isWithin24Hours(booking.session_date, booking.start_time) ? 'rgba(255,255,255,0.2)' : '#c9a84c', fontSize: '11px', fontWeight: 600, cursor: reschedulingId === booking.id || isWithin24Hours(booking.session_date, booking.start_time) ? 'not-allowed' : 'pointer' }}>
                            {reschedulingId === booking.id ? '...' : 'Reschedule'}
                          </button>
                          {daysUntil >= 1 ? (
                            <button
                              onClick={() => setCancelTarget({ id: booking.id, courseName: booking.course_name, date: formatDate(booking.session_date), time: formatTime(booking.start_time) })}
                              disabled={cancellingId === booking.id || isWithin24Hours(booking.session_date, booking.start_time)}
                              style={{ padding: '6px 12px', borderRadius: '8px', border: cancellingId === booking.id || isWithin24Hours(booking.session_date, booking.start_time) ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(224,90,74,0.3)', background: 'transparent', color: cancellingId === booking.id || isWithin24Hours(booking.session_date, booking.start_time) ? 'rgba(255,255,255,0.2)' : '#e05a4a', fontSize: '11px', fontWeight: 600, cursor: cancellingId === booking.id || isWithin24Hours(booking.session_date, booking.start_time) ? 'not-allowed' : 'pointer' }}>
                              {cancellingId === booking.id ? '...' : 'Cancel'}
                            </button>
                          ) : (
                            <div style={{ padding: '6px 12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.08)', background: 'transparent', color: 'rgba(255,255,255,0.2)', fontSize: '11px', fontWeight: 600, cursor: 'not-allowed' }}>
                              Cancel
                            </div>
                          )}
                        </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>

        {/* CREDITS */}
        <section style={{ marginBottom: '36px' }}>
          <h2 style={{ fontSize: '13px', fontWeight: 700, color: 'rgba(255,255,255,0.5)', margin: '0 0 16px', letterSpacing: '1.5px', textTransform: 'uppercase' }}>Lesson Credits</h2>
          {credits.length === 0 && students.filter(s => s.trial_used_at).length === 0 ? (
            <div style={{ background: NAVY, borderRadius: '14px', border: '1px dashed rgba(255,255,255,0.12)', padding: '28px', textAlign: 'center' }}>
              <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.4)', margin: '0 0 14px' }}>No active lesson credits.</p>
              <Link href="/plans" style={{ display: 'inline-block', padding: '9px 20px', background: 'transparent', color: GOLD, border: `1px solid ${GOLD}`, borderRadius: '8px', fontSize: '12px', fontWeight: 700, textDecoration: 'none', letterSpacing: '1px', textTransform: 'uppercase' }}>Browse Plans</Link>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '12px' }}>
              {(() => {
                // Group credits by course_type_id and sum them up
                const grouped: Record<string, { name: string; total: number; used: number; items: { credits: number; used: number; date: string | null }[] }> = {}
                credits.forEach(credit => {
                  const ct = Array.isArray(credit.course_types) ? credit.course_types[0] : credit.course_types
                  const pur = Array.isArray(credit.purchases) ? credit.purchases[0] : credit.purchases
                  const key = credit.course_type_id
                  const itemDate = pur?.paid_at || pur?.created_at || credit.created_at || null
                  if (!grouped[key]) {
                    grouped[key] = { name: ct?.name || 'Lesson Credits', total: 0, used: 0, items: [] }
                  }
                  grouped[key].total += credit.total_credits
                  grouped[key].used += credit.used_credits
                  grouped[key].items.push({ credits: credit.total_credits, used: credit.used_credits, date: itemDate })
                })
                return Object.entries(grouped).map(([key, g]) => {
                  const remaining = g.total - g.used
                  const pct = Math.round((remaining / g.total) * 100)
                  return (
                    <CreditCard key={key} g={g} remaining={remaining} pct={pct} />
                  )
                })
              })()}
              {students.filter(s => s.trial_used_at).map(s => {
                const isTrialActive = activeTrialStudentIds.has(s.id)
                return (
                  <CreditCard
                    key={`trial-${s.id}`}
                    g={{ name: `1-on-1 Private · ${s.full_name} 單堂課程`, total: 1, used: isTrialActive ? 1 : 0, items: [{ credits: 1, used: isTrialActive ? 1 : 0, date: s.trial_used_at }] }}
                    remaining={isTrialActive ? 0 : 1}
                    pct={isTrialActive ? 0 : 100}
                    note="每位學生限購一次"
                  />
                )
              })}
            </div>
          )}
        </section>

        {/* LESSON HISTORY */}
        {pastBookings.length > 0 && (
          <section style={{ marginBottom: '36px' }}>
            <h2 style={{ fontSize: '13px', fontWeight: 700, color: 'rgba(255,255,255,0.5)', margin: '0 0 16px', letterSpacing: '1.5px', textTransform: 'uppercase' }}>Lesson History</h2>
            <div style={{ background: NAVY, borderRadius: '14px', border: '1px solid rgba(255,255,255,0.08)', overflow: 'hidden' }}>
              {pastBookings.map((booking, i) => (
                <div key={booking.id} style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '14px 20px', borderBottom: i < pastBookings.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
                  <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.35)', width: '80px', flexShrink: 0 }}>{formatDate(booking.session_date)}</div>
                  <div style={{ flex: 1 }}>
                    <span style={{ fontSize: '13px', fontWeight: 600, color: 'rgba(255,255,255,0.7)' }}>{booking.course_name}</span>
                    <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.35)', marginLeft: '8px' }}>with {booking.coach_name}</span>
                  </div>
                  <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.35)' }}>{formatTime(booking.start_time)}</div>
                  <span style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: STATUS_COLORS[booking.status] || 'rgba(255,255,255,0.3)', background: `${STATUS_COLORS[booking.status] || 'rgba(255,255,255,0.1)'}18`, borderRadius: '10px', padding: '2px 8px' }}>
                    {booking.status}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* PARTNER ACCOUNTS */}
        {parent && <PartnershipSection parentId={parent.id} />}

        {/* QUICK LINKS */}
        <section>
          <h2 style={{ fontSize: '13px', fontWeight: 700, color: 'rgba(255,255,255,0.5)', margin: '0 0 16px', letterSpacing: '1.5px', textTransform: 'uppercase' }}>Quick Links</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '12px' }}>
            {QUICK_LINKS.map((link) => (
              <Link key={link.label} href={link.href} style={{ display: 'flex', alignItems: 'center', gap: '14px', background: NAVY, borderRadius: '14px', border: '1px solid rgba(255,255,255,0.08)', padding: '18px 20px', textDecoration: 'none' }}
                onMouseEnter={(e) => { const el = e.currentTarget as HTMLElement; el.style.borderColor = link.color + '60'; el.style.transform = 'translateY(-2px)' }}
                onMouseLeave={(e) => { const el = e.currentTarget as HTMLElement; el.style.borderColor = 'rgba(255,255,255,0.08)'; el.style.transform = 'translateY(0)' }}>
                <span style={{ width: '40px', height: '40px', borderRadius: '10px', background: `${link.color}18`, border: `1px solid ${link.color}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', flexShrink: 0 }}>{link.icon}</span>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: '#fff', marginBottom: '2px' }}>{link.label}</div>
                  <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)' }}>{link.desc}</div>
                </div>
              </Link>
            ))}
          </div>
        </section>

      </div>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,700;0,900;1,700&family=DM+Sans:wght@400;500;600;700&display=swap');`}</style>
      {parent && <ChatWidget parentId={parent.id} />}
    </div>
  )
}
