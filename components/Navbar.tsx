'use client'
import Image from 'next/image'
import Link from 'next/link'
import { useState, useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const navLinks = [
  { label: 'Services', href: '/services' },
  { label: 'Swim Levels', href: '/levels' },
  { label: 'Swim Plans', href: '/plans' },
  { label: 'About Us', href: '/about' },
  { label: 'Policies', href: '/policies' },
]

export default function Navbar() {
  const [menuOpen, setMenuOpen] = useState(false)
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [firstName, setFirstName] = useState('')
  const [authLoading, setAuthLoading] = useState(true)
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    async function loadUser() {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        setIsLoggedIn(true)
        const { data: parent } = await supabase
          .from('parents')
          .select('first_name')
          .eq('auth_user_id', user.id)
          .single()
        if (parent) setFirstName(parent.first_name)
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
          .select('first_name')
          .eq('auth_user_id', session.user.id)
          .single()
        if (parent) setFirstName(parent.first_name)
      } else {
        setIsLoggedIn(false)
        setFirstName('')
      }
    })
    return () => subscription.unsubscribe()
  }, [pathname])

  async function handleSignOut() {
    await supabase.auth.signOut()
    setIsLoggedIn(false)
    setFirstName('')
    router.push('/')
  }

  return (
    <nav className="bg-[#1a2744] sticky top-0 z-50 shadow-lg">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <Link href="/" className="flex items-center gap-3">
            <Image src="/logo.png" alt="Manta Shark Aquatics" width={64} height={64} className="rounded-full object-cover" />
            <span className="text-white font-bold text-lg leading-tight hidden sm:block">
              Manta Shark<br /><span className="text-[#c9a84c] font-normal text-sm">Aquatics</span>
            </span>
          </Link>

          <div className="hidden md:flex items-center gap-6">
            {navLinks.map(link => (
              <Link key={link.href} href={link.href}
                className={`text-sm font-medium transition-colors ${pathname === link.href ? 'text-[#c9a84c]' : 'text-gray-300 hover:text-[#c9a84c]'}`}>
                {link.label}
              </Link>
            ))}
          </div>

          <div className="flex items-center gap-3">
            {authLoading ? <div className="w-24 h-8" /> : isLoggedIn ? (
              <>
                <Link href="/dashboard"
                  className="text-gray-300 hover:text-white text-sm font-medium transition-colors px-3 py-1.5 hidden sm:block">
                  Hi, {firstName}
                </Link>
                <button
                  onClick={handleSignOut}
                  className="bg-[#c9a84c] hover:bg-[#b8962e] text-white text-sm font-semibold px-5 py-2 rounded transition-colors">
                  Sign Out
                </button>
              </>
            ) : (
              <>
                <Link href="/login"
                  className="text-gray-300 hover:text-white text-sm font-medium transition-colors px-3 py-1.5 hidden sm:block">
                  Sign In
                </Link>
                <Link href="/register"
                  className="bg-[#c9a84c] hover:bg-[#b8962e] text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors">
                  Create Account
                </Link>
              </>
            )}
            <button onClick={() => setMenuOpen(!menuOpen)} className="md:hidden text-white p-1">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {menuOpen
                  ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />}
              </svg>
            </button>
          </div>
        </div>
      </div>

      {menuOpen && (
        <div className="md:hidden bg-[#111d38] px-4 pb-4 space-y-2">
          {navLinks.map(link => (
            <Link key={link.href} href={link.href}
              onClick={() => setMenuOpen(false)}
              className={`block py-2 text-sm font-medium transition-colors ${pathname === link.href ? 'text-[#c9a84c]' : 'text-gray-300 hover:text-[#c9a84c]'}`}>
              {link.label}
            </Link>
          ))}
          {isLoggedIn ? (
            <>
              <Link href="/dashboard" onClick={() => setMenuOpen(false)} className="block py-2 text-sm text-gray-300 hover:text-white">My Dashboard</Link>
              <button onClick={handleSignOut} className="block py-2 text-sm text-gray-300 hover:text-white w-full text-left">Sign Out</button>
            </>
          ) : (
            <Link href="/login" onClick={() => setMenuOpen(false)} className="block py-2 text-sm text-gray-300 hover:text-white">Sign In</Link>
          )}
        </div>
      )}
    </nav>
  )
}
