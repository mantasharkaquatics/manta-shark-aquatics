'use client'

import { useT } from '@/lib/i18n/provider'
import { BRAND } from '@/lib/brand'

/* "Is {name} a boy or a girl?" -- optional (owner, 2026-10-29). Asked
   wherever a family adds a swimmer (the register form and My Account), with
   "prefer not to say" beside the two answers; leaving it blank is fine too.
   Stored in students.gender as 'male' or 'female', the values
   lib/monthly-reports.ts reads; 'none' and no answer both store nothing.
   The app's 3D swimmer does not depend on it: with no gender the card asks
   which look to start from instead. */

export type { Gender } from '@/lib/swimmer-look'
import type { Gender } from '@/lib/swimmer-look'

/** What the question can hold: an answer, "prefer not to say", or nothing yet. */
export type GenderAnswer = Gender | 'none' | null

export function GenderQuestion({ id, name, value, onChange }: {
  id: string; name: string; value: GenderAnswer; onChange: (v: GenderAnswer) => void
}) {
  const t = useT()
  const opt = (v: Gender | 'none', label: string) => (
    <label style={{
      minWidth: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, minHeight: 44, padding: '8px 4px',
      textAlign: 'center', lineHeight: 1.2, wordBreak: 'keep-all',
      border: `1.5px solid ${value === v ? BRAND.blue : '#d5e0ef'}`, borderRadius: 8, cursor: 'pointer',
      fontSize: 15, fontWeight: 700, color: value === v ? BRAND.blue : '#16294a', background: value === v ? '#eef4fc' : '#fff',
    }}>
      <input type="radio" name={`${id}-g`} checked={value === v} onChange={() => onChange(v)}
        style={{ width: 16, height: 16, margin: 0, flexShrink: 0, accentColor: BRAND.blue }} />
      {label}
    </label>
  )
  return (
    <div role="radiogroup" aria-labelledby={`${id}-q`}>
      <p id={`${id}-q`} style={{ display: 'block', fontSize: 14, color: '#16294a', fontWeight: 600, margin: '0 0 6px' }}>
        {t('swimmer.gender.q', { name: name || t('safety.medical.thisSwimmer') })}{' '}
        <span style={{ color: '#56647d', fontWeight: 400 }}>{t('register.optional')}</span>
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
        {opt('male', t('swimmer.gender.male'))}
        {opt('female', t('swimmer.gender.female'))}
        {opt('none', t('swimmer.gender.none'))}
      </div>
    </div>
  )
}
