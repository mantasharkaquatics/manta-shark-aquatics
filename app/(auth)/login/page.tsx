'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useT } from '@/lib/i18n/provider'
import { errorKey } from '@/lib/i18n/errors'
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
return (
<div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
<div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 w-full max-w-md">
<div className="text-center mb-8">
<h1 className="text-2xl font-bold text-gray-900">Manta Shark Aquatics</h1>
<p className="text-gray-500 mt-2">{t('login.subtitle')}</p>
</div>
<div className="space-y-4">
<div>
<label className="block text-sm font-medium text-gray-700 mb-1">{t('login.email')}</label>
<input type="email" value={email} onChange={e => setEmail(e.target.value)}
className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
placeholder="you@example.com" />
</div>
<div>
<label className="block text-sm font-medium text-gray-700 mb-1">{t('login.password')}</label>
<input type="password" value={password} onChange={e => setPassword(e.target.value)}
onKeyDown={e => e.key === 'Enter' && handleLogin()}
className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
placeholder="••••••••" />
</div>
{error && <p className="text-red-500 text-sm">{error}</p>}
<button onClick={handleLogin} disabled={loading}
className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 rounded-lg text-sm transition disabled:opacity-50">
{loading ? t('login.signingIn') : t('login.signIn')}
</button>
</div>
<p className="text-center text-sm text-gray-500 mt-6">
          {t('login.noAccount')}
<Link href="/register" className="text-blue-600 hover:underline font-medium">{t('login.signUp')}</Link>
</p>
</div>
</div>
  )
}
