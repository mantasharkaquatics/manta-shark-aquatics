'use client'
import { useT } from '@/lib/i18n/provider'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'
import { safeNext } from '@/lib/safe-next'

/** The coach page a signed-out coach was heading for (the proxy adds ?next=),
 *  or the portal home. Only portal paths: this page signs in coaches. */
function coachNext(): string {
  const next = safeNext()
  return next && (next === '/coach' || next.startsWith('/coach/') || next.startsWith('/coach?')) ? next : '/coach'
}

type PinAnswer = { code?: string; locked?: boolean; attempts_left?: number; retry_after_seconds?: number } | null

export default function CoachLoginPage() {
  const t = useT()
  const [pin, setPin] = useState(['', '', '', '', '', '', '', ''])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  // Locked out. Kept separate from `error` because the boxes have to stop
  // accepting digits -- clearing and refocusing them, as a wrong PIN does,
  // invites the coach to keep typing into something that cannot succeed.
  const [locked, setLocked] = useState(false)
  const inputs = useRef<(HTMLInputElement | null)[]>([])
  const router = useRouter()

  /* ?inactive=1: the portal found this signed-in coach marked inactive. It
     used to send them to the parent dashboard, which sent them back to the
     portal, forever. Sign them out here so the next coach on a shared iPad can
     use the PIN boxes, and say why. */
  const [inactive, setInactive] = useState(false)
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('inactive') !== '1') return
    setInactive(true)
    createClient().auth.signOut().catch(() => {})
  }, [])

  /* The route answers with a code and numbers; the words are built here, in
     the page's own language. It used to print the server's English sentence,
     so a coach on the Chinese page read "Incorrect PIN. 4 attempts left."
     (found 2026-10-05). */
  function waitText(seconds: number): string {
    const minutes = Math.max(1, Math.ceil(seconds / 60))
    if (minutes <= 60) return minutes === 1 ? t('coach.login.time.minute') : t('coach.login.time.minutes', { n: minutes })
    const hours = Math.ceil(minutes / 60)
    return hours === 1 ? t('coach.login.time.hour') : t('coach.login.time.hours', { n: hours })
  }

  function pinError(data: PinAnswer): string {
    const left = Number(data?.attempts_left)
    if (data?.locked) {
      return t('coach.login.locked', { time: waitText(Number(data?.retry_after_seconds) || 15 * 60) })
    }
    if (data?.code === 'bad_pin' && Number.isFinite(left) && left > 0) {
      return left === 1 ? t('coach.login.attemptLeft') : t('coach.login.attemptsLeft', { n: left })
    }
    if (data?.code === 'login_failed') return t('coach.login.failed')
    return t('coach.login.badPin')
  }

  async function submitPin(digits: string[]) {
    const code = digits.join('')
    if (code.length !== 8 || locked) return
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/coach/pin-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: code })
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        // The server knows how many tries are left and how long a lock lasts;
        // a hard-coded "please try again" here would have thrown that away and
        // left a locked-out coach retyping the right PIN to no effect.
        setError(pinError(data))
        setPin(['', '', '', '', '', '', '', ''])
        if (data?.locked) { setLocked(true); return }
        inputs.current[0]?.focus()
        return
      }

      const supabase = createClient()
      const { error: sessionError } = await supabase.auth.verifyOtp({
        token_hash: data.token_hash,
        type: 'email',
      })

      if (sessionError) {
        setError(t('coach.login.failed'))
        setPin(['', '', '', '', '', '', '', ''])
        inputs.current[0]?.focus()
        return
      }

      router.push(coachNext())
    } catch {
      setError(t('coach.login.network'))
    } finally {
      setLoading(false)
    }
  }

  function handleKey(i: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace') {
      if (pin[i]) {
        const next = [...pin]; next[i] = ''; setPin(next)
      } else if (i > 0) {
        const next = [...pin]; next[i - 1] = ''; setPin(next)
        inputs.current[i - 1]?.focus()
      }
    }
  }

  function handleChange(i: number, val: string) {
    if (!/^[0-9]?$/.test(val)) return
    const next = [...pin]; next[i] = val; setPin(next)
    if (val && i < 7) {
      inputs.current[i + 1]?.focus()
    }
    if (val && i === 7) {
      const full = [...pin]; full[7] = val
      submitPin(full)
    }
  }

  return (
    <div className="min-h-screen bg-[#0d1529] flex flex-col items-center justify-center px-4 sm:px-6">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-10">
          <Image src="/logo.png" alt="Manta Shark" width={72} height={72} className="mb-4" />
          <p className="text-[#c9a84c] text-xs font-semibold uppercase tracking-widest mb-1">{t('coach.portal')}</p>
          <h1 className="text-white text-2xl font-bold">{t('coach.login.title')}</h1>
          <p className="text-gray-400 text-sm mt-1">{t('coach.login.prompt')}</p>
        </div>

        {/* Eight fixed 40px boxes plus seven 8px gaps is 376px, which does not fit a
            360px phone -- the last digit sat off-screen. They share the row instead
            now and cap at the old 40px, so the desktop layout is unchanged. */}
        <div className="flex gap-1.5 sm:gap-2 justify-center mb-6">
          {pin.map((digit, i) => (
            <input
              key={i}
              ref={el => { inputs.current[i] = el }}
              type="password"
              inputMode="numeric"
              maxLength={1}
              value={digit}
              onChange={e => handleChange(i, e.target.value)}
              onKeyDown={e => handleKey(i, e)}
              autoFocus={i === 0}
              disabled={locked}
              className="flex-1 min-w-0 max-w-10 h-12 text-center text-xl font-bold bg-[#111d38] border border-[#1e3a6e] rounded-lg text-white focus:outline-none focus:border-[#c9a84c] transition-colors disabled:opacity-40"
            />
          ))}
        </div>

        {inactive && !error && <p className="text-amber-300 text-sm text-center mb-4">{t('coach.login.inactive')}</p>}
        {error && <p className="text-red-400 text-sm text-center mb-4">{error}</p>}
        {loading && <p className="text-gray-400 text-sm text-center">{t('coach.login.verifying')}</p>}
        {/* No "Sign in with Email" here any more (owner, 2026-10-08): coach
            accounts have no password, so that page was a dead end. A coach
            locked out of PIN sign-in asks the front desk, who can unlock it
            from Admin > Coaches. */}
      </div>
    </div>
  )
}
