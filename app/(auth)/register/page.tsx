'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

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

  // Step 2
  const [students, setStudents] = useState([
    { fullName: '', dateOfBirth: '' },
  ])
  const [termsAccepted, setTermsAccepted] = useState(false)
  const [newsletter, setNewsletter] = useState(true)

  function addStudent() {
    if (students.length < 5) setStudents([...students, { fullName: '', dateOfBirth: '' }])
  }

  function updateStudent(i: number, field: string, value: string) {
    const updated = [...students]
    updated[i] = { ...updated[i], [field]: value }
    setStudents(updated)
  }

  async function handleSubmit() {
    if (!termsAccepted) {
      setError('Please accept the terms & conditions to continue.')
      return
    }
    if (!students[0].fullName.trim()) {
      setError('Please enter at least one student name.')
      return
    }

    setLoading(true)
    setError('')

    const now = new Date().toISOString()

    // 1. Sign up
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
    })

    if (authError || !authData.user) {
      setError(authError?.message || 'Sign up failed')
      setLoading(false)
      return
    }

    // 2. Create parent record
    const { data: parent, error: parentError } = await supabase
      .from('parents')
      .insert({
        auth_user_id: authData.user.id,
        first_name: firstName,
        last_name: lastName,
        email,
        phone,
        registered_at: now,
        terms_accepted_at: now,
        newsletter_subscribed: newsletter,
        last_login_at: now,
      })
      .select()
      .single()

    if (parentError || !parent) {
      setError('Failed to create account: ' + parentError?.message)
      setLoading(false)
      return
    }

    // 3. Create students
    const validStudents = students.filter(s => s.fullName.trim())
    for (const s of validStudents) {
      await supabase.from('students').insert({
        parent_id: parent.id,
        full_name: s.fullName.trim(),
        date_of_birth: s.dateOfBirth || null,
        current_level: '1',
        is_active: true,
      })
    }

    router.push('/dashboard')
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center py-12 px-4">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 w-full max-w-lg p-8">
        {/* Logo */}
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Create Account</h1>
          <p className="text-sm text-gray-500 mt-1">Step {step} of 2</p>
        </div>

        {step === 1 && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">First Name</label>
                <input value={firstName} onChange={e => setFirstName(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Last Name</label>
                <input value={lastName} onChange={e => setLastName(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
              <input type="tel" value={phone} onChange={e => setPhone(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500" />
            </div>
            {error && <p className="text-red-500 text-sm">{error}</p>}
            <button
              onClick={() => {
                if (!firstName || !lastName || !email || !password) { setError('Please fill in all fields.'); return }
                setError(''); setStep(2)
              }}
              className="w-full bg-blue-600 text-white py-2.5 rounded-lg font-medium hover:bg-blue-700 transition-colors text-sm"
            >
              Continue →
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
                <p className="text-sm font-semibold text-gray-700 mb-3">
                  Student {i + 1} {i === 0 && <span className="text-red-500">*</span>}
                </p>
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
                <span className="text-sm text-gray-600">
                  I accept the{' '}
                  <Link href="/policies" target="_blank" className="text-blue-600 hover:underline">terms & conditions</Link>
                  <span className="text-red-500 ml-1">*</span>
                </span>
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
                className="flex-1 border border-gray-300 text-gray-700 py-2.5 rounded-lg font-medium hover:bg-gray-50 transition-colors text-sm">
                ← Back
              </button>
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
