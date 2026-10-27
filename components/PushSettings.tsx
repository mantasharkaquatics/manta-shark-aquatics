'use client'

import { useEffect, useState } from 'react'
import { useT } from '@/lib/i18n/provider'
import { isNativeApp, pushPlugin } from '@/lib/native-app'

/* "Notifications" in My Account, inside the phone app only (owner,
   2026-10-27): three switches, per person. Closures and lessons the school
   cancels always come and have no switch; the note under the switches says
   so. When the phone itself has notifications off for the app, a line says
   that instead, since no switch here can override the phone. */

type Key = 'reports' | 'reminders' | 'bookings'
const KEYS: Key[] = ['reports', 'reminders', 'bookings']

export default function PushSettings() {
  const t = useT()
  const [phoneOff, setPhoneOff] = useState(false)
  const [on, setOn] = useState<Record<Key, boolean> | null>(null)
  const [saving, setSaving] = useState<Key | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    if (!isNativeApp()) return
    pushPlugin()?.checkPermissions().then(p => setPhoneOff(p.receive === 'denied')).catch(() => {})
    fetch('/api/push/settings', { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (d) setOn({ reports: d.reports !== false, reminders: d.reminders !== false, bookings: d.bookings !== false }) })
      .catch(() => {})
  }, [])

  // Only ever set inside the app.
  if (!on) return null

  async function flip(k: Key) {
    if (!on || saving) return
    const next = !on[k]
    setSaving(k); setError(false)
    setOn({ ...on, [k]: next })
    try {
      const r = await fetch('/api/push/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ [k]: next }) })
      if (!r.ok) throw new Error()
    } catch {
      setOn(o => (o ? { ...o, [k]: !next } : o))
      setError(true)
    } finally {
      setSaving(null)
    }
  }

  return (
    <section className="ac-card">
      <p className="ac-label">{t('push.settings.title')}</p>
      {phoneOff && <div className="ac-err" style={{ marginBottom: 10 }}>{t('push.settings.phoneOff')}</div>}
      <div className="ac-stack" style={{ gap: 12 }}>
        {KEYS.map(k => (
          <div key={k} className="ac-row">
            <div>
              <b>{t(`push.settings.${k}`)}</b>
              <small>{t(`push.settings.${k}Desc`)}</small>
            </div>
            <button type="button" role="switch" aria-checked={on[k]} aria-label={t(`push.settings.${k}`)}
              onClick={() => flip(k)} disabled={saving !== null} className="tap-auto ac-toggle">
              <span />
            </button>
          </div>
        ))}
      </div>
      {error && <div className="ac-err" role="alert" style={{ marginTop: 10 }}>{t('push.settings.error')}</div>}
      <p className="ac-note" style={{ marginTop: 12 }}>{t('push.settings.always')}</p>
    </section>
  )
}
