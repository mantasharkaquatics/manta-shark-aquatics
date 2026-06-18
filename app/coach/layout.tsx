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
      <nav className="bg-[#111d38] border-b border-[#1e3a6e] px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Image src="/logo.png" alt="Manta Shark" width={48} height={48} />
            <div>
              <p className="text-[#c9a84c] text-xs font-semibold uppercase tracking-widest">Coach Portal</p>
              <p className="text-white font-semibold">{coach.first_name} {coach.last_name}</p>
            </div>
          </div>
          <div className="flex items-center gap-6">
            <Link href="/coach" className="text-gray-300 hover:text-[#c9a84c] text-sm transition-colors">Today</Link>
            <Link href="/coach/schedule" className="text-gray-300 hover:text-[#c9a84c] text-sm transition-colors">Schedule</Link>
            <Link href="/coach/time-off" className="text-gray-300 hover:text-[#c9a84c] text-sm transition-colors">Time Off</Link>
            <Link href="/coach/checkin" className="text-gray-300 hover:text-[#c9a84c] text-sm transition-colors font-semibold">Check-in</Link>
            <SignOutButton />
          </div>
        </div>
      </nav>
      <main className="max-w-7xl mx-auto px-6 py-8">
        {children}
      </main>
    </div>
  )
}
