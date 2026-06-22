'use client'

import { useState, useEffect } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import { PLANS, PLAN_GROUPS } from '@/lib/plans'

const NAVY = '#1a2744'
const GOLD = '#c9a84c'
const TRIAL_CENTS = 8500

type Parent = { id: string; first_name: string; last_name: string; email: string }
type Student = { id: string; full_name: string; trial_used_at: string | null }
type Coach = { id: string; first_name: string; last_name: string }
type PayMethod = 'card' | 'cash'
type Step = 'select' | 'success'

const TIME_SLOTS: string[] = []
for (let h = 6; h < 22; h++) {
  TIME_SLOTS.push(`${String(h).padStart(2, '0')}:00`)
  TIME_SLOTS.push(`${String(h).padStart(2, '0')}:30`)
}
function formatTime(t: string) {
  const [h, m] = t.split(':').map(Number)
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`
}

const sel0: React.CSSProperties = {
  width: '100%', backgroundColor: '#0d1829', border: '1px solid #1e3a6e',
  borderRadius: 8, padding: '8px 10px', color: 'white', fontSize: 13, outline: 'none', boxSizing: 'border-box',
}

export default function POSClient() {
  const [step, setStep] = useState<Step>('select')
  const [search, setSearch] = useState('')
  const [searchResults, setSearchResults] = useState<Parent[]>([])
  const [selectedParent, setSelectedParent] = useState<Parent | null>(null)
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null)
  const [isTrial, setIsTrial] = useState(false)
  const [students, setStudents] = useState<Student[]>([])
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null)
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
        const dr = await t.discoverReaders({ simulated: true }) as any
        if (!mounted) return
        if (dr.discoveredReaders?.length > 0) {
          const cr = await t.connectReader(dr.discoveredReaders[0]) as any
          setReaderStatus(cr.error ? 'none' : 'connected')
        } else { setReaderStatus('none') }
      } catch { if (mounted) setReaderStatus('none') }
    }
    init()
    return () => { mounted = false }
  }, [])

  useEffect(() => {
    if (!search.trim()) { setSearchResults([]); return }
    const t = setTimeout(async () => {
      const { data } = await supabase.from('parents').select('id, first_name, last_name, email')
        .or(`first_name.ilike.%${search}%,last_name.ilike.%${search}%,email.ilike.%${search}%`).limit(6)
      setSearchResults(data || [])
    }, 300)
    return () => clearTimeout(t)
  }, [search])

  useEffect(() => {
    if (!selectedParent || !isTrial) { setStudents([]); setSelectedStudentId(null); return }
    supabase.from('students').select('id, full_name, trial_used_at')
      .eq('parent_id', selectedParent.id).is('trial_used_at', null)
      .then(({ data }) => {
        setStudents(data || [])
        setSelectedStudentId(data?.length ? data[0].id : null)
      })
  }, [selectedParent, isTrial])

  const plan = selectedPlanId ? PLANS[selectedPlanId] : null
  const selectedStudent = students.find(s => s.id === selectedStudentId)
  const chargeAmount = isTrial ? TRIAL_CENTS : (plan?.amount ?? 0)

  const canCharge = !processing && (
    isTrial
      ? !!selectedParent && !!selectedStudentId && (payMethod === 'cash' || readerStatus === 'connected')
      : !!selectedParent && !!selectedPlanId && (payMethod === 'cash' || readerStatus === 'connected')
  )

  const handleCharge = async () => {
    if (!selectedParent) return
    setError(null)
    setProcessing(true)
    try {
      if (isTrial) {
        if (!selectedStudentId) throw new Error('Please select a student')
        let paymentIntentId: string | undefined
        if (payMethod === 'card') {
          if (!terminal || readerStatus !== 'connected') throw new Error('Card reader not connected')
          const piRes = await fetch('/api/stripe/terminal/create-trial-payment-intent', { method: 'POST' })
          const piData = await piRes.json()
          if (!piRes.ok || piData.error) throw new Error(piData.error || 'PaymentIntent failed')
          const { paymentIntent: collected, error: ce } = await terminal.collectPaymentMethod(piData.clientSecret)
          if (ce) throw new Error(ce.message)
          const { paymentIntent: processed, error: pe } = await terminal.processPayment(collected)
          if (pe) throw new Error(pe.message)
          paymentIntentId = processed.id
        }
        const res = await fetch('/api/pos/complete-trial-sale', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ parentId: selectedParent.id, studentId: selectedStudentId, paymentMethod: payMethod === 'card' ? 'stripe_terminal' : 'cash', ...(paymentIntentId ? { paymentIntentId } : {}) }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Failed')
        setStep('success')
      } else {
        if (!selectedPlanId) return
        let paymentIntentId: string | undefined
        if (payMethod === 'card') {
          if (!terminal || readerStatus !== 'connected') throw new Error('Card reader not connected')
          const piRes = await fetch('/api/stripe/terminal/create-payment-intent', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ planId: selectedPlanId, parentId: selectedParent.id }),
          })
          const piData = await piRes.json()
          if (!piRes.ok || piData.error) throw new Error(piData.error || 'PaymentIntent failed')
          const { paymentIntent: collected, error: ce } = await terminal.collectPaymentMethod(piData.clientSecret)
          if (ce) throw new Error(ce.message)
          const { paymentIntent: processed, error: pe } = await terminal.processPayment(collected)
          if (pe) throw new Error(pe.message)
          paymentIntentId = processed.id
        }
        const res = await fetch('/api/pos/complete-sale', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ parentId: selectedParent.id, planId: selectedPlanId, paymentMethod: payMethod === 'card' ? 'stripe_terminal' : 'cash', ...(paymentIntentId ? { paymentIntentId } : {}) }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Failed')
        setStep('success')
      }
    } catch (err: any) {
      setError(err.message || 'Payment failed.')
    } finally { setProcessing(false) }
  }

  const reset = () => {
    setStep('select'); setSelectedParent(null); setSelectedPlanId(null); setIsTrial(false)
    setStudents([]); setSelectedStudentId(null); setPayMethod('card')
    setSearch(''); setSearchResults([]); setError(null); setProcessing(false)

  }

  const readerDot = readerStatus === 'connected' ? '#10b981' : readerStatus === 'init' ? '#f59e0b' : '#6b7280'
  const readerLabel = readerStatus === 'connected' ? 'Reader Connected' : readerStatus === 'init' ? 'Initializing...' : 'No Reader'

  if (step === 'success') {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: NAVY, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', padding: 40 }}>
          <div style={{ width: 96, height: 96, borderRadius: '50%', backgroundColor: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px', fontSize: 48 }}>✓</div>
          <h2 style={{ color: 'white', fontSize: 32, fontWeight: 700, marginBottom: 8 }}>{isTrial ? 'Trial Lesson Booked!' : 'Payment Complete'}</h2>
          <p style={{ color: '#9ca3af', fontSize: 18, marginBottom: 4 }}>{selectedParent?.first_name} {selectedParent?.last_name}</p>
          {isTrial ? (
            <>
              <p style={{ color: GOLD, fontSize: 16, fontWeight: 600, marginBottom: 8 }}>Trial 1-on-1 · {selectedStudent?.full_name}</p>
            </>
          ) : (
            <p style={{ color: '#9ca3af', fontSize: 16, marginBottom: 8 }}>{plan?.name}</p>
          )}
          <p style={{ color: GOLD, fontSize: 32, fontWeight: 700, marginBottom: 8 }}>${(chargeAmount / 100).toLocaleString()}</p>
          <p style={{ color: '#6b7280', fontSize: 13, marginBottom: 32 }}>{payMethod === 'cash' ? '💵 Cash' : '💳 Card'}</p>
          <button onClick={reset} style={{ backgroundColor: GOLD, color: NAVY, padding: '14px 40px', borderRadius: 10, fontWeight: 700, fontSize: 16, cursor: 'pointer', border: 'none' }}>New Transaction</button>
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
        <div style={{ backgroundColor: '#111d38', border: '1px solid #1e3a6e', borderRadius: 12, padding: 20 }}>
          <h2 style={{ color: 'white', fontWeight: 600, fontSize: 15, display: 'flex', alignItems: 'center', gap: 8, margin: '0 0 16px' }}>
            <span style={{ backgroundColor: selectedParent ? '#10b981' : GOLD, color: NAVY, borderRadius: '50%', width: 22, height: 22, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>1</span>
            Customer
          </h2>
          {selectedParent ? (
            <div style={{ backgroundColor: '#1e3a6e', borderRadius: 8, padding: '12px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <p style={{ color: 'white', fontWeight: 600, margin: 0 }}>{selectedParent.first_name} {selectedParent.last_name}</p>
                <p style={{ color: '#9ca3af', fontSize: 13, margin: '2px 0 0' }}>{selectedParent.email}</p>
              </div>
              <button onClick={() => { setSelectedParent(null); setSearch(''); setStudents([]); setSelectedStudentId(null) }}
                style={{ color: '#9ca3af', fontSize: 13, background: 'none', border: 'none', cursor: 'pointer' }}>Change</button>
            </div>
          ) : (
            <div>
              <input type="text" placeholder="Search name or email..." value={search} onChange={e => setSearch(e.target.value)}
                style={{ ...sel0, padding: '10px 12px' }} />
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
        <div style={{ backgroundColor: '#111d38', border: '1px solid #1e3a6e', borderRadius: 12, padding: 20 }}>
          <h2 style={{ color: 'white', fontWeight: 600, fontSize: 15, display: 'flex', alignItems: 'center', gap: 8, margin: '0 0 16px' }}>
            <span style={{ backgroundColor: (selectedPlanId || isTrial) ? '#10b981' : GOLD, color: NAVY, borderRadius: '50%', width: 22, height: 22, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>2</span>
            Package
          </h2>
          <div style={{ maxHeight: 660, overflowY: 'auto' }}>
            <div style={{ borderBottom: '1px solid #1e3a6e', paddingBottom: 14, marginBottom: 14 }}>
              <p style={{ color: '#6b7280', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 6px' }}>Trial Lesson</p>
              <button onClick={() => { setIsTrial(!isTrial); setSelectedPlanId(null) }}
                style={{ width: '100%', padding: '12px', borderRadius: 8, textAlign: 'center', cursor: 'pointer', border: `2px solid ${isTrial ? GOLD : '#1e3a6e'}`, backgroundColor: isTrial ? GOLD : '#0d1829', transition: 'all 0.15s' }}>
                <p style={{ color: isTrial ? NAVY : '#9ca3af', fontSize: 11, fontWeight: 600, margin: 0 }}>1-on-1 · once per student</p>
                <p style={{ color: isTrial ? NAVY : 'white', fontSize: 18, fontWeight: 700, margin: 0 }}>$85.00</p>
              </button>
              {isTrial && (
                <div style={{ marginTop: 12, padding: 14, backgroundColor: '#0d1829', borderRadius: 8, border: '1px solid #1e3a6e' }}>
                  <div style={{ marginBottom: 10 }}>
                    <p style={{ color: '#9ca3af', fontSize: 11, margin: '0 0 4px' }}>Student</p>
                    {!selectedParent ? (
                      <p style={{ color: '#f59e0b', fontSize: 13, margin: 0 }}>Select a customer first</p>
                    ) : students.length === 0 ? (
                      <p style={{ color: '#f87171', fontSize: 13, margin: 0 }}>No eligible students</p>
                    ) : (
                      <select value={selectedStudentId || ''} onChange={e => setSelectedStudentId(e.target.value)} style={sel0}>
                        {students.map(s => <option key={s.id} value={s.id}>{s.full_name}</option>)}
                      </select>
                    )}
                  </div>
                </div>
              )}
            </div>
            <div style={{ opacity: isTrial ? 0.35 : 1, transition: 'opacity 0.2s', pointerEvents: isTrial ? 'none' : 'auto' }}>
              {PLAN_GROUPS.map(group => (
                <div key={group.label} style={{ marginBottom: 14 }}>
                  <p style={{ color: '#6b7280', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 6px' }}>{group.label}</p>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6 }}>
                    {group.keys.map(key => {
                      const p = PLANS[key]
                      const sel = selectedPlanId === key
                      return (
                        <button key={key} onClick={() => { setSelectedPlanId(key); setIsTrial(false) }}
                          style={{ padding: '10px 8px', borderRadius: 8, textAlign: 'center', cursor: 'pointer', border: `1px solid ${sel ? GOLD : '#1e3a6e'}`, backgroundColor: sel ? GOLD : '#0d1829' }}>
                          <p style={{ color: sel ? NAVY : '#9ca3af', fontSize: 11, fontWeight: 500, margin: 0 }}>{p.sessions} sessions</p>
                          <p style={{ color: sel ? NAVY : 'white', fontSize: 15, fontWeight: 700, margin: 0 }}>${(p.amount / 100).toLocaleString()}</p>
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>

          </div>
        </div>
        <div style={{ backgroundColor: '#111d38', border: '1px solid #1e3a6e', borderRadius: 12, padding: 20 }}>
          <h2 style={{ color: 'white', fontWeight: 600, fontSize: 15, margin: '0 0 16px' }}>Order Summary</h2>
          <div style={{ borderBottom: '1px solid #1e3a6e', paddingBottom: 14, marginBottom: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ color: '#9ca3af', fontSize: 13 }}>Customer</span>
              <span style={{ color: 'white', fontSize: 13, fontWeight: 500 }}>{selectedParent ? `${selectedParent.first_name} ${selectedParent.last_name}` : '\u2014'}</span>
            </div>
            {isTrial ? (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ color: '#9ca3af', fontSize: 13 }}>Student</span>
                  <span style={{ color: 'white', fontSize: 13 }}>{selectedStudent?.full_name || '\u2014'}</span>
                </div>
              </>
            ) : (
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#9ca3af', fontSize: 13 }}>Sessions</span>
                <span style={{ color: 'white', fontSize: 13 }}>{plan ? `${plan.sessions} sessions` : '\u2014'}</span>
              </div>
            )}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <span style={{ color: '#9ca3af' }}>Total</span>
            <span style={{ color: 'white', fontSize: 28, fontWeight: 700 }}>
              {isTrial ? '$85' : plan ? `$${(plan.amount / 100).toLocaleString()}` : '$\u2014'}
            </span>
          </div>
          <p style={{ color: '#6b7280', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 8px' }}>Payment Method</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 20 }}>
            {(['card', 'cash'] as const).map(m => (
              <button key={m} onClick={() => setPayMethod(m)}
                style={{ padding: '10px', borderRadius: 8, border: `1px solid ${payMethod === m ? GOLD : '#1e3a6e'}`, backgroundColor: payMethod === m ? GOLD : '#0d1829', color: payMethod === m ? NAVY : 'white', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>
                {m === 'card' ? '\ud83d\udcb3 Card' : '\ud83d\udcb5 Cash'}
              </button>
            ))}
          </div>
          {error && <p style={{ color: '#f87171', fontSize: 13, marginBottom: 12 }}>{error}</p>}
          <button onClick={handleCharge} disabled={!canCharge}
            style={{ width: '100%', padding: 14, borderRadius: 10, fontWeight: 700, fontSize: 16, border: 'none', cursor: canCharge ? 'pointer' : 'not-allowed', backgroundColor: canCharge ? GOLD : '#374151', color: canCharge ? NAVY : '#6b7280', transition: 'all 0.15s' }}>
            {processing ? 'Processing...' : canCharge ? `Charge $${(chargeAmount / 100).toLocaleString()}` : isTrial ? 'Fill in trial details' : 'Select a package'}
          </button>
          {payMethod === 'card' && readerStatus === 'none' && <p style={{ color: '#fbbf24', fontSize: 12, textAlign: 'center', marginTop: 8 }}>\u26a0 No card reader connected</p>}
          {payMethod === 'card' && readerStatus === 'connected' && <p style={{ color: '#10b981', fontSize: 12, textAlign: 'center', marginTop: 8 }}>\u2713 Reader ready</p>}
        </div>
      </div>
    </div>
  )
}
