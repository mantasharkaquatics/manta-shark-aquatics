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
  return d.toLocaleString('en-US', { timeZone: 'America/Los_Angeles', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: true })
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

  const [records, setRecords] = useState<AttendanceRecord[]>([])
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [recordsLoading, setRecordsLoading] = useState(false)

  const [showLevelModal, setShowLevelModal] = useState(false)
  const [levelModalStudent, setLevelModalStudent] = useState<{ id: string; name: string } | null>(null)
  const [assigningLevel, setAssigningLevel] = useState(false)

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
        setResult({ success: false, message: data.error || 'Check-in failed' })
      } else {
        const times = (data.lesson_times || []).join(', ')
        setResult({ success: true, message: 'Checked in ' + data.student_name + ' for ' + data.checked_in_count + ' lesson(s)' + (times ? ': ' + times : '') })
        setPage(1)
        loadRecords(1)
        if (data.current_level === null) {
          setLevelModalStudent({ id: data.student_id, name: data.student_name })
          setShowLevelModal(true)
        }
      }
    } catch (e: any) {
      setResult({ success: false, message: 'Check-in failed: ' + e.message })
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
      setResult({ success: false, message: 'Invalid QR code. Please scan again.' })
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
        <p className="text-white/40 text-center text-sm mb-8">Scan a QR code or search by name. Check-in opens 30 min before class and closes at class end.</p>

        <div className="grid md:grid-cols-2 gap-4 mb-6">
          <div className="bg-[#111d38] rounded-2xl p-6">
            <canvas ref={canvasRef} style={{ display: 'none' }} />
            {scanning ? (
              <div>
                <video ref={videoRef} className="w-full rounded-xl bg-black" muted playsInline />
                <button onClick={stopCamera} className="mt-3 w-full py-2.5 rounded-xl border border-white/20 text-white/60 hover:text-white text-sm transition-colors">Cancel</button>
                {cameraError && <p className="text-red-400 text-xs text-center mt-2">Camera unavailable. Please use name search below.</p>}
              </div>
            ) : (
              <div className="text-center">
                <div className="text-4xl mb-3">📷</div>
                <p className="text-white/50 text-sm mb-4">{scanLoading ? 'Processing...' : 'Scan student QR code'}</p>
                <button onClick={startCamera} disabled={scanLoading} className="w-full py-3 rounded-xl bg-[#c9a84c] text-[#0d1529] font-bold text-sm disabled:opacity-50">
                  Start Scan
                </button>
              </div>
            )}
          </div>

          <div className="bg-[#111d38] rounded-2xl p-6">
            <input
              type="text"
              value={query}
              onChange={e => { setQuery(e.target.value); setResult(null) }}
              placeholder="Search by student or parent name..."
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
                        {loading === s.id ? 'Processing...' : 'Check-in'}
                      </span>
                    </button>
                  )
                })}
              </div>
            )}
            {query.trim().length >= 1 && filtered.length === 0 && (
              <p className="text-white/30 text-sm text-center mt-4">No matching students found</p>
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
            <h2 className="text-white font-semibold text-sm">Check-in Records</h2>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-white/40 text-xs uppercase tracking-wider">
                <th className="text-left px-6 py-2">Student</th>
                <th className="text-left px-6 py-2">Parent</th>
                <th className="text-left px-6 py-2">Method</th>
                <th className="text-left px-6 py-2">Check-in Time</th>
              </tr>
            </thead>
            <tbody>
              {recordsLoading ? (
                <tr><td colSpan={4} className="text-center text-white/30 py-6">Loading...</td></tr>
              ) : records.length === 0 ? (
                <tr><td colSpan={4} className="text-center text-white/30 py-6">No check-in records yet</td></tr>
              ) : records.map(r => (
                <tr key={r.id} className="border-t border-white/5">
                  <td className="px-6 py-3 text-white">{r.student_name}</td>
                  <td className="px-6 py-3 text-white/60">{r.parent_name}</td>
                  <td className="px-6 py-3 text-white/60">{r.check_in_method === 'qr_code' ? 'QR' : 'Manual'}</td>
                  <td className="px-6 py-3 text-white/60">{formatDateTime(r.checked_in_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex items-center justify-between px-6 py-4 border-t border-white/10">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1} className="text-white/50 text-xs disabled:opacity-30">← Previous</button>
            <span className="text-white/40 text-xs">{page} / {totalPages}</span>
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="text-white/50 text-xs disabled:opacity-30">Next →</button>
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
              <h2 className="text-lg font-bold text-white mb-1">Confirm Check-in</h2>
              <p className="text-white/60 text-sm">
                Check in <span className="text-white font-semibold">{confirmStudent.full_name}</span>?
              </p>
              {confirmParent && (
                <p className="text-white/40 text-xs mt-1">Parent: {confirmParent.first_name} {confirmParent.last_name}</p>
              )}
            </div>
            <div className="flex gap-3">
              <button onClick={() => setConfirmStudent(null)} className="flex-1 py-2.5 rounded-xl border border-white/20 text-white/60 hover:text-white transition-colors text-sm">Cancel</button>
              <button onClick={() => checkin(confirmStudent)} className="flex-1 py-2.5 rounded-xl bg-[#c9a84c] text-[#0d1529] font-bold hover:bg-[#d4b86a] transition-colors text-sm">Confirm Check-in</button>
            </div>
          </div>
        </div>
      )}

      {showLevelModal && levelModalStudent && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
          <div style={{ background: '#1a2744', borderRadius: '20px', padding: '32px', maxWidth: '420px', width: '100%', border: '1px solid #c9a84c30' }}>
            <div style={{ textAlign: 'center', marginBottom: '24px' }}>
              <div style={{ fontSize: '36px', marginBottom: '12px' }}>🏊</div>
              <h2 style={{ fontFamily: 'Playfair Display, serif', fontSize: '22px', fontWeight: 900, color: '#fff', margin: '0 0 8px' }}>
                First Lesson!
              </h2>
              <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.5)', margin: 0 }}>
                Assign a starting level for <strong style={{ color: '#fff' }}>{levelModalStudent.name}</strong>
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
              Skip for now
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
