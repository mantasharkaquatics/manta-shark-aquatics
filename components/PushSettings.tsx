'use client'
import Link from 'next/link'

import { useEffect, useState } from 'react'
import { useT } from '@/lib/i18n/provider'
import { isNativeApp, pushPlugin } from '@/lib/native-app'

/* "Notifications" in My Account, inside the phone app only (owner,
   2026-10-27): three switches, per person. Closures and lessons the school
   cancels always come and have no switch; the note under the switches says
   so. When the phone itself has notifications off for the app, a line says
   that instead, since no switch here can override the phone. */

// news (2026-10-28): school announcements, off until turned on (Apple 4.5.4).
type Key = 'reports' | 'reminders' | 'bookings' | 'news'
const KEYS: Key[] = ['reports', 'reminders', 'bookings', 'news']

const SOON_CSS = `
.ps-soon { display: flex; flex-direction: column; gap: 8px; margin: -2px 0 2px; padding: 10px 12px; border-radius: 12px; background: #f3f6fb; }
.ps-soon b { font-size: 14px; color: #12254a; }
.ps-seg { display: flex; gap: 4px; padding: 3px; border-radius: 10px; background: #e3e9f2; }
.ps-seg button { flex: 1; min-height: 36px; padding: 6px 4px; border: 0; border-radius: 8px; background: transparent;
  font: inherit; font-size: 14px; font-weight: 700; color: #56647d; cursor: pointer; }
.ps-seg button[aria-pressed="true"] { background: #fff; color: #12254a; box-shadow: 0 1px 3px rgba(18,37,74,.14); }
`

export default function PushSettings() {
  const t = useT()
  const [phoneOff, setPhoneOff] = useState(false)
  const [on, setOn] = useState<Record<Key, boolean> | null>(null)
  const [saving, setSaving] = useState<Key | null>(null)
  const [error, setError] = useState(false)

  // A failed read says so and offers to try again (2026-11-04: the page was left with its title alone).
  const [loadFailed, setLoadFailed] = useState(false)
  const [tries, setTries] = useState(0)
  const [role, setRole] = useState<string | null>(null)
  // How long before a lesson its push comes (owner, 2026-11-14): 0, 30, 60.
  const [soon, setSoon] = useState(60)
  const [soonSaving, setSoonSaving] = useState(false)
  useEffect(() => {
    if (!isNativeApp()) return
    // Inside a promise: whatever the bridge returns, a throw stays here.
    Promise.resolve().then(() => pushPlugin()?.checkPermissions()).then(p => setPhoneOff(p?.receive === 'denied')).catch(() => {})
    fetch('/api/push/settings', { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        if (d) { setLoadFailed(false); setRole(typeof d.role === 'string' ? d.role : null); if (typeof d.soon === 'number') setSoon(d.soon); setOn({ reports: d.reports !== false, reminders: d.reminders !== false, bookings: d.bookings !== false, news: d.news === true }) }
        else setLoadFailed(true)
      })
      .catch(() => setLoadFailed(true))
  }, [tries])

  if (!on && loadFailed) return (
    <section className="ac-card">
      <div className="ac-err" style={{ marginBottom: 10 }}>{t('push.settings.loadFailed')}</div>
      <button type="button" className="ac-btn line" onClick={() => setTries(n => n + 1)}>{t('common.retry')}</button>
    </section>
  )
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

  async function pickSoon(m: number) {
    if (soonSaving || m === soon) return
    const was = soon
    setSoon(m); setSoonSaving(true); setError(false)
    try {
      const r = await fetch('/api/push/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ soon: m }) })
      if (!r.ok) throw new Error()
    } catch {
      setSoon(was)
      setError(true)
    } finally {
      setSoonSaving(false)
    }
  }

  return (
    <section className="ac-card">
      <style>{SOON_CSS}</style>
      <p className="ac-label">{t('push.settings.title')}</p>
      {phoneOff && <div className="ac-err" style={{ marginBottom: 10 }}>{t('push.settings.phoneOff')}</div>}
      <div className="ac-stack" style={{ gap: 12 }}>
        {KEYS.map(k => (
          <div key={k} className="ac-row">
            <div>
              <b>{t(`push.settings.${k}`)}</b>
              {/* A view-only member gets no waitlist offers (J85). */}
              <small>{t(k === 'bookings' && role === 'viewer' ? 'push.settings.bookingsDescViewer' : `push.settings.${k}Desc`)}</small>
            </div>
            <button type="button" role="switch" aria-checked={on[k]} aria-label={t(`push.settings.${k}`)}
              onClick={() => flip(k)} disabled={saving !== null} className="tap-auto ac-toggle">
              <span />
            </button>
          </div>
        )).flatMap((row, i) => KEYS[i] === 'reminders' && on.reminders ? [row, (
          // 課前提醒 (owner, 2026-11-14): each person picks when the push
          // before a lesson comes; an hour unless changed.
          <div key="soon" className="ps-soon">
            <b id="ps-soon-h">{t('push.settings.soon')}</b>
            <div className="ps-seg" role="group" aria-labelledby="ps-soon-h">
              {[0, 30, 60].map(m => (
                <button key={m} type="button" aria-pressed={soon === m} disabled={soonSaving} onClick={() => pickSoon(m)}
                  className="tap-auto">{t('push.settings.soon.' + m)}</button>
              ))}
            </div>
          </div>
        )] : [row])}
      </div>
      {error && <div className="ac-err" role="alert" style={{ marginTop: 10 }}>{t('push.settings.error')}</div>}
      <p className="ac-note" style={{ marginTop: 12 }}>{t('push.settings.always')}</p>
      {/* Push takes the place of the text messages: say so (50-role test, 2026-11-05). */}
      {/* Texts go to the main account's phone only (J85); and how to stop them (J60). */}
      <p className="ac-note" style={{ marginTop: 6 }}>{t(role === 'main' || !role ? 'push.settings.smsNote' : 'push.settings.smsNoteOther')}</p>
      {(role === 'main' || !role) && <p className="ac-note" style={{ marginTop: 6 }}>{t('push.settings.smsStop')} <Link href="/sms-terms" style={{ color: '#1f5fbf', fontWeight: 700 }}>{t('legal.smsTerms')} ›</Link></p>}
    </section>
  )
}
