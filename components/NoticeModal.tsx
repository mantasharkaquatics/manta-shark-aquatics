'use client'

import { useEffect } from 'react'
import { BRAND, FONT_DISPLAY } from '@/lib/brand'

// The parent-facing counterpart to components/AlertModal.tsx. Same job -- replace
// the browser's native alert() -- but the public site has its own visual language:
// palette B (2026-09) -- a white card over a navy veil, amber for the one
// button. Matching the admin panel here would look like a different product.
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
      style={{ position: 'fixed', inset: 0, background: 'rgba(14,29,59,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100, padding: '20px' }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ background: '#fff', borderRadius: '18px', padding: '28px', maxWidth: '400px', width: '100%', boxShadow: '0 30px 60px rgba(14,29,59,0.3)' }}
      >
        <div style={{ fontFamily: FONT_DISPLAY, fontSize: '21px', fontWeight: 900, color: BRAND.navy, marginBottom: '12px' }}>{title}</div>
        <p style={{ fontSize: '14px', color: BRAND.mute, lineHeight: 1.6, marginBottom: '22px', whiteSpace: 'pre-line' }}>{message}</p>
        <button
          onClick={onClose}
          autoFocus
          style={{ width: '100%', padding: '12px', borderRadius: '10px', border: 'none', background: BRAND.amber, color: BRAND.navy, fontSize: '14px', fontWeight: 800, cursor: 'pointer' }}
        >{closeLabel}</button>
      </div>
    </div>
  )
}
