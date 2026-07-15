import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import MessagesNavBadge from './components/MessagesNavBadge'
import SignOutButton from './components/SignOutButton'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } }
  )
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: admin } = await supabase.from('admins').select('id, first_name, last_name, role').eq('auth_user_id', user.id).single()
  if (!admin) redirect('/dashboard')

  const navLinks = [
    { href: '/admin', label: 'Dashboard' },
    { href: '/admin/members', label: 'Members' },
    { href: '/admin/coaches', label: 'Coaches' },
    { href: '/admin/booking', label: 'Booking' },
    { href: '/admin/schedule', label: 'Schedule' },
    { href: null, label: '|' },
    { href: '/admin/upgrades', label: 'Upgrades' },
    { href: '/admin/progress-history', label: 'Progress' },
    { href: null, label: '|' },
    { href: '/admin/checkin', label: 'Check-in' },
    { href: '/admin/time-off', label: 'Time Off' },
    { href: '/admin/sales', label: 'Sales' },
    { href: '/admin/pos', label: 'POS' },
  ]

  return (
    <div className="min-h-screen bg-[#0d1529]">
      <nav className="bg-[#111d38] border-b border-[#1e3a6e] px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-3">
              <Image src="/logo.png" alt="Manta Shark" width={64} height={64} />
              <div>
                <p className="text-[#c9a84c] text-xs font-semibold uppercase tracking-widest">Admin</p>
                <p className="text-white text-sm font-semibold">{admin.first_name} {admin.last_name}</p>
              </div>
            </div>
            <div className="hidden md:flex items-center gap-1">
              {navLinks.map((link, i) => (
                link.href === null
                  ? <span key={i} className="text-[#1e3a6e] text-lg px-1 select-none">|</span>
                  : <Link key={link.href} href={link.href}
                      className="text-gray-300 hover:text-[#c9a84c] hover:bg-[#1e3a6e] px-3 py-2 rounded-lg text-sm transition-all">
                      {link.label}
                    </Link>
              ))}
              <MessagesNavBadge />
            </div>
          </div>
          <SignOutButton />
        </div>
      </nav>
      <main className="max-w-7xl mx-auto px-6 py-8">{children}</main>
    </div>
  )
}
