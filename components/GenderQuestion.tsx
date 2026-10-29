'use client'

import { useT } from '@/lib/i18n/provider'
import { BRAND } from '@/lib/brand'

/* "Is {name} a boy or a girl?" (owner, 2026-10-29). Asked wherever a family
   adds a swimmer -- the register form and My Account -- so the app's 3D
   swimmer can start as the right one. Stored in students.gender as 'male' or
   'female', the values lib/monthly-reports.ts already reads. */

export type { Gender } from '@/lib/swimmer-look'
import type { Gender } from '@/lib/swimmer-look'

export function GenderQuestion({ id, name, value, onChange }: {
  id: string; name: string; value: Gender | null; onChange: (v: Gender) => void
}) {
  const t = useT()
  const opt = (v: Gender, label: string) => (
    <label style={{
      flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 44, padding: '8px 12px',
      border: `1.5px solid ${value === v ? BRAND.blue : '#d5e0ef'}`, borderRadius: 8, cursor: 'pointer',
      fontSize: 15, fontWeight: 700, color: value === v ? BRAND.blue : '#16294a', background: value === v ? '#eef4fc' : '#fff',
    }}>
      <input type="radio" name={`${id}-g`} checked={value === v} onChange={() => onChange(v)}
        style={{ width: 18, height: 18, accentColor: BRAND.blue }} />
      {label}
    </label>
  )
  return (
    <div role="radiogroup" aria-labelledby={`${id}-q`}>
      <p id={`${id}-q`} style={{ display: 'block', fontSize: 14, color: '#16294a', fontWeight: 600, margin: '0 0 6px' }}>
        {t('swimmer.gender.q', { name: name || t('safety.medical.thisSwimmer') })} <span style={{ color: '#c0392b' }} aria-hidden="true">*</span>
      </p>
      <div style={{ display: 'flex', gap: 8 }}>
        {opt('male', t('swimmer.gender.male'))}
        {opt('female', t('swimmer.gender.female'))}
      </div>
    </div>
  )
}
