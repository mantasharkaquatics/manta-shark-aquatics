'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

const NAVY = '#1a2744'
const DARK = '#111d38'
const GOLD = '#c9a84c'

const LEVEL_NAMES: Record<number, string> = {
  1: 'Water Intro', 2: 'Water Comfort', 3: 'Pool Safety', 4: 'Beginner',
  5: 'Intermediate', 6: 'Advanced', 7: 'Bronze', 8: 'Silver', 9: 'Gold',
}

function formatTime(t: string): string {
  const [h, m] = t.split(':').map(Number)
  const ampm = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 || 12
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`
}

interface StudentInfo {
  id: string
  full_name: string
  current_level: number | null
  booking: {
    id: string
    class_session_id: string
    session_date: string
    start_time: string
    end_time: string
    course_name: string
    coach_name: string
    status: string
  } | null
  already_checked_in: boolean
  check_in_allowed: boolean
  minutes_until_class: number | null
}

export default function CheckinClient() {
  const supabase = createClient()
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)

  const [scanning, setScanning] = useState(false)
  const [studentInfo, setStudentInfo] = useState<StudentInfo | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [checkedIn, setCheckedIn] = useState(false)
  const [coachId, setCoachId] = useState<string | null>(null)
  const [manualInput, setManualInput] = useState('')
  const [cameraError, setCameraError] = useState(false)

  useEffect(() => {
    // Get current coach
    async function getCoach() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data } = await supabase.from('coaches').select('id').eq('auth_user_id', user.id).single()
      if (data) setCoachId(data.id)
    }
    getCoach()
  }, [])

  async function startCamera() {
    setCameraError(false)
    setScanning(true)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' }
      })
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

      // Use BarcodeDetector if available
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
      if (raw.startsWith('MSA:')) {
        return atob(raw.slice(4))
      }
      return null
    } catch {
      return null
    }
  }

  async function processQR(raw: string) {
    setLoading(true)
    setError(null)
    setStudentInfo(null)
    setCheckedIn(false)

    const studentId = decodeQRPayload(raw)
    if (!studentId) {
      setError('Invalid QR code. Please try again.')
      setLoading(false)
      return
    }

    await lookupStudent(studentId)
    setLoading(false)
  }

  async function lookupStudent(studentId: string) {
    // Get student info
    const { data: student, error: sErr } = await supabase
      .from('students')
      .select('id, full_name, current_level')
      .eq('id', studentId)
      .single()

    if (sErr || !student) {
      setError('Student not found.')
      return
    }

    const today = new Date().toISOString().split('T')[0]
    const now = new Date()

    // Find today's booking
    const { data: bookings } = await supabase
      .from('bookings')
      .select('id, class_session_id, status, class_sessions(session_date, start_time, end_time, course_types(name), coaches(first_name))')
      .eq('student_id', studentId)
      .neq('status', 'cancelled')
      .limit(10)

    // Find today's booking
    const todayBooking = (bookings || []).find((b: any) => {
      const cs = Array.isArray(b.class_sessions) ? b.class_sessions[0] : b.class_sessions
      return cs?.session_date === today
    })

    let bookingInfo = null
    let check_in_allowed = false
    let minutes_until_class: number | null = null
    let already_checked_in = false

    if (todayBooking) {
      const cs = Array.isArray(todayBooking.class_sessions) ? todayBooking.class_sessions[0] : todayBooking.class_sessions
      const ct = Array.isArray(cs?.course_types) ? cs.course_types[0] : cs?.course_types
      const coach = Array.isArray(cs?.coaches) ? cs.coaches[0] : cs?.coaches

      bookingInfo = {
        id: todayBooking.id,
        class_session_id: todayBooking.class_session_id,
        session_date: cs?.session_date,
        start_time: cs?.start_time,
        end_time: cs?.end_time,
        course_name: ct?.name || 'Lesson',
        coach_name: coach?.first_name || '',
        status: todayBooking.status,
      }

      // Check if within 30 minutes before class
      const [h, m] = cs.start_time.split(':').map(Number)
      const classTime = new Date()
      classTime.setHours(h, m, 0, 0)
      const diffMs = classTime.getTime() - now.getTime()
      const diffMin = Math.round(diffMs / 60000)
      minutes_until_class = diffMin

      // Allow check-in from 30 min before to 30 min after start
      check_in_allowed = diffMin <= 30 && diffMin >= -30

      // Check if already checked in
      const { data: existing } = await supabase
        .from('attendance')
        .select('id')
        .eq('booking_id', todayBooking.id)
        .eq('student_id', studentId)
        .single()

      already_checked_in = !!existing
    }

    setStudentInfo({
      id: student.id,
      full_name: student.full_name,
      current_level: student.current_level,
      booking: bookingInfo,
      already_checked_in,
      check_in_allowed,
      minutes_until_class,
    })
  }

  async function handleCheckIn() {
    if (!studentInfo?.booking || !coachId) return
    setLoading(true)

    const { error } = await supabase.from('attendance').insert({
      booking_id: studentInfo.booking.id,
      student_id: studentInfo.id,
      class_session_id: studentInfo.booking.class_session_id,
      check_in_method: 'qr_code',
      checked_in_by: coachId,
      checked_in_at: new Date().toISOString(),
    })

    if (error) {
      setError('Check-in failed. Please try again.')
    } else {
      setCheckedIn(true)
      setStudentInfo(prev => prev ? { ...prev, already_checked_in: true } : prev)
    }
    setLoading(false)
  }

  async function handleManualSubmit() {
    if (!manualInput.trim()) return
    setLoading(true)
    setError(null)
    setStudentInfo(null)
    setCheckedIn(false)
    await lookupStudent(manualInput.trim())
    setLoading(false)
    setManualInput('')
  }

  function reset() {
    setStudentInfo(null)
    setError(null)
    setCheckedIn(false)
  }

  return (
    <div style={{ fontFamily: "'DM Sans', sans-serif", background: DARK, minHeight: '100vh', padding: '24px 20px' }}>
      <div style={{ maxWidth: '480px', margin: '0 auto' }}>

        {/* Header */}
        <div style={{ marginBottom: '28px', textAlign: 'center' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase', color: GOLD, marginBottom: '6px' }}>
            Manta Shark Aquatics
          </div>
          <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: '28px', fontWeight: 900, color: '#fff', margin: 0 }}>
            QR Check-in
          </h1>
          <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.45)', marginTop: '6px' }}>
            Scan student QR code to check in
          </p>
        </div>

        {/* Camera Scanner */}
        {!studentInfo && !loading && (
          <div style={{ background: NAVY, borderRadius: '16px', border: '1px solid rgba(255,255,255,0.08)', padding: '24px', marginBottom: '16px' }}>
            <canvas ref={canvasRef} style={{ display: 'none' }} />

            {scanning ? (
              <div>
                <video
                  ref={videoRef}
                  style={{ width: '100%', borderRadius: '12px', background: '#000' }}
                  muted playsInline
                />
                <button
                  onClick={stopCamera}
                  style={{ marginTop: '12px', width: '100%', padding: '12px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.2)', background: 'transparent', color: 'rgba(255,255,255,0.6)', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
                >
                  Cancel
                </button>
                {cameraError && (
                  <p style={{ color: '#e05a4a', fontSize: '12px', textAlign: 'center', marginTop: '8px' }}>
                    Camera not available. Use manual entry below.
                  </p>
                )}
              </div>
            ) : (
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '48px', marginBottom: '12px' }}>📷</div>
                <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.5)', marginBottom: '16px' }}>
                  Use camera to scan student QR code
                </p>
                <button
                  onClick={startCamera}
                  style={{ width: '100%', padding: '14px', borderRadius: '10px', background: GOLD, color: NAVY, border: 'none', fontSize: '14px', fontWeight: 700, cursor: 'pointer' }}
                >
                  Start Camera
                </button>
              </div>
            )}
          </div>
        )}

        {/* Manual Entry */}
        {!studentInfo && !loading && (
          <div style={{ background: NAVY, borderRadius: '16px', border: '1px solid rgba(255,255,255,0.08)', padding: '20px', marginBottom: '16px' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)', marginBottom: '12px' }}>
              Manual Entry (Student ID)
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                value={manualInput}
                onChange={e => setManualInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleManualSubmit()}
                placeholder="Paste student ID..."
                style={{ flex: 1, padding: '10px 14px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.05)', color: '#fff', fontSize: '13px', outline: 'none' }}
              />
              <button
                onClick={handleManualSubmit}
                style={{ padding: '10px 16px', borderRadius: '8px', background: GOLD, color: NAVY, border: 'none', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}
              >
                Go
              </button>
            </div>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div style={{ background: NAVY, borderRadius: '16px', border: '1px solid rgba(255,255,255,0.08)', padding: '40px', textAlign: 'center' }}>
            <div style={{ fontSize: '32px', marginBottom: '12px' }}>🔍</div>
            <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '14px' }}>Looking up student...</p>
          </div>
        )}

        {/* Error */}
        {error && (
          <div style={{ background: '#2a1a1a', borderRadius: '12px', border: '1px solid rgba(224,90,74,0.3)', padding: '16px 20px', marginBottom: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ color: '#e05a4a', fontSize: '13px' }}>⚠️ {error}</span>
            <button onClick={() => setError(null)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', fontSize: '16px' }}>×</button>
          </div>
        )}

        {/* Student Result */}
        {studentInfo && !loading && (
          <div style={{ background: NAVY, borderRadius: '16px', border: '1px solid rgba(255,255,255,0.08)', overflow: 'hidden' }}>

            {/* Student Header */}
            <div style={{ padding: '24px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                <div style={{ width: '52px', height: '52px', borderRadius: '50%', background: GOLD, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Playfair Display', serif", fontSize: '20px', fontWeight: 900, color: NAVY }}>
                  {studentInfo.full_name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <div style={{ fontSize: '18px', fontWeight: 700, color: '#fff' }}>{studentInfo.full_name}</div>
                  <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.45)', marginTop: '2px' }}>
                    {studentInfo.current_level
                      ? `Level ${studentInfo.current_level} · ${LEVEL_NAMES[studentInfo.current_level]}`
                      : 'Pending Assessment'}
                  </div>
                </div>
              </div>
            </div>

            {/* Booking Info */}
            <div style={{ padding: '20px 24px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
              {studentInfo.booking ? (
                <div>
                  <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)', marginBottom: '10px' }}>
                    Today's Lesson
                  </div>
                  <div style={{ fontSize: '15px', fontWeight: 700, color: '#fff', marginBottom: '4px' }}>
                    {studentInfo.booking.course_name}
                  </div>
                  <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.5)' }}>
                    with {studentInfo.booking.coach_name} · {formatTime(studentInfo.booking.start_time)} – {formatTime(studentInfo.booking.end_time)}
                  </div>

                  {/* Time warning */}
                  {studentInfo.minutes_until_class !== null && (
                    <div style={{ marginTop: '10px', padding: '8px 12px', borderRadius: '8px', background: studentInfo.check_in_allowed ? 'rgba(76,175,114,0.1)' : 'rgba(224,90,74,0.1)', border: `1px solid ${studentInfo.check_in_allowed ? 'rgba(76,175,114,0.3)' : 'rgba(224,90,74,0.3)'}` }}>
                      <span style={{ fontSize: '12px', fontWeight: 600, color: studentInfo.check_in_allowed ? '#4caf72' : '#e05a4a' }}>
                        {studentInfo.minutes_until_class > 0
                          ? `Class starts in ${studentInfo.minutes_until_class} min`
                          : studentInfo.minutes_until_class < 0
                            ? `Class started ${Math.abs(studentInfo.minutes_until_class)} min ago`
                            : 'Class starting now'}
                        {!studentInfo.check_in_allowed && studentInfo.minutes_until_class > 30 && ' — check-in opens 30 min before class'}
                        {!studentInfo.check_in_allowed && studentInfo.minutes_until_class < -30 && ' — check-in window has closed'}
                      </span>
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '12px 0' }}>
                  <div style={{ fontSize: '24px', marginBottom: '8px' }}>📅</div>
                  <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '13px', margin: 0 }}>No lesson scheduled for today</p>
                </div>
              )}
            </div>

            {/* Check-in Action */}
            <div style={{ padding: '20px 24px' }}>
              {checkedIn || studentInfo.already_checked_in ? (
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '48px', marginBottom: '8px' }}>✅</div>
                  <div style={{ fontSize: '16px', fontWeight: 700, color: '#4caf72', marginBottom: '4px' }}>Checked In!</div>
                  <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', marginBottom: '16px' }}>
                    {studentInfo.already_checked_in && !checkedIn ? 'Already checked in earlier' : 'Check-in recorded successfully'}
                  </div>
                  <button
                    onClick={reset}
                    style={{ width: '100%', padding: '12px', borderRadius: '10px', background: GOLD, color: NAVY, border: 'none', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}
                  >
                    Scan Next Student
                  </button>
                </div>
              ) : studentInfo.booking && studentInfo.check_in_allowed ? (
                <button
                  onClick={handleCheckIn}
                  disabled={loading}
                  style={{ width: '100%', padding: '16px', borderRadius: '10px', background: '#4caf72', color: '#fff', border: 'none', fontSize: '15px', fontWeight: 700, cursor: 'pointer' }}
                >
                  ✓ Check In Now
                </button>
              ) : (
                <button
                  onClick={reset}
                  style={{ width: '100%', padding: '12px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.15)', background: 'transparent', color: 'rgba(255,255,255,0.6)', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
                >
                  ← Scan Another
                </button>
              )}
            </div>
          </div>
        )}

      </div>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;900&family=DM+Sans:wght@400;500;600;700&display=swap');`}</style>
    </div>
  )
}
