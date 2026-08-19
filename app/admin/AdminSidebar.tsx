'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { NAV_GROUPS } from './nav-groups'

export default function AdminSidebar() {
  const pathname = usePathname()

  // The dashboard is its own launcher grid, so no sidebar there.
  if (pathname === '/admin') return null

  return (
    <aside className="hidden lg:block w-52 shrink-0 border-r border-[#1e3a6e] bg-[#111d38] min-h-[calc(100vh-89px)] py-6 px-3">
      <div className="space-y-6">
        {NAV_GROUPS.map((group) => (
          <div key={group.title}>
            <p className="text-gray-600 text-[10px] font-semibold uppercase tracking-widest px-3 mb-2">
              {group.title}
            </p>
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const active = pathname === item.href || pathname.startsWith(item.href + '/')
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={
                      'flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all ' +
                      (active
                        ? 'bg-[#1e3a6e] text-[#c9a84c] font-semibold'
                        : 'text-gray-400 hover:text-white hover:bg-[#16244a]')
                    }
                  >
                    <span className="shrink-0">{item.icon}</span>
                    <span className="whitespace-nowrap">{item.label}</span>
                  </Link>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </aside>
  )
}
