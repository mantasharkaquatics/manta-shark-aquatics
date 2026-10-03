'use client'

import React, { useEffect, useRef, useState } from 'react'
import { meetsLeadTime, isWithin24Hours, singleMaxDate, FIXED_CLASS_MIN_LESSONS, SINGLE_BOOKING_DAYS } from '@/lib/booking-time'
import { BASE_POINTS, OFF_PEAK_DISCOUNT, OFF_PEAK_ENABLED, priceLesson, type PriceBreakdown } from '@/lib/points'
import { zoneTypeForSlug } from '@/lib/zones'
import { ZONE_COLORS, bandRange, bandColorOf } from '@/lib/zone-colors'

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
import NoticeModal from '@/components/NoticeModal'
import { getTodayLA, SLOT_STEP_MINUTES } from '@/lib/date'
import { TRIAL_PRICE_CENTS } from '@/lib/plans'
import { assignVoucherKeys } from '@/lib/vouchers'
import { BRAND, FONT_BODY, FONT_DISPLAY } from '@/lib/brand'

/** One lesson in the batch: a date AND the time it starts, because a batch
 *  may span more than one time of day. */
// `fixed` is set on every date of a fixed class (weekday|time|coach), so the
// basket, the summary and the server can tell the class from single lessons.
const SINGLE_DAYS = SINGLE_BOOKING_DAYS
const FIXED_WEEKS_STEP = 26

type PlanSlot = { date: string; time: string; label: string; points: number; coachId: string; coachName?: string; fixed?: string }

// Palette B (2026-09): a light page with white cards, like the parent home
// page. GOLD was the old accent and is still the name this page uses for it;
// it is now the LOGO blue. Filled buttons use AMBER with navy text.
const NAVY = BRAND.navy
const GOLD = BRAND.blue
const AMBER = BRAND.amber
// The page itself: light, starting under the floating nav. One flat colour
// rather than the home page's gentle gradient, because this page has sticky
// bars (the week header, the Continue bar) that must match what is behind them.
const PAGE_TINT = '#eef3f9'
const PAGE_BG: React.CSSProperties = {
  background: PAGE_TINT,
  marginTop: 'calc(-1 * var(--nav-space, 0px))', paddingTop: 'var(--nav-space, 0px)',
}
// One colour per coach, in the order the coaches load, so the dots on a
// calendar day and the faces on a time slot read as the same person.
const COACH_COLORS = ['#c9a84c', '#4a90c4', '#e05a4a', '#4caf72', '#a78bfa', '#e0a04a']
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
  '1on1': '#c97d00', '1on2': '#4a90c4', '1on4': '#4caf72', 'team': '#e05a4a',
}
const COURSE_ICONS: Record<string, string> = {
  '1on1': '👤', '1on2': '👥', '1on4': '👨‍👩‍👧‍👦', 'team': '🏊',
}


/** Every Date on this page is a calendar day in the school's time zone, held
 *  at local midnight -- the calendar cells, the picked day, "today". Its
 *  YYYY-MM-DD is therefore read from the local fields. formatDateLA used to be
 *  applied to these, which on a phone set east of California (New York,
 *  Taipei) turned local midnight into the previous day in LA and booked the
 *  day before the one tapped (found 2026-10-03). */
function localDs(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
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
        textTransform: 'uppercase', color: '#56647d', marginBottom: '8px',
      }}>
        <span style={{ width: 5, height: 5, borderRadius: '50%', background: AMBER, display: 'inline-block' }} />
        {eyebrow}
      </div>}
      <h2 style={{
        fontFamily: FONT_DISPLAY,
        fontSize: 'clamp(20px,2.5vw,28px)', fontWeight: 900,
        color: '#16294a', margin: 0,
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
      display: 'flex', alignItems: 'center', gap: '12px', background: '#fff',
      border: '1px solid #e3ebf6', borderRadius: '12px',
      padding: '4px 12px 4px 16px', minHeight: '52px', marginBottom: '8px',
    }}>
      <span style={{
        width: '20px', height: '20px', borderRadius: '50%', background: '#e6f4ee', color: '#1f7a57', flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 900,
      }}>✓</span>
      <span style={{ fontSize: '13px', color: '#56647d', minWidth: '40px', whiteSpace: 'nowrap', flexShrink: 0 }}>{label}</span>
      <span style={{ flex: 1, minWidth: 0, fontSize: '15px', fontWeight: 700, color: '#16294a' }}>
        {value}
        {sub && <span style={{ fontSize: '13px', fontWeight: 500, color: '#56647d', marginLeft: '6px' }}>{sub}</span>}
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
      background: selected ? `${color}18` : '#fff',
      border: `2px solid ${selected ? color : '#e3ebf6'}`,
      borderRadius: '14px', padding: '20px', cursor: 'pointer',
      transition: 'all 0.15s', position: 'relative',
    }}>
      {selected && (
        <div style={{
          // On the corner, not inside the card: at 12px in it sat on top of
          // the price badge of the course cards.
          position: 'absolute', top: '-8px', right: '-8px',
          width: '22px', height: '22px', borderRadius: '50%', boxShadow: '0 0 0 3px #fff',
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
  // The lesson being moved, so the last screen can say "from ... to ...".
  const [rescheduleFrom, setRescheduleFrom] = useState<{ date: string; start: string } | null>(null)
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
  // The family's make-up vouchers. An ordinary booking uses a matching one by
  // itself (owner, 2026-10-02), unless the family switches to points.
  const [myVouchers, setMyVouchers] = useState<{ id: string; studentId: string; student2Id: string | null; courseSlug: string; minutes: number; expiresOn: string; usableFrom?: string | null }[]>([])
  const [payWithVouchers, setPayWithVouchers] = useState(true)
  const reloadWallet = () => {
    fetch('/api/parent/wallet').then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setWallet(d) }).catch(() => {})
    fetch('/api/parent/vouchers').then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setMyVouchers(d.vouchers || []) }).catch(() => {})
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
  // True while a day's times are being fetched. Without it the empty list read
  // as "no times this day" for the two to four seconds the fetch takes.
  const [slotsLoading, setSlotsLoading] = useState(false)
  const slotsSeq = useRef(0)
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
  /* Bumped on every course (or second-swimmer) click, so the advance effect
     below re-runs even when the click re-picks what is already selected --
     which is exactly what happens after 'Back' from the time step, where the
     course is still set. Without it the page sat on the course step with
     nothing to press. */
  const [advanceTick, setAdvanceTick] = useState(0)
  const requestAdvance = () => { advanceRef.current = true; setAdvanceTick(n => n + 1) }

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
  const myBandColor = myGroupBand ? (bandColorOf(myGroupBand.min, myGroupBand.max) || ZONE_COLORS.group) : ZONE_COLORS.group
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

  // The school's today, as a local-midnight date (see localDs).
  const today = new Date(getTodayLA() + 'T00:00:00')
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
  // The fixed-class grid: where it starts, how many weeks it shows, and whether
  // it was opened from a date past the single-lesson window (so the panel says
  // why a single was not an option).
  const [fixedStart, setFixedStart] = useState('')
  const [fixedWeeks, setFixedWeeks] = useState(FIXED_WEEKS_STEP)
  const [fixedOnly, setFixedOnly] = useState(false)
  // Booking a make-up with a voucher (/booking?voucher=<id>): one lesson of the
  // voucher's kind, for its child(ren), on or before its date, no points.
  const [makeUp, setMakeUp] = useState<{ id: string; studentId: string; student2Id: string | null; studentNames: string[]; courseSlug: string; minutes: number; expiresOn: string; usableFrom?: string | null } | null>(null)
  const singleMax = singleMaxDate()
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
    // With a voucher whose window opens later, from the week it opens: the
    // server reads at most 27 weeks, which a lesson far ahead would outrun.
    const opens = makeUp?.usableFrom ? new Date(makeUp.usableFrom + 'T00:00:00') : null
    const base = opens && opens > today ? opens : today
    const from = new Date(base.getFullYear(), base.getMonth(), base.getDate() - base.getDay())
    // A voucher's calendar runs to its expiry whatever the month count says (a
    // phone starts at one month, which would cut a next-month window short).
    const monthEnd = new Date(today.getFullYear(), today.getMonth() + monthsShown, 0)
    const expiry = makeUp ? new Date(makeUp.expiresOn + 'T00:00:00') : null
    const lastDay = expiry ?? monthEnd
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
  }, [groupFlow, selectedStudent, monthsShown, cartRefresh, makeUp])

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
    if (groupFlow || isTrial || !selectedStudent || !selectedDate || lessonLength !== 60 || !hourOk) { setHourSlots([]); return }
    setHourLoading(true)
    fetch('/api/bookings/hour', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'options', course_slug: selectedCourse?.slug, student_id: selectedStudent.id,
        student2_id: (selectedStudent2 && !(selectedStudent2 as any).isPartner) ? selectedStudent2.id : null,
        session_date: localDs(selectedDate), lesson_group_id: rescheduleGroupIdRef.current || null, voucher_id: makeUp?.id ?? null }),
    }).then(r => r.json())
      .then(d => { setHourSlots(d?.slots || []); setHourBalance(d?.balance ?? 0); setHourRoster(d?.roster || []) })
      .catch(() => setHourSlots([]))
      .finally(() => setHourLoading(false))
  }, [groupFlow, isTrial, selectedStudent, selectedStudent2, selectedDate, lessonLength, selectedCourse])

  // Choosing the assessment after having looked at hour lessons must not carry
  // the 60-minute mode into it.
  useEffect(() => {
    if (isTrial) { setLessonLength(30); setSelectedHour(null) }
  }, [isTrial])

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
        supabase.from('students').select('id, full_name, current_level').eq('parent_id', parent.id).eq('is_active', true).order('sort_order'),
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
        // Read the lesson being moved. A stale link (already moved or
        // cancelled) used to let the parent pick a new time and only then be
        // refused; say so up front instead.
        const { data: ob } = await supabase.from('bookings')
          .select('status, class_session_id').eq('id', rbId).maybeSingle()
        // A key, not text: this runs before the account's language is applied,
        // and a sentence translated now would stay English.
        if (ob && ob.status !== 'confirmed') setNotice('err.cannotReschedule')
        if (ob?.class_session_id) {
          const { data: os } = await supabase.from('class_sessions')
            .select('session_date, start_time').eq('id', ob.class_session_id).maybeSingle()
          if (os) setRescheduleFrom({ date: os.session_date, start: String(os.start_time).slice(0, 5) })
        }
        setLoading(false)
        setStep(3)
        return
      }

      const vId = params.get('voucher')
      if (vId) {
        const vr = await fetch('/api/parent/vouchers').then(r => r.ok ? r.json() : null).catch(() => null)
        const v = (vr?.vouchers || []).find((x: any) => x.id === vId)
        const ct = v ? (cts || []).find((c: any) => c.slug === v.courseSlug) : null
        const s1 = v ? (studs || []).find((x: any) => x.id === v.studentId) : null
        const s2 = v?.student2Id ? (studs || []).find((x: any) => x.id === v.student2Id) : null
        if (!v || !ct || !s1 || (v.student2Id && !s2)) {
          setNotice('err.voucherGone')
        } else {
          setMakeUp(v)
          // The month calendar (1-on-1 / 1-on-2) opens on the voucher's first
          // usable month -- a window starting next month used to open on an
          // empty current month (owner, 2026-10-03).
          if (v.usableFrom && v.usableFrom > localDs(today)) {
            const [fy, fm] = String(v.usableFrom).split('-').map(Number)
            setCalYear(fy); setCalMonth(fm - 1)
          }
          // Show every month the voucher's dates reach (a leave voucher may be for December).
          const [ey, em] = String(v.expiresOn).split('-').map(Number)
          const span = (ey - today.getFullYear()) * 12 + (em - 1 - today.getMonth()) + 1
          if (span > 2) setMonthsShown(Math.min(6, span))
          setSelectedStudent(s1 as any)
          if (s2) setSelectedStudent2(s2 as any)
          setSelectedCourse(ct as any)
          setLessonLength(v.minutes === 60 ? 60 : 30)
          setLoading(false)
          setStep(3)
          return
        }
      }

      setLoading(false)
    }
    init()
  }, [])

  useEffect(() => {
    if (!success) return
    // The confirm button sits low on a long page; the success card rendered
    // mid-screen under empty space, off the bottom of a phone.
    window.scrollTo(0, 0)
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
    const seq = ++slotsSeq.current
    setSlotsLoading(true)
    try { await buildTimeSlots(seq) } finally { if (seq === slotsSeq.current) setSlotsLoading(false) }
  }

  async function buildTimeSlots(seq: number) {
    if (!selectedDate || !selectedCoach || !selectedCourse) return

    const dateStr = localDs(selectedDate)

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
          const f = bandColorOf(z.group_level_min, z.group_level_max) || ZONE_COLORS.group
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
    if (seq !== slotsSeq.current) return
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
      // A cancelled session and its replacement can share a start time; only
      // the live one says how full the class is.
      .neq('status', 'cancelled')

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
    // A slower answer for a day the parent has already clicked away from must
    // not overwrite the day they are looking at.
    if (seq !== slotsSeq.current) return
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
  // A make-up shows only the times it can take (owner, 2026-10-03): with one
  // coach picked, full and taken times used to stay on screen, greyed.
  const shownTimeSlots = makeUp ? timeSlots.filter(sl => sl.available) : timeSlots
  // A 60-minute fixed class (owner, 2026-10-01): the hour list picks the slot
  // and the same fixed-class panel takes it from there. A batch is one length,
  // so the length switch is locked while the basket holds anything.
  const hourFixedFlow = !isTrial && !isReschedule && !makeUp && isHourLesson
    && (selectedCourse?.slug === '1on1' || siblingPair)
  const fixedFlow = batchFlow || hourFixedFlow
  const planMinutes: 30 | 60 = isHourLesson ? 60 : 30

  const balance = wallet?.balance ?? 0

  /** The price of one lesson at a given date and time, or null if this course
   *  is not paid for with points (Swim Team) or nothing is selected yet. */
  function priceAt(dateStr: string, time: string, minutes: number = isHourLesson ? 60 : 30): PriceBreakdown | null {
    if (!selectedCourse || isTrial || makeUp) return null
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

  const canAffordCourse = !selectedCourse || isTrial || isReschedule || !!makeUp
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
  }, [step, courseStepReady, selectedCourse, isTrial, advanceTick])
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
    // A voucher may reach past the usual 60 days; ask for openings up to its expiry.
    if (makeUp) {
      qs.set('until', makeUp.expiresOn)
      if (makeUp.usableFrom) qs.set('from', makeUp.usableFrom)
    }
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
  /** Position in the coach chips row, so faces line up the same way everywhere. */
  const coachRank = (id: string) => {
    const i = (openings?.coaches || []).findIndex((c: any) => c.id === id)
    return i < 0 ? 999 : i
  }
  const Face =({ id, size = 22 }: { id: string; size?: number }) => (
    <span title={coachName(id)} style={{ width: size, height: size, borderRadius: '50%', background: coachColor(id), color: '#16294a',
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
  // The openings are 30-minute cells on the 35-minute grid. A coach free in a
  // cell and in the next one has the whole hour, so those days carry a dot in
  // 60-minute mode too. A hint only: the hour list for the day is what decides,
  // so a day without a dot stays clickable.
  function coachesOnForHour(ds: string): string[] {
    const day = openings?.days[ds]
    if (!day) return []
    const next = (t: string) => { const [h, m] = t.split(':').map(Number); const x = h * 60 + m + 35; return `${String(Math.floor(x / 60)).padStart(2, '0')}:${String(x % 60).padStart(2, '0')}` }
    const ids = new Set<string>()
    for (const [t, list] of Object.entries(day)) {
      const later = day[next(t)] || []
      for (const id of list) if ((coachFilter === 'any' || id === coachFilter) && later.includes(id)) ids.add(id)
    }
    return [...ids]
  }
  function pickFilter(id: string) {
    setCoachFilter(id)
    setSelectedSlot(null); setSelectedHour(null); setRecurOpen(false)
    if (selectedDate && id !== 'any') {
      const ds = localDs(selectedDate)
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
    if (makeUp) {
      // One lesson, nothing to pay: picking another time replaces it.
      setRecurSel(new Map([[`${ds}|${slot.time}`, { date: ds, time: slot.time, label: slot.label, points: 0, coachId: coach.id, coachName: coach.first_name }]]))
      return
    }
    if (ds > singleMax) { setFixedOnly(true); openFixed(ds, slot.time, coach.id); return }
    setFixedOnly(false)
    const key = `${ds}|${slot.time}`
    const cost = priceAt(ds, slot.time, 30)?.charged ?? 0
    setRecurSel(prev => {
      const n = new Map(prev)
      const had = n.get(key)
      if (had && had.coachId === coach.id) { n.delete(key); return n }
      const sameDay = [...n.entries()].filter(([k]) => k.startsWith(ds + '|'))
      const after = [...n.values()].filter(x => x.date !== ds).concat({ date: ds, time: slot.time, label: slot.label, points: cost, coachId: coach.id })
      if (!had && dueOf(after, 30) > balance) return prev
      for (const [k] of sameDay) n.delete(k)
      n.set(key, { date: ds, time: slot.time, label: slot.label, points: cost, coachId: coach.id, coachName: coach.first_name })
      return n
    })
  }

  /** Open the fixed-class grid for one weekday, time and coach, starting at
   *  startDate. `weeks` grows when the parent asks to see further out; the
   *  ticks they already made are kept then, and only the first opening
   *  pre-ticks ten. */
  async function openFixed(startDate: string, time: string, coachId: string, weeks: number = FIXED_WEEKS_STEP, keep?: Set<string>) {
    if (!selectedStudent) return
    setRecurBusy(true); setRecurMsg('')
    try {
      const res = await fetch('/api/bookings/recurring', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'preview', student_id: selectedStudent.id, coach_id: coachId,
          student2_id: siblingPair ? selectedStudent2!.id : null,
          start_time: time, start_date: startDate, weeks,
          course_slug: selectedCourse?.slug ?? '1on4', minutes: planMinutes,
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
        setRecurCoach(new Map(cands.filter((c: any) => c.status === 'ok').map((c: any) => [c.date, coachId])))
        setFixedStart(startDate); setFixedWeeks(weeks)
        if (keep) { setGhostSel(keep); setRecurOpen(true); setRecurBusy(false); return }
        // Pre-tick the first ten dates the wallet actually covers: running
        // total, in date order, stopping at the balance. Ten is also the
        // smallest fixed class, so the default is the class itself.
        const pre = new Set<string>()
        // What the parent already chose at this slot is ticked first, so the
        // fill can never crowd it out.
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
          if (pre.size >= FIXED_CLASS_MIN_LESSONS) break
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
  }

  function clearTime() {
    setSelectedDate(null); setSelectedSlot(null); setRecurOpen(false); setRecurPlan([]); setRecurSel(new Map())
  }
  function changeStudent() {
    setLockedStudent(false); setSelectedStudent(null); setSelectedStudent2(null)
    setIsTrial(false); setSelectedCourse(null); setSelectedCoach(null); clearTime(); setStep(0)
  }

  // ---- Make-up vouchers in an ordinary booking ---------------------------
  // Which of the family's vouchers fit what is being booked: same course, same
  // length, the same child (or the same two children of a sibling 1-on-2).
  // Never in a make-up booking (it names its own), an assessment, a reschedule
  // or a cross-family 1-on-2.
  const voucherKids = (selectedStudent && !(selectedStudent2 as any)?.isPartner)
    ? [selectedStudent.id, ...(siblingPair && selectedStudent2 ? [selectedStudent2.id] : [])] : []
  function fittingVouchers(minutes: number) {
    if (makeUp || isTrial || isReschedule || !selectedCourse || voucherKids.length === 0) return []
    const want = new Set(voucherKids)
    return myVouchers.filter(v => {
      const has = [v.studentId, v.student2Id].filter(Boolean) as string[]
      return v.courseSlug === selectedCourse.slug && v.minutes === minutes
        && has.length === want.size && has.every(id => want.has(id))
    }).map(v => ({ ...v, expires_on: v.expiresOn, usable_from: v.usableFrom ?? null }))
  }
  const lessonKey = (x: { date: string; time: string }) => `${x.date}|${x.time}`
  /** Which single lessons the vouchers would pay for -- the same rule the server
   *  applies (lib/vouchers assignVoucherKeys). `always` ignores the switch, to
   *  say how many COULD be covered. */
  function voucherCover<L extends { date: string; time: string; fixed?: string }>(items: L[], minutes: number, always = false) {
    if (!always && !payWithVouchers) return new Map<string, unknown>()
    const vs = fittingVouchers(minutes)
    if (vs.length === 0) return new Map<string, unknown>()
    return assignVoucherKeys(items.filter(x => !x.fixed), vs, lessonKey) as Map<string, unknown>
  }
  /** Points still due for a set of lessons once the vouchers have paid for theirs. */
  function dueOf<L extends { date: string; time: string; points: number; fixed?: string }>(items: L[], minutes = 30) {
    const cover = voucherCover(items, minutes)
    return items.reduce((a, x) => a + (cover.has(lessonKey(x)) ? 0 : x.points), 0)
  }
  // A 60-minute single (the hour list) takes one voucher for its date.
  const hourDate = selectedDate ? localDs(selectedDate) : ''
  const hourVoucherFits = !!hourDate && !rescheduleGroupIdRef.current
    && fittingVouchers(60).some(v => v.expiresOn >= hourDate && (!v.usableFrom || hourDate >= v.usableFrom))
  const hourCovered = payWithVouchers && hourVoucherFits

  // What this booking will actually cost, once a slot is picked. A reschedule
  // keeps its original charge, so it costs nothing here.
  const bookingPrice = (!isReschedule && !isTrial && selectedDate && selectedSlot)
    ? priceAt(localDs(selectedDate), selectedSlot.time)
    : null
  const bookingCost = selectedHour && hourCovered ? 0 : (bookingPrice?.charged ?? 0)
  const basket = [...recurSel.values()].sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))
  // What the basket will take from the wallet: the lessons a voucher pays for cost nothing.
  const basketTotal = dueOf(basket, 30)
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
  const onePrice = planOne ? priceAt(planOne.date, planOne.time, planMinutes) : null
  const bookingPriceSingle = bookingPrice
  const bookingCostSingle = bookingCost
  const basketCoaches = new Set(basket.map(x => x.coachId))
  /** A plan split into its fixed classes (one line each) and its single
   *  lessons, so a ten-week class reads as one thing and not as ten chips. */
  function splitPlan(plan: PlanSlot[]) {
    const groups = new Map<string, PlanSlot[]>()
    const singles: PlanSlot[] = []
    for (const x of plan) {
      if (x.fixed) groups.set(x.fixed, [...(groups.get(x.fixed) || []), x])
      else singles.push(x)
    }
    const loc = locale === 'en' ? 'en-US' : locale
    const lines = [...groups].map(([key, g]) => ({
      key,
      text: t('booking.recur.fixedLine', {
        weekday: new Date(g[0].date + 'T00:00:00').toLocaleDateString(loc, { weekday: 'long' }),
        time: g[0].label, coach: g[0].coachName || '',
        date: new Date(g[0].date + 'T00:00:00').toLocaleDateString(loc, { month: 'short', day: 'numeric' }),
        n: g.length,
      }),
      points: g.reduce((a, x) => a + x.points, 0),
    }))
    return { lines, singles }
  }
  const basketSplit = splitPlan(basket)
  const planSplit = splitPlan(recurPlan)
  // The plan's lessons a voucher pays for, and what is left to pay in points.
  const recurCover = voucherCover(recurPlan, planMinutes)
  const recurCoverAll = voucherCover(recurPlan, planMinutes, true)
  const recurGross = recurPlan.reduce((a, x) => a + x.points, 0)
  const recurSaved = recurPlan.reduce((a, x) => a + (recurCover.has(lessonKey(x)) ? x.points : 0), 0)
  const recurTotal = recurGross - recurSaved
  // How many lessons on this screen a voucher could pay for, switch on or off.
  const voucherCould = recurPlan.length > 0 ? recurCoverAll.size : (selectedHour && hourVoucherFits ? 1 : 0)
  const voucherUsing = recurPlan.length > 0 ? recurCover.size : (selectedHour && hourCovered ? 1 : 0)
  // The undiscounted figure, so the batch can show what the discounts took off.
  const recurBase = recurPlan.reduce((a, x) => {
    const pr = priceAt(x.date, x.time, planMinutes)
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
  const otherTotal = dueOf(basket.filter(x => !slotKeys.has(`${x.date}|${x.time}`)), 30)
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
  // What the grid draws: the open dates plus the weeks the coach is off.
  const recurShown = (recurOpen && selectedSlot)
    ? recurList.filter((c: any) => c.status === 'ok' || c.status === 'time_off')
    : []
  // The first ten open dates, priced: the least a fixed class here can cost.
  const tenCost = recurCandidates.length >= FIXED_CLASS_MIN_LESSONS
    ? recurCandidates.slice(0, FIXED_CLASS_MIN_LESSONS).reduce((a: number, c: any) => a + (recurQuote.get(c.date) ?? 0), 0)
    : 0


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
    if (makeUp) {
      setRecurSel(new Map([[key, { date: ds, time: sl.time, label: formatTime(sl.time), points: 0, coachId: c.id, coachName: c.first_name }]]))
      return
    }
    if (ds > singleMax) { setFixedOnly(true); openFixed(ds, sl.time, c.id); return }
    setFixedOnly(false)
    setRecurSel(prev => {
      const n = new Map(prev)
      if (n.has(key)) { n.delete(key); return n }
      if (dueOf([...n.values(), { date: ds, time: sl.time, label: '', points: cost, coachId: c.id }], 30) > balance) return n
      n.set(key, { date: ds, time: sl.time, label: formatTime(sl.time), points: cost, coachId: c.id, coachName: c.first_name })
      return n
    })
  }
  const balanceAfter = Math.max(0, balance - bookingCost)

  // Every "you cannot pay for this" notice offers the same way out.
  const BuyPointsLink = ({ label }: { label: string }) => (
    <a href="/plans#buy"
      style={{ display: 'inline-block', marginTop: '10px', padding: '9px 18px', borderRadius: '8px', background: AMBER, color: NAVY, fontSize: '13px', fontWeight: 700, textDecoration: 'none' }}>
      {label}
    </a>
  )

  /** The gold "58 pts" with the struck-out list price beside it. Without the
   *  original the discount may as well not have happened, so it is shown
   *  wherever a discounted price is. */
  const PriceTag = ({ price, dim = false }: { price: PriceBreakdown; dim?: boolean }) => {
    const full = price.base * price.seats
    return (
      <span style={{ display: 'block', fontSize: '12px', marginTop: '3px', fontVariantNumeric: 'tabular-nums', color: dim ? '#9aa6ba' : GOLD }}>
        {price.charged < full && (
          <span style={{ textDecoration: 'line-through', color: '#56647d', marginRight: '4px' }}>{full}</span>
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
          course_slug: selectedCourse?.slug ?? '1on4', minutes: planMinutes,
          slots: recurPlan.map(x => ({ date: x.date, start_time: x.time, coach_id: x.coachId, fixed: x.fixed })),
          voucher_id: makeUp?.id ?? null,
          use_vouchers: !makeUp && payWithVouchers,
        }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) { setNotice(tErr(j.error, 'booking.recur.err.commit')); setSubmitting(false); return }
      // Every time was taken between choosing and confirming: nothing was
      // booked, charged or spent. This used to land on a ✅ "0 lessons
      // booked!" card listing the dates (found 2026-10-03).
      if (j.booked === 0) {
        setNotice(t('booking.recur.err.noneBooked'))
        setRecurPlan([]); setRecurSel(new Map()); setSelectedSlot(null)
        setCartRefresh(n => n + 1)
        setStep(3); setSubmitting(false); return
      }
      // The success card lists only what was booked, not what was skipped.
      if (Array.isArray(j.booked_slots)) {
        const got = new Set(j.booked_slots.map((x: any) => `${x.date}|${String(x.start_time || '').slice(0, 5)}`))
        setRecurPlan(prev => prev.filter(x => got.has(`${x.date}|${x.time.slice(0, 5)}`)))
      }
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

    const dateStr = localDs(selectedDate)
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
          : { action: 'book', course_slug: selectedCourse?.slug, student_id: selectedStudent.id, voucher_id: makeUp?.id ?? null,
              use_vouchers: !makeUp && payWithVouchers,
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
          session_date: localDs(selectedDate),
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
  // With a voucher the months are its own: from the month it opens to the month it expires.
  const ymIndex = (ds: string) => { const [y, m] = ds.split('-').map(Number); return y * 12 + m - 1 }
  const firstIndex = makeUp?.usableFrom ? Math.max(nowIndex, ymIndex(makeUp.usableFrom)) : nowIndex
  const lastIndex = makeUp ? ymIndex(makeUp.expiresOn) : lastBookable.getFullYear() * 12 + lastBookable.getMonth()
  const canPrevMonth = calIndex > firstIndex
  const canNextMonth = calIndex < lastIndex
  const calSkip = (calYear === today.getFullYear() && calMonth === today.getMonth())
    ? Math.max(0, today.getDate() - today.getDay() - 1) : 0
  /* A voucher's dates are a few weeks at most, so its calendar is one run of
     days from the first usable date to the expiry, on one page -- no month
     arrows to find the rest (owner, 2026-10-03). */
  const voucherRange: { from: Date; to: Date } | null = makeUp ? {
    from: makeUp.usableFrom && makeUp.usableFrom > localDs(today) ? new Date(makeUp.usableFrom + 'T00:00:00') : new Date(today.getFullYear(), today.getMonth(), today.getDate()),
    to: new Date(makeUp.expiresOn + 'T00:00:00'),
  } : null
  const calCells: (Date | null)[] = (() => {
    const out: (Date | null)[] = []
    if (voucherRange) {
      const { from, to } = voucherRange
      const start = new Date(from.getFullYear(), from.getMonth(), from.getDate() - from.getDay())
      const end = new Date(to.getFullYear(), to.getMonth(), to.getDate() + (6 - to.getDay()))
      for (const d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) out.push(d < from || d > to ? null : new Date(d))
      return out
    }
    for (let k = 0; k < (calSkip ? 0 : getFirstDayOfMonth(calYear, calMonth)); k++) out.push(null)
    for (let d = calSkip; d < getDaysInMonth(calYear, calMonth); d++) out.push(new Date(calYear, calMonth, d + 1))
    return out
  })()
  /** True when a voucher's calendar has no day left to book. */
  function voucherMonthEmpty(): boolean {
    if (!makeUp || !privateFlow || !openings) return false
    for (const date of calCells) {
      if (!date) continue
      if (!isDateAvailable(date)) continue
      const ds = localDs(date)
      if ((lessonLength === 60 ? coachesOnForHour(ds) : coachesOn(ds)).length > 0) return false
    }
    return true
  }
  function shiftMonth(d: 1 | -1) {
    if (voucherRange) return
    if (d < 0 ? !canPrevMonth : !canNextMonth) return
    const n = calIndex + d
    setCalSlide(d > 0 ? 'l' : 'r')
    setCalYear(Math.floor(n / 12)); setCalMonth(n % 12)
  }
  shiftMonthRef.current = shiftMonth


  /** A make-up's date must sit inside its voucher's dates: up to the expiry,
   *  and for a leave voucher no earlier than 14 days before the missed lesson. */
  function makeUpDateOk(ds: string): boolean {
    return !makeUp || (ds <= makeUp.expiresOn && (!makeUp.usableFrom || ds >= makeUp.usableFrom))
  }
  function isDateAvailable(date: Date): boolean {
    const todayMidnight = new Date(today)
    todayMidnight.setHours(0, 0, 0, 0)
    if (date < todayMidnight) return false
    // A make-up may be booked on any date its voucher covers, wherever that falls.
    if (makeUp) return makeUpDateOk(localDs(date))
    const maxDate = new Date(today)
    // A batch-capable course shows 60 days, because a fixed class can start on
    // any of them; a date past the single-lesson window then opens the fixed
    // class instead of booking a single. Everything else here IS a single
    // lesson (60 minutes, a cross-family 1-on-2, a reschedule), so it stops at
    // the window. The assessment keeps its own 60 days.
    maxDate.setDate(maxDate.getDate() + ((batchFlow || isTrial) ? 60 : SINGLE_DAYS))
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
    <div style={{ minHeight: '100vh', ...PAGE_BG, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center' }}>
        <style>{`@keyframes msaPulse { 0%, 100% { opacity: 1; transform: scale(1) } 50% { opacity: .55; transform: scale(.94) } }`}</style>
        <img src="/logo.png" alt="Manta Shark Aquatics" width={72} height={72}
          style={{ display: 'block', margin: '0 auto 16px', borderRadius: '50%', objectFit: 'cover', animation: 'msaPulse 1.6s ease-in-out infinite' }} />
        <div style={{ fontSize: '15px', color: '#56647d' }}>{t('booking.loading')}</div>
      </div>
    </div>
  )

  if (success) return (
    <div style={{ minHeight: '100vh', ...PAGE_BG, display: 'flex', alignItems: 'center', justifyContent: 'center', paddingLeft: '24px', paddingRight: '24px', paddingBottom: '24px' }}>
      <div style={{
        background: '#fff', borderRadius: '20px', padding: '48px', boxShadow: '0 16px 40px rgba(18,37,74,0.12)',
        textAlign: 'center', maxWidth: '480px', width: '100%',
        border: `1px solid ${GOLD}30`,
      }}>
        {recurPlan.length > 0 ? (
          <>
            <div style={{ fontSize: '48px', marginBottom: '20px' }}>✅</div>
            <h2 style={{ fontFamily: FONT_DISPLAY, fontSize: '28px', fontWeight: 900, color: '#16294a', marginBottom: '12px' }}>
              {t('booking.recur.successBooked', { n: recurBooked })}
            </h2>
            <p style={{ fontSize: '15px', color: '#56647d', lineHeight: 1.7, marginBottom: '4px' }}>
              <strong style={{ color: '#16294a' }}>
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
                  {/* Always the time: this chip is the only place the success
                      card says when the lesson is. */}
                  {` · ${x.label}`}
                </span>
              ))}
            </div>
            {recurSkipped > 0 && (
              <p style={{ fontSize: '14px', color: '#9a5b00', marginBottom: '16px' }}>{t('booking.recur.someSkipped', { m: recurSkipped })}</p>
            )}
            <div style={{
              display: 'flex', alignItems: 'center', gap: '10px',
              background: '#eef4fc', border: '1px solid #c9d8ee',
              borderRadius: '10px', padding: '12px 16px', marginBottom: '24px', textAlign: 'left',
            }}>
              <span style={{ fontSize: '20px', flexShrink: 0 }}>📧</span>
              <p style={{ fontSize: '14px', color: '#56647d', margin: 0, lineHeight: 1.5 }}>
                {t('booking.success.emailSent')}
              </p>
            </div>
          </>
        ) : isPartnerBookingSuccess ? (
          <>
            <div style={{ fontSize: '48px', marginBottom: '20px', color: '#6d4fc2' }}>⏳</div>
            <h2 style={{ fontFamily: FONT_DISPLAY, fontSize: '28px', fontWeight: 900, color: '#16294a', marginBottom: '12px' }}>
              {t('booking.success.invitationSent')}
            </h2>
            <p style={{ fontSize: '15px', color: '#56647d', lineHeight: 1.7, marginBottom: '4px' }}>
              {t('booking.success.invitedDesc')}
            </p>
            <p style={{ fontSize: '15px', color: GOLD, fontWeight: 600, marginBottom: '4px' }}>
              {t('booking.success.with', { course: selectedCourse ? tDb(locale, 'course_types', selectedCourse.id, selectedCourse.name) : '', coach: selectedCoach?.first_name || '' })}
            </p>
            <p style={{ fontSize: '15px', color: '#56647d', marginBottom: '20px' }}>
              {t('booking.success.dateAt', { date: selectedDate?.toLocaleDateString(dateLoc, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) || '', time: selectedSlot?.label || '' })}
            </p>
            <div style={{
              display: 'flex', alignItems: 'center', gap: '10px',
              background: '#f1edfb', border: '1px solid #d8cdf3',
              borderRadius: '10px', padding: '12px 16px', marginBottom: '24px', textAlign: 'left',
            }}>
              <span style={{ fontSize: '20px', flexShrink: 0 }}>🔔</span>
              <p style={{ fontSize: '14px', color: '#56647d', margin: 0, lineHeight: 1.5 }}>
                {t('booking.success.window.a')}<strong style={{ color: '#16294a' }}>{t('booking.success.window.strong')}</strong>{t('booking.success.window.b')}
              </p>
            </div>
          </>
        ) : (
          <>
            <div style={{ fontSize: '48px', marginBottom: '20px' }}>✅</div>
            <h2 style={{ fontFamily: FONT_DISPLAY, fontSize: '28px', fontWeight: 900, color: '#16294a', marginBottom: '12px' }}>
              {isReschedule ? t('booking.success.rescheduled') : t('booking.success.booked')}
            </h2>
            <p style={{ fontSize: '15px', color: '#56647d', lineHeight: 1.7, marginBottom: '4px' }}>
              <strong style={{ color: '#16294a' }}>
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
            <p style={{ fontSize: '15px', color: '#56647d', marginBottom: '20px' }}>
              {t('booking.success.dateAt', { date: selectedDate?.toLocaleDateString(dateLoc, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) || '', time: selectedSlot?.label || '' })}
            </p>
            <div style={{
              display: 'flex', alignItems: 'center', gap: '10px',
              background: '#eef4fc', border: '1px solid #c9d8ee',
              borderRadius: '10px', padding: '12px 16px', marginBottom: '24px', textAlign: 'left',
            }}>
              <span style={{ fontSize: '20px', flexShrink: 0 }}>📧</span>
              <p style={{ fontSize: '14px', color: '#56647d', margin: 0, lineHeight: 1.5 }}>
                {t('booking.success.emailSent')}
              </p>
            </div>
          </>
        )}

        <Link href="/dashboard" style={{
          display: 'block', padding: '13px 32px',
          background: AMBER, color: NAVY, borderRadius: '8px',
          fontSize: '14px', fontWeight: 700, letterSpacing: '1.5px',
          textTransform: 'uppercase', textDecoration: 'none', marginBottom: '12px',
        }}>
          {t('common.backToDashboard')}
        </Link>
        <p style={{ fontSize: '13px', color: '#56647d', margin: 0 }}>
          {t('booking.success.redirecting', { n: countdown })}
        </p>
      </div>
    </div>
  )

  return (
    <div style={{ fontFamily: FONT_BODY, ...PAGE_BG, minHeight: '100vh', color: '#16294a' }}>
      <div style={{ maxWidth: '800px', margin: '0 auto', padding: 'clamp(24px,4vw,40px) clamp(20px,5vw,48px) 0' }}>
        {/* The page's own heading and the way back, where 我的帳戶 and 共同預約
            put theirs -- the dark strip that used to hold them read as a second
            masthead under the floating nav. */}
        <Link href="/dashboard" style={{ fontSize: '13.5px', fontWeight: 700, color: GOLD, textDecoration: 'none' }}>
          ← {t('booking.header.dashboard')}
        </Link>
        <h1 style={{ fontFamily: FONT_DISPLAY, fontSize: 'clamp(28px,3vw,36px)', fontWeight: 900, color: NAVY, margin: '12px 0 0', lineHeight: 1.15 }}>
          {isReschedule ? t('booking.header.reschedule') : makeUp ? t('booking.header.makeUp') : t('booking.header.book')}
        </h1>
      </div>

      <div style={{ maxWidth: '800px', margin: '0 auto', padding: '24px clamp(20px,5vw,48px) clamp(24px,4vw,48px)' }}>

        {isReschedule && (
          <div style={{ marginBottom: '20px', padding: '14px 18px', background: '#eef4fc', border: '1px solid #c9d8ee', borderRadius: '10px', fontSize: '14px', color: GOLD, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>📅</span> {t('booking.rescheduleBanner')}
          </div>
        )}
        {makeUp && (
          <div style={{ marginBottom: '20px', padding: '14px 18px', background: '#e6f4ee', border: '1px solid #b7e0cc', borderRadius: '10px', fontSize: '14px', color: '#1f7a57', lineHeight: 1.6 }}>
            🎟 {t(makeUp.usableFrom && makeUp.usableFrom > localDs(today) ? 'booking.makeUp.bannerWindow' : 'booking.makeUp.banner', {
              names: makeUp.studentNames.join(' & '),
              kind: t('voucher.kind.' + makeUp.courseSlug + (makeUp.courseSlug === '1on1' ? '.' + (makeUp.minutes === 60 ? 60 : 30) : '')),
              date: new Date(makeUp.expiresOn + 'T12:00:00Z').toLocaleDateString(locale === 'en' ? 'en-US' : locale, { month: 'short', day: 'numeric', timeZone: 'UTC' }),
              from: makeUp.usableFrom ? new Date(makeUp.usableFrom + 'T12:00:00Z').toLocaleDateString(locale === 'en' ? 'en-US' : locale, { month: 'short', day: 'numeric', timeZone: 'UTC' }) : '',
            })}
          </div>
        )}

        {lockedStudent && selectedStudent && !makeUp && (
          <div style={{ marginBottom: '20px', padding: '14px 18px', background: '#eef4fc', border: '1px solid #c9d8ee', borderRadius: '10px', fontSize: '14px', color: GOLD, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
            <span>📌 {t('booking.lockedFor')}<strong style={{ color: '#16294a' }}>{selectedStudent.full_name}</strong>{trialHasCredit ? t('booking.assessmentPrepaid') : ''}</span>
            <button onClick={() => { setLockedStudent(false); setSelectedStudent(null); setIsTrial(false); setSelectedCourse(null); setStep(0) }}
              style={{ background: 'none', border: 'none', padding: 0, color: '#56647d', fontSize: '13px', cursor: 'pointer', textDecoration: 'underline' }}>
              {t('booking.changeStudent', { name: selectedStudent.full_name.split(' ')[0] })}
            </button>
          </div>
        )}

        {step > 0 && selectedStudent && (
          <div style={{ marginBottom: '28px' }}>
            <DoneRow label={t('booking.sum.swimmer')} changeLabel={t('booking.change')}
              value={selectedStudent.full_name + (step > 1 && selectedCourse?.slug === '1on2' && selectedStudent2 ? ` ＋ ${selectedStudent2.full_name}` : '')}
              onChange={isReschedule || makeUp || students.length <= 1 ? undefined : changeStudent} />
            {step > 1 && selectedCourse && (
              <DoneRow label={t('booking.sum.course')} changeLabel={t('booking.change')}
                value={isTrial ? t('common.assessment') : tDb(locale, 'course_types', selectedCourse.id, selectedCourse.name)}
                onChange={isReschedule || makeUp ? undefined : () => { clearTime(); setStep(1) }} />
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
                      background: NAVY, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontFamily: FONT_DISPLAY, fontSize: '16px', fontWeight: 900, color: '#fff',
                    }}>
                      {s.full_name.split(' ').map((n: string) => n[0]).join('').slice(0, 2)}
                    </div>
                    <div>
                      <div style={{ fontSize: '16px', fontWeight: 700, color: '#16294a' }}>{s.full_name}</div>
                      <div style={{ fontSize: '13px', color: '#56647d' }}>
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
              {(trialEligible || trialHasCredit) && !isReschedule && !makeUp && (
                <SelectCard selected={isTrial} onClick={() => { const ct = courseTypes.find(c => c.slug === '1on1'); if (ct) { requestAdvance(); setSelectedCourse(ct); setIsTrial(true) } }} color={GOLD}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                      <span style={{ fontSize: '28px' }}>⭐</span>
                      <div>
                        <div style={{ fontSize: '16px', fontWeight: 700, color: '#16294a', marginBottom: '2px' }}>{t('common.assessment')}</div>
                        <div style={{ fontSize: '13px', color: '#56647d' }}>{t('booking.assessmentMeta')}</div>
                      </div>
                    </div>
                    <div style={{ background: `${GOLD}20`, border: `1px solid ${GOLD}40`, borderRadius: '20px', padding: '4px 12px', fontSize: '13px', fontWeight: 700, color: GOLD }}>{trialHasCredit ? t('booking.prepaid') : '$' + TRIAL_PRICE_CENTS / 100}</div>
                  </div>
                </SelectCard>
              )}
              {/* A make-up voucher books only its own kind of lesson (owner,
                  2026-10-03): a 1-on-4 voucher never offers 1-on-1 or 1-on-2. */}
              {courseTypes.filter(ct => ct.slug !== 'team' && (!makeUp || ct.slug === makeUp.courseSlug)).map(ct => {
                const color = COURSE_COLORS[ct.slug] || GOLD
                const listed = listPrice(ct.slug)
                const full = BASE_POINTS[ct.slug] ?? 0
                // Before the assessment these cards cannot be chosen. They
                // still show, so the family sees what comes next, but dimmed
                // and labelled -- full colour and a price read as a card that
                // was broken when a tap did nothing.
                return (
                  <div key={ct.id} aria-disabled={needsAssessment || undefined}
                    style={needsAssessment ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}>
                  <SelectCard selected={!isTrial && selectedCourse?.id === ct.id} onClick={() => { if (needsAssessment) return; requestAdvance(); setSelectedCourse(ct); setIsTrial(false) }} color={color}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                        <span style={{ fontSize: '28px' }}>{COURSE_ICONS[ct.slug]}</span>
                        <div>
                          <div style={{ fontSize: '16px', fontWeight: 700, color: '#16294a', marginBottom: '2px' }}>{tDb(locale, 'course_types', ct.id, ct.name)}</div>
                          <div style={{ fontSize: '13px', color: '#56647d' }}>
                            {t(ct.max_students > 1 ? 'booking.courseMeta' : 'booking.courseMetaOne', { n: ct.duration_minutes, max: ct.max_students })}
                          </div>
                          {needsAssessment && (
                            <div style={{ marginTop: '5px', fontSize: '12px', fontWeight: 700, color: '#9a5b00' }}>{t('booking.afterAssessment')}</div>
                          )}
                          {ct.slug === '1on4' && myGroupBand && (
                            <div style={{ marginTop: '5px', display: 'inline-block', padding: '2px 9px', borderRadius: '10px', fontSize: '12px', fontWeight: 700, color: myBandColor, background: myBandColor + '1f', border: `1px solid ${myBandColor}44` }}>
                              {t('booking.yourClass', { r: bandRange(myGroupBand.min, myGroupBand.max) })}
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
                          display: 'inline-block',
                          background: `${color}20`, border: `1px solid ${color}40`,
                          borderRadius: '20px', padding: '4px 12px',
                          fontSize: '13px', fontWeight: 700, color, whiteSpace: 'nowrap',
                          fontVariantNumeric: 'tabular-nums',
                        }}>
                          {listed < full && (
                            <span style={{ textDecoration: 'line-through', color: '#56647d', marginRight: '5px', fontWeight: 500 }}>{full}</span>
                          )}
                          {t('points.unit', { n: listed })}
                        </div>
                        <div style={{ fontSize: '12px', color: '#56647d', marginTop: '4px' }}>{t('booking.perSwimmer')}</div>
                      </div>
                    </div>
                  </SelectCard>
                  </div>
                )
              })}
            </div>

            {selectedCourse && !canAffordCourse && (
              <div style={{
                marginTop: '16px', padding: '14px 18px',
                background: '#fdecea', border: '1px solid #f5c2bd',
                borderRadius: '10px', fontSize: '14px', color: '#c0392b',
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
                <div style={{ fontSize: '13px', fontWeight: 700, color: '#56647d', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: '12px' }}>
                  👥 {t('booking.select2nd')}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {students.filter(s => s.id !== selectedStudent?.id).map(s => (
                    <SelectCard key={s.id} selected={selectedStudent2?.id === s.id} onClick={() => { if (s.current_level == null) return; requestAdvance(); setSelectedStudent2(s) }} color="#4a90c4">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: '#4a90c4', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', fontWeight: 900, color: '#16294a', fontFamily: FONT_DISPLAY, flexShrink: 0 }}>
                          {s.full_name.split(' ').map((n: string) => n[0]).join('').slice(0, 2)}
                        </div>
                        <div>
                          <div style={{ fontSize: '15px', fontWeight: 700, color: '#16294a' }}>{s.full_name}</div>
                          <div style={{ fontSize: '12px', color: s.current_level ? '#56647d' : '#9a5b00' }}>{s.current_level ? t('booking.sameAccount', { n: s.current_level }) : t('booking.needsAssessmentFirst')}</div>
                        </div>
                      </div>
                    </SelectCard>
                  ))}
                  {partnerStudents.map(s => (
                    <SelectCard key={s.id} selected={selectedStudent2?.id === s.id} onClick={() => { if (s.current_level == null) return; requestAdvance(); setSelectedStudent2(s) }} color="#4a90c4">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: '#7b61c4', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', fontWeight: 900, color: '#fff', fontFamily: FONT_DISPLAY, flexShrink: 0 }}>
                          {s.full_name.split(' ').map((n: string) => n[0]).join('').slice(0, 2)}
                        </div>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <div style={{ fontSize: '15px', fontWeight: 700, color: '#16294a' }}>{s.full_name}</div>
                            <span style={{ fontSize: '11.5px', background: '#f1edfb', border: '1px solid #d8cdf3', borderRadius: '4px', padding: '1px 5px', color: '#6d4fc2' }}>{t('booking.linked')}</span>
                          </div>
                          <div style={{ fontSize: '12px', color: s.current_level ? '#56647d' : '#9a5b00' }}>{s.current_level ? t('booking.partnerConfirm', { n: s.current_level }) : t('booking.needsAssessmentFirst')}</div>
                        </div>
                      </div>
                    </SelectCard>
                  ))}
                  {students.filter(s => s.id !== selectedStudent?.id).length === 0 && partnerStudents.length === 0 && (
                    <div style={{ padding: '16px', background: '#f6f9fd', borderRadius: '10px', fontSize: '14px', color: '#56647d', textAlign: 'center' }}>
                      {t('booking.noOtherStudents')}
                    </div>
                  )}
                </div>
                {selectedStudent2 && !(selectedStudent2 as any).isPartner && balance < cheapestFor('1on2', 2, isHourLesson ? 60 : 30) && (
                  <div style={{ marginTop: '10px', padding: '10px 14px', background: '#fdecea', border: '1px solid #f5c2bd', borderRadius: '8px', fontSize: '13px', color: '#c0392b' }}>
                    ⚠️ {t('booking.short.twoSeats', { have: balance, need: cheapestFor('1on2', 2, isHourLesson ? 60 : 30) })}
                    <div><BuyPointsLink label={t('booking.short.cta')} /></div>
                  </div>
                )}
                {selectedStudent2 && (selectedStudent2 as any).isPartner && (
                  <div style={{ marginTop: '10px', padding: '10px 14px', background: '#f1edfb', border: '1px solid #d8cdf3', borderRadius: '8px', fontSize: '13px', color: '#6d4fc2' }}>
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
            {/* Drawn at once, with only 不限教練 until the coaches arrive: the row
                used to appear a beat after the calendar and push it down under
                the visitor's finger. */}
            {privateFlow && (!openings || openings.coaches.length > 1) && (
              <div style={{ marginBottom: '16px' }}>
                <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '4px' }}>
                  {[{ id: 'any', first_name: t('booking.anyCoach') }, ...(openings?.coaches || [])].map(c => {
                    const on = coachFilter === c.id
                    return (
                      <button key={c.id} onClick={() => pickFilter(c.id)}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', flexShrink: 0, minHeight: '44px',
                          padding: c.id === 'any' ? '0 18px' : '0 16px 0 8px', borderRadius: '999px', cursor: 'pointer',
                          border: `1.5px solid ${on ? NAVY : '#d3deec'}`, background: on ? NAVY : '#fff',
                          color: on ? '#fff' : '#16294a', fontSize: '14px', fontWeight: 700 }}>
                        {c.id !== 'any' && <Face id={c.id} size={28} />}
                        {c.first_name}
                      </button>
                    )
                  })}
                </div>
                <div style={{ fontSize: '13px', color: '#56647d', marginTop: '6px', lineHeight: 1.5 }}>
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
              style={{ background: '#fff', borderRadius: '16px', padding: isPhone ? '14px 12px' : '24px', marginBottom: '20px', border: '1px solid #e3ebf6', overflow: 'hidden', touchAction: 'pan-y' }}>
              <style>{`@keyframes msaCalL { from { opacity: 0; transform: translateX(28px) } to { opacity: 1; transform: none } }
                @keyframes msaCalR { from { opacity: 0; transform: translateX(-28px) } to { opacity: 1; transform: none } }
                @media (prefers-reduced-motion: reduce) { .msa-cal-anim { animation: none !important } }`}</style>
              {voucherRange ? (
                <div style={{ textAlign: 'center', marginBottom: '16px', fontSize: '16px', fontWeight: 700, color: '#16294a' }}>
                  {t('booking.makeUp.range', {
                    from: voucherRange.from.toLocaleDateString(dateLoc, { month: 'short', day: 'numeric' }),
                    to: voucherRange.to.toLocaleDateString(dateLoc, { month: 'short', day: 'numeric' }),
                  })}
                </div>
              ) : (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
                <button onClick={() => shiftMonth(-1)} disabled={!canPrevMonth}
                  aria-label={t('booking.cal.prevMonth')} style={{ background: 'transparent', border: 'none', color: canPrevMonth ? '#56647d' : '#9aa6ba', fontSize: '22px', cursor: canPrevMonth ? 'pointer' : 'default', minWidth: '44px', minHeight: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>‹</button>
                <span style={{ fontSize: '16px', fontWeight: 700, color: '#16294a' }}>{t('booking.calMonth', { month: t('date.month.' + (calMonth + 1)), year: calYear })}</span>
                <button onClick={() => shiftMonth(1)} disabled={!canNextMonth}
                  aria-label={t('booking.cal.nextMonth')} style={{ background: 'transparent', border: 'none', color: canNextMonth ? '#56647d' : '#9aa6ba', fontSize: '22px', cursor: canNextMonth ? 'pointer' : 'default', minWidth: '44px', minHeight: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>›</button>
              </div>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: '4px', marginBottom: '8px' }}>
                {[0, 1, 2, 3, 4, 5, 6].map(d => (
                  <div key={d} style={{ textAlign: 'center', fontSize: '13px', fontWeight: 600, color: '#56647d', padding: '4px 0' }}>{t('date.weekdayShort.' + d)}</div>
                ))}
              </div>
              <div key={`${calYear}-${calMonth}`} className="msa-cal-anim" style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: '4px', animation: calSlide ? `${calSlide === 'l' ? 'msaCalL' : 'msaCalR'} .28s ease` : undefined }}>
                {/* In the current month the weeks already gone are left out: the
                    grid starts on the Sunday of this week, as the group calendar does. */}
                {calCells.map((date, j) => {
                  if (!date) return <div key={`e-${j}`} />
                  const i = date.getDate() - 1
                  const dsC = localDs(date)
                  // In a voucher's run of days the month is named where it
                  // starts, and on the first day shown.
                  const monthTag = !!voucherRange && (i === 0 || calCells.findIndex(c => c) === j)
                  const openHere = privateFlow && openings && lessonLength === 30 ? coachesOn(dsC) : null
                  const dotsHere = openHere ?? (privateFlow && openings && lessonLength === 60 ? coachesOnForHour(dsC) : null)
                  // A voucher's calendar shows only days with a time it can book,
                  // so a 60-minute make-up also needs a free hour that day.
                  const available = isDateAvailable(date) && (openHere == null || openHere.length > 0)
                    && !(makeUp && dotsHere != null && dotsHere.length === 0)
                  const isSelected = selectedDate?.toDateString() === date.toDateString()
                  const isTodayDate = date.toDateString() === today.toDateString()
                  // This calendar has no per-slot cells to mark, so the day itself
                  // carries the state: solid gold once a lesson on it is chosen,
                  // dashed while the repeat shortcut is only proposing one. Without
                  // this the shortcut's own hint pointed at cells that do not exist
                  // here, and a paged calendar gave no sign which days were already
                  // in the basket.
                  const dsX = localDs(date)
                  const hasPick = batchFlow && [...recurSel.keys()].some(k => k.startsWith(dsX + '|'))
                  const hasGhost = batchFlow && !hasPick && [...ghost.keys()].some(k => k.startsWith(dsX + '|'))
                  return (
                    <button key={dsC}
                      onClick={() => {
                        // Re-clicking the day already open would clear its times and never refetch them.
                        if (!available || (selectedDate && selectedDate.getTime() === date.getTime())) return
                        setSelectedDate(date); setSelectedSlot(null); setTimeSlots([]); setSlotsLoading(true)
                      }}
                      style={{
                        // A voucher's calendar shows only the days it can use (owner, 2026-10-03).
                        visibility: makeUp && !available ? 'hidden' : undefined,
                        padding: '10px 4px', minHeight: '48px', borderRadius: '10px',
                        border: hasPick ? `2px solid ${GOLD}` : hasGhost ? `2px dashed ${GOLD}99` : '2px solid transparent',
                        background: isSelected ? NAVY : hasPick ? `${GOLD}20` : 'transparent',
                        color: isSelected ? '#fff' : hasPick ? GOLD : available ? NAVY : '#b7c2d4',
                        fontSize: '16px', fontWeight: isSelected || hasPick ? 700 : 500,
                        cursor: available ? 'pointer' : 'not-allowed',
                        outline: isTodayDate && !isSelected && !hasPick && !hasGhost ? `1.5px solid ${GOLD}` : 'none', outlineOffset: '-1.5px',
                      }}
                    >{monthTag && <span style={{ display: 'block', fontSize: '10px', fontWeight: 800, lineHeight: 1.2, color: isSelected ? '#fff' : GOLD }}>{date.toLocaleDateString(dateLoc, { month: 'short' })}</span>}<span>{i + 1}</span>{dotsHere && dotsHere.length > 0 && isDateAvailable(date) && !isSelected && (
                      <span style={{ display: 'flex', justifyContent: 'center', gap: '2px', marginTop: '2px' }}>
                        {dotsHere.slice(0, 4).map(id => <span key={id} style={{ width: '4px', height: '4px', borderRadius: '50%', background: coachColor(id) }} />)}
                      </span>
                    )}{groupFlow && groupDates.includes(localDs(date)) && !isSelected && (
                      <span style={{ display: 'block', width: '4px', height: '4px', borderRadius: '50%', margin: '2px auto 0', backgroundColor: myBandColor }} />
                    )}</button>
                  )
                })}
              </div>
              {voucherMonthEmpty() && (
                <p style={{ margin: '14px 0 0', textAlign: 'center', fontSize: '13px', color: '#56647d' }}>{t('booking.makeUp.noDays')}</p>
              )}
            </div>}

            {/* Only while the picked day is in the month on screen. Paging to
                the next month used to leave last month's day and its times
                underneath, reading as if they belonged to the new month. */}
            {!groupFlow && selectedDate && (voucherRange || (selectedDate.getFullYear() === calYear && selectedDate.getMonth() === calMonth)) && (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap', marginBottom: '12px' }}>
                  <div style={{ fontSize: '14px', fontWeight: 600, color: '#56647d' }}>
                    {t('booking.availableTimes', { date: selectedDate.toLocaleDateString(dateLoc, { weekday: 'long', month: 'short', day: 'numeric' }) })}
                  </div>
                  {/* The Swim Assessment is 30 minutes, full stop. It rides on the
                      1-on-1 course type, which is why it used to get this switch. */}
                  {!isTrial && !makeUp && (selectedCourse?.slug === '1on1'
                    || (selectedCourse?.slug === '1on2' && !!selectedStudent2)) && (
                    <div style={{ display: 'inline-flex', border: '1px solid #e3ebf6', borderRadius: '8px', overflow: 'hidden' }}>
                      {([30, 60] as const).map(v => (
                        <button key={v} disabled={recurSel.size > 0 && lessonLength !== v}
                          title={recurSel.size > 0 && lessonLength !== v ? t('booking.lenLocked') : undefined}
                          onClick={() => { setLessonLength(v); setSelectedSlot(null); setSelectedHour(null); setRecurOpen(false) }}
                          style={{ padding: '6px 14px', fontSize: '13px', fontWeight: 700, border: 'none', cursor: 'pointer',
                            background: lessonLength === v ? NAVY : '#fff', color: lessonLength === v ? '#fff' : '#56647d' }}>
                          {t('booking.lenMin', { n: v })}</button>
                      ))}
                    </div>
                  )}
                </div>
                {lessonLength === 60 && (() => {
                  const rows = hourSlots
                    .map((h: any) => ({ ...h, opts: (h.options || []).filter((o: any) => coachFilter === 'any' || o.coach1_id === coachFilter)
                      // Same order as the coach chips and the 30-minute faces.
                      .sort((a: any, b: any) => coachRank(a.coach1_id) - coachRank(b.coach1_id)) }))
                    .filter((h: any) => h.opts.length > 0)
                    .map((h: any) => ({ ...h, pick: h.opts.find((o: any) => !o.relay && o.coach1_id === openings?.preferred) || h.opts.find((o: any) => !o.relay) || h.opts[0] }))
                  // The server prices every hour slot and sends the figure with
                  // it, so nothing here has to guess. The cheapest one on offer
                  // decides whether the family can book an hour at all; when
                  // they cannot, saying so beats a wall of grey buttons.
                  const cheapest = rows.length ? Math.min(...rows.map((h: any) => Number(h.points) || 0)) : 0
                  const canAffordHour = isReschedule || !!makeUp || (rows.length > 0 && (hourCovered || hourBalance >= cheapest))
                  return (
                    <div style={{ marginBottom: '16px' }}>
                      {/* A voucher pays for the make-up, so the points line would only
                          make the family think points are taken (owner, 2026-10-03). */}
                      {!makeUp && (
                        <div style={{ fontSize: '13px', color: '#56647d', marginBottom: '10px' }}>
                          {t('booking.hour.cost')} · {t('booking.balance', { n: hourBalance })}
                        </div>
                      )}
                      {!hourLoading && rows.length > 0 && !canAffordHour && (
                        <div style={{ background: '#eef4fc', border: '1px solid #c9d8ee', borderRadius: '10px', padding: '14px 16px', marginBottom: '12px' }}>
                          <div style={{ fontSize: '14px', fontWeight: 700, color: GOLD, marginBottom: '4px' }}>{t('booking.short.title')}</div>
                          <div style={{ fontSize: '13px', color: '#56647d', lineHeight: 1.5 }}>
                            {t('booking.short.body', { have: hourBalance, need: cheapest })}
                          </div>
                          <BuyPointsLink label={t('booking.short.cta')} />
                        </div>
                      )}
                      {hourLoading ? (
                        <p style={{ color: '#56647d', fontSize: '15px' }}>{t('booking.hourLoading')}</p>
                      ) : rows.length === 0 ? (
                        <div style={{ background: '#fff', borderRadius: '12px', padding: '20px', textAlign: 'center', border: '1px dashed #e3ebf6' }}>
                          <p style={{ color: '#56647d', fontSize: '14px', margin: 0 }}>{t('booking.noHourOptions')}</p>
                        </div>
                      ) : (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: '8px' }}>
                          {rows.map((h: any) => {
                            const o = h.pick
                            const sel = selectedHour?.start_time === h.start_time
                            const affordable = isReschedule || !!makeUp || hourCovered || hourBalance >= (Number(h.points) || 0)
                            const usable = affordable && !h.is_current
                            const w24 = isWithin24Hours(localDs(selectedDate), h.start_time)
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
                                  border: `2px solid ${sel ? GOLD : usable ? '#e3ebf6' : '#e3ebf6'}`,
                                  background: sel ? `${GOLD}20` : usable ? '#fff' : '#f6f9fd',
                                  color: sel ? GOLD : usable ? '#16294a' : '#9aa6ba',
                                  fontSize: '14px', fontWeight: 600, cursor: usable ? 'pointer' : 'not-allowed',
                                }}>
                                {h.is_current && (
                                  <div style={{ fontSize: '11.5px', fontWeight: 700, color: GOLD, letterSpacing: '0.06em', marginBottom: '2px' }}>{t('booking.currentTime')}</div>
                                )}
                                {/* Start time only, as the 30-minute grid shows it.
                                    The end time is in the summary once one is picked. */}
                                {formatTime(h.start_time)}
                                {!isReschedule && !makeUp && h.points != null && (
                                  <span style={{ display: 'block', fontSize: '12px', marginTop: '3px', fontVariantNumeric: 'tabular-nums', color: usable ? GOLD : '#9aa6ba' }}>
                                    {t('points.unit', { n: h.points })}
                                  </span>
                                )}
                                {h.off_peak && (
                                  <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.1em', color: '#56647d', marginTop: '3px' }}>{t('booking.offPeak')}</div>
                                )}
                                {!isTrial && usable && w24 && (
                                  <div style={{ fontSize: '11.5px', color: GOLD, marginTop: '2px', fontWeight: 700 }}>24h</div>
                                )}
                                {isReschedule && (
                                  <div style={{ fontSize: '11.5px', color: '#56647d', marginTop: '2px', fontWeight: 700 }}>{t('booking.noExtraCharge')}</div>
                                )}
                                {/* Every coach who can teach the whole hour, not only
                                    the one pre-picked -- the same faces the 30-minute
                                    grid shows. The coach is chosen below once a time is. */}
                                <div style={{ display: 'flex', justifyContent: 'center', gap: '3px', marginTop: '6px' }}>
                                  {h.opts.map((x: any) => <Face key={x.coach1_id} id={x.coach1_id} size={22} />)}
                                </div>
                              </button>
                            )
                          })}
                        </div>
                      )}
                      {(() => {
                        const cur = selectedHour ? rows.find((h: any) => h.start_time === selectedHour.start_time) : null
                        if (!cur || coachFilter !== 'any') return null
                        return (
                          <div style={{ marginTop: '12px', background: '#fff', border: `1px solid ${GOLD}66`, borderRadius: '12px', padding: '12px 14px' }}>
                            <div style={{ fontSize: '13.5px', color: '#56647d', marginBottom: '10px' }}>
                              {t('booking.coachesAt', { time: formatTime(cur.start_time) })}
                            </div>
                            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                              {cur.opts.map((x: any) => {
                                const on = selectedHour?.coach1_id === x.coach1_id
                                return (
                                  <button key={x.coach1_id}
                                    onClick={() => {
                                      if (on) return
                                      const c1 = coaches.find(c => c.id === x.coach1_id)
                                      if (c1) setSelectedCoach(c1)
                                      setSelectedHour({ ...cur, ...x })
                                    }}
                                    style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', minHeight: '40px', padding: '0 14px 0 6px', borderRadius: '999px', cursor: on ? 'default' : 'pointer',
                                      border: `1.5px solid ${on ? GOLD : '#e3ebf6'}`, background: on ? `${GOLD}20` : 'transparent',
                                      color: on ? '#16294a' : '#56647d', fontSize: '14px', fontWeight: 700 }}>
                                    <Face id={x.coach1_id} size={26} />{coachName(x.coach1_id)}
                                  </button>
                                )
                              })}
                            </div>
                            {selectedCoach && (
                              <div style={{ fontSize: '13px', color: '#56647d', marginTop: '10px' }}>
                                {t('booking.coachPicked', { name: selectedCoach.first_name })}
                              </div>
                            )}
                          </div>
                        )
                      })()}
                    </div>
                  )
                })()}
                {!isTrial && (privateFlow && openings && coachFilter === 'any'
                  ? lessonLength === 30 && Object.keys(openings.days[localDs(selectedDate)] || {}).some(tm => isWithin24Hours(localDs(selectedDate), tm))
                  : timeSlots.some(sl => sl.available && sl.within24h)) && (
                  <div style={{ background: '#eef4fc', border: '1px solid #c9d8ee', borderRadius: '10px', padding: '14px 16px', marginBottom: '16px', display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                    <span style={{ fontSize: '16px' }}>⚠️</span>
                    <div>
                      <div style={{ fontSize: '14px', fontWeight: 700, color: GOLD, marginBottom: '4px' }}>{t('booking.within24.title')}</div>
                      <div style={{ fontSize: '13px', color: '#56647d', lineHeight: 1.5 }}>{t('booking.within24.body')}</div>
                    </div>
                  </div>
                )}
                {groupFlow ? (
                  groupLoading ? (
                    <p style={{ color: '#56647d', fontSize: '15px' }}>{t('booking.groupLoading')}</p>
                  ) : (() => {
                    const ds2 = localDs(selectedDate)
                    const visible = groupClasses.filter((gc: any) => meetsLeadTime(ds2, gc.time))
                    if (visible.length === 0) return (
                      <div style={{ background: '#fff', borderRadius: '12px', padding: '24px', textAlign: 'center', border: '1px dashed #e3ebf6' }}>
                        <p style={{ color: '#56647d', fontSize: '15px' }}>
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
                                border: `2px solid ${sel ? GOLD : clickable ? myBandColor + '55' : '#e3ebf6'}`,
                                background: sel ? `${GOLD}20` : clickable ? myBandColor + '18' : '#f6f9fd',
                              }}>
                              <span>
                                <span style={{ display: 'block', fontSize: '15px', fontWeight: 700, color: sel ? GOLD : clickable ? '#16294a' : '#56647d' }}>
                                  {formatTime(gc.time)} – {formatTime(gc.end_time)}
                                </span>
                                <span style={{ display: 'block', fontSize: '13px', color: clickable ? '#56647d' : '#9aa6ba', marginTop: '2px' }}>
                                  {t('booking.group.coachBand', { name: gc.coach_name, min: myGroupBand?.min ?? '', max: myGroupBand?.max ?? '' })}
                                </span>
                              </span>
                              <span style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                                {!isReschedule && (() => { const pr = priceAt(ds2, gc.time, 30); return pr ? (
                                  <span style={{ textAlign: 'right' }}>
                                    <PriceTag price={pr} dim={!clickable} />
                                    {pr.offPeak && <span style={{ display: 'block', fontSize: '11px', fontWeight: 700, letterSpacing: '0.1em', color: '#56647d' }}>{t('booking.offPeak')}</span>}
                                  </span>
                                ) : null })()}
                                {w24 && clickable && <span style={{ fontSize: '11.5px', fontWeight: 700, color: GOLD }}>24h</span>}
                                <span style={{ fontSize: '12px', fontWeight: 700, padding: '3px 10px', borderRadius: '12px',
                                  color: gc.already_booked ? '#56647d' : gc.full ? '#56647d' : myBandColor,
                                  background: gc.already_booked || gc.full ? '#f6f9fd' : myBandColor + '22' }}>
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
                  const ds0 = localDs(selectedDate)
                  const day = openings.days[ds0] || {}
                  const times = Object.keys(day).sort()
                  if (times.length === 0) return (
                    <div style={{ background: '#fff', borderRadius: '12px', padding: '24px', textAlign: 'center', border: '1px dashed #e3ebf6' }}>
                      <p style={{ color: '#56647d', fontSize: '15px' }}>{t('booking.noSlots')}</p>
                    </div>
                  )
                  const curKey = selectedSlot ? `${ds0}|${selectedSlot.time}` : ''
                  const curIds = selectedSlot ? (day[selectedSlot.time] || []) : []
                  const curShown = !!selectedSlot && curIds.length > 0 && (!batchFlow || recurSel.has(curKey))
                  return (
                    <>
                      {batchFlow && (
                        <div style={{ fontSize: '13px', color: '#56647d', marginBottom: '8px' }}>{t('booking.oneADay')}</div>
                      )}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: '8px' }}>
                        {times.map(tm => {
                          const ids = day[tm]
                          const key0 = `${ds0}|${tm}`
                          const inBasket = batchFlow && recurSel.has(key0)
                          const on = inBasket || (!batchFlow && selectedSlot?.time === tm)
                          const pr = (isReschedule || isTrial) ? null : priceAt(ds0, tm, 30)
                          const cost0 = pr?.charged ?? 0
                          const affordable0 = !batchFlow || inBasket
                            || dueOf([...recurSel.values()].filter(x => x.date !== ds0).concat({ date: ds0, time: tm, label: '', points: cost0, coachId: '' }), 30) <= balance
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
                                border: `2px ${batchFlow && !affordable0 ? 'dashed' : 'solid'} ${on ? GOLD : affordable0 ? '#e3ebf6' : '#e3ebf6'}`,
                                background: on ? `${GOLD}20` : affordable0 ? '#fff' : '#f6f9fd',
                                color: on ? GOLD : affordable0 ? '#16294a' : '#9aa6ba',
                                fontSize: '14px', fontWeight: 600, cursor: affordable0 ? 'pointer' : 'not-allowed',
                              }}>
                              {inBasket ? '✓ ' : ''}{formatTime(tm)}
                              {pr && <PriceTag price={pr} dim={!affordable0} />}
                              {pr?.offPeak && (
                                <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.1em', color: '#56647d', marginTop: '3px' }}>{t('booking.offPeak')}</div>
                              )}
                              {!isTrial && w24 && <div style={{ fontSize: '11.5px', color: GOLD, marginTop: '2px', fontWeight: 700 }}>24h</div>}
                              <div style={{ display: 'flex', justifyContent: 'center', gap: '3px', marginTop: '6px' }}>
                                {(chosenCoach ? [chosenCoach] : ids).map(id => <Face key={id} id={id} size={22} />)}
                              </div>
                            </button>
                          )
                        })}
                      </div>
                      {curShown && (
                        <div style={{ marginTop: '12px', background: '#fff', border: `1px solid ${GOLD}66`, borderRadius: '12px', padding: '12px 14px' }}>
                          <div style={{ fontSize: '13.5px', color: '#56647d', marginBottom: '10px' }}>
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
                                    border: `1.5px solid ${on ? GOLD : '#e3ebf6'}`, background: on ? `${GOLD}20` : 'transparent',
                                    color: on ? '#16294a' : '#56647d', fontSize: '14px', fontWeight: 700 }}>
                                  <Face id={id} size={26} />{coachName(id)}
                                </button>
                              )
                            })}
                          </div>
                          {selectedCoach && (
                            <div style={{ fontSize: '13px', color: '#56647d', marginTop: '10px' }}>
                              {t('booking.coachPicked', { name: selectedCoach.first_name })}
                            </div>
                          )}
                        </div>
                      )}
                    </>
                  )
                })()) : shownTimeSlots.length === 0 ? (
                  <div style={{ background: '#fff', borderRadius: '12px', padding: '24px', textAlign: 'center', border: '1px dashed #e3ebf6' }}>
                    <p style={{ color: '#56647d', fontSize: '15px' }}>{slotsLoading ? t('booking.loading') : t('booking.noSlots')}</p>
                  </div>
                ) : (
                  <>
                  {batchFlow && (
                    <div style={{ fontSize: '13px', color: '#56647d', marginBottom: '8px' }}>{t('booking.oneADay')}</div>
                  )}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: '8px' }}>
                    {(lessonLength === 60 ? [] : shownTimeSlots).map(slot => {
                      const ds0 = selectedDate ? localDs(selectedDate) : ''
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
                      const affordable0 = !batchFlow || inBasket
                        || dueOf([...recurSel.values()].filter(x => x.date !== ds0).concat({ date: ds0, time: slot.time, label: '', points: cost0, coachId: '' }), 30) <= balance
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
                          border: `2px ${batchFlow && !affordable0 && !inBasket && slot.available ? 'dashed' : 'solid'} ${on ? GOLD : usable0 ? (slot.fill ? slot.fill + '55' : '#e3ebf6') : '#e3ebf6'}`,
                          background: on ? `${GOLD}20` : usable0 ? (slot.fill ? slot.fill + '22' : '#fff') : '#f6f9fd',
                          color: on ? GOLD : usable0 ? '#16294a' : '#9aa6ba',
                          fontSize: '14px', fontWeight: 600, cursor: usable0 ? 'pointer' : 'not-allowed',
                          textAlign: 'center',
                        }}
                      >
                        {inBasket ? '✓ ' : ''}{slot.label}
                        {(() => {
                          if (isReschedule || isTrial || !selectedDate) return null
                          const pr = priceAt(localDs(selectedDate), slot.time, 30)
                          if (!pr) return null
                          return (
                            <>
                              <PriceTag price={pr} dim={!slot.available} />
                              {pr.offPeak && (
                                <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.1em', color: slot.available ? '#56647d' : '#9aa6ba', marginTop: '3px' }}>{t('booking.offPeak')}</div>
                              )}
                            </>
                          )
                        })()}
                        {!isTrial && slot.available && slot.within24h && (
                          <div style={{ fontSize: '11.5px', color: GOLD, marginTop: '2px', fontWeight: 700 }}>24h</div>
                        )}
                        {selectedCourse && (selectedCourse.slug === '1on4' || selectedCourse.slug === 'team') && (
                          <div style={{ fontSize: '11.5px', color: '#56647d', marginTop: '2px' }}>{t('booking.spotsLeft', { n: slot.max - slot.enrolled })}</div>
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
              const todayDs = localDs(today)
              return (
                <div>
                  {/* One continuous run of weeks, starting with the week we are in.
                      Past weeks are gone, and a new month does not start a new
                      grid -- it just carries on in the same rows, with the 1st of
                      the month labelled -- so there are no blank cells between
                      September and October. A ticked lesson in September still
                      stays in view while the family looks at October. */}
                  {(() => {
                    // With a make-up voucher the calendar covers the voucher's own
                    // dates and nothing else (owner, 2026-10-03): from the week its
                    // window opens (or this week) to the week it expires.
                    const winFrom = makeUp?.usableFrom && makeUp.usableFrom > todayDs ? new Date(makeUp.usableFrom + 'T00:00:00') : today
                    const weekStart0 = new Date(winFrom.getFullYear(), winFrom.getMonth(), winFrom.getDate() - winFrom.getDay())
                    const lastDay = makeUp ? new Date(makeUp.expiresOn + 'T00:00:00') : new Date(today.getFullYear(), today.getMonth() + monthsShown, 0)
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
                        <div style={{ position: 'sticky', top: 'var(--nav-cover, 64px)', transition: 'top .28s ease', zIndex: 3, background: PAGE_TINT, padding: '10px 0 6px', marginBottom: '4px', borderBottom: '1px solid #e3ebf6', boxShadow: '0 6px 10px -6px rgba(18,37,74,0.18)' }}>
                          {/* The page title rides along with the weekdays, like the
                              month name above the weekday letters in a phone's
                              calendar. The dark band reaches into the left margin so
                              the month names there slide under it, not over it. */}
                          {!isPhone && <div aria-hidden style={{ position: 'absolute', top: 0, bottom: 0, left: '-120px', width: '120px', background: PAGE_TINT }} />}
                          <h2 style={{ fontFamily: FONT_DISPLAY, fontSize: 'clamp(20px,2.5vw,28px)', fontWeight: 900, color: '#16294a', margin: '0 0 14px' }}>{t('booking.s4.title')}</h2>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: '4px', position: 'relative' }}>
                          {[0, 1, 2, 3, 4, 5, 6].map(d => (
                            <div key={d} style={{ textAlign: 'center', fontSize: isPhone ? '13px' : '14px', fontWeight: 700, letterSpacing: '1px', color: d === 0 || d === 6 ? '#16294a' : '#56647d', padding: '4px 0' }}>{t('date.weekdayShort.' + d)}</div>
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
                            // A voucher shows only what it can book: no full or
                            // already-booked times, and no day outside its dates or
                            // with nothing left -- those cells are left empty, not
                            // greyed (owner, 2026-10-03). The empty cell keeps the
                            // weekday columns in line.
                            const slots = (byDate[ds] || []).filter((c: any) => meetsLeadTime(ds, c.time)
                              && (!makeUp || (!c.full && !c.already_booked)))
                            const isPast = ds < todayDs
                            const hideDay = !!makeUp && (isPast || !makeUpDateOk(ds) || slots.length === 0)
                            const isToday2 = ds === todayDs
                            const open = openDay === ds
                            const anyPicked = slots.some((sl: any) => recurSel.has(`${ds}|${sl.time}`))
                            // The phone's time panel opens under the week the day is in.
                            const endsWeek = idx % 7 === 6
                            const rowStart = idx - (idx % 7)
                            const openInThisWeek = isPhone && openDay != null
                              && days.slice(rowStart, idx + 1).some(x => localDs(x) === openDay)
                            const openSlots = openInThisWeek ? (byDate[openDay!] || []).filter((c: any) => meetsLeadTime(openDay!, c.time)
                              && (!makeUp || (!c.full && !c.already_booked))) : []
                            return (
                              <React.Fragment key={ds}>
                              <div style={{ visibility: hideDay ? 'hidden' : undefined, backgroundColor: '#fff', backgroundImage: isPast ? 'repeating-linear-gradient(135deg, rgba(18,37,74,0.05) 0px, rgba(18,37,74,0.05) 2px, transparent 2px, transparent 10px)' : 'none', border: `1px solid ${open ? GOLD : anyPicked && isPhone ? GOLD + '77' : isToday2 ? GOLD + '66' : '#e3ebf6'}`, borderRadius: isPhone ? '9px' : '10px', padding: isPhone ? '0' : '8px 6px 7px', minHeight: isPhone ? '60px' : '100px', minWidth: 0, position: 'relative', marginTop: rowEdge[row] ? `${EXTRA}px` : 0 }}>
                                {!isPhone && (idx === 0 || (edgeTop && idx % 7 === 0)) && (
                                  // On a wide screen the month sits in the margin, level with
                                  // the start of its line. A phone has no margin to spare, so
                                  // there the 1st of the month carries a small tag instead.
                                  <span style={{ position: 'absolute', right: 'calc(100% + 14px)', top: idx === 0 ? '2px' : `${lineTop(row) + 1.5 - 12}px`,
                                    lineHeight: '24px', whiteSpace: 'nowrap', fontSize: '19px', fontWeight: 800, color: GOLD }}>{monthLabel}</span>
                                )}
                                {edgeTop && <span aria-hidden style={{ position: 'absolute', top: lineAt(row), left: idx % 7 === 0 ? 0 : '-4px', right: idx % 7 === 6 ? 0 : '-4px', height: '3px', borderRadius: '2px', background: AMBER, zIndex: 1 }} />}
                                {edgeLeft && <span aria-hidden style={{ position: 'absolute', left: '-4px', top: lineAt(row), bottom: lineAt(row + 1), width: '3px', borderRadius: '2px', background: AMBER, zIndex: 1 }} />}
                                {isPhone ? (
                                  <button onClick={() => { if (slots.length === 0) return; setOpenDay(open ? null : ds) }}
                                    disabled={slots.length === 0}
                                    style={{ width: '100%', minHeight: '60px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '6px', background: 'transparent', border: 'none', borderRadius: '8px', padding: '4px 0', cursor: slots.length === 0 ? 'default' : 'pointer' }}>
                                    <span style={{ fontSize: '17px', lineHeight: 1.1, color: anyPicked ? GOLD : isToday2 ? GOLD : isPast ? '#9aa6ba' : weekend ? '#16294a' : '#56647d', fontWeight: weekend ? 800 : 600 }}>{monthTag && <span style={{ display: 'block', width: 'fit-content', margin: '0 auto 3px', fontSize: '10px', fontWeight: 800, color: NAVY, background: AMBER, borderRadius: '4px', padding: '1px 5px', lineHeight: 1.25 }}>{monthLabel}</span>}{i + 1}</span>
                                    <span style={{ display: 'flex', gap: '4px', height: '7px', alignItems: 'center' }}>
                                      {slots.map((sl: any) => {
                                        const picked = recurSel.has(`${ds}|${sl.time}`)
                                        const prop = !picked && ghost.has(`${ds}|${sl.time}`)
                                        const gone = sl.full || sl.already_booked
                                        return <span key={sl.coach_id + sl.time} style={{ width: '7px', height: '7px', borderRadius: '50%', background: picked ? AMBER : (gone || prop) ? 'transparent' : myBandColor, border: prop ? `1px solid ${GOLD}` : gone ? '1px solid #e3ebf6' : 'none' }} />
                                      })}
                                    </span>
                                  </button>
                                ) : (
                                  <>
                                    {/* Saturdays and Sundays in a lighter shade, weekdays in full
                                        white, as a phone calendar does -- the column tells you the
                                        day without a word in every cell. */}
                                    <div style={{ textAlign: 'center', fontSize: '17px', lineHeight: 1.2, fontWeight: weekend ? 800 : 600, marginBottom: '7px', color: isToday2 ? GOLD : isPast ? '#9aa6ba' : weekend ? '#16294a' : '#56647d' }}>{i + 1}</div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                                      {slots.map((sl: any) => {
                                        const w24 = isWithin24Hours(ds, sl.time)
                                        const key = `${ds}|${sl.time}`
                                        const inBasket = recurSel.has(key)
                                        const cost = priceAt(ds, sl.time, 30)?.charged ?? 0
                                        // Outside a make-up voucher's dates a cell looks as unavailable as it is.
                                        const affordable = makeUpDateOk(ds) && (inBasket || dueOf([...recurSel.values(), { date: ds, time: sl.time, label: '', points: cost, coachId: '' }], 30) <= balance)
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
                                              background: inBasket ? `${GOLD}20` : proposed ? `${GOLD}0d` : clickable ? myBandColor + '18' : '#f6f9fd',
                                              cursor: clickable ? 'pointer' : 'not-allowed',
                                            }}>
                                            {/* Each of the seven columns is about 47px on a phone, so the
                                                time and the seat count get a line each. They were side by
                                                side with no whitespace between the two spans -- which gives
                                                the browser nowhere to break, so "4 left" was painted outside
                                                the cell rather than wrapped inside it. */}
                                            <span style={{ display: 'block', fontSize: '13px', lineHeight: 1.25, fontWeight: 700, color: inBasket ? GOLD : proposed ? `${GOLD}cc` : clickable ? '#16294a' : '#56647d' }}>
                                              <span style={{ display: 'block', whiteSpace: 'nowrap' }}>{inBasket ? '✓ ' : ''}{formatTime(sl.time)}</span>
                                              <span style={{ display: 'block', fontSize: '11.5px', fontWeight: 600, marginTop: '2px', whiteSpace: 'nowrap', color: sl.already_booked ? '#56647d' : sl.full ? '#56647d' : inBasket ? GOLD : !affordable ? '#9aa6ba' : myBandColor }}>
                                                {sl.already_booked ? '✓' : sl.full ? t('booking.full') : !affordable ? (!makeUpDateOk(ds) ? t('booking.makeUp.outside') : t('booking.group.tooDear')) : t('booking.spotsLeft', { n: sl.max - sl.enrolled })}
                                              </span>
                                              {w24 && clickable ? <span style={{ display: 'block', fontSize: '11px', marginTop: '1px', color: GOLD }}>24h</span> : null}
                                            </span>
                                          </button>
                                        )
                                      })}
                                    </div>
                                  </>
                                )}
                              </div>
                              {isPhone && endsWeek && openInThisWeek && (
                                <div style={{ gridColumn: '1 / -1', background: '#fff', border: `1px solid ${GOLD}55`, borderRadius: '14px', padding: '14px 14px 12px', margin: '4px 0 6px', position: 'relative', zIndex: 2 }}>
                                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px', gap: '8px' }}>
                                    <span style={{ fontSize: '16px', fontWeight: 700, color: '#16294a' }}>
                                      {new Date(openDay! + 'T00:00:00').toLocaleDateString(dateLoc, { weekday: 'long', month: 'long', day: 'numeric' })}
                                    </span>
                                    <button onClick={() => setOpenDay(null)} style={{ background: 'none', border: 'none', padding: '8px 4px', minHeight: '40px', fontSize: '14px', color: '#56647d', cursor: 'pointer' }}>{t('common.close')}</button>
                                  </div>
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    {openSlots.map((sl: any) => {
                                      const key = `${openDay}|${sl.time}`
                                      const inBasket = recurSel.has(key)
                                      const pr = priceAt(openDay!, sl.time, 30)
                                      const cost = pr?.charged ?? 0
                                      const affordable = makeUpDateOk(openDay!) && (inBasket || dueOf([...recurSel.values(), { date: openDay!, time: sl.time, label: '', points: cost, coachId: '' }], 30) <= balance)
                                      const clickable = !sl.full && !sl.already_booked && affordable
                                      const w24 = isWithin24Hours(openDay!, sl.time)
                                      return (
                                        <button key={sl.coach_id + sl.time}
                                          onClick={() => toggleSlot(openDay!, new Date(openDay! + 'T00:00:00'), sl)}
                                          disabled={!clickable}
                                          style={{ minHeight: '62px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', padding: '11px 14px', borderRadius: '12px', textAlign: 'left',
                                            border: `2px solid ${inBasket ? GOLD : clickable ? myBandColor + '55' : '#e3ebf6'}`,
                                            background: inBasket ? `${GOLD}20` : clickable ? myBandColor + '14' : '#f6f9fd',
                                            cursor: clickable ? 'pointer' : 'not-allowed' }}>
                                          <span>
                                            <span style={{ display: 'block', fontSize: '17px', fontWeight: 700, color: inBasket ? GOLD : clickable ? '#16294a' : '#56647d' }}>{formatTime(sl.time)}</span>
                                            <span style={{ display: 'block', fontSize: '13px', marginTop: '3px', color: clickable ? '#56647d' : '#9aa6ba' }}>
                                              {sl.already_booked ? t('booking.booked') : sl.full ? t('booking.full') : !affordable ? (!makeUpDateOk(openDay!) ? t('booking.makeUp.outside') : t('booking.group.tooDear')) : t('booking.spotsLeft', { n: sl.max - sl.enrolled })}
                                              {w24 && clickable ? ' · 24h' : ''}
                                            </span>
                                          </span>
                                          <span style={{ display: 'flex', alignItems: 'center', gap: '9px', flexShrink: 0 }}>
                                            {pr && <PriceTag price={pr} dim={!clickable} />}
                                            <span style={{ width: '28px', height: '28px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '15px', fontWeight: 700,
                                              border: inBasket ? 'none' : '1.5px solid #e3ebf6', background: inBasket ? AMBER : 'transparent', color: NAVY }}>{inBasket ? '✓' : ''}</span>
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

                  {monthsShown < 6 && !makeUp && (
                    <button onClick={() => setMonthsShown(n => n + 1)}
                      style={{ width: '100%', marginBottom: '16px', padding: '11px', background: 'transparent', border: '1px dashed #e3ebf6', borderRadius: '10px', color: '#56647d', fontSize: '13.5px', fontWeight: 600, cursor: 'pointer' }}>
                      {t('booking.group.loadMore')}
                    </button>
                  )}
                  <div style={{ fontSize: '13px', color: '#56647d', marginBottom: '8px' }}>
                    {myGroupBand ? t('booking.group.showingBand', { name: selectedStudent?.full_name || '', min: myGroupBand.min, max: myGroupBand.max }) : t('booking.group.showing', { name: selectedStudent?.full_name || '' })}
                  </div>
                  {/* "Ready" only for a lesson that can be booked as a single;
                      a date past the window is being set up as a fixed class
                      in the panel below, and nothing is ready yet. */}
                  {selectedSlot && selectedDate && selectedCoach && !fixedOnly && (
                    <div style={{ background: `${GOLD}12`, border: `1px solid ${GOLD}55`, borderRadius: '10px', padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '14px', fontWeight: 600, color: '#16294a' }}>
                        {selectedDate.toLocaleDateString(dateLoc, { weekday: 'short', month: 'short', day: 'numeric' })} · {selectedSlot.label}
                        <span style={{ fontSize: '13px', fontWeight: 400, color: '#56647d', marginLeft: '8px' }}>{t('booking.group.withCoach', { name: selectedCoach.first_name })}</span>
                      </span>
                      <span style={{ fontSize: '13px', fontWeight: 700, color: GOLD }}>{t('booking.group.ready')}</span>
                    </div>
                  )}
                </div>
              )
            })()}

                {/* The basket. Without it, picking a second weekday looks like
                    it replaced the first, and the family books twice. */}
                {fixedFlow && recurSel.size > 0 && !recurOpen && (
                  <div style={{ marginTop: '10px', background: '#fff', border: `1px solid ${GOLD}55`, borderRadius: '12px', padding: '14px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap' }}>
                      {/* The sticky bar carries the total; this line carries
                          the count, because the chips below it are the thing
                          being counted and "8 lessons" is what the parent is
                          deciding about. */}
                      <span style={{ fontSize: '13px', letterSpacing: '0.08em', color: '#56647d' }}>
                        {t('booking.recur.basketTitle')}
                        <span style={{ marginLeft: '8px', letterSpacing: 0, color: GOLD, fontWeight: 700 }}>
                          {t('booking.recur.basketCount', { n: recurSel.size })}
                        </span>
                      </span>
                      <button onClick={() => setRecurSel(new Map())}
                        style={{ background: 'none', border: 'none', padding: 0, fontSize: '13px', color: '#56647d', cursor: 'pointer', textDecoration: 'underline' }}>
                        {t('booking.recur.clearAll')}
                      </button>
                    </div>
                    {basketSplit.lines.map(l => (
                      <div key={l.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', marginTop: '10px', padding: '9px 11px', borderRadius: '8px', background: `${GOLD}12`, border: `1px solid ${GOLD}44` }}>
                        <span style={{ fontSize: '13.5px', fontWeight: 700, color: GOLD, lineHeight: 1.5 }}>{l.text}</span>
                        <button aria-label={t('booking.recur.removeFixed')}
                          onClick={() => setRecurSel(prev => { const n = new Map(prev); for (const [k, v] of prev) if (v.fixed === l.key) n.delete(k); return n })}
                          style={{ background: 'none', border: 'none', padding: '2px 6px', fontSize: '15px', color: '#56647d', cursor: 'pointer' }}>×</button>
                      </div>
                    ))}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '10px' }}>
                      {basketSplit.singles.map(x => (
                        <button key={x.date + x.time}
                          onClick={() => setRecurSel(prev => { const n = new Map(prev); n.delete(`${x.date}|${x.time}`); return n })}
                          style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 600, padding: '5px 9px', borderRadius: '6px', background: `${GOLD}18`, border: `1px solid ${GOLD}44`, color: GOLD, cursor: 'pointer' }}>
                          {new Date(x.date + 'T00:00:00').toLocaleDateString(locale === 'en' ? 'en-US' : locale, { month: 'short', day: 'numeric' })}
                          {basketTimes.size > 1 ? ` · ${x.label}` : ''}
                          {basketCoaches.size > 1 ? ` · ${x.coachName || ''}` : ''}
                          <span aria-hidden style={{ color: '#56647d' }}>×</span>
                        </button>
                      ))}
                    </div>
                    <div style={{ fontSize: '13px', color: '#56647d', marginTop: '10px', lineHeight: 1.6 }}>
                      {/* A voucher books one lesson and takes no points: the
                          ordinary basket line ("add more, charged at once,
                          balance after") was wrong for it. */}
                      {makeUp ? t('booking.makeUp.basketHint') : t('booking.recur.basketHint', { points: Math.max(0, balance - basketTotal) })}
                    </div>
                  </div>
                )}
                {recurMsg && (
                  <div style={{ marginTop: '10px', background: '#e6f4ee', border: '1px solid #b7e0cc', borderRadius: '10px', padding: '12px 16px', color: '#1f7a57', fontSize: '14px', fontWeight: 600 }}>{recurMsg}</div>
                )}
                {fixedFlow && selectedSlot && selectedDate && selectedCoach && !recurOpen && !makeUp && (
                  <button disabled={recurBusy}
                    onClick={() => { setFixedOnly(false); openFixed(localDs(selectedDate), selectedSlot.time, selectedCoach.id) }}
                    style={{ marginTop: '10px', width: '100%', padding: '13px', background: 'transparent', border: `1px solid ${GOLD}`, borderRadius: '10px', color: GOLD, fontSize: '14px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', cursor: recurBusy ? 'wait' : 'pointer' }}>
                    {recurBusy ? t('booking.recur.loading') : t('booking.recur.cta', { weekday: selectedDate.toLocaleDateString(locale === 'en' ? 'en-US' : locale, { weekday: 'long' }), time: selectedSlot.label })}
                  </button>
                )}
                {fixedFlow && recurOpen && selectedSlot && selectedDate && selectedCoach && (
                  <div style={{ marginTop: '10px', background: '#fff', border: `1px solid ${GOLD}66`, borderRadius: '12px', padding: '16px', boxShadow: '0 12px 30px rgba(18,37,74,0.12)' }}>
                    <div style={{ fontSize: '15px', fontWeight: 700, color: GOLD }}>
                      {t('booking.recur.everyWeekday', { weekday: selectedDate.toLocaleDateString(locale === 'en' ? 'en-US' : locale, { weekday: 'long' }), time: selectedSlot.label })}
                      {/* A fixed class is one coach, so the panel names them. */}
                      {` · ${selectedCoach.first_name}`}
                    </div>
                    <div style={{ fontSize: '13px', color: '#56647d', marginTop: '4px' }}>
                      {t('booking.recur.remaining', { n: okCount, w: fixedWeeks })}
                    </div>
                    {fixedOnly && (
                      <div style={{ fontSize: '13px', color: '#9a5b00', background: '#fdf3e1', border: '1px solid #f3dcae', borderRadius: '8px', padding: '8px 10px', marginTop: '10px', lineHeight: 1.6 }}>
                        {t('booking.recur.singleOnly14', { n: SINGLE_DAYS })}
                      </div>
                    )}

                    {/* "8 weeks" is an abstraction: which eight days it means
                        is an answer the calendar holds, on a month the parent
                        may not have scrolled to. Laying the slot's actual dates
                        out as chips means they are looking at the thing they
                        are buying. Ten come pre-ticked; the rest they tick. */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(86px, 1fr))', gap: '6px', marginTop: '13px', maxHeight: '236px', overflowY: 'auto' }}>
                      {recurShown.map((c: any) => {
                        const key = `${c.date}|${selectedSlot.time}`
                        // A week the coach is off is shown, so the gap in the
                        // dates has a reason, but it cannot be ticked or paid for.
                        if (c.status !== 'ok') return (
                          <div key={key} style={{ minHeight: '48px', padding: '6px 4px', borderRadius: '8px', border: '1px dashed #e3ebf6', color: '#9aa6ba', textAlign: 'center', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                            <div style={{ fontSize: '13px', fontWeight: 700 }}>
                              {new Date(c.date + 'T00:00:00').toLocaleDateString(locale === 'en' ? 'en-US' : locale, { month: 'short', day: 'numeric' })}
                            </div>
                            <div style={{ fontSize: '11.5px', marginTop: '2px' }}>{t('booking.recur.coachOff')}</div>
                          </div>
                        )
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
                              border: on ? `2px solid ${GOLD}` : `1px dashed ${room ? `${GOLD}73` : '#e3ebf6'}`,
                              background: on ? `${GOLD}29` : 'transparent',
                              color: on ? GOLD : room ? '#56647d' : '#9aa6ba',
                            }}>
                            <div style={{ fontSize: '13px', fontWeight: 700 }}>
                              {new Date(c.date + 'T00:00:00').toLocaleDateString(locale === 'en' ? 'en-US' : locale, { month: 'short', day: 'numeric' })}
                            </div>
                            <div style={{ fontSize: '11.5px', marginTop: '2px', opacity: 0.75, fontVariantNumeric: 'tabular-nums' }}>
                              {t('points.unit', { n: cost })}
                            </div>
                          </button>
                        )
                      })}
                    </div>
                    <button disabled={recurBusy}
                      onClick={() => openFixed(fixedStart, selectedSlot.time, selectedCoach.id, fixedWeeks + FIXED_WEEKS_STEP, new Set(ghostSel))}
                      style={{ marginTop: '8px', background: 'none', border: 'none', padding: '4px 0', fontSize: '13px', fontWeight: 600, color: GOLD, cursor: recurBusy ? 'wait' : 'pointer', textDecoration: 'underline' }}>
                      {recurBusy ? t('booking.recur.loading') : t('booking.recur.moreWeeks', { n: FIXED_WEEKS_STEP })}
                    </button>
                    <div style={{ fontSize: '12px', color: '#56647d', marginTop: '6px', lineHeight: 1.6 }}>
                      {t('booking.recur.gridHint', { n: FIXED_CLASS_MIN_LESSONS })}
                    </div>
                    {/* Ten is the smallest class. If the wallet cannot cover
                        the first ten open dates, say so here rather than
                        leaving a button that can never light up. */}
                    {tenCost > 0 && otherTotal + tenCost > balance && (
                      <div style={{ fontSize: '13px', color: '#c0392b', background: '#fdecea', border: '1px solid #f5c2bd', borderRadius: '8px', padding: '8px 10px', marginTop: '8px', lineHeight: 1.6 }}>
                        {t('booking.recur.notEnoughFor10', { n: FIXED_CLASS_MIN_LESSONS, need: tenCost, have: Math.max(0, balance - otherTotal) })}
                        <div><BuyPointsLink label={t('booking.short.cta')} /></div>
                      </div>
                    )}

                    <div style={{ marginTop: '13px', padding: '11px 12px', borderRadius: '9px', background: '#f6f9fd', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                        <span style={{ color: '#56647d' }}>{t('booking.recur.wouldAdd')}</span>
                        <span style={{ fontWeight: 700, color: '#16294a' }}>{chosen.size}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                        <span style={{ color: '#56647d' }}>{t('booking.recur.wouldTotal')}</span>
                        <span style={{ fontWeight: 700, color: '#16294a', fontVariantNumeric: 'tabular-nums' }}>{t('points.unit', { n: otherTotal + chosenTotal })}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                        <span style={{ color: '#56647d' }}>{t('booking.price.after')}</span>
                        <span style={{ fontWeight: 700, color: GOLD, fontVariantNumeric: 'tabular-nums' }}>{t('points.unit', { n: Math.max(0, balance - otherTotal - chosenTotal) })}</span>
                      </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '13px' }}>
                      <button disabled={chosen.size < FIXED_CLASS_MIN_LESSONS}
                        onClick={() => {
                          const fixedKey = `${selectedDate.getDay()}|${selectedSlot.time}|${selectedCoach.id}`
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
                              n.set(key, { date, time, label: selectedSlot.label, points, coachId: cid, coachName: coachName(cid), fixed: fixedKey })
                            }
                            return n
                          })
                          setRecurOpen(false)
                        }}
                        style={{ minHeight: '44px', borderRadius: '9px', background: chosen.size < FIXED_CLASS_MIN_LESSONS ? '#f6f9fd' : AMBER, color: chosen.size < FIXED_CLASS_MIN_LESSONS ? '#56647d' : NAVY, fontSize: '14px', fontWeight: 700, border: 'none', cursor: chosen.size < FIXED_CLASS_MIN_LESSONS ? 'not-allowed' : 'pointer' }}>
                        {chosen.size < FIXED_CLASS_MIN_LESSONS
                          ? t('booking.recur.needMore', { n: FIXED_CLASS_MIN_LESSONS, m: FIXED_CLASS_MIN_LESSONS - chosen.size })
                          : t('booking.recur.takeAll', { n: chosen.size })}
                      </button>
                      <button onClick={() => setRecurOpen(false)}
                        style={{ minHeight: '40px', borderRadius: '9px', border: '1px solid #e3ebf6', background: 'transparent', color: '#56647d', fontSize: '13.5px', cursor: 'pointer' }}>
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
              // The page's own colour, so it reads as part of the page until
              // content scrolls under it; a white slab here looked like a box.
              background: PAGE_TINT, borderTop: '1px solid #d6e0ee',
            }}>
              {fixedFlow && recurSel.size > 0 && (
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap', marginBottom: '10px' }}>
                  <span style={{ fontSize: '15px', fontWeight: 700, color: GOLD }}>
                    {makeUp ? t('booking.makeUp.basket', { n: recurSel.size }) : t('booking.recur.basket', { n: recurSel.size, points: basketTotal })}
                  </span>
                  {!makeUp && (
                    <span style={{ fontSize: '13px', color: '#56647d', fontVariantNumeric: 'tabular-nums' }}>
                      {t('booking.price.after')} {t('points.unit', { n: Math.max(0, balance - basketTotal) })}
                    </span>
                  )}
                </div>
              )}
              <div style={{ display: 'flex', gap: '12px' }}>
                <button onClick={() => {
                  // A reschedule or a make-up has no course step to go back to (the
                  // course is fixed -- a make-up is booked as the voucher's own kind
                  // of lesson), so its way out is back to the family's page.
                  if (isReschedule || makeUp) { window.location.href = '/dashboard'; return }
                  setStep(1); setSelectedDate(null); setSelectedSlot(null); setRecurOpen(false); setRecurPlan([]); setRecurSel(new Map())
                }} style={{
                  flex: 1, padding: '14px', background: '#fff',
                  color: '#16294a', border: '1px solid #d3deec',
                  borderRadius: '10px', fontSize: '14px', fontWeight: 600, cursor: 'pointer',
                }}>{isReschedule || makeUp ? t('booking.cancelBack') : t('booking.back')}</button>
                <button
                  onClick={goToConfirm}
                  disabled={!canContinue}
                  style={{
                    flex: 2, padding: '14px',
                    background: canContinue ? AMBER : '#eef2f8',
                    color: canContinue ? NAVY : '#56647d',
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
            <div style={{ background: '#fff', borderRadius: '16px', padding: '28px', border: '1px solid #e3ebf6', marginBottom: '20px' }}>
              {(planOne ? [
                { label: t(siblingPair ? 'booking.sum.swimmers' : 'booking.sum.swimmer'),
                  value: siblingPair ? `${selectedStudent?.full_name} & ${selectedStudent2?.full_name}` : selectedStudent?.full_name },
                { label: t('booking.sum.course'), value: selectedCourse ? tDb(locale, 'course_types', selectedCourse.id, selectedCourse.name) : '' },
                { label: t('booking.sum.coach'), value: planOne.coachName || selectedCoach?.first_name },
                { label: t('booking.sum.date'), value: new Date(planOne.date + 'T00:00:00').toLocaleDateString(dateLoc, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) },
                { label: t('booking.sum.time'), value: (() => { const [h, m] = planOne.time.split(':').map(Number); const e = h * 60 + m + planMinutes; return `${formatTime(planOne.time)} – ${formatTime(`${String(Math.floor(e / 60)).padStart(2, '0')}:${String(e % 60).padStart(2, '0')}`)}` })() },
                { label: t('booking.sum.duration'), value: t('booking.lenMin', { n: planMinutes }) },
              ] : recurPlan.length > 0 ? [
                { label: t(siblingPair ? 'booking.sum.swimmers' : 'booking.sum.swimmer'),
                  value: siblingPair ? `${selectedStudent?.full_name} & ${selectedStudent2?.full_name}` : selectedStudent?.full_name },
                { label: t('booking.sum.course'), value: selectedCourse ? tDb(locale, 'course_types', selectedCourse.id, selectedCourse.name) : '' },
                { label: t('booking.sum.coach'), value: planCoaches.length > 0 ? planCoaches.join(locale === 'en' ? ', ' : '、') : selectedCoach?.first_name },
                // Naming one hour above a batch that spans two of them tells the
                // family the wrong time for half their lessons.
                { label: t('booking.sum.time'), value: planTimes.size > 1 ? t('booking.sum.timeMultiple', { n: planTimes.size }) : recurPlan[0]?.label },
                { label: t('booking.sum.duration'), value: t('booking.lenMin', { n: groupFlow ? (selectedCourse?.duration_minutes ?? 0) : planMinutes }) },
                { label: t('booking.sum.pointsUsed'), value: t('points.unit', { n: recurTotal }) },
              ] : [
                ...(isReschedule && rescheduleFrom ? [{
                  label: t('booking.sum.movingFrom'),
                  value: `${new Date(rescheduleFrom.date + 'T00:00:00').toLocaleDateString(dateLoc, { weekday: 'long', month: 'long', day: 'numeric' })} ${formatTime(rescheduleFrom.start)}`,
                }] : []),
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
                  padding: '12px 0', borderBottom: '1px solid #e3ebf6',
                }}>
                  <span style={{ fontSize: '14px', color: '#56647d' }}>{row.label}</span>
                  <span style={{ fontSize: '14px', fontWeight: 600, color: '#16294a' }}>{row.value}</span>
                </div>
              ))}
              {makeUp && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid #e3ebf6' }}>
                  <span style={{ fontSize: '14px', color: '#56647d' }}>{t('booking.makeUp.payLabel')}</span>
                  <span style={{ fontSize: '14px', fontWeight: 700, color: '#1f7a57' }}>{t('booking.makeUp.pay')}</span>
                </div>
              )}
              {/* Every date, spelled out. This is the last screen before the
                  credits are spent, so "3 lessons" is not enough -- a parent has
                  to be able to see that one of them lands on a week they are away. */}
              {planMany && (
                <div style={{ padding: '12px 0', borderBottom: '1px solid #e3ebf6' }}>
                  {planSplit.lines.map(l => (
                    <div key={l.key} style={{ fontSize: '14px', fontWeight: 700, color: '#16294a', marginBottom: '6px' }}>{l.text}</div>
                  ))}
                  {planSplit.lines.length > 0 && planSplit.singles.length > 0 && (
                    <div style={{ fontSize: '14px', fontWeight: 700, color: '#16294a', marginBottom: '6px' }}>{t('booking.recur.singleLine', { n: planSplit.singles.length })}</div>
                  )}
                  <div style={{ fontSize: '14px', color: '#56647d', marginBottom: '10px' }}>
                    {t('booking.recur.sumDates', { n: recurPlan.length })}
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {recurPlan.map(x => (
                      <span key={x.date + x.time} style={{ fontSize: '13px', fontWeight: 600, padding: '5px 10px', borderRadius: '6px', background: `${GOLD}18`, border: `1px solid ${GOLD}44`, color: GOLD }}>
                        {recurCover.has(lessonKey(x)) ? '🎟 ' : ''}
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
              {!isTrial && !isReschedule && (planOne ? onePrice : recurPlan.length === 0 && bookingPrice) && (() => { const bookingPrice = (planOne ? onePrice : bookingPriceSingle)!; const covered = planOne ? recurCover.has(lessonKey(planOne)) : (!!selectedHour && hourCovered); const bookingCost = planOne ? (covered ? 0 : planOne.points) : bookingCostSingle; const balanceAfter = Math.max(0, balance - bookingCost); return (
                <div style={{ paddingTop: '12px' }}>
                  {[
                    { k: 'base', label: bookingPrice.seats > 1 ? t('booking.price.baseSeats', { n: bookingPrice.seats }) : t('booking.price.base'), value: String(bookingPrice.base * bookingPrice.seats), dim: true },
                    ...(bookingPrice.offPeak ? [{ k: 'off', label: t('booking.price.offPeak'), value: `−${Math.round(bookingPrice.offPeakPct * 100)}%`, dim: true }] : []),
                    ...(covered ? [{ k: 'voucher', label: t('booking.voucherAuto.row', { n: 1 }), value: t('booking.voucherAuto.free'), dim: true }] : []),
                  ].map(row => (
                    <div key={row.k} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0' }}>
                      <span style={{ fontSize: '14px', color: '#56647d' }}>{row.label}</span>
                      <span style={{ fontSize: '14px', color: '#56647d', fontVariantNumeric: 'tabular-nums' }}>{row.value}</span>
                    </div>
                  ))}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0 6px', borderTop: '1px solid #e3ebf6', marginTop: '6px' }}>
                    <span style={{ fontSize: '14px', fontWeight: 700, color: '#16294a' }}>{t('booking.price.total')}</span>
                    <span style={{ fontSize: '16px', fontWeight: 700, color: GOLD, fontVariantNumeric: 'tabular-nums' }}>{t('points.unit', { n: bookingCost })}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '14px', color: '#56647d' }}>{t('booking.price.after')}</span>
                    <span style={{ fontSize: '14px', fontWeight: 700, color: '#56647d', fontVariantNumeric: 'tabular-nums' }}>{t('points.unit', { n: balanceAfter })}</span>
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
                    <span style={{ fontSize: '14px', color: '#56647d' }}>{t('booking.price.batchBase', { n: recurPlan.length })}</span>
                    <span style={{ fontSize: '14px', color: '#56647d', fontVariantNumeric: 'tabular-nums' }}>{recurBase}</span>
                  </div>
                  {recurBase > recurGross && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0' }}>
                      <span style={{ fontSize: '14px', color: '#56647d' }}>{t('booking.price.batchDiscount')}</span>
                      <span style={{ fontSize: '14px', color: myBandColor, fontVariantNumeric: 'tabular-nums' }}>−{recurBase - recurGross}</span>
                    </div>
                  )}
                  {recurSaved > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0' }}>
                      <span style={{ fontSize: '14px', color: '#56647d' }}>{t('booking.voucherAuto.row', { n: recurCover.size })}</span>
                      <span style={{ fontSize: '14px', color: '#1f7a57', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>−{recurSaved}</span>
                    </div>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0 6px', borderTop: '1px solid #e3ebf6', marginTop: '6px' }}>
                    <span style={{ fontSize: '14px', fontWeight: 700, color: '#16294a' }}>{t('booking.price.total')}</span>
                    <span style={{ fontSize: '16px', fontWeight: 700, color: GOLD, fontVariantNumeric: 'tabular-nums' }}>{t('points.unit', { n: recurTotal })}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '14px', color: '#56647d' }}>{t('booking.price.after')}</span>
                    <span style={{ fontSize: '14px', fontWeight: 700, color: '#56647d', fontVariantNumeric: 'tabular-nums' }}>{t('points.unit', { n: Math.max(0, balance - recurTotal) })}</span>
                  </div>
                </div>
              )}
            </div>
            {!isTrial && !isReschedule && (bookingCost > balance || recurTotal > balance) && (
              <div style={{ background: '#fdecea', border: '1px solid #f5c2bd', borderRadius: '10px', padding: '14px 18px', marginBottom: '20px', fontSize: '14px', color: '#c0392b' }}>
                ⚠️ {t('booking.short.body', { have: balance, need: recurPlan.length > 0 ? recurTotal : bookingCost })}
                <div><BuyPointsLink label={t('booking.short.cta')} /></div>
              </div>
            )}
            {voucherCould > 0 && (
              <label style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', background: '#eef8f1', border: '1px solid #bfe3cb', borderRadius: '10px', padding: '12px 16px', marginBottom: '20px', cursor: 'pointer' }}>
                <input type="checkbox" checked={payWithVouchers} onChange={e => setPayWithVouchers(e.target.checked)}
                  style={{ marginTop: '3px', width: '18px', height: '18px', accentColor: '#1f7a57', flexShrink: 0 }} />
                <span style={{ fontSize: '14px', color: '#16294a', lineHeight: 1.6 }}>
                  <b>🎟 {t('booking.voucherAuto.use', { n: voucherCould })}</b><br />
                  <span style={{ color: '#56647d', fontSize: '13px' }}>
                    {payWithVouchers ? t('booking.voucherAuto.on', { n: voucherUsing }) : t('booking.voucherAuto.off')}
                  </span>
                </span>
              </label>
            )}
            <div style={{ background: '#eef4fc', border: '1px solid #c9d8ee', borderRadius: '10px', padding: '12px 16px', marginBottom: '20px' }}>
              <span style={{ fontSize: '13px', color: '#56647d', lineHeight: 1.6 }}>
                {isTrial ? t('booking.policy.assessment')
                  : makeUp ? t('booking.policy.makeUp')
                  // A lesson a voucher pays for is a make-up: its cancellation rule
                  // is the voucher's, not the points refund of a single lesson.
                  : [planSplit.lines.length > 0 ? t('booking.policy.fixed') : null,
                     (planSplit.singles.some(x => !recurCover.has(lessonKey(x))) || (planSplit.lines.length === 0 && voucherUsing === 0)) ? t('booking.policy.single') : null,
                     voucherUsing > 0 ? t('booking.policy.makeUp') : null].filter(Boolean).join(' ')}{' '}
                <a href="/terms" target="_blank" rel="noopener noreferrer" style={{ color: GOLD, textDecoration: 'underline', fontWeight: 600 }}>
                  {t('booking.viewTerms')}
                </a>
              </span>
            </div>
            {cartMsg && (
              <div style={{ background: '#fdecea', border: '1px solid #f5c2bd', borderRadius: '10px', padding: '12px 16px', marginBottom: '20px', color: '#b3261e', fontSize: '14px' }}>
                {cartMsg}
              </div>
            )}
            <div style={{ display: 'flex', gap: '12px' }}>
              <button onClick={() => { setStep(3); setRecurPlan([]) }} style={{
                flex: 1, padding: '14px', background: '#fff',
                color: '#16294a', border: '1px solid #d3deec',
                borderRadius: '10px', fontSize: '14px', fontWeight: 600, cursor: 'pointer',
              }}>{t('booking.back')}</button>
              {/* The cart books a 30-minute lesson, pays in points and carries no
                  voucher: a make-up, an hour, or a lesson a voucher would pay
                  for is booked straight away only (found 2026-10-03 -- an
                  hour went into the cart as half an hour). */}
              {!isTrial && !isReschedule && !makeUp && !selectedHour && lessonLength !== 60 && voucherCould === 0
                && recurPlan.length === 0 && selectedCourse?.slug !== '1on2' && (
                <button
                  onClick={handleAddToCart}
                  disabled={submitting || addingToCart}
                  style={{
                    flex: 1, padding: '14px', background: 'transparent',
                    color: (submitting || addingToCart) ? '#56647d' : GOLD,
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
                  background: submitting ? '#eef2f8' : AMBER,
                  color: submitting ? '#56647d' : NAVY,
                  border: 'none', borderRadius: '10px',
                  fontSize: '14px', fontWeight: 700, letterSpacing: '1.5px',
                  textTransform: 'uppercase', cursor: submitting ? 'not-allowed' : 'pointer',
                }}
              >{submitting ? (isTrial && !trialHasCredit ? t('booking.redirecting') : t('booking.submitting')) : planMany ? t('booking.recur.yesBook', { n: recurPlan.length }) : isTrial ? (trialHasCredit ? t('booking.confirmBooking') : t('booking.continueToPayment')) : isReschedule ? t('booking.confirmReschedule') : t('booking.confirmBooking')}</button>
            </div>
          </div>
        )}
      </div>
      <NoticeModal title={t('common.noticeTitle')} message={notice && notice.startsWith('err.') ? t(notice) : notice} closeLabel={t('common.close')} onClose={() => setNotice(null)} />
      {parentId && <BookingCart refreshSignal={cartRefresh} onCommitted={() => { if (selectedCoach && selectedDate) loadTimeSlots() }} />}
    </div>
  )
}
