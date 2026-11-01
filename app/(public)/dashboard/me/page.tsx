'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useLocale, useSetLocale, useT, rememberExplicitLocale, clearExplicitLocale } from '@/lib/i18n/provider'
import { LOCALES, tDb, type Locale } from '@/lib/i18n'
import { ACCT_CSS } from '@/components/brand/AcctStyles'
import PushSettings from '@/components/PushSettings'
import { myParentId, myFamilyRole } from '@/lib/my-parent'
import { BRAND } from '@/lib/brand'

/* 我的, the app's last tab (owner, 2026-10-27): everything about the family
   that is not a lesson -- the account, points and receipts, notifications,
   booking with another family, referring a friend, the suggestion box -- and
   the school's own pages (programs, prices, policies), which the app has no
   website bar for. Language and signing out are here too. In a browser the
   page works as well; nothing links to it there.
   Owner, 2026-11-01 (version 2): the family's money is all here -- the points
   at the top (tap: the statement; 儲值: top up) and 我的方案 under them, each
   plan a row that goes where it is used (a fixed class to its page, the
   make-up vouchers to booking with one, the swim team to its card). The
   home tab no longer shows any of it. */

const css = `
.me-who { display: flex; align-items: center; gap: 14px; }
.me-av { width: 48px; height: 48px; border-radius: 50%; background: ${BRAND.navy}; color: #fff; display: grid; place-items: center;
  font-weight: 900; font-size: 19px; flex-shrink: 0; }
.me-who b { display: block; font-size: 17px; color: ${BRAND.navy}; }
.me-who small { display: block; font-size: 13.5px; color: ${BRAND.mute}; overflow-wrap: anywhere; }
.me-list { background: #fff; border: 1px solid ${BRAND.line}; border-radius: 16px; overflow: hidden; }
.me-list a { display: flex; align-items: center; gap: 12px; padding: 15px 16px; font-size: 15.5px; font-weight: 700; color: ${BRAND.ink};
  text-decoration: none; border-bottom: 1px solid #eef2f8; }
.me-list a:last-child { border-bottom: 0; }
.me-list a:active { background: #f4f7fb; }
.me-list a:focus-visible { outline: 2px solid ${BRAND.blue}; outline-offset: -2px; }
.me-list .ico { width: 24px; text-align: center; flex-shrink: 0; }
.me-list .go { margin-left: auto; color: #b4bfd0; }
.me-cap { font-size: 12.5px; font-weight: 800; letter-spacing: .08em; color: ${BRAND.mute}; margin: 8px 4px -4px; }
.me-lang { display: flex; gap: 8px; }
.me-lang button { flex: 1; padding: 11px 0; border-radius: 10px; border: 1px solid ${BRAND.line}; background: #fff; font: inherit; font-weight: 800;
  font-size: 15px; color: ${BRAND.ink}; cursor: pointer; }
.me-lang button[aria-pressed="true"] { background: ${BRAND.navy}; border-color: ${BRAND.navy}; color: #fff; }
.me-out { width: 100%; padding: 14px; border-radius: 14px; border: 1px solid ${BRAND.line}; background: #fff; font: inherit; font-weight: 800;
  font-size: 15.5px; color: #c0392b; cursor: pointer; }
.me-lang button:focus-visible, .me-out:focus-visible { outline: 2px solid ${BRAND.blue}; outline-offset: 2px; }
.me-wal { display: flex; align-items: center; gap: 12px; padding: 14px 14px 14px 18px; border-radius: 18px; color: #fff;
  background: linear-gradient(135deg, ${BRAND.navy}, #1d3f7a); }
.me-wal-main { flex: 1; min-width: 0; color: #fff; text-decoration: none; }
.me-wal-main small { display: block; font-size: 12.5px; font-weight: 800; color: #bcd0f0; }
.me-wal-main b { font-size: 26px; font-weight: 900; font-variant-numeric: tabular-nums; }
.me-wal-main .u { font-size: 14px; font-weight: 800; margin-left: 4px; }
.me-wal-main .g { display: inline-block; margin-left: 8px; vertical-align: 3px; font-size: 12px; font-weight: 800; color: #1f7a57; background: #e6f6ec;
  border-radius: 999px; padding: 2px 8px; }
.me-wal-main .low { display: block; font-size: 12.5px; font-weight: 800; color: #ffd28a; margin-top: 2px; }
.me-wal-main .owe { display: block; font-size: 12.5px; font-weight: 800; color: #ffb4ab; margin-top: 2px; }
.me-wal-buy { flex: none; padding: 10px 18px; border-radius: 999px; background: #f09800; color: ${BRAND.navy}; font-weight: 900; font-size: 15px;
  text-decoration: none; }
.me-wal-main:focus-visible, .me-wal-buy:focus-visible { outline: 2px solid #f7b733; outline-offset: 3px; }
.me-list .tx { min-width: 0; }
.me-list .tx small { display: block; font-size: 13px; font-weight: 600; color: ${BRAND.mute}; margin-top: 2px; }
.me-list .tx small.soon { color: #a36100; font-weight: 800; }
.me-list .tx small.bad { color: #c0392b; font-weight: 800; }
.me-list .act { margin-left: auto; flex-shrink: 0; font-size: 13.5px; font-weight: 800; color: ${BRAND.blue}; }
.me-list .act.renew { color: #a36100; }
`

type Row = { href: string; ico: string; label: string }
type Wallet = { balance: number; balancePurchased: number; balanceGranted: number; arrears: number; runway?: { weeksLeft: number } | null }
type Fixed = { id: string; weekday: number; time: string; coachName: string; left: number; last: string | null; renewOpen: boolean; studentNames: string[] }
type Voucher = { id: string; studentId: string; student2Id: string | null; studentNames: string[]; expiresOn: string }
type Team = { id: string; student_id: string; student_name?: string; tier_name?: string; team_tier_id?: string | null; status?: string; is_prepaid?: boolean; expires_at?: string | null }

const todayLA = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' })
const plusDays = (d: string, n: number) => { const x = new Date(d + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10) }
const time12 = (t: string) => { const [h, m] = t.split(':').map(Number); return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}` }

export default function MePage() {
  const t = useT()
  const locale = useLocale()
  const setLocale = useSetLocale()
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const [me, setMe] = useState<{ name: string; email: string } | null>(null)
  const [parentId, setParentId] = useState<string | null>(null)
  const [role, setRole] = useState<'main' | 'full' | 'viewer' | null>(null)
  const [wallet, setWallet] = useState<Wallet | null>(null)
  const [plans, setPlans] = useState<{ fixed: Fixed[]; vouchers: Voucher[]; team: Team[]; at: number } | null>(null)

  useEffect(() => {
    let live = true
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/login?next=/dashboard/me'); return }
      const [pid, r] = await Promise.all([myParentId(supabase, user.id), myFamilyRole(supabase)])
      let name = ''
      if (pid) {
        const { data } = await supabase.from('parents').select('first_name, last_name').eq('id', pid).maybeSingle()
        name = [data?.first_name, data?.last_name].filter(Boolean).join(' ')
      }
      if (!live) return
      setParentId(pid); setRole(r)
      setMe({ name, email: user.email || '' })
      const get = (u: string) => fetch(u, { cache: 'no-store' }).then(x => (x.ok ? x.json() : null)).catch(() => null)
      const [w, f, v, tm] = await Promise.all([r === 'viewer' ? null : get('/api/parent/wallet'), get('/api/parent/fixed-classes'),
        get('/api/parent/vouchers'), get('/api/parent/team-memberships')])
      if (!live) return
      if (w) setWallet(w)
      setPlans({ fixed: f?.classes || [], vouchers: v?.vouchers || [], team: tm?.memberships || [], at: Date.now() })
    })().catch(() => {})
    return () => { live = false }
  }, [supabase, router])

  const viewer = role === 'viewer'
  const family: Row[] = [
    { href: '/dashboard/account', ico: '👤', label: t('app.me.account') },
    ...(viewer ? [] : [
      { href: '/dashboard/partnerships', ico: '👥', label: t('quick.partnerships') },
      { href: '/dashboard?points=refer', ico: '🎁', label: t('dash.more.refer') },
    ]),
    { href: '/dashboard?suggest=1', ico: '💬', label: t('suggest.link') },
  ]
  const school: Row[] = [
    { href: '/programs', ico: '🏊', label: t('page.programs') },
    { href: '/levels', ico: '🪜', label: t('page.levels') },
    { href: '/plans', ico: '🏷️', label: t('page.plans') },
    { href: '/faq', ico: '❓', label: t('page.faq') },
    { href: '/about', ico: '🦈', label: t('page.about') },
    { href: '/policies', ico: '📄', label: t('page.policies') },
  ]

  // As the site bar's language menu does (components/Navbar.tsx): the main
  // account's saved language follows; anyone else's choice is kept on this
  // phone, since only the main account may change the account.
  async function changeLocale(next: Locale) {
    setLocale(next)
    if (role !== 'main' || !parentId) { rememberExplicitLocale(next); return }
    clearExplicitLocale()
    const { error } = await supabase.from('parents').update({ preferred_language: next }).eq('id', parentId)
    if (error) console.warn('[i18n] failed to save preferred_language', error.message)
  }

  async function signOut() {
    // This phone only, as the site bar does.
    await supabase.auth.signOut({ scope: 'local' })
    router.replace('/login')
  }

  /* 我的方案: one row per fixed class, one per child's make-up vouchers, one
     per swim-team place -- each going where it is used. */
  const shortDate = (d: string) => new Date(d + 'T12:00:00Z').toLocaleDateString(locale === 'en' ? 'en-US' : locale, { month: 'short', day: 'numeric', timeZone: 'UTC' })
  const planRows: { key: string; href: string; ico: string; label: string; sub: string; subCls?: string; act: string; actCls?: string }[] = []
  if (plans) {
    for (const f of plans.fixed) planRows.push({
      key: 'f' + f.id, href: `/dashboard/fixed-class/${f.id}${f.renewOpen ? '?renew=1' : ''}`, ico: '📌',
      label: `${t('dash.tag.fixed')} · ${t('dash.plan.when', { weekday: new Date(`2026-01-${String(4 + f.weekday).padStart(2, '0')}T12:00:00Z`).toLocaleDateString(locale === 'en' ? 'en-US' : locale, { weekday: 'long', timeZone: 'UTC' }), time: time12(f.time) })}`,
      sub: `${f.studentNames.join(' & ')} · ${t(f.left === 1 ? 'dash.plan.leftOne' : 'dash.plan.left', { n: f.left, date: f.last ? shortDate(f.last) : '—' })}`,
      act: t(f.renewOpen ? 'fixed.renew' : 'fixed.manage'), actCls: f.renewOpen ? 'renew' : undefined,
    })
    const byOwner = new Map<string, Voucher[]>()
    for (const v of plans.vouchers) { const k = [v.studentId, v.student2Id].filter(Boolean).sort().join('+'); byOwner.set(k, [...(byOwner.get(k) || []), v]) }
    for (const [k, vs] of byOwner) {
      const first = [...vs].sort((a, b) => a.expiresOn.localeCompare(b.expiresOn))[0]
      planRows.push({
        key: 'v' + k, href: `/booking?voucher=${first.id}`, ico: '🎟',
        label: `${t(vs.length === 1 ? 'dash.plan.voucherRowOne' : 'dash.plan.voucherRow', { n: vs.length })} · ${first.studentNames.join(' & ')}`,
        sub: t(vs.length === 1 ? 'dash.plan.expires' : 'dash.plan.firstExpires', { date: shortDate(first.expiresOn) }),
        subCls: first.expiresOn <= plusDays(todayLA(), 7) ? 'soon' : undefined, act: t('voucher.book'),
      })
    }
    for (const m of plans.team) {
      const exp = m.is_prepaid && m.expires_at ? new Date(m.expires_at) : null
      const lapsed = !!m.is_prepaid && (m.status === 'expired' || (!!exp && exp.getTime() < plans.at))
      const failed = !viewer && !m.is_prepaid && m.status === 'past_due'
      const expDate = exp ? exp.toLocaleDateString(locale === 'en' ? 'en-US' : locale, { month: 'short', day: 'numeric' }) : ''
      planRows.push({
        key: 't' + m.id, href: `/dashboard?team=${m.student_id}`, ico: '🏊',
        label: `${t('team.title')}${m.tier_name ? ' · ' + (m.team_tier_id ? tDb(locale, 'team_tiers', m.team_tier_id, m.tier_name) : m.tier_name) : ''}${m.student_name ? ' · ' + m.student_name : ''}`,
        sub: failed ? t('dash.plan.teamPastDue') : exp ? t(lapsed ? 'team.expired' : 'team.paidThru', { date: expDate }) : t('team.active'),
        subCls: failed || lapsed ? 'bad' : undefined, act: t(viewer ? 'voucher.lineLink' : 'team.manage'),
      })
    }
  }

  const list = (rows: Row[]) => (
    <nav className="me-list">
      {rows.map(r => (
        <Link key={r.href} href={r.href}>
          <span className="ico" aria-hidden="true">{r.ico}</span>{r.label}<span className="go" aria-hidden="true">›</span>
        </Link>
      ))}
    </nav>
  )

  return (
    <div className="ac-root">
      <style>{ACCT_CSS + css}</style>
      <div className="ac-wrap">
        <div className="ac-stack">
          <section className="ac-card me-who" aria-live="polite">
            <span className="me-av" aria-hidden="true">{(me?.name || me?.email || ' ').charAt(0).toUpperCase()}</span>
            <div style={{ minWidth: 0 }}>
              <b>{me ? (me.name || me.email) : t('common.loading')}</b>
              {me?.name && <small>{me.email}</small>}
            </div>
          </section>

          {/* The family's points: tap for the statement, 儲值 to top up. */}
          {!viewer && wallet && (() => {
            const owe = wallet.arrears > 0 || wallet.balance < 0
            return (
              <section className="me-wal" aria-label={t('points.card.title')}>
                <Link href="/dashboard?points=1" className="me-wal-main">
                  <small>{t('points.card.title')}</small>
                  <b>{wallet.balancePurchased.toLocaleString()}</b><span className="u">{t('dash.pointsUnit')}</span>
                  {wallet.balanceGranted > 0 && <span className="g">{t('dash.pointsGift', { n: wallet.balanceGranted.toLocaleString() })}</span>}
                  {owe ? <span className="owe">{t('points.card.arrearsTitle', { n: wallet.arrears.toLocaleString() })}</span>
                    : wallet.runway ? <span className="low">{t('dash.pointsLow')}</span> : null}
                </Link>
                <Link href="/plans#buy" className="me-wal-buy">{t('dash.topUp')}</Link>
              </section>
            )
          })()}
          {planRows.length > 0 && <>
            <p className="me-cap">{t('dash.plans.title')}</p>
            <nav className="me-list" aria-label={t('dash.plans.title')}>
              {planRows.map(r => (
                <Link key={r.key} href={r.href}>
                  <span className="ico" aria-hidden="true">{r.ico}</span>
                  <span className="tx">{r.label}<small className={r.subCls}>{r.sub}</small></span>
                  <span className={'act' + (r.actCls ? ' ' + r.actCls : '')}>{r.act} ›</span>
                </Link>
              ))}
            </nav>
          </>}
          {list(family)}
          <PushSettings />

          <p className="me-cap">{t('app.me.school')}</p>
          {list(school)}

          <p className="me-cap">{t('nav.language')}</p>
          <div className="me-lang" role="group" aria-label={t('nav.language')}>
            {LOCALES.map(l => (
              <button key={l} type="button" aria-pressed={l === locale} onClick={() => changeLocale(l)}>
                {t('locale.' + l + '.native')}
              </button>
            ))}
          </div>

          <button type="button" className="me-out" onClick={signOut}>{t('nav.signOut')}</button>
        </div>
      </div>
    </div>
  )
}
