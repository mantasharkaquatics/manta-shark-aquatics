'use client'

/* The booking page's own pieces, shared with FamilyBooking so that booking
   several children together looks like booking one (owner, 2026-11-04,
   問題 6 選項 A): the step bar, the answered-step lines, the section titles,
   the choice cards and the course colours and icons. */

import { useT } from '@/lib/i18n/provider'
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
