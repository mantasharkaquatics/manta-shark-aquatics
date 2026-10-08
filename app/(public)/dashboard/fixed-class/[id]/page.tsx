'use client'

// One fixed class, from the family's side (docs/fixed-class-spec.md 4 and 5):
// what is left of it, renewing it (same slot, from the week after its last
// lesson, ten or more), and changing its slot (換時段). The dashboard line and
// the renewal email both land here; ?renew=1 opens the renewal straight away.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useLocale, useT } from '@/lib/i18n/provider'
import { tDb } from '@/lib/i18n'
import { errorKey } from '@/lib/i18n/errors'
import { ACCT_CSS } from '@/components/brand/AcctStyles'
import { formatTime12h } from '@/lib/date'
import { FIXED_CLASS_MIN_LESSONS } from '@/lib/booking-time'

type FC = {
  id: string; studentId: string; student2Id: string | null; studentNames: string[]
  courseSlug: string; courseName: string; courseTypeId: string; minutes: number
  coachId: string; coachName: string; weekday: number; time: string
  left: number; next: string | null; last: string | null
  renewOpen: boolean; holdUntil: string | null
  lessons: { date: string; start: string; coachName: string; within24h: boolean; bookingId: string | null }[]
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
.fc-chip.off { cursor: default; color: #a7b2c4; border-color: #e3ebf6; }
.fc-lessons { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
.fc-lesson { font-size: 13px; font-weight: 600; padding: 5px 10px; border-radius: 7px; background: #eef4fc; color: #16294a; }
.fc-lesson em { font-style: normal; font-weight: 700; color: #b06a00; margin-left: 4px; }
button.fc-lesson { font-family: inherit; border: 1px solid transparent; cursor: pointer; }
/* Hover only where there is a mouse: on a phone a tapped date or slot kept
   the hover look and read as selected (AGENTS.md; found 2026-10-08). */
@media (hover: hover) { button.fc-lesson:hover { border-color: #2050a0; background: #fff; } }
.fc-leave-back { position: fixed; inset: 0; background: rgba(14,29,59,0.55); display: flex; align-items: center; justify-content: center; z-index: 1000; padding: 20px; }
.fc-leave { background: #fff; border-radius: 20px; border: 1px solid #e3ebf6; padding: 28px; max-width: 380px; width: 100%; }
.fc-leave .eb { font-size: 11px; font-weight: 700; letter-spacing: 2px; color: #c0392b; margin-bottom: 8px; }
.fc-leave h3 { font-size: 20px; font-weight: 900; color: #16294a; margin: 0 0 14px; }
.fc-leave .what { background: #f6f9fd; border-radius: 10px; padding: 12px 14px; margin-bottom: 16px; font-size: 14px; font-weight: 600; color: #16294a; }
.fc-leave .what small { display: block; font-size: 12px; font-weight: 400; color: #56647d; margin-top: 3px; }
.fc-leave p { font-size: 13px; color: #56647d; line-height: 1.6; margin: 0 0 20px; }
.fc-leave .row { display: flex; gap: 10px; }
.fc-leave .row button { flex: 1; padding: 12px; border-radius: 10px; font-family: inherit; font-size: 13px; font-weight: 700; cursor: pointer; }
.fc-leave .keep { border: 1px solid #e3ebf6; background: transparent; color: #56647d; }
.fc-leave .go { border: none; background: #e05a4a; color: #fff; }
.fc-leave .go:disabled { opacity: .6; cursor: wait; }
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
.fc-warn { font-size: 13px; color: #9a5b00; background: #fdf3e1; border: 1px solid #f3dcae; border-radius: 9px; padding: 9px 12px; margin-top: 10px; line-height: 1.6; }
`

export default function FixedClassPage() {
  const t = useT()
  const locale = useLocale()
  const loc = locale === 'en' ? 'en-US' : locale === 'zh-Hans' ? 'zh-CN' : 'zh-TW'
  const params = useParams()
  const id = String((params as any)?.id || '')
  const tErr = (raw?: string | null, fb = 'cart.err.network') => { const k = errorKey(raw); return k ? t(k) : (raw || t(fb)) }
  const day = (d: string, o: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', weekday: 'short' }) =>
    new Date(d + 'T12:00:00Z').toLocaleDateString(loc, { ...o, timeZone: 'UTC' })
  const weekdayName = (wd: number) => day(`2026-01-${String(4 + wd).padStart(2, '0')}`, { weekday: 'long' })

  const [fc, setFc] = useState<FC | null>(null)
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  // Leave for any lesson more than 24 hours away -- the home page only lists
  // the next two weeks, and a family who knows of a trip months ahead takes
  // leave for it here (owner, 2026-10-02).
  const [leaveFor, setLeaveFor] = useState<{ date: string; start: string; bookingId: string } | null>(null)
  const [leaving, setLeaving] = useState(false)
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
      setMsg({ ok: true, text: from
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

  // ── Renewal ──────────────────────────────────────────────────────────
  const [renewOpenUI, setRenewOpenUI] = useState(false)
  const [cands, setCands] = useState<Cand[]>([])
  const [weeks, setWeeks] = useState(WEEKS_STEP)
  const [ticked, setTicked] = useState<Set<string>>(new Set())
  const [balance, setBalance] = useState(0)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const renewStart = fc?.last ? addDays(fc.last, 7) : ''
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
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) { setErr(tErr(j.error)); setBusy(false); return }
      const list: Cand[] = j.candidates || []
      setCands(list); setWeeks(w); setBalance(j.balance ?? 0); setRenewOpenUI(true)
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
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) { setErr(tErr(j.error)); setBusy(false); return }
      setMsg({ ok: true, text: t('fixedPage.renew.done', { n: j.booked ?? dates.length }) })
      setRenewOpenUI(false); setCands([]); setTicked(new Set())
      await load()
    } catch { setErr(t('cart.err.network')) }
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

  async function loadOptions() {
    if (!fc) return
    setMBusy(true); setMErr(''); setPick(null); setPlan(null)
    try {
      const res = await fetch('/api/bookings/fixed-move', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'options', fixed_class_id: fc.id }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) { setMErr(tErr(j.error)); setMBusy(false); return }
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
      if (!res.ok) { setMErr(tErr(j.error)); setMBusy(false); return }
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
      if (!res.ok) { setMErr(tErr(j.error)); setMBusy(false); return }
      const done = t('fixedPage.move.done', { weekday: weekdayName(pick.weekday), time: formatTime12h(pick.time) })
      const parts = [done]
      if (j.vouchers > 0) parts.push(t('fixedPage.move.doneVouchers', { n: j.vouchers }))
      // Lessons whose voucher could not be written stay on their old slot
      // (lib/fixed-move.ts step 4); say so rather than let the family think
      // every week moved.
      const stayed: number = Array.isArray(j.notMoved) ? j.notMoved.length : 0
      if (stayed > 0) parts.push(t('fixedPage.move.notMoved', { n: stayed }))
      setMsg({ ok: stayed === 0, text: parts.join(' ') })
      setOpts(null); setPick(null); setPlan(null)
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
              names: fc.studentNames.join(locale === 'en' ? ' & ' : '、'), course: tDb(locale, 'course_types', fc.courseTypeId, fc.courseName) + ' · ' + t('booking.lenMin', { n: fc.minutes }),
              weekday: weekdayName(fc.weekday), time: `${formatTime12h(fc.time)} – ${formatTime12h(endOf(fc.time, fc.minutes))}`, coach: fc.coachName,
            })}</p>
          )}
        </div>

        {msg && <div className="ac-card" style={{ marginBottom: 14 }}><div className={msg.ok ? 'ac-okmsg' : 'fc-warn'}>{msg.ok ? '✓ ' : ''}{msg.text}</div></div>}
        {leaveFor && fc && (
          <div className="fc-leave-back" onClick={() => !leaving && setLeaveFor(null)}>
            <div className="fc-leave" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true">
              <div className="eb">{t('dash.cancelModal.eyebrowLeave')}</div>
              <h3>{t('dash.cancelModal.titleLeave')}</h3>
              <div className="what">{tDb(locale, 'course_types', fc.courseTypeId, fc.courseName)}
                <small>{day(leaveFor.date)} · {formatTime12h(leaveFor.start)}</small></div>
              <p>{t('dash.cancelModal.bodyLeaveWindow', {
                kind: t('voucher.kind.' + fc.courseSlug + (fc.courseSlug === '1on1' ? '.' + (fc.minutes === 60 ? 60 : 30) : fc.courseSlug === '1on2' && fc.minutes === 60 ? '.60' : '')),
                from: day(addDays(leaveFor.date, -14) > todayStr ? addDays(leaveFor.date, -14) : todayStr, { month: 'short', day: 'numeric' }),
                date: day(addDays(leaveFor.date, 14), { month: 'short', day: 'numeric' }),
              })}</p>
              <div className="row">
                <button className="keep" onClick={() => setLeaveFor(null)} disabled={leaving}>{t('dash.cancelModal.keepLesson')}</button>
                <button className="go" onClick={takeLeave} disabled={leaving}>{leaving ? '…' : t('dash.cancelModal.yesLeave')}</button>
              </div>
            </div>
          </div>
        )}

        {!fc ? (
          <section className="ac-card ac-empty"><b>{t('fixedPage.notFound')}</b></section>
        ) : (
          <div className="ac-stack">
            <section className="ac-card">
              <div className="ac-grid" style={{ marginTop: 0 }}>
                <div><div className="ac-k">{t('fixedPage.left')}</div><div className="ac-v">{t('fixedPage.leftN', { n: fc.left })}</div></div>
                {fc.next && <div><div className="ac-k">{t('fixedPage.next')}</div><div className="ac-v">{day(fc.next)}</div></div>}
                {fc.last && <div><div className="ac-k">{t('fixedPage.last')}</div><div className="ac-v">{day(fc.last)}</div></div>}
              </div>
              <div className="fc-lessons">
                {fc.lessons.map(l => l.within24h || !l.bookingId ? (
                  <span key={l.date} className="fc-lesson">{day(l.date, { month: 'short', day: 'numeric' })}{l.within24h && <em>{t('fixedPage.in24h')}</em>}</span>
                ) : (
                  <button key={l.date} className="fc-lesson" title={t('fixedPage.leave.tap')}
                    onClick={() => { setMsg(null); setLeaveFor({ date: l.date, start: l.start, bookingId: l.bookingId! }) }}>
                    {day(l.date, { month: 'short', day: 'numeric' })}
                  </button>
                ))}
              </div>
              <p className="ac-desc" style={{ margin: '10px 0 0' }}>{t('fixedPage.leave.hint')}</p>
            </section>

            <section className="ac-card">
              <p className="ac-label">{t('fixedPage.renew.title')}</p>
              {!fc.renewOpen ? (
                <p className="ac-desc" style={{ marginBottom: 0 }}>
                  {fc.last ? t('fixedPage.renew.notYet', { date: day(addDays(fc.last, -21)) }) : ''}
                  {fc.holdUntil ? ' ' + t('fixedPage.renew.held', { date: day(fc.holdUntil) }) : ''}
                </p>
              ) : (
                <>
                  <p className="ac-desc">
                    {t('fixedPage.renew.desc', { weekday: weekdayName(fc.weekday), time: formatTime12h(fc.time), date: day(renewStart), n: FIXED_CLASS_MIN_LESSONS })}
                    {fc.holdUntil ? ' ' + t('fixedPage.renew.held', { date: day(fc.holdUntil) }) : ''}
                  </p>
                  {!renewOpenUI ? (
                    <button className="ac-btn gold" disabled={busy} onClick={() => loadRenew(WEEKS_STEP)}>
                      {busy ? t('booking.recur.loading') : t('fixedPage.renew.pick')}
                    </button>
                  ) : (
                    <>
                      <div className="fc-chips">
                        {shown.map(c => {
                          if (c.status !== 'ok') return (
                            <div key={c.date} className="fc-chip off"><b>{day(c.date, { month: 'short', day: 'numeric' })}</b><small>{t('booking.recur.coachOff')}</small></div>
                          )
                          const on = ticked.has(c.date)
                          const room = on || total + (c.points ?? 0) <= balance
                          return (
                            <button key={c.date} className={'fc-chip' + (on ? ' on' : '')} disabled={!room}
                              onClick={() => setTicked(prev => { const n = new Set(prev); if (n.has(c.date)) n.delete(c.date); else n.add(c.date); return n })}>
                              <b>{day(c.date, { month: 'short', day: 'numeric' })}</b><small>{t('points.unit', { n: c.points ?? 0 })}</small>
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
                        <div><span>{t('booking.recur.wouldTotal')}</span><span>{t('points.unit', { n: total })}</span></div>
                        <div><span>{t('booking.price.after')}</span><span>{t('points.unit', { n: Math.max(0, balance - total) })}</span></div>
                      </div>
                      <div className="ac-pair" style={{ marginTop: 12 }}>
                        <button className="ac-btn line" onClick={() => setRenewOpenUI(false)}>{t('common.cancel')}</button>
                        <button className="ac-btn gold" disabled={busy || ticked.size < FIXED_CLASS_MIN_LESSONS} onClick={confirmRenew}>
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

            <section className="ac-card">
              <p className="ac-label">{t('fixedPage.move.title')}</p>
              <p className="ac-desc">{t('fixedPage.move.desc', { n: opts ? moving : fc.lessons.filter(l => !l.within24h).length })}</p>
              {staying.length > 0 && <p className="ac-note">{t('fixedPage.move.stay', { dates: staying.map(d => day(d, { month: 'short', day: 'numeric' })).join(locale === 'en' ? ', ' : '、') })}</p>}
              {opts === null ? (
                <button className="ac-btn line" disabled={mBusy} onClick={loadOptions}>{mBusy ? t('fixedPage.move.loading') : t('fixedPage.move.show')}</button>
              ) : pick ? (
                <>
                  <b style={{ display: 'block', color: '#12254a', fontSize: 15 }}>
                    {t('fixedPage.move.planTitle', { weekday: weekdayName(pick.weekday), time: formatTime12h(pick.time), coach: optCoaches.get(pick.coachId) || '' })}
                  </b>
                  {mBusy && !plan && <p className="ac-note">{t('fixedPage.move.loading')}</p>}
                  {plan && (
                    <div className="fc-plan">
                      {plan.items.map(i => (
                        <div key={i.from} className={i.to ? '' : 'v'}>
                          <span>{day(i.from, { month: 'short', day: 'numeric' })} {formatTime12h(fc.time)} → {i.to ? `${day(i.to)} ${formatTime12h(pick.time)}` : '—'}</span>
                          <span className="tag">
                            {i.kind === 'later' ? t('fixedPage.move.later') : i.kind === 'other_coach' ? t('fixedPage.move.other', { coach: optCoaches.get(i.coachId || '') || '' }) : i.kind === 'voucher' ? t('fixedPage.move.voucher') : ''}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                  {plan && plan.items.some(i => !i.to) && <div className="fc-warn">{t('fixedPage.move.voucherNote', { n: plan.items.filter(i => !i.to).length })}</div>}
                  <div className="ac-pair" style={{ marginTop: 12 }}>
                    <button className="ac-btn line" disabled={mBusy} onClick={() => { setPick(null); setPlan(null); setMErr('') }}>{t('fixedPage.move.back')}</button>
                    <button className="ac-btn gold" disabled={mBusy || !plan} onClick={commit}>{t('fixedPage.move.confirm')}</button>
                  </div>
                </>
              ) : opts.length === 0 ? (
                <p className="ac-note">{t('fixedPage.move.none')}</p>
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
          </div>
        )}
      </div>
    </div>
  )
}
