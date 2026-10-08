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
  /** No legal name on file: cleared when the email's owner reclaimed the account. */
  needsName?: boolean
  hasPhone?: boolean
}

type Channel = 'email' | 'phone'

/** LINK's look on a real <button>, so it can be reached with Tab and pressed
 *  with Enter (an <a> with no href cannot). */
const LINK_BUTTON = {
  ...LINK,
  background: 'none',
  border: 'none',
  padding: 0,
  font: 'inherit',
  fontWeight: 600,
  cursor: 'pointer',
} as const

function Panel(props: {
  channel: Channel
  target: string
  verified: boolean
  /** Nothing on file to send to: the panel opens on the entry field. */
  missing?: boolean
  onVerified: () => void
  onChanged: (channel: Channel) => void
}) {
  const { channel, target, verified, missing = false, onVerified, onChanged } = props
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [cooldown, setCooldown] = useState(0)
  const [sentOnce, setSentOnce] = useState(false)
  // Correcting a mistyped address or number (found 2026-10-08): there was no
  // way to, so an applicant with a typo could never finish.
  const [editing, setEditing] = useState(missing)
  const [newValue, setNewValue] = useState('')

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

  async function saveChange() {
    setError('')
    setNotice('')
    setBusy(true)
    try {
      const res = await fetch('/api/careers/update-contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel, value: newValue }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error || 'Could not save the change.')
        setBusy(false)
        return
      }
      // The parent re-reads the account and re-keys this panel, so it starts
      // over with "Send code" for the new address or number.
      setBusy(false)
      setEditing(false)
      onChanged(channel)
    } catch {
      setError('Could not reach the server.')
      setBusy(false)
    }
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '12px' }}>
        <label style={LABEL} htmlFor={`code-${channel}`}>{missing ? label : `${label} — ${target}`}</label>
        {!editing && !missing ? (
          <button type="button" style={{ ...LINK_BUTTON, fontSize: '13px' }}
            onClick={() => { setEditing(true); setNewValue(''); setError(''); setNotice('') }}>
            Change
          </button>
        ) : null}
      </div>

      {error ? <div style={ERROR}>{error}</div> : null}

      {editing ? (
        <div>
          <label style={LABEL} htmlFor={`new-${channel}`}>
            {missing
              ? (channel === 'email' ? 'Your email address' : 'Your mobile number')
              : (channel === 'email' ? 'Correct email address' : 'Correct mobile number')}
          </label>
          <input
            id={`new-${channel}`}
            style={{ ...INPUT, margin: '0 0 10px' }}
            type={channel === 'email' ? 'email' : 'tel'}
            inputMode={channel === 'email' ? 'email' : 'tel'}
            autoComplete={channel === 'email' ? 'email' : 'tel'}
            value={newValue}
            onChange={(e) => setNewValue(e.target.value)}
          />
          <button
            style={busy || !newValue.trim() ? BUTTON_DISABLED : BUTTON}
            disabled={busy || !newValue.trim()}
            onClick={saveChange}
          >
            {busy ? 'Saving…' : 'Save'}
          </button>
          {missing ? null : (
            <p style={{ fontSize: '13px', textAlign: 'center', margin: '10px 0 0' }}>
              <button type="button" style={LINK_BUTTON} onClick={() => { setEditing(false); setError('') }}>Cancel</button>
            </p>
          )}
        </div>
      ) : null}
      {notice ? (
        <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.6)', margin: '0 0 10px' }}>{notice}</p>
      ) : null}

      {editing ? null : !sentOnce ? (
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
            id={`code-${channel}`}
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
              <button type="button" style={LINK_BUTTON} onClick={send} disabled={busy}>Resend code</button>
            )}
          </p>
        </>
      )}
    </div>
  )
}

/** The legal name, asked for when the account has none (see Me.needsName). */
function NamePanel(props: { onSaved: () => void }) {
  const [first, setFirst] = useState('')
  const [last, setLast] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const ok = first.trim() !== '' && last.trim() !== ''

  async function save() {
    setError('')
    setBusy(true)
    try {
      const res = await fetch('/api/careers/update-contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel: 'name', firstName: first, lastName: last }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error || 'Could not save your name.')
        setBusy(false)
        return
      }
      setBusy(false)
      props.onSaved()
    } catch {
      setError('Could not reach the server.')
      setBusy(false)
    }
  }

  return (
    <div style={{ margin: '0 0 24px', paddingBottom: '20px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
      {error ? <div style={ERROR}>{error}</div> : null}
      <div style={FIELD}>
        <label style={LABEL} htmlFor="name-first">Legal first name</label>
        <input id="name-first" style={INPUT} value={first} autoComplete="given-name"
          onChange={(e) => setFirst(e.target.value)} />
      </div>
      <div style={FIELD}>
        <label style={LABEL} htmlFor="name-last">Legal last name</label>
        <input id="name-last" style={INPUT} value={last} autoComplete="family-name"
          onChange={(e) => setLast(e.target.value)} />
      </div>
      <button style={busy || !ok ? BUTTON_DISABLED : BUTTON} disabled={busy || !ok} onClick={save}>
        {busy ? 'Saving…' : 'Save name'}
      </button>
    </div>
  )
}

export default function VerifyForm() {
  const router = useRouter()
  const [me, setMe] = useState<Me | null>(null)
  const [emailDone, setEmailDone] = useState(false)
  const [phoneDone, setPhoneDone] = useState(false)

  const loadMe = useCallback(() => {
    fetch('/api/careers/me')
      .then((r) => r.json())
      .then((data: Me) => {
        setMe(data)
        setEmailDone(Boolean(data.emailVerified))
        setPhoneDone(Boolean(data.phoneVerified))
      })
      .catch(() => setMe({ signedIn: false }))
  }, [])

  useEffect(() => { loadMe() }, [loadMe])

  // Bumped on every correction so the panels start over (a new number can
  // mask to the same last four digits as the old one).
  const [changes, setChanges] = useState({ email: 0, phone: 0 })
  const changed = useCallback((channel: Channel) => {
    setChanges((c) => ({ ...c, [channel]: c[channel] + 1 }))
    loadMe()
  }, [loadMe])

  const nameDone = Boolean(me?.signedIn && !me.needsName)

  useEffect(() => {
    if (emailDone && phoneDone && nameDone) {
      const t = setTimeout(() => router.push('/careers/apply'), 900)
      return () => clearTimeout(t)
    }
  }, [emailDone, phoneDone, nameDone, router])

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

  const allDone = emailDone && phoneDone && nameDone

  return (
    <main style={PAGE}>
      <div style={CARD}>
        <h1 style={H1}>Verify your details</h1>
        <p style={SUB}>
          {allDone
            ? 'Both verified. Taking you to your application…'
            : me.needsName
              ? 'Please enter your legal name and confirm your mobile number before you continue.'
              : 'We need to confirm both your email and your phone number before you continue.'}
        </p>

        {me.needsName ? <NamePanel onSaved={loadMe} /> : null}

        <Panel
          key={'email:' + changes.email}
          channel="email"
          target={me.emailMasked || ''}
          verified={emailDone}
          onVerified={() => setEmailDone(true)}
          onChanged={changed}
        />
        <Panel
          key={'phone:' + changes.phone}
          channel="phone"
          target={me.phoneMasked || ''}
          verified={phoneDone}
          missing={me.hasPhone === false}
          onVerified={() => setPhoneDone(true)}
          onChanged={changed}
        />
        {allDone ? null : (
          <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.5)', margin: '0' }}>
            Typed something wrong, or the code never arrives? Use Change to correct it.
          </p>
        )}
      </div>
    </main>
  )
}
