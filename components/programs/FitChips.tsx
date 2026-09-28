'use client'

import { useT } from '@/lib/i18n/provider'
import { BRAND } from '@/lib/brand'

/* "Good for" chips on a lesson card (owner, 2026-09-28): who each kind of
   lesson suits, as short tags instead of a sentence. Used on the home page
   and on /programs/private and /programs/group, so both say the same thing. */

export const HAS_FIT = new Set(['private', 'semi', 'group'])

const css = `
  .fit { flex: 1; display: flex; flex-direction: column; gap: 8px; margin-top: 12px; }
  .fit-l { font-size: 12px; font-weight: 800; letter-spacing: .06em; color: ${BRAND.mute}; }
  .fit ul { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 6px; align-content: flex-start; }
  .fit li { font-size: 13px; font-weight: 700; line-height: 1.3; color: ${BRAND.navy}; background: ${BRAND.paper};
    border: 1px solid #d6e3f5; border-radius: 10px; padding: 6px 11px; }
`

export default function FitChips({ slug }: { slug: 'private' | 'semi' | 'group' }) {
  const t = useT()
  return (
    <div className="fit">
      <style>{css}</style>
      <div className="fit-l">{t('home.program.fitLabel')}</div>
      <ul>{[1, 2, 3, 4].map(n => <li key={n}>{t(`home.program.${slug}.fit${n}`)}</li>)}</ul>
    </div>
  )
}
