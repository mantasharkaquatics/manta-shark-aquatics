'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  PAGE, CARD, H1, SUB, LABEL, INPUT, FIELD,
  BUTTON, BUTTON_DISABLED, ERROR, LINK, FOOT,
} from '../apply/ui'

export default function RegisterForm() {
  const router = useRouter()
  const loadedAt = useRef<number>(Date.now())
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [website, setWebsite] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    loadedAt.current = Date.now()
  }, [])

  async function submit() {
    setError('')
    setBusy(true)
    try {
      const res = await fetch('/api/careers/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName, lastName, email, phone, password, website,
          formLoadedAt: loadedAt.current,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error || 'Something went wrong. Please try again.')
        setBusy(false)
        return
      }
      router.push('/careers/verify')
    } catch {
      setError('Could not reach the server. Please check your connection.')
      setBusy(false)
    }
  }

  const ready =
    firstName.trim() !== '' && lastName.trim() !== '' &&
    email.trim() !== '' && phone.trim() !== '' && password !== ''

  return (
    <main style={PAGE}>
      <div style={CARD}>
        <h1 style={H1}>Create your account</h1>
        <p style={SUB}>
          You will verify your email and phone number next, then fill out your application.
        </p>

        {error ? <div style={ERROR}>{error}</div> : null}

        <div style={{ display: 'flex', gap: '12px' }}>
          <div style={{ ...FIELD, flex: 1 }}>
            <label style={LABEL} htmlFor="firstName">Legal first name</label>
            <input id="firstName" style={INPUT} value={firstName}
              autoComplete="given-name"
              onChange={(e) => setFirstName(e.target.value)} />
          </div>
          <div style={{ ...FIELD, flex: 1 }}>
            <label style={LABEL} htmlFor="lastName">Legal last name</label>
            <input id="lastName" style={INPUT} value={lastName}
              autoComplete="family-name"
              onChange={(e) => setLastName(e.target.value)} />
          </div>
        </div>

        <div style={FIELD}>
          <label style={LABEL} htmlFor="email">Email address</label>
          <input id="email" type="email" style={INPUT} value={email}
            autoComplete="email" inputMode="email"
            onChange={(e) => setEmail(e.target.value)} />
        </div>

        <div style={FIELD}>
          <label style={LABEL} htmlFor="phone">Mobile phone</label>
          <input id="phone" type="tel" style={INPUT} value={phone}
            autoComplete="tel" inputMode="tel" placeholder="(555) 123-4567"
            onChange={(e) => setPhone(e.target.value)} />
        </div>

        <div style={FIELD}>
          <label style={LABEL} htmlFor="password">Password</label>
          <input id="password" type="password" style={INPUT} value={password}
            autoComplete="new-password"
            onChange={(e) => setPassword(e.target.value)} />
          <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.55)', margin: '6px 0 0' }}>
            At least 8 characters.
          </p>
        </div>

        <div style={{ position: 'absolute', left: '-9999px' }} aria-hidden="true">
          <label htmlFor="website">Website</label>
          <input id="website" tabIndex={-1} autoComplete="off" value={website}
            onChange={(e) => setWebsite(e.target.value)} />
        </div>

        <button
          style={busy || !ready ? BUTTON_DISABLED : BUTTON}
          disabled={busy || !ready}
          onClick={submit}
        >
          {busy ? 'Creating account…' : 'Create account'}
        </button>

        <p style={FOOT}>
          Already have an account? <Link href="/careers/login" style={LINK}>Sign in</Link>
        </p>
      </div>
    </main>
  )
}
