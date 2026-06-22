'use client'

import { useState, useEffect } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import { PLANS, PLAN_GROUPS } from '@/lib/plans'

const NAVY = '#1a2744'
const GOLD = '#c9a84c'

type Parent = { id: string; first_name: string; last_name: string; email: string }
type PayMethod = 'card' | 'cash'
type Step = 'select' | 'success'

export default function POSClient() {
  const [step, setStep] = useState<Step>('select')
  const [search, setSearch] = useState('')
  const [searchResults, setSearchResults] = useState<Parent[]>([])
  const [selectedParent, setSelectedParent] = useState<Parent | null>(null)
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null)
  const [payMethod, setPayMethod] = useState<PayMethod>('card')
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [terminal, setTerminal] = useState<any>(null)
  const [readerStatus, setReaderStatus] = useState<'init' | 'none' | 'connected'>('init')

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  )

  useEffect(() => {
    let mounted = true
    const init = async () => {
      try {
        const mod = await import('@stripe/terminal-js')
        const StripeTerminal = await mod.loadStripeTerminal()
        if (!StripeTerminal || !mounted) return
        const t = StripeTerminal.create({
          onFetchConnectionToken: async () => {
            const res = await fetch('/api/stripe/terminal/connection-token', { method: 'POST' })
            const data = await res.json()
            if (data.error) throw new Error(data.error)
            return data.secret
          },
          onUnexpectedReaderDisconnect: () => { if (mounted) setReaderStatus('none') },
        })
        if (!mounted) return
        setTerminal(t)
        // simulated: true = 測試用虛擬 reader; 收到實體 M2 後改成 false
        const discoverResult = await t.discoverReaders({ simulated: true }) as any
        if (!mounted) return
        if (discoverResult.discoveredReaders && discoverResult.discoveredReaders.length > 0) {
          const connectResult = await t.connectReader(discoverResult.discoveredReaders[0]) as any
          setReaderStatus(connectResult.error ? 'none' : 'connected')
        } else {
          setReaderStatus('none')
        }
      } catch { if (mounted) setReaderStatus('none') }
    }
    init()
    return () => { mounted = false }
  }, [])

  useEffect(() => {
    if (!search.trim()) { setSearchResults([]); return }
    const timer = setTimeout(async () => {
      const { data } = await supabase
        .from('parents')
        .select('id, first_name, last_name, email')
        .or(`first_name.ilike.%${search}%,last_name.ilike.%${search}%,email.ilike.%${search}%`)
        .limit(6)
      setSearchResults(data || [])
    }, 300)
    return () => clearTimeout(timer)
  }, [search])

  const plan = selectedPlanId ? PLANS[selectedPlanId] : null
  const canCharge = !!selectedParent && !!selectedPlanId && !processing &&
    (payMethod === 'cash' || readerStatus === 'connected')

  const handleCharge = async () => {
    if (!selectedParent || !selectedPlanId || !plan) return
    setError(null)
    setProcessing(true)
    try {
      if (payMethod === 'cash') {
        const res = await fetch('/api/pos/complete-sale', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ parentId: selectedParent.id, planId: selectedPlanId, paymentMethod: 'cash' }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Failed')
        setStep('success')
      } else {
        if (!terminal || readerStatus !== 'connected') throw new Error('Card reader not connected')
        const piRes = await fetch('/api/stripe/terminal/create-payment-intent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ planId: selectedPlanId, parentId: selectedParent.id }),
        })
        const piData = await piRes.json()
        if (!piRes.ok || piData.error) throw new Error(piData.error || 'PaymentIntent failed')
        const { paymentIntent: collected, error: collectErr } = await terminal.collectPaymentMethod(piData.clientSecret)
        if (collectErr) throw new Error(collectErr.message)
        const { paymentIntent: processed, error: processErr } = await terminal.processPayment(collected)
        if (processErr) throw new Error(processErr.message)
        const completeRes = await fetch('/api/pos/complete-sale', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            parentId: selectedParent.id,
            planId: selectedPlanId,
            paymentMethod: 'stripe_terminal',
            paymentIntentId: processed.id,
          }),
        })
        const completeData = await completeRes.json()
        if (!completeRes.ok) throw new Error(completeData.error || 'Failed to record')
        setStep('success')
      }
    } catch (err: any) {
      setError(err.message || 'Payment failed. Please try again.')
    } finally {
      setProcessing(false)
    }
  }

  const reset = () => {
    setStep('select')
    setSelectedParent(null)
    setSelectedPlanId(null)
    setPayMethod('card')
    setSearch('')
    setSearchResults([])
    setError(null)
    setProcessing(false)
  }

  const readerDot = readerStatus === 'connected' ? '#10b981' : readerStatus === 'init' ? '#f59e0b' : '#6b7280'
  const readerLabel = readerStatus === 'connected' ? 'Reader Connected' : readerStatus === 'init' ? 'Initializing...' : 'No Reader'

  if (step === 'success') {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: NAVY, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', padding: 40 }}>
          <div style={{ width: 96, height: 96, borderRadius: '50%', backgroundColor: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px', fontSize: 48 }}>✓</div>
          <h2 style={{ color: 'white', fontSize: 32, fontWeight: 700, marginBottom: 8 }}>Payment Complete</h2>
          <p style={{ color: '#9ca3af', fontSize: 18, marginBottom: 4 }}>{selectedParent?.first_name} {selectedParent?.last_name}</p>
          <p style={{ color: '#9ca3af', fontSize: 15, marginBottom: 4 }}>{plan?.name}</p>
          <p style={{ color: GOLD, fontSize: 32, fontWeight: 700, marginBottom: 8 }}>${((plan?.amount ?? 0) / 100).toLocaleString()}</p>
          <p style={{ color: '#6b7280', fontSize: 13, marginBottom: 32 }}>
            {payMethod === 'cash' ? '💵 Cash' : '💳 Card'} · {plan?.sessions} sessions added
          </p>
          <button onClick={reset} style={{ backgroundColor: GOLD, color: NAVY, padding: '14px 40px', borderRadius: 10, fontWeight: 700, fontSize: 16, cursor: 'pointer', border: 'none' }}>
            New Transaction
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: NAVY, padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ color: 'white', fontSize: 24, fontWeight: 700, fontFamily: 'Playfair Display, serif', margin: 0 }}>Point of Sale</h1>
          <p style={{ color: '#9ca3af', fontSize: 14, marginTop: 4, marginBottom: 0 }}>In-person package purchase</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: readerDot }} />
          <span style={{ color: '#9ca3af', fontSize: 13 }}>{readerLabel}</span>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 300px', gap: 20, alignItems: 'start' }}>

        {/* Panel 1: Customer */}
        <div style={{ backgroundColor: '#111d38', border: '1px solid #1e3a6e', borderRadius: 12, padding: 20 }}>
          <h2 style={{ color: 'white', fontWeight: 600, fontSize: 15, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8, margin: '0 0 16px' }}>
            <span style={{ backgroundColor: selectedParent ? '#10b981' : GOLD, color: NAVY, borderRadius: '50%', width: 22, height: 22, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>1</span>
            Customer
          </h2>
          {selectedParent ? (
            <div style={{ backgroundColor: '#1e3a6e', borderRadius: 8, padding: '12px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <p style={{ color: 'white', fontWeight: 600, margin: 0 }}>{selectedParent.first_name} {selectedParent.last_name}</p>
                <p style={{ color: '#9ca3af', fontSize: 13, margin: '2px 0 0' }}>{selectedParent.email}</p>
              </div>
              <button onClick={() => { setSelectedParent(null); setSearch('') }}
                style={{ color: '#9ca3af', fontSize: 13, background: 'none', border: 'none', cursor: 'pointer' }}>Change</button>
            </div>
          ) : (
            <div>
              <input type="text" placeholder="Search name or email..." value={search}
                onChange={e => setSearch(e.target.value)}
                style={{ width: '100%', backgroundColor: '#0d1829', border: '1px solid #1e3a6e', borderRadius: 8, padding: '10px 12px', color: 'white', outline: 'none', fontSize: 14, boxSizing: 'border-box' }} />
              {searchResults.length > 0 && (
                <div style={{ marginTop: 6, border: '1px solid #1e3a6e', borderRadius: 8, overflow: 'hidden' }}>
                  {searchResults.map((p, i) => (
                    <button key={p.id} onClick={() => { setSelectedParent(p); setSearch(''); setSearchResults([]) }}
                      style={{ width: '100%', padding: '10px 14px', textAlign: 'left', backgroundColor: '#0d1829', borderBottom: i < searchResults.length - 1 ? '1px solid #1e3a6e' : 'none', cursor: 'pointer', display: 'block' }}>
                      <p style={{ color: 'white', fontSize: 14, fontWeight: 500, margin: 0 }}>{p.first_name} {p.last_name}</p>
                      <p style={{ color: '#9ca3af', fontSize: 12, margin: 0 }}>{p.email}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Panel 2: Package */}
        <div style={{ backgroundColor: '#111d38', border: '1px solid #1e3a6e', borderRadius: 12, padding: 20 }}>
          <h2 style={{ color: 'white', fontWeight: 600, fontSize: 15, display: 'flex', alignItems: 'center', gap: 8, margin: '0 0 16px' }}>
            <span style={{ backgroundColor: selectedPlanId ? '#10b981' : GOLD, color: NAVY, borderRadius: '50%', width: 22, height: 22, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>2</span>
            Package
          </h2>
          {PLAN_GROUPS.map(group => (
            <div key={group.label} style={{ marginBottom: 14 }}>
              <p style={{ color: '#6b7280', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 6px' }}>{group.label}</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6 }}>
                {group.keys.map(key => {
                  const p = PLANS[key]
                  const sel = selectedPlanId === key
                  return (
                    <button key={key} onClick={() => setSelectedPlanId(key)}
                      style={{ padding: '10px 8px', borderRadius: 8, textAlign: 'center', cursor: 'pointer', border: `1px solid ${sel ? GOLD : '#1e3a6e'}`, backgroundColor: sel ? GOLD : '#0d1829', transition: 'all 0.1s' }}>
                      <p style={{ color: sel ? NAVY : '#9ca3af', fontSize: 11, fontWeight: 500, margin: 0 }}>{p.sessions} sessions</p>
                      <p style={{ color: sel ? NAVY : 'white', fontSize: 15, fontWeight: 700, margin: 0 }}>${(p.amount / 100).toLocaleString()}</p>
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Panel 3: Order + Payment */}
        <div style={{ backgroundColor: '#111d38', border: '1px solid #1e3a6e', borderRadius: 12, padding: 20 }}>
          <h2 style={{ color: 'white', fontWeight: 600, fontSize: 15, margin: '0 0 16px' }}>Order Summary</h2>
          <div style={{ borderBottom: '1px solid #1e3a6e', paddingBottom: 14, marginBottom: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ color: '#9ca3af', fontSize: 13 }}>Customer</span>
              <span style={{ color: 'white', fontSize: 13, fontWeight: 500 }}>{selectedParent ? `${selectedParent.first_name} ${selectedParent.last_name}` : '—'}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#9ca3af', fontSize: 13 }}>Sessions</span>
              <span style={{ color: 'white', fontSize: 13, fontWeight: 500 }}>{plan ? `${plan.sessions} sessions` : '—'}</span>
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <span style={{ color: '#9ca3af' }}>Total</span>
            <span style={{ color: 'white', fontSize: 28, fontWeight: 700 }}>{plan ? `$${(plan.amount / 100).toLocaleString()}` : '$—'}</span>
          </div>

          <p style={{ color: '#6b7280', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 8px' }}>Payment Method</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 20 }}>
            {(['card', 'cash'] as const).map(m => (
              <button key={m} onClick={() => setPayMethod(m)}
                style={{ padding: '10px', borderRadius: 8, border: `1px solid ${payMethod === m ? GOLD : '#1e3a6e'}`, backgroundColor: payMethod === m ? GOLD : '#0d1829', color: payMethod === m ? NAVY : 'white', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>
                {m === 'card' ? '💳 Card' : '💵 Cash'}
              </button>
            ))}
          </div>

          {error && <p style={{ color: '#f87171', fontSize: 13, marginBottom: 12 }}>{error}</p>}

          <button onClick={handleCharge} disabled={!canCharge}
            style={{ width: '100%', padding: 14, borderRadius: 10, fontWeight: 700, fontSize: 16, border: 'none', cursor: canCharge ? 'pointer' : 'not-allowed', backgroundColor: canCharge ? GOLD : '#374151', color: canCharge ? NAVY : '#6b7280', transition: 'all 0.15s' }}>
            {processing ? 'Processing...' : plan ? `Charge $${(plan.amount / 100).toLocaleString()}` : 'Select a package'}
          </button>

          {payMethod === 'card' && readerStatus === 'none' && (
            <p style={{ color: '#fbbf24', fontSize: 12, textAlign: 'center', marginTop: 8 }}>⚠ No card reader connected</p>
          )}
          {payMethod === 'card' && readerStatus === 'connected' && (
            <p style={{ color: '#10b981', fontSize: 12, textAlign: 'center', marginTop: 8 }}>✓ Reader ready</p>
          )}
        </div>
      </div>
    </div>
  )
}
