'use client'

/* The booking page's own pieces, shared with FamilyBooking so that booking
   several children together looks like booking one (owner, 2026-11-04,
   問題 6 選項 A): the step bar, the answered-step lines, the section titles,
   the choice cards and the course colours and icons. */

import { useState } from 'react'
import { useT } from '@/lib/i18n/provider'
import { fmtDate } from '@/lib/fmt-date'
import { BRAND, FONT_DISPLAY } from '@/lib/brand'

const GOLD = BRAND.blue
const AMBER = BRAND.amber

export const COURSE_COLORS: Record<string, string> = {
  '1on1': '#c97d00', '1on2': '#4a90c4', '1on4': '#4caf72', 'team': '#e05a4a',
}
export const COURSE_ICONS: Record<string, string> = {
  '1on1': '👤', '1on2': '👥', '1on4': '👨‍👩‍👧‍👦', 'team': '🏊',
}

export function SectionTitle({ eyebrow, title, gap = 24 }: { eyebrow?: string; title: string; gap?: number }) {
  return (
    <div style={{ marginBottom: `${gap}px` }}>
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
export function DoneRow({ label, value, sub, onChange, changeLabel }: {
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

/* A choice card (swimmer, course, second swimmer). It is a div with a
   button's role, not a <button>: the cards hold block layout, and the global
   button rules in globals.css would reshape them. Keyboard and switch users
   had no way to pick one before (found 2026-10-15), so it takes focus, Enter
   and Space, and says whether it is selected or unavailable. */
export function SelectCard({ selected, onClick, color = GOLD, disabled = false, children }: {
  selected: boolean; onClick: () => void; color?: string; disabled?: boolean; children: React.ReactNode
}) {
  return (
    <div role="button" tabIndex={0} aria-pressed={selected} aria-disabled={disabled || undefined} className="sel-card"
      onClick={() => { if (!disabled) onClick() }}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (!disabled) onClick() } }}
      style={{
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
        }} aria-hidden="true">✓</div>
      )}
      {children}
    </div>
  )
}

/* Where the family is in the booking (owner, 2026-11-01, version 2): who,
   then which lesson, then how, then when. */
const STEPS_CSS = `.bk-steps { display: flex; gap: 8px; list-style: none; margin: 0 0 22px; padding: 0 }
.bk-steps li { flex: 1; text-align: center; padding: 0 0 8px; border-bottom: 3px solid #d3deec; font-size: 13.5px; font-weight: 800; color: #5f6b80 }
.bk-steps li.done { color: #56647d; border-color: #9fb3d3 }
.bk-steps li.on { color: #16294a; border-color: #f09800 }`
export function StepBar({ steps, at }: { steps: string[]; at: number }) {
  const t = useT()
  return (
    <>
      <style>{STEPS_CSS}</style>
      <ol className="bk-steps" aria-label={t('booking.steps.label')}>
        {steps.map((k, i) => (
          <li key={k} className={i === at ? 'on' : i < at ? 'done' : undefined} aria-current={i === at ? 'step' : undefined}>
            {i + 1} {t('booking.steps.' + k)}
          </li>
        ))}
      </ol>
    </>
  )
}

/** 9:10 -> "09:10", 14:00 -> "02:00": a 12-hour clock with two-digit hours
 *  and no AM/PM, for a list already headed 上午 / 下午. */
export const hh12 = (tm: string) => {
  const [h, m] = String(tm).slice(0, 5).split(':').map(Number)
  return `${String(h % 12 || 12).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/* Every list of times in booking is two columns, morning left and afternoon
   right, each time as 09:10 / 02:00 (owner, 2026-11-02 for every week;
   2026-11-05, 決定 8 選項 A: single lessons, one child or several, the
   assessment, a move and a make-up too -- one kind of time button). A
   column on a wide screen holds more than one time per row. */
export function AmPmColumns<T>({ items, time, render, count = true }: {
  items: T[]; time: (x: T) => string; render: (x: T) => React.ReactNode; count?: boolean
}) {
  const t = useT()
  const halves = [['am', items.filter(x => String(time(x)).slice(0, 5) < '12:00')], ['pm', items.filter(x => String(time(x)).slice(0, 5) >= '12:00')]] as const
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '10px', alignItems: 'start' }}>
      {halves.map(([half, part]) => (
        <section key={half} aria-label={t('booking.fixed.' + half)}>
          <div style={{ textAlign: 'center', padding: '6px 4px', borderRadius: '9px', background: '#dfe7f3', marginBottom: '8px' }}>
            <span style={{ fontSize: '14px', fontWeight: 800, color: BRAND.navy }}>{t('booking.fixed.' + half)}</span>
            {count && <span style={{ fontSize: '12.5px', fontWeight: 600, color: '#56647d', marginLeft: '6px' }}>{t('booking.fixed.count', { n: part.length })}</span>}
          </div>
          {part.length === 0 && (
            <p style={{ margin: 0, padding: '14px 6px', textAlign: 'center', fontSize: '13px', color: '#7b879c', borderRadius: '10px', border: '1px dashed #d3deec' }}>{t('booking.fixed.halfNone')}</p>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: '8px' }}>
            {part.map(x => render(x))}
          </div>
        </section>
      ))}
    </div>
  )
}

/* A month calendar of dates to pick from, drawn like the one-child booking
   calendar (決定 8 選項 A): several children booked one lesson at a time
   used to get a sideways row of date chips instead. `days` are the dates
   that may be offered (YYYY-MM-DD, in order); `open` says which have a time.
   The first month starts on the Sunday of the first day's week. */
export function MonthCalendar({ days, open, selected, onPick, dateTagName, legend }: {
  days: string[]; open: (ds: string) => boolean; selected: string | null; onPick: (ds: string) => void; dateTagName: string | string[] | undefined; legend?: string
}) {
  const t = useT()
  const months = [...new Set(days.map(d => d.slice(0, 7)))]
  const [mi, setMi] = useState(() => Math.max(0, selected ? months.indexOf(selected.slice(0, 7)) : 0))
  const ym = months[Math.min(mi, months.length - 1)]
  if (!ym) return null
  const [y, m] = ym.split('-').map(Number)
  const inSet = new Set(days)
  const pad = (n: number) => String(n).padStart(2, '0')
  const last = new Date(y, m, 0).getDate()
  // The first month starts on the Sunday of the first offered day's week
  // (days of the month before it are left blank), the others on the 1st.
  const startDay = mi === 0 && days[0] ? Number(days[0].slice(8, 10)) : 1
  const from = startDay - new Date(y, m - 1, startDay).getDay()
  const cells: (string | null)[] = []
  for (let d = from; d <= last; d++) cells.push(d < 1 ? null : `${ym}-${pad(d)}`)
  const today = new Date(); const todayDs = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`
  const navBtn = (dir: -1 | 1, can: boolean, label: string) => (
    <button type="button" onClick={() => can && setMi(mi + dir)} disabled={!can} aria-label={label}
      style={{ background: 'transparent', border: 'none', color: can ? '#56647d' : '#9aa6ba', fontSize: '22px', cursor: can ? 'pointer' : 'default', minWidth: '44px', minHeight: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {dir < 0 ? '‹' : '›'}
    </button>
  )
  return (
    <div style={{ background: '#fff', borderRadius: '16px', padding: '14px 12px', border: '1px solid #e3ebf6' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
        {navBtn(-1, mi > 0, t('booking.cal.prevMonth'))}
        <span style={{ fontSize: '16px', fontWeight: 700, color: '#16294a' }}>{t('booking.calMonth', { month: t('date.month.' + m), year: y })}</span>
        {navBtn(1, mi < months.length - 1, t('booking.cal.nextMonth'))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: '4px', marginBottom: '8px' }}>
        {[0, 1, 2, 3, 4, 5, 6].map(d => (
          <div key={d} style={{ textAlign: 'center', fontSize: '13px', fontWeight: 600, color: '#56647d', padding: '4px 0' }}>{t('date.weekdayShort.' + d)}</div>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: '4px' }}>
        {cells.map((ds, j) => {
          if (!ds) return <div key={'e' + j} />
          const ok = inSet.has(ds) && open(ds)
          const on = selected === ds
          const isToday = ds === todayDs
          const dt = new Date(Number(ds.slice(0, 4)), Number(ds.slice(5, 7)) - 1, Number(ds.slice(8, 10)))
          return (
            <button key={ds} type="button" className="kb-focus" aria-pressed={on} aria-disabled={!ok || undefined}
              aria-current={isToday ? 'date' : undefined}
              aria-label={fmtDate(dt, dateTagName, { weekday: 'long', month: 'long', day: 'numeric' }) + (ok ? t('booking.aria.hasTimes') : '')}
              onClick={() => { if (ok && !on) onPick(ds) }}
              style={{ padding: '10px 4px', minHeight: '48px', borderRadius: '10px', border: '2px solid transparent', fontFamily: 'inherit',
                background: on ? BRAND.navy : 'transparent', color: on ? '#fff' : ok ? BRAND.navy : '#b7c2d4',
                fontSize: '16px', fontWeight: on ? 700 : ok ? 600 : 500, cursor: ok ? 'pointer' : 'not-allowed',
                outline: isToday && !on ? `1.5px solid ${GOLD}` : 'none', outlineOffset: '-1.5px' }}>
              {Number(ds.slice(8, 10))}
              {ok && !on && <span aria-hidden="true" style={{ display: 'block', width: '4px', height: '4px', borderRadius: '50%', background: AMBER, margin: '2px auto 0' }} />}
            </button>
          )
        })}
      </div>
      {legend && <p style={{ margin: '14px 0 0', textAlign: 'center', fontSize: '12.5px', color: '#56647d', lineHeight: 1.5 }}>{legend}</p>}
    </div>
  )
}
