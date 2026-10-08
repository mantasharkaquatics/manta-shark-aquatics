'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { NAV_GROUPS } from './nav-groups'
import { useT } from '@/lib/i18n/provider'
import { useUnreadChats } from './components/MessagesNavBadge'

function NavBody({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname()
  const t = useT()
  // Asked for after paint, never during it. Counting the review queues reads
  // every confirmed booking and differences it against recorded progress —
  // roughly a second — and the sidebar is on every admin page. Blocking each
  // render on that would make the whole back office a second slower to load.
  const [reviewCount, setReviewCount] = useState<number | null>(null)
  useEffect(() => {
    let alive = true
    const load = (fresh: boolean) => fetch('/api/admin/review-count' + (fresh ? '?fresh=1' : ''))
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (alive && d && typeof d.total === 'number') setReviewCount(d.total) })
      .catch(() => {})
    load(false)
    // Reviews clears cards without reloading the page; it says so here.
    const onChange = () => { load(true) }
    window.addEventListener('admin:reviews-changed', onChange)
    return () => { alive = false; window.removeEventListener('admin:reviews-changed', onChange) }
  }, [pathname])
  // Conversations waiting for a person (an AI handoff, or a parent writing in).
  const unreadChats = useUnreadChats(pathname)
  // Suggestion-box entries not yet handled (owner, 2026-10-08). Read on each
  // page change, and again when the Suggestions page marks one.
  const [newSuggestions, setNewSuggestions] = useState(0)
  useEffect(() => {
    let alive = true
    const load = () => fetch('/api/admin/suggestions/count')
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (alive && d && typeof d.count === 'number') setNewSuggestions(d.count) })
      .catch(() => {})
    load()
    window.addEventListener('admin:suggestions-changed', load)
    return () => { alive = false; window.removeEventListener('admin:suggestions-changed', load) }
  }, [pathname])

  return (
    <>
      <div className="flex-1 space-y-6">
        {NAV_GROUPS.map((group) => (
          <div key={group.titleKey}>
            <p className="text-gray-600 text-[10px] font-semibold uppercase tracking-widest px-3 mb-2">
              {t(group.titleKey)}
            </p>
            <div className="space-y-0.5">
              {group.items.map((item) => {
                // '/admin' is a prefix of every other admin route, so it only
                // counts as active on an exact match.
                const active =
                  item.href === '/admin'
                    ? pathname === '/admin'
                    : pathname === item.href || pathname.startsWith(item.href + '/')
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onNavigate}
                    className={
                      'flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all ' +
                      (active
                        ? 'bg-[#1e3a6e] text-[#c9a84c] font-semibold'
                        : 'text-gray-400 hover:text-white hover:bg-[#16244a]')
                    }
                  >
                    <span className="shrink-0">{item.icon}</span>
                    <span className="whitespace-nowrap">{t(item.labelKey)}</span>
                    {item.href === '/admin/reviews' && reviewCount !== null && reviewCount > 0 && (
                      <span className="ml-auto shrink-0 text-[10px] font-bold leading-none px-1.5 py-1 rounded-full bg-red-500 text-white tabular-nums">
                        {reviewCount > 99 ? '99+' : reviewCount}
                      </span>
                    )}
                    {item.href === '/admin/messages' && unreadChats > 0 && (
                      <span className="ml-auto shrink-0 text-[10px] font-bold leading-none px-1.5 py-1 rounded-full bg-red-500 text-white tabular-nums">
                        {unreadChats > 99 ? '99+' : unreadChats}
                      </span>
                    )}
                    {item.href === '/admin/suggestions' && newSuggestions > 0 && (
                      <span className="ml-auto shrink-0 text-[10px] font-bold leading-none px-1.5 py-1 rounded-full bg-red-500 text-white tabular-nums">
                        {newSuggestions > 99 ? '99+' : newSuggestions}
                      </span>
                    )}
                  </Link>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </>
  )
}

export function AdminMenuButton() {
  const t = useT()
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t('admin.nav.openMenu')}
        className="lg:hidden text-gray-300 hover:text-white p-2 -ml-2"
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          <path d="M3 6h18M3 12h18M3 18h18" />
        </svg>
      </button>

      {open ? (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div
            className="absolute inset-0 bg-black/60"
            onClick={() => setOpen(false)}
          />
          <div className="relative flex flex-col w-64 bg-[#111d38] border-r border-[#1e3a6e] py-6 px-3 overflow-y-auto">
            <NavBody onNavigate={() => setOpen(false)} />
          </div>
        </div>
      ) : null}
    </>
  )
}

export default function AdminSidebar() {
  return (
    <aside className="hidden lg:flex flex-col w-52 shrink-0 border-r border-[#1e3a6e] bg-[#111d38] h-full overflow-y-auto py-6 px-3">
      <NavBody />
    </aside>
  )
}
