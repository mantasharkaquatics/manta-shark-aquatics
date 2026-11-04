'use client'

/* A swimmer's check-in QR, shown over the page it was asked from: the home
   page's cards and lessons, and 我的's member card (owner, 2026-11-04: from
   我的 it used to send the family to 首頁 first, and closing left them there). */

import { useEffect, useRef, useState } from 'react'
import { useT } from '@/lib/i18n/provider'
import { useDialogFocus } from '@/lib/use-dialog-focus'
import { appLook } from '@/lib/native-app'
import { BRAND, FONT_DISPLAY } from '@/lib/brand'

const NAVY = BRAND.navy
const GOLD = BRAND.blue
const AMBER = BRAND.amber

// QR payload: base64 encode of student_id so it's not raw UUID
function makeQRPayload(studentId: string): string {
  return `MSA:${btoa(studentId)}`
}

export default function QRModal({ student, onClose }: { student: { id: string; full_name: string }; onClose: () => void }) {
  const t = useT()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [qrDataUrl, setQrDataUrl] = useState<string>('')
  const box = useDialogFocus(true)

  useEffect(() => {
    const payload = makeQRPayload(student.id)
    let live = true
    import('qrcode').then(({ default: QRCode }) => QRCode.toDataURL(payload, {
      width: 280,
      margin: 2,
      color: { dark: '#1a2744', light: '#ffffff' },
      errorCorrectionLevel: 'H',
    })).then(url => { if (live) setQrDataUrl(url) }).catch(() => {})
    return () => { live = false }
  }, [student.id])

  const handleDownload = () => {
    if (!qrDataUrl) return
    const a = document.createElement('a')
    a.href = qrDataUrl
    a.download = `${student.full_name.replace(/\s+/g, '_')}_QR.png`
    a.click()
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(14,29,59,0.55)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1000, padding: '20px',
      }}
    >
      <div
        ref={box}
        onClick={e => e.stopPropagation()}
        role="dialog" aria-modal="true" aria-label={t('dash.qr.eyebrow')}
        style={{
          background: '#fff', borderRadius: '20px',
          border: '1px solid #e3ebf6',
          padding: '36px', maxWidth: '360px', width: '100%',
          textAlign: 'center', position: 'relative',
        }}
      >
        {/* Close button. Named, or a screen reader says "times". */}
        <button
          onClick={onClose}
          className="tap-auto"
          aria-label={t('common.close')}
          style={{
            position: 'absolute', top: '16px', right: '16px',
            background: '#eef2f8', border: 'none',
            borderRadius: '50%', width: '32px', height: '32px',
            color: '#56647d', fontSize: '16px',
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        ><span aria-hidden="true">×</span></button>

        {/* Header */}
        <div style={{ marginBottom: '24px' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase', color: GOLD, marginBottom: '6px' }}>
            {t('dash.qr.eyebrow')}
          </div>
          <div style={{ fontFamily: FONT_DISPLAY, fontSize: '22px', fontWeight: 900, color: '#16294a' }}>
            {student.full_name}
          </div>
        </div>

        {/* QR Code */}
        <div style={{
          background: '#fff', borderRadius: '16px', padding: '20px',
          display: 'inline-block', marginBottom: '20px',
          boxShadow: `0 0 0 4px rgba(32,80,160,0.15)`,
        }}>
          {qrDataUrl ? (
            <img src={qrDataUrl} alt={t('dash.qrAlt')} style={{ display: 'block', width: '200px', height: '200px' }} />
          ) : (
            <div style={{ width: '200px', height: '200px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#999' }}>
              {t('common.loading')}
            </div>
          )}
        </div>

        {/* Instructions */}
        <p style={{ fontSize: '12px', color: '#56647d', margin: '0 0 20px', lineHeight: 1.6 }}>
          {t('dash.qr.help')}
        </p>

        {/* Download button. Not in the app: the iPhone web view cannot save
            a download, so it did nothing (2026-11-04) -- the code is shown
            at the desk from the screen anyway. */}
        {!appLook() && <button
          onClick={handleDownload}
          style={{
            width: '100%', padding: '12px', borderRadius: '10px',
            background: AMBER, color: NAVY, border: 'none',
            fontSize: '13px', fontWeight: 700, cursor: 'pointer',
            letterSpacing: '0.5px',
          }}
        >
          {t('dash.qr.download')}
        </button>}
      </div>
    </div>
  )
}
