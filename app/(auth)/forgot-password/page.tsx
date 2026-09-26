'use client'
import { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useT } from '@/lib/i18n/provider'

// Step one of "forgot password": the parent gives their email and we send a
// link. The page says the same thing whether or not the address has an
// account, so it cannot be used to find out who our customers are.
export default function ForgotPasswordPage() {
  const t = useT()
  const [email, setEmail] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  async function submit() {
    const e = email.trim()
    if (!e || !e.includes('@')) { setError(t('forgot.err.email')); return }
    setSending(true)
    setError('')
    try {
      const r = await fetch('/api/auth/forgot-password', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: e }),
      })
      if (!r.ok) { setError(t('forgot.err.send')); return }
      setSent(true)
    } catch {
      setError(t('forgot.err.send'))
    } finally {
      setSending(false)
    }
  }

  const field = "w-full bg-white border border-[#d5e0ef] rounded-lg px-4 py-3 text-[#16294a] placeholder-gray-400 focus:outline-none focus:border-[#2050a0] focus:ring-2 focus:ring-[#2050a0]/15 transition-colors"

  return (
    <div className="auth-shell auth-bg min-h-dvh flex items-center justify-center px-4 py-10">
      <div className="auth-card bg-white rounded-2xl p-7 sm:p-8 w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/" className="inline-block">
            <Image src="/logo.png" alt="Manta Shark Aquatics" width={120} height={120} className="mx-auto mb-2 object-contain" priority />
          </Link>
          <h1 className="text-2xl font-bold text-[#12254a] auth-title">{t('forgot.title')}</h1>
          <p className="text-[#56647d] mt-2 text-sm">{sent ? t('forgot.sentSub') : t('forgot.subtitle')}</p>
        </div>

        {sent ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-[#b7e0cc] bg-[#e6f4ee] px-4 py-3 text-sm text-[#1f7a57] leading-relaxed">
              {t('forgot.sent', { email: email.trim() })}
            </div>
            <p className="text-sm text-[#56647d] leading-relaxed">{t('forgot.sentHelp')}</p>
            <button onClick={() => { setSent(false) }}
              className="w-full bg-white border border-[#d5e0ef] hover:border-[#b7c7de] text-[#16294a] font-bold py-3 rounded-lg text-sm transition">
              {t('forgot.tryAgain')}
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label htmlFor="fp-email" className="block text-sm font-medium text-[#16294a] mb-1.5">{t('login.email')}</label>
              <input id="fp-email" type="email" value={email} onChange={e => setEmail(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') submit() }}
                autoComplete="email" inputMode="email" className={field} placeholder="you@example.com" />
            </div>
            {error && <p className="text-red-600 text-sm">{error}</p>}
            <button onClick={submit} disabled={sending}
              className="w-full bg-[#f09800] hover:bg-[#d98900] text-[#12254a] font-bold py-3 rounded-lg text-sm transition disabled:opacity-50">
              {sending ? t('forgot.sending') : t('forgot.send')}
            </button>
          </div>
        )}

        <p className="text-center text-sm text-[#56647d] mt-6">
          <Link href="/login" className="text-[#2050a0] hover:underline font-bold">← {t('forgot.backToLogin')}</Link>
        </p>
      </div>
    </div>
  )
}
