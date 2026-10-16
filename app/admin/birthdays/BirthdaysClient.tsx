'use client'

import { useEffect, useState } from 'react'
import { useT, useLocale } from '@/lib/i18n/provider'
import { dateTag } from '@/lib/i18n'

type Item = {
  studentId: string; name: string; date: string; age: number
  kind: 'active' | 'returning' | 'new' | 'adult'; lang: string
  skip: 'not_subscribed' | 'no_email' | null
  card: { status: 'pending' | 'sent' | 'email_failed'; sent_at: string | null } | null
}
type Data = { today: string; month: string; mailingAddressSet: boolean; giftPoints: number; giftMonths: number; items: Item[] }

const KIND_STYLE: Record<Item['kind'], string> = {
  active: 'border-emerald-400/50 text-emerald-300',
  returning: 'border-amber-400/50 text-amber-300',
  new: 'border-sky-400/50 text-sky-300',
  adult: 'border-purple-400/50 text-purple-300',
}

function shiftMonth(month: string, by: number) {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1 + by, 1))
  return d.toISOString().slice(0, 7)
}

export default function BirthdaysClient() {
  const t = useT()
  const locale = useLocale()
  const [month, setMonth] = useState<string | null>(null)
  const [d, setD] = useState<Data | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/admin/birthdays' + (month ? '?month=' + month : ''))
      .then(r => r.ok ? r.json() : Promise.reject())
      .then((x: Data) => { setErr(null); setD(x); if (!month) setMonth(x.month) })
      .catch(() => setErr(t('admin.bday.err.load')))
  }, [month]) // eslint-disable-line react-hooks/exhaustive-deps

  async function test(it: Item) {
    setBusy(it.studentId); setNotice(null); setErr(null)
    const res = await fetch('/api/admin/birthdays', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ student_id: it.studentId, date: it.date }) }).catch(() => null)
    const j = res ? await res.json().catch(() => ({})) : {}
    setBusy(null)
    if (res?.ok) setNotice(t('admin.bday.testSent', { email: j.to || '' }))
    else setErr(t('admin.bday.err.test'))
  }

  const dayLabel = (ymd: string) => new Date(ymd + 'T12:00:00Z').toLocaleDateString(dateTag(locale, 'en-US'), { timeZone: 'UTC', month: 'short', day: 'numeric', weekday: 'short' })
  const monthLabel = (m: string) => new Date(m + '-15T12:00:00Z').toLocaleDateString(dateTag(locale, 'en-US'), { timeZone: 'UTC', year: 'numeric', month: 'long' })

  const status = (it: Item) => {
    if (it.skip === 'not_subscribed') return <span className="text-gray-500">{t('admin.bday.st.notSubscribed')}</span>
    if (it.skip === 'no_email') return <span className="text-gray-500">{t('admin.bday.st.noEmail')}</span>
    if (it.card?.status === 'sent') return <span className="text-emerald-300">{t('admin.bday.st.sent')}</span>
    if (it.card?.status === 'email_failed') return <span className="text-red-300">{t('admin.bday.st.failed')}</span>
    if (d && it.date < d.today) return <span className="text-gray-500">{t('admin.bday.st.notSent')}</span>
    return <span className="text-gray-400">{d && it.date === d.today ? t('admin.bday.st.today') : t('admin.bday.st.upcoming')}</span>
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-white font-serif">{t('admin.bday.title')}</h1>
      <p className="text-gray-400 mt-1 text-sm max-w-3xl leading-relaxed">
        {d ? t('admin.bday.intro', { points: d.giftPoints, months: d.giftMonths }) : ''}
      </p>

      {d && !d.mailingAddressSet && (
        <p role="status" className="mt-4 rounded-lg border border-amber-400/40 bg-amber-500/10 px-4 py-3 text-amber-200 text-sm max-w-3xl leading-relaxed">
          {t('admin.bday.noAddress')}
        </p>
      )}

      <div className="mt-6 flex items-center gap-2">
        <button onClick={() => month && setMonth(shiftMonth(month, -1))} aria-label={t('admin.bday.prev')}
          className="px-3 py-1.5 rounded-lg border border-[#1e3a6e] text-gray-300 hover:border-[#c9a84c]/50">&lsaquo;</button>
        <span className="text-white font-semibold min-w-[9rem] text-center">{month ? monthLabel(month) : ''}</span>
        <button onClick={() => month && setMonth(shiftMonth(month, 1))} aria-label={t('admin.bday.next')}
          className="px-3 py-1.5 rounded-lg border border-[#1e3a6e] text-gray-300 hover:border-[#c9a84c]/50">&rsaquo;</button>
      </div>

      {err && <p role="alert" className="mt-4 text-red-400 text-sm">{err}</p>}
      {notice && <p role="status" className="mt-4 text-emerald-300 text-sm">{notice}</p>}
      {!d && !err && <p className="mt-6 text-gray-500 text-sm">{t('common.loading')}</p>}

      {d && (
        <div className="mt-4 overflow-x-auto bg-[#111d38] border border-[#1e3a6e] rounded-xl">
          <table className="w-full text-sm min-w-[680px]">
            <thead>
              <tr className="text-left text-gray-500 text-xs uppercase tracking-wider">
                <th className="px-4 py-3 font-medium">{t('admin.bday.col.date')}</th>
                <th className="px-4 py-3 font-medium">{t('admin.bday.col.swimmer')}</th>
                <th className="px-4 py-3 font-medium">{t('admin.bday.col.version')}</th>
                <th className="px-4 py-3 font-medium">{t('admin.bday.col.status')}</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {d.items.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-6 text-gray-500">{t('admin.bday.empty')}</td></tr>
              )}
              {d.items.map(it => (
                <tr key={it.studentId} className={`border-t border-[#1e3a6e]/60 ${it.date === d.today ? 'bg-[#c9a84c]/10' : ''}`}>
                  <td className="px-4 py-3 text-gray-300 whitespace-nowrap tabular-nums">{dayLabel(it.date)}</td>
                  <td className="px-4 py-3 text-white">{it.name} <span className="text-gray-500 text-xs">{t('admin.bday.turns', { n: it.age })}</span></td>
                  <td className="px-4 py-3"><span className={`text-xs px-2 py-0.5 rounded-full border ${KIND_STYLE[it.kind]}`}>{t('admin.bday.kind.' + it.kind)}</span></td>
                  <td className="px-4 py-3 text-xs">{status(it)}</td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => test(it)} disabled={busy === it.studentId}
                      className="text-xs px-3 py-1.5 rounded-lg border border-[#1e3a6e] text-gray-300 hover:border-[#c9a84c]/50 hover:text-[#c9a84c] disabled:opacity-40 whitespace-nowrap">
                      {busy === it.studentId ? t('common.loading') : t('admin.bday.test')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
