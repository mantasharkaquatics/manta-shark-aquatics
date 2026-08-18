'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  PAGE, CARD, H1, SUB, LABEL, INPUT, FIELD,
  BUTTON, BUTTON_DISABLED, ERROR, LINK, FOOT,
} from '../apply/ui'

export default function LoginForm() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit() {
    setError('')
    setBusy(true)
    try {
      const res = await fetch('/api/careers/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error || 'Could not sign you in. Please try again.')
        setBusy(false)
        return
      }

      const meRes = await fetch('/api/careers/me')
      const me = await meRes.json().catch(() => ({}))
      router.push(me.fullyVerified ? '/careers/apply' : '/careers/verify')
    } catch {
      setError('Could not reach the server. Please check your connection.')
      setBusy(false)
    }
  }

  const ready = email.trim() !== '' && password !== ''

  return (
    <main style={PAGE}>
      <div style={CARD}>
        <h1 style={H1}>Sign in</h1>
        <p style={SUB}>Continue your application with Manta Shark Aquatics.</p>

        {error ? <div style={ERROR}>{error}</div> : null}

        <div style={FIELD}>
          <label style={LABEL} htmlFor="email">Email address</label>
          <input id="email" type="email" style={INPUT} value={email}
            autoComplete="email" inputMode="email"
            onChange={(e) => setEmail(e.target.value)} />
        </div>

        <div style={FIELD}>
          <label style={LABEL} htmlFor="password">Password</label>
          <input id="password" type="password" style={INPUT} value={password}
            autoComplete="current-password"
            onChange={(e) => setPassword(e.target.value)} />
        </div>

        <button
          style={busy || !ready ? BUTTON_DISABLED : BUTTON}
          disabled={busy || !ready}
          onClick={submit}
        >
          {busy ? 'Signing in…' : 'Sign in'}
        </button>

        <p style={FOOT}>
          New here? <Link href="/careers/register" style={LINK}>Create an account</Link>
        </p>
      </div>
    </main>
  )
}
