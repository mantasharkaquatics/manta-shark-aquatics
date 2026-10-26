'use client'

import { useCallback, useEffect, useState } from 'react'
import AlertModal from '@/components/AlertModal'
import { useT, useLocale } from '@/lib/i18n/provider'
import { dateTag } from '@/lib/i18n'

type Cert = { id: string; studentName: string; familyName: string; fromLevel: number; toLevel: number; date: string; given: string | null }

/** Every level-up certificate. The ones not yet handed to the swimmer come
 *  first: print, hand it over at the pool, then mark it given. */
export default function CertificatesClient() {
  const t = useT()
  const locale = useLocale()
  const [list, setList] = useState<Cert[] | null>(null)
  const [needsSql, setNeedsSql] = useState(false)
  const [show, setShow] = useState<'todo' | 'all'>('todo')
  const [busy, setBusy] = useState<string | null>(null)
  const [alertMsg, setAlertMsg] = useState<string | null>(null)

  const load = useCallback(async () => {
    const r = await fetch('/api/admin/certificates', { cache: 'no-store' }).catch(() => null)
    if (!r || !r.ok) { setAlertMsg(t('admin.certs.err.load')); return }
    const d = await r.json()
    setList(d.certificates || []); setNeedsSql(!!d.needsSql)
  }, [t])
  useEffect(() => { load() }, [load])

  async function mark(c: Cert, given: boolean) {
    setBusy(c.id)
    const r = await fetch('/api/admin/certificates', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: c.id, given }),
    }).catch(() => null)
    setBusy(null)
    if (!r || !r.ok) { setAlertMsg(t('admin.certs.err.save')); return }
    setList(l => (l || []).map(x => x.id === c.id ? { ...x, given: given ? new Date().toISOString() : null } : x))
    try { window.dispatchEvent(new Event('admin:certificates-changed')) } catch {}
  }

  if (!list) return <div className="p-8 text-gray-400 text-sm">{t('common.loading')}</div>
  const todo = list.filter(c => !c.given)
  const shown = show === 'todo' ? todo : list
  const fmt = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString(dateTag(locale, 'en-US'), { year: 'numeric', month: 'short', day: 'numeric' })

  return (
    <div className="p-6 md:p-8 max-w-4xl">
      <AlertModal message={alertMsg} onClose={() => setAlertMsg(null)} />
      <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">{t('admin.nav.certificates')}</h1>
          <p className="text-gray-400 text-sm mt-1">{t('admin.certs.intro')}</p>
        </div>
        <div className="flex gap-1.5">
          {(['todo', 'all'] as const).map(v => (
            <button key={v} onClick={() => setShow(v)}
              className={`px-3 py-1.5 rounded-lg border text-sm ${show === v ? 'border-[#c9a84c] bg-[#c9a84c]/15 text-[#c9a84c]' : 'border-[#1e3a6e] text-gray-400'}`}>
              {v === 'todo' ? t('admin.certs.tabTodo', { n: todo.length }) : t('admin.certs.tabAll', { n: list.length })}
            </button>
          ))}
        </div>
      </div>
      {needsSql && <p className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 text-amber-200 text-sm p-3">{t('admin.certs.needsSql')}</p>}
      {shown.length === 0 && <p className="text-gray-500 text-sm">{show === 'todo' ? t('admin.certs.nothingTodo') : t('admin.certs.empty')}</p>}
      <div className="space-y-3">
        {shown.map(c => (
          <div key={c.id} className={`rounded-xl border p-4 ${!c.given ? 'border-[#c9a84c]/40 bg-[#111d38]' : 'border-[#1e3a6e] bg-[#0f1a33]'}`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-white text-base font-semibold">{c.studentName}
                  <span className="text-[#c9a84c] font-normal"> · {t('admin.certs.levelMove', { from: c.fromLevel, to: c.toLevel })}</span></p>
                <p className="text-gray-400 text-xs mt-0.5">
                  {c.familyName && <>{t('admin.certs.family', { name: c.familyName })} · </>}{t('admin.certs.promoted', { date: fmt(c.date) })}
                  {c.given && <> · <span className="text-emerald-300">{t('admin.certs.givenOn', { date: new Date(c.given).toLocaleDateString(dateTag(locale, 'en-US'), { month: 'short', day: 'numeric' }) })}</span></>}
                </p>
              </div>
              <div className="flex gap-2">
                <a href={`/api/certificates/${c.id}`} target="_blank" rel="noopener noreferrer"
                  className="px-3 py-1.5 rounded-lg border border-[#c9a84c] text-[#c9a84c] text-sm font-semibold">🖨 {t('admin.certs.print')}</a>
                {!needsSql && (
                  <button onClick={() => mark(c, !c.given)} disabled={busy === c.id}
                    className={`px-3 py-1.5 rounded-lg text-sm font-semibold disabled:opacity-50 ${!c.given ? 'bg-[#c9a84c] text-[#111d38]' : 'border border-gray-600 text-gray-300'}`}>
                    {!c.given ? t('admin.certs.markGiven') : t('admin.certs.moveBack')}
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
