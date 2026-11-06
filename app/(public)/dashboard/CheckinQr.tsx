'use client'

/* A swimmer's check-in QR, shown over the page it was asked from: the home
   page's cards and lessons, and 我的's member card (owner, 2026-11-04: from
   我的 it used to send the family to 首頁 first, and closing left them there). */

import { useEffect, useRef, useState } from 'react'
import { useLocale, useT } from '@/lib/i18n/provider'
import { joinList } from '@/lib/i18n'
import { useDialogFocus } from '@/lib/use-dialog-focus'
import { appLook } from '@/lib/native-app'
import { BRAND, FONT_DISPLAY } from '@/lib/brand'

const NAVY = BRAND.navy
const GOLD = BRAND.blue
const AMBER = BRAND.amber

const QR_OPTS = { width: 280, margin: 2, color: { dark: '#1a2744', light: '#ffffff' }, errorCorrectionLevel: 'H' as const }

/* Draws and keeps today's swimmers' codes while the phone is idle, so even
   the first 報到 of the day opens at once (決定 5). */
export function warmQr(studentIds: string[]) {
  const need = studentIds.filter(id => !cachedQr(id))
  if (!need.length) return
  const run = () => import('qrcode').then(({ default: QRCode }) => Promise.all(need.map(id =>
    QRCode.toDataURL(makeQRPayload(id), QR_OPTS).then(url => { try { localStorage.setItem(QR_KEY + id, url) } catch {} })
  ))).catch(() => {})
  const w = window as Window & { requestIdleCallback?: (cb: () => void) => number }
  if (w.requestIdleCallback) w.requestIdleCallback(run); else setTimeout(run, 1500)
}

// QR payload: base64 encode of student_id so it's not raw UUID
function makeQRPayload(studentId: string): string {
  return `MSA:${btoa(studentId)}`
}

// v1: bump if the code's look or payload ever changes.
const QR_KEY = 'msa_qr_v1:'
function cachedQr(studentId: string): string {
  try {
    const url = localStorage.getItem(QR_KEY + studentId) || ''
    return url.startsWith('data:image/png;base64,') ? url : ''
  } catch { return '' }
}

/* lesson: today's lesson of this swimmer, written out ("3:35 PM · Coach
   Mitch"), so the desk can see it is the right one; others: the family's
   other swimmers with a lesson today, who need their own code (50-role test,
   2026-11-05). */
export default function QRModal({ student, onClose, lesson, others = [] }: { student: { id: string; full_name: string }; onClose: () => void; lesson?: string | null; others?: string[] }) {
  const t = useT()
  const locale = useLocale()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  // The code never changes for a swimmer, so its picture is kept on the
  // phone after the first time and shown at once (owner, 2026-11-05,
  // 決定 5: "點開才會顯示 QR code, 有點慢").
  const [made, setMade] = useState<{ id: string; url: string }>(() => ({ id: student.id, url: cachedQr(student.id) }))
  const qrDataUrl = made.id === student.id && made.url ? made.url : cachedQr(student.id)
  const box = useDialogFocus(true, onClose)

  // Without a connection the drawing code could not load and "Loading…"
  // stayed for good (14-role test 2, J72): said so, and tried again once
  // the phone is back online.
  const [failedFor, setFailedFor] = useState<string | null>(null)
  const [tries, setTries] = useState(0)
  useEffect(() => {
    if (cachedQr(student.id)) return
    const payload = makeQRPayload(student.id)
    let live = true
    import('qrcode').then(({ default: QRCode }) => QRCode.toDataURL(payload, QR_OPTS)).then(url => {
      try { localStorage.setItem(QR_KEY + student.id, url) } catch {}
      if (live) { setMade({ id: student.id, url }); setFailedFor(null) }
    }).catch(() => { if (live) setFailedFor(student.id) })
    const again = () => setTries(n => n + 1)
    window.addEventListener('online', again)
    return () => { live = false; window.removeEventListener('online', again) }
  }, [student.id, tries])

  const handleDownload = () => {
    if (!qrDataUrl) return
    const a = document.createElement('a')
    a.href = qrDataUrl
    a.download = `${student.full_name.replace(/\s+/g, '_')}_QR.png`
    a.click()
  }

  // Pop-up kind ①, a sheet (決定 9): the title is the swimmer, the ✕ top right.
  return (
    <div className="msa-sheet-back" onClick={onClose}>
      <div ref={box} className="msa-sheet" onClick={e => e.stopPropagation()}
        role="dialog" aria-modal="true" aria-label={t('dash.qr.eyebrow')} style={{ background: '#fff', textAlign: 'center' }}>
        <div className="msa-sheet-head" style={{ background: '#fff' }}>
          {/* The sheets' one title style, no eyebrow (14-role test 2, J67). */}
          <b style={{ textAlign: 'left', minWidth: 0 }}>{t('dash.qr.titleFor', { name: student.full_name })}</b>
          <button type="button" className="msa-sheet-x tap-auto" onClick={onClose} aria-label={t('common.close')}><span aria-hidden="true">✕</span></button>
        </div>
        {lesson && <div style={{ fontSize: '14px', fontWeight: 700, color: '#16294a', margin: '-4px 0 14px' }}>{t('dash.qr.today', { lesson })}</div>}

        {/* QR Code */}
        <div style={{
          background: '#fff', borderRadius: '16px', padding: '20px',
          display: 'inline-block', marginBottom: '20px',
          boxShadow: `0 0 0 4px rgba(32,80,160,0.15)`,
        }}>
          {qrDataUrl ? (
            <img src={qrDataUrl} alt={t('dash.qrAlt')} style={{ display: 'block', width: '200px', height: '200px' }} />
          ) : (
            <div role={failedFor === student.id ? 'alert' : undefined} style={{ width: '200px', height: '200px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: failedFor === student.id ? '#8a5300' : '#999', fontSize: failedFor === student.id ? '14px' : undefined, lineHeight: 1.5, textAlign: 'center' }}>
              {failedFor === student.id ? t('dash.qr.offline') : t('common.loading')}
            </div>
          )}
        </div>

        {/* Instructions */}
        <p style={{ fontSize: '12px', color: '#56647d', margin: '0 0 20px', lineHeight: 1.6 }}>
          {/* No lesson today: the code is still theirs, said so (14-role test 2, J66). */}
          {lesson ? <>{t('dash.qr.help')}{t('dash.qr.window')}</> : t('dash.qr.noLesson', { name: student.full_name })}
          {others.length > 0 && <><br /><b style={{ color: '#9a5b00' }}>{t(others.length > 1 ? 'dash.qr.othersMany' : 'dash.qr.others', { names: joinList(locale, others) })}</b></>}
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
