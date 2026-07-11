'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'

export default function CoachLoginPage() {
  const [pin, setPin] = useState(['', '', '', '', '', '', '', ''])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const inputs = useRef<(HTMLInputElement | null)[]>([])
  const router = useRouter()

  async function submitPin(digits: string[]) {
    const code = digits.join('')
    if (code.length !== 8) return
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/coach/pin-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: code })
      })
      const data = await res.json()
      if (!res.ok) {
        setError('Incorrect PIN. Please try again.')
        setPin(['', '', '', '', '', '', '', ''])
        inputs.current[0]?.focus()
        return
      }

      const supabase = createClient()
      const { error: sessionError } = await supabase.auth.verifyOtp({
        token_hash: data.token_hash,
        type: 'email',
      })

      if (sessionError) {
        setError('Login failed. Please try again.')
        setPin(['', '', '', '', '', '', '', ''])
        inputs.current[0]?.focus()
        return
      }

      router.push('/coach')
    } catch {
      setError('Connection error. Please try again.')
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
    <div className="min-h-screen bg-[#0d1529] flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-10">
          <Image src="/logo.png" alt="Manta Shark" width={72} height={72} className="mb-4" />
          <p className="text-[#c9a84c] text-xs font-semibold uppercase tracking-widest mb-1">Coach Portal</p>
          <h1 className="text-white text-2xl font-bold">Coach Login</h1>
          <p className="text-gray-400 text-sm mt-1">Enter your 8-digit PIN</p>
        </div>

        <div className="flex gap-2 justify-center mb-6">
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
              className="w-10 h-12 text-center text-xl font-bold bg-[#111d38] border border-[#1e3a6e] rounded-lg text-white focus:outline-none focus:border-[#c9a84c] transition-colors"
            />
          ))}
        </div>

        {error && <p className="text-red-400 text-sm text-center mb-4">{error}</p>}
        {loading && <p className="text-gray-400 text-sm text-center">Verifying...</p>}

        <div className="mt-8 text-center">
          <a href="/login" className="text-gray-500 text-xs hover:text-gray-300 transition-colors">
            Sign in with Email
          </a>
        </div>
      </div>
    </div>
  )
}
