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

function Chevron() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      className="shrink-0 text-gray-500" aria-hidden="true">
      <path d="m9 18 6-6-6-6" />
    </svg>
  )
}

export default function Navbar() {
  const [menuOpen, setMenuOpen] = useState(false)
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
    if (!isLoggedIn || !parentId) { rememberExplicitLocale(next); return }
    clearExplicitLocale()
    const { error } = await supabase.from('parents').update({ preferred_language: next }).eq('id', parentId)
    if (error) console.error('[i18n] failed to save preferred_language', error)
  }

  async function handleSignOut() {
    await supabase.auth.signOut()
    setIsLoggedIn(false)
    setFirstName('')
    router.push('/')
  }

  const localeSelect = (extraClass: string) => (
    <select
      aria-label="Language"
      value={locale}
      onChange={e => changeLocale(e.target.value as Locale)}
      className={`bg-[#111d38] text-gray-300 text-sm border border-white/15 rounded px-2 py-1 cursor-pointer ${extraClass}`}>
      {LOCALES.map(l => (
        <option key={l} value={l}>{t('locale.' + l + '.native')}</option>
      ))}
    </select>
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
            {localeSelect('hidden sm:block')}
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
          <div className="pt-4 sm:hidden">{localeSelect('w-full min-h-12 text-base')}</div>
        </div>
      )}
    </nav>
  )
}
