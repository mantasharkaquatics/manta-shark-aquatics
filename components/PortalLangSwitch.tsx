'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSetLocale, useLocale, useT } from '@/lib/i18n/provider'
import type { Locale } from '@/lib/i18n'

/**
 * Two words in the portal header, not a settings page: someone who opened the
 * portal in the wrong language cannot read a settings page to get out of it.
 * Shared by the coach portal and the admin back office; each passes the route
 * that stores its own account's choice.
 *
 * The switch applies immediately and writes back in the background. If the write
 * fails the portal is still in the language they asked for -- it just will not
 * be next time, which is a far smaller problem than blocking on the network at
 * the poolside.
 */
const OPTIONS: { locale: Locale; label: string }[] = [
  { locale: 'en', label: 'EN' },
  { locale: 'zh-Hant', label: '中文' },
]

export default function PortalLangSwitch(
  { endpoint, refreshServer = false }: { endpoint: string; refreshServer?: boolean }
) {
  const router = useRouter()
  const locale = useLocale()
  const setLocale = useSetLocale()
  const t = useT()
  const [busy, setBusy] = useState(false)

  async function pick(next: Locale) {
    if (next === locale || busy) return
    setLocale(next)
    setBusy(true)
    try {
      await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ language: next }),
      })
      // Client components switch at once through the provider. Server-rendered
      // words (the admin dashboard is a server component) were drawn with the
      // old language, so ask for them again once the new choice is stored.
      if (refreshServer) router.refresh()
    } catch {
      // left as chosen for this session; nothing to tell anyone about
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex rounded-lg border border-[#1e3a6e] overflow-hidden" role="group" aria-label={t('coach.lang.label')}>
      {OPTIONS.map(o => (
        <button
          key={o.locale}
          onClick={() => pick(o.locale)}
          aria-pressed={locale === o.locale}
          className={`min-h-11 px-3 text-xs font-semibold transition-colors ${
            locale === o.locale ? 'bg-[#c9a84c] text-[#1a2744]' : 'bg-transparent text-gray-400 hover:text-[#c9a84c]'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
