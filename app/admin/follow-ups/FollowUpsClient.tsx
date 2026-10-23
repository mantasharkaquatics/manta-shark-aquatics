'use client'

import { useCallback, useEffect, useState } from 'react'
import AlertModal from '@/components/AlertModal'
import { useT, useLocale } from '@/lib/i18n/provider'
import { dateTag } from '@/lib/i18n'

/* Admin > Follow-ups (owner, 2026-10-23; lib/follow-ups.ts): swimmers
   assessed but not booked (the day-3 and day-14 emails go by themselves;
   this shows who got them), families not seen for a while (listed only --
   no automatic email), and the summer registration email the owner sends
   by hand. */

type Assess = { id: string; student: string; family: string; email: string | null; phone: string | null; subscribed: boolean; assessedOn: string; daysSince: number; course: string | null; frequency: string | null; sent: number[] }
type Lapsed = { parentId: string; family: string; email: string | null; phone: string | null; subscribed: boolean; swimmers: string[]; lastLesson: string; daysSince: number }
type SummerRow = { family: string; swimmers: string[]; subscribed: boolean; sent: boolean }

const DAYS = [30, 45, 60, 90]

export default function FollowUpsClient() {
  const t = useT()
  const locale = useLocale()
  const [days, setDays] = useState(45)
  const [data, setData] = useState<{ assess: Assess[]; lapsed: Lapsed[]; summerYear: number } | null>(null)
  const [alertMsg, setAlertMsg] = useState<string | null>(null)
  const [year, setYear] = useState<number | null>(null)
  const [summer, setSummer] = useState<SummerRow[] | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ sent: number; alreadySent: number; notSubscribed: number; failed: number } | null>(null)
  const [testKind, setTestKind] = useState<'assess3' | 'assess14' | 'summer'>('assess3')
  const [testLang, setTestLang] = useState<string>(locale)
  const [testSent, setTestSent] = useState<string | null>(null)

  const load = useCallback(async (d: number) => {
    const r = await fetch(`/api/admin/follow-ups?days=${d}`, { cache: 'no-store' }).catch(() => null)
    if (!r || !r.ok) { setAlertMsg(t('admin.followUps.err.load')); return }
    const j = await r.json()
    setData(j)
    setYear(y => y ?? j.summerYear)
  }, [t])
  useEffect(() => { const id = setTimeout(() => load(days), 0); return () => clearTimeout(id) }, [load, days])

  const day = (d: string) => new Date(d + 'T12:00:00Z').toLocaleDateString(dateTag(locale), { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' })

  async function post(body: object) {
    setBusy(true)
    const r = await fetch('/api/admin/follow-ups', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null)
    setBusy(false)
    if (!r || !r.ok) { setAlertMsg(t('admin.followUps.err.failed')); return null }
    return r.json()
  }
  async function sendTest() {
    setTestSent(null)
    const j = await post({ action: 'test', kind: testKind, lang: testLang })
    if (j) setTestSent(j.to)
  }
  async function preview() {
    setResult(null); setConfirming(false)
    const j = await post({ action: 'summer_preview', year })
    if (j) setSummer(j.families || [])
  }
  async function send() {
    const j = await post({ action: 'summer_send', year })
    if (!j) return
    setResult(j); setConfirming(false)
    const p = await post({ action: 'summer_preview', year })
    if (p) setSummer(p.families || [])
  }

  if (!data) return <div className="p-8 text-gray-400 text-sm">{t('common.loading')}</div>
  const willGet = (summer || []).filter(f => f.subscribed && !f.sent)
  const thisYear = new Date().getFullYear()
  const contact = (email: string | null, phone: string | null) => [phone, email].filter(Boolean).join(' · ')
  const card = 'rounded-xl border border-[#1e3a6e] bg-[#111d38] p-4'

  return (
    <div className="p-6 md:p-8 max-w-5xl">
      <AlertModal message={alertMsg} onClose={() => setAlertMsg(null)} />
      <h1 className="text-2xl font-bold text-white">{t('admin.nav.followUps')}</h1>
      <p className="text-gray-400 text-sm mt-1 max-w-2xl">{t('admin.followUps.intro')}</p>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <select value={testKind} onChange={e => { setTestKind(e.target.value as typeof testKind); setTestSent(null) }} className="rounded-lg bg-[#0d1529] border border-[#1e3a6e] text-white p-2 text-sm">
          <option value="assess3">{t('admin.followUps.test.assess3')}</option>
          <option value="assess14">{t('admin.followUps.test.assess14')}</option>
          <option value="summer">{t('admin.followUps.test.summer')}</option>
        </select>
        <select value={testLang} onChange={e => { setTestLang(e.target.value); setTestSent(null) }} className="rounded-lg bg-[#0d1529] border border-[#1e3a6e] text-white p-2 text-sm">
          <option value="zh-Hant">繁體中文</option><option value="en">English</option><option value="zh-Hans">简体中文</option>
        </select>
        <button disabled={busy} onClick={sendTest} className="px-3 py-2 rounded-lg border border-[#c9a84c] text-[#c9a84c] text-sm font-semibold disabled:opacity-50">{t('admin.followUps.test.send')}</button>
        {testSent && <span role="status" className="text-emerald-300 text-sm">{t('admin.followUps.test.sent', { to: testSent })}</span>}
      </div>

      <section className="mt-8">
        <h2 className="text-white font-semibold">{t('admin.followUps.assessTitle', { n: data.assess.length })}</h2>
        <p className="text-gray-500 text-xs mt-1 mb-3">{t('admin.followUps.assessNote')}</p>
        {data.assess.length === 0 && <p className="text-gray-500 text-sm">{t('admin.followUps.none')}</p>}
        <div className="space-y-2">
          {data.assess.map(a => (
            <div key={a.id} className={card}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-white text-sm font-semibold">{a.student} <span className="text-gray-400 font-normal">· {a.family}</span></p>
                  <p className="text-gray-300 text-sm mt-1">{t('admin.followUps.assessedLine', { date: day(a.assessedOn), n: a.daysSince })}
                    {a.course ? ` · ${t('assess.course.' + a.course)}${a.frequency ? ` ${t('assess.freq.' + a.frequency)}` : ''}` : ''}</p>
                  <p className="text-gray-500 text-xs mt-1 break-all">{contact(a.email, a.phone)}</p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {[3, 14].map(s => (
                    <span key={s} className={`px-2 py-0.5 rounded-md border text-xs ${a.sent.includes(s) ? 'border-emerald-500/40 text-emerald-300' : 'border-gray-600 text-gray-400'}`}>
                      {t(a.sent.includes(s) ? 'admin.followUps.sentDay' : 'admin.followUps.notSentDay', { n: s })}
                    </span>
                  ))}
                  {!a.subscribed && <span className="px-2 py-0.5 rounded-md border border-amber-500/40 text-amber-300 text-xs">{t('admin.followUps.unsubscribed')}</span>}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-10">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-white font-semibold">{t('admin.followUps.lapsedTitle', { n: data.lapsed.length })}</h2>
          <div className="flex gap-1.5">
            {DAYS.map(d => (
              <button key={d} onClick={() => setDays(d)}
                className={`px-3 py-1.5 rounded-lg border text-sm ${days === d ? 'border-[#c9a84c] bg-[#c9a84c]/15 text-[#c9a84c]' : 'border-[#1e3a6e] text-gray-400'}`}>
                {t('admin.followUps.daysChoice', { n: d })}
              </button>
            ))}
          </div>
        </div>
        <p className="text-gray-500 text-xs mt-1 mb-3">{t('admin.followUps.lapsedNote')}</p>
        {data.lapsed.length === 0 && <p className="text-gray-500 text-sm">{t('admin.followUps.none')}</p>}
        <div className="space-y-2">
          {data.lapsed.map(f => (
            <div key={f.parentId} className={card}>
              <p className="text-white text-sm font-semibold">{f.family} <span className="text-gray-400 font-normal">· {f.swimmers.join(' & ')}</span></p>
              <p className="text-gray-300 text-sm mt-1">{t('admin.followUps.lastLesson', { date: day(f.lastLesson), n: f.daysSince })}</p>
              <p className="text-gray-500 text-xs mt-1 break-all">{contact(f.email, f.phone)}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-white font-semibold">{t('admin.followUps.summerTitle')}</h2>
        <p className="text-gray-500 text-xs mt-1 mb-3 max-w-2xl">{t('admin.followUps.summerNote')}</p>
        <div className="flex flex-wrap items-center gap-2">
          <select value={year ?? ''} onChange={e => { setYear(Number(e.target.value)); setSummer(null); setResult(null) }}
            className="rounded-lg bg-[#0d1529] border border-[#1e3a6e] text-white p-2 text-sm">
            {[thisYear, thisYear - 1, thisYear - 2].map(y => <option key={y} value={y}>{t('admin.followUps.summerOf', { year: y })}</option>)}
          </select>
          <button disabled={busy} onClick={preview} className="px-3 py-2 rounded-lg bg-[#c9a84c] text-[#111d38] text-sm font-semibold disabled:opacity-50">{t('admin.followUps.summerPreview')}</button>
        </div>
        {result && (
          <p role="status" className="mt-3 text-sm text-emerald-300">{t('admin.followUps.summerResult', { sent: result.sent, already: result.alreadySent, off: result.notSubscribed, failed: result.failed })}</p>
        )}
        {summer && (
          <div className={`${card} mt-4`}>
            <p className="text-white text-sm font-semibold">{t('admin.followUps.summerCount', { n: willGet.length, total: summer.length })}</p>
            <div className="mt-2 space-y-1 max-h-64 overflow-y-auto">
              {summer.map((f, i) => (
                <p key={i} className="text-sm text-gray-300">
                  {f.family} <span className="text-gray-500">· {f.swimmers.join(' & ')}</span>
                  {f.sent ? <span className="text-emerald-300 text-xs"> · {t('admin.followUps.alreadySent')}</span> : !f.subscribed ? <span className="text-amber-300 text-xs"> · {t('admin.followUps.unsubscribed')}</span> : null}
                </p>
              ))}
            </div>
            {willGet.length > 0 && (!confirming ? (
              <button onClick={() => setConfirming(true)} className="mt-4 px-4 py-2 rounded-lg bg-[#c9a84c] text-[#111d38] text-sm font-semibold">{t('admin.followUps.summerSend', { n: willGet.length })}</button>
            ) : (
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <span className="text-sm text-gray-200">{t('admin.followUps.summerConfirm', { n: willGet.length })}</span>
                <button disabled={busy} onClick={() => setConfirming(false)} className="px-3 py-1.5 rounded-lg border border-gray-600 text-gray-300 text-sm">{t('common.cancel')}</button>
                <button disabled={busy} onClick={send} className="px-3 py-1.5 rounded-lg bg-[#c9a84c] text-[#111d38] text-sm font-semibold disabled:opacity-50">{busy ? t('common.loading') : t('admin.followUps.summerSendNow')}</button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
