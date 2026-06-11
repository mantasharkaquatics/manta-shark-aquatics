'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function RegisterPage() {
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()
  const supabase = createClient()

  const [form, setForm] = useState({
    firstName: '', lastName: '', email: '', password: '', confirmPassword: '',
    phone: '', streetAddress: '', city: '', state: '', zipCode: '',
    newsletterOptIn: true,
    students: [
      { fullName: '', dateOfBirth: '' },
      { fullName: '', dateOfBirth: '' },
      { fullName: '', dateOfBirth: '' },
    ]
  })

  const update = (field: string, value: string | boolean) =>
    setForm(prev => ({ ...prev, [field]: value }))

  const updateStudent = (index: number, field: string, value: string) =>
    setForm(prev => {
      const students = [...prev.students]
      students[index] = { ...students[index], [field]: value }
      return { ...prev, students }
    })

  const handleSubmit = async () => {
    if (form.password !== form.confirmPassword) {
      setError('Passwords do not match'); return
    }
    setLoading(true); setError('')

    const { data, error: signUpError } = await supabase.auth.signUp({
      email: form.email, password: form.password,
    })

    if (signUpError || !data.user) {
      setError(signUpError?.message || 'Sign up failed')
      setLoading(false); return
    }

    const { error: parentError } = await supabase.from('parents').insert({
      auth_user_id: data.user.id,
      first_name: form.firstName, last_name: form.lastName,
      email: form.email, phone: form.phone,
      street_address: form.streetAddress, city: form.city,
      state: form.state, zip_code: form.zipCode,
      newsletter_opt_in: form.newsletterOptIn,
      waiver_signed: true, waiver_signed_at: new Date().toISOString(),
    })

    if (parentError) { setError(parentError.message); setLoading(false); return }

    const { data: parent } = await supabase
      .from('parents').select('id').eq('auth_user_id', data.user.id).single()

    if (parent) {
      const activeStudents = form.students.filter(s => s.fullName.trim())
      for (let i = 0; i < activeStudents.length; i++) {
        await supabase.from('students').insert({
          parent_id: parent.id,
          full_name: activeStudents[i].fullName,
          date_of_birth: activeStudents[i].dateOfBirth,
          sort_order: i + 1,
        })
      }
    }

    router.push('/dashboard')
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4 py-8">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 w-full max-w-lg">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Create Account</h1>
          <p className="text-gray-500 mt-1 text-sm">Step {step} of 2</p>
          <div className="flex gap-2 mt-3 justify-center">
            <div className={`h-1.5 w-16 rounded-full ${step >= 1 ? 'bg-blue-600' : 'bg-gray-200'}`} />
            <div className={`h-1.5 w-16 rounded-full ${step >= 2 ? 'bg-blue-600' : 'bg-gray-200'}`} />
          </div>
        </div>

        {step === 1 && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">First Name *</label>
                <input value={form.firstName} onChange={e => update('firstName', e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Last Name *</label>
                <input value={form.lastName} onChange={e => update('lastName', e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Phone Number *</label>
              <input value={form.phone} onChange={e => update('phone', e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Street Address *</label>
              <input value={form.streetAddress} onChange={e => update('streetAddress', e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">City *</label>
                <input value={form.city} onChange={e => update('city', e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">State *</label>
                <input value={form.state} onChange={e => update('state', e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Zip *</label>
                <input value={form.zipCode} onChange={e => update('zipCode', e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
              <input type="email" value={form.email} onChange={e => update('email', e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Password *</label>
              <input type="password" value={form.password} onChange={e => update('password', e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Confirm Password *</label>
              <input type="password" value={form.confirmPassword} onChange={e => update('confirmPassword', e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <button onClick={() => setStep(2)}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 rounded-lg text-sm transition">
              Next: Add Students →
            </button>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-5">
            <p className="text-sm text-gray-500">Add up to 3 students. At least 1 is required.</p>
            {form.students.map((student, i) => (
              <div key={i} className="border border-gray-200 rounded-xl p-4">
                <p className="text-sm font-medium text-gray-700 mb-3">
                  Student {i + 1} {i === 0 && <span className="text-red-500">*</span>}
                </p>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Full Name</label>
                    <input value={student.fullName} onChange={e => updateStudent(i, 'fullName', e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Date of Birth</label>
                    <input type="date" value={student.dateOfBirth} onChange={e => updateStudent(i, 'dateOfBirth', e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                </div>
              </div>
            ))}

            <div className="flex items-start gap-2">
              <input type="checkbox" id="terms" className="mt-0.5 accent-blue-600" required />
              <label htmlFor="terms" className="text-sm text-gray-600">
                I accept the <span className="text-blue-600 cursor-pointer">terms & conditions</span>
              </label>
            </div>

            <div className="flex items-start gap-2">
              <input type="checkbox" id="newsletter" checked={form.newsletterOptIn}
                onChange={e => update('newsletterOptIn', e.target.checked)} className="mt-0.5 accent-blue-600" />
              <label htmlFor="newsletter" className="text-sm text-gray-600">I want to subscribe to the newsletter</label>
            </div>

            {error && <p className="text-red-500 text-sm">{error}</p>}

            <div className="flex gap-3">
              <button onClick={() => setStep(1)}
                className="flex-1 border border-gray-300 text-gray-700 font-medium py-2.5 rounded-lg text-sm hover:bg-gray-50 transition">
                ← Back
              </button>
              <button onClick={handleSubmit} disabled={loading}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 rounded-lg text-sm transition disabled:opacity-50">
                {loading ? 'Creating...' : 'Create Account'}
              </button>
            </div>
          </div>
        )}

        <p className="text-center text-sm text-gray-500 mt-6">
          Already have an account?{' '}
          <Link href="/login" className="text-blue-600 hover:underline font-medium">Sign in</Link>
        </p>
      </div>
    </div>
  )
}