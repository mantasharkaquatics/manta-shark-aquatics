'use client'

// One fixed class, from the family's side (docs/fixed-class-spec.md 4 and 5):
// what is left of it, renewing it (same slot, from the week after its last
// lesson, ten or more), and changing its slot (換時段). The dashboard line and
// the renewal email both land here; ?renew=1 opens the renewal straight away.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useLocale, useT } from '@/lib/i18n/provider'
import { tDb, joinList } from '@/lib/i18n'
import { errorKey, errorKeyFor } from '@/lib/i18n/errors'
import { ACCT_CSS } from '@/components/brand/AcctStyles'
import { formatTime12h } from '@/lib/date'
import { FIXED_CLASS_MIN_LESSONS } from '@/lib/booking-time'
import { DEFAULT_LOCATION_ID, locationMapUrl, type Location } from '@/lib/locations'
import { useDialogFocus } from '@/lib/use-dialog-focus'
import SettleArrearsButton from '@/components/SettleArrearsButton'
import { createClient } from '@/lib/supabase/client'
import { myFamilyRole } from '@/lib/my-parent'
import { fmtDate } from '@/lib/fmt-date'
import { openChat } from '@/lib/chat-open'
import Icon from '@/components/ui/Icon'
import { useFamilyRole } from '@/lib/use-viewer'

type FC = {
  id: string; studentId: string; student2Id: string | null; studentNames: string[]
  courseSlug: string; courseName: string; courseTypeId: string; minutes: number
  coachId: string; coachName: string; weekday: number; time: string
  left: number; next: string | null; last: string | null
  renewOpen: boolean; holdUntil: string | null
  locationId?: string | null
  lessons: { date: string; start: string; coachId?: string; coachName: string; within24h: boolean; bookingId: string | null; locationId?: string | null }[]
}
type Cand = { date: string; status: string; points: number | null }
type Opt = { weekday: number; time: string; coachId: string; startDate: string; okWeeks: number; weeks: number }
type Item = { from: string; to: string | null; coachId: string | null; kind: 'move' | 'later' | 'other_coach' | 'voucher' }

const WEEKS_STEP = 26
const addDays = (d: string, n: number) => { const x = new Date(d + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10) }
const endOf = (t: string, m: number) => { const [h, mm] = t.split(':').map(Number); const e = h * 60 + mm + m; return `${String(Math.floor(e / 60)).padStart(2, '0')}:${String(e % 60).padStart(2, '0')}` }

const PAGE_CSS = `
.fc-chips { display: grid; grid-template-columns: repeat(auto-fill, minmax(88px, 1fr)); gap: 6px; margin-top: 12px; }
.fc-chip { min-height: 48px; padding: 6px 4px; border-radius: 9px; text-align: center; font-family: inherit; cursor: pointer;
  border: 1px dashed #b9c9e0; background: #fff; color: #56647d; }
.fc-chip b { display: block; font-size: 13px; }
.fc-chip small { display: block; font-size: 11.5px; margin-top: 2px; font-variant-numeric: tabular-nums; }
.fc-chip.on { border: 2px solid #f09800; background: #fff4e0; color: #8a5300; }
.fc-chip:disabled { cursor: not-allowed; color: #a7b2c4; background: #f6f9fd; border-color: #e3ebf6; }
.fc-chip.off { cursor: default; color: #6b778c; background: #f1f3f7; border-color: #e3ebf6; }
/* The dates: one row a month, five equal cells, 11/10 (owner, 2026-11-09,
   選項 A -- as the booking page's fixed-class calendar). What a date adds
   (24 小時內, another coach, the pool) is a small second line. */
.fc-lessons { display: flex; flex-direction: column; gap: 6px; margin-top: 10px; }
.fc-month { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 6px; }
.fc-lesson { display: flex; flex-direction: column; align-items: center; justify-content: center; min-width: 0; padding: 8px 2px;
  font-size: 14px; font-weight: 700; font-variant-numeric: tabular-nums; line-height: 1.2; border-radius: 8px; background: #eef4fc; color: #16294a; }
.fc-lesson small, .fc-lesson em { display: block; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 10.5px; margin-top: 2px; }
.fc-lesson small { font-weight: 600; }
.fc-lesson em { font-style: normal; font-weight: 800; color: #b06a00; white-space: normal; word-break: keep-all; text-align: center; }  /* never cut: 24 / 小時內 on a narrow phone */
/* A week with another coach than the class's own (owner, 2026-11-02). */
.fc-lesson.sub { background: #7b61c4; color: #fff; }
.fc-lesson.sub em { color: #fff; }
button.fc-lesson { font-family: inherit; border: 1px solid transparent; cursor: pointer; }
/* Hover only where there is a mouse: on a phone a tapped date or slot kept
   the hover look and read as selected (AGENTS.md; found 2026-10-08). */
@media (hover: hover) { button.fc-lesson:hover { border-color: #2050a0; background: #fff; } button.fc-lesson.sub:hover { background: #6a52b0; } }
/* The page's confirms are pop-ups of kind ② (.msa-dlg in globals, 決定 9);
   these only shape what is inside. */
.fc-leave .eb { font-size: 11px; font-weight: 700; letter-spacing: 2px; color: #c0392b; margin-bottom: 8px; }
.fc-leave h3 { font-size: 20px; font-weight: 900; color: #16294a; margin: 0 0 14px; }
.fc-leave .what { background: #f6f9fd; border-radius: 10px; padding: 12px 14px; margin-bottom: 16px; font-size: 14px; font-weight: 600; color: #16294a; }
.fc-leave .what small { display: block; font-size: 12px; font-weight: 400; color: #56647d; margin-top: 3px; }
.fc-leave p { font-size: 13px; color: #56647d; line-height: 1.6; margin: 0 0 20px; }
.fc-sum { margin-top: 14px; padding: 12px 14px; border-radius: 10px; background: #f6f9fd; display: flex; flex-direction: column; gap: 6px; font-size: 13.5px; }
.fc-sum div { display: flex; justify-content: space-between; gap: 12px; }
.fc-sum span:last-child { font-weight: 700; font-variant-numeric: tabular-nums; }
.fc-day { margin-top: 14px; }
.fc-days { display: flex; flex-wrap: wrap; gap: 6px; }
.fc-dtab { font-family: inherit; font-size: 13.5px; font-weight: 700; padding: 7px 12px; border-radius: 999px; border: 1px solid #d5e0ef; background: #fff; color: #16294a; cursor: pointer; }
.fc-dtab.on { background: #12254a; border-color: #12254a; color: #fff; }
.fc-day h3 { font-size: 13px; font-weight: 800; letter-spacing: 1px; color: #2050a0; margin: 0 0 8px; }
.fc-opts { display: flex; flex-wrap: wrap; gap: 8px; }
.fc-opt { font-family: inherit; text-align: left; padding: 9px 12px; border-radius: 10px; border: 1px solid #d5e0ef; background: #fff; cursor: pointer; }
.fc-opt b { display: block; font-size: 14px; color: #12254a; }
.fc-opt small { font-size: 12px; color: #56647d; }
.fc-opt.part small { color: #b06a00; }
@media (hover: hover) { .fc-opt:hover { border-color: #2050a0; } }
.fc-plan { margin-top: 12px; display: flex; flex-direction: column; gap: 6px; }
.fc-plan div { display: flex; justify-content: space-between; gap: 10px; font-size: 13.5px; padding: 7px 10px; border-radius: 8px; background: #f6f9fd; }
.fc-plan .tag { font-size: 12px; font-weight: 700; color: #b06a00; }
.fc-plan .v { color: #9a5b00; background: #fdf3e1; }
.fc-acts { display: flex; gap: 10px; }
.fc-acts .ac-btn { flex: 1; margin: 0; min-height: 48px; font-size: 15px; }
.fc-msum { margin-top: 10px; padding: 12px 14px; border-radius: 12px; background: #eef3fa; font-size: 14px; line-height: 1.65; color: #16294a; }
.fc-msum b { display: block; font-size: 15.5px; }
.fc-msum ul { margin: 6px 0 0; padding-left: 18px; }
.fc-each { margin-top: 8px; }
.fc-each summary { cursor: pointer; font-size: 13.5px; font-weight: 800; color: #2050a0; list-style: none; padding: 6px 0; }
.fc-each summary::-webkit-details-marker { display: none }
.fc-each .less, .fc-each[open] .more { display: none }
.fc-each[open] .less { display: inline }
.fc-warn { font-size: 13px; color: #9a5b00; background: #fdf3e1; border: 1px solid #f3dcae; border-radius: 9px; padding: 9px 12px; margin-top: 10px; line-height: 1.6; }
`

export default function FixedClassPage() {
  const t = useT()
  /* A view-only family member sees the class, not its controls (2026-11-04:
     leave, renew and move were all on offer and the server refused). */
  // Until the role is known nothing only a paying member may do is drawn
  // (14-role test 2, J08: renew and move flashed for a view-only member).
  const fam = useFamilyRole()
  const viewer = fam !== 'main' && fam !== 'full'
  const locale = useLocale()
  const loc = locale === 'en' ? 'en-US' : locale === 'zh-Hans' ? 'zh-CN' : 'zh-TW'
  const params = useParams()
  const id = String((params as any)?.id || '')
  const tErr = (raw?: string | null, fb = 'cart.err.network') => { const k = errorKey(raw); return k ? t(k) : (raw || t(fb)) }
  const day = (d: string, o: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', weekday: 'short' }) =>
    fmtDate(new Date(d + 'T12:00:00Z'), loc, { ...o, timeZone: 'UTC' })
  const mmdd = (d: string) => d.slice(5, 7) + '/' + d.slice(8, 10)
  // A whole error answer: a lost original lesson names its points, a full
  // class its date (lib/i18n/errors errorKeyFor, F81).
  const tErrOf = (j: Parameters<typeof errorKeyFor>[0]) => { const r = errorKeyFor(j, d => day(d)); return r ? t(r.key, r.vars) : (typeof j?.error === 'string' && j.error ? j.error : t('cart.err.network')) }
  const weekdayName = (wd: number) => day(`2026-01-${String(4 + wd).padStart(2, '0')}`, { weekday: 'long' })
  // The class (or one of its lessons) at the head of a message to the desk.
  const aboutClass = (extra?: string) => fc ? [t('fixedPage.ask.class', { weekday: weekdayName(fc.weekday), time: formatTime12h(fc.time) }), tDb(locale, 'course_types', fc.courseTypeId, fc.courseName), t('dash.up.coach', { name: fc.coachName }), joinList(locale, fc.studentNames), extra].filter(Boolean).join(' · ') : ''

  const [fc, setFc] = useState<FC | null>(null)
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState<{ ok: boolean; text: string; ask?: string; voucherId?: string } | null>(null)
  const router = useRouter()
  // A lesson inside 24 hours cannot be taken leave of here: tapping it says
  // where to go instead (50-role test, 2026-11-05: it did nothing).
  const [in24, setIn24] = useState<{ date: string; start: string } | null>(null)
  const in24Box = useDialogFocus(!!in24, () => setIn24(null))

  // Leave for any lesson more than 24 hours away -- the home page only lists
  // the next two weeks, and a family who knows of a trip months ahead takes
  // leave for it here (owner, 2026-10-02).
  const [leaveFor, setLeaveFor] = useState<{ date: string; start: string; bookingId: string } | null>(null)
  const [leaving, setLeaving] = useState(false)
  /* The leave confirm had no name, kept focus on the date button behind it
     and ignored Esc (found 2026-10-15). Not closable while the leave runs. */
  const leaveBox = useDialogFocus(!!leaveFor && !!fc, () => { if (!leaving) setLeaveFor(null) })
  // Renewing takes the points at once: ask first (owner, 2026-11-05, 決定 2).
  const [renewAsk, setRenewAsk] = useState(false)
  const renewBox = useDialogFocus(renewAsk, () => setRenewAsk(false))
  const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' })
  async function takeLeave() {
    if (!leaveFor) return
    setLeaving(true)
    const res = await fetch('/api/bookings/cancel-with-partner', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      // This dialog only ever offers leave (24 hours or more ahead). The list
      // is worked out once, on load, so a page left open can still offer it
      // after the lesson has moved inside 24 hours -- where the server would
      // spend the month's grace instead. Saying what was shown makes the
      // server refuse that (OUTCOME_CHANGED); load() below then drops the
      // button (found 2026-10-07).
      body: JSON.stringify({ booking_id: leaveFor.bookingId, expected_outcome: 'leave' }),
    }).catch(() => null)
    const j = res ? await res.json().catch(() => ({})) : {}
    if (!res || !res.ok) {
      setMsg({ ok: false, text: tErr((j as any).error, 'dash.cancelFailed') })
    } else if ((j as any).voucher_expires) {
      const from = (j as any).voucher_from as string | null
      // The make-up can be booked from the message (J45).
      const vid = (j as { voucher_id?: string | null }).voucher_id || undefined
      setMsg({ ok: true, voucherId: vid, text: from
        ? t('dash.cancelDone.voucherWindow', { from: day(from > todayStr ? from : todayStr, { month: 'short', day: 'numeric' }), to: day((j as any).voucher_expires, { month: 'short', day: 'numeric' }) })
        : t('dash.cancelDone.voucher', { date: day((j as any).voucher_expires, { month: 'short', day: 'numeric' }) }) })
    }
    setLeaving(false)
    setLeaveFor(null)
    await load()
  }

  const load = useCallback(async () => {
    const r = await fetch('/api/parent/fixed-classes').then(x => x.ok ? x.json() : null).catch(() => null)
    setFc((r?.classes || []).find((c: FC) => c.id === id) || null)
    setLoading(false)
  }, [id])
  useEffect(() => { load() }, [load])

  // Where the class is. Shown while more than one pool is open to families
  // (/api/locations `show`), or when the pool has an address for this booked
  // family (`details`, owner 2026-10-22).
  const [pools, setPools] = useState<Location[] | null>(null)
  useEffect(() => {
    let live = true
    fetch('/api/locations', { cache: 'no-store' }).then(r => r.ok ? r.json() : null)
      .then(j => { if (live && (j?.show || j?.details)) setPools(j.locations || []) }).catch(() => {})
    return () => { live = false }
  }, [])
  const poolOf = (id?: string | null) => pools?.find(l => l.id === (id || DEFAULT_LOCATION_ID)) || null
  // One pool for every lesson left (the usual case) is said once, under the
  // title; lessons split across pools say theirs on each date instead.
  const subOf = (l: { coachId?: string }) => !!fc && !!l.coachId && l.coachId !== fc.coachId
  // The dates, one row a month.
  const lessonMonths: FC['lessons'][] = []
  for (const l of fc?.lessons ?? []) {
    const last = lessonMonths[lessonMonths.length - 1]
    if (last && last[0].date.slice(0, 7) === l.date.slice(0, 7)) last.push(l)
    else lessonMonths.push([l])
  }
  const poolIds = fc ?[...new Set((fc.lessons.length ? fc.lessons.map(l => l.locationId) : [fc.locationId]).map(x => x || DEFAULT_LOCATION_ID))] : []
  const onePool = pools && poolIds.length === 1 ? poolOf(poolIds[0]) : null
  const perLessonPool = !!pools && poolIds.length > 1

  // ── Renewal ──────────────────────────────────────────────────────────
  const [renewOpenUI, setRenewOpenUI] = useState(false)
  const [cands, setCands] = useState<Cand[]>([])
  const [weeks, setWeeks] = useState(WEEKS_STEP)
  const [ticked, setTicked] = useState<Set<string>>(new Set())
  const [balance, setBalance] = useState(0)
  // Owed from a returned payment (F114): nothing renews until it is paid.
  const [owed, setOwed] = useState(0)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  // The class's weekday after its last lesson (lib/fixed-classes nextOnWeekday):
  // normally last + 7, but never a day the class is not on -- a last date
  // left on the old weekday by a change of slot put every renewal on that
  // day, and the server refused them all (found 2026-10-15).
  const renewStart = fc?.last ? addDays(fc.last, ((fc.weekday - new Date(fc.last + 'T12:00:00Z').getUTCDay() + 6) % 7) + 1) : ''
  const loadRenew = useCallback(async (w: number, keep?: Set<string>) => {
    if (!fc || !renewStart) return
    setBusy(true); setErr('')
    try {
      const res = await fetch('/api/bookings/recurring', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'preview', student_id: fc.studentId, student2_id: fc.student2Id, coach_id: fc.coachId,
          start_time: fc.time, start_date: renewStart, weeks: w, course_slug: fc.courseSlug, minutes: fc.minutes,
        }),
        signal: AbortSignal.timeout(30000),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) { setErr(tErrOf(j)); setBusy(false); return }
      const list: Cand[] = j.candidates || []
      setCands(list); setWeeks(w); setBalance(j.balance ?? 0); setOwed(Number(j.arrears) || 0); setRenewOpenUI(true)
      if (keep) setTicked(keep)
      else {
        // The first ten open weeks the wallet covers, as the booking page does.
        const pre = new Set<string>()
        let run = 0
        for (const c of list) {
          if (pre.size >= FIXED_CLASS_MIN_LESSONS) break
          if (c.status !== 'ok') continue
          if (run + (c.points ?? 0) > (j.balance ?? 0)) break
          run += c.points ?? 0; pre.add(c.date)
        }
        setTicked(pre)
      }
    } catch { setErr(t('cart.err.network')) }
    setBusy(false)
  }, [fc, renewStart])

  // ?renew=1 (the email, the dashboard line) opens the renewal once; the
  // flag is dropped so a reload after renewing does not open it again.
  const autoRenewed = useRef(false)
  useEffect(() => {
    if (!fc?.renewOpen || renewOpenUI || autoRenewed.current) return
    if (typeof window === 'undefined' || new URLSearchParams(window.location.search).get('renew') !== '1') return
    autoRenewed.current = true
    try { const u = new URL(window.location.href); u.searchParams.delete('renew'); window.history.replaceState(null, '', u.toString()) } catch {}
    loadRenew(WEEKS_STEP)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fc])

  const okCands = cands.filter(c => c.status === 'ok')
  const shown = cands.filter(c => c.status === 'ok' || c.status === 'time_off')
  const total = okCands.filter(c => ticked.has(c.date)).reduce((a, c) => a + (c.points ?? 0), 0)
  const tenCost = okCands.length >= FIXED_CLASS_MIN_LESSONS ? okCands.slice(0, FIXED_CLASS_MIN_LESSONS).reduce((a, c) => a + (c.points ?? 0), 0) : 0

  async function confirmRenew() {
    if (!fc) return
    setBusy(true); setErr('')
    try {
      const dates = okCands.filter(c => ticked.has(c.date)).map(c => c.date)
      const res = await fetch('/api/bookings/recurring', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'commit', student_id: fc.studentId, student2_id: fc.student2Id, coach_id: fc.coachId,
          course_slug: fc.courseSlug, minutes: fc.minutes, renew_fixed_class_id: fc.id,
          slots: dates.map(d => ({ date: d, start_time: fc.time, coach_id: fc.coachId, fixed: 'renew' })),
        }),
        // No answer in time cannot say whether it renewed (14-role test 2, J70).
        signal: AbortSignal.timeout(30000),
      })
      const j = await res.json().catch(() => null)
      if (res.status >= 500 || !j) { setErr(t('booking.err.unsureCheck')); setBusy(false); load(); return }
      if (!res.ok) { setErr(tErrOf(j)); setBusy(false); return }
      setMsg({ ok: true, text: t('fixedPage.renew.done', { n: j.booked ?? dates.length }) })
      setRenewOpenUI(false); setCands([]); setTicked(new Set())
      await load()
    } catch (e) { setErr(t((e as Error)?.name === 'TimeoutError' ? 'booking.err.timeoutUnsure' : 'booking.err.unsureCheck')); load() }
    setBusy(false)
  }

  // ── Change of slot ───────────────────────────────────────────────────
  const [opts, setOpts] = useState<Opt[] | null>(null)
  const [optCoaches, setOptCoaches] = useState<Map<string, string>>(new Map())
  const [moving, setMoving] = useState(0)
  const [staying, setStaying] = useState<string[]>([])
  const [pick, setPick] = useState<Opt | null>(null)
  const [plan, setPlan] = useState<{ items: Item[]; sig: string } | null>(null)
  const [mErr, setMErr] = useState('')
  const [mBusy, setMBusy] = useState(false)
  /* 換時段 and 續報 are buttons under the title (owner, 2026-11-04, 問題 8
     選項 A: 換時段 sat at the bottom, under the dates and the renewal, and
     families thought there was none). The move card opens under them. */
  const [moveOpen, setMoveOpen] = useState(false)
  const moveRef = useRef<HTMLElement | null>(null)
  const renewRef = useRef<HTMLElement | null>(null)
  const into = (r: React.RefObject<HTMLElement | null>) => requestAnimationFrame(() => requestAnimationFrame(() => r.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })))

  async function loadOptions() {
    if (!fc) return
    setMBusy(true); setMErr(''); setPick(null); setPlan(null)
    try {
      const res = await fetch('/api/bookings/fixed-move', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'options', fixed_class_id: fc.id }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) { setMErr(tErrOf(j)); setMBusy(false); return }
      setOpts(j.options || []); setMoving(j.moving || 0); setStaying(j.staying || [])
      setOptCoaches(new Map((j.coaches || []).map((c: any) => [c.id, c.first_name])))
    } catch { setMErr(t('cart.err.network')) }
    setMBusy(false)
  }
  async function preview(o: Opt) {
    if (!fc) return
    setPick(o); setPlan(null); setMBusy(true); setMErr('')
    try {
      const res = await fetch('/api/bookings/fixed-move', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'preview', fixed_class_id: fc.id, start_date: o.startDate, start_time: o.time, coach_id: o.coachId }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) { setMErr(tErrOf(j)); setMBusy(false); return }
      setPlan({ items: j.plan || [], sig: j.sig })
    } catch { setMErr(t('cart.err.network')) }
    setMBusy(false)
  }
  async function commit() {
    if (!fc || !pick || !plan) return
    setMBusy(true); setMErr('')
    try {
      const res = await fetch('/api/bookings/fixed-move', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'commit', fixed_class_id: fc.id, start_date: pick.startDate, start_time: pick.time, coach_id: pick.coachId, sig: plan.sig }),
      })
      const j = await res.json().catch(() => ({}))
      if (res.status === 409 && j.plan) { setPlan({ items: j.plan, sig: j.sig }); setMErr(t('err.fixedPlanChanged')); setMBusy(false); return }
      if (!res.ok) { setMErr(tErrOf(j)); setMBusy(false); return }
      const done = t('fixedPage.move.done', { weekday: weekdayName(pick.weekday), time: formatTime12h(pick.time) })
      const parts = [done]
      if (j.vouchers > 0) parts.push(t('fixedPage.move.doneVouchers', { n: j.vouchers }))
      // Lessons whose voucher could not be written stay on their old slot
      // (lib/fixed-move.ts step 4); say so rather than let the family think
      // every week moved.
      const stayedList: string[] = Array.isArray(j.notMoved) ? j.notMoved.map((x: unknown) => String((x as { date?: string })?.date ?? x)).filter((d: string) => /^\d{4}-\d{2}-\d{2}/.test(d)) : []
      const stayed: number = Array.isArray(j.notMoved) ? j.notMoved.length : 0
      // Which ones, by date, and a way to the desk (50-role test, 2026-11-05).
      const stayedDates = joinList(locale, stayedList.map(d => day(d.slice(0, 10), { month: 'short', day: 'numeric', weekday: 'short' })))
      if (stayed > 0) parts.push(stayedDates ? t('fixedPage.move.notMovedDates', { dates: stayedDates, time: formatTime12h(fc.time) }) : t('fixedPage.move.notMoved', { n: stayed }))
      setMsg({ ok: stayed === 0, text: parts.join(' '), ask: stayed > 0 ? aboutClass(stayedDates || undefined) : undefined })
      setOpts(null); setPick(null); setPlan(null); setMoveOpen(false)
      await load()
    } catch { setMErr(t('cart.err.network')) }
    setMBusy(false)
  }

  const optsByDay = useMemo(() => {
    const m = new Map<number, Opt[]>()
    for (const o of opts || []) m.set(o.weekday, [...(m.get(o.weekday) || []), o])
    return [...m.entries()]
  }, [opts])
  // One weekday at a time: the class's own weekday first if it has times.
  const [optDay, setOptDay] = useState<number | null>(null)
  const dayShown = optDay ?? (optsByDay.find(([wd]) => wd === fc?.weekday)?.[0] ?? optsByDay[0]?.[0] ?? null)

  if (loading) return <div className="ac-root ac-loading"><style>{ACCT_CSS}</style>{t('link.loading')}</div>

  return (
    <div className="ac-root">
      <style>{ACCT_CSS + PAGE_CSS}</style>
      <div className="ac-wrap">
        <div className="ac-head">
          <Link href="/dashboard" className="ac-back">← {t('common.backToDashboard')}</Link>
          <h1 className="ac-h1">{t('fixedPage.title')}</h1>
          {fc && (
            <p className="ac-sub">{t('fixedPage.sub', {
              names: joinList(locale, fc.studentNames), course: tDb(locale, 'course_types', fc.courseTypeId, fc.courseName) + ' · ' + t('booking.lenMin', { n: fc.minutes }),
              weekday: weekdayName(fc.weekday), time: `${formatTime12h(fc.time)} – ${formatTime12h(endOf(fc.time, fc.minutes))}`, coach: fc.coachName,
            })}</p>
          )}
          {onePool && (() => {
            const url = locationMapUrl(onePool)
            const body = <><Icon name="pin" /> {onePool.name}{onePool.address && onePool.address.trim().toLowerCase() !== onePool.name.trim().toLowerCase() ? ' · ' + onePool.address : ''}</>
            return <p className="ac-sub" style={{ fontSize: 14, marginTop: 4 }}>{url
              ? <a href={url} target="_blank" rel="noopener noreferrer" aria-label={t('dash.pool.mapAria', { name: onePool.name })} style={{ color: 'inherit', textDecoration: 'underline', textDecorationColor: '#c9d8ee', textUnderlineOffset: 2 }}>{body}</a>
              : body}</p>
          })()}
        </div>

        {/* Announced: the dialog that led here has closed, and its opener may be gone. */}
        {msg && <div className="ac-card" style={{ marginBottom: 14 }}><div className={msg.ok ? 'ac-okmsg' : 'fc-warn'} role={msg.ok ? 'status' : 'alert'}>{msg.ok ? '✓ ' : ''}{msg.text}</div>
          {msg.ask && <button type="button" className="ac-btn line" style={{ marginTop: 10 }} onClick={() => openChat('', { about: msg.ask })}>{t('dash.up.messageUs')}</button>}
          {/* The make-up, bookable from here (J45). */}
          {msg.voucherId && !viewer && <Link href={`/booking?voucher=${msg.voucherId}`} className="ac-btn gold" style={{ marginTop: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 44, textDecoration: 'none' }}>{t('dash.cancelDone.bookMakeup')}</Link>}</div>}
        {in24 && fc && (
          <div className="msa-dlg-back" onClick={() => setIn24(null)}>
            <div ref={in24Box} className="msa-dlg fc-leave" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="fc-in24-title">
              <div className="eb">{t('fixedPage.in24h')}</div>
              <h3 id="fc-in24-title">{t('fixedPage.in24.title')}</h3>
              <div className="what">{joinList(locale, fc.studentNames)} · {tDb(locale, 'course_types', fc.courseTypeId, fc.courseName)}
                <small>{day(in24.date)} · {formatTime12h(in24.start)}</small></div>
              <p>{t('fixedPage.in24.body')}</p>
              <div className="msa-dlg-acts">
                <button className="msa-dlg-no" onClick={() => { const d = in24; setIn24(null); openChat('', { about: aboutClass(day(d.date, { month: 'short', day: 'numeric', weekday: 'short' }) + ' ' + formatTime12h(d.start)) }) }}>{t('dash.up.messageUs')}</button>
                <button className="msa-dlg-yes" onClick={() => { setIn24(null); router.push('/dashboard/schedule') }}>{t('fixedPage.in24.toSchedule')}</button>
              </div>
            </div>
          </div>
        )}
        {renewAsk && fc && (
          <div className="msa-dlg-back" onClick={() => !busy && setRenewAsk(false)}>
            <div ref={renewBox} className="msa-dlg fc-leave" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="fc-renew-title">
              <div className="eb" style={{ color: '#2050a0' }}>{t('fixedPage.renew.ask.eyebrow')}</div>
              <h3 id="fc-renew-title">{t('fixedPage.renew.ask.title', { n: ticked.size })}</h3>
              <div className="what">{joinList(locale, fc.studentNames)} · {tDb(locale, 'course_types', fc.courseTypeId, fc.courseName)}
                <small>{t('fixedPage.renew.ask.when', { weekday: weekdayName(fc.weekday), time: formatTime12h(fc.time), coach: fc.coachName })}</small>
                {/* From when to when, and the weeks in it that are not taken (J86). */}
                {(() => {
                  const ds = [...ticked].sort()
                  if (ds.length === 0) return null
                  const off = cands.filter(c => c.date > ds[0] && c.date < ds[ds.length - 1] && c.status !== 'ok' && !ticked.has(c.date)).map(c => day(c.date, { month: 'short', day: 'numeric' }))
                  return <small>{t('fixedPage.renew.ask.range', { from: day(ds[0], { month: 'short', day: 'numeric' }), to: day(ds[ds.length - 1], { month: 'short', day: 'numeric' }) })}
                    {off.length > 0 ? ' ' + t('fixedPage.renew.ask.skipped', { dates: joinList(locale, off) }) : ''}</small>
                })()}</div>
              <p>{t('fixedPage.renew.ask.body', { points: total.toLocaleString(), left: Math.max(0, balance - total).toLocaleString() })}</p>
              {/* The same rule the first sign-up states (決定 4). */}
              <p>{t('booking.policy.fixedEnd')}</p>
              <div className="msa-dlg-acts">
                <button className="msa-dlg-no" onClick={() => setRenewAsk(false)} disabled={busy}>{t('common.no')}</button>
                <button className="msa-dlg-yes" disabled={busy}
                  onClick={async () => { await confirmRenew(); setRenewAsk(false) }}>{busy ? '…' : t('fixedPage.renew.ask.yes')}</button>
              </div>
            </div>
          </div>
        )}
        {leaveFor && fc && (
          <div className="msa-dlg-back" onClick={() => !leaving && setLeaveFor(null)}>
            <div ref={leaveBox} className="msa-dlg fc-leave" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="fc-leave-title">
              <div className="eb">{t('dash.cancelModal.eyebrowLeave')}</div>
              <h3 id="fc-leave-title">{t('dash.cancelModal.titleLeave')}</h3>
              <div className="what">{joinList(locale, fc.studentNames)} · {tDb(locale, 'course_types', fc.courseTypeId, fc.courseName)}
                <small>{day(leaveFor.date)} · {formatTime12h(leaveFor.start)}</small></div>
              <p>{t('dash.cancelModal.bodyLeaveWindow', {
                kind: t('voucher.kind.' + fc.courseSlug + (fc.courseSlug === '1on1' ? '.' + (fc.minutes === 60 ? 60 : 30) : fc.courseSlug === '1on2' && fc.minutes === 60 ? '.60' : '')),
                from: day(addDays(leaveFor.date, -14) > todayStr ? addDays(leaveFor.date, -14) : todayStr, { month: 'short', day: 'numeric' }),
                date: day(addDays(leaveFor.date, 14), { month: 'short', day: 'numeric' }),
              })}</p>
              <div className="msa-dlg-acts">
                <button className="msa-dlg-no" onClick={() => setLeaveFor(null)} disabled={leaving}>{t('common.no')}</button>
                <button className="msa-dlg-yes danger" onClick={takeLeave} disabled={leaving}>{leaving ? '…' : t('dash.cancelModal.yesLeave')}</button>
              </div>
            </div>
          </div>
        )}

        {!fc ? (
          <section className="ac-card ac-empty"><b>{t('fixedPage.notFound')}</b></section>
        ) : (
          <div className="ac-stack">
            {!viewer && (
              <div className="fc-acts">
                <button className="ac-btn line" aria-expanded={moveOpen} disabled={mBusy && !moveOpen}
                  onClick={() => { if (moveOpen) { setMoveOpen(false); return } setMoveOpen(true); setMsg(null); if (opts === null) loadOptions(); into(moveRef) }}>
                  {t('fixedPage.move.title')}
                </button>
                {fc.renewOpen && (
                  <button className="ac-btn gold" disabled={busy}
                    onClick={() => { setMsg(null); if (!renewOpenUI) loadRenew(WEEKS_STEP); into(renewRef) }}>
                    {t('fixedPage.renew.title')}
                  </button>
                )}
              </div>
            )}
            {!viewer && moveOpen && (
            <section className="ac-card" ref={moveRef} style={{ scrollMarginTop: 90 }}>
              <p className="ac-label">{t('fixedPage.move.title')}</p>
              <p className="ac-desc">{t('fixedPage.move.desc', { n: opts ? moving : fc.lessons.filter(l => !l.within24h).length })}</p>
              {staying.length > 0 && <p className="ac-note">{t('fixedPage.move.stay', { dates: joinList(locale, staying.map(d => day(d, { month: 'short', day: 'numeric' }))) })}</p>}
              {opts === null ? (
                <button className="ac-btn line" disabled={mBusy} onClick={loadOptions}>{mBusy ? t('fixedPage.move.loading') : t('fixedPage.move.show')}</button>
              ) : pick ? (
                <>
                  <b style={{ display: 'block', color: '#12254a', fontSize: 15 }}>
                    {t('fixedPage.move.planTitle', { weekday: weekdayName(pick.weekday), time: formatTime12h(pick.time), coach: optCoaches.get(pick.coachId) || '' })}
                  </b>
                  {mBusy && !plan && <p className="ac-note">{t('fixedPage.move.loading')}</p>}
                  {plan && (() => {
                    /* One sentence first, then the lesson-by-lesson list folded
                       (owner, 2026-11-04, 問題 8 選項 A). */
                    const go = plan.items.filter(i => i.to)
                    const by = (k: Item['kind']) => plan.items.filter(i => i.kind === k)
                    const moved = by('move'), later = by('later'), other = by('other_coach'), vouch = by('voucher')
                    const md = (d: string) => day(d, { month: 'short', day: 'numeric' })
                    const firstTo = moved.map(i => i.to!).sort()[0]
                    return (
                      <div className="fc-msum">
                        <b>{t('fixedPage.move.sumHead', { n: go.length })}</b>
                        <ul>
                          {moved.length > 0 && <li>{t('fixedPage.move.sumMove', { n: moved.length, weekday: weekdayName(pick.weekday), time: formatTime12h(pick.time), date: firstTo ? md(firstTo) : '' })}</li>}
                          {later.length > 0 && <li>{t('fixedPage.move.sumLater', { n: later.length, dates: joinList(locale, later.map(i => md(i.to!))) })}</li>}
                          {other.length > 0 && <li>{t('fixedPage.move.sumOther', { n: other.length, coach: joinList(locale, [...new Set(other.map(i => optCoaches.get(i.coachId || '') || ''))].filter(Boolean)) })}</li>}
                        </ul>
                        {/* Not under "N move": those N do not count it (50-role test, 2026-11-05). */}
                        {vouch.length > 0 && <p style={{ margin: '6px 0 0' }}>{t('fixedPage.move.sumVoucher', { n: vouch.length })}</p>}
                      </div>
                    )
                  })()}
                  {plan && (
                    <details className="fc-each">
                      <summary><span className="more">{t('fixedPage.move.seeEach')} ▾</span><span className="less">{t('fixedPage.move.hideEach')} ▴</span></summary>
                    <div className="fc-plan" style={{ marginTop: 4 }}>
                      {plan.items.map(i => (
                        <div key={i.from} className={i.to ? '' : 'v'}>
                          <span>{day(i.from, { month: 'short', day: 'numeric' })} {formatTime12h(fc.time)} → {i.to ? `${day(i.to)} ${formatTime12h(pick.time)}` : '—'}</span>
                          <span className="tag">
                            {i.kind === 'later' ? t('fixedPage.move.later') : i.kind === 'other_coach' ? t('fixedPage.move.other', { coach: optCoaches.get(i.coachId || '') || '' }) : i.kind === 'voucher' ? t('fixedPage.move.voucher') : ''}
                          </span>
                        </div>
                      ))}
                    </div>
                    </details>
                  )}
                  {plan && plan.items.some(i => !i.to) && <div className="fc-warn">{t('fixedPage.move.voucherNote', { n: plan.items.filter(i => !i.to).length })}</div>}
                  <div className="ac-pair" style={{ marginTop: 12 }}>
                    <button className="ac-btn line" disabled={mBusy} onClick={() => { setPick(null); setPlan(null); setMErr('') }}>{t('fixedPage.move.back')}</button>
                    <button className="ac-btn gold" disabled={mBusy || !plan} onClick={commit}>{t('fixedPage.move.confirm')}</button>
                  </div>
                </>
              ) : opts.length === 0 ? (
                <>
                  <p className="ac-note">{t('fixedPage.move.noneAsk')}</p>
                  <button type="button" className="ac-btn line" style={{ marginTop: 8 }} onClick={() => openChat('', { about: aboutClass(t('fixedPage.ask.move')) })}>{t('dash.up.messageUs')}</button>
                </>
              ) : (
                <>
                <div className="fc-days" role="tablist">
                  {optsByDay.map(([wd]) => (
                    <button key={wd} role="tab" aria-selected={wd === dayShown} className={'fc-dtab' + (wd === dayShown ? ' on' : '')} onClick={() => setOptDay(wd)}>
                      {weekdayName(wd)}
                    </button>
                  ))}
                </div>
                {optsByDay.filter(([wd]) => wd === dayShown).map(([wd, list]) => (
                  <div key={wd} className="fc-day">
                    <div className="fc-opts">
                      {list.map(o => (
                        <button key={`${o.time}|${o.coachId}`} className={'fc-opt' + (o.okWeeks < o.weeks ? ' part' : '')} onClick={() => preview(o)}>
                          <b>{formatTime12h(o.time)} · {optCoaches.get(o.coachId) || ''}</b>
                          <small>{t('fixedPage.move.weeks', { ok: o.okWeeks, n: o.weeks })} · {t('fixedPage.move.from', { date: day(o.startDate, { month: 'short', day: 'numeric' }) })}</small>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
                </>
              )}
              {mErr && <div className="ac-err">{mErr}</div>}
            </section>
            )}
            <section className="ac-card">
              <div className="ac-grid" style={{ marginTop: 0 }}>
                <div><div className="ac-k">{t('fixedPage.left')}</div><div className="ac-v">{t('fixedPage.leftN', { n: fc.left })}</div></div>
                {fc.next && <div><div className="ac-k">{t('fixedPage.next')}</div><div className="ac-v">{day(fc.next)}</div></div>}
                {fc.last && <div><div className="ac-k">{t('fixedPage.last')}</div><div className="ac-v">{day(fc.last)}</div></div>}
              </div>
              <div className="fc-lessons">
                {lessonMonths.map(m => (
                  <div key={m[0].date.slice(0, 7)} className="fc-month">
                    {m.map(l => {
                      const cls = subOf(l) ? 'fc-lesson sub' : 'fc-lesson'
                      const pool = perLessonPool && poolOf(l.locationId) ? poolOf(l.locationId)!.name : ''
                      const inner = <>
                        <span>{mmdd(l.date)}</span>
                        {subOf(l) && <small>{l.coachName}</small>}
                        {pool && <small>{pool}</small>}
                        {l.within24h && <em>{t('fixedPage.in24h')}</em>}
                      </>
                      const label = [day(l.date), subOf(l) ? l.coachName : '', pool, l.within24h ? t('fixedPage.in24h') : ''].filter(Boolean).join(' · ')
                      return !viewer && l.within24h && l.bookingId ? (
                        <button key={l.date} type="button" className={cls} aria-label={label} onClick={() => { setMsg(null); setIn24({ date: l.date, start: l.start }) }}>{inner}</button>
                      ) : viewer || l.within24h || !l.bookingId ? (
                        <span key={l.date} className={cls} aria-label={label} role="text">{inner}</span>
                      ) : (
                        <button key={l.date} type="button" className={cls} aria-label={label} title={t('fixedPage.leave.tap')}
                          onClick={() => { setMsg(null); setLeaveFor({ date: l.date, start: l.start, bookingId: l.bookingId! }) }}>{inner}</button>
                      )
                    })}
                  </div>
                ))}
              </div>
              <p className="ac-desc" style={{ margin: '10px 0 0' }}>{t(fam === 'viewer' ? 'fixedPage.viewerNote' : 'fixedPage.leave.hint')}</p>
            </section>

            {!viewer && <>

            <section className="ac-card" ref={renewRef} style={{ scrollMarginTop: 90 }}>
              <p className="ac-label">{t('fixedPage.renew.title')}</p>
              {!fc.renewOpen ? (
                <p className="ac-desc" style={{ marginBottom: 0 }}>
                  {fc.last ? t('fixedPage.renew.notYet', { date: day(addDays(fc.last, -21)) }) : ''}
                  {fc.holdUntil ? t('fixedPage.renew.held', { date: day(fc.holdUntil) }) : ''}
                </p>
              ) : (
                <>
                  <p className="ac-desc">
                    {t('fixedPage.renew.desc', { weekday: weekdayName(fc.weekday), time: formatTime12h(fc.time), date: day(renewStart), n: FIXED_CLASS_MIN_LESSONS })}
                    {fc.holdUntil ? t('fixedPage.renew.held', { date: day(fc.holdUntil) }) : ''}
                  </p>
                  {!renewOpenUI ? (
                    busy ? <p className="ac-note">{t('booking.recur.loading')}</p> : null
                  ) : (
                    <>
                      {owed > 0 && (
                        <div role="alert" className="ac-err" style={{ marginTop: 0, marginBottom: 12 }}>
                          <div style={{ fontWeight: 700, marginBottom: 8 }}>{t('booking.arrears.preview', { amount: owed.toLocaleString('en-US') })}</div>
                          <SettleArrearsButton owed={owed} className="ac-btn gold" />
                        </div>
                      )}
                      <div className="fc-chips">
                        {shown.map(c => {
                          if (c.status !== 'ok') return (
                            <div key={c.date} className="fc-chip off" role="img" aria-label={day(c.date, { month: 'long', day: 'numeric' }) + ' ' + t('booking.recur.coachOff')}><b>{day(c.date, { month: 'short', day: 'numeric' })}</b><small>{t('booking.recur.coachOff')}</small></div>
                          )
                          const on = ticked.has(c.date)
                          const room = on || total + (c.points ?? 0) <= balance
                          return (
                            <button key={c.date} type="button" className={'fc-chip' + (on ? ' on' : '')} disabled={!room} aria-pressed={on}
                              aria-label={day(c.date, { month: 'long', day: 'numeric' }) + ' ' + t('points.unit', { n: c.points ?? 0 })}
                              onClick={() => setTicked(prev => { const n = new Set(prev); if (n.has(c.date)) n.delete(c.date); else n.add(c.date); return n })}>
                              <b>{on && <Icon name="check" />}{on ? ' ' : ''}{day(c.date, { month: 'short', day: 'numeric' })}</b><small>{t('points.unit', { n: c.points ?? 0 })}</small>
                            </button>
                          )
                        })}
                      </div>
                      <button className="ac-btn line" style={{ marginTop: 8, padding: '6px 12px' }} disabled={busy}
                        onClick={() => loadRenew(weeks + WEEKS_STEP, new Set(ticked))}>{t('booking.recur.moreWeeks', { n: WEEKS_STEP })}</button>
                      {tenCost > 0 && tenCost > balance && (
                        <div className="ac-err">{t('booking.recur.notEnoughFor10', { n: FIXED_CLASS_MIN_LESSONS, need: tenCost, have: balance })}{' '}
                          <a href="/plans#buy">{t('booking.short.cta')} ›</a></div>
                      )}
                      <div className="fc-sum">
                        <div><span>{t('booking.recur.wouldAdd')}</span><span>{ticked.size}</span></div>
                        <div><span>{t('booking.recur.wouldTotal')}</span><span>{t('points.unit', { n: total.toLocaleString() })}</span></div>
                        <div><span>{t('booking.price.after')}</span><span>{t('points.unit', { n: Math.max(0, balance - total).toLocaleString() })}</span></div>
                      </div>
                      <div className="ac-pair" style={{ marginTop: 12, flexWrap: 'wrap' }}>
                        <button className="ac-btn line" style={{ flex: '1 1 120px' }} onClick={() => setRenewOpenUI(false)}>{t('common.cancel')}</button>
                        <button className="ac-btn gold" style={{ flex: '2 1 200px' }} disabled={busy || owed > 0 || ticked.size < FIXED_CLASS_MIN_LESSONS} onClick={() => setRenewAsk(true)}>
                          {ticked.size < FIXED_CLASS_MIN_LESSONS
                            ? t('booking.recur.needMore', { n: FIXED_CLASS_MIN_LESSONS, m: FIXED_CLASS_MIN_LESSONS - ticked.size })
                            : t('fixedPage.renew.confirm', { n: ticked.size, points: total })}
                        </button>
                      </div>
                    </>
                  )}
                  {err && <div className="ac-err">{err}</div>}
                </>
              )}
            </section>


            </>}
          </div>
        )}
      </div>
    </div>
  )
}
