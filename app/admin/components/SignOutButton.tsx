'use client'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

/* `to` is where the page goes afterwards. The coach portal passes /coach-login
   so the next coach on a shared pool iPad lands on the PIN boxes, not the
   home page. */
export default function SignOutButton({ label, to = '/' }: { label?: string; to?: string } = {}) {
  const supabase = createClient()
  const router = useRouter()

  async function handleSignOut() {
    // This device only (found 2026-10-08): the default 'global' scope made a
    // sign-out on the desk iPad also sign the same account out on the
    // owner's phone. The inactive-coach sign-out on /coach-login stays global.
    await supabase.auth.signOut({ scope: 'local' })
    router.push(to)
  }

  return (
    <button onClick={handleSignOut} className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-gray-400 hover:text-white hover:bg-[#16244a] transition-all">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
        <path d="m16 17 5-5-5-5M21 12H9" />
      </svg>
      <span>{label ?? 'Sign Out'}</span>
    </button>
  )
}
