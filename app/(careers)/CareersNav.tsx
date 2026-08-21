'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'

const GOLD = '#c9a84c'
const NAVY = '#1a2744'

export default function CareersNav() {
  const pathname = usePathname()
  const router = useRouter()
  const [name, setName] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    fetch('/api/careers/me')
      .then((r) => r.json())
      .then((me) => {
        setName(me.signedIn ? me.firstName || 'there' : null)
        setLoaded(true)
      })
      .catch(() => setLoaded(true))
  }, [pathname])

  async function signOut() {
    await fetch('/api/careers/logout', { method: 'POST' })
    setName(null)
    router.push('/careers')
    router.refresh()
  }

  return (
    <header
      style={{
        background: NAVY,
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        padding: '16px 24px',
      }}
    >
      <div
        style={{
          maxWidth: '1100px',
          margin: '0 auto',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '16px',
        }}
      >
        <Link href="/careers" style={{ textDecoration: 'none', color: '#fff' }}>
          <span style={{ fontSize: '18px', fontWeight: 700, display: 'block', lineHeight: 1.2 }}>
            Manta Shark Aquatics
          </span>
          <span style={{ fontSize: '13px', color: GOLD }}>Careers</span>
        </Link>

        <nav style={{ display: 'flex', alignItems: 'center', gap: '18px', fontSize: '14px' }}>
          {!loaded ? null : name ? (
            <>
              <span style={{ color: 'rgba(255,255,255,0.7)' }}>Hi, {name}</span>
              <button
                onClick={signOut}
                style={{
                  background: 'transparent',
                  border: '1px solid rgba(255,255,255,0.25)',
                  color: '#fff',
                  borderRadius: '6px',
                  padding: '0 14px',
                  minHeight: '44px',
                  fontSize: '14px',
                  cursor: 'pointer',
                }}
              >
                Sign out
              </button>
            </>
          ) : (
            <>
              <Link href="/careers/login" style={{ color: 'rgba(255,255,255,0.8)', textDecoration: 'none' }}>
                Sign in
              </Link>
              <Link
                href="/careers/register"
                style={{
                  background: GOLD,
                  color: NAVY,
                  borderRadius: '6px',
                  padding: '8px 15px',
                  fontWeight: 700,
                  textDecoration: 'none',
                }}
              >
                Apply now
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  )
}
