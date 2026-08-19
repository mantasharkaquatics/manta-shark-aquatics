'use client'

import { useState } from 'react'
import { INPUT } from './ui'

export default function PasswordInput({
  id,
  value,
  onChange,
  autoComplete = 'current-password',
}: {
  id: string
  value: string
  onChange: (v: string) => void
  autoComplete?: string
}) {
  const [shown, setShown] = useState(false)

  return (
    <div style={{ position: 'relative' }}>
      <input
        id={id}
        type={shown ? 'text' : 'password'}
        style={{ ...INPUT, paddingRight: '48px' }}
        value={value}
        autoComplete={autoComplete}
        onChange={(e) => onChange(e.target.value)}
      />
      <button
        type="button"
        onClick={() => setShown((v) => !v)}
        aria-label={shown ? 'Hide password' : 'Show password'}
        style={{
          position: 'absolute',
          right: '4px',
          top: '50%',
          transform: 'translateY(-50%)',
          background: 'none',
          border: 'none',
          padding: '8px 12px',
          cursor: 'pointer',
          color: 'rgba(255,255,255,0.55)',
          fontSize: '13px',
          fontWeight: 600,
          lineHeight: 1,
        }}
      >
        {shown ? 'Hide' : 'Show'}
      </button>
    </div>
  )
}
