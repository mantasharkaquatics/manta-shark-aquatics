'use client'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export default function SignOutButton() {
  const supabase = createClient()
  const router = useRouter()

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/')
  }

  return (
    <button onClick={handleSignOut} className="text-gray-400 hover:text-white text-sm transition-colors">
      Sign Out
    </button>
  )
}
