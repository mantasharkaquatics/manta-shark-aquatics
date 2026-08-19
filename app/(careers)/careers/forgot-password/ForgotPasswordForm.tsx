'use client'

import { useState } from 'react'
import PasswordInput from '../apply/PasswordInput'
import Link from 'next/link'
import { PAGE, CARD, H1, SUB, LABEL, INPUT, FIELD, BUTTON, BUTTON_DISABLED, ERROR, LINK, FOOT } from '../apply/ui'

export default function ForgotPasswordForm() {
  const [stage, setStage] = useState<'request' | 'reset' | 'done'>('request')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function requestCode() {
    setError('')
    if (!email.trim()) {
      setError('Enter the email you signed up with.')
      return
    }
    setBusy(true)
    try {
      const res = await fetch('/api/careers/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Something went wrong. Please try again.')
        return
      }
      setStage('reset')
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  async function submitReset() {
    setError('')
    if (password !== confirm) {
      setError('The two passwords do not match.')
      return
    }
    setBusy(true)
    try {
      const res = await fetch('/api/careers/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code, password }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Something went wrong. Please try again.')
        return
      }
      setStage('done')
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={PAGE}>
      <div style={CARD}>
        <h1 style={H1}>Reset your password</h1>

        {stage === 'done' ? (
          <>
            <p style={SUB}>
              Your password has been updated. You have been signed out on every device, so sign
              in again with your new password.
            </p>
            <Link href="/careers/login" style={{ ...BUTTON, display: 'block', textAlign: 'center', textDecoration: 'none' }}>
              Go to sign in
            </Link>
          </>
        ) : stage === 'request' ? (
          <>
            <p style={SUB}>
              Enter the email address you used to create your account. If we have an account for it,
              we will send you a code.
            </p>
            <div style={FIELD}>
              <label style={LABEL} htmlFor="email">Email</label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                style={INPUT}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            {error ? <p style={ERROR}>{error}</p> : null}
            <button
              type="button"
              style={busy ? BUTTON_DISABLED : BUTTON}
              disabled={busy}
              onClick={requestCode}
            >
              {busy ? 'Sending...' : 'Send code'}
            </button>
          </>
        ) : (
          <>
            <p style={SUB}>
              If an account exists for {email}, a code is on its way. Enter it below along with your
              new password. The code expires in 10 minutes.
            </p>
            <div style={FIELD}>
              <label style={LABEL} htmlFor="code">Code</label>
              <input
                id="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                style={INPUT}
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
            </div>
            <div style={FIELD}>
              <label style={LABEL} htmlFor="password">New password</label>
              <PasswordInput id="password" value={password} autoComplete="new-password" onChange={setPassword} />
            </div>
            <div style={FIELD}>
              <label style={LABEL} htmlFor="confirm">Confirm new password</label>
              <PasswordInput id="confirm" value={confirm} autoComplete="new-password" onChange={setConfirm} />
            </div>
            {error ? <p style={ERROR}>{error}</p> : null}
            <button
              type="button"
              style={busy ? BUTTON_DISABLED : BUTTON}
              disabled={busy}
              onClick={submitReset}
            >
              {busy ? 'Saving...' : 'Set new password'}
            </button>
            <p style={FOOT}>
              Did not get it?{' '}
              <button
                type="button"
                style={{ ...LINK, background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
                onClick={() => { setStage('request'); setError('') }}
              >
                Try a different email
              </button>
            </p>
          </>
        )}

        <p style={FOOT}>
          <Link href="/careers/login" style={LINK}>Back to sign in</Link>
        </p>
      </div>
    </div>
  )
}
