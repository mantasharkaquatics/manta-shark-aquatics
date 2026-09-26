'use client'
import { Suspense, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useT } from '@/lib/i18n/provider'
import { errorKey } from '@/lib/i18n/errors'
import PasswordField from '@/components/ui/PasswordField'

/* Step two of "forgot password": the page the emailed link opens.

   The token in the link is only spent when the parent presses Save -- not when
   the page loads -- so a mail scanner that opens links to check them, or a
   parent who opens the email twice, does not use it up before they get here.
   Once it has been spent the browser holds a signed-in session, so if the new
   password is then refused (too short, say) they can fix it and save again
   without needing a new link. */
function ResetForm() {
  const t = useT()
  const router = useRouter()
  const supabase = createClient()
  const tokenHash = useSearchParams().get('token_hash') || ''
  const [password, setPassword] = useState('')
  const [password2, setPassword2] = useState('')
  const [verified, setVerified] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [expired, setExpired] = useState(!tokenHash)
  const [done, setDone] = useState(false)

  async function save() {
    setError('')
    if (!password || !password2) { setError(t('reset.err.empty')); return }
    if (password !== password2) { setError(t('register.err.passwordMismatch')); return }
    setSaving(true)
    if (!verified) {
      const { error: vErr } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'recovery' })
      if (vErr) { setExpired(true); setSaving(false); return }
      setVerified(true)
    }
    const { error: uErr } = await supabase.auth.updateUser({ password })
    if (uErr) {
      const k = errorKey(uErr.message)
      setError(k ? t(k) : uErr.message)
      setSaving(false)
      return
    }
    setDone(true)
    // Where they land matches signing in: staff to their portal, families home.
    const { data: { user } } = await supabase.auth.getUser()
    let dest = '/dashboard'
    if (user) {
      const { data: admin } = await supabase.from('admins').select('id').eq('auth_user_id', user.id).maybeSingle()
      if (admin) dest = '/admin'
    }
    setTimeout(() => router.push(dest), 1500)
  }

  const field = "w-full bg-white border border-[#d5e0ef] rounded-lg px-4 py-3 text-[#16294a] placeholder-gray-400 focus:outline-none focus:border-[#2050a0] focus:ring-2 focus:ring-[#2050a0]/15 transition-colors"

  return (
    <div className="auth-shell auth-bg min-h-dvh flex items-center justify-center px-4 py-10">
      <div className="auth-card bg-white rounded-2xl p-7 sm:p-8 w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/" className="inline-block">
            <Image src="/logo.png" alt="Manta Shark Aquatics" width={120} height={120} className="mx-auto mb-2 object-contain" priority />
          </Link>
          <h1 className="text-2xl font-bold text-[#12254a] auth-title">{t('reset.title')}</h1>
          <p className="text-[#56647d] mt-2 text-sm">{expired ? t('reset.expiredSub') : done ? t('reset.doneSub') : t('reset.subtitle')}</p>
        </div>

        {expired ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-[#f5c2bd] bg-[#fdecea] px-4 py-3 text-sm text-[#b3261e] leading-relaxed">{t('reset.expired')}</div>
            <Link href="/forgot-password"
              className="block text-center w-full bg-[#f09800] hover:bg-[#d98900] text-[#12254a] font-bold py-3 rounded-lg text-sm transition">
              {t('reset.newLink')}
            </Link>
          </div>
        ) : done ? (
          <div className="rounded-lg border border-[#b7e0cc] bg-[#e6f4ee] px-4 py-3 text-sm text-[#1f7a57] font-semibold text-center">
            ✓ {t('reset.done')}
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-[#16294a] mb-1.5">{t('reset.newPassword')}</label>
              <PasswordField value={password} onChange={setPassword} autoComplete="new-password" className={field} />
            </div>
            <div>
              <label className="block text-sm font-medium text-[#16294a] mb-1.5">{t('register.passwordConfirm')}</label>
              <PasswordField value={password2} onChange={setPassword2} onEnter={save} autoComplete="new-password"
                className={field + (password2 && password2 !== password ? ' !border-red-500' : '')} />
              {password2 && (password2 === password
                ? <p className="text-green-700 text-xs mt-1.5">✓ {t('register.passwordMatch')}</p>
                : <p className="text-red-600 text-xs mt-1.5">{t('register.err.passwordMismatch')}</p>)}
            </div>
            {error && <p className="text-red-600 text-sm">{error}</p>}
            <button onClick={save} disabled={saving}
              className="w-full bg-[#f09800] hover:bg-[#d98900] text-[#12254a] font-bold py-3 rounded-lg text-sm transition disabled:opacity-50">
              {saving ? t('reset.saving') : t('reset.save')}
            </button>
          </div>
        )}

        {!done && (
          <p className="text-center text-sm text-[#56647d] mt-6">
            <Link href="/login" className="text-[#2050a0] hover:underline font-bold">← {t('forgot.backToLogin')}</Link>
          </p>
        )}
      </div>
    </div>
  )
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="auth-shell auth-bg min-h-dvh" />}>
      <ResetForm />
    </Suspense>
  )
}
