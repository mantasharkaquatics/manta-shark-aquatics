'use client'

import Link from 'next/link'
import { useT } from '@/lib/i18n/provider'
import AppInfoPage from '@/components/brand/AppInfoPage'

/* 我的 › 關於學校 (owner, 2026-11-03): the school's own pages, which used to
   be a list on 我的 itself, on a page of their own now that 我的 is one
   screen. Each opens the app's short version of that page. */
const ROWS = [
  { href: '/programs', ico: '🏊', key: 'page.programs' },
  { href: '/levels', ico: '🪜', key: 'page.levels' },
  { href: '/plans', ico: '🏷️', key: 'page.plans' },
  { href: '/faq', ico: '❓', key: 'page.faq' },
  { href: '/about', ico: '🦈', key: 'page.about' },
  { href: '/policies', ico: '📄', key: 'page.policies' },
]

export default function SchoolPage() {
  const t = useT()
  return (
    <AppInfoPage title={t('app.me.school')}>
      <nav className="ai-list">
        {ROWS.map(r => (
          <Link key={r.href} href={r.href} className="ai-row">
            <span aria-hidden="true" style={{ fontSize: 18, width: 24, textAlign: 'center', flexShrink: 0 }}>{r.ico}</span>
            <div><b>{t(r.key)}</b></div>
            <i aria-hidden="true">›</i>
          </Link>
        ))}
      </nav>
    </AppInfoPage>
  )
}
