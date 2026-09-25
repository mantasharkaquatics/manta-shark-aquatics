'use client'

import { useLocale } from '@/lib/i18n/provider'

/** The wrapper every parent-facing page sits in: sets the reading face and
 *  ink colour, and marks Chinese so headings drop the italic. */
export default function BrandRoot({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  const locale = useLocale()
  const zh = locale.startsWith('zh')
  return <div className={['b-root', zh ? 'zh' : '', className].filter(Boolean).join(' ')}>{children}</div>
}
