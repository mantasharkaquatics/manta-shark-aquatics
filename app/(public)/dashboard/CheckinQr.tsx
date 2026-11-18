'use client'

/* A swimmer's check-in QR, shown over the page it was asked from: the home
   page's cards and lessons, and 我的's member card (owner, 2026-11-04: from
   我的 it used to send the family to 首頁 first, and closing left them there). */

import { useEffect, useRef, useState } from 'react'
import { useLocale, useT } from '@/lib/i18n/provider'
import { joinList } from '@/lib/i18n'
import { useDialogFocus } from '@/lib/use-dialog-focus'
import { appLook, appPlatform, walletPassPlugin } from '@/lib/native-app'
import { makeWalletArt } from '@/lib/wallet-art'
import type { SwimmerLook } from '@/lib/swimmer-look'
import { BRAND, FONT_DISPLAY } from '@/lib/brand'

const NAVY = BRAND.navy
const GOLD = BRAND.blue
const AMBER = BRAND.amber

/* 加入 Apple 錢包 (owner, 2026-11-17: Apple only): inside the iPhone app
   through its WalletPass plugin, in a browser on an iPhone, iPad or Mac as a
   plain link (Safari opens a .pkpass itself). Shown only once the school's
   Wallet certificate is set (app/api/parent/wallet-pass ?ready=1, asked
   once per visit). */
let walletReadyAsk: Promise<boolean> | null = null
function walletReady(): Promise<boolean> {
  walletReadyAsk ??= fetch('/api/parent/wallet-pass?ready=1').then(r => (r.ok ? r.json() : null)).then(d => !!d?.ready).catch(() => { walletReadyAsk = null; return false })
  return walletReadyAsk
}
function walletWay(): 'app' | 'link' | null {
  if (appLook()) return appPlatform() === 'ios' && walletPassPlugin() ? 'app' : null
  const ua = navigator.userAgent
  if (/iPhone|iPad|iPod/.test(ua)) return 'link'
  if (/Macintosh/.test(ua) && /Safari\//.test(ua) && !/Chrome|Chromium|Edg|Firefox/.test(ua)) return 'link'
  return null
}
const WALLET_CSS = `
.qr-wallet { display: inline-flex; align-items: center; justify-content: center; gap: 10px; min-height: 48px; padding: 0 22px; border-radius: 12px;
  border: 0; background: #000; color: #fff; font: inherit; font-size: 15px; font-weight: 700; text-decoration: none; cursor: pointer; }
.qr-wallet:disabled { opacity: .6; }
.qr-wallet:focus-visible { outline: 3px solid #f7b733; outline-offset: 2px; }
.qr-wallet svg { width: 26px; height: 20px; flex: none; }
`
// A wallet with its cards, in Wallet's colours.
const WALLET_MARK = (
  <svg viewBox="0 0 26 20" aria-hidden="true">
    <rect x="1" y="1" width="24" height="18" rx="3.5" fill="#d8d8d8" />
    <rect x="3" y="3" width="20" height="4" rx="1.5" fill="#2fa5e1" />
    <rect x="3" y="5.5" width="20" height="4" rx="1.5" fill="#f6b81f" />
    <rect x="3" y="8" width="20" height="4" rx="1.5" fill="#ef5446" />
    <path d="M1 11h7.5c.8 0 1.4.5 1.7 1.2.5 1.4 1.5 2.3 2.8 2.3s2.3-.9 2.8-2.3c.3-.7.9-1.2 1.7-1.2H25v4.5a3.5 3.5 0 0 1-3.5 3.5h-17A3.5 3.5 0 0 1 1 15.5z" fill="#fff" />
  </svg>
)

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
export default function QRModal({ student, onClose, lesson, others = [], look }: { student: { id: string; full_name: string }; onClose: () => void; lesson?: string | null; others?: string[]; look?: SwimmerLook | null }) {
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

  // 加入 Apple 錢包: the way this phone takes it, once the school can make cards.
  const [wallet, setWallet] = useState<'app' | 'link' | null>(null)
  const [walletBusy, setWalletBusy] = useState(false)
  const [walletErr, setWalletErr] = useState(false)
  useEffect(() => {
    const way = walletWay()
    if (!way) return
    let live = true
    walletReady().then(ok => { if (live && ok) setWallet(way) })
    return () => { live = false }
  }, [])
  const passUrl = `/api/parent/wallet-pass?student=${encodeURIComponent(student.id)}&lang=${encodeURIComponent(locale)}`
  const addToWallet = async () => {
    const plugin = walletPassPlugin()
    if (!plugin || walletBusy) return
    setWalletBusy(true); setWalletErr(false)
    try {
      // The card shows the swimmer the family dressed (樣式 4), drawn here;
      // if this phone cannot draw it, the school's swimmer in a cap.
      const pics = await makeWalletArt(look ?? null).catch(() => null)
      const r = await fetch('/api/parent/wallet-pass', {
        method: 'POST', cache: 'no-store', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ student: student.id, lang: locale, art: pics?.art, thumb: pics?.thumb }),
      })
      if (!r.ok) throw new Error(String(r.status))
      const bytes = new Uint8Array(await r.arrayBuffer())
      let bin = ''
      for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
      await plugin.add({ data: btoa(bin) })
    } catch { setWalletErr(true) }
    setWalletBusy(false)
  }

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
      <style>{WALLET_CSS}</style>
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

        {wallet && (
          <div style={{ margin: '-6px 0 16px' }}>
            {wallet === 'app'
              ? <button type="button" className="tap-auto qr-wallet" onClick={addToWallet} disabled={walletBusy}>{WALLET_MARK}{walletBusy ? t('wallet.adding') : t('wallet.add')}</button>
              : <a className="qr-wallet" href={passUrl}>{WALLET_MARK}{t('wallet.add')}</a>}
            {walletErr && <p role="alert" style={{ margin: '8px 0 0', fontSize: '13px', color: '#9a3412' }}>{t('wallet.failed')}</p>}
          </div>
        )}

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
