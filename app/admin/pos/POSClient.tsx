'use client'

import { useState, useEffect, useRef } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import { MIN_TOPUP_DOLLARS, MAX_TOPUP_DOLLARS, TOPUP_PRESETS } from '@/lib/points'
import { tierFor, tierBandLabel, TEAM_SQUAD_CAP, type TierBand } from '@/lib/team-tiers'
import { useT, useLocale } from '@/lib/i18n/provider'
import { tDb } from '@/lib/i18n'

const NAVY = '#1a2744'
const GOLD = '#c9a84c'
const TRIAL_CENTS = 8500

type Parent = { id: string; first_name: string; last_name: string; email: string }
type Student = { id: string; full_name: string; trial_used_at: string | null; current_level: number | null; current_stage: number | null }
type PosTier = TierBand & { id: string; name: string; monthly_price_cents: number; spots_left: number }
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
  const t = useT()
  const locale = useLocale()
  const [step, setStep] = useState<Step>('select')
  const [search, setSearch] = useState('')
  const [searchResults, setSearchResults] = useState<Parent[]>([])
  const [selectedParent, setSelectedParent] = useState<Parent | null>(null)
  // Selling points: a dollar amount, and an optional bonus the school is
  // choosing to give. Bonus points are granted, not purchased -- they spend the
  // same but cannot be cashed out, so a promotion can never be refunded for
  // more money than came in.
  // The smallest thing the website sells, as a starting point. Not an index
  // into TOPUP_PRESETS -- that array's order is derived and can change.
  const [topupDollars, setTopupDollars] = useState<string>(String(Math.min(...TOPUP_PRESETS)))
  const [bonusPoints, setBonusPoints] = useState<string>('')
  const [isTrial, setIsTrial] = useState(false)
  const [students, setStudents] = useState<Student[]>([])
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null)
  const [payMethod, setPayMethod] = useState<PayMethod>('card')
  const [isSdp, setIsSdp] = useState(false)
  const [sdpStudents, setSdpStudents] = useState<{ id: string; full_name: string; uci_number: string }[]>([])
  const [sdpStudentId, setSdpStudentId] = useState<string | null>(null)
  const [sdpDesc, setSdpDesc] = useState('')
  const [sdpCourseTypes, setSdpCourseTypes] = useState<{ id: string; name: string }[]>([])
  const [sdpCourseTypeId, setSdpCourseTypeId] = useState<string | null>(null)
  const [sdpSessions, setSdpSessions] = useState('10')
  const [sdpUnitPrice, setSdpUnitPrice] = useState('65')
  const [processing, setProcessing] = useState(false)
  const [cashConfirmOpen, setCashConfirmOpen] = useState(false)
  const [showCashConfirm, setShowCashConfirm] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [terminal, setTerminal] = useState<any>(null)
  const [isTeam, setIsTeam] = useState(false)
  const [teamTiers, setTeamTiers] = useState<PosTier[]>([])
  const [teamTierId, setTeamTierId] = useState<string | null>(null)
  const [teamMonths, setTeamMonths] = useState('1')
  useEffect(() => {
    fetch('/api/team/tiers').then(r => r.json()).then(d => {
      const tiers = d.tiers || []
      setTeamTiers(tiers)
      if (tiers.length > 0) setTeamTierId(tiers[0].id)
    }).catch(() => {})
  }, [])
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
        const term = StripeTerminal.create({
          onFetchConnectionToken: async () => {
            const res = await fetch('/api/stripe/terminal/connection-token', { method: 'POST' })
            const data = await res.json()
            if (data.error) throw new Error(data.error)
            return data.secret
          },
          onUnexpectedReaderDisconnect: () => { if (mounted) setReaderStatus('none') },
        })
        if (!mounted) return
        setTerminal(term)
        const dr = await term.discoverReaders({ simulated: true }) as any
        if (!mounted) return
        if (dr.discoveredReaders?.length > 0) {
          const cr = await term.connectReader(dr.discoveredReaders[0]) as any
          setReaderStatus(cr.error ? 'none' : 'connected')
        } else { setReaderStatus('none') }
      } catch { if (mounted) setReaderStatus('none') }
    }
    init()
    return () => { mounted = false }
  }, [])

  useEffect(() => {
    if (!search.trim()) { setSearchResults([]); return }
    const timer = setTimeout(async () => {
      const { data } = await supabase.from('parents').select('id, first_name, last_name, email')
        .or(`first_name.ilike.%${search}%,last_name.ilike.%${search}%,email.ilike.%${search}%`).limit(6)
      setSearchResults(data || [])
    }, 300)
    return () => clearTimeout(timer)
  }, [search])

  useEffect(() => {
    if (!selectedParent || (!isTrial && !isTeam)) { setStudents([]); setSelectedStudentId(null); return }
    const q = supabase.from('students').select('id, full_name, trial_used_at, current_level, current_stage').eq('parent_id', selectedParent.id)
    ;(isTrial ? q.is('trial_used_at', null) : q)
      .then(({ data }) => {
        setStudents(data || [])
        setSelectedStudentId(isTrial && data?.length ? data[0].id : null)
      })
  }, [selectedParent, isTrial, isTeam])

  useEffect(() => {
    if (!isSdp || sdpCourseTypes.length > 0) return
    supabase.from('course_types').select('id, name').order('name')
      .then(({ data }) => {
        setSdpCourseTypes(data || [])
        if (data?.length && !sdpCourseTypeId) setSdpCourseTypeId(data[0].id)
      })
  }, [isSdp])

  useEffect(() => {
    if (!selectedParent || !isSdp) { setSdpStudents([]); setSdpStudentId(null); return }
    supabase.from('students').select('id, full_name, uci_number')
      .eq('parent_id', selectedParent.id).not('uci_number', 'is', null)
      .then(({ data }) => {
        setSdpStudents((data || []) as any)
        setSdpStudentId(data?.length ? data[0].id : null)
      })
  }, [selectedParent, isSdp])

  const topup = Math.max(0, Math.floor(Number(topupDollars) || 0))
  const bonus = Math.max(0, Math.floor(Number(bonusPoints) || 0))
  const topupValid = topup >= MIN_TOPUP_DOLLARS && topup <= MAX_TOPUP_DOLLARS && bonus <= topup
  const selectedStudent = students.find(s => s.id === selectedStudentId)
  const sdpQty = Math.max(0, Math.round(Number(sdpSessions) || 0))
  const sdpUnitCents = Math.max(0, Math.round((Number(sdpUnitPrice) || 0) * 100))
  const sdpAmountCents = sdpQty * sdpUnitCents
  const teamTier = teamTiers.find(tier => tier.id === teamTierId) || null
  const teamM = Math.max(1, Math.min(12, Math.round(Number(teamMonths) || 1)))
  const teamAmountCents = (teamTier?.monthly_price_cents ?? 39900) * teamM
  // teamLabel is the Stripe PaymentIntent description and stays English;
  // teamLabelUi is the same line for the screen, in the admin's language.
  const teamLabel = `${teamTier?.name || 'Swim Team'} · Prepaid · ${teamM} month${teamM > 1 ? 's' : ''}`
  const teamTierName = teamTier ? tDb(locale, 'team_tiers', teamTier.id, teamTier.name) : ''
  const teamLabelUi = t(teamM > 1 ? 'admin.pos.teamLabelPlural' : 'admin.pos.teamLabel', { tier: teamTierName || t('admin.pos.swimTeam'), n: teamM })
  const pointsLine = t('admin.pos.pointsN', { n: topup.toLocaleString() }) + (bonus > 0 ? t('admin.pos.bonusSuffix', { n: bonus.toLocaleString() }) : '')
  const chargeAmount = isTeam ? teamAmountCents : isSdp ? sdpAmountCents : isTrial ? TRIAL_CENTS : topup * 100

  const canCharge = !processing && (
    isTeam
      ? !!selectedParent && !!selectedStudentId && !!teamTierId && (payMethod === 'cash' || readerStatus === 'connected')
      : isSdp
      ? !!selectedParent && !!sdpStudentId && !!sdpCourseTypeId && sdpQty >= 1 && sdpUnitCents >= 50 && (payMethod === 'cash' || readerStatus === 'connected')
      : isTrial
      ? !!selectedParent && !!selectedStudentId && (payMethod === 'cash' || readerStatus === 'connected')
      : !!selectedParent && topupValid && (payMethod === 'cash' || readerStatus === 'connected')
  )

  /* The online route derives the squad from the swimmer's level and stage and
     refuses anything else. The counter picks by hand, and keeps the last word --
     a swimmer promoted this morning whose record is not updated yet is a real
     thing at a desk -- but an out-of-band sale is confirmed out loud and written
     onto the invoice. This runs BEFORE the card is charged, not after: a server
     rejection arriving post-capture would take the money and fail the sale.
     The server checks the same things again and is what actually decides.

     spots_left counts this swimmer too, so renewing into a full squad raises a
     confirmation the server will not ask for. An extra confirmation is the safe
     side of that to be wrong on. */
  const teamStudent = students.find(s => s.id === selectedStudentId) || null
  const teamRecommended = teamStudent ? tierFor(teamTiers, teamStudent.current_level, teamStudent.current_stage) : null
  const teamOverrideReasons: string[] = []
  if (isTeam && teamStudent && teamTier) {
    if (teamStudent.current_level == null) teamOverrideReasons.push(t('admin.pos.override.noAssessment', { name: teamStudent.full_name }))
    else if (!teamRecommended) teamOverrideReasons.push(t('admin.pos.override.belowMin', { n: teamStudent.current_level }))
    else if (teamRecommended.id !== teamTier.id) teamOverrideReasons.push(t('admin.pos.override.placesIn', { tier: tDb(locale, 'team_tiers', teamRecommended.id, teamRecommended.name) }))
    if (teamTier.spots_left <= 0) teamOverrideReasons.push(t('admin.pos.override.full', { tier: teamTierName, cap: TEAM_SQUAD_CAP }))
  }
  const teamOverrideRef = useRef(false)
  const [showTeamOverride, setShowTeamOverride] = useState(false)
  useEffect(() => { teamOverrideRef.current = false }, [selectedStudentId, teamTierId, isTeam])

  const handleCharge = async (overrideAcked = false) => {
    if (isTeam && teamOverrideReasons.length > 0 && !overrideAcked) {
      setShowTeamOverride(true)
      return
    }
    teamOverrideRef.current = overrideAcked
    if (payMethod === 'cash') {
      setCashConfirmOpen(true)
      return
    }
    await doCharge()
  }

  const doCharge = async () => {
    if (!selectedParent) return
    setError(null)
    setProcessing(true)
    try {
      if (isTeam) {
        if (!selectedStudentId) throw new Error(t('admin.pos.err.selectStudent'))
        if (!teamTierId) throw new Error(t('admin.pos.err.selectTier'))
        let paymentIntentId: string | undefined
        if (payMethod === 'card') {
          if (!terminal || readerStatus !== 'connected') throw new Error(t('admin.pos.err.readerNotConnected'))
          const piRes = await fetch('/api/stripe/terminal/create-payment-intent', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ amountCents: teamAmountCents, description: teamLabel }),
          })
          const piData = await piRes.json()
          if (!piRes.ok || piData.error) throw new Error(piData.error || t('admin.pos.err.piFailed'))
          const { paymentIntent: collected, error: ce } = await terminal.collectPaymentMethod(piData.clientSecret)
          if (ce) throw new Error(ce.message)
          const { paymentIntent: processed, error: pe } = await terminal.processPayment(collected)
          if (pe) throw new Error(pe.message)
          paymentIntentId = processed.id
        }
        const res = await fetch('/api/pos/complete-team-sale', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            parentId: selectedParent.id, studentId: selectedStudentId, tierId: teamTierId, months: teamM,
            override: teamOverrideRef.current,
            paymentMethod: payMethod === 'card' ? 'stripe_terminal' : 'cash',
            ...(paymentIntentId ? { paymentIntentId } : {}),
          }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || t('admin.pos.err.failed'))
        setStep('success')
      } else if (isSdp) {
        if (!sdpStudentId) throw new Error(t('admin.pos.err.selectStudent'))
        let paymentIntentId: string | undefined
        if (payMethod === 'card') {
          if (!terminal || readerStatus !== 'connected') throw new Error(t('admin.pos.err.readerNotConnected'))
          const piRes = await fetch('/api/stripe/terminal/create-payment-intent', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ amountCents: sdpAmountCents, description: sdpDesc }),
          })
          const piData = await piRes.json()
          if (!piRes.ok || piData.error) throw new Error(piData.error || t('admin.pos.err.piFailed'))
          const { paymentIntent: collected, error: ce } = await terminal.collectPaymentMethod(piData.clientSecret)
          if (ce) throw new Error(ce.message)
          const { paymentIntent: processed, error: pe } = await terminal.processPayment(collected)
          if (pe) throw new Error(pe.message)
          paymentIntentId = processed.id
        }
        const res = await fetch('/api/pos/complete-sdp-sale', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            parentId: selectedParent.id, studentId: sdpStudentId, courseTypeId: sdpCourseTypeId,
            description: sdpDesc, sessions: sdpQty, unitPriceCents: sdpUnitCents,
            paymentMethod: payMethod === 'card' ? 'stripe_terminal' : 'cash',
            ...(paymentIntentId ? { paymentIntentId } : {}),
          }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || t('admin.pos.err.failed'))
        setStep('success')
      } else if (isTrial) {
        if (!selectedStudentId) throw new Error(t('admin.pos.err.selectStudent'))
        let paymentIntentId: string | undefined
        if (payMethod === 'card') {
          if (!terminal || readerStatus !== 'connected') throw new Error(t('admin.pos.err.readerNotConnected'))
          const piRes = await fetch('/api/stripe/terminal/create-trial-payment-intent', { method: 'POST' })
          const piData = await piRes.json()
          if (!piRes.ok || piData.error) throw new Error(piData.error || t('admin.pos.err.piFailed'))
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
        if (!res.ok) throw new Error(data.error || t('admin.pos.err.failed'))
        setStep('success')
      } else {
        if (!topupValid) return
        let paymentIntentId: string | undefined
        if (payMethod === 'card') {
          if (!terminal || readerStatus !== 'connected') throw new Error(t('admin.pos.err.readerNotConnected'))
          const piRes = await fetch('/api/stripe/terminal/create-payment-intent', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ amountCents: topup * 100, kind: 'points', description: `${topup} lesson points`, parentId: selectedParent.id }),
          })
          const piData = await piRes.json()
          if (!piRes.ok || piData.error) throw new Error(piData.error || t('admin.pos.err.piFailed'))
          const { paymentIntent: collected, error: ce } = await terminal.collectPaymentMethod(piData.clientSecret)
          if (ce) throw new Error(ce.message)
          const { paymentIntent: processed, error: pe } = await terminal.processPayment(collected)
          if (pe) throw new Error(pe.message)
          paymentIntentId = processed.id
        }
        const res = await fetch('/api/pos/complete-sale', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            parentId: selectedParent.id,
            amountCents: topup * 100,
            bonusPoints: bonus,
            paymentMethod: payMethod === 'card' ? 'stripe_terminal' : 'cash',
            ...(paymentIntentId ? { paymentIntentId } : {}),
          }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || t('admin.pos.err.failed'))
        setStep('success')
      }
    } catch (err: any) {
      setError(err.message || t('admin.pos.err.paymentFailed'))
    } finally { setProcessing(false) }
  }
  const reset = () => {
    setStep('select'); setSelectedParent(null); setTopupDollars(String(TOPUP_PRESETS[1])); setBonusPoints(''); setIsTrial(false)
    setIsSdp(false); setSdpStudents([]); setSdpStudentId(null); setSdpDesc(''); setSdpSessions('10'); setSdpUnitPrice('65'); setSdpCourseTypeId(null)
    setStudents([]); setSelectedStudentId(null); setPayMethod('card'); setIsTeam(false); setTeamMonths('1')
    setSearch(''); setSearchResults([]); setError(null); setProcessing(false); setShowCashConfirm(false)

  }

  const readerDot = readerStatus === 'connected' ? '#10b981' : readerStatus === 'init' ? '#f59e0b' : '#6b7280'
  const readerLabel = readerStatus === 'connected' ? t('admin.pos.reader.connected') : readerStatus === 'init' ? t('admin.pos.reader.init') : t('admin.pos.reader.none')

  // Cash confirmation modal
  if (cashConfirmOpen) {
    const amount = `$${(chargeAmount / 100).toLocaleString()}`
    const customerName = selectedParent ? `${selectedParent.first_name} ${selectedParent.last_name}` : ''
    return (
      <div style={{ minHeight: '100vh', backgroundColor: NAVY, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{ backgroundColor: '#111d38', border: '1px solid #1e3a6e', borderRadius: 16, padding: 32, maxWidth: 400, width: '100%', textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>💵</div>
          <h2 style={{ color: 'white', fontSize: 22, fontWeight: 700, marginBottom: 8 }}>{t('admin.pos.cash.confirmTitle')}</h2>
          <p style={{ color: '#9ca3af', fontSize: 15, marginBottom: 4 }}>{customerName}</p>
          <p style={{ color: GOLD, fontSize: 32, fontWeight: 700, marginBottom: 4 }}>{amount}</p>
          <p style={{ color: '#9ca3af', fontSize: 13, marginBottom: 28 }}>
            {isTrial ? t('common.assessment') + ' · ' + (students.find(s => s.id === selectedStudentId)?.full_name || '') : isTeam ? teamLabelUi : pointsLine}
          </p>
          <p style={{ color: '#6b7280', fontSize: 13, marginBottom: 24 }}>{t('admin.pos.cash.confirmHint')}</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <button
              onClick={() => setCashConfirmOpen(false)}
              style={{ padding: '12px', borderRadius: 10, border: '1px solid #1e3a6e', backgroundColor: '#0d1829', color: '#9ca3af', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>
              {t('common.cancel')}
            </button>
            <button
              onClick={async () => { setCashConfirmOpen(false); await doCharge() }}
              style={{ padding: '12px', borderRadius: 10, border: 'none', backgroundColor: GOLD, color: NAVY, fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>
              {t('admin.pos.cash.confirmPayment')}
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (step === 'success') {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: NAVY, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', padding: 40 }}>
          <div style={{ width: 96, height: 96, borderRadius: '50%', backgroundColor: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px', fontSize: 48 }}>✓</div>
          <h2 style={{ color: 'white', fontSize: 32, fontWeight: 700, marginBottom: 8 }}>{isTrial ? t('admin.pos.success.assessment') : t('admin.pos.success.payment')}</h2>
          <p style={{ color: '#9ca3af', fontSize: 18, marginBottom: 4 }}>{selectedParent?.first_name} {selectedParent?.last_name}</p>
          {isTrial ? (
            <>
              <p style={{ color: GOLD, fontSize: 16, fontWeight: 600, marginBottom: 8 }}>{t('common.assessment')} · {selectedStudent?.full_name}</p>
              <p style={{ color: '#9ca3af', fontSize: 14, marginBottom: 8 }}>{t('admin.pos.success.assessmentHint')}</p>
            </>
          ) : (
            <p style={{ color: '#9ca3af', fontSize: 16, marginBottom: 8 }}>{isTeam ? teamLabelUi : pointsLine}</p>
          )}
          <p style={{ color: GOLD, fontSize: 32, fontWeight: 700, marginBottom: 8 }}>${(chargeAmount / 100).toLocaleString()}</p>
          <p style={{ color: '#6b7280', fontSize: 13, marginBottom: 32 }}>{payMethod === 'cash' ? t('admin.pos.pm.cash') : t('admin.pos.pm.card')}</p>
          <button onClick={reset} style={{ backgroundColor: GOLD, color: NAVY, padding: '14px 40px', borderRadius: 10, fontWeight: 700, fontSize: 16, cursor: 'pointer', border: 'none' }}>{t('admin.pos.success.newTransaction')}</button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: NAVY, padding: 24 }}>
      {/* Cash Confirm Modal */}
      {showTeamOverride && (
        <div onClick={() => setShowTeamOverride(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#111d38', border: '1px solid #b45309', borderRadius: 16, padding: 32, maxWidth: 420, width: '100%' }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: '#fbbf24', marginBottom: 8 }}>{t('admin.pos.override.eyebrow')}</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: 'white', marginBottom: 16 }}>{t('admin.pos.override.title', { tier: teamTierName })}</div>
            <ul style={{ margin: '0 0 16px', padding: '0 0 0 18px', color: '#fbbf24', fontSize: 13, lineHeight: 1.7 }}>
              {teamOverrideReasons.map(r => <li key={r}>{r}</li>)}
            </ul>
            <p style={{ fontSize: 12, color: '#9ca3af', margin: '0 0 20px', lineHeight: 1.6 }}>
              {t('admin.pos.override.hint')}
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setShowTeamOverride(false)} style={{ flex: 1, padding: 12, borderRadius: 10, border: '1px solid #1e3a6e', background: 'transparent', color: '#9ca3af', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                {t('common.cancel')}
              </button>
              <button onClick={async () => { setShowTeamOverride(false); await handleCharge(true) }} style={{ flex: 1, padding: 12, borderRadius: 10, border: 'none', background: '#b45309', color: 'white', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                {t('admin.pos.override.confirm')}
              </button>
            </div>
          </div>
        </div>
      )}
      {showCashConfirm && (
        <div onClick={() => setShowCashConfirm(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#111d38', border: '1px solid #1e3a6e', borderRadius: 16, padding: 32, maxWidth: 380, width: '100%' }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: GOLD, marginBottom: 8 }}>{t('admin.pos.cash.eyebrow')}</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: 'white', marginBottom: 16 }}>{t('admin.pos.cash.received')}</div>
            <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 10, padding: '14px 16px', marginBottom: 20 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'white', marginBottom: 4 }}>
                {selectedParent?.first_name} {selectedParent?.last_name}
              </div>
              <div style={{ fontSize: 13, color: '#9ca3af' }}>
                {isTrial ? t('common.assessment') : isTeam ? teamLabelUi : pointsLine}
              </div>
              <div style={{ fontSize: 22, fontWeight: 700, color: GOLD, marginTop: 8 }}>
                ${(chargeAmount / 100).toLocaleString()}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setShowCashConfirm(false)} style={{ flex: 1, padding: 12, borderRadius: 10, border: '1px solid #1e3a6e', background: 'transparent', color: '#9ca3af', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                {t('common.cancel')}
              </button>
              <button onClick={async () => { setShowCashConfirm(false); await doCharge() }} style={{ flex: 1, padding: 12, borderRadius: 10, border: 'none', background: GOLD, color: NAVY, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                {t('admin.pos.cash.confirmCharge', { amount: '$' + (chargeAmount / 100).toLocaleString() })}
              </button>
            </div>
          </div>
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ color: 'white', fontSize: 24, fontWeight: 700, fontFamily: 'Playfair Display, serif', margin: 0 }}>{t('admin.pos.title')}</h1>
          <p style={{ color: '#9ca3af', fontSize: 14, marginTop: 4, marginBottom: 0 }}>{t('admin.pos.subtitle')}</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: readerDot }} />
          <span style={{ color: '#9ca3af', fontSize: 13 }}>{readerLabel}</span>
        </div>
      </div>
      {/* Three fixed columns with a 300px summary needs ~800px. Below that the
          whole till ran off the side of the screen -- at 360px the page measured
          710px wide, which put the Order Summary and both payment buttons out of
          reach entirely. The class is here because the columns are an inline
          style, which only a stylesheet rule marked !important can override. */}
      <div className="pos-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 300px', gap: 20, alignItems: 'start' }}>
        <div style={{ backgroundColor: '#111d38', border: '1px solid #1e3a6e', borderRadius: 12, padding: 20 }}>
          <h2 style={{ color: 'white', fontWeight: 600, fontSize: 15, display: 'flex', alignItems: 'center', gap: 8, margin: '0 0 16px' }}>
            <span style={{ backgroundColor: selectedParent ? '#10b981' : GOLD, color: NAVY, borderRadius: '50%', width: 22, height: 22, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>1</span>
            {t('admin.pos.customer')}
          </h2>
          {selectedParent ? (
            <div style={{ backgroundColor: '#1e3a6e', borderRadius: 8, padding: '12px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <p style={{ color: 'white', fontWeight: 600, margin: 0 }}>{selectedParent.first_name} {selectedParent.last_name}</p>
                <p style={{ color: '#9ca3af', fontSize: 13, margin: '2px 0 0' }}>{selectedParent.email}</p>
              </div>
              <button onClick={() => { setSelectedParent(null); setSearch(''); setStudents([]); setSelectedStudentId(null) }}
                style={{ color: '#9ca3af', fontSize: 13, background: 'none', border: 'none', cursor: 'pointer' }}>{t('admin.pos.change')}</button>
            </div>
          ) : (
            <div>
              <input type="text" placeholder={t('admin.pos.searchPlaceholder')} value={search} onChange={e => setSearch(e.target.value)}
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
            <span style={{ backgroundColor: (topupValid || isTrial) ? '#10b981' : GOLD, color: NAVY, borderRadius: '50%', width: 22, height: 22, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>2</span>
            {t('admin.pos.package')}
          </h2>
          <div style={{ maxHeight: 660, overflowY: 'auto' }}>
            <div style={{ borderBottom: '1px solid #1e3a6e', paddingBottom: 14, marginBottom: 14 }}>
              <p style={{ color: '#6b7280', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 6px' }}>{t('common.assessment')}</p>
              <button onClick={() => { setIsTrial(!isTrial); setIsTeam(false) }}
                style={{ width: '100%', padding: '12px', borderRadius: 8, textAlign: 'center', cursor: 'pointer', border: `2px solid ${isTrial ? GOLD : '#1e3a6e'}`, backgroundColor: isTrial ? GOLD : '#0d1829', transition: 'all 0.15s' }}>
                <p style={{ color: isTrial ? NAVY : '#9ca3af', fontSize: 11, fontWeight: 600, margin: 0 }}>{t('admin.pos.assessment.sub')}</p>
                <p style={{ color: isTrial ? NAVY : 'white', fontSize: 18, fontWeight: 700, margin: 0 }}>$85.00</p>
              </button>
              {isTrial && (
                <div style={{ marginTop: 12, padding: 14, backgroundColor: '#0d1829', borderRadius: 8, border: '1px solid #1e3a6e' }}>
                  <div style={{ marginBottom: 10 }}>
                    <p style={{ color: '#9ca3af', fontSize: 11, margin: '0 0 4px' }}>{t('admin.pos.student')}</p>
                    {!selectedParent ? (
                      <p style={{ color: '#f59e0b', fontSize: 13, margin: 0 }}>{t('admin.pos.selectCustomerFirst')}</p>
                    ) : students.length === 0 ? (
                      <p style={{ color: '#f87171', fontSize: 13, margin: 0 }}>{t('admin.pos.noEligible')}</p>
                    ) : (
                      <select value={selectedStudentId || ''} onChange={e => setSelectedStudentId(e.target.value)} style={sel0}>
                        {students.map(s => <option key={s.id} value={s.id}>{s.full_name}</option>)}
                      </select>
                    )}
                  </div>
                </div>
              )}
            </div>
            <div style={{ borderBottom: '1px solid #1e3a6e', paddingBottom: 14, marginBottom: 14 }}>
              <p style={{ color: '#6b7280', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 6px' }}>{t('admin.pos.sdp.eyebrow')}</p>
              <button onClick={() => { setIsSdp(!isSdp); setIsTrial(false); setIsTeam(false) }}
                style={{ width: '100%', padding: '12px', borderRadius: 8, textAlign: 'center', cursor: 'pointer', border: `2px solid ${isSdp ? GOLD : '#1e3a6e'}`, backgroundColor: isSdp ? GOLD : '#0d1829', transition: 'all 0.15s' }}>
                <p style={{ color: isSdp ? NAVY : '#9ca3af', fontSize: 11, fontWeight: 600, margin: 0 }}>{t('admin.pos.sdp.sub')}</p>
                <p style={{ color: isSdp ? NAVY : 'white', fontSize: 18, fontWeight: 700, margin: 0 }}>{t('admin.pos.sdp.customAmount')}</p>
              </button>
              {isSdp && (
                <div style={{ marginTop: 12, padding: 14, backgroundColor: '#0d1829', borderRadius: 8, border: '1px solid #1e3a6e' }}>
                  <div style={{ marginBottom: 10 }}>
                    <p style={{ color: '#9ca3af', fontSize: 11, margin: '0 0 4px' }}>{t('admin.pos.sdp.student')}</p>
                    {!selectedParent ? (
                      <p style={{ color: '#f59e0b', fontSize: 13, margin: 0 }}>{t('admin.pos.selectCustomerFirst')}</p>
                    ) : sdpStudents.length === 0 ? (
                      <p style={{ color: '#f87171', fontSize: 13, margin: 0 }}>{t('admin.pos.sdp.noUci')}</p>
                    ) : (
                      <select value={sdpStudentId || ''} onChange={e => setSdpStudentId(e.target.value)} style={sel0}>
                        {sdpStudents.map(s => <option key={s.id} value={s.id}>{s.full_name} · UCI {s.uci_number}</option>)}
                      </select>
                    )}
                  </div>
                  <div style={{ marginBottom: 10 }}>
                    <p style={{ color: '#9ca3af', fontSize: 11, margin: '0 0 4px' }}>{t('admin.pos.sdp.courseType')}</p>
                    <select value={sdpCourseTypeId || ''} onChange={e => setSdpCourseTypeId(e.target.value)} style={sel0}>
                      {sdpCourseTypes.map(ct => <option key={ct.id} value={ct.id}>{tDb(locale, 'course_types', ct.id, ct.name)}</option>)}
                    </select>
                  </div>
                  <div style={{ marginBottom: 10 }}>
                    <p style={{ color: '#9ca3af', fontSize: 11, margin: '0 0 4px' }}>{t('admin.pos.sdp.note')}</p>
                    <input value={sdpDesc} onChange={e => setSdpDesc(e.target.value)} placeholder={t('admin.pos.sdp.notePlaceholder')} style={sel0} />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <div>
                      <p style={{ color: '#9ca3af', fontSize: 11, margin: '0 0 4px' }}>{t('admin.pos.sessions')}</p>
                      <input type="number" min="1" value={sdpSessions} onChange={e => setSdpSessions(e.target.value)} style={sel0} />
                    </div>
                    <div>
                      <p style={{ color: '#9ca3af', fontSize: 11, margin: '0 0 4px' }}>{t('admin.pos.sdp.unitPrice')}</p>
                      <input type="number" min="1" step="0.01" value={sdpUnitPrice} onChange={e => setSdpUnitPrice(e.target.value)} style={sel0} />
                    </div>
                  </div>
                </div>
              )}
            </div>
            <div style={{ borderBottom: '1px solid #1e3a6e', paddingBottom: 14, marginBottom: 14 }}>
              <p style={{ color: '#6b7280', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 6px' }}>{t('admin.pos.team.eyebrow')}</p>
              <button onClick={() => { setIsTeam(!isTeam); setIsTrial(false); setIsSdp(false) }}
                style={{ width: '100%', padding: '12px', borderRadius: 8, textAlign: 'center', cursor: 'pointer', border: `2px solid ${isTeam ? GOLD : '#1e3a6e'}`, backgroundColor: isTeam ? GOLD : '#0d1829', transition: 'all 0.15s' }}>
                <p style={{ color: isTeam ? NAVY : '#9ca3af', fontSize: 11, fontWeight: 600, margin: 0 }}>{t('admin.pos.team.sub')}</p>
                <p style={{ color: isTeam ? NAVY : 'white', fontSize: 18, fontWeight: 700, margin: 0 }}>{t('admin.pos.perMonth', { price: teamTier ? `$${(teamTier.monthly_price_cents / 100).toLocaleString()}` : '$399' })}</p>
              </button>
              {isTeam && (
                <div style={{ marginTop: 12, padding: 14, backgroundColor: '#0d1829', borderRadius: 8, border: '1px solid #1e3a6e' }}>
                  <div style={{ marginBottom: 10 }}>
                    <p style={{ color: '#9ca3af', fontSize: 11, margin: '0 0 4px' }}>{t('admin.pos.student')}</p>
                    {!selectedParent ? (
                      <p style={{ color: '#f59e0b', fontSize: 13, margin: 0 }}>{t('admin.pos.selectCustomerFirst')}</p>
                    ) : students.length === 0 ? (
                      <p style={{ color: '#f87171', fontSize: 13, margin: 0 }}>{t('admin.pos.team.noStudents')}</p>
                    ) : (
                      <select value={selectedStudentId || ''} onChange={e => setSelectedStudentId(e.target.value)} style={sel0}>
                        <option value="">{t('admin.pos.team.selectStudent')}</option>
                        {students.map(s => <option key={s.id} value={s.id}>{s.full_name}</option>)}
                      </select>
                    )}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <div>
                      <p style={{ color: '#9ca3af', fontSize: 11, margin: '0 0 4px' }}>{t('admin.pos.team.tier')}</p>
                      <select value={teamTierId || ''} onChange={e => setTeamTierId(e.target.value)} style={sel0}>
                        {teamTiers.map(tier => <option key={tier.id} value={tier.id}>{tDb(locale, 'team_tiers', tier.id, tier.name)}</option>)}
                      </select>
                    </div>
                    <div>
                      <p style={{ color: '#9ca3af', fontSize: 11, margin: '0 0 4px' }}>{t('admin.pos.team.months')}</p>
                      <input type="number" min="1" max="12" value={teamMonths} onChange={e => setTeamMonths(e.target.value)} style={sel0} />
                    </div>
                  </div>
                  {teamStudent && teamTier && (
                    <p style={{ fontSize: 11, margin: '8px 0 0', color: teamOverrideReasons.length > 0 ? '#fbbf24' : '#10b981' }}>
                      {teamOverrideReasons.length > 0
                        ? `\u26a0 ${teamOverrideReasons.join(' · ')}`
                        : t('admin.pos.team.matches', { band: tierBandLabel(teamTier, t('plans.team.stageWord')) })}
                    </p>
                  )}
                  <p style={{ color: '#6b7280', fontSize: 11, margin: '10px 0 0' }}>{t('admin.pos.team.extendsHint')}</p>
                </div>
              )}
            </div>
            <div style={{ opacity: (isTrial || isSdp || isTeam) ? 0.35 : 1, transition: 'opacity 0.2s', pointerEvents: (isTrial || isSdp || isTeam) ? 'none' : 'auto' }}>
              <p style={{ color: '#6b7280', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 6px' }}>{t('admin.pos.points')}</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginBottom: 10 }}>
                {TOPUP_PRESETS.map(preset => {
                  const sel = topup === preset
                  return (
                    <button key={preset} onClick={() => { setTopupDollars(String(preset)); setIsTrial(false); setIsTeam(false) }}
                      style={{ padding: '10px 8px', borderRadius: 8, textAlign: 'center', cursor: 'pointer', border: `1px solid ${sel ? GOLD : '#1e3a6e'}`, backgroundColor: sel ? GOLD : '#0d1829' }}>
                      <p style={{ color: sel ? NAVY : 'white', fontSize: 15, fontWeight: 700, margin: 0 }}>${preset.toLocaleString()}</p>
                      <p style={{ color: sel ? NAVY : '#9ca3af', fontSize: 11, margin: 0 }}>{t('admin.pos.ptsN', { n: preset.toLocaleString() })}</p>
                    </button>
                  )
                })}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div>
                  <p style={{ color: '#9ca3af', fontSize: 11, margin: '0 0 4px' }}>{t('admin.pos.amountPaid')}</p>
                  <input type="number" min={MIN_TOPUP_DOLLARS} max={MAX_TOPUP_DOLLARS} value={topupDollars}
                    onChange={e => setTopupDollars(e.target.value)} style={sel0} />
                </div>
                <div>
                  <p style={{ color: '#9ca3af', fontSize: 11, margin: '0 0 4px' }}>{t('admin.pos.bonusPoints')}</p>
                  <input type="number" min="0" value={bonusPoints} placeholder="0"
                    onChange={e => setBonusPoints(e.target.value)} style={sel0} />
                </div>
              </div>
              <p style={{ color: topupValid ? '#6b7280' : '#fbbf24', fontSize: 11, margin: '8px 0 0' }}>
                {topupValid
                  ? t('admin.pos.walletReceives', { n: (topup + bonus).toLocaleString() }) + (bonus > 0 ? t('admin.pos.bonusNote', { n: bonus.toLocaleString() }) : t('admin.pos.refundable'))
                  : t('admin.pos.amountRange', { min: `$${MIN_TOPUP_DOLLARS}`, max: `$${MAX_TOPUP_DOLLARS.toLocaleString()}` })}
              </p>
            </div>

          </div>
        </div>
        <div style={{ backgroundColor: '#111d38', border: '1px solid #1e3a6e', borderRadius: 12, padding: 20 }}>
          <h2 style={{ color: 'white', fontWeight: 600, fontSize: 15, margin: '0 0 16px' }}>{t('admin.pos.summary')}</h2>
          <div style={{ borderBottom: '1px solid #1e3a6e', paddingBottom: 14, marginBottom: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ color: '#9ca3af', fontSize: 13 }}>{t('admin.pos.customer')}</span>
              <span style={{ color: 'white', fontSize: 13, fontWeight: 500 }}>{selectedParent ? `${selectedParent.first_name} ${selectedParent.last_name}` : '\u2014'}</span>
            </div>
            {isTeam ? (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ color: '#9ca3af', fontSize: 13 }}>{t('admin.pos.student')}</span>
                  <span style={{ color: 'white', fontSize: 13 }}>{selectedStudent?.full_name || '—'}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ color: '#9ca3af', fontSize: 13 }}>{t('admin.pos.membership')}</span>
                  <span style={{ color: 'white', fontSize: 13 }}>{teamTierName || '—'} × {t('admin.pos.monthsShort', { n: teamM })}</span>
                </div>
              </>
            ) : isSdp ? (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ color: '#9ca3af', fontSize: 13 }}>{t('admin.pos.student')}</span>
                  <span style={{ color: 'white', fontSize: 13 }}>{sdpStudents.find(s => s.id === sdpStudentId)?.full_name || '\u2014'}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ color: '#9ca3af', fontSize: 13 }}>{t('admin.pos.sessions')}</span>
                  <span style={{ color: 'white', fontSize: 13 }}>{sdpQty || '\u2014'} \u00d7 ${(sdpUnitCents / 100).toFixed(2)}</span>
                </div>
              </>
            ) : isTrial ? (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ color: '#9ca3af', fontSize: 13 }}>{t('admin.pos.student')}</span>
                  <span style={{ color: 'white', fontSize: 13 }}>{selectedStudent?.full_name || '\u2014'}</span>
                </div>
              </>
            ) : (
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#9ca3af', fontSize: 13 }}>{t('admin.pos.points')}</span>
                <span style={{ color: 'white', fontSize: 13 }}>{topupValid ? t('admin.pos.ptsN', { n: (topup + bonus).toLocaleString() }) + (bonus > 0 ? t('admin.pos.inclBonus', { n: bonus.toLocaleString() }) : '') : '\u2014'}</span>
              </div>
            )}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <span style={{ color: '#9ca3af' }}>{t('admin.pos.total')}</span>
            <span style={{ color: 'white', fontSize: 28, fontWeight: 700 }}>
              {isTeam ? `$${(teamAmountCents / 100).toLocaleString()}` : isSdp ? `$${(sdpAmountCents / 100).toLocaleString()}` : isTrial ? '$85' : topupValid ? `$${topup.toLocaleString()}` : '$\u2014'}
            </span>
          </div>
          <p style={{ color: '#6b7280', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 8px' }}>{t('admin.pos.paymentMethod')}</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 20 }}>
            {(['card', 'cash'] as const).map(m => (
              <button key={m} onClick={() => setPayMethod(m)}
                style={{ padding: '10px', borderRadius: 8, border: `1px solid ${payMethod === m ? GOLD : '#1e3a6e'}`, backgroundColor: payMethod === m ? GOLD : '#0d1829', color: payMethod === m ? NAVY : 'white', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>
                {m === 'card' ? t('admin.pos.pm.card') : t('admin.pos.pm.cash')}
              </button>
            ))}
          </div>
          {error && <p style={{ color: '#f87171', fontSize: 13, marginBottom: 12 }}>{error}</p>}
          <button onClick={() => handleCharge()} disabled={!canCharge}
            style={{ width: '100%', padding: 14, borderRadius: 10, fontWeight: 700, fontSize: 16, border: 'none', cursor: canCharge ? 'pointer' : 'not-allowed', backgroundColor: canCharge ? GOLD : '#374151', color: canCharge ? NAVY : '#6b7280', transition: 'all 0.15s' }}>
            {processing ? t('admin.pos.processing') : canCharge ? t('admin.pos.charge', { amount: `$${(chargeAmount / 100).toLocaleString()}` }) : isTeam ? t('admin.pos.cta.team') : isSdp ? t('admin.pos.cta.sdp') : isTrial ? t('admin.pos.cta.student') : !selectedParent ? t('admin.pos.cta.customer') : t('admin.pos.cta.amount')}
          </button>
          {payMethod === 'card' && readerStatus === 'none' && <p style={{ color: '#fbbf24', fontSize: 12, textAlign: 'center', marginTop: 8 }}>{t('admin.pos.noReader')}</p>}
          {payMethod === 'card' && readerStatus === 'connected' && <p style={{ color: '#10b981', fontSize: 12, textAlign: 'center', marginTop: 8 }}>{t('admin.pos.readerReady')}</p>}
        </div>
      </div>
    </div>
  )
}
