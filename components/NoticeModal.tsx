'use client'

import { useEffect } from 'react'

// The parent-facing counterpart to components/AlertModal.tsx. Same job -- replace
// the browser's native alert() -- but the public site has its own visual language:
// inline styles, #1a2744, a Playfair title, 20px radius. Matching the admin panel
// here would look like a different product.
//
// Every string arrives already translated, so this file stays free of i18n. Pass
// message={null} to keep it closed.
export default function NoticeModal({ title, message, closeLabel, onClose }: {
  title: string
  message: string | null
  closeLabel: string
  onClose: () => void
}) {
  useEffect(() => {
    if (!message) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [message, onClose])

  if (!message) return null

  return (
    <div
      onClick={onClose}
      role="alertdialog"
      aria-modal="true"
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ background: '#1a2744', borderRadius: '20px', border: '1px solid rgba(255,255,255,0.12)', padding: '32px', maxWidth: '380px', width: '100%' }}
      >
        <div style={{ fontFamily: "'Playfair Display', serif", fontSize: '20px', fontWeight: 900, color: '#fff', marginBottom: '16px' }}>{title}</div>
        <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.5)', lineHeight: 1.6, marginBottom: '24px' }}>{message}</p>
        <button
          onClick={onClose}
          autoFocus
          style={{ width: '100%', padding: '12px', borderRadius: '10px', border: 'none', background: '#c9a84c', color: '#1a2744', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}
        >{closeLabel}</button>
      </div>
    </div>
  )
}
