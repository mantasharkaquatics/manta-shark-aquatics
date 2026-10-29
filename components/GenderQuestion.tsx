'use client'

import { useT } from '@/lib/i18n/provider'
import { BRAND } from '@/lib/brand'

/* NOT USED (owner, 2026-10-29): families are no longer asked a swimmer's
   gender at all -- first it was required, then optional, then "just don't
   ask, it's simpler". The register form and My Account no longer show this.
   The file stays only because changes reach the owner's computer as patches
   that cannot delete files; delete it, with the swimmer.gender.q and
   swimmer.gender.none keys in the three site locales, whenever convenient.

   It asked "Is {name} a boy or a girl?" with boy / girl / prefer not to say,
   stored as students.gender 'male' / 'female' or nothing. */

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
