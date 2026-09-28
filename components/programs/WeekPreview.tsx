'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useT, useLocale } from '@/lib/i18n/provider'
import { localePath } from '@/lib/i18n/paths'
import { tDb } from '@/lib/i18n'
import { BRAND } from '@/lib/brand'
import { BAND_COLORS, TEAM_TIER_COLORS } from '@/lib/zone-colors'
import { formatTime12h } from '@/lib/date'
import { tierBandLabel } from '@/lib/team-tiers'
import { createClient } from '@/lib/supabase/client'

/* The next seven days of one kind of lesson, for the public programme pages
   (owner, 2026-09-28). It only SHOWS what is open -- the data comes from
   /api/public/schedule, which carries no coach names and holds nothing. A time
   is a link: a signed-in family goes to the booking page to pick it, a new one
   goes to the Swim Assessment first, because that is where every swimmer
   starts. Squads have fixed times and are joined from the plans page. */

type Kind = 'private' | 'semi' | 'group' | 'team'
type Tier = {
  id: string; name: string; level_min: number; level_max: number; min_stage: number; max_stage: number
  spots_left: number; weekly: { weekday: number; start: string; end: string }[]
}
type Data = {
  from: string
  days: { date: string; times?: string[]; slots?: { time: string; end?: string; band?: string | null; tier_id?: string }[] }[]
  tiers?: Tier[]
}

const BANDS = ['1-2', '3-4', '5-6', '7-9']
const SHOW = 6

const css = `
  .wk-bar { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 16px; }
  .wk-count { font-size: 14px; font-weight: 700; color: ${BRAND.navy}; font-variant-numeric: tabular-nums; }
  .wk-seg { display: inline-flex; background: #fff; border: 1px solid ${BRAND.line}; border-radius: 16px; padding: 4px; gap: 4px; flex-wrap: wrap; }
  .wk-seg button { border: 0; background: transparent; font: inherit; font-size: 13.5px; font-weight: 700; color: ${BRAND.mute};
    padding: 8px 16px; border-radius: 12px; cursor: pointer; display: inline-flex; align-items: center; gap: 7px; }
  .wk-seg button[aria-pressed="true"] { background: ${BRAND.navy}; color: #fff; }
  .wk-seg button:focus-visible { outline: 3px solid ${BRAND.yellow}; outline-offset: 1px; }
  .wk-dot { width: 9px; height: 9px; border-radius: 50%; flex: none; display: inline-block; }

  .wk { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 10px; }
  .wk-day { background: #fff; border: 1px solid ${BRAND.line}; border-radius: 14px; padding: 12px 10px;
    display: flex; flex-direction: column; gap: 6px; min-width: 0; }
  .wk-day.today { border-color: ${BRAND.blue}; box-shadow: 0 0 0 1px ${BRAND.blue} inset; }
  .wk-hd { display: flex; align-items: baseline; justify-content: space-between; gap: 6px; padding: 0 2px 6px;
    border-bottom: 1px solid ${BRAND.line}; margin-bottom: 2px; }
  .wk-hd b { font-size: 14px; color: ${BRAND.navy}; }
  .wk-hd span { font-size: 12px; color: ${BRAND.mute}; font-variant-numeric: tabular-nums; }
  .wk-hd .tg { font-size: 10.5px; font-weight: 800; letter-spacing: .06em; text-transform: uppercase; color: ${BRAND.blue}; }
  .wk-list { display: flex; flex-direction: column; gap: 6px; }
  .wk-slot { display: flex; align-items: center; justify-content: center; flex-wrap: wrap; gap: 3px 6px;
    font-size: 13px; font-weight: 700; color: ${BRAND.navy}; background: ${BRAND.paper}; border: 1px solid #d6e3f5;
    border-radius: 9px; padding: 7px 6px; text-decoration: none; font-variant-numeric: tabular-nums; line-height: 1.25; text-align: center; }
  .wk-slot:hover { background: #fff6d6; border-color: ${BRAND.amber}; }
  .wk-slot:focus-visible { outline: 3px solid ${BRAND.yellow}; outline-offset: 1px; }
  .wk-slot small { font-size: 11px; font-weight: 700; color: ${BRAND.mute}; display: inline-flex; align-items: center; gap: 4px; }
  .wk-none { font-size: 12.5px; color: ${BRAND.mute}; padding: 6px 2px; }
  .wk-more { border: 0; background: none; font: inherit; font-size: 12.5px; font-weight: 700; color: ${BRAND.blue};
    cursor: pointer; padding: 4px 2px; text-align: left; }
  .wk-state { background: #fff; border: 1px dashed #c9d8ee; border-radius: 14px; padding: 28px; text-align: center;
    color: ${BRAND.mute}; font-size: 14.5px; line-height: 1.7; }
  .wk-foot { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 14px; margin-top: 18px; }
  .wk-foot p { margin: 0; color: ${BRAND.mute}; font-size: 14px; line-height: 1.6; max-width: 60ch; }

  .wk-tiers { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 12px; margin-bottom: 22px; }
  .wk-tier { background: #fff; border: 1px solid ${BRAND.line}; border-radius: 14px; padding: 18px; display: flex; flex-direction: column; gap: 8px; }
  .wk-tier .nm { display: flex; align-items: center; gap: 8px; font-weight: 800; color: ${BRAND.navy}; font-size: 16px; }
  .wk-tier .bd { font-size: 13px; color: ${BRAND.mute}; }
  .wk-tier ul { list-style: none; margin: 4px 0 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
  .wk-tier li { font-size: 13.5px; color: ${BRAND.ink}; display: flex; gap: 10px; font-variant-numeric: tabular-nums; }
  .wk-tier li b { min-width: 3.2em; color: ${BRAND.navy}; }
  .wk-tier .sp { margin-top: auto; padding-top: 10px; border-top: 1px solid ${BRAND.line}; font-size: 13px; font-weight: 800; }
  .wk-tier .sp.left { color: #1f8a5b; } .wk-tier .sp.full { color: #b42318; }

  /* Below this the seven columns get too narrow for a time and a level tag, so
     each day becomes a row: the day on the left, its times wrapping beside it. */
  @media (max-width: 1024px) {
    .wk { grid-template-columns: 1fr; gap: 8px; }
    .wk-day { display: grid; grid-template-columns: 74px minmax(0, 1fr); align-items: start; gap: 10px; padding: 12px; }
    .wk-hd { flex-direction: column; align-items: flex-start; gap: 2px; border-bottom: 0; padding: 2px 0 0; margin: 0; }
    .wk-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(92px, 1fr)); align-items: center; }
    .wk-list.wide { grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); }
    .wk-none { grid-column: 1 / -1; }
  }
`

function useSignedIn() {
  const [signedIn, setSignedIn] = useState(false)
  useEffect(() => {
    createClient().auth.getUser().then(({ data: { user } }) => setSignedIn(!!user)).catch(() => {})
  }, [])
  return signedIn
}

export default function WeekPreview({ kind }: { kind: 'private' | 'group' | 'team' }) {
  const t = useT()
  const locale = useLocale()
  const signedIn = useSignedIn()
  const [sub, setSub] = useState<Kind>(kind)
  const [band, setBand] = useState<string>('all')
  const [cache, setCache] = useState<Record<string, Data | 'error'>>({})
  const [open, setOpen] = useState<Record<string, boolean>>({})

  useEffect(() => {
    if (cache[sub]) return
    let alive = true
    fetch('/api/public/schedule?kind=' + sub)
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(d => { if (alive) setCache(c => ({ ...c, [sub]: d })) })
      .catch(() => { if (alive) setCache(c => ({ ...c, [sub]: 'error' })) })
    return () => { alive = false }
  }, [sub, cache])

  const data = cache[sub]
  const target = kind === 'team'
    ? localePath('/plans', locale) + '#team'
    : signedIn ? '/booking' : localePath('/assessment', locale)

  const dayName = (ds: string) => new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(new Date(ds + 'T12:00:00'))
  const md = (ds: string) => { const d = new Date(ds + 'T12:00:00'); return `${d.getMonth() + 1}/${d.getDate()}` }
  const wkName = (w: number) => new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(new Date(2024, 0, 7 + w, 12))
  // "5:00–6:30 PM" when both ends share AM/PM: short enough for a day column.
  const range = (a: string, b?: string) => {
    if (!b) return formatTime12h(a)
    const [x, y] = [formatTime12h(a), formatTime12h(b)]
    return x.slice(-2) === y.slice(-2) ? `${x.slice(0, -3)}–${y}` : `${x} – ${y}`
  }

  const tiers = (data && data !== 'error' && data.tiers) || []
  const tierColor = (id?: string) => TEAM_TIER_COLORS[Math.max(0, tiers.findIndex(x => x.id === id)) % TEAM_TIER_COLORS.length]
  const tierName = (id?: string) => { const x = tiers.find(y => y.id === id); return x ? tDb(locale, 'team_tiers', x.id, x.name) : '' }

  // Every day's entries as { key, label, tag } -- the one shape the grid draws.
  type Entry = { key: string; label: string; tag?: { text: string; color: string } }
  const entriesFor = (d: Data['days'][number]): Entry[] => {
    if (kind === 'team') return (d.slots || []).map(s => ({
      key: s.tier_id + s.time, label: range(s.time, s.end), tag: { text: tierName(s.tier_id), color: tierColor(s.tier_id) },
    }))
    if (kind === 'group') return (d.slots || [])
      .filter(s => band === 'all' || s.band == null || s.band === band)
      .map(s => ({
        key: s.time + s.band, label: formatTime12h(s.time),
        tag: band === 'all' ? (s.band
          ? { text: 'L' + s.band.replace('-', '–'), color: BAND_COLORS[s.band] || BRAND.blue }
          : { text: t('programs.week.anyLevel'), color: BRAND.blue }) : undefined,
      }))
    return (d.times || []).map(x => ({ key: x, label: formatTime12h(x) }))
  }

  const days = data && data !== 'error' ? data.days : []
  const total = days.reduce((n, d) => n + entriesFor(d).length, 0)
  const countKey = kind === 'group' ? 'programs.week.countGroup' : kind === 'team' ? 'programs.week.countTeam' : 'programs.week.count'

  return (
    <div>
      <style>{css}</style>

      {kind === 'team' && tiers.length > 0 && (
        <div className="wk-tiers">
          {tiers.map(tier => (
            <div key={tier.id} className="wk-tier">
              <div className="nm"><span className="wk-dot" style={{ background: tierColor(tier.id) }} />{tDb(locale, 'team_tiers', tier.id, tier.name)}</div>
              <div className="bd">{tierBandLabel(tier, t('plans.team.stageWord'))}</div>
              {tier.weekly.length > 0
                ? <ul>{tier.weekly.map(w => <li key={w.weekday + w.start}><b>{wkName(w.weekday)}</b>{range(w.start, w.end)}</li>)}</ul>
                : <div className="bd">{t('programs.team.tba')}</div>}
              {tier.spots_left === 0
                ? <div className="sp full">{t('plans.team.full')}</div>
                : <div className="sp left">{t(tier.spots_left === 1 ? 'plans.team.spotLeft' : 'plans.team.spotsLeft', { n: tier.spots_left })}</div>}
            </div>
          ))}
        </div>
      )}

      <div className="wk-bar">
        {kind === 'private' && (
          <div className="wk-seg" role="group" aria-label={t('programs.week.kind')}>
            {(['private', 'semi'] as const).map(k => (
              <button key={k} type="button" aria-pressed={sub === k} onClick={() => setSub(k)}>
                {t(`home.program.${k}.name`)}
              </button>
            ))}
          </div>
        )}
        {kind === 'group' && (
          <div className="wk-seg" role="group" aria-label={t('programs.week.level')}>
            <button type="button" aria-pressed={band === 'all'} onClick={() => setBand('all')}>{t('programs.week.allLevels')}</button>
            {BANDS.map(b => (
              <button key={b} type="button" aria-pressed={band === b} onClick={() => setBand(b)}>
                <span className="wk-dot" style={{ background: BAND_COLORS[b] }} />
                {t('programs.week.band', { a: b.split('-')[0], b: b.split('-')[1] })}
              </button>
            ))}
          </div>
        )}
        {data && data !== 'error' && total > 0 && <div className="wk-count">{t(countKey, { n: total })}</div>}
      </div>

      {!data ? (
        <div className="wk-state" role="status">{t('programs.week.loading')}</div>
      ) : data === 'error' ? (
        <div className="wk-state" role="alert">{t('programs.week.error')}</div>
      ) : total === 0 ? (
        <div className="wk-state">{t('programs.week.empty')}</div>
      ) : (
        <div className="wk">
          {days.map(d => {
            const list = entriesFor(d)
            const k = sub + d.date
            const shown = open[k] ? list : list.slice(0, SHOW)
            const isToday = d.date === data.from
            return (
              <div key={d.date} className={'wk-day' + (isToday ? ' today' : '')}>
                <div className="wk-hd">
                  <b>{dayName(d.date)}</b>
                  {isToday ? <span className="tg">{t('programs.week.today')}</span> : <span>{md(d.date)}</span>}
                </div>
                <div className={'wk-list' + (kind === 'private' ? '' : ' wide')}>
                  {list.length === 0 && <div className="wk-none">{t('programs.week.none')}</div>}
                  {shown.map(e => (
                    <Link key={e.key} className="wk-slot" href={target}>
                      {e.label}
                      {e.tag && <small><span className="wk-dot" style={{ background: e.tag.color }} />{e.tag.text}</small>}
                    </Link>
                  ))}
                  {list.length > SHOW && (
                    <button type="button" className="wk-more" aria-expanded={!!open[k]}
                      onClick={() => setOpen(o => ({ ...o, [k]: !o[k] }))}>
                      {open[k] ? t('programs.week.less') : t('programs.week.more', { n: list.length - SHOW })}
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <div className="wk-foot">
        <p>{kind === 'team' ? t('plans.team.autoPlace') : signedIn ? t('programs.week.member') : t('programs.week.guest')}</p>
        <Link className="b-btn gold" href={target}>
          {kind === 'team' ? t('programs.team.join') : signedIn ? t('quick.book') : t('assess.hero.cta')} →
        </Link>
      </div>
    </div>
  )
}
