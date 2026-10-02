'use client'

import { useEffect, useRef, useState } from 'react'
import { useT, useLocale } from '@/lib/i18n/provider'
import { dateTag, type Locale } from '@/lib/i18n'


interface Student {
  id: string
  full_name: string
  parent_id: string
  parents: { first_name: string; last_name: string } | { first_name: string; last_name: string }[] | null
}

interface AttendanceRecord {
  id: string
  student_name: string
  parent_name: string
  check_in_method: string
  checked_in_at: string
  detail?: string
}

// Date follows the admin's language; the clock time stays 12-hour English.
// Joined with ', ' so the English render is unchanged from the old single
// toLocaleString call.
function formatDateTime(iso: string, locale: Locale): string {
  const d = new Date(iso)
  const date = d.toLocaleDateString(dateTag(locale, 'en-US'), { timeZone: 'America/Los_Angeles', month: '2-digit', day: '2-digit' })
  const time = d.toLocaleTimeString('en-US', { timeZone: 'America/Los_Angeles', hour: '2-digit', minute: '2-digit', hour12: true })
  return date + ', ' + time
}

export default function AdminCheckinClient({ students }: { students: Student[] }) {
  const t = useT()
  const locale = useLocale()
  const [query, setQuery] = useState('')
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null)
  const [loading, setLoading] = useState('')
  const [confirmStudent, setConfirmStudent] = useState<Student | null>(null)

  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)
  const [scanning, setScanning] = useState(false)
  const [cameraError, setCameraError] = useState(false)
  const [scanLoading, setScanLoading] = useState(false)

  const [records, setRecords] = useState<AttendanceRecord[]>([])
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [recordsLoading, setRecordsLoading] = useState(false)


  useEffect(() => { loadRecords(page) }, [page])

  async function loadRecords(p: number) {
    setRecordsLoading(true)
    try {
      const res = await fetch('/api/admin/attendance/records?page=' + p)
      const data = await res.json()
      setRecords(data.records || [])
      setTotalPages(data.totalPages || 1)
    } catch {}
    setRecordsLoading(false)
  }

  const filtered = query.trim().length < 1 ? [] : students.filter(s => {
    const parent = Array.isArray(s.parents) ? s.parents[0] : s.parents
    const q = query.toLowerCase()
    return (
      s.full_name.toLowerCase().includes(q) ||
      (parent?.first_name + ' ' + parent?.last_name).toLowerCase().includes(q)
    )
  }).slice(0, 8)

  async function doCheckin(studentId: string, method: 'manual' | 'qr_code') {
    setResult(null)
    try {
      const res = await fetch('/api/admin/attendance/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ student_id: studentId, check_in_method: method }),
      })
      const data = await res.json()
      if (!res.ok) {
        setResult({ success: false, message: data.error || t('admin.checkin.err.failed') })
      } else {
        const times = (data.lesson_times || []).join(', ')
        const vars = { name: data.student_name ?? '', n: data.checked_in_count ?? '', times }
        setResult({ success: true, message: times ? t('admin.checkin.doneWithTimes', vars) : t('admin.checkin.done', vars) })
        setPage(1)
        loadRecords(1)
        /* No level-picker here any more. The desk used to be offered "First
           Lesson! Assign a starting level" on a new swimmer's check-in, which
           placed them before anyone had seen them swim. The level now comes only
           from the assessment: the coach recommends it with that lesson's
           report, and an admin confirms it in Reviews. */
      }
    } catch (e: any) {
      setResult({ success: false, message: t('admin.checkin.err.failedWith', { msg: e.message ?? '' }) })
    }
  }

  async function checkin(student: Student) {
    setConfirmStudent(null)
    setLoading(student.id)
    await doCheckin(student.id, 'manual')
    setLoading('')
    setQuery('')
  }

  async function startCamera() {
    setCameraError(false)
    setScanning(true)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        videoRef.current.play()
        startScanning()
      }
    } catch (e) {
      setCameraError(true)
      setScanning(false)
    }
  }

  function stopCamera() {
    if (videoRef.current?.srcObject) {
      const tracks = (videoRef.current.srcObject as MediaStream).getTracks()
      tracks.forEach(track => track.stop())
      videoRef.current.srcObject = null
    }
    if (intervalRef.current) clearInterval(intervalRef.current)
    setScanning(false)
  }

  function startScanning() {
    intervalRef.current = setInterval(async () => {
      if (!videoRef.current || !canvasRef.current) return
      const video = videoRef.current
      const canvas = canvasRef.current
      if (video.readyState !== video.HAVE_ENOUGH_DATA) return
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.drawImage(video, 0, 0)
      if ('BarcodeDetector' in window) {
        try {
          const detector = new (window as any).BarcodeDetector({ formats: ['qr_code'] })
          const barcodes = await detector.detect(canvas)
          if (barcodes.length > 0) {
            const raw = barcodes[0].rawValue
            stopCamera()
            await processQR(raw)
          }
        } catch (e) {}
      }
    }, 500)
  }

  function decodeQRPayload(raw: string): string | null {
    try {
      if (raw.startsWith('MSA:')) return atob(raw.slice(4))
      return null
    } catch { return null }
  }

  async function processQR(raw: string) {
    setScanLoading(true)
    setResult(null)
    const studentId = decodeQRPayload(raw)
    if (!studentId) {
      setResult({ success: false, message: t('admin.checkin.err.invalidQr') })
      setScanLoading(false)
      return
    }
    await doCheckin(studentId, 'qr_code')
    setScanLoading(false)
  }

  const confirmParent = confirmStudent ? (Array.isArray(confirmStudent.parents) ? confirmStudent.parents[0] : confirmStudent.parents) : null

  return (
    <div className="min-h-screen bg-[#0d1529] px-4 py-12">
      <div className="w-full max-w-2xl mx-auto">
        <p className="text-xs font-semibold text-[#c9a84c] tracking-widest uppercase text-center mb-2">Manta Shark Aquatics</p>
        <h1 className="text-3xl font-bold text-white text-center mb-1" style={{ fontFamily: 'Playfair Display, serif' }}>{t('admin.checkin.title')}</h1>
        <p className="text-white/40 text-center text-sm mb-8">{t('admin.checkin.intro')}</p>

        <div className="grid md:grid-cols-2 gap-4 mb-6">
          <div className="bg-[#111d38] rounded-2xl p-6">
            <canvas ref={canvasRef} style={{ display: 'none' }} />
            {scanning ? (
              <div>
                <video ref={videoRef} className="w-full rounded-xl bg-black" muted playsInline />
                <button onClick={stopCamera} className="mt-3 w-full py-2.5 rounded-xl border border-white/20 text-white/60 hover:text-white text-sm transition-colors">{t('common.cancel')}</button>
                {cameraError && <p className="text-red-400 text-xs text-center mt-2">{t('admin.checkin.cameraUnavailable')}</p>}
              </div>
            ) : (
              <div className="text-center">
                <div className="text-4xl mb-3">📷</div>
                <p className="text-white/50 text-sm mb-4">{scanLoading ? t('admin.checkin.processing') : t('admin.checkin.scanPrompt')}</p>
                <button onClick={startCamera} disabled={scanLoading} className="w-full py-3 rounded-xl bg-[#c9a84c] text-[#0d1529] font-bold text-sm disabled:opacity-50">
                  {t('admin.checkin.startScan')}
                </button>
              </div>
            )}
          </div>

          <div className="bg-[#111d38] rounded-2xl p-6">
            <input
              type="text"
              value={query}
              onChange={e => { setQuery(e.target.value); setResult(null) }}
              placeholder={t('admin.checkin.searchPlaceholder')}
              className="w-full bg-[#1a2744] border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-[#c9a84c] text-sm transition-colors"
            />
            {filtered.length > 0 && (
              <div className="mt-3 space-y-2 max-h-64 overflow-y-auto">
                {filtered.map(s => {
                  const parent = Array.isArray(s.parents) ? s.parents[0] : s.parents
                  return (
                    <button
                      key={s.id}
                      onClick={() => setConfirmStudent(s)}
                      disabled={loading === s.id}
                      className="w-full flex items-center justify-between bg-[#1a2744] hover:bg-[#c9a84c]/10 border border-white/10 hover:border-[#c9a84c]/40 rounded-xl px-4 py-3 transition-all disabled:opacity-50"
                    >
                      <div className="text-left">
                        <p className="text-white font-medium text-sm">{s.full_name}</p>
                        <p className="text-white/40 text-xs">{parent?.first_name} {parent?.last_name}</p>
                      </div>
                      <span className="text-[#c9a84c] text-sm font-semibold">
                        {loading === s.id ? t('admin.checkin.processing') : t('admin.checkin.checkinBtn')}
                      </span>
                    </button>
                  )
                })}
              </div>
            )}
            {query.trim().length >= 1 && filtered.length === 0 && (
              <p className="text-white/30 text-sm text-center mt-4">{t('admin.checkin.noMatch')}</p>
            )}
          </div>
        </div>

        {result && (
          <div className={'rounded-xl px-4 py-3 text-sm font-medium text-center mb-8 ' + (result.success ? 'bg-green-500/20 text-green-400 border border-green-500/30' : 'bg-red-500/20 text-red-400 border border-red-500/30')}>
            {result.message}
          </div>
        )}

        <div className="bg-[#111d38] rounded-2xl overflow-hidden">
          <div className="px-6 py-4 border-b border-white/10">
            <h2 className="text-white font-semibold text-sm">{t('admin.checkin.records')}</h2>
          </div>
          {/* The card around this table is overflow-hidden for its rounded corners, so on
              a narrow screen the last columns were being clipped away entirely -- no
              scrollbar, no hint they existed. This wrapper scrolls instead of clipping,
              and the min-width stops the columns collapsing into unreadable slivers. */}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px] text-sm">
            <thead>
              <tr className="text-white/40 text-xs uppercase tracking-wider">
                <th className="text-left px-6 py-2">{t('admin.checkin.col.student')}</th>
                <th className="text-left px-6 py-2">{t('admin.checkin.col.parent')}</th>
                <th className="text-left px-6 py-2">{t('admin.checkin.col.method')}</th>
                <th className="text-left px-6 py-2">{t('admin.checkin.col.time')}</th>
              </tr>
            </thead>
            <tbody>
              {recordsLoading ? (
                <tr><td colSpan={4} className="text-center text-white/30 py-6">{t('admin.checkin.loading')}</td></tr>
              ) : records.length === 0 ? (
                <tr><td colSpan={4} className="text-center text-white/30 py-6">{t('admin.checkin.noRecords')}</td></tr>
              ) : records.map(r => (
                <tr key={r.id} className="border-t border-white/5">
                  <td className="px-6 py-3 text-white">{r.student_name}{r.detail && <div className="text-[#c9a84c] text-xs mt-0.5">{r.detail}</div>}</td>
                  <td className="px-6 py-3 text-white/60">{r.parent_name}</td>
                  <td className="px-6 py-3 text-white/60">{r.check_in_method === 'qr' ? t('admin.checkin.method.qr') : r.check_in_method === 'self' ? t('admin.checkin.method.self') : t('admin.checkin.method.manual')}</td>
                  <td className="px-6 py-3 text-white/60">{formatDateTime(r.checked_in_at, locale)}</td>
                </tr>
              ))}
            </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between px-6 py-4 border-t border-white/10">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1} className="text-white/50 text-xs disabled:opacity-30">{t('admin.checkin.prev')}</button>
            <span className="text-white/40 text-xs">{page} / {totalPages}</span>
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="text-white/50 text-xs disabled:opacity-30">{t('admin.checkin.next')}</button>
          </div>
        </div>
      </div>

      {confirmStudent && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setConfirmStudent(null)}>
          <div className="bg-[#1a2744] rounded-2xl w-full max-w-sm shadow-2xl p-6" onClick={e => e.stopPropagation()}>
            <div className="text-center mb-6">
              <div className="w-16 h-16 rounded-full bg-[#c9a84c]/20 flex items-center justify-center mx-auto mb-4">
                <span className="text-2xl">✓</span>
              </div>
              <h2 className="text-lg font-bold text-white mb-1">{t('admin.checkin.confirmTitle')}</h2>
              <p className="text-white/60 text-sm">
                {t('admin.checkin.confirmPre')}<span className="text-white font-semibold">{confirmStudent.full_name}</span>{t('admin.checkin.confirmPost')}
              </p>
              {confirmParent && (
                <p className="text-white/40 text-xs mt-1">{t('admin.checkin.confirmParent', { name: confirmParent.first_name + ' ' + confirmParent.last_name })}</p>
              )}
            </div>
            <div className="flex gap-3">
              <button onClick={() => setConfirmStudent(null)} className="flex-1 py-2.5 rounded-xl border border-white/20 text-white/60 hover:text-white transition-colors text-sm">{t('common.cancel')}</button>
              <button onClick={() => checkin(confirmStudent)} className="flex-1 py-2.5 rounded-xl bg-[#c9a84c] text-[#0d1529] font-bold hover:bg-[#d4b86a] transition-colors text-sm">{t('admin.checkin.confirmTitle')}</button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
