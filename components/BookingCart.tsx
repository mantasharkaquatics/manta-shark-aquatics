'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

const GOLD = '#c9a84c'
const NAVY = '#1a2744'

type CartItem = {
  booking_id: string
  student_id: string
  student_name: string
  course_type_id: string | null
  course_name: string
  coach_name: string
  session_date: string
  start_time: string
  end_time: string
}
type CreditRow = { course_type_id: string; course_name: string; needed: number; remaining: number; sufficient: boolean }
type CartState = {
  items: CartItem[]
  expiresAt: string | null
  credits: { byCourse: CreditRow[]; sufficient: boolean }
}

function fmt12h(t: string): string {
  const [h, m] = t.split(':').map(Number)
  const ampm = h >= 12 ? 'PM' : 'AM'
  const hh = h % 12 === 0 ? 12 : h % 12
  return `${hh}:${String(m).padStart(2, '0')} ${ampm}`
}

// refreshSignal: bump the number to make the cart reload (e.g. after add-to-cart).
// onCommitted: parent page can refresh slot availability after checkout.
export default function BookingCart({ refreshSignal, onCommitted }: { refreshSignal: number; onCommitted?: () => void }) {
  const [open, setOpen] = useState(false)
  const [cart, setCart] = useState<CartState | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const [remainMs, setRemainMs] = useState<number | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/bookings/cart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'list' }),
      })
      if (!res.ok) return
      const j = await res.json()
      setCart(j)
    } catch {}
  }, [])

  useEffect(() => { load() }, [load, refreshSignal])

  // Countdown; auto-clear UI when expired (server purges lazily)
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current)
    if (!cart?.expiresAt || cart.items.length === 0) { setRemainMs(null); return }
    const tick = () => {
      const ms = Date.parse(cart.expiresAt!) - Date.now()
      setRemainMs(ms)
      if (ms <= 0) {
        if (timerRef.current) clearInterval(timerRef.current)
        setCart({ items: [], expiresAt: null, credits: { byCourse: [], sufficient: true } })
        onCommitted?.()
      }
    }
    tick()
    timerRef.current = setInterval(tick, 1000)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [cart?.expiresAt, cart?.items.length]) // eslint-disable-line

  async function act(body: any) {
    setBusy(true)
    setError('')
    try {
      const res = await fetch('/api/bookings/cart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(j.error || 'Something went wrong. Please try again.')
        await load()
        return null
      }
      return j
    } catch {
      setError('Network error. Please try again.')
      return null
    } finally {
      setBusy(false)
    }
  }

  async function handleRemove(bookingId: string) {
    const j = await act({ action: 'remove', booking_id: bookingId })
    if (j) setCart(j)
    onCommitted?.()
  }

  async function handleCommit() {
    const j = await act({ action: 'commit' })
    if (j?.ok) {
      setDone(true)
      setCart({ items: [], expiresAt: null, credits: { byCourse: [], sufficient: true } })
      onCommitted?.()
    } else {
      await load()
      onCommitted?.()
    }
  }

  const count = cart?.items.length || 0
  const mins = remainMs !== null ? Math.max(0, Math.floor(remainMs / 60000)) : null
  const secs = remainMs !== null ? Math.max(0, Math.floor((remainMs % 60000) / 1000)) : null

  if (count === 0 && !open) return null

  return (
    <>
      {/* Floating button (bottom-left; ChatWidget owns bottom-right) */}
      <button
        onClick={() => { setDone(false); setOpen(true) }}
        style={{
          position: 'fixed', left: '20px', bottom: '20px', zIndex: 60,
          background: GOLD, color: NAVY, border: 'none', borderRadius: '999px',
          padding: '14px 20px', fontSize: '14px', fontWeight: 700, cursor: 'pointer',
          boxShadow: '0 6px 24px rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', gap: '8px',
        }}
      >
        🛒 Cart
        <span style={{
          background: NAVY, color: '#fff', borderRadius: '999px',
          fontSize: '12px', fontWeight: 700, padding: '2px 8px',
        }}>{count}</span>
        {mins !== null && (
          <span style={{ fontSize: '12px', fontWeight: 600 }}>{mins}:{String(secs).padStart(2, '0')}</span>
        )}
      </button>

      {/* Drawer */}
      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 70, background: 'rgba(0,0,0,0.55)' }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              position: 'absolute', right: 0, top: 0, bottom: 0, width: 'min(420px, 100vw)',
              background: '#111d38', borderLeft: '1px solid rgba(255,255,255,0.1)',
              display: 'flex', flexDirection: 'column', padding: '24px', overflowY: 'auto',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h2 style={{ margin: 0, fontSize: '18px', color: '#fff', fontFamily: 'Playfair Display, serif' }}>Your Cart</h2>
              <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', fontSize: '20px', cursor: 'pointer' }}>×</button>
            </div>

            {mins !== null && count > 0 && (
              <div style={{
                background: 'rgba(201,168,76,0.1)', border: '1px solid rgba(201,168,76,0.3)',
                borderRadius: '10px', padding: '10px 14px', marginBottom: '16px',
                fontSize: '13px', color: GOLD, fontWeight: 600,
              }}>
                Slots reserved for {mins}:{String(secs).padStart(2, '0')} — complete checkout before the timer ends.
              </div>
            )}

            {done && (
              <div style={{
                background: 'rgba(80,200,120,0.12)', border: '1px solid rgba(80,200,120,0.4)',
                borderRadius: '10px', padding: '14px', marginBottom: '16px', color: '#7fdca4', fontSize: '14px', fontWeight: 600,
              }}>
                ✓ All lessons booked! Confirmation email is on the way.
              </div>
            )}

            {error && (
              <div style={{
                background: 'rgba(220,80,80,0.12)', border: '1px solid rgba(220,80,80,0.4)',
                borderRadius: '10px', padding: '12px 14px', marginBottom: '16px', color: '#f0a0a0', fontSize: '13px',
              }}>{error}</div>
            )}

            {count === 0 && !done && (
              <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '14px' }}>Your cart is empty.</p>
            )}

            {cart?.items.map(it => (
              <div key={it.booking_id} style={{
                background: NAVY, borderRadius: '12px', padding: '14px 16px', marginBottom: '10px',
                border: '1px solid rgba(255,255,255,0.08)',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ color: '#fff', fontSize: '14px', fontWeight: 600 }}>{it.student_name}</div>
                    <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '12px', marginTop: '4px' }}>
                      {it.course_name} · Coach {it.coach_name}
                    </div>
                    <div style={{ color: GOLD, fontSize: '12px', marginTop: '4px', fontWeight: 600 }}>
                      {it.session_date} · {fmt12h(it.start_time)} – {fmt12h(it.end_time)}
                    </div>
                  </div>
                  <button
                    onClick={() => handleRemove(it.booking_id)}
                    disabled={busy}
                    style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', fontSize: '16px' }}
                  >🗑</button>
                </div>
              </div>
            ))}

            {count > 0 && cart && (
              <>
                <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', margin: '12px 0', paddingTop: '12px' }}>
                  {cart.credits.byCourse.map(c => (
                    <div key={c.course_type_id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', padding: '4px 0' }}>
                      <span style={{ color: 'rgba(255,255,255,0.6)' }}>{c.course_name}</span>
                      <span style={{ color: c.sufficient ? '#7fdca4' : '#f0a0a0', fontWeight: 600 }}>
                        {c.needed} needed / {c.remaining} available
                      </span>
                    </div>
                  ))}
                </div>
                <button
                  onClick={handleCommit}
                  disabled={busy || !cart.credits.sufficient}
                  style={{
                    padding: '14px', borderRadius: '10px', border: 'none',
                    background: busy || !cart.credits.sufficient ? 'rgba(255,255,255,0.1)' : GOLD,
                    color: busy || !cart.credits.sufficient ? 'rgba(255,255,255,0.3)' : NAVY,
                    fontSize: '13px', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase',
                    cursor: busy || !cart.credits.sufficient ? 'not-allowed' : 'pointer', marginTop: '4px',
                  }}
                >{busy ? 'Booking...' : cart.credits.sufficient ? `Confirm All (${count}) ✓` : 'Not Enough Credits'}</button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}
