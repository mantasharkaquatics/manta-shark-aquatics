'use client'

import { useState, useRef, useEffect } from 'react'
import Image from 'next/image'
import { LEGAL_VERSIONS } from '@/lib/legal'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useT, useLocale } from '@/lib/i18n/provider'
import { errorKey } from '@/lib/i18n/errors'
import PasswordField from '@/components/ui/PasswordField'
import { getTodayLA } from '@/lib/date'
import { safeNext } from '@/lib/safe-next'
import { REFERRAL_POINTS } from '@/lib/points'

// A friend's link is remembered for 30 days (owner, 2026-09-29): families
// often open it, look around, and come back later from the home page. Kept in
// this browser only; the server still checks the code when it is used.
const REF_KEY = 'msa_ref'
const REF_DAYS = 30
function rememberReferral(code: string) {
  try { localStorage.setItem(REF_KEY, JSON.stringify({ code, exp: Date.now() + REF_DAYS * 864e5 })) } catch {}
}
function readRememberedReferral(): string | null {
  try {
    const v = JSON.parse(localStorage.getItem(REF_KEY) || 'null')
    if (v && typeof v.code === 'string' && v.exp > Date.now()) return v.code
    localStorage.removeItem(REF_KEY)
  } catch {}
  return null
}
function forgetReferral() {
  try { localStorage.removeItem(REF_KEY) } catch {}
}

const DOB_MONTHS = ['01','02','03','04','05','06','07','08','09','10','11','12']
const DOB_MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function DobSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const t = useT()
  const [vy = '', vm = '', vd = ''] = (value || '').split('-')
  const [y, setY] = useState(vy)
  const [m, setM] = useState(vm)
  const [d, setD] = useState(vd)
  // A birthday cannot be in the future: this year only offers the months so
  // far, and this month only the days so far (school's own time zone).
  const [ty, tm, td] = getTodayLA().split('-')
  const nowYear = Number(ty)
  const years: number[] = []
  for (let yr = nowYear; yr >= nowYear - 100; yr--) years.push(yr)
  const months = y === ty ? DOB_MONTHS.filter(mm => mm <= tm) : DOB_MONTHS
  const lastDay = (yy: string, mm: string) => {
    const n = yy && mm ? new Date(Number(yy), Number(mm), 0).getDate() : 31
    return yy === ty && mm === tm ? Math.min(n, Number(td)) : n
  }
  const daysInMonth = lastDay(y, m)
  const days: string[] = []
  for (let i = 1; i <= daysInMonth; i++) days.push(String(i).padStart(2, '0'))

  const emit = (ny: string, nm: string, nd: string) => {
    // Switching to this year can leave a month that has not happened yet.
    if (ny === ty && nm && nm > tm) nm = ''
    let fd = nd
    if (ny && nm && nd) fd = String(Math.min(Number(nd), lastDay(ny, nm))).padStart(2, '0')
    setY(ny); setM(nm); setD(fd)
    onChange(ny && nm && fd ? `${ny}-${nm}-${fd}` : '')
  }

  const selCls = "bg-white border border-[#d5e0ef] text-[#16294a] placeholder-gray-400 focus:outline-none focus:border-[#2050a0] focus:ring-2 focus:ring-[#2050a0]/15 rounded-lg px-2 py-2.5 text-sm"
  return (
    <div className="grid grid-cols-3 gap-2">
      <select value={m} onChange={e => emit(y, e.target.value, d)} className={selCls}>
        <option value="">{t('register.dob.month')}</option>
        {months.map(mm => <option key={mm} value={mm}>{DOB_MONTH_NAMES[Number(mm) - 1]}</option>)}
      </select>
      <select value={d} onChange={e => emit(y, m, e.target.value)} className={selCls}>
        <option value="">{t('register.dob.day')}</option>
        {days.map(dd => <option key={dd} value={dd}>{Number(dd)}</option>)}
      </select>
      <select value={y} onChange={e => emit(e.target.value, m, d)} className={selCls}>
        <option value="">{t('register.dob.year')}</option>
        {years.map(yr => <option key={yr} value={String(yr)}>{yr}</option>)}
      </select>
    </div>
  )
}


const MAX_STUDENTS = 3

const US_STATES = ['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY']

export default function RegisterClient() {
  const t = useT()
  const locale = useLocale()
  const supabase = createClient()
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const tErr = (raw?: string | null, fallbackKey?: string): string => {
    const k = errorKey(raw)
    if (k) return t(k)
    if (raw) return raw
    return fallbackKey ? t(fallbackKey) : ''
  }

  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  // Typed twice so a slip on a phone keyboard does not lock a family out of
  // the account they are creating (owner, 2026-09-25).
  const [password2, setPassword2] = useState('')
  const [addressLine1, setAddressLine1] = useState('')
  const [addressLine2, setAddressLine2] = useState('')
  const [city, setCity] = useState('')
  const [state, setState] = useState('')
  const [zipCode, setZipCode] = useState('')

  const [emailOtpSent, setEmailOtpSent] = useState(false)
  const [emailOtpCode, setEmailOtpCode] = useState('')
  const [emailVerified, setEmailVerified] = useState(false)
  const [emailSending, setEmailSending] = useState(false)
  const [emailVerifying, setEmailVerifying] = useState(false)
  const [emailError, setEmailError] = useState('')
  const [emailCooldown, setEmailCooldown] = useState(0)

  const [phoneOtpSent, setPhoneOtpSent] = useState(false)
  const [phoneOtpCode, setPhoneOtpCode] = useState('')
  const [phoneVerified, setPhoneVerified] = useState(false)
  const [phoneSending, setPhoneSending] = useState(false)
  const [phoneVerifying, setPhoneVerifying] = useState(false)
  const [phoneError, setPhoneError] = useState('')
  const [phoneCooldown, setPhoneCooldown] = useState(0)

  const [students, setStudents] = useState([{ fullName: '', dateOfBirth: '' }])
  const [termsAccepted, setTermsAccepted] = useState(false)
  const [waiverAccepted, setWaiverAccepted] = useState(false)
  const [mediaAccepted, setMediaAccepted] = useState(false)
  const [newsletter, setNewsletter] = useState(true)
  // Referral code: prefilled from ?ref= when the family arrived by a shared
  // link, checked as it is typed, and bound to the new account by the server
  // once the account exists. It cannot be added after registration.
  //
  // Shown at the top of step 1 (owner, 2026-09-29): a family that came by a
  // friend's link sees at once that the invitation is applied and what it
  // earns, instead of discovering it -- or not -- on step 2.
  const [referralCode, setReferralCode] = useState('')
  const [referral, setReferral] = useState<{ valid: boolean; referrer?: string; byPhone?: boolean } | null>(null)
  const [referralChecking, setReferralChecking] = useState(false)
  // The input is hidden until asked for: most families have no referrer, and a
  // family whose link already applied one only needs it to change it.
  const [referralOpen, setReferralOpen] = useState(false)
  // A code that came from a link (or was remembered) and turned out not to
  // exist gets its own message: the family never typed anything.
  const [referralLinkBad, setReferralLinkBad] = useState(false)
  const referralFromLinkRef = useRef(false)
  // "Applied automatically" only while the code is the one the link brought.
  const [referralAuto, setReferralAuto] = useState(false)
  // The field takes the friend's code or the friend's phone number: letters
  // mean a code (6 characters), otherwise it is read as a phone number.
  const referralIsCode = /[A-Za-z]/.test(referralCode)
  const cleanReferral = (v: string) => /[A-Za-z]/.test(v)
    ? v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6)
    : v.replace(/[^0-9+()\-\s]/g, '').slice(0, 20)
  useEffect(() => {
    const ref = new URLSearchParams(window.location.search).get('ref')
    const code = ref ? ref.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6) : readRememberedReferral()
    if (ref && code) rememberReferral(code)
    if (code) { referralFromLinkRef.current = true; setReferralAuto(true); setReferralCode(code) }
  }, [])
  useEffect(() => {
    const code = referralCode.trim()
    setReferralChecking(false)
    if (!code) { setReferral(null); return }
    const ready = /[A-Za-z]/.test(code) ? code.length === 6 : code.replace(/\D/g, '').length >= 10
    if (!ready) { setReferral(null); return }
    setReferralChecking(true)
    const timer = setTimeout(async () => {
      try {
        const res = await fetch('/api/referrals/check', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }),
        })
        const r = await res.json()
        setReferral(r)
        if (!r?.valid && referralFromLinkRef.current) {
          // A dead link: forget it, and open the field so a phone number can
          // be typed instead.
          forgetReferral(); setReferralLinkBad(true); setReferralOpen(true)
        }
      } catch { setReferral(null) }
      referralFromLinkRef.current = false
      setReferralChecking(false)
    }, 350)
    return () => clearTimeout(timer)
  }, [referralCode])

  useEffect(() => {
    if (emailCooldown <= 0) return
    const t = setTimeout(() => setEmailCooldown(c => c - 1), 1000)
    return () => clearTimeout(t)
  }, [emailCooldown])

  useEffect(() => {
    if (phoneCooldown <= 0) return
    const t = setTimeout(() => setPhoneCooldown(c => c - 1), 1000)
    return () => clearTimeout(t)
  }, [phoneCooldown])

  useEffect(() => { setEmailVerified(false); setEmailOtpSent(false); setEmailOtpCode(''); setEmailError('') }, [email])
  useEffect(() => { setPhoneVerified(false); setPhoneOtpSent(false); setPhoneOtpCode(''); setPhoneError('') }, [phone])

  const addressInputRef = useRef<HTMLInputElement>(null)
  const [suggestions, setSuggestions] = useState<any[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const suggestTimer = useRef<any>(null)

  async function fetchSuggestions(input: string) {
    if (input.length < 3) { setSuggestions([]); return }
    try {
      const res = await fetch('/api/places/autocomplete?input=' + encodeURIComponent(input))
      const data = await res.json()
      setSuggestions(data.suggestions || [])
      setShowSuggestions(true)
    } catch {}
  }

  function handleAddressInput(val: string) {
    setAddressLine1(val)
    clearTimeout(suggestTimer.current)
    suggestTimer.current = setTimeout(() => fetchSuggestions(val), 300)
  }

  async function selectSuggestion(placeId: string, description: string) {
    setShowSuggestions(false)
    try {
      const res = await fetch('/api/places/details?place_id=' + placeId)
      const data = await res.json()
      if (data.address_line1) setAddressLine1(data.address_line1)
      if (data.city) setCity(data.city)
      if (data.state) setState(data.state)
      if (data.zip) setZipCode(data.zip)
    } catch {
      setAddressLine1(description)
    }
  }

  function addStudent() {
    if (students.length < MAX_STUDENTS) setStudents([...students, { fullName: '', dateOfBirth: '' }])
  }

  function updateStudent(i: number, field: string, value: string) {
    const updated = [...students]
    updated[i] = { ...updated[i], [field]: value }
    setStudents(updated)
  }

  async function sendEmailOtp() {
    if (!email.trim()) { setEmailError(t('register.err.enterEmail')); return }
    setEmailSending(true); setEmailError('')
    try {
      const res = await fetch('/api/auth/send-email-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, context: 'register' }),
      })
      const data = await res.json()
      if (!res.ok) { setEmailError(tErr(data.error, 'register.err.sendFailed')); setEmailSending(false); return }
      setEmailOtpSent(true)
      setEmailCooldown(60)
    } catch {
      setEmailError(t('register.err.sendFailedRetry'))
    }
    setEmailSending(false)
  }

  async function verifyEmailOtp() {
    if (!emailOtpCode.trim()) { setEmailError(t('register.err.enterCode')); return }
    setEmailVerifying(true); setEmailError('')
    try {
      const res = await fetch('/api/auth/verify-email-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, otp_code: emailOtpCode.trim() }),
      })
      const data = await res.json()
      if (!res.ok) { setEmailError(tErr(data.error, 'register.err.verifyFailed')); setEmailVerifying(false); return }
      setEmailVerified(true)
    } catch {
      setEmailError(t('register.err.verifyFailedRetry'))
    }
    setEmailVerifying(false)
  }

  async function sendPhoneOtp() {
    if (!phone.trim()) { setPhoneError(t('register.err.enterPhone')); return }
    setPhoneSending(true); setPhoneError('')
    try {
      const res = await fetch('/api/auth/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, context: 'register' }),
      })
      const data = await res.json()
      if (!res.ok) { setPhoneError(tErr(data.error, 'register.err.sendFailed')); setPhoneSending(false); return }
      setPhoneOtpSent(true)
      setPhoneCooldown(60)
    } catch {
      setPhoneError(t('register.err.sendFailedRetry'))
    }
    setPhoneSending(false)
  }

  async function verifyPhoneOtp() {
    if (!phoneOtpCode.trim()) { setPhoneError(t('register.err.enterCode')); return }
    setPhoneVerifying(true); setPhoneError('')
    try {
      const res = await fetch('/api/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, otp_code: phoneOtpCode.trim() }),
      })
      const data = await res.json()
      if (!res.ok) { setPhoneError(tErr(data.error, 'register.err.verifyFailed')); setPhoneVerifying(false); return }
      setPhoneVerified(true)
    } catch {
      setPhoneError(t('register.err.verifyFailedRetry'))
    }
    setPhoneVerifying(false)
  }

  function handleContinue() {
    if (!firstName || !lastName || !email || !phone || !password || !password2 || !addressLine1 || !city || !state || !zipCode) {
      setError(t('register.err.fillAll')); return
    }
    if (password !== password2) { setError(t('register.err.passwordMismatch')); return }
    if (!emailVerified) { setError(t('register.err.verifyEmail')); return }
    if (!phoneVerified) { setError(t('register.err.verifyPhone')); return }
    setError(''); setStep(2)
  }

  async function handleSubmit() {
    if (!termsAccepted || !waiverAccepted) { setError(t('register.err.acceptTerms')); return }
    if (!students[0].fullName.trim()) { setError(t('register.err.studentName')); return }
    // The birthday is required: the database will not store a swimmer without
    // one, and this page used to create the account and then lose the child in
    // silence when the birthday was left blank.
    if (students.some(s => s.fullName.trim() && !s.dateOfBirth)) { setError(t('register.err.studentDob')); return }
    if (students.some(s => s.dateOfBirth && s.dateOfBirth > getTodayLA())) { setError(t('register.err.dobFuture')); return }
    setLoading(true); setError('')
    const now = new Date().toISOString()
    const { data: authData, error: authError } = await supabase.auth.signUp({ email, password })
    if (authError || !authData.user) { setError(tErr(authError?.message, 'register.err.signupFailed')); setLoading(false); return }
    const { data: parent, error: parentError } = await supabase.from('parents').insert({
      auth_user_id: authData.user.id,
      first_name: firstName, last_name: lastName, email, phone: normalizePhoneForSave(phone),
      registered_at: now, terms_accepted_at: now, terms_version: LEGAL_VERSIONS.terms,
      waiver_accepted_at: now, waiver_version: LEGAL_VERSIONS.waiver,
      media_release_accepted: mediaAccepted, media_release_at: mediaAccepted ? now : null,
      newsletter_subscribed: newsletter, last_login_at: now, preferred_language: locale,
      address_line1: addressLine1, address_line2: addressLine2 || null,
      city, state, zip_code: zipCode,
    }).select().single()
    if (parentError || !parent) { setError(t('register.err.createFailed') + tErr(parentError?.message)); setLoading(false); return }
    let sortOrder = 1
    // A failed insert used to be ignored, so the family landed on a dashboard
    // with no child and no word about it. Now they are told, and the account --
    // which already exists -- can add the swimmer from My Account.
    let studentFailed = false
    for (const s of students.filter(s => s.fullName.trim())) {
      const { error: stuErr } = await supabase.from('students').insert({
        parent_id: parent.id, full_name: s.fullName.trim(),
        date_of_birth: s.dateOfBirth, current_level: null, is_active: true,
        sort_order: sortOrder++,
      })
      if (stuErr) { console.error('register: student insert failed', stuErr); studentFailed = true }
    }
    // Best effort: a code that fails here must not block the account, which
    // already exists. The server re-checks everything.
    if (referralCode.trim() && referral?.valid) {
      try {
        await fetch('/api/referrals/claim', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: referralCode.trim() }),
        })
      } catch {}
    }
    // Registered: a remembered link has done its job either way.
    forgetReferral()
    setLoading(false)
    // A swimmer did not save: open My Account with the add form ready, rather
    // than a dashboard that silently has one child fewer than they entered.
    router.push(studentFailed ? '/dashboard/account?add=1' : (safeNext() || '/dashboard'))
  }

  return (
    <div className="auth-shell auth-bg min-h-dvh flex items-center justify-center py-10 px-4">
      <div className="auth-card bg-white rounded-2xl w-full max-w-lg p-6 sm:p-8">
        <div className="text-center mb-8">
          <Link href="/" className="inline-block">
            <Image src="/logo.png" alt="Manta Shark Aquatics" width={204} height={106} className="mx-auto mb-2 object-cover" style={{ width: 204, height: 106 }} priority />
          </Link>
          <h1 className="text-2xl font-bold text-[#12254a] auth-title">{t('register.title')}</h1>
          <p className="text-sm text-[#56647d] mt-1">{t('register.step', { n: step })}</p>
        </div>

        {step === 1 && (
          <div className="space-y-4">
            {referral?.valid ? (
              <div className="rounded-xl border border-[#9fd8b8] bg-[#effaf3] px-4 py-3.5">
                <p className="font-bold text-[15px] text-[#14683f]">
                  <span aria-hidden="true" className="mr-1.5">{'\u{1F381}'}</span>{referral.byPhone || !referral.referrer ? t('register.ref.found') : t('register.ref.invitedBy', { name: referral.referrer })}
                </p>
                {referralIsCode && (
                  <p className="text-[13px] text-[#2f5a44] mt-1.5">
                    {t(referralAuto ? 'register.ref.applied' : 'register.ref.code')}{' '}
                    <span className="font-mono font-bold tracking-[0.2em] bg-white border border-dashed border-[#7cc49c] rounded px-2 py-0.5 text-[#14683f]">{referralCode}</span>
                  </p>
                )}
                <p className="text-[13px] text-[#2f5a44] mt-1.5 leading-relaxed">{t('register.ref.reward', { n: REFERRAL_POINTS })}</p>
                <p className="text-xs text-[#5b7a69] mt-2">{t('register.ref.fine')}</p>
                {!referralOpen && (
                  <button type="button" onClick={() => setReferralOpen(true)} className="tap-auto text-xs text-[#2050a0] underline mt-2">
                    {t('register.ref.change')}
                  </button>
                )}
              </div>
            ) : referralChecking && !referralOpen ? (
              <p className="text-sm text-[#56647d]">{t('register.ref.checking')}</p>
            ) : !referralOpen ? (
              <button type="button" onClick={() => setReferralOpen(true)} className="tap-auto text-sm font-bold text-[#2050a0]">
                {t('register.ref.ask')}
              </button>
            ) : null}
            {referralOpen && (
              <div>
                <label className="block text-sm font-medium text-[#16294a] mb-1">{t('register.referral')}</label>
                <input value={referralCode} onChange={e => { setReferralLinkBad(false); setReferralAuto(false); setReferralCode(cleanReferral(e.target.value)) }}
                  placeholder={t('register.referralPlaceholder')} autoCapitalize="characters" autoComplete="off"
                  className={`w-full bg-white border text-[#16294a] placeholder-gray-400 focus:outline-none rounded-lg px-3 py-2.5 text-sm ${referralIsCode ? 'tracking-[0.2em]' : ''} ${referral?.valid ? 'border-green-600' : referral && !referral.valid ? 'border-red-500' : 'border-[#d5e0ef] focus:border-[#2050a0] focus:ring-2 focus:ring-[#2050a0]/15'}`} />
                {referralLinkBad ? (
                  <p className="text-xs text-red-600 mt-1.5">{t('register.ref.linkBad')}</p>
                ) : referral && !referral.valid ? (
                  <p className="text-xs text-red-600 mt-1.5">{t('register.referralBad')}</p>
                ) : null}
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-[#16294a] mb-1">{t('register.firstName')} <span className="text-red-600">*</span></label>
                <input value={firstName} onChange={e => setFirstName(e.target.value)}
                  className="w-full bg-white border border-[#d5e0ef] text-[#16294a] placeholder-gray-400 focus:outline-none focus:border-[#2050a0] focus:ring-2 focus:ring-[#2050a0]/15 rounded-lg px-3 py-2.5 text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#16294a] mb-1">{t('register.lastName')} <span className="text-red-600">*</span></label>
                <input value={lastName} onChange={e => setLastName(e.target.value)}
                  className="w-full bg-white border border-[#d5e0ef] text-[#16294a] placeholder-gray-400 focus:outline-none focus:border-[#2050a0] focus:ring-2 focus:ring-[#2050a0]/15 rounded-lg px-3 py-2.5 text-sm" />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-[#16294a] mb-1">{t('register.email')} <span className="text-red-600">*</span></label>
              {/* "Send Verification Code" will not wrap, so beside it the email
                  field was squeezed to about a third of a phone screen -- you
                  could not see the address you were typing. Stacked below sm. */}
              <div className="flex flex-col sm:flex-row gap-2">
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} disabled={emailVerified}
                  className="flex-1 bg-white border border-[#d5e0ef] text-[#16294a] placeholder-gray-400 focus:outline-none focus:border-[#2050a0] focus:ring-2 focus:ring-[#2050a0]/15 rounded-lg px-3 py-2.5 text-sm disabled:opacity-60" />
                {emailVerified ? (
                  <span className="flex items-center px-3 text-green-700 text-sm font-medium whitespace-nowrap">{t('register.verified')}</span>
                ) : (
                  <button type="button" onClick={sendEmailOtp} disabled={emailSending || emailCooldown > 0 || !email.trim()}
                    className="px-4 min-h-11 bg-[#12254a] text-white rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50 whitespace-nowrap">
                    {emailCooldown > 0 ? t('register.cooldown', { n: emailCooldown }) : emailSending ? t('register.sending') : emailOtpSent ? t('register.resendCode') : t('register.sendCode')}
                  </button>
                )}
              </div>
              {emailOtpSent && !emailVerified && (
                <div className="flex gap-2 mt-2">
                  <input
                    type="text" inputMode="numeric" maxLength={6}
                    value={emailOtpCode}
                    onChange={e => setEmailOtpCode(e.target.value.replace(/\D/g, ''))}
                    placeholder={t('register.emailCodePh')}
                    className="flex-1 bg-white border border-[#d5e0ef] text-[#16294a] placeholder-gray-400 focus:outline-none focus:border-[#2050a0] focus:ring-2 focus:ring-[#2050a0]/15 rounded-lg px-3 py-2.5 text-sm tracking-widest" />
                  <button type="button" onClick={verifyEmailOtp} disabled={emailVerifying || emailOtpCode.length !== 6}
                    className="px-4 min-h-11 bg-[#f09800] hover:bg-[#d98900] text-[#12254a] rounded-lg text-sm font-bold hover:opacity-90 disabled:opacity-50 whitespace-nowrap">
                    {emailVerifying ? t('register.verifying') : t('register.verify')}
                  </button>
                </div>
              )}
              {emailError && <p className="text-red-600 text-xs mt-1">{emailError}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-[#16294a] mb-1">{t('register.phone')} <span className="text-red-600">*</span></label>
              {/* "Send Verification Code" will not wrap, so beside it the email
                  field was squeezed to about a third of a phone screen -- you
                  could not see the address you were typing. Stacked below sm. */}
              <div className="flex flex-col sm:flex-row gap-2">
                <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} disabled={phoneVerified}
                  placeholder="(555) 123-4567"
                  className="flex-1 bg-white border border-[#d5e0ef] text-[#16294a] placeholder-gray-400 focus:outline-none focus:border-[#2050a0] focus:ring-2 focus:ring-[#2050a0]/15 rounded-lg px-3 py-2.5 text-sm disabled:opacity-60" />
                {phoneVerified ? (
                  <span className="flex items-center px-3 text-green-700 text-sm font-medium whitespace-nowrap">{t('register.verified')}</span>
                ) : (
                  <button type="button" onClick={sendPhoneOtp} disabled={phoneSending || phoneCooldown > 0 || !phone.trim()}
                    className="px-4 min-h-11 bg-[#12254a] text-white rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50 whitespace-nowrap">
                    {phoneCooldown > 0 ? t('register.cooldown', { n: phoneCooldown }) : phoneSending ? t('register.sending') : phoneOtpSent ? t('register.resendCode') : t('register.sendCode')}
                  </button>
                )}
              </div>
              {phoneOtpSent && !phoneVerified && (
                <div className="flex gap-2 mt-2">
                  <input
                    type="text" inputMode="numeric" maxLength={6}
                    value={phoneOtpCode}
                    onChange={e => setPhoneOtpCode(e.target.value.replace(/\D/g, ''))}
                    placeholder={t('register.smsCodePh')}
                    className="flex-1 bg-white border border-[#d5e0ef] text-[#16294a] placeholder-gray-400 focus:outline-none focus:border-[#2050a0] focus:ring-2 focus:ring-[#2050a0]/15 rounded-lg px-3 py-2.5 text-sm tracking-widest" />
                  <button type="button" onClick={verifyPhoneOtp} disabled={phoneVerifying || phoneOtpCode.length !== 6}
                    className="px-4 min-h-11 bg-[#f09800] hover:bg-[#d98900] text-[#12254a] rounded-lg text-sm font-bold hover:opacity-90 disabled:opacity-50 whitespace-nowrap">
                    {phoneVerifying ? t('register.verifying') : t('register.verify')}
                  </button>
                </div>
              )}
              {phoneError && <p className="text-red-600 text-xs mt-1">{phoneError}</p>}
              <p className="text-xs text-[#56647d] mt-2 leading-relaxed">{t('register.sms.body')}<a href="/privacy-policy" target="_blank" className="underline hover:text-[#2050a0]">{t('register.sms.privacy')}</a>{t('register.sms.mid')}<a href="/sms-terms" target="_blank" className="underline hover:text-[#2050a0]">{t('register.sms.terms')}</a>{t('register.sms.end')}</p>
            </div>

            <div className="border-t border-[#d5e0ef] pt-4">
              <p className="text-xs font-semibold text-[#2050a0] uppercase tracking-wider mb-3">{t('register.addrHeading')}</p>
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-[#16294a] mb-1">{t('register.addr1')} <span className="text-red-600">*</span></label>
                  <div className="relative">
                    <input
                      ref={addressInputRef}
                      value={addressLine1}
                      onChange={e => handleAddressInput(e.target.value)}
                      onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                      placeholder={t('register.addrPh')}
                      className="w-full bg-white border border-[#d5e0ef] text-[#16294a] placeholder-gray-400 focus:outline-none focus:border-[#2050a0] focus:ring-2 focus:ring-[#2050a0]/15 rounded-lg px-3 py-2.5 text-sm" />
                    {showSuggestions && suggestions.length > 0 && (
                      <ul className="absolute z-50 w-full bg-white border border-[#d5e0ef] rounded-lg shadow-lg mt-1 max-h-56 overflow-y-auto">
                        {suggestions.map((s: any) => (
                          <li key={s.place_id}
                            onMouseDown={() => selectSuggestion(s.place_id, s.description)}
                            className="px-3 py-2.5 text-sm text-[#16294a] hover:bg-[#f6f9fd] cursor-pointer">
                            {s.description}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#16294a] mb-1">{t('register.addr2')} <span className="text-[#56647d] font-normal">{t('register.optional')}</span></label>
                  <input value={addressLine2} onChange={e => setAddressLine2(e.target.value)}
                    placeholder={t('register.aptPh')}
                    className="w-full bg-white border border-[#d5e0ef] text-[#16294a] placeholder-gray-400 focus:outline-none focus:border-[#2050a0] focus:ring-2 focus:ring-[#2050a0]/15 rounded-lg px-3 py-2.5 text-sm" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-[#16294a] mb-1">{t('register.city')} <span className="text-red-600">*</span></label>
                    <input value={city} onChange={e => setCity(e.target.value)}
                      className="w-full bg-white border border-[#d5e0ef] text-[#16294a] placeholder-gray-400 focus:outline-none focus:border-[#2050a0] focus:ring-2 focus:ring-[#2050a0]/15 rounded-lg px-3 py-2.5 text-sm" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[#16294a] mb-1">{t('register.zip')} <span className="text-red-600">*</span></label>
                    <input value={zipCode} onChange={e => setZipCode(e.target.value)}
                      placeholder="90210" maxLength={10}
                      className="w-full bg-white border border-[#d5e0ef] text-[#16294a] placeholder-gray-400 focus:outline-none focus:border-[#2050a0] focus:ring-2 focus:ring-[#2050a0]/15 rounded-lg px-3 py-2.5 text-sm" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#16294a] mb-1">{t('register.state')} <span className="text-red-600">*</span></label>
                  <select value={state} onChange={e => setState(e.target.value)}
                    className="w-full bg-white border border-[#d5e0ef] text-[#16294a] placeholder-gray-400 focus:outline-none focus:border-[#2050a0] focus:ring-2 focus:ring-[#2050a0]/15 rounded-lg px-3 py-2.5 text-sm">
                    <option value="">{t('register.selectState')}</option>
                    {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>
            </div>

            {/* Side by side on a computer, one under the other on a phone. */}
            <div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-[#16294a] mb-1">{t('register.password')} <span className="text-red-600">*</span></label>
                  <PasswordField value={password} onChange={setPassword} autoComplete="new-password"
                    className="w-full bg-white border border-[#d5e0ef] text-[#16294a] placeholder-gray-400 focus:outline-none focus:border-[#2050a0] focus:ring-2 focus:ring-[#2050a0]/15 rounded-lg px-3 py-2.5 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#16294a] mb-1">{t('register.passwordConfirm')} <span className="text-red-600">*</span></label>
                  <PasswordField value={password2} onChange={setPassword2} autoComplete="new-password"
                    className={"w-full bg-white border border-[#d5e0ef] text-[#16294a] placeholder-gray-400 focus:outline-none focus:border-[#2050a0] focus:ring-2 focus:ring-[#2050a0]/15 rounded-lg px-3 py-2.5 text-sm" + (password2 && password2 !== password ? ' !border-red-500' : '')} />
                </div>
              </div>
              {password2 && (password2 === password
                ? <p className="text-green-700 text-xs mt-1.5">✓ {t('register.passwordMatch')}</p>
                : <p className="text-red-600 text-xs mt-1.5">{t('register.err.passwordMismatch')}</p>)}
            </div>
            {error && <p className="text-red-600 text-sm">{error}</p>}
            <button
              onClick={handleContinue}
              disabled={!emailVerified || !phoneVerified}
              className="w-full bg-[#f09800] hover:bg-[#d98900] text-[#12254a] py-3 rounded-lg font-bold hover:opacity-90 transition text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {(!emailVerified || !phoneVerified) ? t('register.verifyFirst') : t('register.continue')}
            </button>
            <p className="text-center text-sm text-[#56647d]">
              {t('register.haveAccount')} <Link href="/login" className="text-[#2050a0] hover:underline font-semibold">{t('register.signIn')}</Link>
            </p>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            {students.map((s, i) => (
              <div key={i} className="border border-[#d5e0ef] rounded-xl p-4">
                <p className="text-sm font-semibold text-[#16294a] mb-3">{t('register.student', { n: i + 1 })} {i === 0 && <span className="text-red-600">*</span>}</p>
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm text-[#56647d] mb-1">{t('register.fullName')}</label>
                    <input value={s.fullName} onChange={e => updateStudent(i, 'fullName', e.target.value)}
                      className="w-full bg-white border border-[#d5e0ef] text-[#16294a] placeholder-gray-400 focus:outline-none focus:border-[#2050a0] focus:ring-2 focus:ring-[#2050a0]/15 rounded-lg px-3 py-2.5 text-sm" />
                  </div>
                  <div>
                    <label className="block text-sm text-[#56647d] mb-1">{t('register.dob')} <span className="text-red-600">*</span></label>
                    <DobSelect value={s.dateOfBirth} onChange={v => updateStudent(i, 'dateOfBirth', v)} />
                  </div>
                </div>
              </div>
            ))}
            {students.length < MAX_STUDENTS && (
              <button onClick={addStudent} className="w-full border-2 border-dashed border-[#c9d8ee] rounded-xl py-3 text-sm text-[#56647d] hover:border-[#2050a0] hover:text-[#2050a0] transition-colors">
                {t('register.addStudent')}
              </button>
            )}
            <div className="space-y-3 pt-2">
              <label className="flex items-start gap-3 cursor-pointer">
                <input type="checkbox" checked={termsAccepted} onChange={e => setTermsAccepted(e.target.checked)}
                  className="mt-0.5 h-5 w-5 shrink-0 rounded border-[#d5e0ef] bg-white accent-[#2050a0]" />
                <span className="text-sm text-[#16294a]">{t('register.terms.pre')}<Link href="/terms" target="_blank" className="text-[#2050a0] hover:underline font-semibold">{t('register.terms.tos')}</Link>{t('register.terms.mid')}<Link href="/policies" target="_blank" className="text-[#2050a0] hover:underline font-semibold">{t('register.terms.policies')}</Link><span className="text-red-600 ml-1">*</span></span>
              </label>
              <label className="flex items-start gap-3 cursor-pointer">
                <input type="checkbox" checked={waiverAccepted} onChange={e => setWaiverAccepted(e.target.checked)}
                  className="mt-0.5 h-5 w-5 shrink-0 rounded border-[#d5e0ef] bg-white accent-[#2050a0]" />
                <span className="text-sm text-[#16294a]">{t('register.waiver.pre')}<Link href="/waiver" target="_blank" className="text-[#2050a0] hover:underline font-semibold">{t('register.waiver.link')}</Link>{t('register.waiver.post')}<span className="text-red-600 ml-1">*</span></span>
              </label>
              <label className="flex items-start gap-3 cursor-pointer">
                <input type="checkbox" checked={mediaAccepted} onChange={e => setMediaAccepted(e.target.checked)}
                  className="mt-0.5 h-5 w-5 shrink-0 rounded border-[#d5e0ef] bg-white accent-[#2050a0]" />
                <span className="text-sm text-[#16294a]">{t('register.media.pre')}<Link href="/media-release" target="_blank" className="text-[#2050a0] hover:underline font-semibold">{t('register.media.link')}</Link></span>
              </label>
              <label className="flex items-start gap-3 cursor-pointer">
                <input type="checkbox" checked={newsletter} onChange={e => setNewsletter(e.target.checked)}
                  className="mt-0.5 h-5 w-5 shrink-0 rounded border-[#d5e0ef] bg-white accent-[#2050a0]" />
                <span className="text-sm text-[#16294a]">{t('register.newsletter')}</span>
              </label>
            </div>
            {error && <p className="text-red-600 text-sm">{error}</p>}
            <div className="flex gap-3 pt-2">
              <button onClick={() => { setStep(1); setError('') }}
                className="flex-1 border border-[#d5e0ef] text-[#16294a] py-3 rounded-lg font-semibold hover:bg-[#f6f9fd] transition-colors text-sm">{t('register.back')}</button>
              <button onClick={handleSubmit} disabled={loading}
                className="flex-1 bg-[#f09800] hover:bg-[#d98900] text-[#12254a] py-3 rounded-lg font-bold hover:opacity-90 transition text-sm disabled:opacity-50">
                {loading ? t('register.creating') : t('register.createAccount')}
              </button>
            </div>
            <p className="text-center text-sm text-[#56647d]">
              {t('register.haveAccount')} <Link href="/login" className="text-[#2050a0] hover:underline font-semibold">{t('register.signIn')}</Link>
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

function normalizePhoneForSave(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (digits.length === 10) return '+1' + digits
  if (digits.length === 11 && digits.startsWith('1')) return '+' + digits
  return phone.startsWith('+') ? phone : '+' + digits
}
