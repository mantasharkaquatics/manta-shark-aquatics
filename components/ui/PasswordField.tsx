'use client'
import { useState } from 'react'
import { useT } from '@/lib/i18n/provider'

// A password box with a reveal toggle. Parents type these on a phone, one
// handed, often with a wet screen -- getting it wrong twice and being locked
// out is a support call the school pays for, so let them look at what they
// typed. The eye sits inside the field rather than beside it: a separate
// control would need its own row and its own label.
export default function PasswordField({
  value, onChange, onEnter, autoComplete, className, placeholder, id,
}: {
  value: string
  onChange: (v: string) => void
  onEnter?: () => void
  autoComplete?: string
  className: string
  placeholder?: string
  id?: string
}) {
  const t = useT()
  const [shown, setShown] = useState(false)
  return (
    <div className="relative">
      <input
        id={id}
        type={shown ? 'text' : 'password'}
        value={value}
        onChange={e => onChange(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' && onEnter) onEnter() }}
        autoComplete={autoComplete}
        placeholder={placeholder}
        className={className}
        // Room for the button, so a long password never runs under the eye.
        // Inline rather than a pr-* class: the caller's className already sets
        // padding, and which of two Tailwind utilities wins depends on the order
        // they happen to be emitted in. A style attribute beats both.
        style={{ paddingRight: '3rem' }}
      />
      <button
        type="button"
        onClick={() => setShown(v => !v)}
        aria-pressed={shown}
        aria-label={t(shown ? 'auth.hidePassword' : 'auth.showPassword')}
        title={t(shown ? 'auth.hidePassword' : 'auth.showPassword')}
        className="absolute inset-y-0 right-0 flex items-center justify-center w-12 text-gray-500 hover:text-[#c9a84c] focus:text-[#c9a84c] focus:outline-none transition-colors"
      >
        {shown ? (
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M3 3l18 18" />
            <path d="M10.6 10.6a2 2 0 0 0 2.8 2.8" />
            <path d="M9.4 5.2A9.5 9.5 0 0 1 12 4.9c5 0 9 4.6 9 7.1a10 10 0 0 1-2.3 3.9" />
            <path d="M6.2 6.7C4 8.2 3 10.5 3 12c0 2.5 4 7.1 9 7.1 1.4 0 2.7-.3 3.8-.9" />
          </svg>
        ) : (
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M3 12c0-2.5 4-7.1 9-7.1s9 4.6 9 7.1-4 7.1-9 7.1-9-4.6-9-7.1z" />
            <circle cx="12" cy="12" r="2.6" />
          </svg>
        )}
      </button>
    </div>
  )
}
