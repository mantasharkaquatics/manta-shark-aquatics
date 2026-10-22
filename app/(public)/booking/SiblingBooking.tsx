'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useT, useLocale } from '@/lib/i18n/provider'
import { dateTag, tDb } from '@/lib/i18n'
import { errorKey } from '@/lib/i18n/errors'
import { priceLesson } from '@/lib/points'
import { singleMaxDate } from '@/lib/booking-time'
import { getTodayLA, SLOT_STEP_MINUTES } from '@/lib/date'
import { BRAND } from '@/lib/brand'

/* Two of the family's swimmers booked together (owner, 2026-10-22, tier 2):
   back to back with one coach, at the same time with two coaches, or both in
   one 1-on-4 class. Opened from the booking page's first step. Reads the same
   openings the booking page reads, one swimmer at a time, and puts the two
   together; /api/bookings/siblings books both or neither. */

type Kid = { id: string; full_name: string; current_level: number | null }
type Course = { id: string; slug: string; name: string }
type Lesson = { student_id: string; course_type_id: string; coach_id: string; date: string; time: string }
type Option = { key: string; kind: 'b2b' | 'same' | 'group'; lessons: Lesson[]; coaches: string[]; label: string; groupCoach?: string }

const NAVY = BRAND.navy
const toMin = (t: string) => { const [h, m] = t.slice(0, 5).split(':').map(Number); return h * 60 + m }
const toHm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
const t12 = (hm: string) => { const [h, m] = hm.split(':').map(Number); return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}` }
const addDays = (ds: string, n: number) => { const d = new Date(ds + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }

export default function SiblingBooking({ students, courses, location, balance, onExit }: {
  students: Kid[]; courses: Course[]; location: string | null; balance: number; onExit: () => void
}) {
  const t = useT()
  const locale = useLocale()
  const ready = students.filter(s => s.current_level != null)
  const [pair, setPair] = useState<string[]>(ready.length === 2 ? ready.map(s => s.id) : [])
  const [slug, setSlug] = useState<'1on1' | '1on4' | null>(null)
  const today = getTodayLA()
  const [date, setDate] = useState<string>(today)
  const [loading, setLoading] = useState(false)
  const [openA, setOpenA] = useState<any>(null)
  const [openB, setOpenB] = useState<any>(null)
  const [pick, setPick] = useState<Option | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const course = courses.find(c => c.slug === slug) || null
  const kidA = ready.find(s => s.id === pair[0]) || null
  const kidB = ready.find(s => s.id === pair[1]) || null
  const locQ = location ? `&location=${encodeURIComponent(location)}` : ''
  const days = useMemo(() => {
    const out: string[] = []
    const last = singleMaxDate(today)
    for (let d = today; d <= last; d = addDays(d, 1)) out.push(d)
    return out
  }, [today])

  // 1-on-1: every coach's open times for each swimmer, read once.
  useEffect(() => {
    if (slug !== '1on1' || !kidA || !kidB) return
    let live = true
    setLoading(true); setOpenA(null); setOpenB(null); setPick(null)
    Promise.all([kidA, kidB].map(k => fetch(`/api/bookings/openings?course_slug=1on1&student_id=${k.id}${locQ}`).then(r => (r.ok ? r.json() : null)).catch(() => null)))
      .then(([a, b]) => { if (live) { setOpenA(a); setOpenB(b); setLoading(false) } })
    return () => { live = false }
  }, [slug, kidA?.id, kidB?.id, locQ])
  // 1-on-4: that day's classes for each swimmer.
  useEffect(() => {
    if (slug !== '1on4' || !kidA || !kidB) return
    let live = true
    setLoading(true); setOpenA(null); setOpenB(null); setPick(null)
    Promise.all([kidA, kidB].map(k => fetch(`/api/bookings/group-classes?student_id=${k.id}&date=${date}${locQ}`).then(r => (r.ok ? r.json() : null)).catch(() => null)))
      .then(([a, b]) => { if (live) { setOpenA(a); setOpenB(b); setLoading(false) } })
    return () => { live = false }
  }, [slug, kidA?.id, kidB?.id, date, locQ])

  const coachName = (id: string) => (openA?.coaches || openB?.coaches || []).find((c: any) => c.id === id)?.first_name || ''
  const price = (l: Lesson) => { try { return priceLesson({ courseSlug: slug || '1on1', minutes: 30, sessionDate: l.date, startTime: l.time, seats: 1 }).charged } catch { return 0 } }

  const options: Option[] = useMemo(() => {
    if (!kidA || !kidB || !course || !openA || !openB) return []
    const out: Option[] = []
    if (slug === '1on1') {
      const a = (openA.days || {})[date] || {}
      const b = (openB.days || {})[date] || {}
      const L = (kid: Kid, coach: string, time: string): Lesson => ({ student_id: kid.id, course_type_id: course.id, coach_id: coach, date, time })
      for (const tm of [...new Set([...Object.keys(a), ...Object.keys(b)])].sort()) {
        const next = toHm(toMin(tm) + SLOT_STEP_MINUTES)
        // Back to back, one coach: A then B, or B then A.
        for (const [first, second, firstIds, secondIds] of [[kidA, kidB, a[tm], b[next]], [kidB, kidA, b[tm], a[next]]] as [Kid, Kid, string[] | undefined, string[] | undefined][]) {
          const c = (firstIds || []).find(id => (secondIds || []).includes(id))
          if (c) out.push({ key: `b2b|${first.id}|${tm}|${c}`, kind: 'b2b', lessons: [L(first, c, tm), L(second, c, next)], coaches: [c],
            label: `${first.full_name} ${t12(tm)} → ${second.full_name} ${t12(next)}` })
        }
        // Same time, two coaches.
        const ca = a[tm] || [], cb = b[tm] || []
        const pa = ca.find((x: string) => cb.some((y: string) => y !== x))
        const pb = pa ? cb.find((y: string) => y !== pa) : undefined
        if (pa && pb) out.push({ key: `same|${tm}`, kind: 'same', lessons: [L(kidA, pa, tm), L(kidB, pb, tm)], coaches: [pa, pb], label: t12(tm) })
      }
    } else {
      const ca = (openA.classes || []) as any[], cb = (openB.classes || []) as any[]
      for (const x of ca) {
        if (x.full || x.already_booked || x.max - x.enrolled < 2) continue
        const y = cb.find(z => z.coach_id === x.coach_id && z.time === x.time && !z.full && !z.already_booked)
        if (!y) continue
        out.push({ key: `group|${x.coach_id}|${x.time}`, kind: 'group', coaches: [x.coach_id], groupCoach: x.coach_name || '',
          lessons: [kidA, kidB].map(k => ({ student_id: k.id, course_type_id: course.id, coach_id: x.coach_id, date, time: String(x.time).slice(0, 5) })),
          label: `${t12(String(x.time).slice(0, 5))} – ${t12(String(x.end_time).slice(0, 5))} · ${x.coach_name || ''}` })
      }
    }
    return out
  }, [kidA, kidB, course, openA, openB, date, slug])

  // Days with at least one way to book both (1-on-1 only: one read covers them all).
  const dayHas = (d: string) => {
    if (slug !== '1on1' || !openA || !openB) return true
    const a = (openA.days || {})[d] || {}, b = (openB.days || {})[d] || {}
    return [...new Set([...Object.keys(a), ...Object.keys(b)])].some(tm => {
      const next = toHm(toMin(tm) + SLOT_STEP_MINUTES)
      const ca = a[tm] || [], cb = b[tm] || []
      return ca.some((x: string) => cb.some((y: string) => y !== x)) || ca.some((x: string) => (b[next] || []).includes(x)) || (cb.some((x: string) => (a[next] || []).includes(x)))
    })
  }

  const total = pick ? pick.lessons.reduce((n, l) => n + price(l), 0) : 0
  async function confirm() {
    if (!pick) return
    setBusy(true); setErr(null)
    const r = await fetch('/api/bookings/siblings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lessons: pick.lessons }) }).catch(() => null)
    const d = r ? await r.json().catch(() => ({})) : {}
    setBusy(false)
    if (r?.ok) { setDone(true); return }
    const k = errorKey(d.error)
    setErr(k ? t(k) : (d.error || t('sib.err')))
  }

  const box: React.CSSProperties = { background: '#fff', border: '1px solid #e3ebf6', borderRadius: 14, padding: 16, marginBottom: 14 }
  const head: React.CSSProperties = { fontSize: 13, fontWeight: 700, color: '#56647d', letterSpacing: '1.5px', textTransform: 'uppercase', margin: '0 0 10px' }
  const chip = (on: boolean): React.CSSProperties => ({ padding: '10px 14px', borderRadius: 10, border: `1.5px solid ${on ? NAVY : '#d3deec'}`, background: on ? NAVY : '#fff', color: on ? '#fff' : '#16294a', fontWeight: 700, fontSize: 14, cursor: 'pointer', textAlign: 'left' })
  const dayLabel = (d: string) => new Date(d + 'T12:00:00Z').toLocaleDateString(dateTag(locale as any), { weekday: 'short', month: 'numeric', day: 'numeric', timeZone: 'UTC' })

  if (done) return (
    <div style={box} role="status">
      <h2 style={{ margin: '0 0 8px', fontSize: 20, color: NAVY }}>✅ {t('sib.doneTitle')}</h2>
      <p style={{ margin: '0 0 14px', color: '#16294a', lineHeight: 1.6 }}>{t('sib.doneBody')}</p>
      <Link href="/dashboard" style={{ display: 'inline-block', padding: '12px 20px', borderRadius: 10, background: BRAND.amber, color: NAVY, fontWeight: 800, textDecoration: 'none' }}>{t('sib.toDashboard')}</Link>
    </div>
  )

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 14 }}>
        <h2 style={{ margin: 0, fontSize: 22, color: NAVY }}>{t('sib.title')}</h2>
        <button type="button" onClick={onExit} className="tap-auto" style={{ background: 'none', border: 'none', color: '#1f5fbf', fontWeight: 700, cursor: 'pointer' }}>{t('sib.back')}</button>
      </div>

      <section style={box}>
        <p style={head}>{t('sib.who')}</p>
        <div style={{ display: 'grid', gap: 8 }}>
          {ready.map(s => {
            const on = pair.includes(s.id)
            return (
              <label key={s.id} style={{ ...chip(on), display: 'flex', alignItems: 'center', gap: 10 }}>
                <input type="checkbox" checked={on} style={{ width: 18, height: 18 }}
                  onChange={() => { setPick(null); setPair(p => on ? p.filter(x => x !== s.id) : [...p, s.id].slice(-2)) }} />
                {s.full_name}
              </label>
            )
          })}
        </div>
      </section>

      {pair.length === 2 && (
        <section style={box}>
          <p style={head}>{t('sib.what')}</p>
          <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
            {(['1on1', '1on4'] as const).filter(sl => courses.some(c => c.slug === sl)).map(sl => (
              <button key={sl} type="button" style={chip(slug === sl)} onClick={() => { setSlug(sl); setPick(null) }}>
                <span style={{ display: 'block' }}>{tDb(locale as any, 'course_types', courses.find(c => c.slug === sl)!.id, courses.find(c => c.slug === sl)!.name)}</span>
                <span style={{ display: 'block', fontSize: 12.5, fontWeight: 500, marginTop: 2, opacity: 0.85 }}>{t(sl === '1on1' ? 'sib.what1on1' : 'sib.what1on4')}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {pair.length === 2 && slug && (
        <section style={box}>
          <p style={head}>{t('sib.when')}</p>
          <div style={{ display: 'flex', gap: 8, overflowX: 'auto', padding: '2px 2px 8px' }}>
            {days.map(d => {
              const has = dayHas(d)
              return (
                <button key={d} type="button" disabled={!has} onClick={() => { setDate(d); setPick(null) }}
                  style={{ ...chip(date === d), flex: '0 0 auto', textAlign: 'center', opacity: has ? 1 : 0.4, cursor: has ? 'pointer' : 'not-allowed' }}>{dayLabel(d)}</button>
              )
            })}
          </div>
          {loading ? <p style={{ color: '#56647d' }}>{t('booking.loading')}</p> : options.length === 0 ? (
            <p style={{ color: '#56647d', margin: '8px 0 0' }}>{t('sib.none')}</p>
          ) : (
            <div style={{ display: 'grid', gap: 14, marginTop: 8 }}>
              {(['b2b', 'same', 'group'] as const).map(kind => {
                const list = options.filter(o => o.kind === kind)
                if (!list.length) return null
                return (
                  <div key={kind}>
                    <p style={{ margin: '0 0 6px', fontWeight: 700, color: NAVY }}>{t(`sib.kind.${kind}`)}</p>
                    <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
                      {list.map(o => (
                        <button key={o.key} type="button" style={chip(pick?.key === o.key)} onClick={() => { setPick(o); setErr(null) }}>
                          <span style={{ display: 'block' }}>{o.label}</span>
                          {o.kind !== 'group' && (
                            <span style={{ display: 'block', fontSize: 12.5, fontWeight: 500, marginTop: 2, opacity: 0.85 }}>
                              {o.kind === 'same' ? `${kidA?.full_name}: ${coachName(o.coaches[0])} · ${kidB?.full_name}: ${coachName(o.coaches[1])}` : t('dash.up.coach', { name: coachName(o.coaches[0]) })}
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>
      )}

      {pick && (
        <section style={{ ...box, borderColor: BRAND.amber }}>
          <p style={head}>{t('sib.summary')}</p>
          <ul style={{ margin: '0 0 10px', paddingLeft: 18, color: '#16294a', lineHeight: 1.7 }}>
            {pick.lessons.map(l => (
              <li key={l.student_id}>{ready.find(s => s.id === l.student_id)?.full_name} · {dayLabel(l.date)} {t12(l.time)} · {t('dash.up.coach', { name: pick.groupCoach ?? coachName(l.coach_id) })} · {t('points.unit', { n: price(l) })}</li>
            ))}
          </ul>
          <p style={{ margin: '0 0 12px', fontWeight: 800, color: NAVY }}>{t('sib.total', { n: total })}</p>
          {total > balance ? (
            <p style={{ color: '#c0392b', margin: 0 }}>{t('booking.short.body', { have: balance, need: total })} <a href="/plans#buy" style={{ color: '#1f5fbf', fontWeight: 700 }}>{t('booking.short.cta')}</a></p>
          ) : (
            <button type="button" onClick={confirm} disabled={busy}
              style={{ width: '100%', padding: 14, borderRadius: 10, border: 'none', background: BRAND.amber, color: NAVY, fontWeight: 800, fontSize: 16, cursor: 'pointer', opacity: busy ? 0.6 : 1 }}>
              {busy ? t('sib.booking') : t('sib.confirm')}
            </button>
          )}
          {err && <p role="alert" style={{ color: '#c0392b', margin: '10px 0 0' }}>{err}</p>}
          <p style={{ fontSize: 12.5, color: '#56647d', margin: '10px 0 0' }}>{t('sib.allOrNothing')}</p>
        </section>
      )}
    </div>
  )
}
