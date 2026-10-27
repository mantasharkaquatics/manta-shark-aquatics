'use client'

import { useEffect, useState } from 'react'
import { useLocale, useT } from '@/lib/i18n/provider'

/* The family's phones with the app, on the admin family page, and a button
   that sends them a test notice (owner, 2026-10-27; /api/admin/push-test).
   For "I don't get notifications" at the desk, and for testing the app. */

type Phone = { platform: string; permission: boolean; lastSeen: string; who: 'main' | 'full' | 'viewer' | 'gone' }
type State = { configured: boolean; phones: Phone[] }

const INTL: Record<string, string> = { en: 'en-US', 'zh-Hant': 'zh-TW', 'zh-Hans': 'zh-CN' }

export default function AppPhones({ parentId }: { parentId: string }) {
  const t = useT()
  const locale = useLocale()
  const [s, setS] = useState<State | null>(null)
  const [step, setStep] = useState<'idle' | 'confirm' | 'sending'>('idle')
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    let live = true
    fetch(`/api/admin/push-test?parent_id=${encodeURIComponent(parentId)}`, { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (live && d) setS(d) })
      .catch(() => {})
    return () => { live = false }
  }, [parentId])

  if (!s) return null
  const reachable = s.phones.filter(p => p.permission && p.who !== 'gone').length
  const when = (iso: string) => new Date(iso).toLocaleString(INTL[locale] || 'en-US', {
    month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/Los_Angeles',
  })

  async function send() {
    setStep('sending'); setResult(null)
    const r = await fetch('/api/admin/push-test', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ parent_id: parentId }),
    }).catch(() => null)
    const j = r ? await r.json().catch(() => ({})) : {}
    setStep('idle')
    if (j.phones) setS(prev => (prev ? { ...prev, phones: j.phones } : prev))
    if (!r || !r.ok) setResult({ ok: false, text: t(j.error === 'not_configured' ? 'admin.members.fv.push.notConfigured' : 'admin.members.fv.push.failed') })
    else if (j.sent > 0) setResult({ ok: true, text: t('admin.members.fv.push.sent', { n: j.sent }) })
    else setResult({ ok: false, text: t('admin.members.fv.push.failed') })
  }

  return (
    <div className="mb-4 rounded-xl border border-[#1e3a6e] bg-[#111d38] px-4 py-3 flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0">
        <div className="text-sm font-semibold text-white">{t('admin.members.fv.push.title')}</div>
        {!s.configured ? (
          <div className="text-xs text-gray-400 mt-1">{t('admin.members.fv.push.notConfigured')}</div>
        ) : s.phones.length === 0 ? (
          <div className="text-xs text-gray-400 mt-1">{t('admin.members.fv.push.none')}</div>
        ) : (
          <ul className="mt-1 space-y-0.5">
            {s.phones.map((p, i) => (
              <li key={i} className="text-xs text-gray-300">
                {p.platform === 'ios' ? 'iPhone' : 'Android'} · {t(`admin.members.fv.push.who.${p.who}`)} · <span className={p.permission ? 'text-emerald-400' : 'text-amber-400'}>{t(p.permission ? 'admin.members.fv.push.allowed' : 'admin.members.fv.push.blocked')}</span> · {t('admin.members.fv.push.lastSeen', { when: when(p.lastSeen) })}
              </li>
            ))}
          </ul>
        )}
        {result && <div role="status" className={`text-xs mt-1.5 ${result.ok ? 'text-emerald-400' : 'text-amber-400'}`}>{result.text}</div>}
      </div>
      {s.configured && reachable > 0 && (
        step === 'confirm' ? (
          <div className="flex gap-2">
            <button type="button" onClick={send} className="px-3 py-1.5 rounded-lg bg-[#c9a84c] text-[#0d1529] text-sm font-semibold">{t('admin.members.fv.push.confirm', { n: reachable })}</button>
            <button type="button" onClick={() => setStep('idle')} className="px-3 py-1.5 rounded-lg border border-[#1e3a6e] text-gray-400 text-sm">{t('common.cancel')}</button>
          </div>
        ) : (
          <button type="button" disabled={step === 'sending'} onClick={() => { setResult(null); setStep('confirm') }}
            className="px-3 py-1.5 rounded-lg border border-[#c9a84c] text-[#c9a84c] text-sm disabled:opacity-50">
            {t(step === 'sending' ? 'admin.members.fv.push.sending' : 'admin.members.fv.push.send')}
          </button>
        )
      )}
    </div>
  )
}
