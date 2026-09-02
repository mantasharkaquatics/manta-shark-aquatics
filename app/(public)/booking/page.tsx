'use client'

import { useEffect, useRef, useState } from 'react'
import { meetsLeadTime, isWithin24Hours } from '@/lib/booking-time'
import { BASE_POINTS, OFF_PEAK_DISCOUNT, priceLesson, type PriceBreakdown } from '@/lib/points'
import { zoneTypeForSlug } from '@/lib/zones'
import { ZONE_COLORS, BAND_COLORS, bandKey } from '@/lib/zone-colors'

const GROUP_BANDS: [number, number][] = [[1, 2], [3, 4], [5, 6], [7, 9]]
function studentBandOf(lvl: number): { min: number; max: number } | null {
  const b = GROUP_BANDS.find(([a, z]) => lvl >= a && lvl <= z)
  return b ? { min: b[0], max: b[1] } : null
}
import BookingCart from '@/components/BookingCart'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useT, useLocale } from '@/lib/i18n/provider'
import { tDb } from '@/lib/i18n'
import { errorKey } from '@/lib/i18n/errors'
import ChatWidget from '@/components/ChatWidget'
import NoticeModal from '@/components/NoticeModal'
import { formatDateLA, SLOT_STEP_MINUTES } from '@/lib/date'
import { TRIAL_PRICE_CENTS } from '@/lib/plans'

/** One lesson in the batch: a date AND the time it starts, because a batch
 *  may span more than one time of day. */
type PlanSlot = { date: string; time: string; label: string; points: number }

const NAVY = '#1a2744'
const DARK = '#111d38'
const GOLD = '#c9a84c'

interface Student { id: string; full_name: string; current_level: number; parent_id?: string }
interface PartnerStudent { id: string; full_name: string; current_level: number; parent_id: string; isPartner: true; partnerParentId: string; partnershipId: string }
interface CourseType { id: string; name: string; slug: string; duration_minutes: number; max_students: number; description: string }
interface Coach { id: string; first_name: string; last_name: string }
interface TimeSlot { time: string; label: string; available: boolean; enrolled: number; max: number; session_id?: string; within24h?: boolean; fill?: string }
type Wallet = {
  balance: number
  lessonsCompleted: number
  vipLevel: number
  vipDiscount: number
  nextTier: { level: number; discount: number; lessonsToGo: number } | null
  forgiveness: number
}

const COURSE_COLORS: Record<string, string> = {
  '1on1': GOLD, '1on2': '#4a90c4', '1on4': '#4caf72', 'team': '#e05a4a',
}
const COURSE_ICONS: Record<string, string> = {
  '1on1': '👤', '1on2': '👥', '1on4': '👨‍👩‍👧‍👦', 'team': '🏊',
}


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
    cur += SLOT_STEP_MINUTES
  }
  return slots
}

function formatTime(t: string): string {
  const [h, m] = t.split(':').map(Number)
  const ampm = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 || 12
  return `${h12}:${String(m).padStart(2,'0')} ${ampm}`
}

/* "11:30a" for a calendar cell. A phone gives each of the seven columns about
   47px, which leaves a 31px chip; "11:30 AM" measures 41px and spilled straight
   out of it. The meridiem cannot just be dropped -- the pool runs 6am to 9pm, so
   6 through 9 happen twice a day -- but one letter of it fits where three did not. */
function formatTimeCompact(t: string): string {
  const [h, m] = t.split(':').map(Number)
  return `${h % 12 || 12}:${String(m).padStart(2,'0')}${h >= 12 ? 'p' : 'a'}`
}

function Steps({ current, labelKeys }: { current: number; labelKeys?: string[] }) {
  const t = useT()
  const steps = labelKeys || ['booking.step.student', 'booking.step.course', 'booking.step.coach', 'booking.step.datetime', 'booking.step.confirm']
  return (
    <div className="booking-steps" style={{ display: 'flex', alignItems: 'center', gap: '0', marginBottom: '36px', overflowX: 'auto' }}>
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
            <span className="booking-step-label" style={{
              fontSize: '10px', fontWeight: 600, letterSpacing: '0.5px',
              color: i === current ? '#fff' : i < current ? GOLD : 'rgba(255,255,255,0.3)',
              whiteSpace: 'nowrap',
            }}>{t(s)}</span>
          </div>
          {i < steps.length - 1 && (
            <div className="booking-step-line" style={{
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
  const t = useT()
  const locale = useLocale()
  const tErr = (raw: string | null | undefined, fallbackKey: string): string => {
    const k = errorKey(raw)
    return k ? t(k) : (raw || t(fallbackKey))
  }
  const router = useRouter()
  const supabase = createClient()
  // Replaces the six native alert() calls below. Every one of them was already
  // followed by setSubmitting(false) + return, so nothing relied on alert()
  // blocking the thread.
  const [notice, setNotice] = useState<string | null>(null)

  const [step, setStep] = useState(0)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [isPartnerBookingSuccess, setIsPartnerBookingSuccess] = useState(false)
  const [isReschedule, setIsReschedule] = useState(false)
  const [rescheduleBookingId, setRescheduleBookingId] = useState<string | null>(null)
  const rescheduleBookingIdRef = useRef<string | null>(null)
  // Set when rescheduling a 60-minute lesson: both halves move together and
  // the server must exclude this lesson's own sessions from conflict checks.
  const rescheduleGroupIdRef = useRef<string | null>(null)
  const reschedulePartnerBookingIdRef = useRef<string | null>(null)
  const [countdown, setCountdown] = useState(30)

  const [parentId, setParentId] = useState<string | null>(null)
  const [students, setStudents] = useState<Student[]>([])
  const [courseTypes, setCourseTypes] = useState<CourseType[]>([])
  const [coaches, setCoaches] = useState<Coach[]>([])
  // One balance for everything. The wallet is read once and the price of each
  // slot is worked out on this page with the SAME function the booking route
  // charges with, so what the parent is quoted and what they are charged are
  // the same arithmetic rather than two copies of it.
  const [wallet, setWallet] = useState<Wallet | null>(null)
  const reloadWallet = () => {
    fetch('/api/parent/wallet').then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setWallet(d) }).catch(() => {})
  }
  useEffect(reloadWallet, [])
  const [partnerStudents, setPartnerStudents] = useState<PartnerStudent[]>([])
  const [selectedStudent2, setSelectedStudent2] = useState<Student | PartnerStudent | null>(null)

  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null)
  const [selectedCourse, setSelectedCourse] = useState<CourseType | null>(null)
  const [selectedCoach, setSelectedCoach] = useState<Coach | null>(null)
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [selectedSlot, setSelectedSlot] = useState<TimeSlot | null>(null)
  const [timeSlots, setTimeSlots] = useState<TimeSlot[]>([])
  const [trialEligible, setTrialEligible] = useState(false)
  const [trialHasCredit, setTrialHasCredit] = useState(false)
  const [lockedStudent, setLockedStudent] = useState(false)
  const lockedRef = useRef(false)
  const courseTypesRef = useRef<CourseType[]>([])
  useEffect(() => { lockedRef.current = lockedStudent }, [lockedStudent])
  useEffect(() => { courseTypesRef.current = courseTypes }, [courseTypes])
  const [isTrial, setIsTrial] = useState(false)
  const [cartRefresh, setCartRefresh] = useState(0)
  const [addingToCart, setAddingToCart] = useState(false)
  const [cartMsg, setCartMsg] = useState('')

  // ── 1on4 class-based flow (cross-coach, band-matched) ──
  const groupFlow = !isTrial && selectedCourse?.slug === '1on4'
  /* A group booking has no coach step -- the class already has one -- so from
     the date screen on, the number in the heading is one lower than the block
     it lives in. The stepper below already applies that shift; the heading was
     printing a hardcoded number and so read "Step 4" above a lit circle 3. */
  const stepNumber = groupFlow && step >= 3 ? step : step + 1
  const myLevel = selectedStudent?.current_level != null ? Number(selectedStudent.current_level) : null
  const myGroupBand = myLevel != null ? studentBandOf(myLevel) : null
  const myBandColor = myGroupBand ? (BAND_COLORS[`${myGroupBand.min}-${myGroupBand.max}`] || ZONE_COLORS.group) : ZONE_COLORS.group
  const [groupDates, setGroupDates] = useState<string[]>([])
  const [groupClasses, setGroupClasses] = useState<any[]>([])
  const [groupLoading, setGroupLoading] = useState(false)


  // Lock student from ?student= (e.g. dashboard assessment Book Now): skip Step 1 entirely
  useEffect(() => {
    if (selectedStudent || students.length === 0) return
    const sid = new URLSearchParams(window.location.search).get('student')
    if (!sid) return
    const s = students.find(x => x.id === sid)
    if (s) { setSelectedStudent(s); setLockedStudent(true) }
  }, [students])

  useEffect(() => {
    setIsTrial(false)
    setTrialEligible(false)
    setTrialHasCredit(false)
    if (!selectedStudent) return
    fetch(`/api/bookings/trial-eligibility?student_id=${selectedStudent.id}`)
      .then(r => r.ok ? r.json() : { eligible: false })
      .then(j => {
        setTrialEligible(!!j.eligible)
        setTrialHasCredit(!!j.hasCredit)
        if (lockedRef.current) {
          if (j.hasCredit) {
            const ct = courseTypesRef.current.find(c => c.slug === '1on1')
            if (ct) { setSelectedCourse(ct); setIsTrial(true); setStep(2); return }
          }
          setStep(1)
        }
      })
      .catch(() => { setTrialEligible(false); setTrialHasCredit(false); if (lockedRef.current) setStep(1) })
  }, [selectedStudent])

  const today = new Date()
  const [calMonth, setCalMonth] = useState(today.getMonth())
  const [calYear, setCalYear] = useState(today.getFullYear())
  const [groupWeeks, setGroupWeeks] = useState<any[]>([])
  // The group calendar does not page. Months run on down the screen, because
  // choosing several lessons means comparing them, and a pager hides September
  // the moment you look at October -- exactly when the comparison matters.
  const [monthsShown, setMonthsShown] = useState(2)
  const [lessonLength, setLessonLength] = useState<30 | 60>(30)
  const [hourSlots, setHourSlots] = useState<any[]>([])
  const [hourLoading, setHourLoading] = useState(false)
  const [hourBalance, setHourBalance] = useState(0)
  // Who is in the lesson being moved. The reschedule URL only carries one
  // student id, so for a 1-on-2 the second name has to come from the server.
  const [hourRoster, setHourRoster] = useState<any[]>([])
  const [selectedHour, setSelectedHour] = useState<any | null>(null)
  const [recurOpen, setRecurOpen] = useState(false)
  const [recurList, setRecurList] = useState<any[]>([])
  // The basket, keyed date|time. It is keyed by SLOT rather than by date, and it
  // outlives the panel: a family who wants Monday afternoons and Wednesday
  // mornings is describing one set of lessons, and used to have to book it
  // twice because picking the second weekday threw away the first.
  const [recurSel, setRecurSel] = useState<Map<string, PlanSlot>>(new Map())
  const [recurQuote, setRecurQuote] = useState<Map<string, number>>(new Map())
  const [recurBusy, setRecurBusy] = useState(false)
  const [recurMsg, setRecurMsg] = useState('')
  // The weekly batch used to book the moment you pressed "Confirm N lessons",
  // straight from the panel, and then left you sitting on the calendar with a
  // green line and a greyed-out Continue -- no summary, no way forward. The
  // selection is now carried into step 4 like every other booking: recurPlan is
  // what step 4 is confirming, and nothing is written until you press Confirm
  // there.
  const [recurPlan, setRecurPlan] = useState<PlanSlot[]>([])
  const [recurBooked, setRecurBooked] = useState(0)
  const [recurSkipped, setRecurSkipped] = useState(0)

  useEffect(() => {
    if (!groupFlow || !selectedStudent) { setGroupWeeks([]); return }
    // The endpoint answers six weeks at a time, so a longer view is several
    // calls merged by date rather than one big one.
    const base = new Date(today.getFullYear(), today.getMonth(), 1)
    const starts = Array.from({ length: monthsShown }, (_, i) => {
      const d = new Date(base.getFullYear(), base.getMonth() + i, 1)
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
    })
    let live = true
    Promise.all(starts.map(st =>
      fetch(`/api/bookings/group-classes?student_id=${selectedStudent.id}&weeks=6&start=${st}`)
        .then(r => r.json()).catch(() => null)))
      .then(rs => {
        if (!live) return
        const byDay = new Map<string, any>()
        for (const r of rs) for (const d of (r?.days || [])) byDay.set(d.date, d)
        setGroupWeeks([...byDay.values()])
      })
    return () => { live = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupFlow, selectedStudent, monthsShown, cartRefresh])

  useEffect(() => {
    setSelectedHour(null)
    // 1-on-2 may run an hour too, with a second swimmer from EITHER account -
    // the cross-account path is group-aware now - or when moving an existing one.
    const hourOk = selectedCourse?.slug === '1on1'
      || (selectedCourse?.slug === '1on2' && !!selectedStudent2)
      || (selectedCourse?.slug === '1on2' && !!rescheduleGroupIdRef.current)
    if (groupFlow || !selectedStudent || !selectedDate || lessonLength !== 60 || !hourOk) { setHourSlots([]); return }
    setHourLoading(true)
    fetch('/api/bookings/hour', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'options', course_slug: selectedCourse?.slug, student_id: selectedStudent.id,
        student2_id: (selectedStudent2 && !(selectedStudent2 as any).isPartner) ? selectedStudent2.id : null,
        session_date: formatDateLA(selectedDate), lesson_group_id: rescheduleGroupIdRef.current || null }),
    }).then(r => r.json())
      .then(d => { setHourSlots(d?.slots || []); setHourBalance(d?.balance ?? 0); setHourRoster(d?.roster || []) })
      .catch(() => setHourSlots([]))
      .finally(() => setHourLoading(false))
  }, [groupFlow, selectedStudent, selectedStudent2, selectedDate, lessonLength, selectedCourse])

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      const { data: parent } = await supabase.from('parents').select('id').eq('auth_user_id', user.id).single()
      if (!parent) { router.push('/dashboard'); return }
      setParentId(parent.id)

      const [{ data: studs }, { data: cts }, { data: coachs }] = await Promise.all([
        supabase.from('students').select('id, full_name, current_level').eq('parent_id', parent.id).eq('is_active', true),
        supabase.from('course_types').select('*').eq('is_active', true).order('sort_order'),
        supabase.from('coaches').select('id, first_name, last_name').eq('is_active', true),
      ])

      setStudents(studs || [])
      setCourseTypes(cts || [])
      setCoaches(coachs || [])

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
      const rGroupId = params.get('reschedule_group_id')
      const rSlug = params.get('reschedule_slug')
      const rStudentId = params.get('reschedule_student_id')
      const rPartnerBookingId = params.get('reschedule_partner_booking_id')

      if (rbId && rSlug) {
        setIsReschedule(true)
        setRescheduleBookingId(rbId)
        rescheduleBookingIdRef.current = rbId
        if (rGroupId) { rescheduleGroupIdRef.current = rGroupId; setLessonLength(60) }
      if (rPartnerBookingId) reschedulePartnerBookingIdRef.current = rPartnerBookingId
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
      setCountdown(prev => (prev <= 1 ? 0 : prev - 1))
    }, 1000)
    return () => clearInterval(interval)
  }, [success])

  // Navigate from an effect, never from inside the setState updater above:
  // React may run updaters during render, which made router.push a
  // cross-component update mid-render.
  useEffect(() => {
    if (!success || countdown > 0) return
    router.push('/dashboard')
  }, [success, countdown])

  useEffect(() => {
    if (!selectedDate || !selectedCoach || !selectedCourse) return
    loadTimeSlots()
  }, [selectedDate, selectedCoach, selectedCourse])

  async function loadTimeSlots() {
    if (!selectedDate || !selectedCoach || !selectedCourse) return

    const dateStr = formatDateLA(selectedDate)

    // Server API bypasses RLS: booked slots, coach blocks, and availability zones in one call
    const bookedRes = await fetch(`/api/coach/booked-times?coach_id=${selectedCoach.id}&session_date=${dateStr}&student_id=${selectedStudent?.id || ''}`)
    const { times: bookedTimes, blocked: coachBlocked, zones, studentBusy, legacyWindows } = await bookedRes.json()

    const fillByTime: Record<string, string> = {}
    const allSlots: string[] = []
    if (zones && !zones.legacy) {
      const zt = zoneTypeForSlug(selectedCourse.slug)
      for (const z of zones.rows || []) {
        if (z.zone_type !== zt) continue
        if (zt === 'group' && z.group_level_min != null && z.group_level_max != null && selectedStudent?.current_level != null && (selectedStudent.current_level < z.group_level_min || selectedStudent.current_level > z.group_level_max)) continue
        const gs = generateSlots(z.start_time, z.end_time)
        if (zt === 'group') {
          const k = bandKey(z.group_level_min, z.group_level_max)
          const f = (k && BAND_COLORS[k]) || ZONE_COLORS.group
          for (const t of gs) fillByTime[t] = f
        }
        allSlots.push(...gs)
      }
    } else {
      // Legacy coach: the windows come from the same server call as everything
      // else, because coach_availability is not readable from the browser.
      for (const a of legacyWindows || []) {
        allSlots.push(...generateSlots(a.start_time, a.end_time))
      }
    }
    if (allSlots.length === 0) { setTimeSlots([]); return }

    const sameTypeSessions: Record<string, any> = {}

    // Occupancy is interval-based: a 60-minute lesson's second half starts off-grid
    // (09:40), so matching on start time alone would leave the 09:45 slot bookable.
    const toMinX = (x: string) => { const [h, m] = String(x).slice(0, 5).split(':').map(Number); return h * 60 + m }
    const slotLen = selectedCourse.duration_minutes
    const bookedIv: { s: number; e: number }[] = []
    const studentIv: { s: number; e: number }[] = []
    for (const b of bookedTimes || []) {
      if (!b.time) continue
      const s = toMinX(b.time)
      const e = b.end ? toMinX(b.end) : s + 30
      bookedIv.push({ s, e })
      if (b.student_id === selectedStudent?.id) studentIv.push({ s, e })
    }
    // Lessons this student already has that day with ANY OTHER coach
    for (const sb of ((studentBusy || []) as { start: string; end: string }[])) {
      studentIv.push({ s: toMinX(sb.start), e: toMinX(sb.end) })
    }
    const hitsAny = (list: { s: number; e: number }[], t: string) => {
      const s = toMinX(t)
      return list.some(iv => s < iv.e && s + slotLen > iv.s)
    }
    const blockedTimes = { has: (t: string) => hitsAny(bookedIv, t) }
    const studentBookedTimes = { has: (t: string) => hitsAny(studentIv, t) }

    // Still need session info for the same course type (enrolled_count/max_students)
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

    // Coach blocked ranges (time_off / admin_block): a slot overlapping any range is unbookable
    const toMinB = (x: string) => { const [h, m] = x.slice(0, 5).split(':').map(Number); return h * 60 + m }
    const slotDur = selectedCourse.duration_minutes
    const inCoachBlock = (t: string) => (coachBlocked || []).some((b: any) => {
      if (b.start == null || b.end == null) return true
      const s = toMinB(t)
      return s < toMinB(b.end) && s + slotDur > toMinB(b.start)
    })

    const slots: TimeSlot[] = allSlots.map(t => {
      const maxStudents = selectedCourse.max_students
      if (!meetsLeadTime(dateStr, t)) {
        return { time: t, label: formatTime(t), available: false, enrolled: 0, max: maxStudents }
      }
      const within24h = isWithin24Hours(dateStr, t)
      if (inCoachBlock(t)) {
        return { time: t, label: formatTime(t), available: false, enrolled: 1, max: 1 }
      }
      const existing = sameTypeSessions[t]
      if (studentBookedTimes.has(t)) {
        return { time: t, label: formatTime(t), available: false, enrolled: existing ? existing.enrolled_count : 1, max: existing ? existing.max_students : 1, within24h }
      }
      if (existing) {
        const isFull = existing.enrolled_count >= existing.max_students
        return {
          time: t, label: formatTime(t),
          available: !isFull, within24h,
          enrolled: existing.enrolled_count, max: existing.max_students, session_id: isFull ? undefined : existing.id,
        }
      }
      if (blockedTimes.has(t)) {
        return { time: t, label: formatTime(t), available: false, enrolled: 1, max: 1 }
      }
      return { time: t, label: formatTime(t), available: true, enrolled: 0, max: maxStudents, within24h }
    })

    for (const sl of slots) sl.fill = fillByTime[sl.time]
    setTimeSlots(slots)
  }

  // Seats this family pays for: two of your own swimmers cost you both, a
  // cross-family 1-on-2 costs each side one. An hour is two half-hour rows each.
  const paidSeats = selectedCourse?.slug === '1on2' && selectedStudent2 && !(selectedStudent2 as any).isPartner ? 2 : 1
  // Hour-ness comes from the length toggle, not from a slot already being
  // picked: the hour list has to price itself before anything is selected.
  const isHourLesson = lessonLength === 60

  const lessonsDone = wallet?.lessonsCompleted ?? 0
  const balance = wallet?.balance ?? 0
  const vipPct = wallet?.vipDiscount ?? 0

  /** The price of one lesson at a given date and time, or null if this course
   *  is not paid for with points (Swim Team) or nothing is selected yet. */
  function priceAt(dateStr: string, time: string, minutes: number = isHourLesson ? 60 : 30): PriceBreakdown | null {
    if (!selectedCourse || isTrial) return null
    try {
      return priceLesson({
        courseSlug: selectedCourse.slug, minutes, lessonsCompleted: lessonsDone,
        sessionDate: dateStr, startTime: time, seats: paidSeats,
      })
    } catch { return null }
  }

  /** The cheapest this course can ever be for this family: every discount on.
   *  Used to decide whether to let them go forward at all -- refusing someone
   *  who could afford SOME slot would be worse than letting the server say no. */
  function cheapestFor(slug: string | undefined, seats: number, minutes = 30): number {
    const base = BASE_POINTS[slug ?? '']
    if (base === undefined) return 0
    return Math.floor(base * (1 - vipPct) * (1 - OFF_PEAK_DISCOUNT)) * (minutes === 60 ? 2 : 1) * seats
  }

  /** The list price of one 30-minute lesson at this family's VIP level, with no
   *  date chosen yet. What the course cards show. */
  function listPrice(slug: string): number {
    const base = BASE_POINTS[slug]
    if (base === undefined) return 0
    return Math.floor(base * (1 - vipPct))
  }

  const canAffordCourse = !selectedCourse || isTrial || isReschedule
    || balance >= cheapestFor(selectedCourse.slug, paidSeats, isHourLesson ? 60 : 30)

  /* Ready to leave the course step. A 1-on-2 needs its second swimmer, and if
     that swimmer is on this account it needs enough points for both seats --
     checked against the cheapest slot that exists, so nobody is stopped here
     who could have afforded something. */
  const courseStepReady = !!selectedCourse && canAffordCourse && (
    selectedCourse.slug !== '1on2'
      ? true
      : !!selectedStudent2 && ((selectedStudent2 as any).isPartner
        || isReschedule
        || balance >= cheapestFor('1on2', 2, isHourLesson ? 60 : 30))
  )

  // What this booking will actually cost, once a slot is picked. A reschedule
  // keeps its original charge, so it costs nothing here.
  const bookingPrice = (!isReschedule && !isTrial && selectedDate && selectedSlot)
    ? priceAt(formatDateLA(selectedDate), selectedSlot.time)
    : null
  const bookingCost = bookingPrice?.charged ?? 0
  const recurTotal = recurPlan.reduce((a, x) => a + x.points, 0)
  // The undiscounted figure, so the batch can show what the discounts took off.
  const recurBase = recurPlan.reduce((a, x) => {
    const pr = priceAt(x.date, x.time, 30)
    return a + (pr ? pr.base * pr.seats : x.points)
  }, 0)
  const basket = [...recurSel.values()].sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))
  const basketTotal = basket.reduce((a, x) => a + x.points, 0)
  // One time across the whole batch, or several? It decides whether the summary
  // can print a single Time row, and whether a chip needs to say the hour.
  const basketTimes = new Set(basket.map(x => x.time))
  const planTimes = new Set(recurPlan.map(x => x.time))
  const balanceAfter = Math.max(0, balance - bookingCost)

  // Every "you cannot pay for this" notice offers the same way out.
  const BuyPointsLink = ({ label }: { label: string }) => (
    <a href="/plans#buy"
      style={{ display: 'inline-block', marginTop: '10px', padding: '9px 18px', borderRadius: '8px', background: GOLD, color: NAVY, fontSize: '12px', fontWeight: 700, textDecoration: 'none' }}>
      {label}
    </a>
  )

  /** The gold "58 pts" with the struck-out list price beside it. Without the
   *  original the discount may as well not have happened, so it is shown
   *  wherever a discounted price is. */
  const PriceTag = ({ price, dim = false }: { price: PriceBreakdown; dim?: boolean }) => {
    const full = price.base * price.seats
    return (
      <span style={{ display: 'block', fontSize: '11px', marginTop: '3px', fontVariantNumeric: 'tabular-nums', color: dim ? 'rgba(255,255,255,0.25)' : GOLD }}>
        {price.charged < full && (
          <span style={{ textDecoration: 'line-through', color: 'rgba(255,255,255,0.32)', marginRight: '4px' }}>{full}</span>
        )}
        {t('points.unit', { n: price.charged })}
      </span>
    )
  }

  const needsAssessment = !!selectedStudent && selectedStudent.current_level == null

  // The whole term goes to the server in one call: a mid-way failure there
  // cannot leave a family with half a term booked and half their credits gone.
  async function confirmRecurring() {
    if (!selectedStudent || !selectedCoach || !selectedSlot) return
    setSubmitting(true)
    try {
      const res = await fetch('/api/bookings/recurring', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'commit', student_id: selectedStudent.id, coach_id: selectedCoach.id,
          slots: recurPlan.map(x => ({ date: x.date, start_time: x.time })),
        }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) { setNotice(tErr(j.error, 'booking.recur.err.commit')); setSubmitting(false); return }
      setRecurBooked(j.booked ?? recurPlan.length)
      const asked = new Set(recurPlan.map(x => `${x.date}|${x.time}`))
      setRecurSkipped((j.skipped || []).filter((x: any) => asked.has(`${x.date}|${String(x.start_time || '').slice(0, 5)}`)).length)
      // The basket has been spent. Leaving it filled would offer to book the
      // same lessons again from the success screen.
      setRecurSel(new Map())
      setCartRefresh(n => n + 1)
      reloadWallet()
      setSuccess(true)
    } catch { setNotice(t('cart.err.network')); setSubmitting(false) }
  }

  /* Step 3 -> step 4. With the weekly panel open and dates ticked, the summary
     is about those dates; otherwise it is the single slot, and any stale plan
     has to be dropped or step 4 would confirm a term the visitor backed out of. */
  // With anything in the basket the visitor can go on whether or not a single
  // slot is highlighted -- the basket is the booking now.
  const canContinue = recurSel.size > 0 || (!!selectedSlot && !recurOpen)

  function goToConfirm() {
    if (recurSel.size > 0) { setRecurPlan(basket); setRecurOpen(false); setStep(4); return }
    if (!selectedSlot) return
    setRecurPlan([])
    setStep(4)
  }

  async function handleConfirm() {
    if (recurPlan.length > 0) return confirmRecurring()
    if (!selectedStudent || !selectedCourse || !selectedCoach || !selectedDate || !selectedSlot || !parentId) return
    setSubmitting(true)

    const dateStr = formatDateLA(selectedDate)
    const startTime = selectedSlot.time

    if (isTrial && trialHasCredit) {
      const res = await fetch('/api/bookings/trial-credit-book', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId: selectedStudent.id,
          coachId: selectedCoach.id,
          date: dateStr,
          time: startTime,
        }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) {
        setNotice(tErr(j.error, 'booking.err.couldNotBook'))
        setSubmitting(false)
        return
      }
      window.location.href = '/dashboard'
      return
    }
    if (isTrial) {
      const res = await fetch('/api/stripe/trial-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId: selectedStudent.id,
          coachId: selectedCoach.id,
          date: dateStr,
          time: startTime,
        }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok || !j.url) {
        setNotice(tErr(j.error, 'booking.err.couldNotPay'))
        setSubmitting(false)
        return
      }
      window.location.href = j.url
      return
    }
    const rbId = rescheduleBookingIdRef.current || rescheduleBookingId
    const partnerBId = reschedulePartnerBookingIdRef.current

    // 1-on-2 partner reschedule: server resolves the session, then reschedule-partner API moves both bookings
    if (rbId && partnerBId) {
      const r = await fetch('/api/bookings/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          partner_reschedule: true,
          course_type_id: selectedCourse.id,
          coach_id: selectedCoach.id,
          session_date: dateStr,
          start_time: startTime,
        }),
      })
      const rj = await r.json().catch(() => ({}))
      if (!r.ok || !rj.session_id) { setNotice(tErr(rj.error, 'booking.err.slotGone')); setSubmitting(false); return }
      const res = await fetch('/api/bookings/reschedule-partner', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ booking_id: rbId, new_session_id: rj.session_id }),
      })
      if (!res.ok) { setNotice(t('booking.err.rescheduleFailed')); setSubmitting(false); return }
      setIsPartnerBookingSuccess(true)
      setSuccess(true)
      setSubmitting(false)
      return
    }

    if (selectedHour) {
      const rGroup = rescheduleGroupIdRef.current
      const hr = await fetch('/api/bookings/hour', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(rGroup
          ? { action: 'reschedule', course_slug: selectedCourse?.slug, lesson_group_id: rGroup, student_id: selectedStudent.id, session_date: dateStr,
              start_time: selectedHour.start_time, coach1_id: selectedHour.coach1_id, coach2_id: selectedHour.coach2_id }
          : { action: 'book', course_slug: selectedCourse?.slug, student_id: selectedStudent.id,
              student2_id: (selectedStudent2 && !(selectedStudent2 as any).isPartner) ? selectedStudent2.id : null,
              // Cross-account: the other family is INVITED, not charged. Same
              // shape create/route.ts sends for a 30-minute partner booking.
              partner: (selectedStudent2 && (selectedStudent2 as any).isPartner) ? {
                parent_id: (selectedStudent2 as any).partnerParentId,
                student_id: selectedStudent2.id,
                partnership_id: (selectedStudent2 as any).partnershipId || null,
                student_name: selectedStudent2.full_name,
              } : null,
              session_date: dateStr,
              start_time: selectedHour.start_time, coach1_id: selectedHour.coach1_id, coach2_id: selectedHour.coach2_id }),
      })
      const hj = await hr.json().catch(() => ({}))
      if (!hr.ok) { setNotice(tErr(hj.error, 'booking.err.bookingFailed')); setSubmitting(false); return }
      setSubmitting(false)
      // A cross-account hour is only PENDING until the other family confirms,
      // so show the invitation screen rather than "Lesson Booked".
      setIsPartnerBookingSuccess(!!hj?.pending_partner)
      setSuccess(true)
      return
    }

    const ps2 = selectedCourse.slug === '1on2' && selectedStudent2 && (selectedStudent2 as any).isPartner === true
      ? (selectedStudent2 as PartnerStudent) : null

    const res = await fetch('/api/bookings/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        course_type_id: selectedCourse.id,
        coach_id: selectedCoach.id,
        session_date: dateStr,
        start_time: startTime,
        student_id: selectedStudent.id,
        student2_id: !ps2 && selectedCourse.slug === '1on2' && selectedStudent2 ? selectedStudent2.id : null,
        partner: ps2 ? {
          parent_id: ps2.partnerParentId,
          student_id: ps2.id,
          partnership_id: ps2.partnershipId || null,
          student_name: ps2.full_name,
        } : null,
        reschedule_booking_id: rbId || null,
      }),
    })
    const j = await res.json().catch(() => ({}))
    if (!res.ok) {
      setNotice(tErr(j.error, 'booking.err.bookingFailed'))
      setSubmitting(false)
      return
    }

    setSubmitting(false)
    reloadWallet()
    setIsPartnerBookingSuccess(!!ps2)
    setSuccess(true)
  }

  async function handleAddToCart() {
    if (!selectedStudent || !selectedCourse || !selectedCoach || !selectedDate || !selectedSlot) return
    setAddingToCart(true)
    setCartMsg('')
    try {
      const res = await fetch('/api/bookings/cart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'add',
          course_type_id: selectedCourse.id,
          coach_id: selectedCoach.id,
          session_date: formatDateLA(selectedDate),
          start_time: selectedSlot.time,
          student_id: selectedStudent.id,
        }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) {
        setCartMsg(tErr(j.error, 'booking.err.addToCart'))
      } else {
        setCartRefresh(n => n + 1)
        setSelectedSlot(null)
        setStep(3)
        loadTimeSlots()
      }
    } catch {
      setCartMsg(t('cart.err.network'))
    }
    setAddingToCart(false)
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

  if (loading) return (
    <div style={{ minHeight: '100vh', background: DARK, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center' }}>
        <style>{`@keyframes msaPulse { 0%, 100% { opacity: 1; transform: scale(1) } 50% { opacity: .55; transform: scale(.94) } }`}</style>
        <img src="/logo.png" alt="Manta Shark Aquatics" width={72} height={72}
          style={{ display: 'block', margin: '0 auto 16px', borderRadius: '50%', objectFit: 'cover', animation: 'msaPulse 1.6s ease-in-out infinite' }} />
        <div style={{ fontSize: '14px', color: 'rgba(255,255,255,0.5)' }}>{t('booking.loading')}</div>
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
        {recurPlan.length > 0 ? (
          <>
            <div style={{ fontSize: '48px', marginBottom: '20px' }}>✅</div>
            <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: '28px', fontWeight: 900, color: '#fff', marginBottom: '12px' }}>
              {t('booking.recur.successBooked', { n: recurBooked })}
            </h2>
            <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.6)', lineHeight: 1.7, marginBottom: '4px' }}>
              <strong style={{ color: '#fff' }}>{selectedStudent?.full_name}</strong> {t('booking.recur.isBookedForN', { n: recurBooked })}
            </p>
            <p style={{ fontSize: '14px', color: GOLD, fontWeight: 600, marginBottom: '12px' }}>
              {t('booking.success.with', { course: selectedCourse ? tDb(locale, 'course_types', selectedCourse.id, selectedCourse.name) : '', coach: selectedCoach?.first_name || '' })}
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', justifyContent: 'center', marginBottom: '20px' }}>
              {recurPlan.map(x => (
                <span key={x.date + x.time} style={{ fontSize: '12px', fontWeight: 600, padding: '5px 10px', borderRadius: '6px', background: `${GOLD}18`, border: `1px solid ${GOLD}44`, color: GOLD }}>
                  {new Date(x.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                  {planTimes.size > 1 ? ` · ${x.label}` : ''}
                </span>
              ))}
            </div>
            {recurSkipped > 0 && (
              <p style={{ fontSize: '13px', color: '#f0c78a', marginBottom: '16px' }}>{t('booking.recur.someSkipped', { m: recurSkipped })}</p>
            )}
            <div style={{
              display: 'flex', alignItems: 'center', gap: '10px',
              background: 'rgba(201,168,76,0.08)', border: '1px solid rgba(201,168,76,0.2)',
              borderRadius: '10px', padding: '12px 16px', marginBottom: '24px', textAlign: 'left',
            }}>
              <span style={{ fontSize: '20px', flexShrink: 0 }}>📧</span>
              <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.6)', margin: 0, lineHeight: 1.5 }}>
                {t('booking.success.emailSent')}
              </p>
            </div>
          </>
        ) : isPartnerBookingSuccess ? (
          <>
            <div style={{ fontSize: '48px', marginBottom: '20px', color: '#a78bfa' }}>⏳</div>
            <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: '28px', fontWeight: 900, color: '#fff', marginBottom: '12px' }}>
              {t('booking.success.invitationSent')}
            </h2>
            <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.6)', lineHeight: 1.7, marginBottom: '4px' }}>
              {t('booking.success.invitedDesc')}
            </p>
            <p style={{ fontSize: '14px', color: GOLD, fontWeight: 600, marginBottom: '4px' }}>
              {t('booking.success.with', { course: selectedCourse ? tDb(locale, 'course_types', selectedCourse.id, selectedCourse.name) : '', coach: selectedCoach?.first_name || '' })}
            </p>
            <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.6)', marginBottom: '20px' }}>
              {t('booking.success.dateAt', { date: selectedDate?.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) || '', time: selectedSlot?.label || '' })}
            </p>
            <div style={{
              display: 'flex', alignItems: 'center', gap: '10px',
              background: 'rgba(123,97,196,0.1)', border: '1px solid rgba(123,97,196,0.35)',
              borderRadius: '10px', padding: '12px 16px', marginBottom: '24px', textAlign: 'left',
            }}>
              <span style={{ fontSize: '20px', flexShrink: 0 }}>🔔</span>
              <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.6)', margin: 0, lineHeight: 1.5 }}>
                {t('booking.success.window.a')}<strong style={{ color: '#fff' }}>{t('booking.success.window.strong')}</strong>{t('booking.success.window.b')}
              </p>
            </div>
          </>
        ) : (
          <>
            <div style={{ fontSize: '48px', marginBottom: '20px' }}>✅</div>
            <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: '28px', fontWeight: 900, color: '#fff', marginBottom: '12px' }}>
              {isReschedule ? t('booking.success.rescheduled') : t('booking.success.booked')}
            </h2>
            <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.6)', lineHeight: 1.7, marginBottom: '4px' }}>
              <strong style={{ color: '#fff' }}>
                {hourRoster.length > 1
                  ? hourRoster.map((x: any) => x.full_name).join(' & ')
                  : selectedCourse?.slug === '1on2' && selectedStudent2
                  ? `${selectedStudent?.full_name} & ${selectedStudent2.full_name}`
                  : selectedStudent?.full_name}
              </strong> {t((hourRoster.length > 1 || (selectedCourse?.slug === '1on2' && selectedStudent2)) ? 'booking.success.areBookedFor' : 'booking.success.isBookedFor')}
            </p>
            <p style={{ fontSize: '14px', color: GOLD, fontWeight: 600, marginBottom: '4px' }}>
              {t('booking.success.with', { course: selectedCourse ? tDb(locale, 'course_types', selectedCourse.id, selectedCourse.name) : '', coach: selectedCoach?.first_name || '' })}
            </p>
            <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.6)', marginBottom: '20px' }}>
              {t('booking.success.dateAt', { date: selectedDate?.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) || '', time: selectedSlot?.label || '' })}
            </p>
            <div style={{
              display: 'flex', alignItems: 'center', gap: '10px',
              background: 'rgba(201,168,76,0.08)', border: '1px solid rgba(201,168,76,0.2)',
              borderRadius: '10px', padding: '12px 16px', marginBottom: '24px', textAlign: 'left',
            }}>
              <span style={{ fontSize: '20px', flexShrink: 0 }}>📧</span>
              <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.6)', margin: 0, lineHeight: 1.5 }}>
                {t('booking.success.emailSent')}
              </p>
            </div>
          </>
        )}

        <Link href="/dashboard" style={{
          display: 'block', padding: '13px 32px',
          background: GOLD, color: NAVY, borderRadius: '8px',
          fontSize: '13px', fontWeight: 700, letterSpacing: '1.5px',
          textTransform: 'uppercase', textDecoration: 'none', marginBottom: '12px',
        }}>
          {t('common.backToDashboard')}
        </Link>
        <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.3)', margin: 0 }}>
          {t('booking.success.redirecting', { n: countdown })}
        </p>
      </div>
    </div>
  )

  return (
    <div style={{ fontFamily: "'DM Sans', sans-serif", background: DARK, minHeight: '100vh' }}>
      {/* A page-context strip, not a second masthead. The Navbar directly above
          already carries the logo and the brand; repeating them here read as two
          stacked headers and spent about 150px of a phone screen before any
          content appeared. What this bar is actually for is telling you which
          page you are on and giving you a way back, so that is all it holds. */}
      <div style={{
        background: NAVY, borderBottom: '1px solid rgba(255,255,255,0.08)',
        padding: '12px clamp(16px,5vw,48px)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px',
      }}>
        <span style={{ fontSize: '14px', fontWeight: 600, color: 'rgba(255,255,255,0.85)' }}>
          {isReschedule ? t('booking.header.reschedule') : t('booking.header.book')}
        </span>
        <Link href="/dashboard" style={{ fontSize: '13px', color: 'rgba(255,255,255,0.5)', textDecoration: 'none', whiteSpace: 'nowrap' }}>
          ← {t('booking.header.dashboard')}
        </Link>
      </div>

      <div style={{ maxWidth: '800px', margin: '0 auto', padding: 'clamp(24px,4vw,48px) clamp(20px,5vw,48px)' }}>

        {isReschedule && (
          <div style={{ marginBottom: '20px', padding: '14px 18px', background: 'rgba(201,168,76,0.1)', border: '1px solid rgba(201,168,76,0.3)', borderRadius: '10px', fontSize: '13px', color: '#c9a84c', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>📅</span> {t('booking.rescheduleBanner')}
          </div>
        )}

        {lockedStudent && selectedStudent && (
          <div style={{ marginBottom: '20px', padding: '14px 18px', background: 'rgba(201,168,76,0.1)', border: '1px solid rgba(201,168,76,0.3)', borderRadius: '10px', fontSize: '13px', color: GOLD, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
            <span>📌 {t('booking.lockedFor')}<strong style={{ color: '#fff' }}>{selectedStudent.full_name}</strong>{trialHasCredit ? t('booking.assessmentPrepaid') : ''}</span>
            <button onClick={() => { setLockedStudent(false); setSelectedStudent(null); setIsTrial(false); setSelectedCourse(null); setStep(0) }}
              style={{ background: 'none', border: 'none', padding: 0, color: 'rgba(255,255,255,0.5)', fontSize: '12px', cursor: 'pointer', textDecoration: 'underline' }}>
              {t('booking.changeStudent', { name: selectedStudent.full_name.split(' ')[0] })}
            </button>
          </div>
        )}

        <Steps current={groupFlow && step >= 3 ? step - 1 : step} labelKeys={groupFlow ? ['booking.step.student', 'booking.step.course', 'booking.step.datetime', 'booking.step.confirm'] : undefined} />

        {step === 0 && (
          <div>
            <SectionTitle eyebrow={t('booking.stepN', { n: stepNumber })} title={t('booking.s1.title')} />
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
                        {s.current_level ? t('levels.levelN', { n: s.current_level }) : t('dash.pendingAssessment')}
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
            >{t('booking.continue')}</button>
          </div>
        )}

        {step === 1 && (
          <div>
            <SectionTitle eyebrow={t('booking.stepN', { n: stepNumber })} title={t('booking.s2.title')} />
            {needsAssessment && (
              <div style={{ background: `${GOLD}1f`, border: `1px solid ${GOLD}66`, borderRadius: '12px', padding: '12px 16px', marginBottom: '14px', fontSize: '13px', color: GOLD, lineHeight: 1.5 }}>
                {trialHasCredit
                  ? t('booking.notice.prepaid')
                  : trialEligible
                  ? t('booking.notice.first')
                  : t('booking.notice.pending')}
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {(trialEligible || trialHasCredit) && !isReschedule && (
                <SelectCard selected={isTrial} onClick={() => { const ct = courseTypes.find(c => c.slug === '1on1'); if (ct) { setSelectedCourse(ct); setIsTrial(true) } }} color={GOLD}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                      <span style={{ fontSize: '28px' }}>⭐</span>
                      <div>
                        <div style={{ fontSize: '15px', fontWeight: 700, color: '#fff', marginBottom: '2px' }}>{t('common.assessment')}</div>
                        <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)' }}>{t('booking.assessmentMeta')}</div>
                      </div>
                    </div>
                    <div style={{ background: `${GOLD}20`, border: `1px solid ${GOLD}40`, borderRadius: '20px', padding: '4px 12px', fontSize: '12px', fontWeight: 700, color: GOLD }}>{trialHasCredit ? t('booking.prepaid') : '$' + TRIAL_PRICE_CENTS / 100}</div>
                  </div>
                </SelectCard>
              )}
              {courseTypes.filter(ct => ct.slug !== 'team').map(ct => {
                const color = COURSE_COLORS[ct.slug] || GOLD
                const listed = listPrice(ct.slug)
                const full = BASE_POINTS[ct.slug] ?? 0
                return (
                  <SelectCard key={ct.id} selected={!isTrial && selectedCourse?.id === ct.id} onClick={() => { if (needsAssessment) return; setSelectedCourse(ct); setIsTrial(false) }} color={color}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                        <span style={{ fontSize: '28px' }}>{COURSE_ICONS[ct.slug]}</span>
                        <div>
                          <div style={{ fontSize: '15px', fontWeight: 700, color: '#fff', marginBottom: '2px' }}>{tDb(locale, 'course_types', ct.id, ct.name)}</div>
                          <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)' }}>
                            {t(ct.max_students > 1 ? 'booking.courseMeta' : 'booking.courseMetaOne', { n: ct.duration_minutes, max: ct.max_students })}
                          </div>
                          {ct.slug === '1on4' && myGroupBand && (
                            <div style={{ marginTop: '5px', display: 'inline-block', padding: '2px 9px', borderRadius: '10px', fontSize: '11px', fontWeight: 700, color: myBandColor, background: myBandColor + '1f', border: `1px solid ${myBandColor}44` }}>
                              {t('booking.yourClass', { min: myGroupBand.min, max: myGroupBand.max })}
                            </div>
                          )}
                        </div>
                      </div>
                      {/* The list price at this family's VIP level. Off-peak is
                          not in it yet -- no date has been chosen -- so the slot
                          grid can only ever come in lower than this, never
                          higher. A price that goes up after you pick a time is
                          the one thing this screen must never do. */}
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <div style={{
                          background: `${color}20`, border: `1px solid ${color}40`,
                          borderRadius: '20px', padding: '4px 12px',
                          fontSize: '12px', fontWeight: 700, color, whiteSpace: 'nowrap',
                          fontVariantNumeric: 'tabular-nums',
                        }}>
                          {listed < full && (
                            <span style={{ textDecoration: 'line-through', color: 'rgba(255,255,255,0.3)', marginRight: '5px', fontWeight: 500 }}>{full}</span>
                          )}
                          {t('points.unit', { n: listed })}
                        </div>
                        <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.3)', marginTop: '4px' }}>{t('booking.perSwimmer')}</div>
                      </div>
                    </div>
                  </SelectCard>
                )
              })}
            </div>

            {selectedCourse && !canAffordCourse && (
              <div style={{
                marginTop: '16px', padding: '14px 18px',
                background: 'rgba(224,90,74,0.1)', border: '1px solid rgba(224,90,74,0.3)',
                borderRadius: '10px', fontSize: '13px', color: '#e05a4a',
              }}>
                ⚠️ {t('booking.short.body', { have: balance, need: cheapestFor(selectedCourse.slug, paidSeats, isHourLesson ? 60 : 30) })}
                <div><BuyPointsLink label={t('booking.short.cta')} /></div>
              </div>
            )}

            {/* 1-on-2: select the second student. Gated on being able to pay at
                all, not on credits -- a family holding two make-up credits and no
                credits could never reach the second swimmer, and Continue stayed
                dead with nothing on screen to explain why. */}
            {selectedCourse?.slug === '1on2' && (
              <div style={{ marginTop: '20px' }}>
                <div style={{ fontSize: '12px', fontWeight: 700, color: 'rgba(255,255,255,0.5)', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: '12px' }}>
                  👥 {t('booking.select2nd')}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {students.filter(s => s.id !== selectedStudent?.id).map(s => (
                    <SelectCard key={s.id} selected={selectedStudent2?.id === s.id} onClick={() => { if (s.current_level == null) return; setSelectedStudent2(s) }} color="#4a90c4">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: '#4a90c4', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', fontWeight: 900, color: '#fff', fontFamily: "'Playfair Display', serif", flexShrink: 0 }}>
                          {s.full_name.split(' ').map((n: string) => n[0]).join('').slice(0, 2)}
                        </div>
                        <div>
                          <div style={{ fontSize: '14px', fontWeight: 700, color: '#fff' }}>{s.full_name}</div>
                          <div style={{ fontSize: '11px', color: s.current_level ? 'rgba(255,255,255,0.4)' : '#e0b64a' }}>{s.current_level ? t('booking.sameAccount', { n: s.current_level }) : t('booking.needsAssessmentFirst')}</div>
                        </div>
                      </div>
                    </SelectCard>
                  ))}
                  {partnerStudents.map(s => (
                    <SelectCard key={s.id} selected={selectedStudent2?.id === s.id} onClick={() => { if (s.current_level == null) return; setSelectedStudent2(s) }} color="#4a90c4">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: '#7b61c4', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', fontWeight: 900, color: '#fff', fontFamily: "'Playfair Display', serif", flexShrink: 0 }}>
                          {s.full_name.split(' ').map((n: string) => n[0]).join('').slice(0, 2)}
                        </div>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <div style={{ fontSize: '14px', fontWeight: 700, color: '#fff' }}>{s.full_name}</div>
                            <span style={{ fontSize: '10px', background: 'rgba(123,97,196,0.2)', border: '1px solid rgba(123,97,196,0.4)', borderRadius: '4px', padding: '1px 5px', color: '#a78bfa' }}>{t('booking.linked')}</span>
                          </div>
                          <div style={{ fontSize: '11px', color: s.current_level ? 'rgba(255,255,255,0.4)' : '#e0b64a' }}>{s.current_level ? t('booking.partnerConfirm', { n: s.current_level }) : t('booking.needsAssessmentFirst')}</div>
                        </div>
                      </div>
                    </SelectCard>
                  ))}
                  {students.filter(s => s.id !== selectedStudent?.id).length === 0 && partnerStudents.length === 0 && (
                    <div style={{ padding: '16px', background: 'rgba(255,255,255,0.04)', borderRadius: '10px', fontSize: '13px', color: 'rgba(255,255,255,0.4)', textAlign: 'center' }}>
                      {t('booking.noOtherStudents')}
                    </div>
                  )}
                </div>
                {selectedStudent2 && !(selectedStudent2 as any).isPartner && balance < cheapestFor('1on2', 2, isHourLesson ? 60 : 30) && (
                  <div style={{ marginTop: '10px', padding: '10px 14px', background: 'rgba(224,90,74,0.1)', border: '1px solid rgba(224,90,74,0.3)', borderRadius: '8px', fontSize: '12px', color: '#e05a4a' }}>
                    ⚠️ {t('booking.short.twoSeats', { have: balance, need: cheapestFor('1on2', 2, isHourLesson ? 60 : 30) })}
                    <div><BuyPointsLink label={t('booking.short.cta')} /></div>
                  </div>
                )}
                {selectedStudent2 && (selectedStudent2 as any).isPartner && (
                  <div style={{ marginTop: '10px', padding: '10px 14px', background: 'rgba(123,97,196,0.1)', border: '1px solid rgba(123,97,196,0.3)', borderRadius: '8px', fontSize: '12px', color: '#a78bfa' }}>
                    📋 {t('booking.crossAccount')}
                  </div>
                )}
              </div>
            )}

            <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
              <button onClick={() => { if (lockedStudent) { setLockedStudent(false); setSelectedStudent(null); setIsTrial(false); setSelectedCourse(null) } setStep(0) }} style={{
                flex: 1, padding: '14px', background: 'transparent',
                color: 'rgba(255,255,255,0.5)', border: '1px solid rgba(255,255,255,0.15)',
                borderRadius: '10px', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
              }}>{t('booking.back')}</button>
              <button
                onClick={() => { if (courseStepReady) setStep(selectedCourse!.slug === '1on4' && !isTrial ? 3 : 2) }}
                disabled={!courseStepReady}
                style={{
                  flex: 2, padding: '14px',
                  background: courseStepReady ? GOLD : 'rgba(255,255,255,0.1)',
                  color: courseStepReady ? NAVY : 'rgba(255,255,255,0.3)',
                  border: 'none', borderRadius: '10px',
                  fontSize: '13px', fontWeight: 700, letterSpacing: '1.5px',
                  textTransform: 'uppercase', cursor: courseStepReady ? 'pointer' : 'not-allowed',
                }}
              >{t('booking.continue')}</button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div>
            <SectionTitle eyebrow={t('booking.stepN', { n: stepNumber })} title={t('booking.s3.title')} />
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
                        <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)' }}>{t('booking.coachRole')}</div>
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
              }}>{isReschedule ? t('booking.cancelBack') : t('booking.back')}</button>
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
              >{t('booking.continue')}</button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div>
            <SectionTitle eyebrow={t('booking.stepN', { n: stepNumber })} title={t('booking.s4.title')} />
            {!groupFlow && <div style={{ background: NAVY, borderRadius: '16px', padding: '24px', marginBottom: '20px', border: '1px solid rgba(255,255,255,0.08)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
                <button onClick={() => {
                  if (calMonth === 0) { setCalMonth(11); setCalYear(calYear - 1) }
                  else setCalMonth(calMonth - 1)
                }} aria-label={t('booking.cal.prevMonth')} style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.5)', fontSize: '18px', cursor: 'pointer', minWidth: '44px', minHeight: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>‹</button>
                <span style={{ fontSize: '15px', fontWeight: 700, color: '#fff' }}>{t('booking.calMonth', { month: t('date.month.' + (calMonth + 1)), year: calYear })}</span>
                <button onClick={() => {
                  if (calMonth === 11) { setCalMonth(0); setCalYear(calYear + 1) }
                  else setCalMonth(calMonth + 1)
                }} aria-label={t('booking.cal.nextMonth')} style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.5)', fontSize: '18px', cursor: 'pointer', minWidth: '44px', minHeight: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>›</button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: '4px', marginBottom: '8px' }}>
                {[0, 1, 2, 3, 4, 5, 6].map(d => (
                  <div key={d} style={{ textAlign: 'center', fontSize: '11px', fontWeight: 600, color: 'rgba(255,255,255,0.3)', padding: '4px 0' }}>{t('date.weekdayShort.' + d)}</div>
                ))}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: '4px' }}>
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
                    ><span>{i + 1}</span>{groupFlow && groupDates.includes(formatDateLA(date)) && !isSelected && (
                      <span style={{ display: 'block', width: '4px', height: '4px', borderRadius: '50%', margin: '2px auto 0', backgroundColor: myBandColor }} />
                    )}</button>
                  )
                })}
              </div>
            </div>}

            {!groupFlow && selectedDate && (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap', marginBottom: '12px' }}>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: 'rgba(255,255,255,0.6)' }}>
                    {t('booking.availableTimes', { date: selectedDate.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' }) })}
                  </div>
                  {(selectedCourse?.slug === '1on1'
                    || (selectedCourse?.slug === '1on2' && !!selectedStudent2)) && (
                    <div style={{ display: 'inline-flex', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', overflow: 'hidden' }}>
                      {([30, 60] as const).map(v => (
                        <button key={v} onClick={() => { setLessonLength(v); setSelectedSlot(null); setSelectedHour(null) }}
                          style={{ padding: '6px 14px', fontSize: '12px', fontWeight: 700, border: 'none', cursor: 'pointer',
                            background: lessonLength === v ? GOLD : 'transparent', color: lessonLength === v ? NAVY : 'rgba(255,255,255,0.5)' }}>
                          {t('booking.lenMin', { n: v })}</button>
                      ))}
                    </div>
                  )}
                </div>
                {lessonLength === 60 && (() => {
                  const rows = hourSlots
                    .map((h: any) => ({ ...h, opts: (h.options || []).filter((o: any) => o.coach1_id === selectedCoach?.id) }))
                    .filter((h: any) => h.opts.length > 0)
                    .map((h: any) => ({ ...h, pick: h.opts.find((o: any) => !o.relay) || h.opts[0] }))
                  // The server prices every hour slot and sends the figure with
                  // it, so nothing here has to guess. The cheapest one on offer
                  // decides whether the family can book an hour at all; when
                  // they cannot, saying so beats a wall of grey buttons.
                  const cheapest = rows.length ? Math.min(...rows.map((h: any) => Number(h.points) || 0)) : 0
                  const canAffordHour = isReschedule || (rows.length > 0 && hourBalance >= cheapest)
                  return (
                    <div style={{ marginBottom: '16px' }}>
                      <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.45)', marginBottom: '10px' }}>
                        {t('booking.hour.cost')} · {t('booking.balance', { n: hourBalance })}
                      </div>
                      {!hourLoading && rows.length > 0 && !canAffordHour && (
                        <div style={{ background: 'rgba(201,168,76,0.1)', border: '1px solid rgba(201,168,76,0.35)', borderRadius: '10px', padding: '14px 16px', marginBottom: '12px' }}>
                          <div style={{ fontSize: '13px', fontWeight: 700, color: GOLD, marginBottom: '4px' }}>{t('booking.short.title')}</div>
                          <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.6)', lineHeight: 1.5 }}>
                            {t('booking.short.body', { have: hourBalance, need: cheapest })}
                          </div>
                          <BuyPointsLink label={t('booking.short.cta')} />
                        </div>
                      )}
                      {hourLoading ? (
                        <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '14px' }}>{t('booking.hourLoading')}</p>
                      ) : rows.length === 0 ? (
                        <div style={{ background: NAVY, borderRadius: '12px', padding: '20px', textAlign: 'center', border: '1px dashed rgba(255,255,255,0.12)' }}>
                          <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '13px', margin: 0 }}>{t('booking.noHourOptions')}</p>
                        </div>
                      ) : (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: '8px' }}>
                          {rows.map((h: any) => {
                            const o = h.pick
                            const sel = selectedHour?.start_time === h.start_time
                            const affordable = isReschedule || hourBalance >= (Number(h.points) || 0)
                            const usable = affordable && !h.is_current
                            const w24 = isWithin24Hours(formatDateLA(selectedDate), h.start_time)
                            return (
                              <button key={h.start_time} disabled={!usable}
                                onClick={() => {
                                  setSelectedHour({ ...h, ...o })
                                  setSelectedSlot({ time: h.start_time, label: `${formatTime(h.start_time)} – ${formatTime(h.end_time)}`, available: true, enrolled: 0, max: 1, within24h: w24 })
                                }}
                                style={{
                                  padding: '12px 8px', borderRadius: '10px', textAlign: 'center',
                                  border: `2px solid ${sel ? GOLD : usable ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.05)'}`,
                                  background: sel ? `${GOLD}20` : usable ? NAVY : 'rgba(255,255,255,0.03)',
                                  color: sel ? GOLD : usable ? '#fff' : 'rgba(255,255,255,0.2)',
                                  fontSize: '13px', fontWeight: 600, cursor: usable ? 'pointer' : 'not-allowed',
                                }}>
                                {h.is_current && (
                                  <div style={{ fontSize: '10px', fontWeight: 700, color: GOLD, letterSpacing: '0.06em', marginBottom: '2px' }}>{t('booking.currentTime')}</div>
                                )}
                                {formatTime(h.start_time)}
                                <div style={{ fontSize: '10px', fontWeight: 600, color: sel ? GOLD : usable ? 'rgba(255,255,255,0.45)' : 'rgba(255,255,255,0.2)', marginTop: '1px' }}>
                                  – {formatTime(h.end_time)}
                                </div>
                                {!isReschedule && h.points != null && (
                                  <span style={{ display: 'block', fontSize: '11px', marginTop: '3px', fontVariantNumeric: 'tabular-nums', color: usable ? GOLD : 'rgba(255,255,255,0.25)' }}>
                                    {t('points.unit', { n: h.points })}
                                  </span>
                                )}
                                {h.off_peak && (
                                  <div style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '0.1em', color: 'rgba(255,255,255,0.45)', marginTop: '3px' }}>{t('booking.offPeak')}</div>
                                )}
                                {!isTrial && usable && w24 && (
                                  <div style={{ fontSize: '10px', color: '#c9a84c', marginTop: '2px', fontWeight: 700 }}>24h</div>
                                )}
                                {isReschedule && (
                                  <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)', marginTop: '2px', fontWeight: 700 }}>{t('booking.noExtraCharge')}</div>
                                )}
                                {o.relay && (
                                  <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.45)', marginTop: '2px', lineHeight: 1.3, fontWeight: 500 }}>
                                    {t('booking.relayCoaches', { a: o.coach1_name, b: o.coach2_name })}
                                  </div>
                                )}
                              </button>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )
                })()}
                {!isTrial && timeSlots.some(sl => sl.available && sl.within24h) && (
                  <div style={{ background: 'rgba(201,168,76,0.1)', border: '1px solid rgba(201,168,76,0.3)', borderRadius: '10px', padding: '14px 16px', marginBottom: '16px', display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                    <span style={{ fontSize: '16px' }}>⚠️</span>
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 700, color: '#c9a84c', marginBottom: '4px' }}>{t('booking.within24.title')}</div>
                      <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.6)', lineHeight: 1.5 }}>{t('booking.within24.body')}</div>
                    </div>
                  </div>
                )}
                {groupFlow ? (
                  groupLoading ? (
                    <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '14px' }}>{t('booking.groupLoading')}</p>
                  ) : (() => {
                    const ds2 = formatDateLA(selectedDate)
                    const visible = groupClasses.filter((gc: any) => meetsLeadTime(ds2, gc.time))
                    if (visible.length === 0) return (
                      <div style={{ background: NAVY, borderRadius: '12px', padding: '24px', textAlign: 'center', border: '1px dashed rgba(255,255,255,0.12)' }}>
                        <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '14px' }}>
                          {myGroupBand ? t('booking.group.noneBand', { min: myGroupBand.min, max: myGroupBand.max }) : t('booking.group.none')}
                        </p>
                      </div>
                    )
                    return (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {visible.map((gc: any) => {
                          const w24 = isWithin24Hours(ds2, gc.time)
                          const sel = selectedSlot?.time === gc.time && selectedCoach?.id === gc.coach_id
                          const clickable = !gc.full && !gc.already_booked
                          return (
                            <button key={gc.coach_id + gc.time}
                              onClick={() => {
                                if (!clickable) return
                                const c = coaches.find(x => x.id === gc.coach_id)
                                if (!c) return
                                setSelectedCoach(c)
                                setSelectedSlot({ time: gc.time, label: formatTime(gc.time), available: true, enrolled: gc.enrolled, max: gc.max, session_id: gc.session_id, within24h: w24 })
                              }}
                              disabled={!clickable}
                              style={{
                                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px',
                                padding: '14px 16px', borderRadius: '10px', textAlign: 'left', cursor: clickable ? 'pointer' : 'not-allowed',
                                border: `2px solid ${sel ? GOLD : clickable ? myBandColor + '55' : 'rgba(255,255,255,0.06)'}`,
                                background: sel ? `${GOLD}20` : clickable ? myBandColor + '18' : 'rgba(255,255,255,0.03)',
                              }}>
                              <span>
                                <span style={{ display: 'block', fontSize: '14px', fontWeight: 700, color: sel ? GOLD : clickable ? '#fff' : 'rgba(255,255,255,0.3)' }}>
                                  {formatTime(gc.time)} – {formatTime(gc.end_time)}
                                </span>
                                <span style={{ display: 'block', fontSize: '12px', color: clickable ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.2)', marginTop: '2px' }}>
                                  {t('booking.group.coachBand', { name: gc.coach_name, min: myGroupBand?.min ?? '', max: myGroupBand?.max ?? '' })}
                                </span>
                              </span>
                              <span style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                                {!isReschedule && (() => { const pr = priceAt(ds2, gc.time, 30); return pr ? (
                                  <span style={{ textAlign: 'right' }}>
                                    <PriceTag price={pr} dim={!clickable} />
                                    {pr.offPeak && <span style={{ display: 'block', fontSize: '9px', fontWeight: 700, letterSpacing: '0.1em', color: 'rgba(255,255,255,0.4)' }}>{t('booking.offPeak')}</span>}
                                  </span>
                                ) : null })()}
                                {w24 && clickable && <span style={{ fontSize: '10px', fontWeight: 700, color: '#c9a84c' }}>24h</span>}
                                <span style={{ fontSize: '11px', fontWeight: 700, padding: '3px 10px', borderRadius: '12px',
                                  color: gc.already_booked ? 'rgba(255,255,255,0.4)' : gc.full ? 'rgba(255,255,255,0.3)' : myBandColor,
                                  background: gc.already_booked || gc.full ? 'rgba(255,255,255,0.06)' : myBandColor + '22' }}>
                                  {gc.already_booked ? t('booking.booked') : gc.full ? t('booking.full') : t('booking.spotsLeft', { n: gc.max - gc.enrolled })}
                                </span>
                              </span>
                            </button>
                          )
                        })}
                      </div>
                    )
                  })()
                ) : timeSlots.length === 0 ? (
                  <div style={{ background: NAVY, borderRadius: '12px', padding: '24px', textAlign: 'center', border: '1px dashed rgba(255,255,255,0.12)' }}>
                    <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '14px' }}>{t('booking.noSlots')}</p>
                  </div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: '8px' }}>
                    {(lessonLength === 60 ? [] : timeSlots).map(slot => (
                      <button key={slot.time}
                        onClick={() => { if (slot.available) setSelectedSlot(slot) }}
                        disabled={!slot.available}
                        style={{
                          padding: '12px 8px', borderRadius: '10px',
                          border: `2px solid ${selectedSlot?.time === slot.time ? GOLD : slot.available ? (slot.fill ? slot.fill + '55' : 'rgba(255,255,255,0.12)') : 'rgba(255,255,255,0.05)'}`,
                          background: selectedSlot?.time === slot.time ? `${GOLD}20` : slot.available ? (slot.fill ? slot.fill + '22' : NAVY) : 'rgba(255,255,255,0.03)',
                          color: selectedSlot?.time === slot.time ? GOLD : slot.available ? '#fff' : 'rgba(255,255,255,0.2)',
                          fontSize: '13px', fontWeight: 600, cursor: slot.available ? 'pointer' : 'not-allowed',
                          textAlign: 'center',
                        }}
                      >
                        {slot.label}
                        {(() => {
                          if (isReschedule || isTrial || !selectedDate) return null
                          const pr = priceAt(formatDateLA(selectedDate), slot.time, 30)
                          if (!pr) return null
                          return (
                            <>
                              <PriceTag price={pr} dim={!slot.available} />
                              {pr.offPeak && (
                                <div style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '0.1em', color: slot.available ? 'rgba(255,255,255,0.45)' : 'rgba(255,255,255,0.2)', marginTop: '3px' }}>{t('booking.offPeak')}</div>
                              )}
                            </>
                          )
                        })()}
                        {!isTrial && slot.available && slot.within24h && (
                          <div style={{ fontSize: '10px', color: '#c9a84c', marginTop: '2px', fontWeight: 700 }}>24h</div>
                        )}
                        {selectedCourse && (selectedCourse.slug === '1on4' || selectedCourse.slug === 'team') && (
                          <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)', marginTop: '2px' }}>{t('booking.spotsLeft', { n: slot.max - slot.enrolled })}</div>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {groupFlow && (() => {
              const byDate: Record<string, any[]> = {}
              for (const d of groupWeeks) byDate[d.date] = d.classes || []
              const todayDs = formatDateLA(today)
              return (
                <div>
                  {/* Months run on down the page. A ticked lesson in September has
                      to stay visible while its owner looks at October, or nobody
                      dares carry on ticking. */}
                  {Array.from({ length: monthsShown }).map((_, mi) => {
                    const first = new Date(today.getFullYear(), today.getMonth() + mi, 1)
                    const y = first.getFullYear()
                    const m = first.getMonth()
                    const mm2 = String(m + 1).padStart(2, '0')
                    return (
                      <div key={`${y}-${mm2}`} style={{ marginBottom: '18px' }}>
                        <div style={{ position: 'sticky', top: 0, zIndex: 2, background: DARK, display: 'flex', alignItems: 'center', gap: '12px', padding: '8px 0 10px' }}>
                          <span style={{ fontSize: '14px', fontWeight: 700, color: '#fff' }}>{t('booking.calMonth', { month: t('date.month.' + (m + 1)), year: y })}</span>
                          <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.08)' }} />
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: '4px', marginBottom: '4px' }}>
                          {[0, 1, 2, 3, 4, 5, 6].map(d => (
                            <div key={d} style={{ textAlign: 'center', fontSize: '10px', fontWeight: 700, letterSpacing: '1px', color: 'rgba(255,255,255,0.35)', padding: '4px 0' }}>{t('date.weekdayShort.' + d)}</div>
                          ))}
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: '4px' }}>
                          {Array.from({ length: getFirstDayOfMonth(y, m) }).map((_, i) => <div key={`e-${i}`} />)}
                          {Array.from({ length: getDaysInMonth(y, m) }).map((_, i) => {
                            const dt = new Date(y, m, i + 1)
                            const ds = `${y}-${mm2}-${String(i + 1).padStart(2, '0')}`
                            const slots = (byDate[ds] || []).filter((c: any) => meetsLeadTime(ds, c.time))
                            const isPast = ds < todayDs
                            const isToday2 = ds === todayDs
                            return (
                              <div key={ds} style={{ backgroundColor: NAVY, backgroundImage: isPast ? 'repeating-linear-gradient(135deg, rgba(255,255,255,0.05) 0px, rgba(255,255,255,0.05) 2px, transparent 2px, transparent 10px)' : 'none', border: `1px solid ${isToday2 ? GOLD + '66' : 'rgba(255,255,255,0.08)'}`, borderRadius: '8px', padding: '5px 3px', minHeight: '76px', minWidth: 0 }}>
                                <div style={{ textAlign: 'center', fontSize: '12px', fontWeight: 700, marginBottom: '4px', color: isToday2 ? GOLD : isPast ? 'rgba(255,255,255,0.2)' : slots.length > 0 ? '#fff' : 'rgba(255,255,255,0.4)' }}>{i + 1}</div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                                  {slots.map((sl: any) => {
                                    const w24 = isWithin24Hours(ds, sl.time)
                                    const key = `${ds}|${sl.time}`
                                    const inBasket = recurSel.has(key)
                                    const price = priceAt(ds, sl.time, 30)
                                    const cost = price?.charged ?? 0
                                    // A lesson the remaining balance cannot cover is
                                    // refused at the tick, not at Confirm, where the
                                    // parent has already chosen a dozen of them.
                                    const affordable = inBasket || basketTotal + cost <= balance
                                    const clickable = !sl.full && !sl.already_booked && affordable
                                    const cellBorder = inBasket ? GOLD : sl.full || sl.already_booked ? 'rgba(255,255,255,0.06)' : !affordable ? 'rgba(255,255,255,0.10)' : myBandColor + '55'
                                    return (
                                      <button key={sl.coach_id + sl.time}
                                        onClick={() => {
                                          if (sl.full || sl.already_booked) return
                                          const c = coaches.find(x => x.id === sl.coach_id)
                                          if (!c) return
                                          // Ticking is the booking now. The slot is also
                                          // remembered as "the one on screen", so the
                                          // repeat-weekly shortcut below knows which
                                          // weekday and hour it is being asked to repeat.
                                          setSelectedDate(dt)
                                          setSelectedCoach(c)
                                          setSelectedSlot({ time: sl.time, label: formatTime(sl.time), available: true, enrolled: sl.enrolled, max: sl.max, session_id: sl.session_id, within24h: w24 })
                                          setRecurOpen(false); setRecurMsg('')
                                          setRecurSel(prev => {
                                            const n = new Map(prev)
                                            if (n.has(key)) { n.delete(key); return n }
                                            if (!affordable) return n
                                            n.set(key, { date: ds, time: sl.time, label: formatTime(sl.time), points: cost })
                                            return n
                                          })
                                        }}
                                        disabled={!clickable}
                                        style={{
                                          padding: '4px 2px', borderRadius: '5px', textAlign: 'center',
                                          border: `2px ${!affordable && !inBasket && !sl.full && !sl.already_booked ? 'dashed' : 'solid'} ${cellBorder}`,
                                          background: inBasket ? `${GOLD}20` : clickable ? myBandColor + '18' : 'rgba(255,255,255,0.03)',
                                          cursor: clickable ? 'pointer' : 'not-allowed',
                                        }}>
                                        {/* Each of the seven columns is about 47px on a phone, so the
                                            time and the seat count get a line each. They were side by
                                            side with no whitespace between the two spans -- which gives
                                            the browser nowhere to break, so "4 left" was painted outside
                                            the cell rather than wrapped inside it. */}
                                        <span style={{ display: 'block', fontSize: '9.5px', fontWeight: 700, letterSpacing: '-0.2px', color: inBasket ? GOLD : clickable ? '#fff' : 'rgba(255,255,255,0.3)' }}>
                                          <span style={{ display: 'block', whiteSpace: 'nowrap' }}>{inBasket ? '✓ ' : ''}{formatTimeCompact(sl.time)}</span>
                                          <span style={{ display: 'block', fontWeight: 600, marginTop: '1px', whiteSpace: 'nowrap', color: sl.already_booked ? 'rgba(255,255,255,0.4)' : sl.full ? 'rgba(255,255,255,0.3)' : inBasket ? GOLD : !affordable ? 'rgba(255,255,255,0.25)' : myBandColor }}>
                                            {sl.already_booked ? '✓' : sl.full ? t('booking.full') : !affordable ? t('booking.group.tooDear') : t('booking.spotsLeft', { n: sl.max - sl.enrolled })}
                                          </span>
                                          {w24 && clickable ? <span style={{ display: 'block', color: '#c9a84c' }}>24h</span> : null}
                                        </span>
                                      </button>
                                    )
                                  })}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })}

                  {monthsShown < 6 && (
                    <button onClick={() => setMonthsShown(n => n + 1)}
                      style={{ width: '100%', marginBottom: '16px', padding: '11px', background: 'transparent', border: '1px dashed rgba(255,255,255,0.18)', borderRadius: '10px', color: 'rgba(255,255,255,0.55)', fontSize: '12.5px', fontWeight: 600, cursor: 'pointer' }}>
                      {t('booking.group.loadMore')}
                    </button>
                  )}
                  <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.45)', marginBottom: '8px' }}>
                    {myGroupBand ? t('booking.group.showingBand', { name: selectedStudent?.full_name || '', min: myGroupBand.min, max: myGroupBand.max }) : t('booking.group.showing', { name: selectedStudent?.full_name || '' })}
                  </div>
                  {selectedSlot && selectedDate && selectedCoach && (
                    <div style={{ background: `${GOLD}12`, border: `1px solid ${GOLD}55`, borderRadius: '10px', padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '13px', fontWeight: 600, color: '#fff' }}>
                        {selectedDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} · {selectedSlot.label}
                        <span style={{ fontSize: '12px', fontWeight: 400, color: 'rgba(255,255,255,0.5)', marginLeft: '8px' }}>{t('booking.group.withCoach', { name: selectedCoach.first_name })}</span>
                      </span>
                      <span style={{ fontSize: '12px', fontWeight: 700, color: GOLD }}>{t('booking.group.ready')}</span>
                    </div>
                  )}
                  {/* The basket. Without it, picking a second weekday looks like
                      it replaced the first, and the family books twice. */}
                  {recurSel.size > 0 && !recurOpen && (
                    <div style={{ marginTop: '10px', background: NAVY, border: `1px solid ${GOLD}55`, borderRadius: '12px', padding: '14px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '13px', fontWeight: 700, color: GOLD }}>
                          {t('booking.recur.basket', { n: recurSel.size, points: basketTotal })}
                        </span>
                        <button onClick={() => setRecurSel(new Map())}
                          style={{ background: 'none', border: 'none', padding: 0, fontSize: '12px', color: 'rgba(255,255,255,0.45)', cursor: 'pointer', textDecoration: 'underline' }}>
                          {t('booking.recur.clearAll')}
                        </button>
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '10px' }}>
                        {basket.map(x => (
                          <button key={x.date + x.time}
                            onClick={() => setRecurSel(prev => { const n = new Map(prev); n.delete(`${x.date}|${x.time}`); return n })}
                            style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11.5px', fontWeight: 600, padding: '5px 9px', borderRadius: '6px', background: `${GOLD}18`, border: `1px solid ${GOLD}44`, color: GOLD, cursor: 'pointer' }}>
                            {new Date(x.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                            {basketTimes.size > 1 ? ` · ${x.label}` : ''}
                            <span aria-hidden style={{ color: 'rgba(255,255,255,0.4)' }}>×</span>
                          </button>
                        ))}
                      </div>
                      <div style={{ fontSize: '11.5px', color: 'rgba(255,255,255,0.4)', marginTop: '10px', lineHeight: 1.6 }}>
                        {t('booking.recur.basketHint', { points: Math.max(0, balance - basketTotal) })}
                      </div>
                    </div>
                  )}
                  {recurMsg && (
                    <div style={{ marginTop: '10px', background: 'rgba(80,200,120,0.1)', border: '1px solid rgba(80,200,120,0.35)', borderRadius: '10px', padding: '12px 16px', color: '#7fd8a0', fontSize: '13px', fontWeight: 600 }}>{recurMsg}</div>
                  )}
                  {selectedSlot && selectedDate && selectedCoach && !recurOpen && (
                    <button disabled={recurBusy}
                      onClick={async () => {
                        if (!selectedStudent) return
                        setRecurBusy(true); setRecurMsg('')
                        try {
                          const res = await fetch('/api/bookings/recurring', {
                            method: 'POST', headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ action: 'preview', student_id: selectedStudent.id, coach_id: selectedCoach.id, start_time: selectedSlot.time, start_date: formatDateLA(selectedDate) }),
                          })
                          const j = await res.json().catch(() => ({}))
                          if (!res.ok) { setRecurMsg(tErr(j.error, 'booking.recur.err.preview')) }
                          else {
                            const cands = j.candidates || []
                            const quote = new Map<string, number>(
                              cands.filter((c: any) => c.points != null).map((c: any) => [c.date, Number(c.points)]))
                            setRecurList(cands)
                            setRecurQuote(quote)
                            // Pre-tick as many dates as the wallet actually
                            // covers, cheapest arithmetic first: running total,
                            // in date order, stopping at the balance.
                            const bal = j.balance ?? balance
                            setRecurSel(prev => {
                              const n = new Map(prev)
                              let spent = [...n.values()].reduce((a, x) => a + x.points, 0)
                              for (const c of cands) {
                                if (c.status !== 'ok') continue
                                const key = `${c.date}|${selectedSlot.time}`
                                if (n.has(key)) continue
                                const cost = quote.get(c.date) ?? 0
                                if (spent + cost > bal) break
                                n.set(key, { date: c.date, time: selectedSlot.time, label: selectedSlot.label, points: cost })
                                spent += cost
                              }
                              return n
                            })
                            setRecurOpen(true)
                          }
                        } catch { setRecurMsg(t('cart.err.network')) }
                        setRecurBusy(false)
                      }}
                      style={{ marginTop: '10px', width: '100%', padding: '13px', background: 'transparent', border: `1px solid ${GOLD}`, borderRadius: '10px', color: GOLD, fontSize: '13px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', cursor: recurBusy ? 'wait' : 'pointer' }}>
                      {recurBusy ? t('booking.recur.loading') : t('booking.recur.cta', { weekday: selectedDate.toLocaleDateString('en-US', { weekday: 'long' }), time: selectedSlot.label })}
                    </button>
                  )}
                  {recurOpen && selectedSlot && selectedDate && selectedCoach && (
                    <div style={{ marginTop: '10px', background: NAVY, border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', padding: '16px' }}>
                      <div style={{ fontSize: '13px', fontWeight: 700, color: '#fff', marginBottom: '4px' }}>
                        {t('booking.recur.title', { weekday: selectedDate.toLocaleDateString('en-US', { weekday: 'long' }), time: selectedSlot.label, year: selectedDate.getFullYear() })}
                      </div>
                      <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.45)', marginBottom: '12px' }}>{t('booking.recur.hint')}</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '320px', overflowY: 'auto' }}>
                        {recurList.map((c: any) => {
                          const on = recurSel.has(`${c.date}|${selectedSlot.time}`)
                          const selectable = c.status === 'ok'
                          const label = new Date(c.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
                          const statusText = c.status === 'ok' ? t('booking.spotsLeft', { n: c.spots }) : c.status === 'full' ? t('booking.full') : c.status === 'booked' ? t('booking.booked') : c.status === 'time_off' ? t('booking.recur.status.timeOff') : c.status === 'too_soon' ? t('booking.recur.status.tooSoon') : t('booking.recur.status.noClass')
                          const cost = recurQuote.get(c.date) ?? 0
                          return (
                            <button key={c.date} disabled={!selectable}
                              onClick={() => {
                                const key = `${c.date}|${selectedSlot.time}`
                                setRecurSel(prev => {
                                  const n = new Map(prev)
                                  if (n.has(key)) { n.delete(key); return n }
                                  // Ticking a lesson the wallet cannot cover is
                                  // refused here rather than at Confirm, where
                                  // the parent has already chosen nineteen of
                                  // them. The sum is over the WHOLE basket, not
                                  // just this weekday's ticks.
                                  const spent = [...n.values()].reduce((a, x) => a + x.points, 0)
                                  if (spent + cost <= balance) {
                                    n.set(key, { date: c.date, time: selectedSlot.time, label: selectedSlot.label, points: cost })
                                  }
                                  return n
                                })
                              }}
                              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', borderRadius: '8px', textAlign: 'left',
                                border: `2px solid ${on ? GOLD : selectable ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.05)'}`,
                                background: on ? `${GOLD}18` : 'rgba(255,255,255,0.02)',
                                cursor: selectable ? 'pointer' : 'not-allowed' }}>
                              <span style={{ fontSize: '13px', fontWeight: 600, color: on ? GOLD : selectable ? '#fff' : 'rgba(255,255,255,0.3)' }}>{on ? '✓ ' : ''}{label}</span>
                              <span style={{ fontSize: '12px', color: on ? GOLD : selectable ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.3)' }}>
                                {statusText}
                                {selectable && cost > 0 && <span style={{ marginLeft: '8px', fontVariantNumeric: 'tabular-nums', color: on ? GOLD : 'rgba(255,255,255,0.35)' }}>{t('points.unit', { n: cost })}</span>}
                              </span>
                            </button>
                          )
                        })}
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '12px' }}>
                        <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)' }}>
                          {t('booking.recur.usingPoints', { n: recurSel.size, points: basketTotal })}
                        </span>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button onClick={() => {
                              // Scoped to the weekday and time on screen. Clearing
                              // here must not throw away the Monday picks a family
                              // made before switching to Wednesday.
                              setRecurSel(prev => {
                                const n = new Map(prev)
                                const mine = recurList.filter((c: any) => c.status === 'ok' && n.has(`${c.date}|${selectedSlot.time}`))
                                if (mine.length > 0) {
                                  for (const c of mine) n.delete(`${c.date}|${selectedSlot.time}`)
                                  return n
                                }
                                let spent = [...n.values()].reduce((a, x) => a + x.points, 0)
                                for (const c of recurList) {
                                  if (c.status !== 'ok') continue
                                  const key = `${c.date}|${selectedSlot.time}`
                                  if (n.has(key)) continue
                                  const cost = recurQuote.get(c.date) ?? 0
                                  if (spent + cost > balance) break
                                  n.set(key, { date: c.date, time: selectedSlot.time, label: selectedSlot.label, points: cost })
                                  spent += cost
                                }
                                return n
                              })
                            }}
                            style={{ padding: '10px 16px', background: 'transparent', border: `1px solid ${GOLD}55`, borderRadius: '8px', color: GOLD, fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>
                            {recurList.some((c: any) => recurSel.has(`${c.date}|${selectedSlot.time}`)) ? t('booking.recur.deselectAll') : t('booking.recur.selectAll')}</button>
                          <button onClick={() => { setRecurOpen(false); setRecurMsg('') }}
                            style={{ padding: '10px 16px', background: 'transparent', border: `1px solid ${GOLD}55`, borderRadius: '8px', color: GOLD, fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}>{t('booking.recur.pickMore')}</button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )
            })()}

            <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
              <button onClick={() => { setStep(groupFlow ? 1 : 2); setSelectedDate(null); setSelectedSlot(null); setRecurOpen(false); setRecurPlan([]); setRecurSel(new Map()) }} style={{
                flex: 1, padding: '14px', background: 'transparent',
                color: 'rgba(255,255,255,0.5)', border: '1px solid rgba(255,255,255,0.15)',
                borderRadius: '10px', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
              }}>{t('booking.back')}</button>
              <button
                onClick={goToConfirm}
                disabled={!canContinue}
                style={{
                  flex: 2, padding: '14px',
                  background: canContinue ? GOLD : 'rgba(255,255,255,0.1)',
                  color: canContinue ? NAVY : 'rgba(255,255,255,0.3)',
                  border: 'none', borderRadius: '10px',
                  fontSize: '13px', fontWeight: 700, letterSpacing: '1.5px',
                  textTransform: 'uppercase', cursor: canContinue ? 'pointer' : 'not-allowed',
                }}
              >{t('booking.continue')}</button>
            </div>
          </div>
        )}

        {step === 4 && (
          <div>
            <SectionTitle eyebrow={t('booking.stepN', { n: stepNumber })} title={t('booking.s5.title')} />
            <div style={{ background: NAVY, borderRadius: '16px', padding: '28px', border: '1px solid rgba(255,255,255,0.08)', marginBottom: '20px' }}>
              {(recurPlan.length > 0 ? [
                { label: t('booking.sum.swimmer'), value: selectedStudent?.full_name },
                { label: t('booking.sum.course'), value: selectedCourse ? tDb(locale, 'course_types', selectedCourse.id, selectedCourse.name) : '' },
                { label: t('booking.sum.coach'), value: selectedCoach?.first_name },
                // Naming one hour above a batch that spans two of them tells the
                // family the wrong time for half their lessons.
                { label: t('booking.sum.time'), value: planTimes.size > 1 ? t('booking.sum.timeMultiple', { n: planTimes.size }) : recurPlan[0]?.label },
                { label: t('booking.sum.duration'), value: t('booking.lenMin', { n: selectedCourse?.duration_minutes ?? 0 }) },
                { label: t('booking.sum.pointsUsed'), value: t('points.unit', { n: recurTotal }) },
              ] : [
                { label: t((hourRoster.length > 1 || (selectedCourse?.slug === '1on2' && selectedStudent2)) ? 'booking.sum.swimmers' : 'booking.sum.swimmer'),
                  value: hourRoster.length > 1
                    ? hourRoster.map((x: any) => x.full_name).join(' & ')
                    : selectedCourse?.slug === '1on2' && selectedStudent2
                    ? `${selectedStudent?.full_name} & ${selectedStudent2.full_name}`
                    : selectedStudent?.full_name },
                // A Swim Assessment is booked as a 1-on-1 slot, so the course type
                // behind it says "1-on-1 Private". Naming it that on the last screen
                // before payment describes something the parent did not choose.
                { label: t('booking.sum.course'), value: isTrial ? t('common.assessment') : (selectedCourse ? tDb(locale, 'course_types', selectedCourse.id, selectedCourse.name) : '') },
                { label: t('booking.sum.coach'), value: selectedHour?.relay ? `${selectedHour.coach1_name} → ${selectedHour.coach2_name}` : selectedCoach?.first_name },
                { label: t('booking.sum.date'), value: selectedDate?.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) },
                { label: t('booking.sum.time'), value: selectedSlot?.label },
                { label: t('booking.sum.duration'), value: t('booking.lenMin', { n: selectedHour ? 60 : selectedCourse?.duration_minutes ?? 0 }) },
                ...(isTrial || isReschedule
                  ? [{ label: t('booking.sum.price'), value: isTrial ? (trialHasCredit ? t('booking.sum.prepaid') : `$${TRIAL_PRICE_CENTS / 100}`) : t('booking.noExtraCharge') }]
                  : []),
              ]).map(row => (
                <div key={row.label} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '12px 0', borderBottom: '1px solid rgba(255,255,255,0.06)',
                }}>
                  <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.4)' }}>{row.label}</span>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: '#fff' }}>{row.value}</span>
                </div>
              ))}
              {/* Every date, spelled out. This is the last screen before the
                  credits are spent, so "3 lessons" is not enough -- a parent has
                  to be able to see that one of them lands on a week they are away. */}
              {recurPlan.length > 0 && (
                <div style={{ padding: '12px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                  <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.4)', marginBottom: '10px' }}>
                    {t('booking.recur.sumDates', { n: recurPlan.length })}
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {recurPlan.map(x => (
                      <span key={x.date + x.time} style={{ fontSize: '12px', fontWeight: 600, padding: '5px 10px', borderRadius: '6px', background: `${GOLD}18`, border: `1px solid ${GOLD}44`, color: GOLD }}>
                        {new Date(x.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                        {planTimes.size > 1 ? ` · ${x.label}` : ''}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {/* The breakdown. Discounts are written as percentages, not as
                  "-4 pts, -3 pts": they are multiplied together and rounded down
                  once, so per-line whole numbers would not add up to the total
                  and a parent subtracting them would find us out. */}
              {!isTrial && !isReschedule && recurPlan.length === 0 && bookingPrice && (
                <div style={{ paddingTop: '12px' }}>
                  {[
                    { k: 'base', label: bookingPrice.seats > 1 ? t('booking.price.baseSeats', { n: bookingPrice.seats }) : t('booking.price.base'), value: String(bookingPrice.base * bookingPrice.seats), dim: true },
                    ...(bookingPrice.vipPct > 0 ? [{ k: 'vip', label: t('booking.price.vip', { n: bookingPrice.vipLevel }), value: `−${Math.round(bookingPrice.vipPct * 100)}%`, dim: true }] : []),
                    ...(bookingPrice.offPeak ? [{ k: 'off', label: t('booking.price.offPeak'), value: `−${Math.round(bookingPrice.offPeakPct * 100)}%`, dim: true }] : []),
                  ].map(row => (
                    <div key={row.k} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0' }}>
                      <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.4)' }}>{row.label}</span>
                      <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.6)', fontVariantNumeric: 'tabular-nums' }}>{row.value}</span>
                    </div>
                  ))}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0 6px', borderTop: '1px solid rgba(255,255,255,0.1)', marginTop: '6px' }}>
                    <span style={{ fontSize: '13px', fontWeight: 700, color: '#fff' }}>{t('booking.price.total')}</span>
                    <span style={{ fontSize: '16px', fontWeight: 700, color: GOLD, fontVariantNumeric: 'tabular-nums' }}>{t('points.unit', { n: bookingCost })}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.4)' }}>{t('booking.price.after')}</span>
                    <span style={{ fontSize: '13px', fontWeight: 700, color: 'rgba(255,255,255,0.7)', fontVariantNumeric: 'tabular-nums' }}>{t('points.unit', { n: balanceAfter })}</span>
                  </div>
                </div>
              )}
              {/* The batch's own breakdown. Every lesson is priced on its own
                  line above; this says what the whole thing costs and what the
                  discounts took off, because one lesson's percentages cannot
                  describe a batch where half the lessons are off-peak. */}
              {recurPlan.length > 0 && (
                <div style={{ paddingTop: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0' }}>
                    <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.4)' }}>{t('booking.price.batchBase', { n: recurPlan.length })}</span>
                    <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.6)', fontVariantNumeric: 'tabular-nums' }}>{recurBase}</span>
                  </div>
                  {recurBase > recurTotal && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0' }}>
                      <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.4)' }}>{t('booking.price.batchDiscount')}</span>
                      <span style={{ fontSize: '13px', color: myBandColor, fontVariantNumeric: 'tabular-nums' }}>−{recurBase - recurTotal}</span>
                    </div>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0 6px', borderTop: '1px solid rgba(255,255,255,0.1)', marginTop: '6px' }}>
                    <span style={{ fontSize: '13px', fontWeight: 700, color: '#fff' }}>{t('booking.price.total')}</span>
                    <span style={{ fontSize: '16px', fontWeight: 700, color: GOLD, fontVariantNumeric: 'tabular-nums' }}>{t('points.unit', { n: recurTotal })}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.4)' }}>{t('booking.price.after')}</span>
                    <span style={{ fontSize: '13px', fontWeight: 700, color: 'rgba(255,255,255,0.7)', fontVariantNumeric: 'tabular-nums' }}>{t('points.unit', { n: Math.max(0, balance - recurTotal) })}</span>
                  </div>
                </div>
              )}
            </div>
            {!isTrial && !isReschedule && (bookingCost > balance || recurTotal > balance) && (
              <div style={{ background: 'rgba(224,90,74,0.1)', border: '1px solid rgba(224,90,74,0.3)', borderRadius: '10px', padding: '14px 18px', marginBottom: '20px', fontSize: '13px', color: '#e05a4a' }}>
                ⚠️ {t('booking.short.body', { have: balance, need: recurPlan.length > 0 ? recurTotal : bookingCost })}
                <div><BuyPointsLink label={t('booking.short.cta')} /></div>
              </div>
            )}
            <div style={{ background: 'rgba(201,168,76,0.08)', border: '1px solid rgba(201,168,76,0.25)', borderRadius: '10px', padding: '12px 16px', marginBottom: '20px' }}>
              <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.65)', lineHeight: 1.6 }}>
                {t('booking.policy.points', { n: wallet?.forgiveness ?? 0 })}
                <a href="/terms" target="_blank" rel="noopener noreferrer" style={{ color: GOLD, textDecoration: 'underline', fontWeight: 600 }}>
                  {t('booking.viewTerms')}
                </a>
              </span>
            </div>
            {cartMsg && (
              <div style={{ background: 'rgba(220,80,80,0.12)', border: '1px solid rgba(220,80,80,0.4)', borderRadius: '10px', padding: '12px 16px', marginBottom: '20px', color: '#f0a0a0', fontSize: '13px' }}>
                {cartMsg}
              </div>
            )}
            <div style={{ display: 'flex', gap: '12px' }}>
              <button onClick={() => { setStep(3); setRecurPlan([]) }} style={{
                flex: 1, padding: '14px', background: 'transparent',
                color: 'rgba(255,255,255,0.5)', border: '1px solid rgba(255,255,255,0.15)',
                borderRadius: '10px', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
              }}>{t('booking.back')}</button>
              {!isTrial && !isReschedule && recurPlan.length === 0 && selectedCourse?.slug !== '1on2' && (
                <button
                  onClick={handleAddToCart}
                  disabled={submitting || addingToCart}
                  style={{
                    flex: 1, padding: '14px', background: 'transparent',
                    color: (submitting || addingToCart) ? 'rgba(255,255,255,0.3)' : GOLD,
                    border: `1px solid ${GOLD}`, borderRadius: '10px',
                    fontSize: '13px', fontWeight: 700, letterSpacing: '1px',
                    textTransform: 'uppercase', cursor: (submitting || addingToCart) ? 'not-allowed' : 'pointer',
                  }}
                >{addingToCart ? t('booking.addingToCart') : t('booking.addToCart')}</button>
              )}
              <button
                onClick={handleConfirm}
                disabled={submitting || (!isTrial && !isReschedule && (recurPlan.length > 0 ? recurTotal : bookingCost) > balance)}
                style={{
                  flex: 2, padding: '14px',
                  background: submitting ? 'rgba(255,255,255,0.1)' : GOLD,
                  color: submitting ? 'rgba(255,255,255,0.3)' : NAVY,
                  border: 'none', borderRadius: '10px',
                  fontSize: '13px', fontWeight: 700, letterSpacing: '1.5px',
                  textTransform: 'uppercase', cursor: submitting ? 'not-allowed' : 'pointer',
                }}
              >{submitting ? (isTrial && !trialHasCredit ? t('booking.redirecting') : t('booking.submitting')) : recurPlan.length > 0 ? t('booking.recur.yesBook', { n: recurPlan.length }) : isTrial ? (trialHasCredit ? t('booking.confirmBooking') : t('booking.continueToPayment')) : isReschedule ? t('booking.confirmReschedule') : t('booking.confirmBooking')}</button>
            </div>
          </div>
        )}
      </div>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,700;0,900;1,700&family=DM+Sans:wght@400;500;600;700&display=swap');`}</style>
      <NoticeModal title={t('common.noticeTitle')} message={notice} closeLabel={t('common.close')} onClose={() => setNotice(null)} />
      {parentId && <ChatWidget parentId={parentId} />}
      {parentId && <BookingCart refreshSignal={cartRefresh} onCommitted={() => { if (selectedCoach && selectedDate) loadTimeSlots() }} />}
    </div>
  )
}
