'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  PAGE, CARD, H1, SUB, LABEL, INPUT, FIELD,
  BUTTON, BUTTON_DISABLED, ERROR, LINK, FOOT, GOLD,
} from '../apply/ui'

type Me = {
  signedIn: boolean
  firstName?: string
  emailMasked?: string
  phoneMasked?: string
  emailVerified?: boolean
  phoneVerified?: boolean
  fullyVerified?: boolean
}

type Channel = 'email' | 'phone'

function Panel(props: {
  channel: Channel
  target: string
  verified: boolean
  onVerified: () => void
}) {
  const { channel, target, verified, onVerified } = props
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [cooldown, setCooldown] = useState(0)
  const [sentOnce, setSentOnce] = useState(false)

  const label = channel === 'email' ? 'Email' : 'Phone'

  const send = useCallback(async () => {
    setError('')
    setNotice('')
    setBusy(true)
    try {
      const res = await fetch('/api/careers/send-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error || 'Could not send the code.')
        if (typeof data.retryAfter === 'number') setCooldown(data.retryAfter)
      } else {
        setSentOnce(true)
        setNotice(`Code sent to ${target}.`)
        setCooldown(60)
      }
    } catch {
      setError('Could not reach the server.')
    }
    setBusy(false)
  }, [channel, target])

  useEffect(() => {
    if (cooldown <= 0) return
    const t = setTimeout(() => setCooldown((n) => n - 1), 1000)
    return () => clearTimeout(t)
  }, [cooldown])

  async function check() {
    setError('')
    setNotice('')
    setBusy(true)
    try {
      const res = await fetch('/api/careers/verify-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel, code }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error || 'Could not verify that code.')
      } else {
        onVerified()
      }
    } catch {
      setError('Could not reach the server.')
    }
    setBusy(false)
  }

  if (verified) {
    return (
      <div style={{ ...FIELD, display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span style={{ color: GOLD, fontWeight: 700 }}>✓</span>
        <span style={{ fontSize: '15px' }}>{label} verified</span>
      </div>
    )
  }

  return (
    <div style={{ margin: '0 0 24px', paddingBottom: '20px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
      <label style={LABEL}>{label} — {target}</label>

      {error ? <div style={ERROR}>{error}</div> : null}
      {notice ? (
        <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.6)', margin: '0 0 10px' }}>{notice}</p>
      ) : null}

      {!sentOnce ? (
        <button
          style={busy || cooldown > 0 ? BUTTON_DISABLED : BUTTON}
          disabled={busy || cooldown > 0}
          onClick={send}
        >
          {busy ? 'Sending…' : cooldown > 0 ? `Wait ${cooldown}s` : `Send code to my ${channel}`}
        </button>
      ) : (
        <>
          <input
            style={{ ...INPUT, letterSpacing: '6px', textAlign: 'center', margin: '0 0 10px' }}
            value={code}
            inputMode="numeric"
            maxLength={6}
            autoComplete="one-time-code"
            placeholder="000000"
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
          />
          <button
            style={busy || code.length !== 6 ? BUTTON_DISABLED : BUTTON}
            disabled={busy || code.length !== 6}
            onClick={check}
          >
            {busy ? 'Checking…' : `Verify ${label.toLowerCase()}`}
          </button>
          <p style={{ fontSize: '13px', textAlign: 'center', margin: '10px 0 0' }}>
            {cooldown > 0 ? (
              <span style={{ color: 'rgba(255,255,255,0.45)' }}>Resend in {cooldown}s</span>
            ) : (
              <a style={{ ...LINK, cursor: 'pointer' }} onClick={send}>Resend code</a>
            )}
          </p>
        </>
      )}
    </div>
  )
}

export default function VerifyForm() {
  const router = useRouter()
  const [me, setMe] = useState<Me | null>(null)
  const [emailDone, setEmailDone] = useState(false)
  const [phoneDone, setPhoneDone] = useState(false)

  useEffect(() => {
    fetch('/api/careers/me')
      .then((r) => r.json())
      .then((data: Me) => {
        setMe(data)
        setEmailDone(Boolean(data.emailVerified))
        setPhoneDone(Boolean(data.phoneVerified))
      })
      .catch(() => setMe({ signedIn: false }))
  }, [])

  useEffect(() => {
    if (emailDone && phoneDone) {
      const t = setTimeout(() => router.push('/careers/apply'), 900)
      return () => clearTimeout(t)
    }
  }, [emailDone, phoneDone, router])

  if (me === null) {
    return (
      <main style={PAGE}>
        <div style={CARD}>
          <p style={SUB}>Loading…</p>
        </div>
      </main>
    )
  }

  if (!me.signedIn) {
    return (
      <main style={PAGE}>
        <div style={CARD}>
          <h1 style={H1}>Please sign in</h1>
          <p style={SUB}>Your session has expired.</p>
          <p style={FOOT}>
            <a href="/careers/login" style={LINK}>Sign in</a>
          </p>
        </div>
      </main>
    )
  }

  const allDone = emailDone && phoneDone

  return (
    <main style={PAGE}>
      <div style={CARD}>
        <h1 style={H1}>Verify your details</h1>
        <p style={SUB}>
          {allDone
            ? 'Both verified. Taking you to your application…'
            : 'We need to confirm both your email and your phone number before you continue.'}
        </p>

        <Panel
          channel="email"
          target={me.emailMasked || ''}
          verified={emailDone}
          onVerified={() => setEmailDone(true)}
        />
        <Panel
          channel="phone"
          target={me.phoneMasked || ''}
          verified={phoneDone}
          onVerified={() => setPhoneDone(true)}
        />
      </div>
    </main>
  )
}
