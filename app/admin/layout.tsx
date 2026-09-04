import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import AdminSidebar, { AdminMenuButton } from './AdminNav'
import SignOutButton from './components/SignOutButton'
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
    // The shell is exactly one viewport tall on a desktop and the two panes
    // scroll independently, so nothing in the chrome ever scrolls out of reach.
    <div className="min-h-screen bg-[#0d1529] lg:h-dvh lg:flex lg:flex-col lg:overflow-hidden">
      {/* Sign Out sits top-right on the identity row, which is where the coach
          portal already puts it and where a hand goes looking for it. At the
          foot of the sidebar it was the furthest control from everything else
          on screen, and on a phone it was inside a drawer you had to open
          first. Bordered rather than plain so it reads as a different kind of
          control than the navigation above it. */}
      <nav className="bg-[#111d38] border-b border-[#1e3a6e] px-6 py-4 lg:shrink-0">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <AdminMenuButton />
            <Image src="/logo.png" alt="Manta Shark" width={40} height={40} className="shrink-0" />
            <div className="min-w-0">
              <p className="text-[#c9a84c] text-xs font-semibold uppercase tracking-widest">Admin</p>
              <p className="text-white text-sm font-semibold truncate">{admin.first_name} {admin.last_name}</p>
            </div>
          </div>
          {/* SignOutButton is w-full for the sidebar it was written for. */}
          <div className="shrink-0 [&_button]:w-auto [&_button]:min-h-11 [&_button]:rounded-lg [&_button]:border [&_button]:border-[#1e3a6e]">
            <SignOutButton />
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
