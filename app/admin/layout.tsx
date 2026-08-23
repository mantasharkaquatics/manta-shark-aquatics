import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import AdminSidebar, { AdminMenuButton } from './AdminNav'
import Image from 'next/image'

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
    // On a desktop the shell is exactly one viewport tall and the two panes
    // scroll independently, so Sign Out at the foot of the nav is always in
    // reach. It used to sit at the bottom of a sidebar that grew as tall as the
    // page, which on a long list meant scrolling past everything to log out.
    <div className="min-h-screen bg-[#0d1529] lg:h-dvh lg:flex lg:flex-col lg:overflow-hidden">
      <nav className="bg-[#111d38] border-b border-[#1e3a6e] px-6 py-4 lg:shrink-0">
        <div className="flex items-center gap-3">
          <AdminMenuButton />
          <Image src="/logo.png" alt="Manta Shark" width={40} height={40} />
          <div>
            <p className="text-[#c9a84c] text-xs font-semibold uppercase tracking-widest">Admin</p>
            <p className="text-white text-sm font-semibold whitespace-nowrap">{admin.first_name} {admin.last_name}</p>
          </div>
        </div>
      </nav>
      <div className="flex lg:flex-1 lg:min-h-0">
        <AdminSidebar />
        <main className="flex-1 min-w-0 px-6 py-8 lg:overflow-y-auto lg:overflow-x-auto">{children}</main>
      </div>
    </div>
  )
}
