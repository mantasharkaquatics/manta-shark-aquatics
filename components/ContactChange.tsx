'use client'

import { useEffect, useRef, useState } from 'react'
import { useT } from '@/lib/i18n/provider'
import { BRAND } from '@/lib/brand'

/* The family changes its own email or phone (owner, 2026-10-22): type the new
   one, get a code there, type the code. /api/parent/contact-change. */

const KNOWN = ['bad_email', 'bad_phone', 'email_taken', 'email_login_taken', 'phone_taken', 'same_value', 'too_many_codes',
  'not_delivered', 'incorrect_code', 'code_expired', 'too_many_attempts', 'request_used']

const input: React.CSSProperties = { width: '100%', boxSizing: 'border-box', background: '#fff', border: '1px solid #d5e0ef', borderRadius: 8, padding: '10px 12px', fontSize: 16, color: '#16294a' }

export default function ContactChange({ field, onClose, onDone }: { field: 'email' | 'phone'; onClose: () => void; onDone: (value: string) => void }) {
  const t = useT()
  const [value, setValue] = useState('')
  const [code, setCode] = useState('')
  const [requestId, setRequestId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => { box.current?.focus() }, [])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, busy])

  const errText = (c?: string) => t(`account.contact.err.${c && KNOWN.includes(c) ? c : 'generic'}`)

  async function call(body: Record<string, string>) {
    setBusy(true); setErr(null)
    const r = await fetch('/api/parent/contact-change', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null)
    const d = r ? await r.json().catch(() => null) : null
    setBusy(false)
    if (!r || !r.ok) { setErr(errText(d?.code)); return null }
    return d
  }
  async function send() {
    if (!value.trim()) return
    const d = await call({ action: 'request_code', field, new_value: value.trim() })
    if (d?.request_id) { setRequestId(d.request_id); setCode('') }
  }
  async function confirm() {
    if (!requestId || !code.trim()) return
    const d = await call({ action: 'confirm', request_id: requestId, code: code.trim() })
    if (d?.ok) { onDone(d.new_value); onClose() }
  }

  const title = t(field === 'email' ? 'account.contact.titleEmail' : 'account.contact.titlePhone')
  return (
    // A short form: centred like a decision (決定 9), so the phone's keyboard
    // pushes it up rather than covering it; the round ✕ as on every sheet.
    <div className="msa-dlg-back" onClick={() => !busy && onClose()}>
      <div ref={box} tabIndex={-1} className="msa-dlg" role="dialog" aria-modal="true" aria-labelledby="cc-title" onClick={e => e.stopPropagation()}
        style={{ maxWidth: 440, outline: 'none' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <h2 id="cc-title" style={{ margin: 0, fontSize: 20, fontWeight: 800, color: BRAND.navy }}>{title}</h2>
          <button type="button" onClick={onClose} disabled={busy} aria-label={t('common.close')} className="msa-sheet-x tap-auto"><span aria-hidden="true">✕</span></button>
        </div>

        {!requestId ? (
          <div style={{ display: 'grid', gap: 10, marginTop: 16 }}>
            <label htmlFor="cc-value" style={{ fontSize: 14, color: BRAND.mute }}>{t(field === 'email' ? 'account.contact.newEmail' : 'account.contact.newPhone')}</label>
            <input id="cc-value" style={input} value={value} onChange={e => setValue(e.target.value)} autoFocus
              type={field === 'email' ? 'email' : 'tel'} inputMode={field === 'email' ? 'email' : 'tel'} autoComplete={field === 'email' ? 'email' : 'tel'}
              placeholder={field === 'email' ? 'name@example.com' : '(714) 555-0123'}
              onKeyDown={e => { if (e.key === 'Enter') send() }} />
            <p style={{ fontSize: 12.5, color: BRAND.mute, lineHeight: 1.6, margin: 0 }}>{t(field === 'email' ? 'account.contact.hintEmail' : 'account.contact.hintPhone')}</p>
            {err && <p role="alert" style={{ fontSize: 13, color: '#c0392b', margin: 0 }}>{err}</p>}
            <button type="button" onClick={send} disabled={busy || !value.trim()}
              style={{ padding: 12, borderRadius: 10, border: 'none', background: BRAND.amber, color: BRAND.navy, fontWeight: 800, cursor: 'pointer', opacity: busy || !value.trim() ? 0.6 : 1 }}>
              {busy ? t('account.contact.sending') : t('account.contact.sendCode')}
            </button>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 10, marginTop: 16 }}>
            <p style={{ fontSize: 14, color: '#16294a', lineHeight: 1.6, margin: 0 }}>{t('account.contact.sent', { value: value.trim() })}</p>
            <label htmlFor="cc-code" style={{ fontSize: 14, color: BRAND.mute }}>{t('account.contact.code')}</label>
            <input id="cc-code" style={{ ...input, letterSpacing: 6, fontWeight: 700, textAlign: 'center' }} value={code} autoFocus
              onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code"
              onKeyDown={e => { if (e.key === 'Enter') confirm() }} />
            {err && <p role="alert" style={{ fontSize: 13, color: '#c0392b', margin: 0 }}>{err}</p>}
            <button type="button" onClick={confirm} disabled={busy || code.length !== 6}
              style={{ padding: 12, borderRadius: 10, border: 'none', background: BRAND.amber, color: BRAND.navy, fontWeight: 800, cursor: 'pointer', opacity: busy || code.length !== 6 ? 0.6 : 1 }}>
              {busy ? t('account.contact.confirming') : t('account.contact.confirm')}
            </button>
            <button type="button" onClick={() => { setRequestId(null); setErr(null) }} disabled={busy} className="tap-auto"
              style={{ background: 'none', border: 'none', color: BRAND.blue, fontWeight: 700, fontSize: 13, cursor: 'pointer', padding: 6 }}>
              {t('account.contact.again')}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
