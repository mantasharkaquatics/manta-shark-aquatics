'use client'

import { useState, useRef, useEffect } from 'react'
import { LEGAL_VERSIONS } from '@/lib/legal'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

const DOB_MONTHS = ['01','02','03','04','05','06','07','08','09','10','11','12']
const DOB_MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function DobSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [y = '', m = '', d = ''] = (value || '').split('-')
  const nowYear = new Date().getFullYear()
  const years: number[] = []
  for (let yr = nowYear; yr >= nowYear - 100; yr--) years.push(yr)
  const daysInMonth = y && m ? new Date(Number(y), Number(m), 0).getDate() : 31
  const days: string[] = []
  for (let i = 1; i <= daysInMonth; i++) days.push(String(i).padStart(2, '0'))

  const emit = (ny: string, nm: string, nd: string) => {
    if (ny && nm && nd) {
      const maxD = new Date(Number(ny), Number(nm), 0).getDate()
      const clamped = Math.min(Number(nd), maxD)
      onChange(`${ny}-${nm}-${String(clamped).padStart(2, '0')}`)
    } else {
      onChange('')
    }
  }

  const selCls = "border border-gray-300 rounded-lg px-2 py-2 text-sm focus:outline-none focus:border-blue-500 bg-white"
  return (
    <div className="grid grid-cols-3 gap-2">
      <select value={m} onChange={e => emit(y, e.target.value, d)} className={selCls}>
        <option value="">Month</option>
        {DOB_MONTHS.map((mm, i) => <option key={mm} value={mm}>{DOB_MONTH_NAMES[i]}</option>)}
      </select>
      <select value={d} onChange={e => emit(y, m, e.target.value)} className={selCls}>
        <option value="">Day</option>
        {days.map(dd => <option key={dd} value={dd}>{Number(dd)}</option>)}
      </select>
      <select value={y} onChange={e => emit(e.target.value, m, d)} className={selCls}>
        <option value="">Year</option>
        {years.map(yr => <option key={yr} value={String(yr)}>{yr}</option>)}
      </select>
    </div>
  )
}


const US_STATES = ['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY']

export default function RegisterPage() {
  const supabase = createClient()
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
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
    if (students.length < 5) setStudents([...students, { fullName: '', dateOfBirth: '' }])
  }

  function updateStudent(i: number, field: string, value: string) {
    const updated = [...students]
    updated[i] = { ...updated[i], [field]: value }
    setStudents(updated)
  }

  async function sendEmailOtp() {
    if (!email.trim()) { setEmailError('Please enter your email first'); return }
    setEmailSending(true); setEmailError('')
    try {
      const res = await fetch('/api/auth/send-email-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, context: 'register' }),
      })
      const data = await res.json()
      if (!res.ok) { setEmailError(data.error || 'Failed to send'); setEmailSending(false); return }
      setEmailOtpSent(true)
      setEmailCooldown(60)
    } catch {
      setEmailError('Failed to send. Please try again later')
    }
    setEmailSending(false)
  }

  async function verifyEmailOtp() {
    if (!emailOtpCode.trim()) { setEmailError('Please enter the verification code'); return }
    setEmailVerifying(true); setEmailError('')
    try {
      const res = await fetch('/api/auth/verify-email-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, otp_code: emailOtpCode.trim() }),
      })
      const data = await res.json()
      if (!res.ok) { setEmailError(data.error || 'Verification failed'); setEmailVerifying(false); return }
      setEmailVerified(true)
    } catch {
      setEmailError('Verification failed. Please try again later')
    }
    setEmailVerifying(false)
  }

  async function sendPhoneOtp() {
    if (!phone.trim()) { setPhoneError('Please enter your phone number first'); return }
    setPhoneSending(true); setPhoneError('')
    try {
      const res = await fetch('/api/auth/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, context: 'register' }),
      })
      const data = await res.json()
      if (!res.ok) { setPhoneError(data.error || 'Failed to send'); setPhoneSending(false); return }
      setPhoneOtpSent(true)
      setPhoneCooldown(60)
    } catch {
      setPhoneError('Failed to send. Please try again later')
    }
    setPhoneSending(false)
  }

  async function verifyPhoneOtp() {
    if (!phoneOtpCode.trim()) { setPhoneError('Please enter the verification code'); return }
    setPhoneVerifying(true); setPhoneError('')
    try {
      const res = await fetch('/api/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, otp_code: phoneOtpCode.trim() }),
      })
      const data = await res.json()
      if (!res.ok) { setPhoneError(data.error || 'Verification failed'); setPhoneVerifying(false); return }
      setPhoneVerified(true)
    } catch {
      setPhoneError('Verification failed. Please try again later')
    }
    setPhoneVerifying(false)
  }

  function handleContinue() {
    if (!firstName || !lastName || !email || !phone || !password || !addressLine1 || !city || !state || !zipCode) {
      setError('Please fill in all required fields.'); return
    }
    if (!emailVerified) { setError('Please verify your email first'); return }
    if (!phoneVerified) { setError('Please verify your phone number first'); return }
    setError(''); setStep(2)
  }

  async function handleSubmit() {
    if (!termsAccepted || !waiverAccepted) { setError('Please accept the Terms of Service and Liability Waiver to continue.'); return }
    if (!students[0].fullName.trim()) { setError('Please enter at least one student name.'); return }
    setLoading(true); setError('')
    const now = new Date().toISOString()
    const { data: authData, error: authError } = await supabase.auth.signUp({ email, password })
    if (authError || !authData.user) { setError(authError?.message || 'Sign up failed'); setLoading(false); return }
    const { data: parent, error: parentError } = await supabase.from('parents').insert({
      auth_user_id: authData.user.id,
      first_name: firstName, last_name: lastName, email, phone: normalizePhoneForSave(phone),
      registered_at: now, terms_accepted_at: now, terms_version: LEGAL_VERSIONS.terms,
      waiver_accepted_at: now, waiver_version: LEGAL_VERSIONS.waiver,
      media_release_accepted: mediaAccepted, media_release_at: mediaAccepted ? now : null,
      newsletter_subscribed: newsletter, last_login_at: now,
      address_line1: addressLine1, address_line2: addressLine2 || null,
      city, state, zip_code: zipCode,
    }).select().single()
    if (parentError || !parent) { setError('Failed to create account: ' + parentError?.message); setLoading(false); return }
    let sortOrder = 1
    for (const s of students.filter(s => s.fullName.trim())) {
      await supabase.from('students').insert({
        parent_id: parent.id, full_name: s.fullName.trim(),
        date_of_birth: s.dateOfBirth || null, current_level: null, is_active: true,
        sort_order: sortOrder++,
      })
    }
    setLoading(false)
    router.push('/dashboard')
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center py-12 px-4">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 w-full max-w-lg p-8">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Create Account</h1>
          <p className="text-sm text-gray-500 mt-1">Step {step} of 2</p>
        </div>

        {step === 1 && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">First Name <span className="text-red-500">*</span></label>
                <input value={firstName} onChange={e => setFirstName(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Last Name <span className="text-red-500">*</span></label>
                <input value={lastName} onChange={e => setLastName(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500" />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email <span className="text-red-500">*</span></label>
              <div className="flex gap-2">
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} disabled={emailVerified}
                  className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500 disabled:bg-gray-50 disabled:text-gray-500" />
                {emailVerified ? (
                  <span className="flex items-center px-3 text-green-600 text-sm font-medium whitespace-nowrap">Verified</span>
                ) : (
                  <button type="button" onClick={sendEmailOtp} disabled={emailSending || emailCooldown > 0 || !email.trim()}
                    className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200 disabled:opacity-50 whitespace-nowrap">
                    {emailCooldown > 0 ? `${emailCooldown}s` : emailSending ? 'Sending...' : emailOtpSent ? 'Resend Code' : 'Send Verification Code'}
                  </button>
                )}
              </div>
              {emailOtpSent && !emailVerified && (
                <div className="flex gap-2 mt-2">
                  <input
                    type="text" inputMode="numeric" maxLength={6}
                    value={emailOtpCode}
                    onChange={e => setEmailOtpCode(e.target.value.replace(/\D/g, ''))}
                    placeholder="Enter the 6-digit code from your email"
                    className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm tracking-widest focus:outline-none focus:border-blue-500" />
                  <button type="button" onClick={verifyEmailOtp} disabled={emailVerifying || emailOtpCode.length !== 6}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 whitespace-nowrap">
                    {emailVerifying ? 'Verifying...' : 'Verify'}
                  </button>
                </div>
              )}
              {emailError && <p className="text-red-500 text-xs mt-1">{emailError}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Phone <span className="text-red-500">*</span></label>
              <div className="flex gap-2">
                <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} disabled={phoneVerified}
                  placeholder="(555) 123-4567"
                  className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500 disabled:bg-gray-50 disabled:text-gray-500" />
                {phoneVerified ? (
                  <span className="flex items-center px-3 text-green-600 text-sm font-medium whitespace-nowrap">Verified</span>
                ) : (
                  <button type="button" onClick={sendPhoneOtp} disabled={phoneSending || phoneCooldown > 0 || !phone.trim()}
                    className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200 disabled:opacity-50 whitespace-nowrap">
                    {phoneCooldown > 0 ? `${phoneCooldown}s` : phoneSending ? 'Sending...' : phoneOtpSent ? 'Resend Code' : 'Send Verification Code'}
                  </button>
                )}
              </div>
              {phoneOtpSent && !phoneVerified && (
                <div className="flex gap-2 mt-2">
                  <input
                    type="text" inputMode="numeric" maxLength={6}
                    value={phoneOtpCode}
                    onChange={e => setPhoneOtpCode(e.target.value.replace(/\D/g, ''))}
                    placeholder="Enter the 6-digit SMS code"
                    className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm tracking-widest focus:outline-none focus:border-blue-500" />
                  <button type="button" onClick={verifyPhoneOtp} disabled={phoneVerifying || phoneOtpCode.length !== 6}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 whitespace-nowrap">
                    {phoneVerifying ? 'Verifying...' : 'Verify'}
                  </button>
                </div>
              )}
              {phoneError && <p className="text-red-500 text-xs mt-1">{phoneError}</p>}
              <p className="text-xs text-gray-400 mt-2 leading-relaxed">By tapping &quot;Send Verification Code&quot;, you agree to receive a one-time passcode by SMS from Manta Shark Aquatics. Msg frequency: 1 msg per request. Msg &amp; data rates may apply. Reply HELP for help, STOP to opt out. Consent is not a condition of purchase. See our <a href="/privacy-policy" target="_blank" className="underline hover:text-gray-600">Privacy Policy</a> and <a href="/sms-terms" target="_blank" className="underline hover:text-gray-600">SMS Terms</a>.</p>
            </div>

            <div className="border-t border-gray-100 pt-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Home Address (US Only)</p>
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Address Line 1 <span className="text-red-500">*</span></label>
                  <div className="relative">
                    <input
                      ref={addressInputRef}
                      value={addressLine1}
                      onChange={e => handleAddressInput(e.target.value)}
                      onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                      placeholder="Start typing your address..."
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500" />
                    {showSuggestions && suggestions.length > 0 && (
                      <ul className="absolute z-50 w-full bg-white border border-gray-200 rounded-lg shadow-lg mt-1 max-h-48 overflow-y-auto">
                        {suggestions.map((s: any) => (
                          <li key={s.place_id}
                            onMouseDown={() => selectSuggestion(s.place_id, s.description)}
                            className="px-3 py-2 text-sm text-gray-700 hover:bg-blue-50 cursor-pointer">
                            {s.description}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Address Line 2 <span className="text-gray-400 font-normal">(Optional)</span></label>
                  <input value={addressLine2} onChange={e => setAddressLine2(e.target.value)}
                    placeholder="Apt, Suite, Unit, etc."
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">City <span className="text-red-500">*</span></label>
                    <input value={city} onChange={e => setCity(e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">ZIP Code <span className="text-red-500">*</span></label>
                    <input value={zipCode} onChange={e => setZipCode(e.target.value)}
                      placeholder="90210" maxLength={10}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">State <span className="text-red-500">*</span></label>
                  <select value={state} onChange={e => setState(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500 bg-white">
                    <option value="">Select state...</option>
                    {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Password <span className="text-red-500">*</span></label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500" />
            </div>
            {error && <p className="text-red-500 text-sm">{error}</p>}
            <button
              onClick={handleContinue}
              disabled={!emailVerified || !phoneVerified}
              className="w-full bg-blue-600 text-white py-2.5 rounded-lg font-medium hover:bg-blue-700 transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {(!emailVerified || !phoneVerified) ? 'Verify your email and phone to continue' : 'Continue →'}
            </button>
            <p className="text-center text-sm text-gray-500">
              Already have an account? <Link href="/login" className="text-blue-600 hover:underline">Sign in</Link>
            </p>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            {students.map((s, i) => (
              <div key={i} className="border border-gray-200 rounded-xl p-4">
                <p className="text-sm font-semibold text-gray-700 mb-3">Student {i + 1} {i === 0 && <span className="text-red-500">*</span>}</p>
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm text-gray-600 mb-1">Full Name</label>
                    <input value={s.fullName} onChange={e => updateStudent(i, 'fullName', e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500" />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-600 mb-1">Date of Birth</label>
                    <DobSelect value={s.dateOfBirth} onChange={v => updateStudent(i, 'dateOfBirth', v)} />
                  </div>
                </div>
              </div>
            ))}
            {students.length < 3 && (
              <button onClick={addStudent} className="w-full border-2 border-dashed border-gray-300 rounded-xl py-2.5 text-sm text-gray-500 hover:border-blue-400 hover:text-blue-500 transition-colors">
                + Add Another Student
              </button>
            )}
            <div className="space-y-3 pt-2">
              <label className="flex items-start gap-3 cursor-pointer">
                <input type="checkbox" checked={termsAccepted} onChange={e => setTermsAccepted(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600" />
                <span className="text-sm text-gray-600">I have read and agree to the <Link href="/terms" target="_blank" className="text-blue-600 hover:underline">Terms of Service</Link> and <Link href="/policies" target="_blank" className="text-blue-600 hover:underline">School Policies</Link><span className="text-red-500 ml-1">*</span></span>
              </label>
              <label className="flex items-start gap-3 cursor-pointer">
                <input type="checkbox" checked={waiverAccepted} onChange={e => setWaiverAccepted(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600" />
                <span className="text-sm text-gray-600">I have read and agree to the <Link href="/waiver" target="_blank" className="text-blue-600 hover:underline">Liability Waiver</Link>, signing electronically as parent/legal guardian<span className="text-red-500 ml-1">*</span></span>
              </label>
              <label className="flex items-start gap-3 cursor-pointer">
                <input type="checkbox" checked={mediaAccepted} onChange={e => setMediaAccepted(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600" />
                <span className="text-sm text-gray-600">(Optional) I agree to the <Link href="/media-release" target="_blank" className="text-blue-600 hover:underline">Photo & Video Release</Link></span>
              </label>
              <label className="flex items-start gap-3 cursor-pointer">
                <input type="checkbox" checked={newsletter} onChange={e => setNewsletter(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600" />
                <span className="text-sm text-gray-600">Subscribe to newsletter</span>
              </label>
            </div>
            {error && <p className="text-red-500 text-sm">{error}</p>}
            <div className="flex gap-3 pt-2">
              <button onClick={() => { setStep(1); setError('') }}
                className="flex-1 border border-gray-300 text-gray-700 py-2.5 rounded-lg font-medium hover:bg-gray-50 transition-colors text-sm">← Back</button>
              <button onClick={handleSubmit} disabled={loading}
                className="flex-1 bg-blue-600 text-white py-2.5 rounded-lg font-medium hover:bg-blue-700 transition-colors text-sm disabled:opacity-50">
                {loading ? 'Creating...' : 'Create Account'}
              </button>
            </div>
            <p className="text-center text-sm text-gray-500">
              Already have an account? <Link href="/login" className="text-blue-600 hover:underline">Sign in</Link>
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
