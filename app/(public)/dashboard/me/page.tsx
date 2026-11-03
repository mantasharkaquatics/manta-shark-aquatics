'use client'

import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useLocale, useT } from '@/lib/i18n/provider'
import { tDb } from '@/lib/i18n'
import { ACCT_CSS } from '@/components/brand/AcctStyles'
import { appLook } from '@/lib/native-app'
import { myParentId, myFamilyRole } from '@/lib/my-parent'
import { BRAND } from '@/lib/brand'

/* 我的, the app's last tab (owner, 2026-10-27): everything about the family
   that is not a lesson -- the account, points and receipts, notifications,
   booking with another family, referring a friend, the suggestion box -- and
   the school's own pages (programs, prices, policies), which the app has no
   website bar for. Signing out is here too; the language is the top bar's
   button, not a section here (owner, 2026-11-02). In a browser the
   page works as well; nothing links to it there.
   Owner, 2026-11-01 (version 2): the family's money is all here -- the points
   at the top (tap: the statement; 儲值: top up) and 我的方案 under them, each
   plan a row that goes where it is used (a fixed class to its page, the
   make-up vouchers to booking with one, the swim team to its card). The
   home tab no longer shows any of it. */

const css = `
.mx { max-width: 560px; margin: 0 auto; padding: 12px 16px 6px; display: flex; flex-direction: column; }
html.msa-app:has(.mx), html.msa-app:has(.mx) body { overscroll-behavior: none; }
html.msa-app body:has(.mx), html.msa-app body:has(.mx) .rn-space { background: #e9eff7; }
html.msa-app .ac-root:has(.mx) { background: #e9eff7; }
/* The member card (owner, 2026-11-03, 樣貌一 of five). */
.mx-card { position: relative; display: block; border-radius: 20px; padding: 16px 18px 14px; color: #fff; text-decoration: none; overflow: hidden;
  background: radial-gradient(120% 140% at 100% 0%, #2f5fb3 0%, #1b3570 45%, ${BRAND.navy} 100%); box-shadow: 0 10px 24px rgba(18,37,74,.25); }
.mx-card::after { content: ''; position: absolute; right: -36px; bottom: -48px; width: 170px; height: 170px; border-radius: 50%;
  border: 24px solid rgba(255,255,255,.06); pointer-events: none; }
.mx-card .t { font-size: 11px; letter-spacing: .18em; font-weight: 800; opacity: .75; }
.mx-card .n { display: block; font-size: 17px; font-weight: 800; margin-top: 6px; padding-right: 64px; overflow-wrap: anywhere; }
.mx-card .p { display: flex; align-items: baseline; flex-wrap: wrap; gap: 4px 8px; margin-top: 8px; }
.mx-card .p b { font-size: 36px; font-weight: 900; letter-spacing: -.5px; font-variant-numeric: tabular-nums; line-height: 1.05; }
.mx-card .p .u { font-size: 14px; font-weight: 800; opacity: .9; }
.mx-card .g { font-size: 12px; font-weight: 800; color: #1f7a57; background: #e6f6ec; border-radius: 999px; padding: 2px 8px; }
.mx-card .low { display: block; font-size: 12.5px; font-weight: 800; color: #ffd28a; margin-top: 4px; }
.mx-card .owe { display: block; font-size: 12.5px; font-weight: 800; color: #ffb4ab; margin-top: 4px; }
.mx-card .ft { display: flex; justify-content: space-between; gap: 10px; margin-top: 10px; font-size: 12px; opacity: .8; }
.mx-card .ft span:first-child { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mx-card .ft span:last-child { flex: none; }
.mx-qr { position: absolute; top: 14px; right: 14px; z-index: 1; width: 52px; height: 52px; border-radius: 10px; border: 0; padding: 6px;
  background: #fff; cursor: pointer; display: grid; place-items: center; }
.mx-qr svg { width: 100%; height: 100%; display: block; }
.mx-card:focus-visible, .mx-qr:focus-visible, .mx-r a:focus-visible, .mx-pl a:focus-visible, .mx-mini a:focus-visible { outline: 3px solid #f7b733; outline-offset: 2px; }
/* Four round shortcuts. */
.mx-r { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; margin: 14px 0 2px; }
.mx-r a { display: flex; flex-direction: column; align-items: center; gap: 6px; font-size: 12.5px; font-weight: 800; color: ${BRAND.ink}; text-decoration: none; }
.mx-r em { font-style: normal; display: grid; place-items: center; width: 50px; height: 50px; border-radius: 50%; background: #fff; font-size: 22px;
  box-shadow: 0 3px 10px rgba(18,37,74,.1); }
.mx-r a.amb em { background: #f09800; }
.mx-sec { display: flex; justify-content: space-between; align-items: baseline; font-size: 14px; font-weight: 800; color: ${BRAND.navy}; margin: 16px 2px 8px; }
.mx-sec small { font-size: 12px; font-weight: 700; color: ${BRAND.mute}; }
/* 我的方案: a row that slides sideways, one small card per plan. */
.mx-pl { display: flex; gap: 10px; overflow-x: auto; scroll-snap-type: x mandatory; scroll-padding-inline: 16px;
  margin: 0 -16px; padding: 2px 16px 6px; scrollbar-width: none; -webkit-overflow-scrolling: touch; }
.mx-pl::-webkit-scrollbar { display: none; }
.mx-pl a { flex: none; width: 168px; scroll-snap-align: start; background: #fff; border-radius: 16px; padding: 11px 12px; text-decoration: none;
  color: ${BRAND.ink}; border: 1px solid ${BRAND.line}; display: flex; flex-direction: column; }
.mx-pl .k { align-self: flex-start; font-size: 11px; font-weight: 800; color: ${BRAND.blue}; background: #e8eef9; border-radius: 6px; padding: 1px 7px; }
.mx-pl b { font-size: 14.5px; font-weight: 800; color: ${BRAND.navy}; margin-top: 6px; line-height: 1.3; }
.mx-pl small { font-size: 12px; color: ${BRAND.mute}; font-weight: 600; line-height: 1.45; }
.mx-pl small.soon { color: #a36100; font-weight: 800; } .mx-pl small.bad { color: #c0392b; font-weight: 800; }
.mx-pl .bar { height: 5px; border-radius: 3px; background: #e3ebf6; margin: 7px 0 5px; overflow: hidden; }
.mx-pl .bar i { display: block; height: 100%; background: #2fb36b; border-radius: 3px; }
.mx-pl .go { margin-top: auto; padding-top: 6px; font-size: 12.5px; font-weight: 800; color: ${BRAND.blue}; }
.mx-pl .go.renew { color: #a36100; }
.mx-pl a.empty { width: auto; flex: 1; align-items: center; justify-content: center; text-align: center; min-height: 92px; }
/* Four small buttons, then signing out. */
.mx-mini { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 12px; }
.mx-mini a { display: flex; align-items: center; gap: 8px; background: #fff; border-radius: 14px; padding: 12px; font-size: 14px; font-weight: 800;
  color: ${BRAND.ink}; text-decoration: none; min-width: 0; }
.mx-mini a span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mx-out { align-self: center; margin-top: 12px; padding: 8px 18px; border: 0; background: none; font: inherit; font-size: 14px; font-weight: 800;
  color: #c0392b; cursor: pointer; }
.mx-out:focus-visible { outline: 2px solid ${BRAND.blue}; outline-offset: 2px; border-radius: 8px; }
/* Whose QR, when there is more than one swimmer. */
.mx-pick { position: fixed; inset: 0; z-index: 90; background: rgba(10,22,48,.45); display: flex; align-items: flex-end; justify-content: center; }
.mx-pick > div { width: 100%; max-width: 480px; background: #fff; border-radius: 20px 20px 0 0; padding: 18px 16px calc(18px + var(--app-sab, 0px)); }
.mx-pick h2 { font-size: 17px; font-weight: 800; color: ${BRAND.navy}; margin: 0 0 12px; }
.mx-pick a, .mx-pick button { display: flex; align-items: center; justify-content: space-between; width: 100%; padding: 14px; margin-bottom: 8px; border-radius: 12px;
  background: #f4f7fb; border: 0; font: inherit; font-size: 15.5px; font-weight: 800; color: ${BRAND.ink}; text-decoration: none; cursor: pointer; }
.mx-pick button.x { justify-content: center; background: none; color: ${BRAND.mute}; margin: 0; }
/* A short phone: tighter, so it still fits. */
@media (max-height: 720px) {
  .mx { padding-top: 4px; padding-bottom: 0; }
  .mx-card { padding: 12px 16px 10px; } .mx-card .p { margin-top: 4px; } .mx-card .p b { font-size: 28px; }
  .mx-card .ft { margin-top: 6px; } .mx-qr { width: 44px; height: 44px; }
  .mx-r { margin-top: 8px; } .mx-r a { gap: 4px; font-size: 11.5px; } .mx-r em { width: 40px; height: 40px; font-size: 18px; }
  .mx-sec { margin: 8px 2px 6px; }
  .mx-pl a { padding: 9px 11px; } .mx-pl .who { display: none; } .mx-pl b { margin-top: 4px; }
  .mx-mini { margin-top: 6px; gap: 6px; } .mx-mini a { padding: 9px 12px; }
  .mx-out { margin-top: 2px; padding: 6px 18px; }
}
`

/* A plain QR mark for the card's corner: the real code is the swimmer's,
   drawn on 首頁 when it is tapped. */
const QR_MARK = (
  <svg viewBox="0 0 21 21" aria-hidden="true" shapeRendering="crispEdges">
    <path fill="#12254a" d="M0 0h7v7H0zM14 0h7v7h-7zM0 14h7v7H0z" />
    <path fill="#fff" d="M1 1h5v5H1zM15 1h5v5h-5zM1 15h5v5H1z" />
    <path fill="#12254a" d="M2 2h3v3H2zM16 2h3v3h-3zM2 16h3v3H2zM9 0h2v2H9zM8 3h2v3H8zM11 4h2v2h-2zM9 8h3v2H9zM0 9h2v2H0zM4 8h3v2H4zM14 9h3v2h-3zM18 8h3v3h-3zM9 12h2v3H9zM12 13h3v2h-3zM16 13h2v2h-2zM19 14h2v3h-2zM13 17h3v2h-3zM9 17h2v4H9zM17 18h2v3h-2zM12 19h1v2h-1z" />
  </svg>
)

type Wallet = { balance: number; balancePurchased: number; balanceGranted: number; arrears: number; runway?: { weeksLeft: number } | null }
type Fixed = { id: string; weekday: number; time: string; coachName: string; left: number; total?: number; last: string | null; renewOpen: boolean; studentNames: string[] }
type Voucher = { id: string; studentId: string; student2Id: string | null; studentNames: string[]; expiresOn: string }
type Team = { id: string; student_id: string; student_name?: string; tier_name?: string; team_tier_id?: string | null; status?: string; is_prepaid?: boolean; expires_at?: string | null }
type Kid = { id: string; full_name: string }

const todayLA = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' })
const plusDays = (d: string, n: number) => { const x = new Date(d + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10) }
const time12 = (t: string) => { const [h, m] = t.split(':').map(Number); return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}` }
const noSubscribe = () => () => {}

export default function MePage() {
  const t = useT()
  const locale = useLocale()
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const app = useSyncExternalStore(noSubscribe, appLook, () => false)
  const [me, setMe] = useState<{ name: string; email: string } | null>(null)
  const [role, setRole] = useState<'main' | 'full' | 'viewer' | null>(null)
  const [wallet, setWallet] = useState<Wallet | null>(null)
  const [kids, setKids] = useState<Kid[]>([])
  const [pickQr, setPickQr] = useState(false)
  const [plans, setPlans] = useState<{ fixed: Fixed[]; vouchers: Voucher[]; team: Team[]; at: number } | null>(null)

  useEffect(() => {
    let live = true
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/login?next=/dashboard/me'); return }
      const [pid, r] = await Promise.all([myParentId(supabase, user.id), myFamilyRole(supabase)])
      let name = ''
      let ks: Kid[] = []
      if (pid) {
        const [{ data }, { data: st }] = await Promise.all([
          supabase.from('parents').select('first_name, last_name').eq('id', pid).maybeSingle(),
          supabase.from('students').select('id, full_name').eq('parent_id', pid).eq('is_active', true).order('sort_order'),
        ])
        name = [data?.first_name, data?.last_name].filter(Boolean).join(' ')
        ks = (st || []) as Kid[]
      }
      if (!live) return
      setRole(r)
      setKids(ks)
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

  async function signOut() {
    // This phone only, as the site bar does.
    await supabase.auth.signOut({ scope: 'local' })
    router.replace('/login')
  }

  /* 我的方案: one card per fixed class, one per child's make-up vouchers, one
     per swim-team place -- each going where it is used. */
  const shortDate = (d: string) => new Date(d + 'T12:00:00Z').toLocaleDateString(locale === 'en' ? 'en-US' : locale, { month: 'short', day: 'numeric', timeZone: 'UTC' })
  type Card = { key: string; href: string; kind: string; title: string; who: string; sub: string; subCls?: string; done?: number; act: string; actCls?: string }
  const cards: Card[] = []
  if (plans) {
    for (const f of plans.fixed) cards.push({
      key: 'f' + f.id, href: `/dashboard/fixed-class/${f.id}${f.renewOpen ? '?renew=1' : ''}`, kind: t('dash.tag.fixed'),
      title: t('dash.plan.when', { weekday: new Date(`2026-01-${String(4 + f.weekday).padStart(2, '0')}T12:00:00Z`).toLocaleDateString(locale === 'en' ? 'en-US' : locale, { weekday: 'long', timeZone: 'UTC' }), time: time12(f.time) }),
      who: f.studentNames.join(' & '),
      sub: t(f.left === 1 ? 'dash.plan.leftOne' : 'dash.plan.left', { n: f.left, date: f.last ? shortDate(f.last) : '—' }),
      done: f.total ? Math.max(0, Math.min(1, (f.total - f.left) / f.total)) : undefined,
      act: t(f.renewOpen ? 'fixed.renew' : 'fixed.manage'), actCls: f.renewOpen ? 'renew' : undefined,
    })
    const byOwner = new Map<string, Voucher[]>()
    for (const v of plans.vouchers) { const k = [v.studentId, v.student2Id].filter(Boolean).sort().join('+'); byOwner.set(k, [...(byOwner.get(k) || []), v]) }
    for (const [k, vs] of byOwner) {
      const first = [...vs].sort((a, b) => a.expiresOn.localeCompare(b.expiresOn))[0]
      cards.push({
        key: 'v' + k, href: `/booking?voucher=${first.id}`, kind: t('me.plan.voucher'),
        title: t('me.plan.voucherN', { n: vs.length }), who: first.studentNames.join(' & '),
        sub: t(vs.length === 1 ? 'dash.plan.expires' : 'dash.plan.firstExpires', { date: shortDate(first.expiresOn) }),
        subCls: first.expiresOn <= plusDays(todayLA(), 7) ? 'soon' : undefined, act: t('voucher.book'),
      })
    }
    for (const m of plans.team) {
      const exp = m.is_prepaid && m.expires_at ? new Date(m.expires_at) : null
      const lapsed = !!m.is_prepaid && (m.status === 'expired' || (!!exp && exp.getTime() < plans.at))
      const failed = !viewer && !m.is_prepaid && m.status === 'past_due'
      const expDate = exp ? exp.toLocaleDateString(locale === 'en' ? 'en-US' : locale, { month: 'short', day: 'numeric' }) : ''
      cards.push({
        key: 't' + m.id, href: `/dashboard?team=${m.student_id}`, kind: t('team.title'),
        title: m.tier_name ? (m.team_tier_id ? tDb(locale, 'team_tiers', m.team_tier_id, m.tier_name) : m.tier_name) : t('team.title'),
        who: m.student_name || '',
        sub: failed ? t('dash.plan.teamPastDue') : exp ? t(lapsed ? 'team.expired' : 'team.paidThru', { date: expDate }) : t('team.active'),
        subCls: failed || lapsed ? 'bad' : undefined, act: t(viewer ? 'voucher.lineLink' : 'team.manage'),
      })
    }
  }

  // The card's QR: the swimmer's own check-in code, on 首頁; with several
  // swimmers, which one first.
  const openQr = () => {
    if (kids.length === 1) router.push('/dashboard?qr=' + kids[0].id)
    else if (kids.length > 1) setPickQr(true)
  }
  useEffect(() => {
    if (!pickQr) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setPickQr(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [pickQr])

  const owe = !!wallet && (wallet.arrears > 0 || wallet.balance < 0)
  const name = me ? (me.name || me.email) : t('common.loading')

  return (
    <div className="ac-root">
      <style>{ACCT_CSS + css}</style>
      {/* 我的 as a member card (owner, 2026-11-03, 樣貌一 of five): the card,
          four round shortcuts, the plans sliding sideways, four small
          buttons. One screen, nothing to scroll. */}
      <div className="mx">
        <div style={{ position: 'relative' }}>
          <Link href={viewer ? '/dashboard/account' : '/dashboard?points=1'} className="mx-card" aria-live="polite">
            <span className="t">{t('me.card.member')}</span>
            <span className="n">{name}</span>
            {!viewer && <span className="p">
              <b>{wallet ? wallet.balancePurchased.toLocaleString() : '—'}</b><span className="u">{t('dash.pointsUnit')}</span>
              {wallet && wallet.balanceGranted > 0 && <span className="g">{t('dash.pointsGift', { n: wallet.balanceGranted.toLocaleString() })}</span>}
            </span>}
            {owe && wallet ? <span className="owe">{t('points.card.arrearsTitle', { n: wallet.arrears.toLocaleString() })}</span>
              : wallet?.runway ? <span className="low">{t('dash.pointsLow')}</span> : null}
            <span className="ft"><span>{me?.name ? me.email : ''}</span><span>{viewer ? t('app.me.account') : t('me.card.detail')} ›</span></span>
          </Link>
          {kids.length > 0 && (
            <button type="button" className="mx-qr tap-auto" onClick={openQr} aria-label={t('dash.viewQr')}>{QR_MARK}</button>
          )}
        </div>

        {!viewer && (
          <nav className="mx-r" aria-label={t('points.card.title')}>
            <Link href="/plans#buy" className="amb"><em aria-hidden="true">💳</em>{t('dash.topUp')}</Link>
            <Link href="/dashboard?points=1"><em aria-hidden="true">🧾</em>{t('me.r.history')}</Link>
            <Link href="/dashboard?points=refer"><em aria-hidden="true">🎁</em>{t('dash.more.refer')}</Link>
            <Link href="/dashboard/partnerships"><em aria-hidden="true">👥</em>{t('quick.partnerships')}</Link>
          </nav>
        )}

        <p className="mx-sec">{t('dash.plans.title')}{cards.length > 1 && <small>{t('me.plans.swipe')}</small>}</p>
        <nav className="mx-pl" aria-label={t('dash.plans.title')}>
          {cards.map(c => (
            <Link key={c.key} href={c.href}>
              <span className="k">{c.kind}</span>
              <b>{c.title}</b>
              {c.who && <small className="who">{c.who}</small>}
              {c.done != null && <span className="bar" aria-hidden="true"><i style={{ width: `${Math.round(c.done * 100)}%` }} /></span>}
              <small className={c.subCls}>{c.sub}</small>
              <span className={'go' + (c.actCls ? ' ' + c.actCls : '')}>{c.act} ›</span>
            </Link>
          ))}
          {plans && !cards.length && (
            viewer
              ? <span className="empty" style={{ flex: 1, background: '#fff', borderRadius: 16, padding: 14, textAlign: 'center', color: BRAND.mute, fontSize: 13.5, fontWeight: 700 }}>{t('me.plans.empty')}</span>
              : <Link href="/booking" className="empty"><small>{t('me.plans.empty')}</small><span className="go">{t('me.plans.book')} ›</span></Link>
          )}
        </nav>

        <nav className="mx-mini">
          <Link href="/dashboard/account"><span aria-hidden="true">👤</span><span>{t('app.me.account')}</span></Link>
          {app && <Link href="/dashboard/me/notifications"><span aria-hidden="true">🔔</span><span>{t('push.settings.title')}</span></Link>}
          <Link href="/dashboard/me/school"><span aria-hidden="true">🏫</span><span>{t('app.me.school')}</span></Link>
          <Link href="/dashboard?suggest=1"><span aria-hidden="true">💬</span><span>{t('suggest.link')}</span></Link>
        </nav>

        <button type="button" className="mx-out" onClick={signOut}>{t('nav.signOut')}</button>
      </div>

      {pickQr && (
        <div className="mx-pick" onClick={() => setPickQr(false)}>
          <div role="dialog" aria-modal="true" aria-label={t('me.qr.pick')} onClick={e => e.stopPropagation()}>
            <h2>{t('me.qr.pick')}</h2>
            {kids.map(k => <Link key={k.id} href={'/dashboard?qr=' + k.id}>{k.full_name}<span aria-hidden="true">›</span></Link>)}
            <button type="button" className="x" onClick={() => setPickQr(false)}>{t('common.cancel')}</button>
          </div>
        </div>
      )}
    </div>
  )
}
