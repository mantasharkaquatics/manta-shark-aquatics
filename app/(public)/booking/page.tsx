'use client'

import React, { useEffect, useRef, useState } from 'react'
import { meetsLeadTime, isWithin24Hours } from '@/lib/booking-time'
import { BASE_POINTS, OFF_PEAK_DISCOUNT, OFF_PEAK_ENABLED, priceLesson, type PriceBreakdown } from '@/lib/points'
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
type PlanSlot = { date: string; time: string; label: string; points: number; coachId: string; coachName?: string }

const NAVY = '#1a2744'
const DARK = '#111d38'
const GOLD = '#c9a84c'
// One colour per coach, in the order the coaches load, so the dots on a
// calendar day and the faces on a time slot read as the same person.
const COACH_COLORS = [GOLD, '#4a90c4', '#e05a4a', '#4caf72', '#a78bfa', '#e0a04a']
type Openings = { coaches: { id: string; first_name: string }[]; preferred: string | null; days: Record<string, Record<string, string[]>> }

interface Student { id: string; full_name: string; current_level: number; parent_id?: string }
interface PartnerStudent { id: string; full_name: string; current_level: number; parent_id: string; isPartner: true; partnerParentId: string; partnershipId: string }
interface CourseType { id: string; name: string; slug: string; duration_minutes: number; max_students: number; description: string }
interface Coach { id: string; first_name: string; last_name: string }
interface TimeSlot { time: string; label: string; available: boolean; enrolled: number; max: number; session_id?: string; within24h?: boolean; fill?: string }
type Wallet = {
  balance: number
  lessonsCompleted: number
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

function SectionTitle({ eyebrow, title }: { eyebrow?: string; title: string }) {
  return (
    <div style={{ marginBottom: '24px' }}>
      {eyebrow && <div style={{
        display: 'inline-flex', alignItems: 'center', gap: '8px',
        fontSize: '11.5px', fontWeight: 600, letterSpacing: '3px',
        textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)', marginBottom: '8px',
      }}>
        <span style={{ width: 5, height: 5, borderRadius: '50%', background: GOLD, display: 'inline-block' }} />
        {eyebrow}
      </div>}
      <h2 style={{
        fontFamily: "'Playfair Display', serif",
        fontSize: 'clamp(20px,2.5vw,28px)', fontWeight: 900,
        color: '#fff', margin: 0,
      }}>{title}</h2>
    </div>
  )
}

/* One finished step, folded down to a line. The booking used to be five
   screens joined by Continue / Back buttons and a row of numbered circles; now
   each choice folds up the moment it is made and the next one opens under it,
   so these lines are both the progress bar and the way back. */
function DoneRow({ label, value, sub, onChange, changeLabel }: {
  label: string; value: React.ReactNode; sub?: string; onChange?: () => void; changeLabel: string
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '12px', background: NAVY,
      border: '1px solid rgba(255,255,255,0.08)', borderRadius: '12px',
      padding: '4px 12px 4px 16px', minHeight: '52px', marginBottom: '8px',
    }}>
      <span style={{
        width: '20px', height: '20px', borderRadius: '50%', background: GOLD, color: NAVY, flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 900,
      }}>✓</span>
      <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.45)', width: '40px', flexShrink: 0 }}>{label}</span>
      <span style={{ flex: 1, minWidth: 0, fontSize: '15px', fontWeight: 700, color: '#fff' }}>
        {value}
        {sub && <span style={{ fontSize: '13px', fontWeight: 500, color: 'rgba(255,255,255,0.45)', marginLeft: '6px' }}>{sub}</span>}
      </span>
      {onChange && (
        <button onClick={onChange} style={{
          background: 'none', border: 'none', color: GOLD, fontSize: '14px', fontWeight: 700,
          cursor: 'pointer', padding: '0 6px', minHeight: '44px', flexShrink: 0,
        }}>{changeLabel}</button>
      )}
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
          // On the corner, not inside the card: at 12px in it sat on top of
          // the price badge of the course cards.
          position: 'absolute', top: '-8px', right: '-8px',
          width: '22px', height: '22px', borderRadius: '50%', boxShadow: '0 0 0 3px #111d38',
          background: color, display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '12px', color: '#fff', fontWeight: 700,
        }}>✓</div>
      )}
      {children}
    </div>
  )
}

export default function BookingPage() {
  const t = useT()
  const locale = useLocale()
  // Dates were printed with a hard-coded 'en-US', so the Chinese page read
  // "Thursday, Sep 24 的可預約時段".
  const dateLoc = locale === 'en' ? 'en-US' : locale
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
  // Set by a tap on the course step; the step moves on as soon as that tap
  // leaves the step complete (a 1-on-2 still waits for its second swimmer,
  // and a family short of points stays to see the warning).
  const advanceRef = useRef(false)

  // ── 1on4 class-based flow (cross-coach, band-matched) ──
  const groupFlow = !isTrial && selectedCourse?.slug === '1on4'
  // Private lessons are chosen time-first: every coach's open times at once,
  // with a row of coach buttons on top ("any coach" or one of them) instead of
  // a coach step in front of the calendar.
  const privateFlow = !!selectedCourse && !groupFlow && (selectedCourse.slug === '1on1' || selectedCourse.slug === '1on2')
  const [coachFilter, setCoachFilter] = useState<string>('any')
  const [openings, setOpenings] = useState<Openings | null>(null)
  // Which coach each date of a weekly series would be with (a substitute where
  // the usual coach is away), as the preview returned it.
  const [recurCoach, setRecurCoach] = useState<Map<string, string>>(new Map())
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
    // An assessment is only ever offered to a swimmer with no level yet, so a
    // swimmer who has one needs no round trip (it took about two seconds).
    if (selectedStudent.current_level != null) { if (lockedRef.current) setStep(1); return }
    fetch(`/api/bookings/trial-eligibility?student_id=${selectedStudent.id}`)
      .then(r => r.ok ? r.json() : { eligible: false })
      .then(j => {
        setTrialEligible(!!j.eligible)
        setTrialHasCredit(!!j.hasCredit)
        if (lockedRef.current) {
          if (j.hasCredit) {
            const ct = courseTypesRef.current.find(c => c.slug === '1on1')
            if (ct) { setSelectedCourse(ct); setIsTrial(true); setStep(3); return }
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
  const [calSlide, setCalSlide] = useState<'l' | 'r' | null>(null)
  const calCardRef = useRef<HTMLDivElement | null>(null)
  const shiftMonthRef = useRef<(d: 1 | -1) => void>(() => {})
  const calTouchRef = useRef<{ x: number; y: number } | null>(null)
  // A trackpad swipe arrives as a stream of wheel events with deltaX. Add them
  // up, turn the page once the swipe is clearly sideways and long enough, then
  // ignore the tail of the same gesture (the trackpad's momentum) for a moment.
  // The listener is not passive so it can cancel the event: otherwise Chrome
  // reads the same swipe as "go back a page".
  useEffect(() => {
    const el = calCardRef.current
    if (!el) return
    let acc = 0, lockUntil = 0
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return
      e.preventDefault()
      const now = Date.now()
      if (now < lockUntil) return
      acc += e.deltaX
      if (Math.abs(acc) > 80) { shiftMonthRef.current(acc > 0 ? 1 : -1); acc = 0; lockUntil = now + 700 }
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  })
  // Seven columns across a 390px phone is about 47px a cell -- too narrow for a
  // time and a seat count, let alone two of them. On a phone the cell carries
  // only the day and how its slots stand; the slots themselves open underneath.
  const [isPhone, setIsPhone] = useState(false)
  const [openDay, setOpenDay] = useState<string | null>(null)
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
  // Which of the slot's future occurrences the shortcut is proposing, by key.
  // It only ever PROPOSES: nothing is in the basket until it is accepted. The
  // dates themselves are shown and each can be dropped, because "8 weeks" is an
  // abstraction whose answer lives on a calendar the family may not be looking
  // at -- the week they are away is a date, not a range.
  const [ghostSel, setGhostSel] = useState<Set<string>>(new Set())
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
    // One call for the whole view, from this week's Sunday to the end of the
    // last month on screen. It used to be one six-week call per month, which
    // overlapped and doubled the server's work.
    const from = new Date(today.getFullYear(), today.getMonth(), today.getDate() - today.getDay())
    const lastDay = new Date(today.getFullYear(), today.getMonth() + monthsShown, 0)
    const weeks = Math.ceil((lastDay.getTime() - from.getTime()) / (7 * 86400000)) + 1
    const st = `${from.getFullYear()}-${String(from.getMonth() + 1).padStart(2, '0')}-${String(from.getDate()).padStart(2, '0')}`
    let live = true
    fetch(`/api/bookings/group-classes?student_id=${selectedStudent.id}&weeks=${weeks}&start=${st}`)
      .then(r => r.json()).catch(() => null)
      .then(r => {
        if (!live) return
        setGroupWeeks(r?.days || [])
      })
    return () => { live = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupFlow, selectedStudent, monthsShown, cartRefresh])

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mq = window.matchMedia('(max-width: 640px)')
    const sync = () => setIsPhone(mq.matches)
    sync()
    // One month at a time on a phone; "load one more month" still adds the next.
    if (mq.matches) setMonthsShown(1)
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [])

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

      // The linked-family list is only needed for a 1-on-2's second swimmer,
      // so the page no longer waits for it (it was the last half-second of
      // the loading spinner); it fills in whenever it arrives.
      fetch('/api/partnerships/list').then(async res => {
        if (!res.ok) return
        const { partnerships, partner_students } = await res.json()
        const pStudents: PartnerStudent[] = (partner_students || []).map((s: any) => {
          const p = (partnerships || []).find((pp: any) =>
            pp.initiator_parent_id === s.parent_id || pp.partner_parent_id === s.parent_id
          )
          return { id: s.id, full_name: s.full_name, current_level: s.current_level, parent_id: s.parent_id, isPartner: true as const, partnerParentId: s.parent_id, partnershipId: p?.id || null }
        })
        setPartnerStudents(pStudents)
      }).catch(() => {})


      const [{ data: studs }, { data: cts }, { data: coachs }] = await Promise.all([
        supabase.from('students').select('id, full_name, current_level').eq('parent_id', parent.id).eq('is_active', true),
        supabase.from('course_types').select('*').eq('is_active', true).order('sort_order'),
        supabase.from('coaches').select('id, first_name, last_name').eq('is_active', true),
      ])

      setStudents(studs || [])
      setCourseTypes(cts || [])
      setCoaches(coachs || [])


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
        setStep(3)
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
  // Two of your own swimmers in a 1-on-2 is one decision, one price and one
  // charge, so it repeats a weekly slot exactly as the others do. A CROSS-family
  // 1-on-2 does not: it settles only when the other family accepts, within
  // fifteen minutes, which is a per-lesson negotiation and cannot be batched.
  const siblingPair = selectedCourse?.slug === '1on2'
    && !!selectedStudent2 && !(selectedStudent2 as any).isPartner
  // Which flows book a BATCH. A 1-on-1 family repeats a weekly slot exactly as
  // a group family does, and at a higher price per lesson. Left out on purpose:
  // an assessment (one per swimmer), a reschedule (moving one lesson), and the
  // 60-minute option (a batch carries one length, and silently emptying the
  // basket when the toggle moves is worse than not offering it).
  const batchFlow = !isTrial && !isReschedule
    && (groupFlow || ((selectedCourse?.slug === '1on1' || siblingPair) && !isHourLesson))

  const balance = wallet?.balance ?? 0

  /** The price of one lesson at a given date and time, or null if this course
   *  is not paid for with points (Swim Team) or nothing is selected yet. */
  function priceAt(dateStr: string, time: string, minutes: number = isHourLesson ? 60 : 30): PriceBreakdown | null {
    if (!selectedCourse || isTrial) return null
    try {
      return priceLesson({
        courseSlug: selectedCourse.slug, minutes,
        sessionDate: dateStr, startTime: time, seats: paidSeats,
      })
    } catch { return null }
  }

  /** The cheapest this course can ever be: off-peak on, if it is switched on.
   *  Used to decide whether to let them go forward at all -- refusing someone
   *  who could afford SOME slot would be worse than letting the server say no. */
  function cheapestFor(slug: string | undefined, seats: number, minutes = 30): number {
    const base = BASE_POINTS[slug ?? '']
    if (base === undefined) return 0
    return Math.floor(base * (1 - (OFF_PEAK_ENABLED ? OFF_PEAK_DISCOUNT : 0))) * (minutes === 60 ? 2 : 1) * seats
  }

  /** The list price of one 30-minute lesson, with no date chosen yet. What
   *  the course cards show. */
  function listPrice(slug: string): number {
    return BASE_POINTS[slug] ?? 0
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

  useEffect(() => {
    if (step !== 1 || !advanceRef.current || !courseStepReady) return
    advanceRef.current = false
    setStep(3)
  }, [step, courseStepReady, selectedCourse, isTrial])
  useEffect(() => { if (step !== 1) advanceRef.current = false }, [step])

  // A family with one swimmer has nothing to choose on the first step.
  useEffect(() => {
    if (loading || isReschedule || selectedStudent || step !== 0 || students.length !== 1) return
    setSelectedStudent(students[0])
    setStep(1)
  }, [loading, isReschedule, selectedStudent, step, students])

  useEffect(() => {
    if (step !== 3 || !privateFlow || !selectedStudent || !selectedCourse) return
    let live = true
    const qs = new URLSearchParams({ course_slug: selectedCourse.slug, student_id: selectedStudent.id })
    if (selectedStudent2 && !(selectedStudent2 as any).isPartner) qs.set('student2_id', selectedStudent2.id)
    fetch(`/api/bookings/openings?${qs}`)
      .then(r => r.ok ? r.json() : null)
      .then((j: Openings | null) => {
        if (!live) return
        setOpenings(j)
        // One coach is no choice: behave as if they had been picked.
        if (j && j.coaches.length === 1) setCoachFilter(j.coaches[0].id)
      })
      .catch(() => { if (live) setOpenings(null) })
    return () => { live = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, privateFlow, selectedCourse, selectedStudent, selectedStudent2, cartRefresh])

  // A filtered coach IS the selected coach, so the per-coach slot list below
  // (the one that knows about join-able sessions and 24h) is theirs.
  useEffect(() => {
    if (coachFilter === 'any') return
    const c = coaches.find(x => x.id === coachFilter)
    if (c && selectedCoach?.id !== c.id) setSelectedCoach(c)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coachFilter, coaches])


  const coachColor = (id: string) => {
    const i = coaches.findIndex(c => c.id === id)
    return COACH_COLORS[(i < 0 ? 0 : i) % COACH_COLORS.length]
  }
  const coachName = (id: string) => coaches.find(c => c.id === id)?.first_name || ''
  const Face = ({ id, size = 22 }: { id: string; size?: number }) => (
    <span title={coachName(id)} style={{ width: size, height: size, borderRadius: '50%', background: coachColor(id), color: '#fff',
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: Math.round(size * 0.45), fontWeight: 800, flexShrink: 0 }}>
      {coachName(id).slice(0, 1)}
    </span>
  )
  /** Coaches with an open time on a date, under the current filter. */
  function coachesOn(ds: string): string[] {
    const day = openings?.days[ds]
    if (!day) return []
    const ids = new Set<string>()
    for (const list of Object.values(day)) for (const id of list) if (coachFilter === 'any' || id === coachFilter) ids.add(id)
    return [...ids]
  }
  function pickFilter(id: string) {
    setCoachFilter(id)
    setSelectedSlot(null); setSelectedHour(null); setRecurOpen(false)
    if (selectedDate && id !== 'any') {
      const ds = formatDateLA(selectedDate)
      if (!Object.values(openings?.days[ds] || {}).some(l => l.includes(id))) setSelectedDate(null)
    }
  }
  /** Choose (or, in a batch, toggle) one private lesson with one coach. The
   *  coach grid, the any-coach grid and the "next openings" chips all end here. */
  function choosePrivate(ds: string, slot: TimeSlot, coach: Coach) {
    setSelectedCoach(coach)
    setSelectedSlot(slot)
    if (!batchFlow) return
    setRecurOpen(false); setRecurMsg('')
    const key = `${ds}|${slot.time}`
    const cost = priceAt(ds, slot.time, 30)?.charged ?? 0
    setRecurSel(prev => {
      const n = new Map(prev)
      const had = n.get(key)
      if (had && had.coachId === coach.id) { n.delete(key); return n }
      const sameDay = [...n.entries()].filter(([k]) => k.startsWith(ds + '|'))
      const freed = sameDay.reduce((acc, [, x]) => acc + x.points, 0)
      const spent = [...n.values()].reduce((acc, x) => acc + x.points, 0)
      if (!had && spent - freed + cost > balance) return prev
      for (const [k] of sameDay) n.delete(k)
      n.set(key, { date: ds, time: slot.time, label: slot.label, points: cost, coachId: coach.id, coachName: coach.first_name })
      return n
    })
  }

  function clearTime() {
    setSelectedDate(null); setSelectedSlot(null); setRecurOpen(false); setRecurPlan([]); setRecurSel(new Map())
  }
  function changeStudent() {
    setLockedStudent(false); setSelectedStudent(null); setSelectedStudent2(null)
    setIsTrial(false); setSelectedCourse(null); setSelectedCoach(null); clearTime(); setStep(0)
  }

  // What this booking will actually cost, once a slot is picked. A reschedule
  // keeps its original charge, so it costs nothing here.
  const bookingPrice = (!isReschedule && !isTrial && selectedDate && selectedSlot)
    ? priceAt(formatDateLA(selectedDate), selectedSlot.time)
    : null
  const bookingCost = bookingPrice?.charged ?? 0
  const basket = [...recurSel.values()].sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))
  const basketTotal = basket.reduce((a, x) => a + x.points, 0)
  // One time across the whole batch, or several? It decides whether the summary
  // can print a single Time row, and whether a chip needs to say the hour.
  const basketTimes = new Set(basket.map(x => x.time))
  const planTimes = new Set(recurPlan.map(x => x.time))
  const planCoaches = [...new Set(recurPlan.map(x => x.coachName || ''))].filter(Boolean)
  // One lesson in the basket still books through the batch route, but it is
  // shown as a single booking: a date row, the time as a range, one price
  // breakdown -- "Lesson dates (1)" and "Book 1 lesson" read as if there were more.
  const planOne = recurPlan.length === 1 ? recurPlan[0] : null
  const planMany = recurPlan.length > 1
  const onePrice = planOne ? priceAt(planOne.date, planOne.time, 30) : null
  const bookingPriceSingle = bookingPrice
  const bookingCostSingle = bookingCost
  const basketCoaches = new Set(basket.map(x => x.coachId))
  const recurTotal = recurPlan.reduce((a, x) => a + x.points, 0)
  // The undiscounted figure, so the batch can show what the discounts took off.
  const recurBase = recurPlan.reduce((a, x) => {
    const pr = priceAt(x.date, x.time, 30)
    return a + (pr ? pr.base * pr.seats : x.points)
  }, 0)

  /* What the shortcut would tick, in order, stopping at the balance. Dates
     already in the basket are not counted twice. */
  // Dates already in the basket are dropped BEFORE the range is applied, so
  // "4 weeks" means four MORE lessons. Counting the one the parent just ticked
  // as one of the four would quietly hand them three.
  // Every open date for this slot, INCLUDING the one the parent just ticked.
  // Leaving that one out made the grid start a week late and turned every
  // number in the panel into "more than you already have", which is not what
  // a list headed "every Wednesday 10:20" looks like it is saying.
  const recurCandidates = (recurOpen && selectedSlot)
    ? recurList.filter((c: any) => c.status === 'ok')
    : []
  // So the panel now owns this slot's dates outright, and its arithmetic is:
  // what the REST of the basket costs, plus whatever is ticked here.
  const slotKeys = new Set(recurCandidates.map((c: any) => `${c.date}|${selectedSlot?.time ?? ''}`))
  const otherTotal = basket.filter(x => !slotKeys.has(`${x.date}|${x.time}`)).reduce((a, x) => a + x.points, 0)
  const chosen = (() => {
    const out = new Map<string, number>()
    if (!selectedSlot) return out
    for (const c of recurCandidates) {
      const key = `${c.date}|${selectedSlot.time}`
      if (ghostSel.has(key)) out.set(key, recurQuote.get(c.date) ?? 0)
    }
    return out
  })()
  const chosenTotal = [...chosen.values()].reduce((a, n) => a + n, 0)
  // The calendar's dashed overlay is a proposal, so it covers only the dates
  // not already in the basket -- those cells are solid up there already.
  const ghost = new Map([...chosen].filter(([k]) => !recurSel.has(k)))
  const okCount = recurCandidates.length


  /** Add or remove one group lesson. The desktop cell and the phone row are two
   *  ways of pressing the same thing, so they must not drift apart. */
  function toggleSlot(ds: string, dt: Date, sl: any) {
    if (sl.full || sl.already_booked) return
    const c = coaches.find(x => x.id === sl.coach_id)
    if (!c) return
    const key = `${ds}|${sl.time}`
    const cost = priceAt(ds, sl.time, 30)?.charged ?? 0
    // The slot is also remembered as "the one on screen", so the repeat-weekly
    // shortcut knows which weekday and hour it is being asked to repeat.
    setSelectedDate(dt)
    setSelectedCoach(c)
    setSelectedSlot({ time: sl.time, label: formatTime(sl.time), available: true, enrolled: sl.enrolled, max: sl.max, session_id: sl.session_id, within24h: isWithin24Hours(ds, sl.time) })
    setRecurOpen(false); setRecurMsg('')
    setRecurSel(prev => {
      const n = new Map(prev)
      if (n.has(key)) { n.delete(key); return n }
      const spent = [...n.values()].reduce((a, x) => a + x.points, 0)
      if (spent + cost > balance) return n
      n.set(key, { date: ds, time: sl.time, label: formatTime(sl.time), points: cost, coachId: c.id, coachName: c.first_name })
      return n
    })
  }
  const balanceAfter = Math.max(0, balance - bookingCost)

  // Every "you cannot pay for this" notice offers the same way out.
  const BuyPointsLink = ({ label }: { label: string }) => (
    <a href="/plans#buy"
      style={{ display: 'inline-block', marginTop: '10px', padding: '9px 18px', borderRadius: '8px', background: GOLD, color: NAVY, fontSize: '13px', fontWeight: 700, textDecoration: 'none' }}>
      {label}
    </a>
  )

  /** The gold "58 pts" with the struck-out list price beside it. Without the
   *  original the discount may as well not have happened, so it is shown
   *  wherever a discounted price is. */
  const PriceTag = ({ price, dim = false }: { price: PriceBreakdown; dim?: boolean }) => {
    const full = price.base * price.seats
    return (
      <span style={{ display: 'block', fontSize: '12px', marginTop: '3px', fontVariantNumeric: 'tabular-nums', color: dim ? 'rgba(255,255,255,0.25)' : GOLD }}>
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
          action: 'commit', student_id: selectedStudent.id, coach_id: recurPlan[0]?.coachId || selectedCoach.id,
          student2_id: siblingPair ? selectedStudent2!.id : null,
          course_slug: selectedCourse?.slug ?? '1on4', minutes: 30,
          slots: recurPlan.map(x => ({ date: x.date, start_time: x.time, coach_id: x.coachId })),
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

  // Month paging for the private calendar: arrows, a two-finger sideways swipe
  // on a trackpad, or a finger swipe on a phone all go through shiftMonth.
  // Months before this one, and past the 60-day booking window, are not offered.
  const calIndex = calYear * 12 + calMonth
  const nowIndex = today.getFullYear() * 12 + today.getMonth()
  const lastBookable = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 60)
  const canPrevMonth = calIndex > nowIndex
  const canNextMonth = calIndex < lastBookable.getFullYear() * 12 + lastBookable.getMonth()
  function shiftMonth(d: 1 | -1) {
    if (d < 0 ? !canPrevMonth : !canNextMonth) return
    const n = calIndex + d
    setCalSlide(d > 0 ? 'l' : 'r')
    setCalYear(Math.floor(n / 12)); setCalMonth(n % 12)
  }
  shiftMonthRef.current = shiftMonth

  const calSkip = (calYear === today.getFullYear() && calMonth === today.getMonth())
    ? Math.max(0, today.getDate() - today.getDay() - 1) : 0

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
        <div style={{ fontSize: '15px', color: 'rgba(255,255,255,0.5)' }}>{t('booking.loading')}</div>
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
            <p style={{ fontSize: '15px', color: 'rgba(255,255,255,0.6)', lineHeight: 1.7, marginBottom: '4px' }}>
              <strong style={{ color: '#fff' }}>
                {siblingPair ? `${selectedStudent?.full_name} & ${selectedStudent2?.full_name}` : selectedStudent?.full_name}
              </strong> {t(siblingPair ? 'booking.recur.areBookedForN' : 'booking.recur.isBookedForN', { n: recurBooked })}
            </p>
            <p style={{ fontSize: '15px', color: GOLD, fontWeight: 600, marginBottom: '12px' }}>
              {t('booking.success.with', { course: selectedCourse ? tDb(locale, 'course_types', selectedCourse.id, selectedCourse.name) : '', coach: selectedCoach?.first_name || '' })}
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', justifyContent: 'center', marginBottom: '20px' }}>
              {recurPlan.map(x => (
                <span key={x.date + x.time} style={{ fontSize: '13px', fontWeight: 600, padding: '5px 10px', borderRadius: '6px', background: `${GOLD}18`, border: `1px solid ${GOLD}44`, color: GOLD }}>
                  {new Date(x.date + 'T00:00:00').toLocaleDateString(dateLoc, { weekday: 'short', month: 'short', day: 'numeric' })}
                  {planTimes.size > 1 ? ` · ${x.label}` : ''}
                </span>
              ))}
            </div>
            {recurSkipped > 0 && (
              <p style={{ fontSize: '14px', color: '#f0c78a', marginBottom: '16px' }}>{t('booking.recur.someSkipped', { m: recurSkipped })}</p>
            )}
            <div style={{
              display: 'flex', alignItems: 'center', gap: '10px',
              background: 'rgba(201,168,76,0.08)', border: '1px solid rgba(201,168,76,0.2)',
              borderRadius: '10px', padding: '12px 16px', marginBottom: '24px', textAlign: 'left',
            }}>
              <span style={{ fontSize: '20px', flexShrink: 0 }}>📧</span>
              <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.6)', margin: 0, lineHeight: 1.5 }}>
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
            <p style={{ fontSize: '15px', color: 'rgba(255,255,255,0.6)', lineHeight: 1.7, marginBottom: '4px' }}>
              {t('booking.success.invitedDesc')}
            </p>
            <p style={{ fontSize: '15px', color: GOLD, fontWeight: 600, marginBottom: '4px' }}>
              {t('booking.success.with', { course: selectedCourse ? tDb(locale, 'course_types', selectedCourse.id, selectedCourse.name) : '', coach: selectedCoach?.first_name || '' })}
            </p>
            <p style={{ fontSize: '15px', color: 'rgba(255,255,255,0.6)', marginBottom: '20px' }}>
              {t('booking.success.dateAt', { date: selectedDate?.toLocaleDateString(dateLoc, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) || '', time: selectedSlot?.label || '' })}
            </p>
            <div style={{
              display: 'flex', alignItems: 'center', gap: '10px',
              background: 'rgba(123,97,196,0.1)', border: '1px solid rgba(123,97,196,0.35)',
              borderRadius: '10px', padding: '12px 16px', marginBottom: '24px', textAlign: 'left',
            }}>
              <span style={{ fontSize: '20px', flexShrink: 0 }}>🔔</span>
              <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.6)', margin: 0, lineHeight: 1.5 }}>
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
            <p style={{ fontSize: '15px', color: 'rgba(255,255,255,0.6)', lineHeight: 1.7, marginBottom: '4px' }}>
              <strong style={{ color: '#fff' }}>
                {hourRoster.length > 1
                  ? hourRoster.map((x: any) => x.full_name).join(' & ')
                  : selectedCourse?.slug === '1on2' && selectedStudent2
                  ? `${selectedStudent?.full_name} & ${selectedStudent2.full_name}`
                  : selectedStudent?.full_name}
              </strong> {t((hourRoster.length > 1 || (selectedCourse?.slug === '1on2' && selectedStudent2)) ? 'booking.success.areBookedFor' : 'booking.success.isBookedFor')}
            </p>
            <p style={{ fontSize: '15px', color: GOLD, fontWeight: 600, marginBottom: '4px' }}>
              {t('booking.success.with', { course: selectedCourse ? tDb(locale, 'course_types', selectedCourse.id, selectedCourse.name) : '', coach: selectedCoach?.first_name || '' })}
            </p>
            <p style={{ fontSize: '15px', color: 'rgba(255,255,255,0.6)', marginBottom: '20px' }}>
              {t('booking.success.dateAt', { date: selectedDate?.toLocaleDateString(dateLoc, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) || '', time: selectedSlot?.label || '' })}
            </p>
            <div style={{
              display: 'flex', alignItems: 'center', gap: '10px',
              background: 'rgba(201,168,76,0.08)', border: '1px solid rgba(201,168,76,0.2)',
              borderRadius: '10px', padding: '12px 16px', marginBottom: '24px', textAlign: 'left',
            }}>
              <span style={{ fontSize: '20px', flexShrink: 0 }}>📧</span>
              <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.6)', margin: 0, lineHeight: 1.5 }}>
                {t('booking.success.emailSent')}
              </p>
            </div>
          </>
        )}

        <Link href="/dashboard" style={{
          display: 'block', padding: '13px 32px',
          background: GOLD, color: NAVY, borderRadius: '8px',
          fontSize: '14px', fontWeight: 700, letterSpacing: '1.5px',
          textTransform: 'uppercase', textDecoration: 'none', marginBottom: '12px',
        }}>
          {t('common.backToDashboard')}
        </Link>
        <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.3)', margin: 0 }}>
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
        <span style={{ fontSize: '15px', fontWeight: 600, color: 'rgba(255,255,255,0.85)' }}>
          {isReschedule ? t('booking.header.reschedule') : t('booking.header.book')}
        </span>
        <Link href="/dashboard" style={{ fontSize: '14px', color: 'rgba(255,255,255,0.5)', textDecoration: 'none', whiteSpace: 'nowrap' }}>
          ← {t('booking.header.dashboard')}
        </Link>
      </div>

      <div style={{ maxWidth: '800px', margin: '0 auto', padding: 'clamp(24px,4vw,48px) clamp(20px,5vw,48px)' }}>

        {isReschedule && (
          <div style={{ marginBottom: '20px', padding: '14px 18px', background: 'rgba(201,168,76,0.1)', border: '1px solid rgba(201,168,76,0.3)', borderRadius: '10px', fontSize: '14px', color: '#c9a84c', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>📅</span> {t('booking.rescheduleBanner')}
          </div>
        )}

        {lockedStudent && selectedStudent && (
          <div style={{ marginBottom: '20px', padding: '14px 18px', background: 'rgba(201,168,76,0.1)', border: '1px solid rgba(201,168,76,0.3)', borderRadius: '10px', fontSize: '14px', color: GOLD, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
            <span>📌 {t('booking.lockedFor')}<strong style={{ color: '#fff' }}>{selectedStudent.full_name}</strong>{trialHasCredit ? t('booking.assessmentPrepaid') : ''}</span>
            <button onClick={() => { setLockedStudent(false); setSelectedStudent(null); setIsTrial(false); setSelectedCourse(null); setStep(0) }}
              style={{ background: 'none', border: 'none', padding: 0, color: 'rgba(255,255,255,0.5)', fontSize: '13px', cursor: 'pointer', textDecoration: 'underline' }}>
              {t('booking.changeStudent', { name: selectedStudent.full_name.split(' ')[0] })}
            </button>
          </div>
        )}

        {step > 0 && selectedStudent && (
          <div style={{ marginBottom: '28px' }}>
            <DoneRow label={t('booking.sum.swimmer')} changeLabel={t('booking.change')}
              value={selectedStudent.full_name + (step > 1 && selectedCourse?.slug === '1on2' && selectedStudent2 ? ` ＋ ${selectedStudent2.full_name}` : '')}
              onChange={isReschedule || students.length <= 1 ? undefined : changeStudent} />
            {step > 1 && selectedCourse && (
              <DoneRow label={t('booking.sum.course')} changeLabel={t('booking.change')}
                value={isTrial ? t('common.assessment') : tDb(locale, 'course_types', selectedCourse.id, selectedCourse.name)}
                onChange={isReschedule ? undefined : () => { clearTime(); setStep(1) }} />
            )}
          </div>
        )}

        {step === 0 && (
          <div>
            <SectionTitle title={t('booking.s1.title')} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {students.map(s => (
                <SelectCard key={s.id} selected={selectedStudent?.id === s.id} onClick={() => { if (selectedStudent?.id !== s.id) setSelectedStudent2(null); setSelectedStudent(s); setStep(1) }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                    <div style={{
                      width: '44px', height: '44px', borderRadius: '50%',
                      background: GOLD, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontFamily: "'Playfair Display', serif", fontSize: '16px', fontWeight: 900, color: NAVY,
                    }}>
                      {s.full_name.split(' ').map((n: string) => n[0]).join('').slice(0, 2)}
                    </div>
                    <div>
                      <div style={{ fontSize: '16px', fontWeight: 700, color: '#fff' }}>{s.full_name}</div>
                      <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.4)' }}>
                        {s.current_level ? t('levels.levelN', { n: s.current_level }) : t('dash.pendingAssessment')}
                      </div>
                    </div>
                  </div>
                </SelectCard>
              ))}
            </div>
          </div>
        )}

        {step === 1 && (
          <div>
            <SectionTitle title={t('booking.s2.title')} />
            {needsAssessment && (
              <div style={{ background: `${GOLD}1f`, border: `1px solid ${GOLD}66`, borderRadius: '12px', padding: '12px 16px', marginBottom: '14px', fontSize: '14px', color: GOLD, lineHeight: 1.5 }}>
                {trialHasCredit
                  ? t('booking.notice.prepaid')
                  : trialEligible
                  ? t('booking.notice.first')
                  : t('booking.notice.pending')}
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {(trialEligible || trialHasCredit) && !isReschedule && (
                <SelectCard selected={isTrial} onClick={() => { const ct = courseTypes.find(c => c.slug === '1on1'); if (ct) { advanceRef.current = true; setSelectedCourse(ct); setIsTrial(true) } }} color={GOLD}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                      <span style={{ fontSize: '28px' }}>⭐</span>
                      <div>
                        <div style={{ fontSize: '16px', fontWeight: 700, color: '#fff', marginBottom: '2px' }}>{t('common.assessment')}</div>
                        <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.4)' }}>{t('booking.assessmentMeta')}</div>
                      </div>
                    </div>
                    <div style={{ background: `${GOLD}20`, border: `1px solid ${GOLD}40`, borderRadius: '20px', padding: '4px 12px', fontSize: '13px', fontWeight: 700, color: GOLD }}>{trialHasCredit ? t('booking.prepaid') : '$' + TRIAL_PRICE_CENTS / 100}</div>
                  </div>
                </SelectCard>
              )}
              {courseTypes.filter(ct => ct.slug !== 'team').map(ct => {
                const color = COURSE_COLORS[ct.slug] || GOLD
                const listed = listPrice(ct.slug)
                const full = BASE_POINTS[ct.slug] ?? 0
                return (
                  <SelectCard key={ct.id} selected={!isTrial && selectedCourse?.id === ct.id} onClick={() => { if (needsAssessment) return; advanceRef.current = true; setSelectedCourse(ct); setIsTrial(false) }} color={color}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                        <span style={{ fontSize: '28px' }}>{COURSE_ICONS[ct.slug]}</span>
                        <div>
                          <div style={{ fontSize: '16px', fontWeight: 700, color: '#fff', marginBottom: '2px' }}>{tDb(locale, 'course_types', ct.id, ct.name)}</div>
                          <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.4)' }}>
                            {t(ct.max_students > 1 ? 'booking.courseMeta' : 'booking.courseMetaOne', { n: ct.duration_minutes, max: ct.max_students })}
                          </div>
                          {ct.slug === '1on4' && myGroupBand && (
                            <div style={{ marginTop: '5px', display: 'inline-block', padding: '2px 9px', borderRadius: '10px', fontSize: '12px', fontWeight: 700, color: myBandColor, background: myBandColor + '1f', border: `1px solid ${myBandColor}44` }}>
                              {t('booking.yourClass', { min: myGroupBand.min, max: myGroupBand.max })}
                            </div>
                          )}
                        </div>
                      </div>
                      {/* The list price. Off-peak (when switched on) is
                          not in it yet -- no date has been chosen -- so the slot
                          grid can only ever come in lower than this, never
                          higher. A price that goes up after you pick a time is
                          the one thing this screen must never do. */}
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <div style={{
                          background: `${color}20`, border: `1px solid ${color}40`,
                          borderRadius: '20px', padding: '4px 12px',
                          fontSize: '13px', fontWeight: 700, color, whiteSpace: 'nowrap',
                          fontVariantNumeric: 'tabular-nums',
                        }}>
                          {listed < full && (
                            <span style={{ textDecoration: 'line-through', color: 'rgba(255,255,255,0.3)', marginRight: '5px', fontWeight: 500 }}>{full}</span>
                          )}
                          {t('points.unit', { n: listed })}
                        </div>
                        <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', marginTop: '4px' }}>{t('booking.perSwimmer')}</div>
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
                borderRadius: '10px', fontSize: '14px', color: '#e05a4a',
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
                <div style={{ fontSize: '13px', fontWeight: 700, color: 'rgba(255,255,255,0.5)', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: '12px' }}>
                  👥 {t('booking.select2nd')}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {students.filter(s => s.id !== selectedStudent?.id).map(s => (
                    <SelectCard key={s.id} selected={selectedStudent2?.id === s.id} onClick={() => { if (s.current_level == null) return; advanceRef.current = true; setSelectedStudent2(s) }} color="#4a90c4">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: '#4a90c4', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', fontWeight: 900, color: '#fff', fontFamily: "'Playfair Display', serif", flexShrink: 0 }}>
                          {s.full_name.split(' ').map((n: string) => n[0]).join('').slice(0, 2)}
                        </div>
                        <div>
                          <div style={{ fontSize: '15px', fontWeight: 700, color: '#fff' }}>{s.full_name}</div>
                          <div style={{ fontSize: '12px', color: s.current_level ? 'rgba(255,255,255,0.4)' : '#e0b64a' }}>{s.current_level ? t('booking.sameAccount', { n: s.current_level }) : t('booking.needsAssessmentFirst')}</div>
                        </div>
                      </div>
                    </SelectCard>
                  ))}
                  {partnerStudents.map(s => (
                    <SelectCard key={s.id} selected={selectedStudent2?.id === s.id} onClick={() => { if (s.current_level == null) return; advanceRef.current = true; setSelectedStudent2(s) }} color="#4a90c4">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: '#7b61c4', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', fontWeight: 900, color: '#fff', fontFamily: "'Playfair Display', serif", flexShrink: 0 }}>
                          {s.full_name.split(' ').map((n: string) => n[0]).join('').slice(0, 2)}
                        </div>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <div style={{ fontSize: '15px', fontWeight: 700, color: '#fff' }}>{s.full_name}</div>
                            <span style={{ fontSize: '11.5px', background: 'rgba(123,97,196,0.2)', border: '1px solid rgba(123,97,196,0.4)', borderRadius: '4px', padding: '1px 5px', color: '#a78bfa' }}>{t('booking.linked')}</span>
                          </div>
                          <div style={{ fontSize: '12px', color: s.current_level ? 'rgba(255,255,255,0.4)' : '#e0b64a' }}>{s.current_level ? t('booking.partnerConfirm', { n: s.current_level }) : t('booking.needsAssessmentFirst')}</div>
                        </div>
                      </div>
                    </SelectCard>
                  ))}
                  {students.filter(s => s.id !== selectedStudent?.id).length === 0 && partnerStudents.length === 0 && (
                    <div style={{ padding: '16px', background: 'rgba(255,255,255,0.04)', borderRadius: '10px', fontSize: '14px', color: 'rgba(255,255,255,0.4)', textAlign: 'center' }}>
                      {t('booking.noOtherStudents')}
                    </div>
                  )}
                </div>
                {selectedStudent2 && !(selectedStudent2 as any).isPartner && balance < cheapestFor('1on2', 2, isHourLesson ? 60 : 30) && (
                  <div style={{ marginTop: '10px', padding: '10px 14px', background: 'rgba(224,90,74,0.1)', border: '1px solid rgba(224,90,74,0.3)', borderRadius: '8px', fontSize: '13px', color: '#e05a4a' }}>
                    ⚠️ {t('booking.short.twoSeats', { have: balance, need: cheapestFor('1on2', 2, isHourLesson ? 60 : 30) })}
                    <div><BuyPointsLink label={t('booking.short.cta')} /></div>
                  </div>
                )}
                {selectedStudent2 && (selectedStudent2 as any).isPartner && (
                  <div style={{ marginTop: '10px', padding: '10px 14px', background: 'rgba(123,97,196,0.1)', border: '1px solid rgba(123,97,196,0.3)', borderRadius: '8px', fontSize: '13px', color: '#a78bfa' }}>
                    📋 {t('booking.crossAccount')}
                  </div>
                )}
              </div>
            )}

          </div>
        )}

        {step === 3 && (
          <div>
            {!groupFlow && <SectionTitle title={t('booking.s4.title')} />}
            {privateFlow && openings && openings.coaches.length > 1 && (
              <div style={{ marginBottom: '16px' }}>
                <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '4px' }}>
                  {[{ id: 'any', first_name: t('booking.anyCoach') }, ...openings.coaches].map(c => {
                    const on = coachFilter === c.id
                    return (
                      <button key={c.id} onClick={() => pickFilter(c.id)}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', flexShrink: 0, minHeight: '44px',
                          padding: c.id === 'any' ? '0 18px' : '0 16px 0 8px', borderRadius: '999px', cursor: 'pointer',
                          border: `1.5px solid ${on ? GOLD : 'rgba(255,255,255,0.12)'}`, background: on ? `${GOLD}24` : NAVY,
                          color: on ? '#fff' : 'rgba(255,255,255,0.7)', fontSize: '14px', fontWeight: 700 }}>
                        {c.id !== 'any' && <Face id={c.id} size={28} />}
                        {c.first_name}
                      </button>
                    )
                  })}
                </div>
                <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.45)', marginTop: '6px', lineHeight: 1.5 }}>
                  {coachFilter === 'any' ? t('booking.anyCoachHint') : t('booking.oneCoachHint', { name: coachName(coachFilter) })}
                </div>
              </div>
            )}
            {!groupFlow && <div ref={calCardRef}
              onTouchStart={e => { const t0 = e.touches[0]; calTouchRef.current = { x: t0.clientX, y: t0.clientY } }}
              onTouchEnd={e => {
                const s0 = calTouchRef.current; calTouchRef.current = null
                if (!s0) return
                const t1 = e.changedTouches[0]; const dx = t1.clientX - s0.x, dy = t1.clientY - s0.y
                if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) shiftMonth(dx < 0 ? 1 : -1)
              }}
              style={{ background: NAVY, borderRadius: '16px', padding: isPhone ? '14px 12px' : '24px', marginBottom: '20px', border: '1px solid rgba(255,255,255,0.08)', overflow: 'hidden', touchAction: 'pan-y' }}>
              <style>{`@keyframes msaCalL { from { opacity: 0; transform: translateX(28px) } to { opacity: 1; transform: none } }
                @keyframes msaCalR { from { opacity: 0; transform: translateX(-28px) } to { opacity: 1; transform: none } }
                @media (prefers-reduced-motion: reduce) { .msa-cal-anim { animation: none !important } }`}</style>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
                <button onClick={() => shiftMonth(-1)} disabled={!canPrevMonth}
                  aria-label={t('booking.cal.prevMonth')} style={{ background: 'transparent', border: 'none', color: canPrevMonth ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.15)', fontSize: '22px', cursor: canPrevMonth ? 'pointer' : 'default', minWidth: '44px', minHeight: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>‹</button>
                <span style={{ fontSize: '16px', fontWeight: 700, color: '#fff' }}>{t('booking.calMonth', { month: t('date.month.' + (calMonth + 1)), year: calYear })}</span>
                <button onClick={() => shiftMonth(1)} disabled={!canNextMonth}
                  aria-label={t('booking.cal.nextMonth')} style={{ background: 'transparent', border: 'none', color: canNextMonth ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.15)', fontSize: '22px', cursor: canNextMonth ? 'pointer' : 'default', minWidth: '44px', minHeight: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>›</button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: '4px', marginBottom: '8px' }}>
                {[0, 1, 2, 3, 4, 5, 6].map(d => (
                  <div key={d} style={{ textAlign: 'center', fontSize: '13px', fontWeight: 600, color: 'rgba(255,255,255,0.45)', padding: '4px 0' }}>{t('date.weekdayShort.' + d)}</div>
                ))}
              </div>
              <div key={`${calYear}-${calMonth}`} className="msa-cal-anim" style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: '4px', animation: calSlide ? `${calSlide === 'l' ? 'msaCalL' : 'msaCalR'} .28s ease` : undefined }}>
                {/* In the current month the weeks already gone are left out: the
                    grid starts on the Sunday of this week, as the group calendar does. */}
                {Array.from({ length: calSkip ? 0 : getFirstDayOfMonth(calYear, calMonth) }).map((_, i) => <div key={`e-${i}`} />)}
                {Array.from({ length: getDaysInMonth(calYear, calMonth) - calSkip }).map((_, j) => {
                  const i = j + calSkip
                  const date = new Date(calYear, calMonth, i + 1)
                  const dsC = formatDateLA(date)
                  const openHere = privateFlow && openings && lessonLength === 30 ? coachesOn(dsC) : null
                  const available = isDateAvailable(date) && (openHere == null || openHere.length > 0)
                  const isSelected = selectedDate?.toDateString() === date.toDateString()
                  const isTodayDate = date.toDateString() === today.toDateString()
                  // This calendar has no per-slot cells to mark, so the day itself
                  // carries the state: solid gold once a lesson on it is chosen,
                  // dashed while the repeat shortcut is only proposing one. Without
                  // this the shortcut's own hint pointed at cells that do not exist
                  // here, and a paged calendar gave no sign which days were already
                  // in the basket.
                  const dsX = formatDateLA(date)
                  const hasPick = batchFlow && [...recurSel.keys()].some(k => k.startsWith(dsX + '|'))
                  const hasGhost = batchFlow && !hasPick && [...ghost.keys()].some(k => k.startsWith(dsX + '|'))
                  return (
                    <button key={i}
                      onClick={() => { if (available) { setSelectedDate(date); setSelectedSlot(null); setTimeSlots([]) } }}
                      style={{
                        padding: '10px 4px', minHeight: '48px', borderRadius: '10px',
                        border: hasPick ? `2px solid ${GOLD}` : hasGhost ? `2px dashed ${GOLD}99` : '2px solid transparent',
                        background: isSelected ? GOLD : hasPick ? `${GOLD}20` : isTodayDate ? 'rgba(255,255,255,0.08)' : 'transparent',
                        color: isSelected ? NAVY : hasPick ? GOLD : available ? '#fff' : 'rgba(255,255,255,0.2)',
                        fontSize: '16px', fontWeight: isSelected || hasPick ? 700 : 500,
                        cursor: available ? 'pointer' : 'not-allowed',
                        outline: isTodayDate && !isSelected && !hasPick && !hasGhost ? `1px solid ${GOLD}40` : 'none',
                      }}
                    ><span>{i + 1}</span>{openHere && openHere.length > 0 && isDateAvailable(date) && !isSelected && (
                      <span style={{ display: 'flex', justifyContent: 'center', gap: '2px', marginTop: '2px' }}>
                        {openHere.slice(0, 4).map(id => <span key={id} style={{ width: '4px', height: '4px', borderRadius: '50%', background: coachColor(id) }} />)}
                      </span>
                    )}{groupFlow && groupDates.includes(formatDateLA(date)) && !isSelected && (
                      <span style={{ display: 'block', width: '4px', height: '4px', borderRadius: '50%', margin: '2px auto 0', backgroundColor: myBandColor }} />
                    )}</button>
                  )
                })}
              </div>
            </div>}

            {!groupFlow && selectedDate && (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap', marginBottom: '12px' }}>
                  <div style={{ fontSize: '14px', fontWeight: 600, color: 'rgba(255,255,255,0.6)' }}>
                    {t('booking.availableTimes', { date: selectedDate.toLocaleDateString(dateLoc, { weekday: 'long', month: 'short', day: 'numeric' }) })}
                  </div>
                  {(selectedCourse?.slug === '1on1'
                    || (selectedCourse?.slug === '1on2' && !!selectedStudent2)) && (
                    <div style={{ display: 'inline-flex', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', overflow: 'hidden' }}>
                      {([30, 60] as const).map(v => (
                        <button key={v} onClick={() => { setLessonLength(v); setSelectedSlot(null); setSelectedHour(null) }}
                          style={{ padding: '6px 14px', fontSize: '13px', fontWeight: 700, border: 'none', cursor: 'pointer',
                            background: lessonLength === v ? GOLD : 'transparent', color: lessonLength === v ? NAVY : 'rgba(255,255,255,0.5)' }}>
                          {t('booking.lenMin', { n: v })}</button>
                      ))}
                    </div>
                  )}
                </div>
                {lessonLength === 60 && (() => {
                  const rows = hourSlots
                    .map((h: any) => ({ ...h, opts: (h.options || []).filter((o: any) => coachFilter === 'any' || o.coach1_id === coachFilter) }))
                    .filter((h: any) => h.opts.length > 0)
                    .map((h: any) => ({ ...h, pick: h.opts.find((o: any) => !o.relay && o.coach1_id === openings?.preferred) || h.opts.find((o: any) => !o.relay) || h.opts[0] }))
                  // The server prices every hour slot and sends the figure with
                  // it, so nothing here has to guess. The cheapest one on offer
                  // decides whether the family can book an hour at all; when
                  // they cannot, saying so beats a wall of grey buttons.
                  const cheapest = rows.length ? Math.min(...rows.map((h: any) => Number(h.points) || 0)) : 0
                  const canAffordHour = isReschedule || (rows.length > 0 && hourBalance >= cheapest)
                  return (
                    <div style={{ marginBottom: '16px' }}>
                      <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.45)', marginBottom: '10px' }}>
                        {t('booking.hour.cost')} · {t('booking.balance', { n: hourBalance })}
                      </div>
                      {!hourLoading && rows.length > 0 && !canAffordHour && (
                        <div style={{ background: 'rgba(201,168,76,0.1)', border: '1px solid rgba(201,168,76,0.35)', borderRadius: '10px', padding: '14px 16px', marginBottom: '12px' }}>
                          <div style={{ fontSize: '14px', fontWeight: 700, color: GOLD, marginBottom: '4px' }}>{t('booking.short.title')}</div>
                          <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.6)', lineHeight: 1.5 }}>
                            {t('booking.short.body', { have: hourBalance, need: cheapest })}
                          </div>
                          <BuyPointsLink label={t('booking.short.cta')} />
                        </div>
                      )}
                      {hourLoading ? (
                        <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '15px' }}>{t('booking.hourLoading')}</p>
                      ) : rows.length === 0 ? (
                        <div style={{ background: NAVY, borderRadius: '12px', padding: '20px', textAlign: 'center', border: '1px dashed rgba(255,255,255,0.12)' }}>
                          <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '14px', margin: 0 }}>{t('booking.noHourOptions')}</p>
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
                                  const c1 = coaches.find(x => x.id === o.coach1_id)
                                  if (c1) setSelectedCoach(c1)
                                  setSelectedHour({ ...h, ...o })
                                  setSelectedSlot({ time: h.start_time, label: `${formatTime(h.start_time)} – ${formatTime(h.end_time)}`, available: true, enrolled: 0, max: 1, within24h: w24 })
                                }}
                                style={{
                                  padding: '12px 8px', borderRadius: '10px', textAlign: 'center',
                                  border: `2px solid ${sel ? GOLD : usable ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.05)'}`,
                                  background: sel ? `${GOLD}20` : usable ? NAVY : 'rgba(255,255,255,0.03)',
                                  color: sel ? GOLD : usable ? '#fff' : 'rgba(255,255,255,0.2)',
                                  fontSize: '14px', fontWeight: 600, cursor: usable ? 'pointer' : 'not-allowed',
                                }}>
                                {h.is_current && (
                                  <div style={{ fontSize: '11.5px', fontWeight: 700, color: GOLD, letterSpacing: '0.06em', marginBottom: '2px' }}>{t('booking.currentTime')}</div>
                                )}
                                {formatTime(h.start_time)}
                                <div style={{ fontSize: '11.5px', fontWeight: 600, color: sel ? GOLD : usable ? 'rgba(255,255,255,0.45)' : 'rgba(255,255,255,0.2)', marginTop: '1px' }}>
                                  – {formatTime(h.end_time)}
                                </div>
                                {!isReschedule && h.points != null && (
                                  <span style={{ display: 'block', fontSize: '12px', marginTop: '3px', fontVariantNumeric: 'tabular-nums', color: usable ? GOLD : 'rgba(255,255,255,0.25)' }}>
                                    {t('points.unit', { n: h.points })}
                                  </span>
                                )}
                                {h.off_peak && (
                                  <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.1em', color: 'rgba(255,255,255,0.45)', marginTop: '3px' }}>{t('booking.offPeak')}</div>
                                )}
                                {!isTrial && usable && w24 && (
                                  <div style={{ fontSize: '11.5px', color: '#c9a84c', marginTop: '2px', fontWeight: 700 }}>24h</div>
                                )}
                                {isReschedule && (
                                  <div style={{ fontSize: '11.5px', color: 'rgba(255,255,255,0.4)', marginTop: '2px', fontWeight: 700 }}>{t('booking.noExtraCharge')}</div>
                                )}
                                {!o.relay && coachFilter === 'any' && (
                                  <div style={{ fontSize: '11.5px', color: 'rgba(255,255,255,0.5)', marginTop: '2px', fontWeight: 600 }}>{o.coach1_name}</div>
                                )}
                                {o.relay && (
                                  <div style={{ fontSize: '11.5px', color: 'rgba(255,255,255,0.45)', marginTop: '2px', lineHeight: 1.3, fontWeight: 500 }}>
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
                {!isTrial && (privateFlow && openings && coachFilter === 'any'
                  ? lessonLength === 30 && Object.keys(openings.days[formatDateLA(selectedDate)] || {}).some(tm => isWithin24Hours(formatDateLA(selectedDate), tm))
                  : timeSlots.some(sl => sl.available && sl.within24h)) && (
                  <div style={{ background: 'rgba(201,168,76,0.1)', border: '1px solid rgba(201,168,76,0.3)', borderRadius: '10px', padding: '14px 16px', marginBottom: '16px', display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                    <span style={{ fontSize: '16px' }}>⚠️</span>
                    <div>
                      <div style={{ fontSize: '14px', fontWeight: 700, color: '#c9a84c', marginBottom: '4px' }}>{t('booking.within24.title')}</div>
                      <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.6)', lineHeight: 1.5 }}>{t('booking.within24.body')}</div>
                    </div>
                  </div>
                )}
                {groupFlow ? (
                  groupLoading ? (
                    <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '15px' }}>{t('booking.groupLoading')}</p>
                  ) : (() => {
                    const ds2 = formatDateLA(selectedDate)
                    const visible = groupClasses.filter((gc: any) => meetsLeadTime(ds2, gc.time))
                    if (visible.length === 0) return (
                      <div style={{ background: NAVY, borderRadius: '12px', padding: '24px', textAlign: 'center', border: '1px dashed rgba(255,255,255,0.12)' }}>
                        <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '15px' }}>
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
                                <span style={{ display: 'block', fontSize: '15px', fontWeight: 700, color: sel ? GOLD : clickable ? '#fff' : 'rgba(255,255,255,0.3)' }}>
                                  {formatTime(gc.time)} – {formatTime(gc.end_time)}
                                </span>
                                <span style={{ display: 'block', fontSize: '13px', color: clickable ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.2)', marginTop: '2px' }}>
                                  {t('booking.group.coachBand', { name: gc.coach_name, min: myGroupBand?.min ?? '', max: myGroupBand?.max ?? '' })}
                                </span>
                              </span>
                              <span style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                                {!isReschedule && (() => { const pr = priceAt(ds2, gc.time, 30); return pr ? (
                                  <span style={{ textAlign: 'right' }}>
                                    <PriceTag price={pr} dim={!clickable} />
                                    {pr.offPeak && <span style={{ display: 'block', fontSize: '11px', fontWeight: 700, letterSpacing: '0.1em', color: 'rgba(255,255,255,0.4)' }}>{t('booking.offPeak')}</span>}
                                  </span>
                                ) : null })()}
                                {w24 && clickable && <span style={{ fontSize: '11.5px', fontWeight: 700, color: '#c9a84c' }}>24h</span>}
                                <span style={{ fontSize: '12px', fontWeight: 700, padding: '3px 10px', borderRadius: '12px',
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
                ) : (privateFlow && openings && coachFilter === 'any') ? (lessonLength === 60 ? null : (() => {
                  const ds0 = formatDateLA(selectedDate)
                  const day = openings.days[ds0] || {}
                  const times = Object.keys(day).sort()
                  if (times.length === 0) return (
                    <div style={{ background: NAVY, borderRadius: '12px', padding: '24px', textAlign: 'center', border: '1px dashed rgba(255,255,255,0.12)' }}>
                      <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '15px' }}>{t('booking.noSlots')}</p>
                    </div>
                  )
                  const curKey = selectedSlot ? `${ds0}|${selectedSlot.time}` : ''
                  const curIds = selectedSlot ? (day[selectedSlot.time] || []) : []
                  const curShown = !!selectedSlot && curIds.length > 0 && (!batchFlow || recurSel.has(curKey))
                  return (
                    <>
                      {batchFlow && (
                        <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.4)', marginBottom: '8px' }}>{t('booking.oneADay')}</div>
                      )}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: '8px' }}>
                        {times.map(tm => {
                          const ids = day[tm]
                          const key0 = `${ds0}|${tm}`
                          const inBasket = batchFlow && recurSel.has(key0)
                          const on = inBasket || (!batchFlow && selectedSlot?.time === tm)
                          const pr = (isReschedule || isTrial) ? null : priceAt(ds0, tm, 30)
                          const cost0 = pr?.charged ?? 0
                          const freed = batchFlow ? [...recurSel.values()].filter(x => x.date === ds0).reduce((acc, x) => acc + x.points, 0) : 0
                          const affordable0 = !batchFlow || inBasket || basketTotal - freed + cost0 <= balance
                          const w24 = isWithin24Hours(ds0, tm)
                          const chosenCoach = inBasket ? recurSel.get(key0)!.coachId : null
                          return (
                            <button key={tm} disabled={!affordable0}
                              onClick={() => {
                                const cid = chosenCoach
                                  || (openings.preferred && ids.includes(openings.preferred) ? openings.preferred : ids[0])
                                const c = coaches.find(x => x.id === cid)
                                if (!c) return
                                choosePrivate(ds0, { time: tm, label: formatTime(tm), available: true, enrolled: 0, max: selectedCourse?.max_students ?? 1, within24h: w24 }, c)
                              }}
                              style={{
                                padding: '12px 8px', borderRadius: '10px', textAlign: 'center',
                                border: `2px ${batchFlow && !affordable0 ? 'dashed' : 'solid'} ${on ? GOLD : affordable0 ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.05)'}`,
                                background: on ? `${GOLD}20` : affordable0 ? NAVY : 'rgba(255,255,255,0.03)',
                                color: on ? GOLD : affordable0 ? '#fff' : 'rgba(255,255,255,0.2)',
                                fontSize: '14px', fontWeight: 600, cursor: affordable0 ? 'pointer' : 'not-allowed',
                              }}>
                              {inBasket ? '✓ ' : ''}{formatTime(tm)}
                              {pr && <PriceTag price={pr} dim={!affordable0} />}
                              {pr?.offPeak && (
                                <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.1em', color: 'rgba(255,255,255,0.45)', marginTop: '3px' }}>{t('booking.offPeak')}</div>
                              )}
                              {!isTrial && w24 && <div style={{ fontSize: '11.5px', color: '#c9a84c', marginTop: '2px', fontWeight: 700 }}>24h</div>}
                              <div style={{ display: 'flex', justifyContent: 'center', gap: '3px', marginTop: '6px' }}>
                                {(chosenCoach ? [chosenCoach] : ids).map(id => <Face key={id} id={id} size={22} />)}
                              </div>
                            </button>
                          )
                        })}
                      </div>
                      {curShown && (
                        <div style={{ marginTop: '12px', background: NAVY, border: `1px solid ${GOLD}66`, borderRadius: '12px', padding: '12px 14px' }}>
                          <div style={{ fontSize: '13.5px', color: 'rgba(255,255,255,0.7)', marginBottom: '10px' }}>
                            {t('booking.coachesAt', { time: selectedSlot!.label })}
                          </div>
                          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                            {curIds.map(id => {
                              const on = selectedCoach?.id === id
                              return (
                                <button key={id}
                                  onClick={() => {
                                    if (on) return
                                    const c = coaches.find(x => x.id === id)
                                    if (c) choosePrivate(ds0, selectedSlot!, c)
                                  }}
                                  style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', minHeight: '40px', padding: '0 14px 0 6px', borderRadius: '999px', cursor: on ? 'default' : 'pointer',
                                    border: `1.5px solid ${on ? GOLD : 'rgba(255,255,255,0.14)'}`, background: on ? `${GOLD}20` : 'transparent',
                                    color: on ? '#fff' : 'rgba(255,255,255,0.7)', fontSize: '14px', fontWeight: 700 }}>
                                  <Face id={id} size={26} />{coachName(id)}
                                </button>
                              )
                            })}
                          </div>
                          {selectedCoach && (
                            <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.45)', marginTop: '10px' }}>
                              {t('booking.coachPicked', { name: selectedCoach.first_name })}
                            </div>
                          )}
                        </div>
                      )}
                    </>
                  )
                })()) : timeSlots.length === 0 ? (
                  <div style={{ background: NAVY, borderRadius: '12px', padding: '24px', textAlign: 'center', border: '1px dashed rgba(255,255,255,0.12)' }}>
                    <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '15px' }}>{t('booking.noSlots')}</p>
                  </div>
                ) : (
                  <>
                  {batchFlow && (
                    <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.4)', marginBottom: '8px' }}>{t('booking.oneADay')}</div>
                  )}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: '8px' }}>
                    {(lessonLength === 60 ? [] : timeSlots).map(slot => {
                      const ds0 = selectedDate ? formatDateLA(selectedDate) : ''
                      const key0 = `${ds0}|${slot.time}`
                      const inBasket = batchFlow && recurSel.has(key0)
                      const on = inBasket || (!batchFlow && selectedSlot?.time === slot.time)
                      const cost0 = (batchFlow && selectedDate) ? (priceAt(ds0, slot.time, 30)?.charged ?? 0) : 0
                      // One private lesson per day. Two on the same date leaves
                      // "every Thursday at 10:20" with no single meaning -- the
                      // shortcut can only repeat one of them, and the family has
                      // no way to know which before pressing it. Picking a second
                      // time on a day REPLACES the first, so the affordability
                      // test has to give back what it would drop.
                      const sameDay = batchFlow ? [...recurSel.values()].filter(x => x.date === ds0) : []
                      const freed = sameDay.reduce((a, x) => a + x.points, 0)
                      const affordable0 = !batchFlow || inBasket || basketTotal - freed + cost0 <= balance
                      const usable0 = slot.available && affordable0
                      return (
                        <button key={slot.time}
                        onClick={() => {
                          if (!slot.available || !selectedDate || !selectedCoach) return
                          if (batchFlow && !affordable0) return
                          choosePrivate(ds0, slot, selectedCoach)
                        }}
                        disabled={!usable0}
                        style={{
                          padding: '12px 8px', borderRadius: '10px',
                          border: `2px ${batchFlow && !affordable0 && !inBasket && slot.available ? 'dashed' : 'solid'} ${on ? GOLD : usable0 ? (slot.fill ? slot.fill + '55' : 'rgba(255,255,255,0.12)') : 'rgba(255,255,255,0.05)'}`,
                          background: on ? `${GOLD}20` : usable0 ? (slot.fill ? slot.fill + '22' : NAVY) : 'rgba(255,255,255,0.03)',
                          color: on ? GOLD : usable0 ? '#fff' : 'rgba(255,255,255,0.2)',
                          fontSize: '14px', fontWeight: 600, cursor: usable0 ? 'pointer' : 'not-allowed',
                          textAlign: 'center',
                        }}
                      >
                        {inBasket ? '✓ ' : ''}{slot.label}
                        {(() => {
                          if (isReschedule || isTrial || !selectedDate) return null
                          const pr = priceAt(formatDateLA(selectedDate), slot.time, 30)
                          if (!pr) return null
                          return (
                            <>
                              <PriceTag price={pr} dim={!slot.available} />
                              {pr.offPeak && (
                                <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.1em', color: slot.available ? 'rgba(255,255,255,0.45)' : 'rgba(255,255,255,0.2)', marginTop: '3px' }}>{t('booking.offPeak')}</div>
                              )}
                            </>
                          )
                        })()}
                        {!isTrial && slot.available && slot.within24h && (
                          <div style={{ fontSize: '11.5px', color: '#c9a84c', marginTop: '2px', fontWeight: 700 }}>24h</div>
                        )}
                        {selectedCourse && (selectedCourse.slug === '1on4' || selectedCourse.slug === 'team') && (
                          <div style={{ fontSize: '11.5px', color: 'rgba(255,255,255,0.4)', marginTop: '2px' }}>{t('booking.spotsLeft', { n: slot.max - slot.enrolled })}</div>
                        )}
                      </button>
                      )
                    })}
                  </div>
                  </>
                )}
              </div>
            )}

            {groupFlow && (() => {
              const byDate: Record<string, any[]> = {}
              for (const d of groupWeeks) byDate[d.date] = d.classes || []
              const todayDs = formatDateLA(today)
              return (
                <div>
                  {/* One continuous run of weeks, starting with the week we are in.
                      Past weeks are gone, and a new month does not start a new
                      grid -- it just carries on in the same rows, with the 1st of
                      the month labelled -- so there are no blank cells between
                      September and October. A ticked lesson in September still
                      stays in view while the family looks at October. */}
                  {(() => {
                    const weekStart0 = new Date(today.getFullYear(), today.getMonth(), today.getDate() - today.getDay())
                    const lastDay = new Date(today.getFullYear(), today.getMonth() + monthsShown, 0)
                    const days: Date[] = []
                    for (const d = new Date(weekStart0); d <= lastDay || days.length % 7 !== 0; d.setDate(d.getDate() + 1)) days.push(new Date(d))
                    // A row the month line runs above gets extra room, and the
                    // line sits in the middle of it rather than squeezed into the
                    // 4px gap between cells.
                    const GAP = 4, EXTRA = 14
                    const rowEdge = Array.from({ length: days.length / 7 }, (_, r) =>
                      r > 0 && days.slice(r * 7, r * 7 + 7).some((d, k) => days[(r - 1) * 7 + k].getMonth() !== d.getMonth()))
                    const lineTop = (r: number) => -((rowEdge[r] ? GAP + EXTRA : GAP) / 2) - 1.5
                    const lineAt = (r: number) => `${lineTop(r)}px`
                    return (
                      <div style={{ marginBottom: '18px' }}>
                        {/* Pinned under the site's 64px navbar (top: 0 put it BEHIND the
                            navbar, so it never showed once you scrolled), so the
                            weekdays stay in view all the way down the calendar. */}
                        <div style={{ position: 'sticky', top: '64px', zIndex: 3, background: DARK, padding: '10px 0 6px', marginBottom: '4px', borderBottom: '1px solid rgba(255,255,255,0.08)', boxShadow: '0 6px 10px -6px rgba(0,0,0,0.5)' }}>
                          {/* The page title rides along with the weekdays, like the
                              month name above the weekday letters in a phone's
                              calendar. The dark band reaches into the left margin so
                              the month names there slide under it, not over it. */}
                          {!isPhone && <div aria-hidden style={{ position: 'absolute', top: 0, bottom: 0, left: '-120px', width: '120px', background: DARK }} />}
                          <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 'clamp(20px,2.5vw,28px)', fontWeight: 900, color: '#fff', margin: '0 0 14px' }}>{t('booking.s4.title')}</h2>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: '4px', position: 'relative' }}>
                          {[0, 1, 2, 3, 4, 5, 6].map(d => (
                            <div key={d} style={{ textAlign: 'center', fontSize: isPhone ? '13px' : '14px', fontWeight: 700, letterSpacing: '1px', color: d === 0 || d === 6 ? '#fff' : 'rgba(255,255,255,0.32)', padding: '4px 0' }}>{t('date.weekdayShort.' + d)}</div>
                          ))}
                          </div>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: '4px', position: 'relative' }}>
                          {days.map((dt, idx) => {
                            const y = dt.getFullYear()
                            const m = dt.getMonth()
                            const i = dt.getDate() - 1
                            const mm2 = String(m + 1).padStart(2, '0')
                            const ds = `${y}-${mm2}-${String(i + 1).padStart(2, '0')}`
                            // The month is named where it starts, and on the very
                            // first cell so the top row is never nameless.
                            const monthTag = idx === 0 || i === 0
                            const weekend = dt.getDay() === 0 || dt.getDay() === 6
                            const monthLabel = dt.toLocaleDateString(dateLoc, { month: 'short' })
                            // A gold line where one month meets the next: along the
                            // top of any day whose week-above is the old month, and
                            // down the left of the 1st. Together they step round the
                            // month like a staircase, so October reads as a block.
                            const above = idx >= 7 ? days[idx - 7] : null
                            const before = idx % 7 !== 0 ? days[idx - 1] : null
                            const edgeTop = !!above && above.getMonth() !== m
                            const edgeLeft = !!before && before.getMonth() !== m
                            const row = Math.floor(idx / 7)
                            const slots = (byDate[ds] || []).filter((c: any) => meetsLeadTime(ds, c.time))
                            const isPast = ds < todayDs
                            const isToday2 = ds === todayDs
                            const open = openDay === ds
                            const anyPicked = slots.some((sl: any) => recurSel.has(`${ds}|${sl.time}`))
                            // The phone's time panel opens under the week the day is in.
                            const endsWeek = idx % 7 === 6
                            const rowStart = idx - (idx % 7)
                            const openInThisWeek = isPhone && openDay != null
                              && days.slice(rowStart, idx + 1).some(x => formatDateLA(x) === openDay)
                            const openSlots = openInThisWeek ? (byDate[openDay!] || []).filter((c: any) => meetsLeadTime(openDay!, c.time)) : []
                            return (
                              <React.Fragment key={ds}>
                              <div style={{ backgroundColor: NAVY, backgroundImage: isPast ? 'repeating-linear-gradient(135deg, rgba(255,255,255,0.05) 0px, rgba(255,255,255,0.05) 2px, transparent 2px, transparent 10px)' : 'none', border: `1px solid ${open ? GOLD : anyPicked && isPhone ? GOLD + '77' : isToday2 ? GOLD + '66' : 'rgba(255,255,255,0.08)'}`, borderRadius: isPhone ? '9px' : '10px', padding: isPhone ? '0' : '8px 6px 7px', minHeight: isPhone ? '60px' : '100px', minWidth: 0, position: 'relative', marginTop: rowEdge[row] ? `${EXTRA}px` : 0 }}>
                                {!isPhone && (idx === 0 || (edgeTop && idx % 7 === 0)) && (
                                  // On a wide screen the month sits in the margin, level with
                                  // the start of its line. A phone has no margin to spare, so
                                  // there the 1st of the month carries a small tag instead.
                                  <span style={{ position: 'absolute', right: 'calc(100% + 14px)', top: idx === 0 ? '2px' : `${lineTop(row) + 1.5 - 12}px`,
                                    lineHeight: '24px', whiteSpace: 'nowrap', fontSize: '19px', fontWeight: 800, color: GOLD }}>{monthLabel}</span>
                                )}
                                {edgeTop && <span aria-hidden style={{ position: 'absolute', top: lineAt(row), left: idx % 7 === 0 ? 0 : '-4px', right: idx % 7 === 6 ? 0 : '-4px', height: '3px', borderRadius: '2px', background: GOLD, zIndex: 1 }} />}
                                {edgeLeft && <span aria-hidden style={{ position: 'absolute', left: '-4px', top: lineAt(row), bottom: lineAt(row + 1), width: '3px', borderRadius: '2px', background: GOLD, zIndex: 1 }} />}
                                {isPhone ? (
                                  <button onClick={() => { if (slots.length === 0) return; setOpenDay(open ? null : ds) }}
                                    disabled={slots.length === 0}
                                    style={{ width: '100%', minHeight: '60px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '6px', background: 'transparent', border: 'none', borderRadius: '8px', padding: '4px 0', cursor: slots.length === 0 ? 'default' : 'pointer' }}>
                                    <span style={{ fontSize: '17px', lineHeight: 1.1, color: anyPicked ? GOLD : isToday2 ? GOLD : isPast ? 'rgba(255,255,255,0.18)' : weekend ? '#fff' : 'rgba(255,255,255,0.32)', fontWeight: weekend ? 800 : 600 }}>{monthTag && <span style={{ display: 'block', width: 'fit-content', margin: '0 auto 3px', fontSize: '10px', fontWeight: 800, color: NAVY, background: GOLD, borderRadius: '4px', padding: '1px 5px', lineHeight: 1.25 }}>{monthLabel}</span>}{i + 1}</span>
                                    <span style={{ display: 'flex', gap: '4px', height: '7px', alignItems: 'center' }}>
                                      {slots.map((sl: any) => {
                                        const picked = recurSel.has(`${ds}|${sl.time}`)
                                        const prop = !picked && ghost.has(`${ds}|${sl.time}`)
                                        const gone = sl.full || sl.already_booked
                                        return <span key={sl.coach_id + sl.time} style={{ width: '7px', height: '7px', borderRadius: '50%', background: picked ? GOLD : (gone || prop) ? 'transparent' : myBandColor, border: prop ? `1px solid ${GOLD}` : gone ? '1px solid rgba(255,255,255,0.28)' : 'none' }} />
                                      })}
                                    </span>
                                  </button>
                                ) : (
                                  <>
                                    {/* Saturdays and Sundays in a lighter shade, weekdays in full
                                        white, as a phone calendar does -- the column tells you the
                                        day without a word in every cell. */}
                                    <div style={{ textAlign: 'center', fontSize: '17px', lineHeight: 1.2, fontWeight: weekend ? 800 : 600, marginBottom: '7px', color: isToday2 ? GOLD : isPast ? 'rgba(255,255,255,0.18)' : weekend ? '#fff' : 'rgba(255,255,255,0.32)' }}>{i + 1}</div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                                      {slots.map((sl: any) => {
                                        const w24 = isWithin24Hours(ds, sl.time)
                                        const key = `${ds}|${sl.time}`
                                        const inBasket = recurSel.has(key)
                                        const cost = priceAt(ds, sl.time, 30)?.charged ?? 0
                                        const affordable = inBasket || basketTotal + cost <= balance
                                        const clickable = !sl.full && !sl.already_booked && affordable
                                        const proposed = !inBasket && ghost.has(key)
                                        const cellBorder = inBasket ? GOLD : proposed ? `${GOLD}99` : sl.full || sl.already_booked ? 'rgba(255,255,255,0.06)' : !affordable ? 'rgba(255,255,255,0.10)' : myBandColor + '55'
                                        return (
                                          <button key={sl.coach_id + sl.time}
                                            onClick={() => toggleSlot(ds, dt, sl)}
                                            disabled={!clickable}
                                            style={{
                                              padding: '6px 4px', borderRadius: '7px', textAlign: 'center',
                                              border: `2px ${proposed || (!affordable && !inBasket && !sl.full && !sl.already_booked) ? 'dashed' : 'solid'} ${cellBorder}`,
                                              background: inBasket ? `${GOLD}20` : proposed ? `${GOLD}0d` : clickable ? myBandColor + '18' : 'rgba(255,255,255,0.03)',
                                              cursor: clickable ? 'pointer' : 'not-allowed',
                                            }}>
                                            {/* Each of the seven columns is about 47px on a phone, so the
                                                time and the seat count get a line each. They were side by
                                                side with no whitespace between the two spans -- which gives
                                                the browser nowhere to break, so "4 left" was painted outside
                                                the cell rather than wrapped inside it. */}
                                            <span style={{ display: 'block', fontSize: '13px', lineHeight: 1.25, fontWeight: 700, color: inBasket ? GOLD : proposed ? `${GOLD}cc` : clickable ? '#fff' : 'rgba(255,255,255,0.3)' }}>
                                              <span style={{ display: 'block', whiteSpace: 'nowrap' }}>{inBasket ? '✓ ' : ''}{formatTime(sl.time)}</span>
                                              <span style={{ display: 'block', fontSize: '11.5px', fontWeight: 600, marginTop: '2px', whiteSpace: 'nowrap', color: sl.already_booked ? 'rgba(255,255,255,0.4)' : sl.full ? 'rgba(255,255,255,0.3)' : inBasket ? GOLD : !affordable ? 'rgba(255,255,255,0.25)' : myBandColor }}>
                                                {sl.already_booked ? '✓' : sl.full ? t('booking.full') : !affordable ? t('booking.group.tooDear') : t('booking.spotsLeft', { n: sl.max - sl.enrolled })}
                                              </span>
                                              {w24 && clickable ? <span style={{ display: 'block', fontSize: '11px', marginTop: '1px', color: '#c9a84c' }}>24h</span> : null}
                                            </span>
                                          </button>
                                        )
                                      })}
                                    </div>
                                  </>
                                )}
                              </div>
                              {isPhone && endsWeek && openInThisWeek && (
                                <div style={{ gridColumn: '1 / -1', background: NAVY, border: `1px solid ${GOLD}55`, borderRadius: '14px', padding: '14px 14px 12px', margin: '4px 0 6px', position: 'relative', zIndex: 2 }}>
                                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px', gap: '8px' }}>
                                    <span style={{ fontSize: '16px', fontWeight: 700, color: '#fff' }}>
                                      {new Date(openDay! + 'T00:00:00').toLocaleDateString(dateLoc, { weekday: 'long', month: 'long', day: 'numeric' })}
                                    </span>
                                    <button onClick={() => setOpenDay(null)} style={{ background: 'none', border: 'none', padding: '8px 4px', minHeight: '40px', fontSize: '14px', color: 'rgba(255,255,255,0.55)', cursor: 'pointer' }}>{t('common.close')}</button>
                                  </div>
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    {openSlots.map((sl: any) => {
                                      const key = `${openDay}|${sl.time}`
                                      const inBasket = recurSel.has(key)
                                      const pr = priceAt(openDay!, sl.time, 30)
                                      const cost = pr?.charged ?? 0
                                      const affordable = inBasket || basketTotal + cost <= balance
                                      const clickable = !sl.full && !sl.already_booked && affordable
                                      const w24 = isWithin24Hours(openDay!, sl.time)
                                      return (
                                        <button key={sl.coach_id + sl.time}
                                          onClick={() => toggleSlot(openDay!, new Date(openDay! + 'T00:00:00'), sl)}
                                          disabled={!clickable}
                                          style={{ minHeight: '62px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', padding: '11px 14px', borderRadius: '12px', textAlign: 'left',
                                            border: `2px solid ${inBasket ? GOLD : clickable ? myBandColor + '55' : 'rgba(255,255,255,0.07)'}`,
                                            background: inBasket ? `${GOLD}20` : clickable ? myBandColor + '14' : 'rgba(255,255,255,0.03)',
                                            cursor: clickable ? 'pointer' : 'not-allowed' }}>
                                          <span>
                                            <span style={{ display: 'block', fontSize: '17px', fontWeight: 700, color: inBasket ? GOLD : clickable ? '#fff' : 'rgba(255,255,255,0.3)' }}>{formatTime(sl.time)}</span>
                                            <span style={{ display: 'block', fontSize: '13px', marginTop: '3px', color: clickable ? 'rgba(255,255,255,0.45)' : 'rgba(255,255,255,0.25)' }}>
                                              {sl.already_booked ? t('booking.booked') : sl.full ? t('booking.full') : !affordable ? t('booking.group.tooDear') : t('booking.spotsLeft', { n: sl.max - sl.enrolled })}
                                              {w24 && clickable ? ' · 24h' : ''}
                                            </span>
                                          </span>
                                          <span style={{ display: 'flex', alignItems: 'center', gap: '9px', flexShrink: 0 }}>
                                            {pr && <PriceTag price={pr} dim={!clickable} />}
                                            <span style={{ width: '28px', height: '28px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '15px', fontWeight: 700,
                                              border: inBasket ? 'none' : '1.5px solid rgba(255,255,255,0.25)', background: inBasket ? GOLD : 'transparent', color: NAVY }}>{inBasket ? '✓' : ''}</span>
                                          </span>
                                        </button>
                                      )
                                    })}
                                  </div>
                                </div>
                              )}
                              </React.Fragment>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })()}

                  {monthsShown < 6 && (
                    <button onClick={() => setMonthsShown(n => n + 1)}
                      style={{ width: '100%', marginBottom: '16px', padding: '11px', background: 'transparent', border: '1px dashed rgba(255,255,255,0.18)', borderRadius: '10px', color: 'rgba(255,255,255,0.55)', fontSize: '13.5px', fontWeight: 600, cursor: 'pointer' }}>
                      {t('booking.group.loadMore')}
                    </button>
                  )}
                  <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.45)', marginBottom: '8px' }}>
                    {myGroupBand ? t('booking.group.showingBand', { name: selectedStudent?.full_name || '', min: myGroupBand.min, max: myGroupBand.max }) : t('booking.group.showing', { name: selectedStudent?.full_name || '' })}
                  </div>
                  {selectedSlot && selectedDate && selectedCoach && (
                    <div style={{ background: `${GOLD}12`, border: `1px solid ${GOLD}55`, borderRadius: '10px', padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '14px', fontWeight: 600, color: '#fff' }}>
                        {selectedDate.toLocaleDateString(dateLoc, { weekday: 'short', month: 'short', day: 'numeric' })} · {selectedSlot.label}
                        <span style={{ fontSize: '13px', fontWeight: 400, color: 'rgba(255,255,255,0.5)', marginLeft: '8px' }}>{t('booking.group.withCoach', { name: selectedCoach.first_name })}</span>
                      </span>
                      <span style={{ fontSize: '13px', fontWeight: 700, color: GOLD }}>{t('booking.group.ready')}</span>
                    </div>
                  )}
                </div>
              )
            })()}

                {/* The basket. Without it, picking a second weekday looks like
                    it replaced the first, and the family books twice. */}
                {batchFlow && recurSel.size > 0 && !recurOpen && (
                  <div style={{ marginTop: '10px', background: NAVY, border: `1px solid ${GOLD}55`, borderRadius: '12px', padding: '14px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap' }}>
                      {/* The sticky bar carries the total; this line carries
                          the count, because the chips below it are the thing
                          being counted and "8 lessons" is what the parent is
                          deciding about. */}
                      <span style={{ fontSize: '13px', letterSpacing: '0.08em', color: 'rgba(255,255,255,0.45)' }}>
                        {t('booking.recur.basketTitle')}
                        <span style={{ marginLeft: '8px', letterSpacing: 0, color: GOLD, fontWeight: 700 }}>
                          {t('booking.recur.basketCount', { n: recurSel.size })}
                        </span>
                      </span>
                      <button onClick={() => setRecurSel(new Map())}
                        style={{ background: 'none', border: 'none', padding: 0, fontSize: '13px', color: 'rgba(255,255,255,0.45)', cursor: 'pointer', textDecoration: 'underline' }}>
                        {t('booking.recur.clearAll')}
                      </button>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '10px' }}>
                      {basket.map(x => (
                        <button key={x.date + x.time}
                          onClick={() => setRecurSel(prev => { const n = new Map(prev); n.delete(`${x.date}|${x.time}`); return n })}
                          style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 600, padding: '5px 9px', borderRadius: '6px', background: `${GOLD}18`, border: `1px solid ${GOLD}44`, color: GOLD, cursor: 'pointer' }}>
                          {new Date(x.date + 'T00:00:00').toLocaleDateString(locale === 'en' ? 'en-US' : locale, { month: 'short', day: 'numeric' })}
                          {basketTimes.size > 1 ? ` · ${x.label}` : ''}
                          {basketCoaches.size > 1 ? ` · ${x.coachName || ''}` : ''}
                          <span aria-hidden style={{ color: 'rgba(255,255,255,0.4)' }}>×</span>
                        </button>
                      ))}
                    </div>
                    <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.4)', marginTop: '10px', lineHeight: 1.6 }}>
                      {t('booking.recur.basketHint', { points: Math.max(0, balance - basketTotal) })}
                    </div>
                  </div>
                )}
                {recurMsg && (
                  <div style={{ marginTop: '10px', background: 'rgba(80,200,120,0.1)', border: '1px solid rgba(80,200,120,0.35)', borderRadius: '10px', padding: '12px 16px', color: '#7fd8a0', fontSize: '14px', fontWeight: 600 }}>{recurMsg}</div>
                )}
                {batchFlow && selectedSlot && selectedDate && selectedCoach && !recurOpen && (
                  <button disabled={recurBusy}
                    onClick={async () => {
                      if (!selectedStudent) return
                      setRecurBusy(true); setRecurMsg('')
                      try {
                        const res = await fetch('/api/bookings/recurring', {
                          method: 'POST', headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            action: 'preview', student_id: selectedStudent.id, coach_id: selectedCoach.id,
                            student2_id: siblingPair ? selectedStudent2!.id : null,
                            start_time: selectedSlot.time, start_date: formatDateLA(selectedDate),
                            course_slug: selectedCourse?.slug ?? '1on4', minutes: 30,
                            fallback: privateFlow && coachFilter === 'any',
                          }),
                        })
                        const j = await res.json().catch(() => ({}))
                        if (!res.ok) { setRecurMsg(tErr(j.error, 'booking.recur.err.preview')) }
                        else {
                          const cands = j.candidates || []
                          const quote = new Map<string, number>(
                            cands.filter((c: any) => c.points != null).map((c: any) => [c.date, Number(c.points)]))
                          setRecurList(cands)
                          setRecurQuote(quote)
                          setRecurCoach(new Map(cands.filter((c: any) => c.status === 'ok').map((c: any) => [c.date, c.coach_id || selectedCoach.id])))
                          // Pre-tick the first ten dates the wallet actually
                          // covers: running total, in date order, stopping at
                          // the balance. Everything further out is one tap
                          // away in the grid, so the default is a starting
                          // point, not a decision made for the family.
                          const time = selectedSlot.time
                          const pre = new Set<string>()
                          // What the parent already chose at this slot is
                          // ticked first, so the fill can never crowd it out.
                          let run = [...recurSel.entries()]
                            .filter(([k]) => !k.endsWith(`|${time}`))
                            .reduce((a, [, v]) => a + v.points, 0)
                          for (const c of cands) {
                            const key = `${c.date}|${time}`
                            if (c.status === 'ok' && recurSel.has(key)) {
                              pre.add(key); run += quote.get(c.date) ?? 0
                            }
                          }
                          for (const c of cands) {
                            if (pre.size >= 10) break
                            const key = `${c.date}|${time}`
                            if (c.status !== 'ok' || pre.has(key)) continue
                            const cost = quote.get(c.date) ?? 0
                            if (run + cost > balance) break
                            run += cost
                            pre.add(key)
                          }
                          setGhostSel(pre)
                          setRecurOpen(true)
                        }
                      } catch { setRecurMsg(t('cart.err.network')) }
                      setRecurBusy(false)
                    }}
                    style={{ marginTop: '10px', width: '100%', padding: '13px', background: 'transparent', border: `1px solid ${GOLD}`, borderRadius: '10px', color: GOLD, fontSize: '14px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', cursor: recurBusy ? 'wait' : 'pointer' }}>
                    {recurBusy ? t('booking.recur.loading') : t('booking.recur.cta', { weekday: selectedDate.toLocaleDateString(locale === 'en' ? 'en-US' : locale, { weekday: 'long' }), time: selectedSlot.label })}
                  </button>
                )}
                {batchFlow && recurOpen && selectedSlot && selectedDate && selectedCoach && (
                  <div style={{ marginTop: '10px', background: '#16243f', border: `1px solid ${GOLD}73`, borderRadius: '12px', padding: '16px', boxShadow: '0 18px 40px rgba(0,0,0,0.45)' }}>
                    <div style={{ fontSize: '15px', fontWeight: 700, color: GOLD }}>
                      {t('booking.recur.everyWeekday', { weekday: selectedDate.toLocaleDateString(locale === 'en' ? 'en-US' : locale, { weekday: 'long' }), time: selectedSlot.label })}
                    </div>
                    <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.45)', marginTop: '4px' }}>
                      {t('booking.recur.remaining', { n: okCount })}
                    </div>

                    {/* "8 weeks" is an abstraction: which eight days it means
                        is an answer the calendar holds, on a month the parent
                        may not have scrolled to. Laying the slot's actual dates
                        out as chips means they are looking at the thing they
                        are buying. Ten come pre-ticked; the rest they tick. */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(86px, 1fr))', gap: '6px', marginTop: '13px', maxHeight: '236px', overflowY: 'auto' }}>
                      {recurCandidates.map((c: any) => {
                        const key = `${c.date}|${selectedSlot.time}`
                        const on = ghostSel.has(key)
                        const cost = recurQuote.get(c.date) ?? 0
                        // An already-ticked chip can always be unticked; only
                        // new ones have to fit inside what is left.
                        const room = on || otherTotal + chosenTotal + cost <= balance
                        return (
                          <button key={key} disabled={!room}
                            onClick={() => setGhostSel(prev => {
                              const n = new Set(prev)
                              if (n.has(key)) n.delete(key); else n.add(key)
                              return n
                            })}
                            style={{
                              minHeight: '48px', padding: '6px 4px', borderRadius: '8px',
                              cursor: room ? 'pointer' : 'not-allowed',
                              border: on ? `2px solid ${GOLD}` : `1px dashed ${room ? `${GOLD}73` : 'rgba(255,255,255,0.1)'}`,
                              background: on ? `${GOLD}29` : 'transparent',
                              color: on ? GOLD : room ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.25)',
                            }}>
                            <div style={{ fontSize: '13px', fontWeight: 700 }}>
                              {new Date(c.date + 'T00:00:00').toLocaleDateString(locale === 'en' ? 'en-US' : locale, { month: 'short', day: 'numeric' })}
                            </div>
                            <div style={{ fontSize: '11.5px', marginTop: '2px', opacity: 0.75, fontVariantNumeric: 'tabular-nums' }}>
                              {t('points.unit', { n: cost })}
                            </div>
                            {c.substitute && (
                              <div style={{ fontSize: '11.5px', marginTop: '2px', fontWeight: 700, color: coachColor(c.coach_id) }}>
                                {t('booking.recur.subCoach', { name: c.coach_name })}
                              </div>
                            )}
                          </button>
                        )
                      })}
                    </div>
                    <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.32)', marginTop: '8px', lineHeight: 1.6 }}>
                      {t('booking.recur.gridHint')}
                    </div>
                    {recurCandidates.some((c: any) => c.substitute) && (
                      <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.55)', marginTop: '6px', lineHeight: 1.6 }}>
                        {t('booking.recur.subNote')}
                      </div>
                    )}

                    <div style={{ marginTop: '13px', padding: '11px 12px', borderRadius: '9px', background: 'rgba(255,255,255,0.04)', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                        <span style={{ color: 'rgba(255,255,255,0.5)' }}>{t('booking.recur.wouldAdd')}</span>
                        <span style={{ fontWeight: 700, color: '#fff' }}>{chosen.size}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                        <span style={{ color: 'rgba(255,255,255,0.5)' }}>{t('booking.recur.wouldTotal')}</span>
                        <span style={{ fontWeight: 700, color: '#fff', fontVariantNumeric: 'tabular-nums' }}>{t('points.unit', { n: otherTotal + chosenTotal })}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                        <span style={{ color: 'rgba(255,255,255,0.5)' }}>{t('booking.price.after')}</span>
                        <span style={{ fontWeight: 700, color: GOLD, fontVariantNumeric: 'tabular-nums' }}>{t('points.unit', { n: Math.max(0, balance - otherTotal - chosenTotal) })}</span>
                      </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '13px' }}>
                      <button disabled={chosen.size === 0}
                        onClick={() => {
                          setRecurSel(prev => {
                            const n = new Map(prev)
                            // Whatever the grid says about this slot is now the
                            // truth about it, so unticking the anchor date in
                            // here actually drops it.
                            for (const k of slotKeys) n.delete(k)
                            for (const [key, points] of chosen) {
                              const [date, time] = key.split('|')
                              // One private lesson per day still holds: this
                              // slot's date displaces anything else that day.
                              if (!groupFlow) for (const k of [...n.keys()]) if (k.startsWith(date + '|')) n.delete(k)
                              const cid = recurCoach.get(date) || selectedCoach.id
                              n.set(key, { date, time, label: selectedSlot.label, points, coachId: cid, coachName: coachName(cid) })
                            }
                            return n
                          })
                          setRecurOpen(false)
                        }}
                        style={{ minHeight: '44px', borderRadius: '9px', background: chosen.size === 0 ? 'rgba(255,255,255,0.06)' : GOLD, color: chosen.size === 0 ? 'rgba(255,255,255,0.3)' : NAVY, fontSize: '14px', fontWeight: 700, border: 'none', cursor: chosen.size === 0 ? 'not-allowed' : 'pointer' }}>
                        {t('booking.recur.takeAll', { n: chosen.size })}
                      </button>
                      <button onClick={() => setRecurOpen(false)}
                        style={{ minHeight: '40px', borderRadius: '9px', border: '1px solid rgba(255,255,255,0.16)', background: 'transparent', color: 'rgba(255,255,255,0.6)', fontSize: '13.5px', cursor: 'pointer' }}>
                        {t('common.cancel')}
                      </button>
                    </div>
                  </div>
                )}

            {/* Loading more months makes this page thousands of pixels long, and
                the summary and the way forward used to sit at the bottom of all
                of it: pick a December lesson and you had to scroll past
                everything to act on it, or scroll back to see what you had
                chosen. Sticking the bar to the viewport means the page's length
                only affects browsing, never operating. Collapsing months would
                not have fixed this, and would have hidden chosen lessons -- the
                same fault as the pager we removed. */}
            <div style={{
              position: 'sticky', bottom: 0, zIndex: 5, marginTop: '24px',
              paddingTop: '12px', paddingBottom: 'max(12px, env(safe-area-inset-bottom))',
              background: DARK, borderTop: '1px solid rgba(255,255,255,0.08)',
            }}>
              {batchFlow && recurSel.size > 0 && (
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap', marginBottom: '10px' }}>
                  <span style={{ fontSize: '15px', fontWeight: 700, color: GOLD }}>
                    {t('booking.recur.basket', { n: recurSel.size, points: basketTotal })}
                  </span>
                  <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.45)', fontVariantNumeric: 'tabular-nums' }}>
                    {t('booking.price.after')} {t('points.unit', { n: Math.max(0, balance - basketTotal) })}
                  </span>
                </div>
              )}
              <div style={{ display: 'flex', gap: '12px' }}>
                <button onClick={() => {
                  // A reschedule has no course step to go back to (the course is
                  // fixed), so its way out is back to the family's page.
                  if (isReschedule) { window.location.href = '/dashboard'; return }
                  setStep(1); setSelectedDate(null); setSelectedSlot(null); setRecurOpen(false); setRecurPlan([]); setRecurSel(new Map())
                }} style={{
                  flex: 1, padding: '14px', background: 'transparent',
                  color: 'rgba(255,255,255,0.5)', border: '1px solid rgba(255,255,255,0.15)',
                  borderRadius: '10px', fontSize: '14px', fontWeight: 600, cursor: 'pointer',
                }}>{isReschedule ? t('booking.cancelBack') : t('booking.back')}</button>
                <button
                  onClick={goToConfirm}
                  disabled={!canContinue}
                  style={{
                    flex: 2, padding: '14px',
                    background: canContinue ? GOLD : 'rgba(255,255,255,0.1)',
                    color: canContinue ? NAVY : 'rgba(255,255,255,0.3)',
                    border: 'none', borderRadius: '10px',
                    fontSize: '14px', fontWeight: 700, letterSpacing: '1.5px',
                    textTransform: 'uppercase', cursor: canContinue ? 'pointer' : 'not-allowed',
                  }}
                >{t('booking.continue')}</button>
              </div>
            </div>
          </div>
        )}

        {step === 4 && (
          <div>
            <SectionTitle title={t('booking.s5.title')} />
            <div style={{ background: NAVY, borderRadius: '16px', padding: '28px', border: '1px solid rgba(255,255,255,0.08)', marginBottom: '20px' }}>
              {(planOne ? [
                { label: t(siblingPair ? 'booking.sum.swimmers' : 'booking.sum.swimmer'),
                  value: siblingPair ? `${selectedStudent?.full_name} & ${selectedStudent2?.full_name}` : selectedStudent?.full_name },
                { label: t('booking.sum.course'), value: selectedCourse ? tDb(locale, 'course_types', selectedCourse.id, selectedCourse.name) : '' },
                { label: t('booking.sum.coach'), value: planOne.coachName || selectedCoach?.first_name },
                { label: t('booking.sum.date'), value: new Date(planOne.date + 'T00:00:00').toLocaleDateString(dateLoc, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) },
                { label: t('booking.sum.time'), value: (() => { const [h, m] = planOne.time.split(':').map(Number); const e = h * 60 + m + 30; return `${formatTime(planOne.time)} – ${formatTime(`${String(Math.floor(e / 60)).padStart(2, '0')}:${String(e % 60).padStart(2, '0')}`)}` })() },
                { label: t('booking.sum.duration'), value: t('booking.lenMin', { n: 30 }) },
              ] : recurPlan.length > 0 ? [
                { label: t(siblingPair ? 'booking.sum.swimmers' : 'booking.sum.swimmer'),
                  value: siblingPair ? `${selectedStudent?.full_name} & ${selectedStudent2?.full_name}` : selectedStudent?.full_name },
                { label: t('booking.sum.course'), value: selectedCourse ? tDb(locale, 'course_types', selectedCourse.id, selectedCourse.name) : '' },
                { label: t('booking.sum.coach'), value: planCoaches.length > 0 ? planCoaches.join(locale === 'en' ? ', ' : '、') : selectedCoach?.first_name },
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
                { label: t('booking.sum.date'), value: selectedDate?.toLocaleDateString(dateLoc, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) },
                { label: t('booking.sum.time'), value: selectedHour || !selectedSlot ? selectedSlot?.label : (() => { const [h, m] = selectedSlot.time.split(':').map(Number); const e = h * 60 + m + (selectedCourse?.duration_minutes ?? 30); return `${formatTime(selectedSlot.time)} – ${formatTime(`${String(Math.floor(e / 60)).padStart(2, '0')}:${String(e % 60).padStart(2, '0')}`)}` })() },
                { label: t('booking.sum.duration'), value: t('booking.lenMin', { n: selectedHour ? 60 : selectedCourse?.duration_minutes ?? 0 }) },
                ...(isTrial || isReschedule
                  ? [{ label: t('booking.sum.price'), value: isTrial ? (trialHasCredit ? t('booking.sum.prepaid') : `$${TRIAL_PRICE_CENTS / 100}`) : t('booking.noExtraCharge') }]
                  : []),
              ]).map(row => (
                <div key={row.label} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '12px 0', borderBottom: '1px solid rgba(255,255,255,0.06)',
                }}>
                  <span style={{ fontSize: '14px', color: 'rgba(255,255,255,0.55)' }}>{row.label}</span>
                  <span style={{ fontSize: '14px', fontWeight: 600, color: '#fff' }}>{row.value}</span>
                </div>
              ))}
              {/* Every date, spelled out. This is the last screen before the
                  credits are spent, so "3 lessons" is not enough -- a parent has
                  to be able to see that one of them lands on a week they are away. */}
              {planMany && (
                <div style={{ padding: '12px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                  <div style={{ fontSize: '14px', color: 'rgba(255,255,255,0.4)', marginBottom: '10px' }}>
                    {t('booking.recur.sumDates', { n: recurPlan.length })}
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {recurPlan.map(x => (
                      <span key={x.date + x.time} style={{ fontSize: '13px', fontWeight: 600, padding: '5px 10px', borderRadius: '6px', background: `${GOLD}18`, border: `1px solid ${GOLD}44`, color: GOLD }}>
                        {new Date(x.date + 'T00:00:00').toLocaleDateString(dateLoc, { weekday: 'short', month: 'short', day: 'numeric' })}
                        {planTimes.size > 1 ? ` · ${x.label}` : ''}
                        {planCoaches.length > 1 ? ` · ${x.coachName || ''}` : ''}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {/* The breakdown. Discounts are written as percentages, not as
                  "-4 pts, -3 pts": they are multiplied together and rounded down
                  once, so per-line whole numbers would not add up to the total
                  and a parent subtracting them would find us out. */}
              {!isTrial && !isReschedule && (planOne ? onePrice : recurPlan.length === 0 && bookingPrice) && (() => { const bookingPrice = (planOne ? onePrice : bookingPriceSingle)!; const bookingCost = planOne ? planOne.points : bookingCostSingle; const balanceAfter = Math.max(0, balance - bookingCost); return (
                <div style={{ paddingTop: '12px' }}>
                  {[
                    { k: 'base', label: bookingPrice.seats > 1 ? t('booking.price.baseSeats', { n: bookingPrice.seats }) : t('booking.price.base'), value: String(bookingPrice.base * bookingPrice.seats), dim: true },
                    ...(bookingPrice.offPeak ? [{ k: 'off', label: t('booking.price.offPeak'), value: `−${Math.round(bookingPrice.offPeakPct * 100)}%`, dim: true }] : []),
                  ].map(row => (
                    <div key={row.k} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0' }}>
                      <span style={{ fontSize: '14px', color: 'rgba(255,255,255,0.55)' }}>{row.label}</span>
                      <span style={{ fontSize: '14px', color: 'rgba(255,255,255,0.6)', fontVariantNumeric: 'tabular-nums' }}>{row.value}</span>
                    </div>
                  ))}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0 6px', borderTop: '1px solid rgba(255,255,255,0.1)', marginTop: '6px' }}>
                    <span style={{ fontSize: '14px', fontWeight: 700, color: '#fff' }}>{t('booking.price.total')}</span>
                    <span style={{ fontSize: '16px', fontWeight: 700, color: GOLD, fontVariantNumeric: 'tabular-nums' }}>{t('points.unit', { n: bookingCost })}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '14px', color: 'rgba(255,255,255,0.4)' }}>{t('booking.price.after')}</span>
                    <span style={{ fontSize: '14px', fontWeight: 700, color: 'rgba(255,255,255,0.7)', fontVariantNumeric: 'tabular-nums' }}>{t('points.unit', { n: balanceAfter })}</span>
                  </div>
                </div>
              )})()}
              {/* The batch's own breakdown. Every lesson is priced on its own
                  line above; this says what the whole thing costs and what the
                  discounts took off, because one lesson's percentages cannot
                  describe a batch where half the lessons are off-peak. */}
              {planMany && (
                <div style={{ paddingTop: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0' }}>
                    <span style={{ fontSize: '14px', color: 'rgba(255,255,255,0.4)' }}>{t('booking.price.batchBase', { n: recurPlan.length })}</span>
                    <span style={{ fontSize: '14px', color: 'rgba(255,255,255,0.6)', fontVariantNumeric: 'tabular-nums' }}>{recurBase}</span>
                  </div>
                  {recurBase > recurTotal && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0' }}>
                      <span style={{ fontSize: '14px', color: 'rgba(255,255,255,0.4)' }}>{t('booking.price.batchDiscount')}</span>
                      <span style={{ fontSize: '14px', color: myBandColor, fontVariantNumeric: 'tabular-nums' }}>−{recurBase - recurTotal}</span>
                    </div>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0 6px', borderTop: '1px solid rgba(255,255,255,0.1)', marginTop: '6px' }}>
                    <span style={{ fontSize: '14px', fontWeight: 700, color: '#fff' }}>{t('booking.price.total')}</span>
                    <span style={{ fontSize: '16px', fontWeight: 700, color: GOLD, fontVariantNumeric: 'tabular-nums' }}>{t('points.unit', { n: recurTotal })}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '14px', color: 'rgba(255,255,255,0.4)' }}>{t('booking.price.after')}</span>
                    <span style={{ fontSize: '14px', fontWeight: 700, color: 'rgba(255,255,255,0.7)', fontVariantNumeric: 'tabular-nums' }}>{t('points.unit', { n: Math.max(0, balance - recurTotal) })}</span>
                  </div>
                </div>
              )}
            </div>
            {!isTrial && !isReschedule && (bookingCost > balance || recurTotal > balance) && (
              <div style={{ background: 'rgba(224,90,74,0.1)', border: '1px solid rgba(224,90,74,0.3)', borderRadius: '10px', padding: '14px 18px', marginBottom: '20px', fontSize: '14px', color: '#e05a4a' }}>
                ⚠️ {t('booking.short.body', { have: balance, need: recurPlan.length > 0 ? recurTotal : bookingCost })}
                <div><BuyPointsLink label={t('booking.short.cta')} /></div>
              </div>
            )}
            <div style={{ background: 'rgba(201,168,76,0.08)', border: '1px solid rgba(201,168,76,0.25)', borderRadius: '10px', padding: '12px 16px', marginBottom: '20px' }}>
              <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.65)', lineHeight: 1.6 }}>
                {isTrial ? t('booking.policy.assessment') : t('booking.policy.points', { n: wallet?.forgiveness ?? 0 })}
                <a href="/terms" target="_blank" rel="noopener noreferrer" style={{ color: GOLD, textDecoration: 'underline', fontWeight: 600 }}>
                  {t('booking.viewTerms')}
                </a>
              </span>
            </div>
            {cartMsg && (
              <div style={{ background: 'rgba(220,80,80,0.12)', border: '1px solid rgba(220,80,80,0.4)', borderRadius: '10px', padding: '12px 16px', marginBottom: '20px', color: '#f0a0a0', fontSize: '14px' }}>
                {cartMsg}
              </div>
            )}
            <div style={{ display: 'flex', gap: '12px' }}>
              <button onClick={() => { setStep(3); setRecurPlan([]) }} style={{
                flex: 1, padding: '14px', background: 'transparent',
                color: 'rgba(255,255,255,0.5)', border: '1px solid rgba(255,255,255,0.15)',
                borderRadius: '10px', fontSize: '14px', fontWeight: 600, cursor: 'pointer',
              }}>{t('booking.back')}</button>
              {!isTrial && !isReschedule && recurPlan.length === 0 && selectedCourse?.slug !== '1on2' && (
                <button
                  onClick={handleAddToCart}
                  disabled={submitting || addingToCart}
                  style={{
                    flex: 1, padding: '14px', background: 'transparent',
                    color: (submitting || addingToCart) ? 'rgba(255,255,255,0.3)' : GOLD,
                    border: `1px solid ${GOLD}`, borderRadius: '10px',
                    fontSize: '14px', fontWeight: 700, letterSpacing: '1px',
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
                  fontSize: '14px', fontWeight: 700, letterSpacing: '1.5px',
                  textTransform: 'uppercase', cursor: submitting ? 'not-allowed' : 'pointer',
                }}
              >{submitting ? (isTrial && !trialHasCredit ? t('booking.redirecting') : t('booking.submitting')) : planMany ? t('booking.recur.yesBook', { n: recurPlan.length }) : isTrial ? (trialHasCredit ? t('booking.confirmBooking') : t('booking.continueToPayment')) : isReschedule ? t('booking.confirmReschedule') : t('booking.confirmBooking')}</button>
            </div>
          </div>
        )}
      </div>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,700;0,900;1,700&family=DM+Sans:wght@400;500;600;700&display=swap');`}</style>
      <NoticeModal title={t('common.noticeTitle')} message={notice} closeLabel={t('common.close')} onClose={() => setNotice(null)} />
      {parentId && <ChatWidget parentId={parentId} lift={isPhone ? 104 : 0} />}
      {parentId && <BookingCart refreshSignal={cartRefresh} onCommitted={() => { if (selectedCoach && selectedDate) loadTimeSlots() }} />}
    </div>
  )
}
