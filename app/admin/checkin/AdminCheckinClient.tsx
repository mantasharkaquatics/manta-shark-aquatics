'use client'

import { useEffect, useRef, useState } from 'react'

const LEVEL_NAMES: Record<number, string> = {
  1: 'Water Intro', 2: 'Water Comfort', 3: 'Pool Safety', 4: 'Beginner',
  5: 'Intermediate', 6: 'Advanced', 7: 'Bronze', 8: 'Silver', 9: 'Gold',
}

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
}

function formatDateTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString('zh-TW', { timeZone: 'America/Los_Angeles', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
}

export default function AdminCheckinClient({ students }: { students: Student[] }) {
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

  const [cutoff, setCutoff] = useState('12:00')
  const [editingCutoff, setEditingCutoff] = useState(false)
  const [cutoffInput, setCutoffInput] = useState('12:00')
  const [savingCutoff, setSavingCutoff] = useState(false)

  const [records, setRecords] = useState<AttendanceRecord[]>([])
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [recordsLoading, setRecordsLoading] = useState(false)

  const [showLevelModal, setShowLevelModal] = useState(false)
  const [levelModalStudent, setLevelModalStudent] = useState<{ id: string; name: string } | null>(null)
  const [assigningLevel, setAssigningLevel] = useState(false)

  useEffect(() => { loadCutoff() }, [])
  useEffect(() => { loadRecords(page) }, [page])

  async function loadCutoff() {
    try {
      const res = await fetch('/api/admin/checkin-settings')
      const data = await res.json()
      if (data.cutoff) { setCutoff(data.cutoff); setCutoffInput(data.cutoff) }
    } catch {}
  }

  async function saveCutoff() {
    setSavingCutoff(true)
    try {
      const res = await fetch('/api/admin/checkin-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: cutoffInput }),
      })
      if (res.ok) { setCutoff(cutoffInput); setEditingCutoff(false) }
    } catch {}
    setSavingCutoff(false)
  }

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
        setResult({ success: false, message: data.error || 'Check-in \u5931\u6557' })
      } else {
        const periodLabel = data.period === 'AM' ? '\u4e0a\u5348' : '\u4e0b\u5348'
        setResult({ success: true, message: '\u2713 ' + data.student_name + ' ' + periodLabel + '\u6642\u6bb5\u5171 ' + data.checked_in_count + ' \u5802\u8ab2\u5df2\u5b8c\u6210\u5831\u5230' })
        setPage(1)
        loadRecords(1)
        if (data.current_level === null) {
          setLevelModalStudent({ id: data.student_id, name: data.student_name })
          setShowLevelModal(true)
        }
      }
    } catch (e: any) {
      setResult({ success: false, message: 'Check-in \u5931\u6557\uff1a' + e.message })
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
      tracks.forEach(t => t.stop())
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
      setResult({ success: false, message: '\u7121\u6548\u7684 QR code\uff0c\u8acb\u91cd\u65b0\u6383\u63cf' })
      setScanLoading(false)
      return
    }
    await doCheckin(studentId, 'qr_code')
    setScanLoading(false)
  }

  async function assignLevel(level: number) {
    if (!levelModalStudent) return
    setAssigningLevel(true)
    try {
      await fetch('/api/admin/students/assign-level', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ student_id: levelModalStudent.id, level }),
      })
    } catch {}
    setAssigningLevel(false)
    setShowLevelModal(false)
    setLevelModalStudent(null)
  }

  const confirmParent = confirmStudent ? (Array.isArray(confirmStudent.parents) ? confirmStudent.parents[0] : confirmStudent.parents) : null

  return (
    <div className="min-h-screen bg-[#0d1529] px-4 py-12">
      <div className="w-full max-w-2xl mx-auto">
        <p className="text-xs font-semibold text-[#c9a84c] tracking-widest uppercase text-center mb-2">Manta Shark Aquatics</p>
        <h1 className="text-3xl font-bold text-white text-center mb-1" style={{ fontFamily: 'Playfair Display, serif' }}>Check-in</h1>
        <p className="text-white/40 text-center text-sm mb-6">QR \u6383\u63cf\u6216\u8f38\u5165\u59d3\u540d\u9032\u884c check-in</p>

        <div className="flex items-center justify-center gap-2 mb-8 text-xs text-white/40">
          <span>\u4e0a\u5348/\u4e0b\u5348\u5207\u5206\u6642\u9593\uff1a</span>
          {editingCutoff ? (
            <>
              <input
                type="time"
                value={cutoffInput}
                onChange={e => setCutoffInput(e.target.value)}
                className="bg-[#1a2744] border border-white/10 rounded px-2 py-1 text-white text-xs"
              />
              <button onClick={saveCutoff} disabled={savingCutoff} className="text-[#c9a84c] font-semibold">\u5132\u5b58</button>
              <button onClick={() => { setEditingCutoff(false); setCutoffInput(cutoff) }} className="text-white/30">\u53d6\u6d88</button>
            </>
          ) : (
            <>
              <span className="text-white font-semibold">{cutoff}</span>
              <button onClick={() => setEditingCutoff(true)} className="text-[#c9a84c] underline">\u8abf\u6574</button>
            </>
          )}
        </div>

        <div className="grid md:grid-cols-2 gap-4 mb-6">
          <div className="bg-[#111d38] rounded-2xl p-6">
            <canvas ref={canvasRef} style={{ display: 'none' }} />
            {scanning ? (
              <div>
                <video ref={videoRef} className="w-full rounded-xl bg-black" muted playsInline />
                <button onClick={stopCamera} className="mt-3 w-full py-2.5 rounded-xl border border-white/20 text-white/60 hover:text-white text-sm transition-colors">\u53d6\u6d88</button>
                {cameraError && <p className="text-red-400 text-xs text-center mt-2">\u7121\u6cd5\u4f7f\u7528\u76f8\u6a5f\uff0c\u8acb\u6539\u7528\u4e0b\u65b9\u59d3\u540d\u641c\u5c0b</p>}
              </div>
            ) : (
              <div className="text-center">
                <div className="text-4xl mb-3">\ud83d\udcf7</div>
                <p className="text-white/50 text-sm mb-4">{scanLoading ? '\u8655\u7406\u4e2d...' : '\u6383\u63cf\u5b78\u751f QR code'}</p>
                <button onClick={startCamera} disabled={scanLoading} className="w-full py-3 rounded-xl bg-[#c9a84c] text-[#0d1529] font-bold text-sm disabled:opacity-50">
                  \u958b\u59cb\u6383\u63cf
                </button>
              </div>
            )}
          </div>

          <div className="bg-[#111d38] rounded-2xl p-6">
            <input
              type="text"
              value={query}
              onChange={e => { setQuery(e.target.value); setResult(null) }}
              placeholder="\u8f38\u5165\u5b78\u751f\u59d3\u540d\u6216\u5bb6\u9577\u59d3\u540d..."
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
                        {loading === s.id ? '\u8655\u7406\u4e2d...' : 'Check-in'}
                      </span>
                    </button>
                  )
                })}
              </div>
            )}
            {query.trim().length >= 1 && filtered.length === 0 && (
              <p className="text-white/30 text-sm text-center mt-4">\u627e\u4e0d\u5230\u7b26\u5408\u7684\u5b78\u751f</p>
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
            <h2 className="text-white font-semibold text-sm">\u5831\u5230\u7d00\u9304</h2>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-white/40 text-xs uppercase tracking-wider">
                <th className="text-left px-6 py-2">\u5b78\u751f</th>
                <th className="text-left px-6 py-2">\u5bb6\u9577</th>
                <th className="text-left px-6 py-2">\u65b9\u5f0f</th>
                <th className="text-left px-6 py-2">\u5831\u5230\u6642\u9593</th>
              </tr>
            </thead>
            <tbody>
              {recordsLoading ? (
                <tr><td colSpan={4} className="text-center text-white/30 py-6">\u8f09\u5165\u4e2d...</td></tr>
              ) : records.length === 0 ? (
                <tr><td colSpan={4} className="text-center text-white/30 py-6">\u5c1a\u7121\u5831\u5230\u7d00\u9304</td></tr>
              ) : records.map(r => (
                <tr key={r.id} className="border-t border-white/5">
                  <td className="px-6 py-3 text-white">{r.student_name}</td>
                  <td className="px-6 py-3 text-white/60">{r.parent_name}</td>
                  <td className="px-6 py-3 text-white/60">{r.check_in_method === 'qr_code' ? 'QR' : '\u624b\u52d5'}</td>
                  <td className="px-6 py-3 text-white/60">{formatDateTime(r.checked_in_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex items-center justify-between px-6 py-4 border-t border-white/10">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1} className="text-white/50 text-xs disabled:opacity-30">\u2190 \u4e0a\u4e00\u9801</button>
            <span className="text-white/40 text-xs">{page} / {totalPages}</span>
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="text-white/50 text-xs disabled:opacity-30">\u4e0b\u4e00\u9801 \u2192</button>
          </div>
        </div>
      </div>

      {confirmStudent && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setConfirmStudent(null)}>
          <div className="bg-[#1a2744] rounded-2xl w-full max-w-sm shadow-2xl p-6" onClick={e => e.stopPropagation()}>
            <div className="text-center mb-6">
              <div className="w-16 h-16 rounded-full bg-[#c9a84c]/20 flex items-center justify-center mx-auto mb-4">
                <span className="text-2xl">\u2713</span>
              </div>
              <h2 className="text-lg font-bold text-white mb-1">\u78ba\u8a8d Check-in</h2>
              <p className="text-white/60 text-sm">
                \u78ba\u5b9a\u8981\u5e6b <span className="text-white font-semibold">{confirmStudent.full_name}</span> \u9032\u884c check-in \u55ce\uff1f
              </p>
              {confirmParent && (
                <p className="text-white/40 text-xs mt-1">\u5bb6\u9577\uff1a{confirmParent.first_name} {confirmParent.last_name}</p>
              )}
            </div>
            <div className="flex gap-3">
              <button onClick={() => setConfirmStudent(null)} className="flex-1 py-2.5 rounded-xl border border-white/20 text-white/60 hover:text-white transition-colors text-sm">\u53d6\u6d88</button>
              <button onClick={() => checkin(confirmStudent)} className="flex-1 py-2.5 rounded-xl bg-[#c9a84c] text-[#0d1529] font-bold hover:bg-[#d4b86a] transition-colors text-sm">\u78ba\u8a8d Check-in</button>
            </div>
          </div>
        </div>
      )}

      {showLevelModal && levelModalStudent && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
          <div style={{ background: '#1a2744', borderRadius: '20px', padding: '32px', maxWidth: '420px', width: '100%', border: '1px solid #c9a84c30' }}>
            <div style={{ textAlign: 'center', marginBottom: '24px' }}>
              <div style={{ fontSize: '36px', marginBottom: '12px' }}>\ud83c\udfca</div>
              <h2 style={{ fontFamily: 'Playfair Display, serif', fontSize: '22px', fontWeight: 900, color: '#fff', margin: '0 0 8px' }}>
                \u9996\u6b21\u4e0a\u8ab2\uff01
              </h2>
              <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.5)', margin: 0 }}>
                \u70ba <strong style={{ color: '#fff' }}>{levelModalStudent.name}</strong> \u6307\u5b9a\u8d77\u59cb\u7b49\u7d1a
              </p>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', marginBottom: '20px' }}>
              {[1,2,3,4,5,6,7,8,9].map(level => (
                <button
                  key={level}
                  onClick={() => assignLevel(level)}
                  disabled={assigningLevel}
                  style={{ padding: '14px 8px', borderRadius: '10px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', color: '#fff', cursor: assigningLevel ? 'not-allowed' : 'pointer', textAlign: 'center' }}
                >
                  <div style={{ fontSize: '18px', fontWeight: 700, color: '#c9a84c' }}>{level}</div>
                  <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.5)', marginTop: '2px', lineHeight: 1.2 }}>{LEVEL_NAMES[level]}</div>
                </button>
              ))}
            </div>
            <button
              onClick={() => { setShowLevelModal(false); setLevelModalStudent(null) }}
              style={{ width: '100%', padding: '12px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.15)', background: 'transparent', color: 'rgba(255,255,255,0.5)', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
            >
              \u7a0d\u5f8c\u518d\u8aaa
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
