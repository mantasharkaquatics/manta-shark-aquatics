import Link from 'next/link'
import { NAV_GROUPS } from './nav-groups'

export default function AdminLauncher() {
  return (
    <div className="mt-10 mb-10 space-y-8">
      {NAV_GROUPS.map((group) => (
        <div key={group.title}>
          <p className="text-gray-500 text-xs font-semibold uppercase tracking-widest mb-3">{group.title}</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {group.items.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-start gap-3 bg-[#111d38] border border-[#1e3a6e] rounded-xl p-4 hover:border-[#c9a84c] hover:bg-[#16244a] transition-all"
              >
                <span className="text-[#c9a84c] mt-0.5 shrink-0">{item.icon}</span>
                <span className="min-w-0">
                  <span className="block text-white text-sm font-semibold">{item.label}</span>
                  <span className="block text-gray-500 text-xs mt-0.5">{item.desc}</span>
                </span>
              </Link>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
