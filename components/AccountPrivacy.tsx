'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useT, useLocale } from '@/lib/i18n/provider'

/* The bottom of My Account (owner, 2026-10-22, tier 3): saved cards, the
   photo/video consent switch, and asking the school to delete the account.
   Uses the account page's ac-* styles. */

type Card = { id: string; brand: string; last4: string; exp: string }
type Acct = { media: boolean; mediaAt: string | null; deletionRequestedAt: string | null; deletionAvailable: boolean; main: boolean }

const INTL: Record<string, string> = { en: 'en-US', 'zh-Hant': 'zh-TW', 'zh-Hans': 'zh-CN' }
const BRAND: Record<string, string> = { visa: 'Visa', mastercard: 'Mastercard', amex: 'American Express', discover: 'Discover', jcb: 'JCB', diners: 'Diners Club', unionpay: 'UnionPay' }

export default function AccountPrivacy() {
  const t = useT()
  const locale = useLocale()
  const [cards, setCards] = useState<Card[] | null>(null)
  const [acct, setAcct] = useState<Acct | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => {
    fetch('/api/parent/cards', { cache: 'no-store' }).then(r => (r.ok ? r.json() : { cards: [] })).then(d => setCards(d.cards || [])).catch(() => setCards([]))
    fetch('/api/parent/account', { cache: 'no-store' }).then(r => (r.ok ? r.json() : null)).then(d => { if (d) setAcct(d) }).catch(() => {})
  }, [])

  const day = (iso: string) => new Date(iso).toLocaleDateString(INTL[locale] || 'en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'America/Los_Angeles' })

  async function removeCard(c: Card) {
    setBusy(c.id); setErr(null)
    try {
      const r = await fetch(`/api/parent/cards?id=${encodeURIComponent(c.id)}`, { method: 'DELETE' })
      if (!r.ok) throw new Error()
      setCards(prev => (prev || []).filter(x => x.id !== c.id))
    } catch { setErr(t('account.privacy.err')) } finally { setBusy(null) }
  }

  async function post(body: object, key: string) {
    setBusy(key); setErr(null)
    try {
      const r = await fetch('/api/parent/account', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error()
      return d
    } catch { setErr(t('account.privacy.err')); return null } finally { setBusy(null) }
  }

  async function toggleMedia() {
    if (!acct) return
    const d = await post({ action: 'media', value: !acct.media }, 'media')
    if (d) setAcct({ ...acct, media: d.media, mediaAt: d.mediaAt })
  }

  async function deletion(asking: boolean) {
    if (!acct) return
    const d = await post({ action: asking ? 'delete_request' : 'delete_withdraw' }, 'delete')
    if (d) { setAcct({ ...acct, deletionRequestedAt: d.deletionRequestedAt }); setConfirmDelete(false) }
  }

  return (
    <>
      {/* Saved cards: only shown once the family has one. */}
      {cards && cards.length > 0 && (
        <section className="ac-card">
          <p className="ac-label">{t('account.cards.title')}</p>
          <div className="ac-stack" style={{ gap: 10, marginTop: 12 }}>
            {cards.map(c => (
              <div key={c.id} className="ac-item">
                <div>
                  <b>{BRAND[c.brand] || c.brand} •••• {c.last4}</b>
                  <small>{t('account.cards.exp', { exp: c.exp })}</small>
                </div>
                <button type="button" className="ac-btn line" style={{ width: 'auto', padding: '8px 14px' }} disabled={busy === c.id} onClick={() => removeCard(c)}>
                  {busy === c.id ? t('account.cards.removing') : t('account.cards.remove')}
                </button>
              </div>
            ))}
          </div>
          <p className="ac-note">{t('account.cards.note')}</p>
        </section>
      )}

      {acct && (
        <section className="ac-card ac-row">
          <div>
            <b>{t('account.media.title')}</b>
            <small>
              {t('account.media.desc')}{' '}
              <Link href="/media-release" style={{ color: '#1f5fbf', fontWeight: 700 }}>{t('account.media.read')}</Link>
            </small>
            {acct.mediaAt && <small style={{ display: 'block', marginTop: 4 }}>{t(acct.media ? 'account.media.onSince' : 'account.media.offSince', { date: day(acct.mediaAt) })}</small>}
          </div>
          <button type="button" role="switch" aria-checked={acct.media} aria-label={t('account.media.title')}
            onClick={toggleMedia} disabled={busy === 'media'} className="tap-auto ac-toggle">
            <span />
          </button>
        </section>
      )}

      {acct && acct.main && acct.deletionAvailable && (
        <section className="ac-card">
          <p className="ac-label">{t('account.delete.title')}</p>
          {acct.deletionRequestedAt ? (
            <>
              <div className="ac-err" style={{ marginTop: 8 }}>{t('account.delete.requested', { date: day(acct.deletionRequestedAt) })}</div>
              <button type="button" className="ac-btn line" style={{ width: 'auto', padding: '8px 16px', marginTop: 12 }} disabled={busy === 'delete'} onClick={() => deletion(false)}>
                {t('account.delete.withdraw')}
              </button>
            </>
          ) : !confirmDelete ? (
            <>
              <p className="ac-note" style={{ marginTop: 4 }}>{t('account.delete.desc')}</p>
              <button type="button" className="ac-btn line" style={{ width: 'auto', padding: '8px 16px', marginTop: 4, color: '#b4321f' }} onClick={() => setConfirmDelete(true)}>
                {t('account.delete.ask')}
              </button>
            </>
          ) : (
            <div className="ac-item" style={{ display: 'block', marginTop: 8 }}>
              <p style={{ margin: '0 0 12px', fontSize: 14, color: '#16294a', lineHeight: 1.6 }}>{t('account.delete.confirm')}</p>
              <div className="ac-pair">
                <button type="button" className="ac-btn line" disabled={busy === 'delete'} onClick={() => setConfirmDelete(false)}>{t('common.cancel')}</button>
                <button type="button" className="ac-btn gold" disabled={busy === 'delete'} onClick={() => deletion(true)}>
                  {busy === 'delete' ? t('account.delete.sending') : t('account.delete.send')}
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      {err && <div className="ac-err" role="alert">{err}</div>}
    </>
  )
}
