'use client'

import { Suspense, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useLocale, useT } from '@/lib/i18n/provider'
import { dateTag } from '@/lib/i18n'
import { fmtDate } from '@/lib/fmt-date'
import AppInfoPage from '@/components/brand/AppInfoPage'
import LoadFailed from '@/components/LoadFailed'
import { BRAND } from '@/lib/brand'
import { bestByEvent, eventKey, eventLabel, fmtTime, TIMES_SEEN_KEY as SEEN_KEY, type SwimTime } from '@/lib/swim-times'

/* 成績 (owner, 2026-11-17, the approved mockup): a swimmer's best time per
   event (green when it beat the first one), a line for the chosen event, and
   every time, newest first, tagged 課堂測驗 or 比賽. Opened from the 成績 tile
   on 首頁, which shows only once there is a time (lib/swim-times.ts). Seeing
   it clears the tile's dot (localStorage msa_times_seen:<id> = how many). */

const css = `
  .st-best { display: flex; flex-direction: column; }
  .st-ev { width: 100%; display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 11px 0; border: 0;
    border-top: 1px solid #eef2f8; background: none; font: inherit; color: ${BRAND.ink}; text-align: left; cursor: pointer; }
  .st-ev:first-child { border-top: 0; }
  .st-ev[aria-pressed="true"] .st-name { color: ${BRAND.blue}; font-weight: 800; }
  .st-name { font-size: 15px; }
  .st-t { font-size: 19px; font-weight: 800; color: ${BRAND.navy}; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .st-up { display: block; font-size: 12px; color: #1a7f37; font-weight: 800; text-align: right; }
  .st-chart h3, .st-hist h3 { font-size: 13px; font-weight: 800; color: ${BRAND.mute}; margin: 0 0 6px; }
  .st-chart svg { display: block; width: 100%; height: auto; }
  .st-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 10px 0; border-top: 1px solid #eef2f8; font-size: 14px; }
  .st-row:first-of-type { border-top: 0; }
  .st-row b { font-variant-numeric: tabular-nums; color: ${BRAND.navy}; font-size: 15px; }
  .st-tag { display: inline-block; font-size: 11.5px; font-weight: 800; border-radius: 99px; padding: 1px 8px; margin-left: 6px; vertical-align: 1px; }
  .st-tag.lesson { background: #e8f0fb; color: #2050a0; }
  .st-tag.meet { background: #fff1d6; color: #8a5300; }
  .st-sub { display: block; font-size: 12px; color: ${BRAND.mute}; margin-top: 2px; }
  .ai .st-card + .st-card { margin-top: 10px; }
  .st-ev:focus-visible { outline: 3px solid ${BRAND.yellow}; outline-offset: 2px; }
`

/** A small line of one event's times over the days: lower is faster, so the
 *  line falls as the swimmer improves. The best one is amber, a meet is a ring. */
function Line({ list, label }: { list: SwimTime[]; label: string }) {
  const pts = [...list].sort((a, b) => (a.on < b.on ? -1 : a.on > b.on ? 1 : 0))
  if (pts.length < 2) return null
  const W = 300, H = 110, P = 12
  const lo = Math.min(...pts.map(p => p.cs)), hi = Math.max(...pts.map(p => p.cs))
  const span = Math.max(hi - lo, 50)
  const day = (s: string) => Date.parse(s + 'T12:00:00Z')
  const d0 = day(pts[0].on), d1 = Math.max(day(pts[pts.length - 1].on), d0 + 1)
  const x = (p: SwimTime) => P + ((day(p.on) - d0) / (d1 - d0)) * (W - 2 * P)
  // Slower (bigger) up top, faster down: the line falls with progress.
  const y = (p: SwimTime) => P + (1 - (p.cs - lo) / span) * (H - 2 * P)
  const best = pts.reduce((a, b) => (b.cs < a.cs ? b : a))
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
      {[0, 0.5, 1].map(f => <line key={f} x1={0} x2={W} y1={P + f * (H - 2 * P)} y2={P + f * (H - 2 * P)} stroke="#e3e9f2" />)}
      <polyline fill="none" stroke="#2050a0" strokeWidth={2.5} strokeLinejoin="round" points={pts.map(p => `${x(p)},${y(p)}`).join(' ')} />
      {pts.map(p => p === best
        ? <circle key={p.id} cx={x(p)} cy={y(p)} r={5} fill="#f09800" />
        : p.source === 'meet'
          ? <circle key={p.id} cx={x(p)} cy={y(p)} r={4} fill="#fff" stroke="#8a5300" strokeWidth={2} />
          : <circle key={p.id} cx={x(p)} cy={y(p)} r={3} fill="#2050a0" />)}
    </svg>
  )
}

// The address's ?student= is read with useSearchParams: a move from 首頁
// draws this page before the browser's address has changed.
export default function SwimTimesPage() {
  return <Suspense fallback={null}><SwimTimes /></Suspense>
}

function SwimTimes() {
  const t = useT()
  const locale = useLocale()
  const id = useSearchParams().get('student') || ''
  const [data, setData] = useState<{ name: string; times: SwimTime[] } | null>(null)
  const [failed, setFailed] = useState(false)
  const [tries, setTries] = useState(0)
  const [pick, setPick] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    let live = true
    fetch('/api/parent/swim-times?student=' + encodeURIComponent(id), { cache: 'no-store', signal: AbortSignal.timeout(15000) })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then(d => {
        if (!live) return
        setData({ name: d.name || '', times: [...(d.times || [])].sort((a: SwimTime, b: SwimTime) => (a.on < b.on ? 1 : a.on > b.on ? -1 : 0)) }); setFailed(false)
        try { localStorage.setItem(SEEN_KEY + id, String((d.times || []).length)) } catch { /* private */ }
      })
      .catch(() => { if (live) setFailed(true) })
    return () => { live = false }
  }, [id, tries])

  const best = useMemo(() => bestByEvent(data?.times || []), [data])
  const chosen = pick && best.some(b => b.key === pick) ? pick : best[0]?.key || null
  const ofChosen = (data?.times || []).filter(x => eventKey(x) === chosen)
  const day = (s: string) => fmtDate(new Date(s + 'T12:00:00Z'), dateTag(locale), { month: 'numeric', day: 'numeric', timeZone: 'UTC' })
  const secs = (cs: number) => (cs / 100).toFixed(cs % 100 ? 2 : 0).replace(/\.?0+$/, '') || '0'

  const title = data?.name ? t('times.titleFor', { name: data.name }) : t('times.title')
  return (
    <AppInfoPage title={title} sub={data && data.times.length ? t('times.sub', { n: data.times.length }) : undefined}>
      <style>{css}</style>
      {failed && <LoadFailed onRetry={() => setTries(n => n + 1)} />}
      {!failed && !data && id && <p className="ai-sub">{t('common.loading')}</p>}
      {data && data.times.length === 0 && <div className="ai-card"><p style={{ margin: 0 }}>{t('times.empty')}</p></div>}
      {data && data.times.length > 0 && (
        <>
          <div className="ai-card st-card">
            <h2 className="ai-sec" style={{ margin: '0 0 2px' }}>{t('times.best')}</h2>
            <div className="st-best">
              {best.map(b => {
                const drop = b.first.cs - b.best.cs
                return (
                  <button key={b.key} type="button" className="st-ev tap-auto" aria-pressed={b.key === chosen} onClick={() => setPick(b.key)}>
                    <span className="st-name">{eventLabel(t, b.best)}</span>
                    <span><span className="st-t">{fmtTime(b.best.cs)}</span>{drop > 0 && <span className="st-up">{t('times.drop', { s: secs(drop) })}</span>}</span>
                  </button>
                )
              })}
            </div>
          </div>
          {ofChosen.length > 1 && chosen && (
            <div className="ai-card st-card st-chart">
              <h3>{eventLabel(t, ofChosen[0])}</h3>
              <Line list={ofChosen} label={t('times.chartLabel', { event: eventLabel(t, ofChosen[0]) })} />
            </div>
          )}
          <div className="ai-card st-card st-hist">
            <h3>{t('times.history')}</h3>
            {data.times.map(x => (
              <div key={x.id} className="st-row">
                <span>
                  {day(x.on)} {eventLabel(t, x)}
                  <span className={'st-tag ' + x.source}>{t(x.source === 'meet' ? 'times.tag.meet' : 'times.tag.lesson')}</span>
                  {x.meet && <span className="st-sub">{x.meet}</span>}
                </span>
                <b>{fmtTime(x.cs)}</b>
              </div>
            ))}
          </div>
        </>
      )}
    </AppInfoPage>
  )
}
