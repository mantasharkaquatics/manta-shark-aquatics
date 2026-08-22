'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const TABS = [
  { href: '/coach', label: 'Today' },
  { href: '/coach/schedule', label: 'Schedule' },
  { href: '/coach/time-off', label: 'Time Off' },
  { href: '/coach/progress', label: 'Progress' },
]

/**
 * The four destinations as an evenly divided tab row rather than a left-hugging
 * list. Two reasons beyond filling the dead space: each tab becomes a quarter of
 * the screen instead of the width of its own word, which is a far easier target
 * on a pool deck; and a tab row can show which page you are on, which the plain
 * list could not -- there was no indication anywhere in the portal.
 *
 * Exact match, not startsWith: /coach is a prefix of all three of the others, so
 * startsWith would light Today up on every page. Same trap as /admin in the
 * admin sidebar.
 */
export default function CoachTabs() {
  const pathname = usePathname()
  return (
    <nav className="flex border-b border-[#1e3a6e]" aria-label="Coach portal">
      {TABS.map(tab => {
        const active = pathname === tab.href
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? 'page' : undefined}
            className={`flex flex-1 items-center justify-center min-h-12 -mb-px border-b-2 text-sm transition-colors ${
              active
                ? 'border-[#c9a84c] text-[#c9a84c] font-semibold'
                : 'border-transparent text-gray-300 hover:text-[#c9a84c]'
            }`}
          >
            {tab.label}
          </Link>
        )
      })}
    </nav>
  )
}
