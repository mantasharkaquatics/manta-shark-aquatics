'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import AlertModal from '@/components/AlertModal'
import { tDb, type Locale } from '@/lib/i18n'
import { useT, useTFor } from '@/lib/i18n/provider'
import { LEVEL_COLORS, stageNameKey } from '@/lib/levels'

type View = {
  lang: Locale
  family: { id: string; name: string; firstName: string | null; email: string | null; phone: string | null; language: string | null }
  cards: { id: string; name: string; dob: string | null; gender: string | null; level: number | null; stage: number | null; percent: number; credit: { lessons: number; needed: number; daysLeft: number } | null; lastReport: string | null }[]
  wallet: { purchased: number; granted: number; arrears: number; grantedNext: { points: number; date: string } | null; lessonsCompleted: number }
  vouchers: { id: string; swimmers: string[]; courseSlug: string; minutes: number; reason: string; expiresOn: string; usableFrom?: string | null }[]
  fixedClasses: { id: string; swimmers: string[]; courseSlug: string; courseTypeId: string | null; courseName: string; minutes: number; weekday: number; time: string; coach: string; left: number; last: string | null }[]
  upcoming: { date: string; start: string; end: string; course: string; courseName: string; courseTypeId: string | null; coach: string; swimmers: string[]; status: string; fixed: boolean; makeUp: boolean }[]
}

const INTL: Record<string, string> = { en: 'en-US', 'zh-Hant': 'zh-TW', 'zh-Hans': 'zh-CN' }
const REASON: Record<string, string> = { leave: 'admin.members.fv.reason.leave', grace: 'admin.members.fv.reason.grace', admin: 'admin.members.fv.reason.admin', end_of_term: 'admin.members.fv.reason.end_of_term' }

/**
 * A family as they see their own home page: the swimmers' cards, points,
 * make-up vouchers, fixed classes and upcoming lessons, in their language (or
 * any of the three). Nothing here books or cancels for them; the two desk
 * actions -- voiding a voucher, and the links to issue one or end a class --
 * are marked as the desk's, outside the family's picture.
 */
export default function FamilyViewClient({ parentId }: { parentId: string }) {
  const t = useT()
  const [view, setView] = useState<View | null>(null)
  const [lang, setLang] = useState<Locale | null>(null)
  const [alertMsg, setAlertMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async (l?: Locale | null) => {
    const r = await fetch(`/api/admin/family-view?parent_id=${encodeURIComponent(parentId)}${l ? `&lang=${l}` : ''}`).catch(() => null)
    if (!r || !r.ok) { setAlertMsg(t('admin.members.fv.err.load')); return }
    const j = await r.json()
    setView(j); setLang(j.lang)
    // t is left out on purpose: re-running load on an admin language switch
    // would reset the family-language preview the admin picked.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parentId])
  useEffect(() => { load() }, [load])

  // ft: the FAMILY's language (the picture below); t: the admin's own language (the desk chrome).
  // The family's language, fetched on demand (lib/i18n/load.ts).
  const ft = useTFor((lang || 'en') as Locale, true)
  const loc = INTL[lang || 'en'] || 'en-US'
  const day = (d: string, o: Intl.DateTimeFormatOptions) => new Date(d + 'T12:00:00Z').toLocaleDateString(loc, { ...o, timeZone: 'UTC' })
  const time = (hm: string) => { const [h, m] = hm.split(':').map(Number); return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}` }
  const kind = (slug: string, minutes: number) => ft('voucher.kind.' + slug + (slug === '1on1' ? '.' + (minutes === 60 ? 60 : 30) : ''))
  const age = (dob: string | null) => {
    if (!dob) return ft('dash.ageUnknown')
    const b = new Date(dob + 'T12:00:00Z'), n = new Date()
    let a = n.getFullYear() - b.getUTCFullYear()
    if (n.getMonth() < b.getUTCMonth() || (n.getMonth() === b.getUTCMonth() && n.getDate() < b.getUTCDate())) a--
    return ft('dash.age', { n: a })
  }

  async function voidVoucher(id: string) {
    const reason = window.prompt(t('admin.members.fv.voidPrompt'))
    if (!reason || !reason.trim()) return
    setBusy(id)
    const r = await fetch('/api/admin/vouchers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'void', id, reason }) }).catch(() => null)
    setBusy(null)
    if (!r || !r.ok) { const j = r ? await r.json().catch(() => ({})) : {}; setAlertMsg(j.error || t('admin.members.fv.err.save')); return }
    await load(lang)
  }

  if (!view || !lang) return <div className="p-8 text-gray-400 text-sm">{t('common.loading')}</div>
  const days = [...new Set(view.upcoming.map(u => u.date))]

  return (
    <div className="p-6 md:p-8 max-w-5xl">
      <AlertModal message={alertMsg} onClose={() => setAlertMsg(null)} />
      <Link href="/admin/members" className="text-sm text-gray-400 hover:text-[#c9a84c]">{t('admin.members.fv.back')}</Link>
      <div className="flex flex-wrap items-end justify-between gap-4 mt-2 mb-4">
        <div>
          <h1 className="text-2xl font-bold text-white">{view.family.name} <span className="text-gray-400 font-normal text-lg">{t('admin.members.fv.parentView')}</span></h1>
          <p className="text-gray-400 text-sm mt-1">{t('admin.members.fv.intro')} {view.family.email}{view.family.phone ? ` · ${view.family.phone}` : ''}</p>
        </div>
        <div className="flex gap-1.5" aria-label={t('admin.members.fv.language')}>
          {(['zh-Hant', 'zh-Hans', 'en'] as Locale[]).map(l => (
            <button key={l} onClick={() => load(l)}
              className={`px-3 py-1.5 rounded-lg border text-sm ${lang === l ? 'border-[#c9a84c] bg-[#c9a84c]/15 text-[#c9a84c]' : 'border-[#1e3a6e] text-gray-400'}`}>
              {t(`admin.members.fv.langShort.${l}`)}{view.family.language === l ? ' ·' : ''}
            </button>
          ))}
        </div>
      </div>

      {/* The family's picture, in the dashboard's own colours. */}
      <div className="fv">
        <style>{CSS}</style>
        <div className="fv-cards">
          {view.cards.map(c => (
            <div key={c.id} className="fv-card" style={{ ['--lv' as string]: c.level ? (LEVEL_COLORS[String(c.level)] || '#9fb8e6') : '#9fb8e6' } as React.CSSProperties}>
              <span className="fv-brand">MANTA SHARK · SWIMMER</span>
              <div className="fv-name">{c.name}</div>
              <div className="fv-age">{age(c.dob)}{c.gender === 'male' ? ' · 👦' : c.gender === 'female' ? ' · 👧' : ''}</div>
              {c.level && c.stage ? (
                <>
                  <span className="fv-lv"><i />{ft('level.badge', { n: c.level, name: ft(`level.${c.level}.name`) })} · {ft('dash.stageN', { n: c.stage })}</span>
                  <div className="fv-bar"><i style={{ width: c.percent + '%' }} /></div>
                  <div className="fv-meta"><span>{ft(stageNameKey(c.level, c.stage))}</span><b>{c.percent}%</b></div>
                </>
              ) : <span className="fv-lv"><i />{ft('dash.pendingAssessment')}</span>}
              {c.lastReport && <div className="fv-line">📊 {ft('monthly.cardLine', { month: day(c.lastReport, { month: 'long' }) })}</div>}
              {c.credit && <div className="fv-credit">🎁 {ft('assess.credit.cardLine', { done: c.credit.lessons, n: c.credit.needed, days: c.credit.daysLeft })}</div>}
            </div>
          ))}
        </div>

        <div className="fv-pts">
          <span><b>{view.wallet.purchased.toLocaleString()}</b> {ft('dash.pointsUnit')}</span>
          {view.wallet.granted > 0 && <span className="fv-gift">{ft('dash.pointsGift', { n: view.wallet.granted.toLocaleString() })}</span>}
          {view.wallet.grantedNext && <span className="fv-note">{view.wallet.grantedNext.points} · {day(view.wallet.grantedNext.date.slice(0, 10), { month: 'short', day: 'numeric' })}</span>}
          {view.wallet.arrears > 0 && <span className="fv-owe">−{view.wallet.arrears}</span>}
        </div>

        <h2 className="fv-h">🎟 {ft('voucher.sheetTitle')}</h2>
        {view.vouchers.length === 0 ? <p className="fv-empty">{ft('voucher.none')}</p> : (
          <div className="fv-list">
            {view.vouchers.map(v => (
              <div key={v.id} className="fv-row">
                <div>
                  <div className="fv-row-main">{v.swimmers.join(' & ')} · {kind(v.courseSlug, v.minutes)}</div>
                  <div className="fv-row-sub">{v.usableFrom ? ft('voucher.window', { from: day(v.usableFrom, { month: 'short', day: 'numeric' }), to: day(v.expiresOn, { month: 'short', day: 'numeric' }) }) : ft('voucher.useBy', { date: day(v.expiresOn, { month: 'short', day: 'numeric' }) })} <span className="fv-desk-note">{t('admin.members.fv.deskNote', { reason: REASON[v.reason] ? t(REASON[v.reason]) : v.reason })}</span></div>
                </div>
                <button disabled={busy === v.id} onClick={() => voidVoucher(v.id)} className="fv-desk">{t('admin.members.fv.void')}</button>
              </div>
            ))}
          </div>
        )}

        <h2 className="fv-h">{ft('dash.tag.fixed')}</h2>
        {view.fixedClasses.length === 0 ? <p className="fv-empty">—</p> : (
          <div className="fv-list">
            {view.fixedClasses.map(f => (
              <div key={f.id} className="fv-row">
                <div>
                  <div className="fv-row-main">{f.swimmers.join(' & ')} · {f.courseTypeId ? tDb(lang, 'course_types', f.courseTypeId, f.courseName) : f.courseName}{f.minutes === 60 ? ' · ' + ft('booking.lenMin', { n: 60 }) : ''}</div>
                  <div className="fv-row-sub">{ft('fixed.line', { weekday: day(`2026-01-${String(4 + f.weekday).padStart(2, '0')}`, { weekday: 'long' }), time: time(f.time), coach: f.coach, n: f.left, date: f.last ? day(f.last, { month: 'short', day: 'numeric' }) : '—' })}</div>
                </div>
                <Link href="/admin/fixed-classes" className="fv-desk">{t('admin.members.fv.end')}</Link>
              </div>
            ))}
          </div>
        )}

        <h2 className="fv-h">{ft('dash.upcomingLessons')}</h2>
        {days.length === 0 ? <p className="fv-empty">—</p> : days.map(d => (
          <div key={d} className="fv-day">
            <div className="fv-day-h">{day(d, { month: 'long', day: 'numeric', weekday: 'long' })}</div>
            {view.upcoming.filter(u => u.date === d).map((u, i) => (
              <div key={i} className="fv-lesson">
                <div className="fv-lesson-top">
                  <span>{u.course === 'assessment' ? ft('common.assessment') : u.courseTypeId ? tDb(lang, 'course_types', u.courseTypeId, u.courseName) : u.courseName} · {time(u.start)} — {time(u.end)} · {ft('dash.up.coach', { name: u.coach })}</span>
                  <span className="fv-status">{ft('dash.status.' + u.status)}</span>
                </div>
                <div className="fv-lesson-who">{u.swimmers.join(', ')}
                  {u.fixed && <span className="fv-tag">{ft('dash.tag.fixed')}</span>}
                  {u.makeUp && <span className="fv-tag fv-tag-mu">{ft('dash.tag.makeUp')}</span>}
                </div>
              </div>
            ))}
          </div>
        ))}
        <p className="fv-foot">{t('admin.members.fv.deskActions')} <Link href="/admin/vouchers">{t('admin.members.fv.issueVoucher')}</Link> · <Link href="/admin/fixed-classes">{t('admin.members.fv.fixedClasses')}</Link></p>
      </div>
    </div>
  )
}

// The dashboard's member-card look (app/(public)/dashboard), on its light page.
const CSS = `
.fv { background: #eef3f9; border-radius: 18px; padding: 22px; color: #16294a; font-family: inherit }
.fv-cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 14px }
.fv-card { position: relative; overflow: hidden; border-radius: 20px; padding: 18px; color: #fff; min-height: 180px;
  background: linear-gradient(145deg, #1d3f7c, #12254a 65%); box-shadow: 0 12px 26px rgba(18,37,74,0.22); display: flex; flex-direction: column }
.fv-card::before { content: ''; position: absolute; right: -40px; bottom: -50px; width: 200px; height: 200px; border-radius: 50%;
  pointer-events: none; background: radial-gradient(closest-side, color-mix(in srgb, var(--lv) 55%, transparent), transparent) }
.fv-card > * { position: relative }
.fv-brand { font-size: 10px; font-weight: 800; letter-spacing: 2px; color: rgba(255,255,255,0.6) }
.fv-name { font-size: 24px; font-weight: 900; margin: 4px 0 2px }
.fv-age { font-size: 12.5px; color: rgba(255,255,255,0.68) }
.fv-lv { display: inline-flex; align-items: center; gap: 7px; align-self: flex-start; margin-top: 12px; background: rgba(255,255,255,0.12); border-radius: 999px; padding: 5px 11px; font-size: 12.5px; font-weight: 800 }
.fv-lv i { width: 9px; height: 9px; border-radius: 50%; background: var(--lv) }
.fv-bar { height: 6px; border-radius: 3px; background: rgba(255,255,255,0.15); margin-top: 14px; overflow: hidden }
.fv-bar i { display: block; height: 100%; background: #f7b733; border-radius: 3px }
.fv-meta { display: flex; justify-content: space-between; gap: 10px; margin-top: 6px; font-size: 11.5px; color: rgba(255,255,255,0.7) }
.fv-meta b { color: #f7b733 }
.fv-line { margin-top: 12px; border: 1px solid rgba(159,184,230,0.45); background: rgba(159,184,230,0.14); border-radius: 10px; padding: 8px 12px; font-size: 13px; font-weight: 700; color: #e6eeff }
.fv-credit { margin-top: 10px; border: 1px solid rgba(94,214,150,0.45); background: rgba(94,214,150,0.12); border-radius: 10px; padding: 8px 12px; font-size: 13px; font-weight: 700; color: #d6f5e3 }
.fv-pts { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; margin-top: 16px; background: #fff; border-radius: 999px; padding: 10px 18px; width: fit-content; box-shadow: 0 4px 12px rgba(18,37,74,0.08) }
.fv-pts b { font-size: 18px; color: #12254a }
.fv-gift { font-size: 12px; font-weight: 800; color: #1f7a57; background: #e6f4ee; border-radius: 999px; padding: 3px 9px }
.fv-note { font-size: 12px; color: #56647d }
.fv-owe { font-size: 12px; font-weight: 800; color: #c0392b }
.fv-h { font-size: 15px; font-weight: 800; margin: 22px 0 8px; color: #12254a }
.fv-empty { font-size: 13px; color: #56647d }
.fv-list { display: flex; flex-direction: column; gap: 8px }
.fv-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; background: #fff; border: 1px solid #e3ebf6; border-radius: 12px; padding: 11px 14px }
.fv-row-main { font-size: 14px; font-weight: 700 }
.fv-row-sub { font-size: 12.5px; color: #56647d; margin-top: 2px }
.fv-desk-note { color: #9aa6ba }
.fv-desk { flex-shrink: 0; font-size: 12px; font-weight: 700; color: #8a6d1c; border: 1px dashed #c9a84c; border-radius: 8px; padding: 5px 10px; background: #fffaf0; cursor: pointer }
.fv-day { margin-bottom: 10px }
.fv-day-h { font-size: 13px; font-weight: 800; color: #12254a; margin: 10px 0 6px }
.fv-lesson { background: #fff; border: 1px solid #e3ebf6; border-radius: 12px; padding: 11px 14px; margin-bottom: 6px }
.fv-lesson-top { display: flex; justify-content: space-between; gap: 10px; font-size: 12.5px; color: #56647d }
.fv-status { font-size: 11px; font-weight: 800; color: #1f7a57 }
.fv-lesson-who { font-size: 15px; font-weight: 800; color: #12254a; margin-top: 3px }
.fv-tag { margin-left: 8px; font-size: 10.5px; font-weight: 700; padding: 2px 7px; border-radius: 999px; color: #2050a0; background: #2050a014; border: 1px solid #2050a040; vertical-align: 2px }
.fv-tag-mu { color: #1f7a57; background: #e6f4ee; border-color: #b7e0cc }
.fv-foot { margin-top: 18px; font-size: 12px; color: #56647d }
.fv-foot a { color: #8a6d1c; text-decoration: underline }
`
