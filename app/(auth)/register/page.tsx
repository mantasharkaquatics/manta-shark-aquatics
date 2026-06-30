'use client'

import { useState, useRef, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

const US_STATES = ['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY']

export default function RegisterPage() {
  const supabase = createClient()
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Step 1
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

  // Step 2
  const [students, setStudents] = useState([{ fullName: '', dateOfBirth: '' }])
  const [otpCode, setOtpCode] = useState('')
  const [otpError, setOtpError] = useState('')
  const [otpSending, setOtpSending] = useState(false)
  const [otpVerifying, setOtpVerifying] = useState(false)
  const [resendCooldown, setResendCooldown] = useState(0)
  const [termsAccepted, setTermsAccepted] = useState(false)
  const [newsletter, setNewsletter] = useState(true)

  useEffect(() => {
    if (resendCooldown <= 0) return
    const t = setTimeout(() => setResendCooldown(c => c - 1), 1000)
    return () => clearTimeout(t)
  }, [resendCooldown])

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

  async function handleSubmit() {
    if (!termsAccepted) { setError('Please accept the terms & conditions to continue.'); return }
    if (!students[0].fullName.trim()) { setError('Please enter at least one student name.'); return }
    setLoading(true); setError('')
    const now = new Date().toISOString()
    const { data: authData, error: authError } = await supabase.auth.signUp({ email, password })
    if (authError || !authData.user) { setError(authError?.message || 'Sign up failed'); setLoading(false); return }
    const { data: parent, error: parentError } = await supabase.from('parents').insert({
      auth_user_id: authData.user.id,
      first_name: firstName, last_name: lastName, email, phone,
      registered_at: now, terms_accepted_at: now,
      newsletter_subscribed: newsletter, last_login_at: now,
      address_line1: addressLine1, address_line2: addressLine2 || null,
      city, state, zip_code: zipCode,
    }).select().single()
    if (parentError || !parent) { setError('Failed to create account: ' + parentError?.message); setLoading(false); return }
    for (const s of students.filter(s => s.fullName.trim())) {
      await supabase.from('students').insert({
        parent_id: parent.id, full_name: s.fullName.trim(),
        date_of_birth: s.dateOfBirth || null, current_level: null, is_active: true,
      })
    }

    // 發送簡訊 OTP（若有手機號碼），同時 Supabase 已自動寄出 email 確認信
    if (phone) {
      setOtpSending(true)
      try {
        await fetch('/api/auth/send-otp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone }),
        })
        setResendCooldown(60)
      } catch {}
      setOtpSending(false)
      setLoading(false)
      setStep(3)
      return
    }

    setLoading(false)
    router.push('/dashboard')
  }

  async function handleVerifyOtp() {
    if (!otpCode.trim()) { setOtpError('請輸入驗證碼'); return }
    setOtpVerifying(true); setOtpError('')
    try {
      const res = await fetch('/api/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, otp_code: otpCode.trim() }),
      })
      const data = await res.json()
      if (!res.ok) { setOtpError(data.error || '驗證失敗'); setOtpVerifying(false); return }
      router.push('/dashboard')
    } catch {
      setOtpError('驗證失敗，請稍後再試')
      setOtpVerifying(false)
    }
  }

  async function handleResendOtp() {
    if (resendCooldown > 0) return
    setOtpSending(true); setOtpError('')
    try {
      await fetch('/api/auth/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone }),
      })
      setResendCooldown(60)
    } catch {
      setOtpError('發送失敗，請稍後再試')
    }
    setOtpSending(false)
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
              <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
              <input type="tel" value={phone} onChange={e => setPhone(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500" />
            </div>

            {/* Address */}
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
              onClick={() => {
                if (!firstName || !lastName || !email || !password || !addressLine1 || !city || !state || !zipCode) {
                  setError('Please fill in all required fields.'); return
                }
                setError(''); setStep(2)
              }}
              className="w-full bg-blue-600 text-white py-2.5 rounded-lg font-medium hover:bg-blue-700 transition-colors text-sm"
            >Continue →</button>
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
                    <input type="date" value={s.dateOfBirth} onChange={e => updateStudent(i, 'dateOfBirth', e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500" />
                  </div>
                </div>
              </div>
            ))}
            {students.length < 5 && (
              <button onClick={addStudent} className="w-full border-2 border-dashed border-gray-300 rounded-xl py-2.5 text-sm text-gray-500 hover:border-blue-400 hover:text-blue-500 transition-colors">
                + Add Another Student
              </button>
            )}
            <div className="space-y-3 pt-2">
              <label className="flex items-start gap-3 cursor-pointer">
                <input type="checkbox" checked={termsAccepted} onChange={e => setTermsAccepted(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600" />
                <span className="text-sm text-gray-600">I accept the <Link href="/policies" target="_blank" className="text-blue-600 hover:underline">terms & conditions</Link><span className="text-red-500 ml-1">*</span></span>
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

        {step === 3 && (
          <div className="space-y-4">
            <div className="text-center">
              <div className="text-3xl mb-3">📱</div>
              <p className="text-sm text-gray-700 mb-1">我們已發送 6 位數驗證碼到</p>
              <p className="text-sm font-semibold text-gray-900 mb-1">{phone}</p>
              <p className="text-xs text-gray-400">同時也寄了一封確認信到 {email}，可以點擊連結完成 Email 驗證（非必要步驟）</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">驗證碼</label>
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={otpCode}
                onChange={e => setOtpCode(e.target.value.replace(/\D/g, ''))}
                placeholder="123456"
                className="w-full border border-gray-300 rounded-lg px-3 py-3 text-center text-2xl tracking-[0.5em] focus:outline-none focus:border-blue-500"
              />
            </div>
            {otpError && <p className="text-red-500 text-sm text-center">{otpError}</p>}
            <button onClick={handleVerifyOtp} disabled={otpVerifying || otpCode.length !== 6}
              className="w-full bg-blue-600 text-white py-2.5 rounded-lg font-medium hover:bg-blue-700 transition-colors text-sm disabled:opacity-50">
              {otpVerifying ? '驗證中...' : '確認驗證碼'}
            </button>
            <button onClick={handleResendOtp} disabled={otpSending || resendCooldown > 0}
              className="w-full text-blue-600 text-sm py-1 disabled:opacity-50 disabled:text-gray-400">
              {resendCooldown > 0 ? `重新發送 (${resendCooldown}s)` : otpSending ? '發送中...' : '沒收到？重新發送'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
