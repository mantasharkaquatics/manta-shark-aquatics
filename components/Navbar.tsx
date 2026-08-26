'use client'
import Image from 'next/image'
import Link from 'next/link'
import { useState, useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useT, useLocale, useSetLocale, rememberExplicitLocale, readExplicitLocale, clearExplicitLocale } from '@/lib/i18n/provider'
import { LOCALES, isLocale, type Locale } from '@/lib/i18n'
import { localePath } from '@/lib/i18n/paths'

const navLinks = [
  { labelKey: 'page.services', href: '/services' },
  { labelKey: 'page.levels', href: '/levels' },
  { labelKey: 'page.plans', href: '/plans' },
  { labelKey: 'page.about', href: '/about' },
  { labelKey: 'page.policies', href: '/policies' },
]

function Check() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
      className="shrink-0" aria-hidden="true">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  )
}

function Chevron({ className = '' }: { className?: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      className={`shrink-0 text-gray-500 transition-transform duration-200 ${className}`} aria-hidden="true">
      <path d="m9 18 6-6-6-6" />
    </svg>
  )
}

export default function Navbar() {
  const [menuOpen, setMenuOpen] = useState(false)
  const [langOpen, setLangOpen] = useState(false)
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [firstName, setFirstName] = useState('')
  const [parentId, setParentId] = useState<string | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()
  const t = useT()
  const locale = useLocale()
  const setLocale = useSetLocale()

  useEffect(() => {
    async function loadUser() {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        setIsLoggedIn(true)
        const { data: parent } = await supabase
          .from('parents')
          .select('id, first_name, preferred_language')
          .eq('auth_user_id', user.id)
          .single()
        if (parent) {
          setFirstName(parent.first_name)
          setParentId(parent.id)
          const chosen = readExplicitLocale()
          if (chosen) {
            setLocale(chosen)
            clearExplicitLocale()
            await supabase.from('parents').update({ preferred_language: chosen }).eq('id', parent.id)
          } else if (isLocale(parent.preferred_language)) {
            setLocale(parent.preferred_language)
          }
        }
      } else {
        setIsLoggedIn(false)
        setFirstName('')
      }
      setAuthLoading(false)
    }
    loadUser()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (session?.user) {
        setIsLoggedIn(true)
        const { data: parent } = await supabase
          .from('parents')
          .select('id, first_name, preferred_language')
          .eq('auth_user_id', session.user.id)
          .single()
        if (parent) {
          setFirstName(parent.first_name)
          setParentId(parent.id)
          const chosen = readExplicitLocale()
          if (chosen) {
            setLocale(chosen)
            clearExplicitLocale()
            await supabase.from('parents').update({ preferred_language: chosen }).eq('id', parent.id)
          } else if (isLocale(parent.preferred_language)) {
            setLocale(parent.preferred_language)
          }
        }
      } else {
        setIsLoggedIn(false)
        setFirstName('')
      }
    })
    return () => subscription.unsubscribe()
  }, [pathname])

  async function changeLocale(next: Locale) {
    setLocale(next)
    goToLocalisedUrl(next)
    if (!isLoggedIn || !parentId) { rememberExplicitLocale(next); return }
    clearExplicitLocale()
    const { error } = await supabase.from('parents').update({ preferred_language: next }).eq('id', parentId)
    if (error) console.error('[i18n] failed to save preferred_language', error)
  }

  /* On /zh-Hant/... the locale comes from the URL segment, and the layout hands
     it to the provider as a fixed prop -- which beats anything the switcher puts
     in state or in the cookie. So on those pages setting a preference did
     nothing at all: the page kept rendering the language in the address bar.
     The switcher has to move the visitor instead.

     It moves them in the other direction too, so the address bar and the words
     on the page never disagree and a copied link carries the language. Pages
     with no localised route (the dashboard, /login, the legal pages) stay where
     they are -- localePath returns them unchanged -- and the cookie drives
     those correctly on its own. */
  function goToLocalisedUrl(next: Locale) {
    const seg = pathname.split('/')[1] || ''
    const bare = isLocale(seg) && seg !== 'en' ? pathname.slice(seg.length + 1) || '/' : pathname
    const target = localePath(bare, next)
    if (target !== pathname) router.push(target)
  }

  useEffect(() => { if (!menuOpen) setLangOpen(false) }, [menuOpen])

  async function handleSignOut() {
    await supabase.auth.signOut()
    setIsLoggedIn(false)
    setFirstName('')
    router.push('/')
  }

  /* The popup a native <select> opens is drawn by the operating system and cannot
     be styled at all -- on iOS that is the grey sheet that looked nothing like the
     rest of the site. The closed control CAN be styled, so the desktop bar keeps
     the select (appearance-none plus our own chevron) where the OS popup is small
     and unobtrusive, and the phone drawer below replaces it outright with three
     rows in the site's own colours. */
  const localeSelect = (extraClass: string) => (
    /* extraClass carries the visibility ("hidden sm:block"), so it belongs on the
       WRAPPER -- put it on the select and the span keeps rendering with only the
       chevron inside it, which is a stray arrow floating in the mobile bar. */
    /* No display utility of its own: the base string used to say inline-flex and
       then extraClass appended "hidden", leaving two unconditional display rules
       fighting -- the loser was "hidden", so the control showed on phones too.
       The caller owns the display; this only sets position and alignment. */
    <span className={`relative items-center ${extraClass}`}>
      <select
        aria-label={t('nav.language')}
        value={locale}
        onChange={e => changeLocale(e.target.value as Locale)}
        className="appearance-none bg-[#111d38] text-gray-300 text-sm border border-white/15 rounded-lg pl-3 pr-8 py-1.5 cursor-pointer hover:border-[#c9a84c]/60 focus:outline-none focus:border-[#c9a84c] transition-colors">
        {LOCALES.map(l => (
          <option key={l} value={l}>{t('locale.' + l + '.native')}</option>
        ))}
      </select>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
        className="pointer-events-none absolute right-2.5 text-gray-500" aria-hidden="true">
        <path d="m6 9 6 6 6-6" />
      </svg>
    </span>
  )

  return (
    <nav className="bg-[#1a2744] sticky top-0 z-50 shadow-lg">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <Link href={localePath('/', locale)} className="flex items-center gap-3">
            <Image src="/logo.png" alt="Manta Shark Aquatics" width={64} height={64} className="rounded-full object-cover w-12 h-12 sm:w-16 sm:h-16" />
            <span className="text-white font-bold text-lg leading-tight hidden sm:block">
              Manta Shark<br /><span className="text-[#c9a84c] font-normal text-sm">Aquatics</span>
            </span>
          </Link>

          <div className="hidden md:flex items-center gap-6">
            {navLinks.map(link => (
              <Link key={link.href} href={localePath(link.href, locale)}
                className={`text-sm font-medium transition-colors ${pathname === link.href ? 'text-[#c9a84c]' : 'text-gray-300 hover:text-[#c9a84c]'}`}>
                {t(link.labelKey)}
              </Link>
            ))}
          </div>

          <div className="flex items-center gap-3">
            {localeSelect('hidden md:inline-flex')}
            {authLoading ? <div className="w-24 h-8" /> : isLoggedIn ? (
              <>
                <Link href="/dashboard"
                  className="text-gray-300 hover:text-white text-sm font-medium transition-colors px-3 py-1.5 hidden sm:block">
                  {t('nav.greeting', { name: firstName })}
                </Link>
                <button
                  onClick={handleSignOut}
                  className="hidden md:inline-flex items-center min-h-11 bg-[#c9a84c] hover:bg-[#b8962e] text-white text-sm font-semibold px-5 rounded transition-colors">
                  {t('nav.signOut')}
                </button>
              </>
            ) : (
              <>
                <Link href="/login"
                  className="text-gray-300 hover:text-white text-sm font-medium transition-colors px-3 py-1.5 hidden sm:block">
                  {t('nav.signIn')}
                </Link>
                <Link href="/register"
                  className="inline-flex items-center min-h-11 bg-[#c9a84c] hover:bg-[#b8962e] text-white text-sm font-semibold px-4 rounded-lg transition-colors">
                  {t('nav.createAccount')}
                </Link>
              </>
            )}
            <button onClick={() => setMenuOpen(!menuOpen)} className="md:hidden text-white p-1 min-w-11 min-h-11 flex items-center justify-center">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {menuOpen
                  ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />}
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Drawer rows are full-width, 56px tall, 16px text, separated by a hairline
          and closed by a chevron. Before this they were bare 14px labels: the tap
          target ran the width of the row but nothing said so, so the obvious thing
          to do -- tap the label itself -- was the only thing that looked clickable,
          and the rest of the row read as dead space. The chevron is the same
          convention a phone user already knows from their settings app. */}
      {menuOpen && (
        <div className="md:hidden bg-[#111d38] px-4 pb-4">
          {navLinks.map(link => (
            <Link key={link.href} href={localePath(link.href, locale)}
              onClick={() => setMenuOpen(false)}
              className={`flex items-center justify-between gap-3 min-h-14 border-b border-white/10 text-base font-medium transition-colors ${pathname === link.href ? 'text-[#c9a84c]' : 'text-gray-200 hover:text-[#c9a84c]'}`}>
              <span>{t(link.labelKey)}</span>
              <Chevron />
            </Link>
          ))}
          {isLoggedIn ? (
            <>
              <Link href="/dashboard" onClick={() => setMenuOpen(false)}
                className="flex items-center justify-between gap-3 min-h-14 border-b border-white/10 text-base text-gray-200 hover:text-white">
                <span>{t('nav.dashboard')}</span><Chevron />
              </Link>
              <button onClick={handleSignOut}
                className="flex items-center justify-between gap-3 min-h-14 border-b border-white/10 text-base text-gray-200 hover:text-white w-full text-left">
                <span>{t('nav.signOut')}</span><Chevron />
              </button>
            </>
          ) : (
            <Link href="/login" onClick={() => setMenuOpen(false)}
              className="flex items-center justify-between gap-3 min-h-14 border-b border-white/10 text-base text-gray-200 hover:text-white">
              <span>{t('nav.signIn')}</span><Chevron />
            </Link>
          )}
          {/* Three permanently open language rows sat directly under the navigation
              and were easy to catch with a thumb while scrolling the drawer -- and
              a mis-tap here reloads the whole site in another language. Collapsed
              to a single row that reads like the others and states the current
              choice; the options only exist once you have asked for them. */}
          <div>
            <button onClick={() => setLangOpen(v => !v)} aria-expanded={langOpen}
              className="flex items-center justify-between gap-3 w-full text-left min-h-14 border-b border-white/10 text-base text-gray-200">
              <span>{t('nav.language')}</span>
              <span className="flex items-center gap-2">
                <span className="text-sm text-[#c9a84c]">{t('locale.' + locale + '.native')}</span>
                <Chevron className={langOpen ? 'rotate-90' : ''} />
              </span>
            </button>
            {langOpen && (
              <div className="my-2 overflow-hidden rounded-xl border border-[#1e3a6e] bg-[#0d1529]">
                {LOCALES.map((l, i) => (
                  <button key={l} onClick={() => { changeLocale(l); setMenuOpen(false) }}
                    className={`flex w-full items-center justify-between gap-3 px-4 text-left text-base min-h-[52px] transition-colors ${i > 0 ? 'border-t border-white/[0.06]' : ''} ${l === locale ? 'text-[#c9a84c] font-semibold' : 'text-gray-300'}`}>
                    <span>{t('locale.' + l + '.native')}</span>
                    {l === locale && <Check />}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </nav>
  )
}
