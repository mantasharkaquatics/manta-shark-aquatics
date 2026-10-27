'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useLocale, useSetLocale, useT, rememberExplicitLocale, clearExplicitLocale } from '@/lib/i18n/provider'
import { LOCALES, type Locale } from '@/lib/i18n'
import { ACCT_CSS } from '@/components/brand/AcctStyles'
import PushSettings from '@/components/PushSettings'
import { myParentId, myFamilyRole } from '@/lib/my-parent'
import { BRAND } from '@/lib/brand'

/* 我的, the app's last tab (owner, 2026-10-27): everything about the family
   that is not a lesson -- the account, points and receipts, notifications,
   booking with another family, referring a friend, the suggestion box -- and
   the school's own pages (programs, prices, policies), which the app has no
   website bar for. Language and signing out are here too. In a browser the
   page works as well; nothing links to it there. */

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
`

type Row = { href: string; ico: string; label: string }

export default function MePage() {
  const t = useT()
  const locale = useLocale()
  const setLocale = useSetLocale()
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const [me, setMe] = useState<{ name: string; email: string } | null>(null)
  const [parentId, setParentId] = useState<string | null>(null)
  const [role, setRole] = useState<'main' | 'full' | 'viewer' | null>(null)

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
    })().catch(() => {})
    return () => { live = false }
  }, [supabase, router])

  const viewer = role === 'viewer'
  const family: Row[] = [
    { href: '/dashboard/account', ico: '👤', label: t('app.me.account') },
    ...(viewer ? [] : [
      { href: '/dashboard?points=1', ico: '💳', label: t('app.me.points') },
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
