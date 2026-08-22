'use client'
import { useState } from 'react'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useT } from '@/lib/i18n/provider'
import { errorKey } from '@/lib/i18n/errors'

// There is no Navbar over the (auth) pages, so this card is the whole of the
// brand a parent sees while signing in -- hence the logo. It used to be the
// Tailwind defaults it was scaffolded with: grey page, white card, blue button.
// Arriving here from the navy site felt like being handed off to someone else.
export default function LoginPage() {
  const t = useT()
  const tErr = (raw?: string | null): string => {
    const k = errorKey(raw)
    return k ? t(k) : (raw || t('login.err.failed'))
  }
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  const handleLogin = async () => {
    setLoading(true)
    setError('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setError(tErr(error.message))
      setLoading(false)
    } else {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setError(t('login.err.failed')); setLoading(false); return }
      if (user) {
        const { data: admin } = await supabase.from('admins').select('id').eq('auth_user_id', user.id).single()
        if (admin) { router.push('/admin'); return }
        const { data: coach } = await supabase.from('coaches').select('id').eq('auth_user_id', user.id).single()
        if (coach) { router.push('/coach'); return }
        await supabase.from('parents').update({ last_login_at: new Date().toISOString() }).eq('auth_user_id', user.id)
        router.push('/dashboard')
      }
    }
  }

  const field = "w-full bg-[#0d1529] border border-[#1e3a6e] rounded-lg px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-[#c9a84c] transition-colors"

  return (
    <div className="auth-shell min-h-dvh bg-[#0d1529] flex items-center justify-center px-4 py-10">
      <div className="bg-[#111d38] rounded-2xl border border-[#1e3a6e] p-7 sm:p-8 w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/" className="inline-block">
            <Image src="/logo.png" alt="Manta Shark Aquatics" width={64} height={64} className="mx-auto mb-3 rounded-full object-cover" />
          </Link>
          <h1 className="text-2xl font-bold text-white font-['Playfair_Display']">Manta Shark Aquatics</h1>
          <p className="text-gray-400 mt-2 text-sm">{t('login.subtitle')}</p>
        </div>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">{t('login.email')}</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)}
              autoComplete="email" inputMode="email"
              className={field}
              placeholder="you@example.com" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">{t('login.password')}</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleLogin()}
              autoComplete="current-password"
              className={field}
              placeholder="••••••••" />
          </div>
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <button onClick={handleLogin} disabled={loading}
            className="w-full bg-[#c9a84c] hover:opacity-90 text-[#111d38] font-bold py-3 rounded-lg text-sm transition disabled:opacity-50">
            {loading ? t('login.signingIn') : t('login.signIn')}
          </button>
        </div>
        <p className="text-center text-sm text-gray-400 mt-6">
          {t('login.noAccount')}{' '}
          <Link href="/register" className="text-[#c9a84c] hover:underline font-medium">{t('login.signUp')}</Link>
        </p>
      </div>
    </div>
  )
}
