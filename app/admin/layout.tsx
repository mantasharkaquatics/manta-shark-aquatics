import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import AdminSidebar from './AdminSidebar'
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


  return (
    <div className="min-h-screen bg-[#0d1529]">
      <nav className="bg-[#111d38] border-b border-[#1e3a6e] px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-3">
              <Image src="/logo.png" alt="Manta Shark" width={40} height={40} />
              <div>
                <p className="text-[#c9a84c] text-xs font-semibold uppercase tracking-widest">Admin</p>
                <p className="text-white text-sm font-semibold whitespace-nowrap">{admin.first_name} {admin.last_name}</p>
              </div>
            </div>
            <div className="hidden md:flex flex-wrap items-center gap-1">
              <Link href="/admin" className="text-gray-300 hover:text-[#c9a84c] hover:bg-[#1e3a6e] px-2.5 py-1.5 rounded-lg text-sm whitespace-nowrap transition-all">Dashboard</Link>
              <MessagesNavBadge />
            </div>
          </div>
          <SignOutButton />
        </div>
      </nav>
      <div className="flex">
        <AdminSidebar />
        <main className="flex-1 min-w-0 px-6 py-8">{children}</main>
      </div>
    </div>
  )
}
