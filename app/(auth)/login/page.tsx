'use client'
import { useState } from 'react'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { safeNext } from '@/lib/safe-next'
import { useT } from '@/lib/i18n/provider'
import { errorKey } from '@/lib/i18n/errors'
import PasswordField from '@/components/ui/PasswordField'

// There is no Navbar over the (auth) pages, so this card is the whole of the
// brand a parent sees while signing in -- hence the logo. Palette B (2026-09):
// the page is the site's dark top (navy gradient, see .auth-bg in
// globals.css) and the form is a white card on it, amber for the one button.
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
        const { data: coach } = await supabase.from('coaches').select('id').eq('auth_user_id', user.id).eq('is_active', true).single()
        if (coach) { router.push('/coach'); return }
        await supabase.from('parents').update({ last_login_at: new Date().toISOString() }).eq('auth_user_id', user.id)
        router.push(safeNext() || '/dashboard')
      }
    }
  }

  const field = "w-full bg-white border border-[#d5e0ef] rounded-lg px-4 py-3 text-[#16294a] placeholder-gray-400 focus:outline-none focus:border-[#2050a0] focus:ring-2 focus:ring-[#2050a0]/15 transition-colors"

  return (
    <div className="auth-shell auth-bg min-h-dvh flex items-center justify-center px-4 py-10">
      <div className="auth-card bg-white rounded-2xl p-7 sm:p-8 w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/" className="inline-block">
            {/* The logo is the name (owner, 2026-09-28: the page already said
                "Manta Shark" in the bar, the logo and a heading). logo.png is a
                square with the artwork across its middle, so a wide, short box
                with object-cover trims the empty top and bottom: the artwork
                shows almost twice as large in slightly less height. */}
            <Image src="/logo.png" alt="Manta Shark Aquatics" width={204} height={106} className="mx-auto object-cover" style={{ width: 204, height: 106 }} priority />
          </Link>
          <h1 className="text-[#56647d] mt-2 text-base">{t('login.subtitle')}</h1>
        </div>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-[#16294a] mb-1.5">{t('login.email')}</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)}
              autoComplete="email" inputMode="email"
              className={field}
              placeholder="you@example.com" />
          </div>
          <div>
            <div className="flex items-baseline justify-between gap-3 mb-1.5">
              <label className="block text-sm font-medium text-[#16294a]">{t('login.password')}</label>
              <Link href="/forgot-password" className="text-sm text-[#2050a0] hover:underline font-semibold">{t('login.forgot')}</Link>
            </div>
            <PasswordField value={password} onChange={setPassword} onEnter={handleLogin}
              autoComplete="current-password" className={field} placeholder="••••••••" />
          </div>
          {error && <p className="text-red-600 text-sm">{error}</p>}
          <button onClick={handleLogin} disabled={loading}
            className="w-full bg-[#f09800] hover:bg-[#d98900] text-[#12254a] font-bold py-3 rounded-lg text-sm transition disabled:opacity-50">
            {loading ? t('login.signingIn') : t('login.signIn')}
          </button>
        </div>
        <p className="text-center text-sm text-[#56647d] mt-6">
          {t('login.noAccount')}{' '}
          <Link href="/register" className="text-[#2050a0] hover:underline font-bold">{t('login.signUp')}</Link>
        </p>
      </div>
    </div>
  )
}
