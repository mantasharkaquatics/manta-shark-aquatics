import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import SignOutButton from '../admin/components/SignOutButton'

export default async function CoachLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } }
  )
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: coach } = await supabase.from('coaches').select('id, first_name, last_name').eq('auth_user_id', user.id).single()
  if (!coach) redirect('/dashboard')

  return (
    <div className="min-h-screen bg-[#0d1529]">
      {/* One flex row at desktop, two stacked rows on a phone. This is a server
          component, so there is no hamburger to open -- instead the four links
          wrap onto as many lines as they need. A coach standing on a pool deck
          gets every destination visible at once, which beats a menu anyway. */}
      <nav className="bg-[#111d38] border-b border-[#1e3a6e] px-4 sm:px-6 py-3 sm:py-4">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-3 sm:gap-4">
            <Image src="/logo.png" alt="Manta Shark" width={64} height={64} className="w-10 h-10 sm:w-16 sm:h-16 shrink-0" />
            <div className="min-w-0">
              <p className="text-[#c9a84c] text-xs font-semibold uppercase tracking-widest">Coach Portal</p>
              <p className="text-white font-semibold truncate">{coach.first_name} {coach.last_name}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1 sm:gap-6">
            <Link href="/coach" className="flex items-center min-h-11 sm:min-h-0 text-gray-300 hover:text-[#c9a84c] text-sm transition-colors">Today</Link>
            <Link href="/coach/schedule" className="flex items-center min-h-11 sm:min-h-0 text-gray-300 hover:text-[#c9a84c] text-sm transition-colors">Schedule</Link>
            <Link href="/coach/time-off" className="flex items-center min-h-11 sm:min-h-0 text-gray-300 hover:text-[#c9a84c] text-sm transition-colors">Time Off</Link>
            <Link href="/coach/progress" className="flex items-center min-h-11 sm:min-h-0 text-gray-300 hover:text-[#c9a84c] text-sm transition-colors">Progress</Link>
            {/* SignOutButton is w-full for the admin sidebar it was written for. */}
            <div className="shrink-0 [&_button]:w-auto [&_button]:min-h-11">
              <SignOutButton />
            </div>
          </div>
        </div>
      </nav>
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {children}
      </main>
    </div>
  )
}
