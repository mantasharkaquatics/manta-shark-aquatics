'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useT, useLocale } from '@/lib/i18n/provider'
import { dateTag, tDb } from '@/lib/i18n'
import { errorKey } from '@/lib/i18n/errors'
import { priceLesson, BASE_POINTS, OFF_PEAK_ENABLED, OFF_PEAK_DISCOUNT } from '@/lib/points'
import { singleMaxDate, FIXED_CLASS_MIN_LESSONS, SINGLE_BOOKING_DAYS } from '@/lib/booking-time'
import { getTodayLA, SLOT_STEP_MINUTES } from '@/lib/date'
import { BRAND } from '@/lib/brand'
import { openChat } from '@/lib/chat-open'
import { APP_BACK_EVENT } from '@/lib/app-back'
import { SectionTitle, DoneRow, SelectCard, StepBar, COURSE_COLORS, COURSE_ICONS } from './parts'
import { fmtDate } from '@/lib/fmt-date'

/* Several of the family's swimmers booked together (owner, 2026-11-03),
   opened when two or more children are ticked on the booking page's first
   step. Replaces SiblingBooking (two children, single lessons only).

   - 上什麼課: 1-on-1 (each child their own coach) or the 1-on-4 group class
     (all in the same class). With exactly two children, 1-on-2 too (owner,
     2026-11-04, 問題 5 選項 A): it is not booked here but hands both
     children to the booking page's own 1-on-2 flow (`onPair`).
   - 要怎麼上: every week (a fixed class each, the same weeks for all) or once
     (within the 14-day window).
   - When (version A of two): only the times every chosen child can have.
     1-on-1 offers 同時上 (one coach each, at the same time -- no waiting,
     the reason for all this) or 前後連著上 (one coach, one after another).
     Tapping a time lists each child with the coach they get, each with 換.
   - Every week then shows the weeks every child can have at that time (each
     child's fixed-class preview, /api/bookings/recurring, intersected); the
     first ten are ticked, a tap skips a week.
   - /api/bookings/family books everyone or no one.

   Reads the same sources the one-child page reads: /api/bookings/openings
   (1-on-1, 60 days, per child) and /api/bookings/group-classes (per child). */

type Kid = { id: string; full_name: string; current_level: number | null }
type Course = { id: string; slug: string; name: string; duration_minutes?: number; max_students?: number }
type Slug = '1on1' | '1on4'
type Way = 'weekly' | 'single'
type Arr = 'same' | 'b2b'
type Days = Record<string, Record<string, string[]>>
type GClass = { time: string; end_time: string; coach_id: string; coach_name: string; enrolled: number; max: number; full: boolean; already_booked?: boolean }
type GDays = { date: string; classes: GClass[] }[]
/** One time on the list: when it first works (ds) and, for a group class, whose class. */
type Opt = { key: string; ds: string; time: string; coach?: string; coachName?: string }
/** Who teaches whom, and at what time, for the chosen time. */
type Plan = { kid: string; coach: string; time: string }[]
type Cand = { date: string; status: string; spots?: number; points?: number | null }

const NAVY = BRAND.navy
// The booking page's selection colour (its GOLD is the logo blue).
const GOLD = BRAND.blue
const AMBER = BRAND.amber
const toMin = (t: string) => { const [h, m] = t.slice(0, 5).split(':').map(Number); return h * 60 + m }
const toHm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
const later = (t: string, steps: number) => toHm(toMin(t) + SLOT_STEP_MINUTES * steps)
const addDays = (ds: string, n: number) => { const d = new Date(ds + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }
const dowOf = (ds: string) => new Date(ds + 'T12:00:00Z').getUTCDay()
const t12 = (hm: string) => { const [h, m] = hm.split(':').map(Number); return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}` }
/** 09:10, 02:00 -- for a list already headed 上午 / 下午 (as the one-child page). */
const hh12 = (tm: string) => { const [h, m] = tm.slice(0, 5).split(':').map(Number); return `${String(h % 12 || 12).padStart(2, '0')}:${String(m).padStart(2, '0')}` }
const scrollTo = (el: HTMLElement | null) => { if (el) requestAnimationFrame(() => el.scrollIntoView({ behavior: 'smooth', block: 'start' })) }
function perms<T>(a: T[]): T[][] { return a.length <= 1 ? [a] : a.flatMap((x, i) => perms([...a.slice(0, i), ...a.slice(i + 1)]).map(p => [x, ...p])) }

/** One coach per child, no coach twice: the first way that works, or null. */
function matchCoaches(sets: string[][], taken: Set<string> = new Set()): string[] | null {
  if (sets.length === 0) return []
  for (const c of sets[0]) {
    if (taken.has(c)) continue
    const rest = matchCoaches(sets.slice(1), new Set([...taken, c]))
    if (rest) return [c, ...rest]
  }
  return null
}

export default function FamilyBooking({ kids, courses, location, balance, face, onExit, onPair }: {
  kids: Kid[]; courses: Course[]; location: string | null; balance: number
  face: (k: Kid) => React.ReactNode; onExit: () => void
  /** Two children: book them as a 1-on-2 on the booking page instead. */
  onPair?: () => void
}) {
  const t = useT()
  const locale = useLocale()
  const dateLoc = dateTag(locale as never)
  const today = getTodayLA()
  const n = kids.length
  const [slug, setSlug] = useState<Slug | null>(null)
  const [way, setWay] = useState<Way | null>(null)
  const [arr, setArr] = useState<Arr>('same')
  const [open1, setOpen1] = useState<Days[] | null>(null)
  const [openG, setOpenG] = useState<GDays[] | null>(null)
  const [coachNames, setCoachNames] = useState<Record<string, string>>({})
  const [day, setDay] = useState<string | number | null>(null) // a date (once) or a weekday (every week)
  const [opt, setOpt] = useState<Opt | null>(null)
  const [plan, setPlan] = useState<Plan | null>(null)
  const [swap, setSwap] = useState<string | null>(null) // the child whose coach list is open
  const [weeks, setWeeks] = useState(26)
  const [refresh, setRefresh] = useState(0)
  const [cands, setCands] = useState<Cand[][] | null>(null)
  const [ticked, setTicked] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const locQ = location ? `&location=${encodeURIComponent(location)}` : ''
  const course = courses.find(c => c.slug === slug) || null
  const kidName = (id: string) => kids.find(k => k.id === id)?.full_name || ''
  const coachName = (id: string) => coachNames[id] || ''
  const wkName = (dow: number) => fmtDate(new Date(2026, 10, 1 + dow), dateLoc, { weekday: 'long' })
  const mdOf = (ds: string) => fmtDate(new Date(ds + 'T12:00:00Z'), dateLoc, { month: '2-digit', day: '2-digit', timeZone: 'UTC' })
  const dayLabel = (ds: string) => fmtDate(new Date(ds + 'T12:00:00Z'), dateLoc, { weekday: 'short', month: 'numeric', day: 'numeric', timeZone: 'UTC' })
  const lastSingle = singleMaxDate(today)
  const timesRef = useRef<HTMLDivElement>(null)
  const planRef = useRef<HTMLDivElement>(null)

  // Each child's open times, read once per course.
  useEffect(() => {
    if (!slug) return
    let live = true
    if (slug === '1on1') {
      Promise.all(kids.map(k => fetch(`/api/bookings/openings?course_slug=1on1&student_id=${k.id}${locQ}`).then(r => (r.ok ? r.json() : null)).catch(() => null)))
        .then(rs => {
          if (!live) return
          const names: Record<string, string> = {}
          for (const r of rs) for (const c of (r?.coaches || [])) names[c.id] = c.first_name
          setCoachNames(names)
          setOpen1(rs.map(r => (r?.days || {}) as Days))
        })
    } else {
      const d = new Date(today + 'T12:00:00Z'); const sun = addDays(today, -d.getUTCDay())
      Promise.all(kids.map(k => fetch(`/api/bookings/group-classes?student_id=${k.id}&weeks=9&start=${sun}${locQ}`).then(r => (r.ok ? r.json() : null)).catch(() => null)))
        .then(rs => {
          if (!live) return
          const names: Record<string, string> = {}
          for (const r of rs) for (const dd of (r?.days || [])) for (const c of dd.classes) names[c.coach_id] = c.coach_name
          setCoachNames(names)
          setOpenG(rs.map(r => (r?.days || []) as GDays))
        })
    }
    return () => { live = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, locQ])
  const loading = !!slug && (slug === '1on1' ? !open1 : !openG)

  /** Every way the children can be placed at this date and time. */
  function plansAt(ds: string, time: string, coach?: string): Plan[] {
    if (slug === '1on4') {
      if (!openG) return []
      const cls = openG.map(g => g.find(x => x.date === ds)?.classes.find(c => c.time === time && c.coach_id === coach))
      if (cls.some(c => !c || c.full || c.already_booked) || cls[0]!.max - cls[0]!.enrolled < n) return []
      return [kids.map(k => ({ kid: k.id, coach: coach!, time }))]
    }
    if (!open1) return []
    const at = (i: number, tm: string) => open1[i]?.[ds]?.[tm] || []
    if (arr === 'same') {
      const m = matchCoaches(kids.map((_, i) => at(i, time)))
      return m ? [kids.map((k, i) => ({ kid: k.id, coach: m[i], time }))] : []
    }
    // Back to back with one coach: each order of the children, each coach free for all of them.
    const out: Plan[] = []
    for (const order of perms(kids.map((_, i) => i))) {
      const common = order.reduce<string[] | null>((acc, ki, pos) => { const s = at(ki, later(time, pos)); return acc ? acc.filter(c => s.includes(c)) : s }, null) || []
      for (const c of common) out.push(order.map((ki, pos) => ({ kid: kids[ki].id, coach: c, time: later(time, pos) })))
    }
    return out
  }

  /** The times on one day (once) or one weekday (every week), each with the first date it works. */
  const dates = useMemo(() => {
    if (slug === '1on1' && open1) return [...new Set(open1.flatMap(d => Object.keys(d)))].sort()
    if (slug === '1on4' && openG) return [...new Set(openG.flatMap(g => g.map(d => d.date)))].sort()
    return []
  }, [slug, open1, openG])
  function optsOn(ds: string): Opt[] {
    if (slug === '1on4') {
      const seen = new Map<string, Opt>()
      for (const c of openG?.[0]?.find(d => d.date === ds)?.classes || []) {
        const key = `${c.coach_id}|${c.time}`
        if (!seen.has(key) && plansAt(ds, c.time, c.coach_id).length) seen.set(key, { key, ds, time: c.time, coach: c.coach_id, coachName: c.coach_name })
      }
      return [...seen.values()]
    }
    const times = [...new Set((open1 || []).flatMap(d => Object.keys(d[ds] || {})))].sort()
    return times.filter(tm => plansAt(ds, tm).length).map(tm => ({ key: tm, ds, time: tm }))
  }
  const optsFor = (d: string | number): Opt[] => {
    if (typeof d === 'string') return optsOn(d)
    const first = new Map<string, Opt>()
    for (const ds of dates) if (dowOf(ds) === d && ds >= today) for (const o of optsOn(ds)) if (!first.has(o.key)) first.set(o.key, o)
    return [...first.values()].sort((a, b) => a.time.localeCompare(b.time) || (a.coachName || '').localeCompare(b.coachName || ''))
  }
  const singleDays: string[] = []
  for (let d = today; d <= lastSingle; d = addDays(d, 1)) singleDays.push(d)
  const countFor = new Map<string | number, number>((way === 'weekly' ? [1, 2, 3, 4, 5, 6, 0] : singleDays).map(d => [d, loading ? 0 : optsFor(d).length]))

  function reset(level: 'slug' | 'way' | 'day' | 'opt') {
    if (level === 'slug') { setWay(null); setArr('same') }
    if (level === 'slug' || level === 'way') setDay(null)
    setOpt(null); setPlan(null); setSwap(null); setCands(null); setTicked(new Set()); setWeeks(26); setErr(null)
  }
  /* The Android back button, one step at a time -- the chosen time, then the
     day, the way, the course, and only then out to choosing children
     (50-role test, 2026-11-05: it went straight back to the first step).
     Once booked it leaves the page. */
  const back = useRef<() => boolean>(() => false)
  useEffect(() => {
    back.current = () => {
      if (done) return false
      if (opt) { reset('opt'); return true }
      if (day != null) { setDay(null); reset('day'); return true }
      if (way) { setWay(null); reset('way'); return true }
      if (slug) { setSlug(null); reset('slug'); return true }
      onExit(); return true
    }
  })
  useEffect(() => {
    const on = (e: Event) => { if (!e.defaultPrevented && back.current()) e.preventDefault() }
    window.addEventListener(APP_BACK_EVENT, on)
    return () => window.removeEventListener(APP_BACK_EVENT, on)
  }, [])
  function pickOpt(o: Opt) {
    const p = plansAt(o.ds, o.time, o.coach)[0]
    if (!p) return
    setOpt(o); setPlan(p); setSwap(null); setCands(null); setTicked(new Set()); setWeeks(26); setErr(null)
  }
  // The plan opens under the list: bring it up once it is there.
  useEffect(() => { if (opt) scrollTo(planRef.current) }, [opt])
  useEffect(() => { if (day != null) scrollTo(timesRef.current) }, [day])

  // Every week: each child's fixed-class grid at their coach and time, side by side.
  useEffect(() => {
    if (way !== 'weekly' || !opt || !plan || !slug) return
    let live = true
    Promise.all(plan.map(p => fetch('/api/bookings/recurring', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'preview', course_slug: slug, student_id: p.kid, coach_id: p.coach, start_time: p.time, start_date: opt.ds, weeks, location }),
    }).then(r => (r.ok ? r.json() : null)).catch(() => null)))
      .then(rs => { if (live) setCands(rs.map(r => (r?.candidates || []) as Cand[])) })
    return () => { live = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [way, opt?.key, opt?.ds, JSON.stringify(plan), weeks, refresh, slug, location])
  const weekRows = useMemo(() => {
    if (!cands || cands.length === 0) return []
    return cands[0].map(c0 => {
      const all = cands.map(cs => cs.find(c => c.date === c0.date))
      const ok = all.every(c => c?.status === 'ok') && (slug !== '1on4' || Math.min(...all.map(c => c?.spots ?? 0)) >= n)
      return { date: c0.date, ok, points: all.reduce((s, c) => s + (c?.points ?? 0), 0), soon: c0.status === 'too_soon' }
    }).filter(r => !r.soon)
  }, [cands, slug, n])
  // The first ten open weeks ticked, once per time chosen.
  const tickedFor = useRef('')
  useEffect(() => {
    const k = `${opt?.key}|${JSON.stringify(plan)}`
    if (!weekRows.length || tickedFor.current === k) return
    tickedFor.current = k
    setTicked(new Set(weekRows.filter(r => r.ok).slice(0, FIXED_CLASS_MIN_LESSONS).map(r => r.date)))
  }, [weekRows, opt?.key, plan])

  const priceOf = (ds: string, time: string) => { try { return priceLesson({ courseSlug: slug || '1on1', minutes: 30, sessionDate: ds, startTime: time, seats: 1 }).charged } catch { return 0 } }
  const total = !plan || !opt ? 0 : way === 'weekly'
    ? weekRows.filter(r => ticked.has(r.date)).reduce((s, r) => s + r.points, 0)
    : plan.reduce((s, p) => s + priceOf(opt.ds, p.time), 0)
  const enough = way !== 'weekly' || ticked.size >= FIXED_CLASS_MIN_LESSONS

  // Asked once before booking (2026-11-04: one tap took 1,300 points with no
  // last look -- the one-child flow has its own confirm page).
  const [asking, setAsking] = useState(false)
  async function confirm() {
    setAsking(false)
    if (!plan || !opt || !slug || !way) return
    setBusy(true); setErr(null)
    const dts = way === 'weekly' ? [...ticked].sort() : [opt.ds]
    const r = await fetch('/api/bookings/family', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: way, course_slug: slug, lessons: plan.map(p => ({ student_id: p.kid, coach_id: p.coach, time: p.time, dates: dts })) }),
    }).catch(() => null)
    const d = r ? await r.json().catch(() => ({})) : {}
    setBusy(false)
    if (r?.ok) { setDone(true); window.scrollTo(0, 0); return }
    const who = typeof d.which === 'number' && plan[d.which] ? `${kidName(plan[d.which].kid)}：` : ''
    const k = d.code === 'week_gone' ? 'fam.err.weekGone' : d.error === 'NOT_ENOUGH_POINTS' ? null : errorKey(d.error)
    setErr(who + (d.error === 'NOT_ENOUGH_POINTS' ? t('booking.short.body', { have: balance.toLocaleString(), need: total.toLocaleString() }) : k ? t(k) : t('fam.err.generic')))
    // What was there may be gone now: read it again.
    if (way === 'weekly') setRefresh(x => x + 1)
  }

  // ── look ──
  const box: React.CSSProperties = { background: '#fff', border: '1px solid #e3ebf6', borderRadius: 14, padding: 16, marginBottom: 14 }
  const head: React.CSSProperties = { fontSize: 14, fontWeight: 700, color: '#56647d', margin: '0 0 10px' }

  if (done) return (
    <div style={box} role="status">
      <h2 style={{ margin: '0 0 8px', fontSize: 20, color: NAVY }}>✅ {t('fam.doneTitle')}</h2>
      <p style={{ margin: '0 0 14px', color: '#16294a', lineHeight: 1.6 }}>{t('fam.doneBody')}</p>
      <Link href="/dashboard/schedule" style={{ display: 'inline-block', padding: '12px 20px', borderRadius: 10, background: AMBER, color: NAVY, fontWeight: 800, textDecoration: 'none' }}>{t('fam.toSchedule')}</Link>
    </div>
  )

  const list = day == null || loading ? [] : optsFor(day)
  const weekly = way === 'weekly'
  // The date most times start on is said once, under the heading, as on the
  // one-child page (owner, 2026-11-02); a time that starts later keeps its own.
  const starts = new Map<string, number>()
  for (const o of list) starts.set(o.ds, (starts.get(o.ds) || 0) + 1)
  const mainStart = weekly ? [...starts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? null : null
  return (
    <div>
      {/* As the one-child page looks (owner, 2026-11-04, 問題 6 選項 A): its step
          bar, answered lines, titles and cards (./parts). */}
      <StepBar steps={['who', 'course', 'way', 'time']} at={!slug ? 1 : !way ? 2 : 3} />
      <div style={{ marginBottom: 20 }}>
        <DoneRow changeLabel={t('booking.change')} label={t('booking.sum.swimmers')} value={kids.map(k => k.full_name).join(' ＋ ')} onChange={onExit} />
        {slug && <DoneRow changeLabel={t('booking.change')} label={t('booking.sum.course')} value={tDb(locale as never, 'course_types', course!.id, course!.name)} onChange={() => { setSlug(null); reset('slug') }} />}
        {slug && way && <DoneRow changeLabel={t('booking.change')} label={t('booking.sum.way')} value={t(weekly ? 'booking.way.fixed' : 'booking.way.single')} onChange={() => { setWay(null); reset('way') }} />}
      </div>

      {!slug && (
        <section>
          <SectionTitle title={t('booking.s2.title')} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {(['1on1', ...(n === 2 && onPair ? ['1on2'] : []), '1on4'] as const).map(sl => courses.find(c => c.slug === sl)).filter((c): c is Course => !!c).map(c => {
              const color = COURSE_COLORS[c.slug] || GOLD
              return (
                <SelectCard key={c.slug} selected={false} color={color} onClick={() => {
                  if (c.slug === '1on2') { onPair?.(); return }
                  setOpen1(null); setOpenG(null); setSlug(c.slug as Slug); reset('slug')
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0 }}>
                      <span style={{ fontSize: 28 }} aria-hidden="true">{COURSE_ICONS[c.slug]}</span>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 16, fontWeight: 700, color: '#16294a', marginBottom: 2 }}>{tDb(locale as never, 'course_types', c.id, c.name)}</div>
                        {c.duration_minutes != null && c.max_students != null && (
                          <div style={{ fontSize: 13, color: '#56647d' }}>{t(c.max_students > 1 ? 'booking.courseMeta' : 'booking.courseMetaOne', { n: c.duration_minutes, max: c.max_students })}</div>
                        )}
                        <div style={{ fontSize: 13, color: '#56647d', marginTop: 2 }}>{t(c.slug === '1on1' ? 'fam.c1on1Hint' : c.slug === '1on2' ? 'fam.c1on2Hint' : 'fam.c1on4Hint', { n })}</div>
                      </div>
                    </div>
                    {BASE_POINTS[c.slug] != null && (
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <div style={{ display: 'inline-block', background: `${color}20`, border: `1px solid ${color}40`, borderRadius: 20, padding: '4px 12px',
                          fontSize: 13, fontWeight: 700, color, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{t('points.unit', { n: BASE_POINTS[c.slug] })}</div>
                        <div style={{ fontSize: 12, color: '#56647d', marginTop: 4 }}>{t('booking.perSwimmerShort')}</div>
                      </div>
                    )}
                  </div>
                </SelectCard>
              )
            })}
          </div>
        </section>
      )}

      {slug && !way && (() => {
        const tick = (x: string) => (
          <li style={{ display: 'flex', gap: 7, alignItems: 'flex-start', fontSize: 13.5, lineHeight: 1.5, color: '#2c3d5c' }}>
            <span aria-hidden style={{ color: '#1f7a57', fontWeight: 900 }}>✓</span><span>{x}</span>
          </li>
        )
        // The cheapest a lesson can be, for every child (as the one-child page's cheapestFor).
        const from1 = Math.floor((BASE_POINTS[slug] ?? 0) * (1 - (OFF_PEAK_ENABLED ? OFF_PEAK_DISCOUNT : 0))) * n
        const wcard = (w: Way, body: React.ReactNode) => (
          <button type="button" className="kb-focus" onClick={() => { setWay(w); reset('way') }}
            style={{ width: '100%', textAlign: 'left', cursor: 'pointer', borderRadius: 16, padding: '14px 18px', fontFamily: 'inherit',
              border: `2px solid ${w === 'weekly' ? AMBER : '#e3ebf6'}`, background: w === 'weekly' ? '#fff8ec' : '#fff', color: NAVY }}>
            {body}
          </button>
        )
        const ticks: React.CSSProperties = { listStyle: 'none', margin: '8px 0 0', padding: 0, display: 'flex', flexDirection: 'column', gap: 2 }
        return (
          <section>
            <SectionTitle title={t('booking.way.title')} gap={14} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {wcard('weekly', <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 17, fontWeight: 800 }}>{t('booking.way.fixed')}</span>
                  <span style={{ fontSize: 12, fontWeight: 800, background: AMBER, color: NAVY, borderRadius: 999, padding: '2px 9px' }}>{t('booking.way.recommended')}</span>
                </div>
                <ul className="bk-ticks" style={ticks}>{tick(t('fam.weeklyHint'))}{tick(t('booking.way.fixed2'))}{tick(t('booking.way.fixed3'))}</ul>
                <div style={{ marginTop: 8, fontSize: 14, fontWeight: 800, color: '#1f5fbf' }}>
                  {t('booking.way.fixedFrom', { n: FIXED_CLASS_MIN_LESSONS, points: (from1 * FIXED_CLASS_MIN_LESSONS).toLocaleString('en-US') })} ›
                </div>
              </>)}
              {wcard('single', <>
                <div style={{ fontSize: 17, fontWeight: 800 }}>{t('booking.way.single')}</div>
                <ul className="bk-ticks" style={ticks}>{tick(t('booking.way.single1', { n: SINGLE_BOOKING_DAYS }))}{tick(t('booking.way.single2'))}</ul>
                <div style={{ marginTop: 8, fontSize: 14, fontWeight: 800, color: '#1f5fbf' }}>
                  {t('booking.way.singleFrom', { points: from1.toLocaleString('en-US') })} ›
                </div>
              </>)}
            </div>
          </section>
        )
      })()}

      {slug && way && (
        <section>
          <SectionTitle title={t(weekly ? 'booking.fixed.title' : 'booking.s4.title')} gap={14} />
          {slug === '1on1' && (
            <div role="radiogroup" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, padding: 4, background: '#e9eff7', borderRadius: 12, marginBottom: 14 }}>
              {(['same', 'b2b'] as const).map(a => (
                <button key={a} type="button" role="radio" aria-checked={arr === a} className="tap-auto" onClick={() => { if (arr !== a) { setArr(a); reset('day') } }}
                  style={{ padding: '10px 6px', borderRadius: 9, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13.5, fontWeight: 800, lineHeight: 1.3,
                    background: arr === a ? '#fff' : 'transparent', color: arr === a ? NAVY : '#56647d', boxShadow: arr === a ? '0 1px 3px rgba(22,41,74,.15)' : 'none' }}>
                  {t(a === 'same' ? 'fam.same' : 'fam.b2b')}
                </button>
              ))}
            </div>
          )}
          <p style={head}>{t(weekly ? 'booking.fixed.dayQ' : 'fam.dateQ')}</p>
          {weekly ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 6 }}>
              {[1, 2, 3, 4, 5, 6, 0].map(d => {
                const has = (countFor.get(d) || 0) > 0, on = day === d
                return (
                  <button key={d} type="button" disabled={!has} aria-pressed={on} aria-label={wkName(d)}
                    onClick={() => { setDay(d); reset('day') }}
                    style={{ minHeight: 46, borderRadius: 12, fontSize: 16, fontWeight: 800, cursor: has ? 'pointer' : 'not-allowed', fontFamily: 'inherit',
                      border: `1.5px solid ${on ? NAVY : has ? '#d3deec' : '#e3ebf6'}`, background: on ? NAVY : has ? '#fff' : '#f6f9fd', color: on ? '#fff' : has ? NAVY : '#b7c2d4' }}>
                    {t('date.weekdayShort.' + d)}
                  </button>
                )
              })}
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 8, overflowX: 'auto', padding: '2px 2px 8px' }}>
              {singleDays.map(d => {
                const has = (countFor.get(d) || 0) > 0, on = day === d
                return (
                  <button key={d} type="button" disabled={!has} aria-pressed={on} onClick={() => { setDay(d); reset('day') }}
                    style={{ flex: '0 0 auto', padding: '10px 12px', borderRadius: 12, fontSize: 14, fontWeight: 800, cursor: has ? 'pointer' : 'not-allowed', fontFamily: 'inherit',
                      border: `1.5px solid ${on ? NAVY : has ? '#d3deec' : '#e3ebf6'}`, background: on ? NAVY : has ? '#fff' : '#f6f9fd', color: on ? '#fff' : has ? NAVY : '#b7c2d4' }}>
                    {dayLabel(d)}
                  </button>
                )
              })}
            </div>
          )}
          {loading && <p style={{ color: '#56647d', textAlign: 'center' }}>{t('booking.loading')}</p>}
          {!loading && [...countFor.values()].every(v => !v) && (
            <div style={{ marginTop: 14, textAlign: 'center' }}>
              <p style={{ margin: 0, fontSize: 14, color: '#56647d', lineHeight: 1.6 }}>{t(slug === '1on1' && arr === 'same' ? 'fam.noDaysSame' : 'fam.noDays')}</p>
              {/* What to do next, as on the one-child page. */}
              <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap', marginTop: 12 }}>
                {weekly && (
                  <button type="button" onClick={() => { setWay('single'); reset('way') }}
                    style={{ padding: '10px 16px', borderRadius: 10, border: 'none', background: AMBER, color: NAVY, fontWeight: 800, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}>
                    {t('booking.fixed.toSingle')}
                  </button>
                )}
                <button type="button" onClick={() => openChat()}
                  style={{ padding: '10px 16px', borderRadius: 10, border: '1px solid #c9d8ee', background: '#fff', color: '#2050a0', fontWeight: 800, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}>
                  {t('dash.up.messageUs')}
                </button>
              </div>
            </div>
          )}

          {day != null && !loading && (
            <div ref={timesRef} style={{ marginTop: 18, scrollMarginTop: 90 }}>
              <p style={{ ...head, marginBottom: 4 }}>{t('fam.timesFor', { when: typeof day === 'number' ? wkName(day) : dayLabel(day), n })}</p>
              {mainStart && <p style={{ margin: '0 0 4px', fontSize: 13, fontWeight: 700, color: NAVY }}>{t('booking.fixed.fromDate', { date: mdOf(mainStart) })}</p>}
              {list.length === 0 ? (
                <p style={{ margin: 0, padding: 18, textAlign: 'center', fontSize: 14, color: '#56647d', background: '#fff', borderRadius: 12, border: '1px dashed #e3ebf6' }}>{t('fam.noTimes')}</p>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 10, marginTop: 10, alignItems: 'start' }}>
                  {([['am', list.filter(o => o.time < '12:00')], ['pm', list.filter(o => o.time >= '12:00')]] as const).map(([half, part]) => (
                    <section key={half} aria-label={t('booking.fixed.' + half)}>
                      <div style={{ textAlign: 'center', padding: '6px 4px', borderRadius: 9, background: '#dfe7f3', marginBottom: 8, fontSize: 14, fontWeight: 800, color: NAVY }}>{t('booking.fixed.' + half)}</div>
                      {part.length === 0 && <p style={{ margin: 0, padding: '14px 6px', textAlign: 'center', fontSize: 13, color: '#7b879c', borderRadius: 10, border: '1px dashed #d3deec' }}>{t('booking.fixed.halfNone')}</p>}
                      <div style={{ display: 'grid', gap: 8 }}>
                        {part.map(o => {
                          const on = opt?.key === o.key && opt.ds === o.ds
                          return (
                            <button key={o.key} type="button" onClick={() => pickOpt(o)} aria-pressed={on}
                              style={{ minHeight: 48, padding: '8px 10px', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'center',
                                border: `2px solid ${on ? GOLD : '#e3ebf6'}`, background: on ? `${GOLD}20` : '#fff', color: on ? GOLD : '#16294a', fontVariantNumeric: 'tabular-nums' }}>
                              <span style={{ display: 'block', fontSize: 16, fontWeight: 700 }}>{hh12(o.time)}</span>
                              {o.coachName && <span style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#56647d' }}>{t('dash.up.coach', { name: o.coachName })}</span>}
                              {weekly && o.ds !== mainStart && <span style={{ display: 'block', fontSize: 11.5, fontWeight: 600, color: '#56647d', marginTop: 2 }}>{t('booking.fixed.startsOn', { date: mdOf(o.ds) })}</span>}
                            </button>
                          )
                        })}
                      </div>
                    </section>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {opt && plan && (
        <section ref={planRef} style={{ ...box, marginTop: 16, borderColor: `${GOLD}88`, scrollMarginTop: 90 }}>
          <p style={{ ...head, color: NAVY }}>{t(slug === '1on4' ? 'fam.planGroup' : arr === 'same' ? 'fam.planSame' : 'fam.planB2b', { time: t12(opt.time) })}</p>
          <div style={{ display: 'grid', gap: 8 }}>
            {plan.map(p => {
              const k = kids.find(x => x.id === p.kid)!
              // Who else could teach this child here (1-on-1 at the same time):
              // a coach no one else has, or one another child could swap for.
              const others = slug === '1on1' && arr === 'same' ? (open1?.[kids.indexOf(k)]?.[opt.ds]?.[p.time] || []).filter(c => c !== p.coach && (() => {
                const j = plan.find(q => q.coach === c)
                return !j || (open1?.[kids.findIndex(x => x.id === j.kid)]?.[opt.ds]?.[p.time] || []).includes(p.coach)
              })()) : []
              return (
                <div key={p.kid} style={{ border: '1px solid #e3ebf6', borderRadius: 12, padding: '10px 12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    {face(k)}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 800, color: NAVY }}>{k.full_name}</div>
                      <div style={{ fontSize: 13.5, color: '#16294a' }}>{t12(p.time)} · {t('dash.up.coach', { name: coachName(p.coach) })}</div>
                    </div>
                    {others.length > 0 && (
                      <button type="button" className="tap-auto" aria-expanded={swap === p.kid} onClick={() => setSwap(swap === p.kid ? null : p.kid)}
                        style={{ border: '1px solid #cfdcef', background: '#fff', borderRadius: 999, padding: '6px 12px', color: '#1f5fbf', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                        {t('fam.change')}
                      </button>
                    )}
                  </div>
                  {swap === p.kid && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
                      {others.map(c => (
                        <button key={c} type="button" className="tap-auto"
                          onClick={() => { setPlan(plan.map(q => q.kid === p.kid ? { ...q, coach: c } : q.coach === c ? { ...q, coach: p.coach } : q)); setSwap(null); setCands(null); tickedFor.current = '' }}
                          style={{ border: `1.5px solid ${NAVY}`, background: '#fff', borderRadius: 999, padding: '7px 14px', color: NAVY, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                          {t('dash.up.coach', { name: coachName(c) })}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
          {slug === '1on1' && arr === 'b2b' && (() => {
            const all = plansAt(opt.ds, opt.time)
            const sig = (q: Plan) => q.map(x => x.kid + x.coach).join()
            const orders = all.filter(q => q[0].coach === plan[0].coach)
            const coaches = [...new Set(all.filter(q => q.map(x => x.kid).join() === plan.map(x => x.kid).join()).map(q => q[0].coach))]
            return (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
                {orders.length > 1 && (
                  <button type="button" className="tap-auto" onClick={() => { const i = orders.findIndex(q => sig(q) === sig(plan)); setPlan(orders[(i + 1) % orders.length]); setCands(null); tickedFor.current = '' }}
                    style={{ border: '1px solid #cfdcef', background: '#fff', borderRadius: 999, padding: '6px 12px', color: '#1f5fbf', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>⇅ {t('fam.order')}</button>
                )}
                {coaches.length > 1 && (
                  <button type="button" className="tap-auto" onClick={() => { const i = coaches.indexOf(plan[0].coach); const c = coaches[(i + 1) % coaches.length]; setPlan(plan.map(x => ({ ...x, coach: c }))); setCands(null); tickedFor.current = '' }}
                    style={{ border: '1px solid #cfdcef', background: '#fff', borderRadius: 999, padding: '6px 12px', color: '#1f5fbf', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>{t('fam.otherCoach')}</button>
                )}
              </div>
            )
          })()}

          {weekly && (
            <div style={{ marginTop: 16 }}>
              <p style={{ ...head, marginBottom: 2 }}>{t('fam.datesQ')}</p>
              <p style={{ margin: '0 0 10px', fontSize: 12.5, color: '#56647d' }}>{t('fam.datesHint', { n: FIXED_CLASS_MIN_LESSONS })}</p>
              {!cands ? <p style={{ color: '#56647d', textAlign: 'center' }}>{t('booking.loading')}</p> : (
                <>
                  {[...new Set(weekRows.map(r => r.date.slice(0, 7)))].map(m => (
                    <div key={m} style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: 6, marginBottom: 6 }}>
                      {weekRows.filter(r => r.date.startsWith(m)).map(r => {
                        const on = ticked.has(r.date)
                        return (
                          <button key={r.date} type="button" disabled={!r.ok} aria-pressed={on} className="tap-auto"
                            onClick={() => setTicked(s => { const x = new Set(s); if (on) x.delete(r.date); else x.add(r.date); return x })}
                            style={{ minWidth: 0, height: 46, borderRadius: 10, fontFamily: 'inherit', fontVariantNumeric: 'tabular-nums', cursor: r.ok ? 'pointer' : 'not-allowed', lineHeight: 1.15,
                              border: `1.5px solid ${on ? NAVY : r.ok ? '#d3deec' : '#eef2f8'}`, background: on ? NAVY : r.ok ? '#fff' : '#f6f9fd', color: on ? '#fff' : r.ok ? NAVY : '#b7c2d4', fontWeight: 800, fontSize: 14 }}>
                            {mdOf(r.date)}
                            {!r.ok && <span style={{ display: 'block', fontSize: 10.5, fontWeight: 700 }}>{t('fam.closed')}</span>}
                          </button>
                        )
                      })}
                    </div>
                  ))}
                  <button type="button" className="tap-auto" onClick={() => setWeeks(w => w + 26)}
                    style={{ display: 'block', margin: '6px auto 0', background: 'none', border: 'none', color: '#1f5fbf', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>{t('fam.more')}</button>
                </>
              )}
            </div>
          )}

          <div style={{ borderTop: '1px solid #eef2f8', marginTop: 14, paddingTop: 12 }}>
            <p style={{ margin: '0 0 4px', fontSize: 13.5, color: '#56647d' }}>
              {weekly ? t('fam.sumWeekly', { weekday: wkName(dowOf(opt.ds)), n: ticked.size }) : dayLabel(opt.ds)}
            </p>
            <p style={{ margin: '0 0 12px', fontWeight: 800, fontSize: 17, color: NAVY }}>{t('fam.total', { n: total.toLocaleString() })}</p>
            {!enough ? (
              <p style={{ color: '#c0392b', margin: 0, fontSize: 14 }}>{t('fam.tooFew', { n: FIXED_CLASS_MIN_LESSONS })}</p>
            ) : total > balance ? (
              <p style={{ color: '#c0392b', margin: 0, fontSize: 14 }}>{t('booking.short.body', { have: balance.toLocaleString(), need: total.toLocaleString() })} <Link href="/plans#buy" style={{ color: '#1f5fbf', fontWeight: 700 }}>{t('booking.short.cta')}</Link></p>
            ) : (
              asking ? (
                <div role="alertdialog" aria-label={t('fam.ask.title')} style={{ background: '#f6f9fd', border: '1px solid #c9d8ee', borderRadius: 12, padding: 14 }}>
                  <p style={{ margin: '0 0 4px', fontWeight: 800, fontSize: 16, color: NAVY }}>{t('fam.ask.title')}</p>
                  <p style={{ margin: '0 0 12px', fontSize: 14, color: '#56647d', lineHeight: 1.55 }}>
                    {plan.map(p => kidName(p.kid)).join('、')} · {t('fam.ask.body', { n: (weekly ? ticked.size : 1) * plan.length, points: total.toLocaleString(), left: Math.max(0, balance - total).toLocaleString() })}
                  </p>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button type="button" onClick={() => setAsking(false)}
                      style={{ flex: 1, padding: 12, borderRadius: 10, border: '1px solid #d5deeb', background: '#fff', color: '#56647d', fontWeight: 800, fontSize: 15, cursor: 'pointer', fontFamily: 'inherit' }}>{t('fam.ask.back')}</button>
                    <button type="button" onClick={confirm} disabled={busy}
                      style={{ flex: 1, padding: 12, borderRadius: 10, border: 'none', background: AMBER, color: NAVY, fontWeight: 800, fontSize: 15, cursor: 'pointer', fontFamily: 'inherit' }}>{t('fam.ask.yes')}</button>
                  </div>
                </div>
              ) : (
              <button type="button" onClick={() => setAsking(true)} disabled={busy || (weekly && !cands)}
                style={{ width: '100%', padding: 14, borderRadius: 12, border: 'none', background: AMBER, color: NAVY, fontWeight: 800, fontSize: 16, cursor: 'pointer', fontFamily: 'inherit', opacity: busy ? 0.6 : 1 }}>
                {busy ? t('fam.booking') : t('fam.confirm', { n })}
              </button>
              )
            )}
            {err && <p role="alert" style={{ color: '#c0392b', margin: '10px 0 0', fontSize: 14 }}>{err}</p>}
            <p style={{ fontSize: 12.5, color: '#56647d', margin: '10px 0 0', lineHeight: 1.5 }}>{t('fam.allOrNothing')}</p>
          </div>
        </section>
      )}
    </div>
  )
}

