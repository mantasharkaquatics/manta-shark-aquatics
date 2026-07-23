'use client'
import ChatWidget from '@/components/ChatWidget'

import { useEffect, useState, useRef } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import QRCode from 'qrcode'
import { getTodayLA, getNowMinutesLA } from '@/lib/date'
import { BAND_COLORS, bandKey } from '@/lib/zone-colors'

const NAVY = '#1a2744'
const DARK = '#111d38'
const GOLD = '#c9a84c'

const LEVEL_COLORS: Record<number, string> = {
  1: '#e05a4a', 2: '#e8883a', 3: '#d4a825', 4: '#4caf72',
  5: '#4a90c4', 6: '#7b5ea7', 7: '#9c7a3c', 8: '#a0a0a0', 9: '#c9a84c',
}
const LEVEL_NAMES: Record<number, string> = {
  1: 'Water Intro', 2: 'Water Comfort', 3: 'Pool Safety', 4: 'Beginner',
  5: 'Intermediate', 6: 'Advanced', 7: 'Bronze', 8: 'Silver', 9: 'Gold',
}

interface Parent { id: string; first_name: string; last_name: string; email: string }
interface Student { id: string; full_name: string; date_of_birth: string; current_level: number | null; gender: string; trial_used_at: string | null }
interface SkillProgress {
  skill_id: string
  skill_name: string
  progress_percent: number
  sort_order: number
}
interface ProgressRecord {
  session_date: string
  skills: SkillProgress[]
}
interface StudentProgress {
  student_id: string
  records: ProgressRecord[]
}

interface Credit {
  is_trial?: boolean
  id: string
  total_credits: number
  used_credits: number
  course_type_id: string
  student_id: string | null
  created_at?: string
  expires_at?: string | null
  course_types?: { name: string } | { name: string }[]
  purchases?: { paid_at: string | null; created_at: string } | { paid_at: string | null; created_at: string }[]
  invoice_id?: string | null
  invoices?: { id: string } | { id: string }[] | null
}
interface Booking {
  id: string; status: string
  session_date: string; start_time: string; end_time: string
  course_name: string; coach_name: string; student_name?: string; _group?: Booking[]
  level_min?: number | null; level_max?: number | null
  lesson_credit_id?: string
  token_package_id?: string
  course_slug?: string
  student_id?: string
  is_trial?: boolean
  checked_in?: boolean
  pending_action?: string
  pending_new_session_id?: string
  partner_booking_id?: string
  pending_expires_at?: string
  new_session_date?: string
  new_start_time?: string
  new_end_time?: string
  new_coach_name?: string
}

function getAge(dob: string): number {
  const birth = new Date(dob)
  const today = new Date()
  let age = today.getFullYear() - birth.getFullYear()
  const m = today.getMonth() - birth.getMonth()
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--
  return age
}

function getInitials(name: string): string {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
}

function formatTime(t: string): string {
  const [h, m] = t.split(':').map(Number)
  const ampm = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 || 12
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`
}

function formatDate(d: string): string {
  const date = new Date(d + 'T00:00:00')
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

function getDaysUntil(d: string): number {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const date = new Date(d + 'T00:00:00')
  return Math.round((date.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
}

// QR payload: base64 encode of student_id so it's not raw UUID
function makeQRPayload(studentId: string): string {
  return `MSA:${btoa(studentId)}`
}

const QUICK_LINKS = [
  { label: 'My Account', icon: '👤', href: '/dashboard/account', color: '#4a90c4', desc: 'Profile & subscription settings' },
  { label: 'Book a Lesson', icon: '📅', href: '/booking', color: GOLD, desc: 'Schedule your next session' },
  { label: 'Swim Levels', icon: '🏊', href: '/levels', color: '#4a90c4', desc: 'View curriculum & progress' },
  { label: 'Swim Plans', icon: '📦', href: '/plans', color: '#4caf72', desc: 'Browse lesson packages' },
  { label: 'Policies', icon: '📋', href: '/policies', color: '#9c7a3c', desc: 'Rules & terms' },
  { label: 'Partnerships', icon: '🤝', href: '/dashboard/partnerships', color: '#7b5ea7', desc: 'Book lessons together with another family' },
]

const STATUS_COLORS: Record<string, string> = {
  confirmed: '#4caf72',
  cancelled: '#e05a4a',
  completed: '#a0a0a0',
  pending: GOLD,
}

// QR Modal Component
function QRModal({ student, onClose }: { student: Student; onClose: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [qrDataUrl, setQrDataUrl] = useState<string>('')

  useEffect(() => {
    const payload = makeQRPayload(student.id)
    QRCode.toDataURL(payload, {
      width: 280,
      margin: 2,
      color: { dark: '#1a2744', light: '#ffffff' },
      errorCorrectionLevel: 'H',
    }).then(setQrDataUrl)
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
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1000, padding: '20px',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: NAVY, borderRadius: '20px',
          border: '1px solid rgba(255,255,255,0.12)',
          padding: '36px', maxWidth: '360px', width: '100%',
          textAlign: 'center', position: 'relative',
        }}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          style={{
            position: 'absolute', top: '16px', right: '16px',
            background: 'rgba(255,255,255,0.08)', border: 'none',
            borderRadius: '50%', width: '32px', height: '32px',
            color: 'rgba(255,255,255,0.6)', fontSize: '16px',
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >×</button>

        {/* Header */}
        <div style={{ marginBottom: '24px' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase', color: GOLD, marginBottom: '6px' }}>
            Check-in QR Code
          </div>
          <div style={{ fontFamily: "'Playfair Display', serif", fontSize: '22px', fontWeight: 900, color: '#fff' }}>
            {student.full_name}
          </div>
        </div>

        {/* QR Code */}
        <div style={{
          background: '#fff', borderRadius: '16px', padding: '20px',
          display: 'inline-block', marginBottom: '20px',
          boxShadow: `0 0 0 4px ${GOLD}30`,
        }}>
          {qrDataUrl ? (
            <img src={qrDataUrl} alt="QR Code" style={{ display: 'block', width: '200px', height: '200px' }} />
          ) : (
            <div style={{ width: '200px', height: '200px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#999' }}>
              Loading...
            </div>
          )}
        </div>

        {/* Instructions */}
        <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.45)', margin: '0 0 20px', lineHeight: 1.6 }}>
          Show this QR code at the front desk to check in for today's lesson.
        </p>

        {/* Download button */}
        <button
          onClick={handleDownload}
          style={{
            width: '100%', padding: '12px', borderRadius: '10px',
            background: GOLD, color: NAVY, border: 'none',
            fontSize: '13px', fontWeight: 700, cursor: 'pointer',
            letterSpacing: '0.5px',
          }}
        >
          Download QR Code
        </button>
      </div>
    </div>
  )
}

function CreditCard({ g, remaining, pct, note, bookHref }: {
  g: { name: string; total: number; used: number; items: { credits: number; used: number; date: string | null; invoiceId?: string | null; expiresAt?: string | null }[] }
  remaining: number
  pct: number
  note?: string
  bookHref?: string
}) {
  const [expanded, setExpanded] = useState(false)
  return (
    <div style={{ background: '#1a2744', borderRadius: '14px', border: '1px solid rgba(255,255,255,0.08)', padding: '20px' }}>
      <div style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)', marginBottom: '8px' }}>
        {g.name}
      </div>
      <div style={{ fontFamily: "'Playfair Display', serif", fontSize: '36px', fontWeight: 900, color: '#c9a84c', lineHeight: 1 }}>{remaining}</div>
      <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', marginTop: '4px', marginBottom: note ? '2px' : '12px' }}>of {g.total} remaining</div>
      {note && <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.3)', marginBottom: '12px' }}>{note}</div>}
      <div style={{ height: '4px', background: 'rgba(255,255,255,0.08)', borderRadius: '2px', marginBottom: '12px' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: '#c9a84c', borderRadius: '2px' }} />
      </div>
      {bookHref && (
        <Link href={bookHref} style={{ display: 'block', textAlign: 'center', padding: '9px 0', marginBottom: '12px', background: '#c9a84c', color: '#1a2744', borderRadius: '8px', fontSize: '12px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', textDecoration: 'none' }}>
          Book Now
        </Link>
      )}
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          background: 'none', border: 'none', padding: 0,
          fontSize: '11px', color: 'rgba(255,255,255,0.35)',
          cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px',
          letterSpacing: '0.5px',
        }}
      >
        <span style={{ fontSize: '9px' }}>{expanded ? '▲' : '▼'}</span>
        {expanded ? 'Hide' : 'Show'} {g.items.length} package{g.items.length > 1 ? 's' : ''}
      </button>
      {expanded && (
        <div style={{ marginTop: '12px', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {g.items.map((item, i) => {
            const itemRemaining = item.credits - item.used
            const dateStr = item.date ? new Date(item.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'
            const expStr = item.expiresAt ? new Date(item.expiresAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : null
            const isExpired = item.expiresAt ? new Date(item.expiresAt).getTime() < Date.now() : false
            return (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingBottom: i < g.items.length - 1 ? '8px' : 0, marginBottom: i < g.items.length - 1 ? '8px' : 0, borderBottom: i < g.items.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
                  <div style={{ fontSize: '11px', color: isExpired ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.35)', whiteSpace: 'nowrap' }}>{dateStr}{expStr && <span style={{ color: isExpired ? 'rgba(224,90,74,0.6)' : 'rgba(255,255,255,0.25)' }}> · Exp {expStr}</span>}</div>
                  <div style={{ fontSize: '12px', fontWeight: 600, color: isExpired ? 'rgba(255,255,255,0.25)' : itemRemaining > 0 ? '#c9a84c' : 'rgba(255,255,255,0.3)', flexShrink: 0, whiteSpace: 'nowrap' }}>
                    {itemRemaining} / {item.credits} left
                  </div>
                </div>
                {item.invoiceId && (
                  <a href={`/api/invoices/${item.invoiceId}/pdf`} target="_blank" rel="noopener noreferrer"
                    style={{ fontSize: '10px', fontWeight: 700, color: '#1a2744', background: '#c9a84c', padding: '2px 8px', borderRadius: 6, textDecoration: 'none', whiteSpace: 'nowrap', alignSelf: 'flex-end' }}>
                    Download Invoice
                  </a>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

interface TokenPack { id: string; course_name: string; remaining: number; expires_at: string; source: string }

function TeamCard({ memberships }: { memberships: { id: string; student_name: string; tier_name: string; status: string; cancels_at?: string | null; expires_at?: string | null; is_prepaid?: boolean; invoices?: { date: string; period_end: string | null; url: string | null }[] }[] }) {
  const [portalLoading, setPortalLoading] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  if (memberships.length === 0) return null
  const RED = '#e05a4a'
  const openPortal = async (id: string) => {
    setPortalLoading(id)
    try {
      const r = await fetch('/api/team/portal', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ membership_id: id }) })
      const j = await r.json()
      if (r.ok && j.url) { window.location.href = j.url; return }
      alert(j.error || 'Could not open the subscription portal')
    } finally { setPortalLoading(null) }
  }
  return (
    <div style={{ background: '#1a2744', borderRadius: '14px', border: `1px solid ${RED}55`, padding: '20px' }}>
      <div style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '1.5px', textTransform: 'uppercase', color: RED, marginBottom: '8px' }}>Swim Team</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {memberships.map((m, mi) => (
          <div key={m.id} style={{ borderTop: mi > 0 ? '1px solid rgba(255,255,255,0.08)' : 'none', marginTop: mi > 0 ? '16px' : 0, paddingTop: mi > 0 ? '16px' : 0 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
            <div>
              <div style={{ fontSize: '14px', fontWeight: 700, color: '#fff' }}>{m.student_name}</div>
              <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)' }}>{m.tier_name} · {m.is_prepaid ? 'Prepaid' : '$399/mo'}</div>
              <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)' }}>unlimited practices</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
            {m.is_prepaid ? (() => {
              const exp = m.expires_at ? new Date(m.expires_at) : null
              const expired = exp ? exp.getTime() < Date.now() : false
              const label = exp ? `${expired ? 'Expired' : 'Paid thru'} ${exp.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : 'Prepaid'
              const c = expired ? '#e05a4a' : '#86efac'
              const bg = expired ? 'rgba(224,90,74,0.12)' : 'rgba(134,239,172,0.12)'
              const bd = expired ? '1px solid rgba(224,90,74,0.3)' : '1px solid rgba(134,239,172,0.3)'
              return <span style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: c, background: bg, border: bd, borderRadius: '20px', padding: '3px 10px', whiteSpace: 'nowrap' }}>{label}</span>
            })() : m.cancels_at ? <span style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: '#e8883a', background: 'rgba(232,136,58,0.12)', border: '1px solid rgba(232,136,58,0.3)', borderRadius: '20px', padding: '3px 10px' }}>Cancels {new Date(m.cancels_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span> : <span style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: m.status === 'active' ? '#86efac' : '#e8883a', background: m.status === 'active' ? 'rgba(134,239,172,0.12)' : 'rgba(232,136,58,0.12)', border: m.status === 'active' ? '1px solid rgba(134,239,172,0.3)' : '1px solid rgba(232,136,58,0.3)', borderRadius: '20px', padding: '3px 10px' }}>{m.status === 'active' ? 'Active' : 'Past Due'}</span>}
            {!m.is_prepaid && (
            <button onClick={() => openPortal(m.id)} disabled={portalLoading === m.id}
              style={{ padding: '5px 12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.2)', background: 'transparent', color: 'rgba(255,255,255,0.7)', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}>
              {portalLoading === m.id ? '...' : 'Manage'}
            </button>
            )}
            </div>
          </div>
          {(m.invoices || []).length > 0 && (
            <div style={{ marginTop: '10px' }}>
              <button onClick={() => setExpanded(prev => ({ ...prev, [m.id]: !prev[m.id] }))}
                style={{ background: 'none', border: 'none', padding: 0, fontSize: '11px', color: 'rgba(255,255,255,0.35)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', letterSpacing: '0.5px' }}>
                <span style={{ fontSize: '9px' }}>{expanded[m.id] ? '\u25b2' : '\u25bc'}</span>
                {expanded[m.id] ? 'Hide' : 'Show'} {(m.invoices || []).length} invoice{(m.invoices || []).length > 1 ? 's' : ''}
              </button>
              {expanded[m.id] && (
                <div style={{ marginTop: '12px', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {(m.invoices || []).map((iv, i) => {
                    const dateStr = new Date(iv.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                    const expStr = iv.period_end ? new Date(iv.period_end).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : null
                    return (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingBottom: i < (m.invoices || []).length - 1 ? '8px' : 0, borderBottom: i < (m.invoices || []).length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
                        <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.35)', whiteSpace: 'nowrap' }}>{dateStr}{expStr && <span style={{ color: 'rgba(255,255,255,0.25)' }}> · Exp {expStr}</span>}</div>
                        {iv.url && (
                          <a href={iv.url} target="_blank" rel="noopener noreferrer"
                            style={{ fontSize: '10px', fontWeight: 700, color: '#1a2744', background: '#c9a84c', padding: '2px 8px', borderRadius: 6, textDecoration: 'none', whiteSpace: 'nowrap' }}>
                            Download Invoice
                          </a>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}
          </div>
        ))}
      </div>
    </div>
  )
}

function TokenCard({ tokens }: { tokens: TokenPack[] }) {
  if (tokens.length === 0) return null
  const totalTokens = tokens.reduce((s, t) => s + t.remaining, 0)
  const ORANGE = '#e8883a'
  return (
    <div style={{ background: '#1a2744', borderRadius: '14px', border: `1px solid ${ORANGE}55`, padding: '20px' }}>
      <div style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '1.5px', textTransform: 'uppercase', color: ORANGE, marginBottom: '8px' }}>
        Tokens
      </div>
      <div style={{ fontFamily: "'Playfair Display', serif", fontSize: '36px', fontWeight: 900, color: ORANGE, lineHeight: 1 }}>{totalTokens}</div>
      <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', marginTop: '4px', marginBottom: '10px' }}>available for same-day or next-day booking</div>
      <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.3)', marginBottom: '12px' }}>Token bookings are final — no cancellation or reschedule.</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '12px' }}>
        {tokens.map(t => {
          const daysLeft = Math.max(0, Math.ceil((new Date(t.expires_at).getTime() - Date.now()) / 86400000))
          const urgent = daysLeft <= 7
          return (
            <div key={t.id} style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, minWidth: 0 }}>
                <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.course_name}</div>
                <span style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '0.5px', textTransform: 'uppercase', flexShrink: 0, borderRadius: '8px', padding: '1px 7px', color: t.source === 'manual' ? '#c9a84c' : ORANGE, background: t.source === 'manual' ? 'rgba(201,168,76,0.12)' : 'rgba(232,136,58,0.1)', border: t.source === 'manual' ? '1px solid rgba(201,168,76,0.35)' : '1px solid rgba(232,136,58,0.3)' }}>{t.source === 'manual' ? 'Courtesy' : 'Make-up'}</span>
              </div>
              <div style={{ fontSize: '11px', whiteSpace: 'nowrap', flexShrink: 0 }}>
                <span style={{ fontWeight: 600, color: ORANGE }}>{t.remaining} token{t.remaining === 1 ? '' : 's'}</span>
                <span style={{ color: urgent ? '#e05a4a' : 'rgba(255,255,255,0.35)', fontWeight: urgent ? 700 : 400 }}> · {daysLeft} day{daysLeft === 1 ? '' : 's'} left</span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function DashboardPage() {
  const supabase = createClient()
  const [parent, setParent] = useState<Parent | null>(null)
  const [students, setStudents] = useState<Student[]>([])
  const [credits, setCredits] = useState<Credit[]>([])
  const [tokenPacks, setTokenPacks] = useState<TokenPack[]>([])
  const [teamMemberships, setTeamMemberships] = useState<{ id: string; student_name: string; tier_name: string; status: string }[]>([])
  const [cancelQuota, setCancelQuota] = useState<{ total: number; used: number; remaining: number } | null>(null)
  const [upcomingBookings, setUpcomingBookings] = useState<Booking[]>([])
  const [pastBookings, setPastBookings] = useState<Booking[]>([])
  const [loading, setLoading] = useState(true)
  const [greeting, setGreeting] = useState('Good morning')

  async function loadTokens() {
    try {
      const res = await fetch('/api/parent/tokens')
      if (!res.ok) return
      const data = await res.json()
      setTokenPacks(data.tokens || [])
      setCancelQuota(data.quota || null)
      const tmRes = await fetch('/api/parent/team-memberships')
      if (tmRes.ok) { const tmData = await tmRes.json(); setTeamMemberships(tmData.memberships || []) }
    } catch {}
  }
  useEffect(() => { loadTokens() }, [])
  const [cancellingId, setCancellingId] = useState<string | null>(null)
  const [reschedulingId, setReschedulingId] = useState<string | null>(null)
  const [rescheduleTarget, setRescheduleTarget] = useState<{ id: string; creditId: string; slug: string; studentId: string; courseName: string; date: string; time: string; partnerBookingId?: string } | null>(null)
  const [rescheduleActionModal, setRescheduleActionModal] = useState<{ bookingId: string; type: 'reject' | 'cancel'; title: string; message: string } | null>(null)
  const [cancelTarget, setCancelTarget] = useState<{ id: string; courseName: string; date: string; time: string; type?: 'cancel' | 'reject'; isLate?: boolean } | null>(null)
  const [infoModal, setInfoModal] = useState<{ title: string; message: string; actionLabel?: string; onAction?: () => void } | null>(null)
  const [qrStudent, setQrStudent] = useState<Student | null>(null)
  const [studentProgressMap, setStudentProgressMap] = useState<Record<string, StudentProgress>>({})
  const [expandedProgress, setExpandedProgress] = useState<Set<string>>(new Set())
  const [progressPage, setProgressPage] = useState<Record<string, number>>({})
  const [expandedRecord, setExpandedRecord] = useState<Record<string, string | null>>({})
  const [pendingPartnerBookings, setPendingPartnerBookings] = useState<any[]>([])
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const [rejectingId, setRejectingId] = useState<string | null>(null)
  const [now, setNow] = useState(Date.now())
  const [showAllUpcoming, setShowAllUpcoming] = useState(false)
  const [pendingPayBusy, setPendingPayBusy] = useState<string | null>(null)
  const [pendingCancelConfirm, setPendingCancelConfirm] = useState<string | null>(null)
  const [pendingPayMsg, setPendingPayMsg] = useState('')
  const [showAllHistory, setShowAllHistory] = useState(false)
  const [historyPage, setHistoryPage] = useState(0)
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    const hour = new Date().getHours()
    if (hour < 12) setGreeting('Good morning')
    else if (hour < 17) setGreeting('Good afternoon')
    else setGreeting('Good evening')
  }, [])

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    loadTokens()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: parentData } = await supabase
      .from('parents').select('*').eq('auth_user_id', user.id).single()
    if (!parentData) return
    setParent(parentData)

    const today = getTodayLA()

    // Lazy cleanup: remove expired pending_partner bookings
    const nowIso = new Date().toISOString()
    supabase.from('bookings').delete()
      .eq('status', 'pending_partner')
      .lt('pending_expires_at', nowIso)
      .then(() => {})
    // Clean up expired pending reschedules
    supabase.from('bookings').update({ pending_action: null, pending_new_session_id: null, pending_expires_at: null })
      .in('pending_action', ['reschedule', 'reschedule_initiator'])
      .lt('pending_expires_at', nowIso)
      .then(() => {})

    const [{ data: studs }, { data: credData }, { data: rawBookings }] = await Promise.all([
      supabase.from('students').select('*').eq('parent_id', parentData.id).eq('is_active', true).order('sort_order'),
      supabase
        .from('lesson_credits')
        .select('id, total_credits, used_credits, course_type_id, student_id, created_at, expires_at, is_trial, course_types(name), purchases(paid_at, created_at), invoices(id)')
        .eq('parent_id', parentData.id)
        .gt('total_credits', 0)
        .is('converted_to_token_at', null),
      supabase.from('bookings')
        .select('id, status, student_id, lesson_credit_id, token_package_id, is_trial, class_session_id, partner_booking_id, pending_action, pending_new_session_id, pending_expires_at')
        .eq('parent_id', parentData.id)
        .neq('status', 'cancelled')
        .order('created_at', { ascending: true }),
    ])

    // Query class_sessions and students separately
    const sessionIds = [...new Set((rawBookings || []).map((b: any) => b.class_session_id).filter(Boolean))]
    const studentIds = [...new Set((rawBookings || []).map((b: any) => b.student_id).filter(Boolean))]

    const [{ data: sessionsData }, { data: studentsData }] = await Promise.all([
      sessionIds.length > 0
        ? supabase.from('class_sessions').select('id, session_date, start_time, end_time, level_min, level_max, course_types(name, slug), coaches(first_name)').in('id', sessionIds)
        : Promise.resolve({ data: [] }),
      studentIds.length > 0
        ? supabase.from('students').select('id, full_name').in('id', studentIds)
        : Promise.resolve({ data: [] }),
    ])

    const sessionMap: Record<string, any> = {}
    for (const s of sessionsData || []) {
      const ct = Array.isArray((s as any).course_types) ? (s as any).course_types[0] : (s as any).course_types
      const coach = Array.isArray((s as any).coaches) ? (s as any).coaches[0] : (s as any).coaches
      sessionMap[(s as any).id] = { ...(s as any), ct, coach }
    }
    const studentMap: Record<string, any> = {}
    for (const s of studentsData || []) { studentMap[(s as any).id] = s }

    // Fetch new session data for pending reschedules
    const newSessionIds = [...new Set((rawBookings || [])
      .filter((b: any) => b.pending_new_session_id)
      .map((b: any) => b.pending_new_session_id)
      .filter(Boolean))]
    if (newSessionIds.length > 0) {
      const { data: newSessionsData } = await supabase
        .from('class_sessions')
        .select('id, session_date, start_time, end_time, level_min, level_max, course_types(name, slug), coaches(first_name)')
        .in('id', newSessionIds)
      for (const s of newSessionsData || []) {
        const ct = Array.isArray((s as any).course_types) ? (s as any).course_types[0] : (s as any).course_types
        const coach = Array.isArray((s as any).coaches) ? (s as any).coaches[0] : (s as any).coaches
        sessionMap[(s as any).id] = { ...(s as any), ct, coach }
      }
    }

    setStudents(studs || [])
    setCredits(credData || [])

    // Fetch cross-account bookings awaiting confirmation
    const { data: pendingRaw } = await supabase
      .from('bookings')
      .select('id, student_id, pending_expires_at, partner_parent_id, class_session_id')
      .eq('parent_id', parentData.id)
      .eq('status', 'pending_partner')
      .eq('pending_action', 'confirm')
      .gt('pending_expires_at', new Date().toISOString())

    // Backfill session/student data for pending items
    const pendingSessionIds = [...new Set((pendingRaw || []).map((b: any) => b.class_session_id).filter(Boolean))]
    const pendingStudentIds = [...new Set((pendingRaw || []).map((b: any) => b.student_id).filter(Boolean))]
    const [{ data: pSessions }, { data: pStudents }] = await Promise.all([
      pendingSessionIds.length > 0
        ? supabase.from('class_sessions').select('id, session_date, start_time, end_time, course_types(name), coaches(first_name)').in('id', pendingSessionIds)
        : Promise.resolve({ data: [] }),
      pendingStudentIds.length > 0
        ? supabase.from('students').select('id, full_name').in('id', pendingStudentIds)
        : Promise.resolve({ data: [] }),
    ])
    const pSessionMap: Record<string, any> = {}
    for (const s of pSessions || []) {
      const ct = Array.isArray((s as any).course_types) ? (s as any).course_types[0] : (s as any).course_types
      const coach = Array.isArray((s as any).coaches) ? (s as any).coaches[0] : (s as any).coaches
      pSessionMap[(s as any).id] = { ...(s as any), course_types: ct, coaches: coach }
    }
    const pStudentMap: Record<string, any> = {}
    for (const s of pStudents || []) { pStudentMap[(s as any).id] = s }

    const studentOrder: Record<string, number> = {}
    ;(studs || []).forEach((s: any, i: number) => { studentOrder[s.id] = i })
    setPendingPartnerBookings((pendingRaw || []).map((b: any) => ({
      ...b,
      class_sessions: pSessionMap[b.class_session_id] || null,
      students: pStudentMap[b.student_id] || null,
    })).sort((a: any, b: any) => {
      const oa = studentOrder[a.student_id] ?? 999
      const ob = studentOrder[b.student_id] ?? 999
      if (oa !== ob) return oa - ob
      const ka = (a.class_sessions?.session_date || '') + (a.class_sessions?.start_time || '')
      const kb = (b.class_sessions?.session_date || '') + (b.class_sessions?.start_time || '')
      return ka.localeCompare(kb)
    }))

    // Fetch partner student names for 1-on-2 sessions (server API to bypass RLS)
    const on2SessionIds = (rawBookings || [])
      .filter((b: any) => b.status !== 'cancelled')
      .map((b: any) => b.class_session_id)
      .filter(Boolean)
    if (on2SessionIds.length > 0 && parentData?.id) {
      try {
        const partnerRes = await fetch('/api/bookings/session-partners', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ session_ids: on2SessionIds, parent_id: parentData.id }),
        })
        if (partnerRes.ok) {
          const { partners } = await partnerRes.json()
          for (const b of rawBookings || []) {
            if (partners[b.class_session_id]) {
              (b as any)._partner_student_name = partners[b.class_session_id]
            }
          }
        }
      } catch {}
    }

    const parseBookings = (data: any[]): Booking[] =>
      (data || []).map((b: any) => {
        const cs = sessionMap[b.class_session_id]
        return {
          id: b.id,
          status: b.status,
          session_date: cs?.session_date,
          start_time: cs?.start_time,
          end_time: cs?.end_time,
          course_name: cs?.ct?.name,
          level_min: cs?.level_min ?? null, level_max: cs?.level_max ?? null,
          coach_name: cs?.coach?.first_name,
          student_name: studentMap[b.student_id]?.full_name ? (b._partner_student_name ? studentMap[b.student_id].full_name + ', ' + b._partner_student_name : studentMap[b.student_id].full_name) : undefined,
          lesson_credit_id: b.lesson_credit_id,
          token_package_id: b.token_package_id,
          course_slug: cs?.ct?.slug,
          student_id: b.student_id,
          is_trial: b.is_trial,
          pending_action: b.pending_action,
          pending_new_session_id: b.pending_new_session_id,
          partner_booking_id: b.partner_booking_id,
          pending_expires_at: b.pending_expires_at,
          new_session_date: b.pending_new_session_id ? sessionMap[b.pending_new_session_id]?.session_date : undefined,
          new_start_time: b.pending_new_session_id ? sessionMap[b.pending_new_session_id]?.start_time : undefined,
          new_end_time: b.pending_new_session_id ? sessionMap[b.pending_new_session_id]?.end_time : undefined,
          new_coach_name: b.pending_new_session_id ? sessionMap[b.pending_new_session_id]?.coach?.first_name : undefined,
        }
      }).filter(b => b.session_date)

    // Merge same session into one card (same-account 1-on-2)
    const mergeBySession = (bookings: Booking[]): Booking[] => {
      const map: Record<string, Booking> = {}
      const result: Booking[] = []
      for (const b of bookings) {
        // Cross-account 1-on-2 (has partner_booking_id): keep as-is, no merge
        if (b.partner_booking_id || b.pending_action) {
          result.push(b)
          continue
        }
        const raw = (rawBookings || []).find((r: any) => r.id === b.id)
        const sid = raw?.class_session_id || b.id
        if (map[sid]) {
          const base = map[sid]
          const grp = base._group || [base]
          const newName = b.student_name && !base.student_name?.includes(b.student_name) ? base.student_name + ', ' + b.student_name : base.student_name
          map[sid] = { ...base, student_name: newName, _group: [...grp, b] }
        } else {
          map[sid] = b
        }
      }
      return [...result, ...Object.values(map)]
    }
    const nowMinutesLA = getNowMinutesLA()
    const isLessonPast = (b: Booking) => {
      if (b.session_date < today) return true
      if (b.session_date > today) return false
      // Today: check whether the lesson end time has passed
      const [eh, em] = b.end_time.split(':').map(Number)
      return (eh * 60 + em) <= nowMinutesLA
    }
    const allUpcoming = mergeBySession(parseBookings(rawBookings || []).filter(b => !isLessonPast(b)))
    const allPast = parseBookings(rawBookings || []).filter(b => isLessonPast(b))

    // Fetch attendance for ALL bookings (incl. today's) so Upcoming cards can show check-in status
    const allBookingIds = (rawBookings || []).map((b: any) => b.id)
    let checkedInSet = new Set<string>()
    if (allBookingIds.length > 0) {
      const res = await fetch('/api/parent/attendance?booking_ids=' + allBookingIds.join(','))
      const json = await res.json().catch(() => ({ checkedInBookingIds: [] }))
      for (const id of (json.checkedInBookingIds || [])) {
        checkedInSet.add(id)
      }
    }

    setUpcomingBookings(allUpcoming.map(b => ({ ...b, checked_in: checkedInSet.has(b.id) })).sort((a, b) => a.session_date.localeCompare(b.session_date)))

    const allPastWithCheckin = allPast.map(b => ({ ...b, checked_in: checkedInSet.has(b.id) }))
    setPastBookings(allPastWithCheckin.sort((a, b) => b.session_date.localeCompare(a.session_date)).slice(0, 50))
    // Fetch each student's latest approved progress_history
    const studentIdList = (studs || []).map((s: any) => s.id)
    if (studentIdList.length > 0) {
      const { data: histRows } = await supabase
        .from('progress_history')
        .select('student_id, session_date, snapshot')
        .in('student_id', studentIdList)
        .eq('status', 'approved')
        .order('session_date', { ascending: false })

      // Group all records by student
      const allByStudent: Record<string, { session_date: string; snapshot: Record<string, number> }[]> = {}
      for (const row of histRows || []) {
        const sid = (row as any).student_id
        if (!allByStudent[sid]) allByStudent[sid] = []
        allByStudent[sid].push({
          session_date: (row as any).session_date,
          snapshot: (row as any).snapshot || {},
        })
      }

      // Fetch skill names (including all skills used in snapshots)
      const allSkillIds = [...new Set((histRows || []).flatMap((r: any) => Object.keys(r.snapshot || {})))]
      let skillNameMap: Record<string, { name: string; sort_order: number; level_id: string }> = {}

      // Also fetch all skills for each student's current_level, fill missing with 0%
      const studentLevelMap: Record<string, string | null> = {}
      for (const s of studs || []) studentLevelMap[s.id] = s.current_level
      const allLevelNums = [...new Set(Object.values(studentLevelMap).filter(Boolean))]
      let levelSkillsMap: Record<string, { id: string; name: string; sort_order: number }[]> = {}

      if (allLevelNums.length > 0) {
        const { data: levRows } = await supabase
          .from('levels')
          .select('id, level_number')
          .in('level_number', allLevelNums)
        const levelIdMap: Record<string, string> = {}
        for (const l of levRows || []) levelIdMap[String(l.level_number)] = l.id
        const allLevelIds = Object.values(levelIdMap)
        if (allLevelIds.length > 0) {
          const { data: skRows } = await supabase
            .from('skills')
            .select('id, name, sort_order, level_id')
            .in('level_id', allLevelIds)
            .order('sort_order')
          for (const sk of skRows || []) {
            skillNameMap[(sk as any).id] = { name: (sk as any).name, sort_order: (sk as any).sort_order, level_id: (sk as any).level_id }
            // Build levelId → skills map
            if (!levelSkillsMap[(sk as any).level_id]) levelSkillsMap[(sk as any).level_id] = []
            levelSkillsMap[(sk as any).level_id].push({ id: (sk as any).id, name: (sk as any).name, sort_order: (sk as any).sort_order })
          }
          // Add remaining snapshot skills (old data with mismatched level still shows names)
          const missing = allSkillIds.filter(id => !skillNameMap[id])
          if (missing.length > 0) {
            const { data: extraRows } = await supabase.from('skills').select('id, name, sort_order, level_id').in('id', missing)
            for (const sk of extraRows || []) skillNameMap[(sk as any).id] = { name: (sk as any).name, sort_order: (sk as any).sort_order, level_id: (sk as any).level_id }
          }
          // Build levelNumber → levelId map
          const numToLevelId = levelIdMap

          const progressMap: Record<string, StudentProgress> = {}
          for (const [sid, hists] of Object.entries(allByStudent)) {
            const levelNum = studentLevelMap[sid]
            const levelId = levelNum ? numToLevelId[String(levelNum)] : null
            const allLevelSkills = levelId ? (levelSkillsMap[levelId] || []) : []

            const records: ProgressRecord[] = hists.map(hist => {
              // Use all Level skills as the base, fill in snapshot values, default missing to 0
              const skillsForRecord = allLevelSkills.length > 0
                ? allLevelSkills.map(sk => ({
                    skill_id: sk.id,
                    skill_name: sk.name,
                    progress_percent: (hist.snapshot[sk.id] as number) ?? 0,
                    sort_order: sk.sort_order,
                  }))
                : Object.entries(hist.snapshot).map(([skill_id, pct]) => ({
                    skill_id,
                    skill_name: skillNameMap[skill_id]?.name || skill_id,
                    progress_percent: pct as number,
                    sort_order: skillNameMap[skill_id]?.sort_order || 999,
                  })).sort((a, b) => a.sort_order - b.sort_order)
              return { session_date: hist.session_date, skills: skillsForRecord }
            })
            progressMap[sid] = { student_id: sid, records }
          }
          setStudentProgressMap(progressMap)
        }
      } else {
        // Fallback when level info is missing
        if (allSkillIds.length > 0) {
          const { data: skillRows } = await supabase.from('skills').select('id, name, sort_order').in('id', allSkillIds)
          for (const sk of skillRows || []) skillNameMap[(sk as any).id] = { name: (sk as any).name, sort_order: (sk as any).sort_order, level_id: '' }
        }
        const progressMap: Record<string, StudentProgress> = {}
        for (const [sid, hists] of Object.entries(allByStudent)) {
          const records: ProgressRecord[] = hists.map(hist => ({
            session_date: hist.session_date,
            skills: Object.entries(hist.snapshot).map(([skill_id, pct]) => ({
              skill_id, skill_name: skillNameMap[skill_id]?.name || skill_id,
              progress_percent: pct as number, sort_order: skillNameMap[skill_id]?.sort_order || 999,
            })).sort((a, b) => a.sort_order - b.sort_order),
          }))
          progressMap[sid] = { student_id: sid, records }
        }
        setStudentProgressMap(progressMap)
      }
    }

    setLoading(false)
  }

  async function confirmPartnerBooking(bookingId: string) {
    setConfirmingId(bookingId)
    try {
      const res = await fetch('/api/bookings/confirm-partner', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ partner_booking_id: bookingId }),
      })
      const data = await res.json()
      if (!res.ok) {
        if (res.status === 402) {
            setInfoModal({ title: 'Not Enough Credits', message: data.error || 'Not enough credits. Please purchase a plan.', actionLabel: 'View Plans', onAction: () => { window.location.href = '/plans' } })
          } else if (res.status === 409) {
            setInfoModal({ title: 'Unable to Confirm', message: data.error || 'This time slot has been taken and the invitation was cancelled.' })
          } else {
            setInfoModal({ title: 'Confirmation Failed', message: data.error || 'Please try again later.' })
          }
          await fetchAll()
          setConfirmingId(null)
          return
        }
    } catch {
      setInfoModal({ title: 'Confirmation Failed', message: 'Please try again later.' })
      setConfirmingId(null)
      setConfirmingId(null)
      return
    }
    await fetchAll()
    setConfirmingId(null)
  }

  async function rejectPartnerBooking(bookingId: string) {
    setRejectingId(bookingId)
    try {
      await fetch('/api/bookings/reject-partner', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ booking_id: bookingId }),
      })
    } catch {}
    await fetchAll()
    setRejectingId(null)
  }

  function isWithin24Hours(sessionDate: string, startTime: string): boolean {
    const nowUTC = new Date()
    // Treat lesson time as LA time and convert to UTC
    const sessionLAString = `${sessionDate}T${startTime}`
    const sessionUTC = new Date(new Date(sessionLAString).toLocaleString('en-US', { timeZone: 'UTC' }))
    const sessionLA = new Date(new Date(sessionLAString + ' America/Los_Angeles').toLocaleString('en-US', { timeZone: 'UTC' }))
    // Parse LA time correctly with Intl
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Los_Angeles',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
    })
    const parts = formatter.formatToParts(nowUTC)
    const get = (type: string) => parts.find(p => p.type === type)?.value ?? '0'
    const nowLA = new Date(`${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}`)
    const sessionStart = new Date(`${sessionDate}T${startTime}`)
    const diffMs = sessionStart.getTime() - nowLA.getTime()
    return diffMs <= 24 * 60 * 60 * 1000
  }

  async function cancelBooking(bookingId: string) {
    setCancellingId(bookingId)
    // Cancel via server API (also cancels partner booking and refunds credit)
    await fetch('/api/bookings/cancel-with-partner', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ booking_id: bookingId })
    })
    await fetchAll()
    setCancellingId(null)
  }

  function confirmReschedule() {
    if (!rescheduleTarget) return
    // Go to booking page with old booking ID; old lesson is cancelled only after new one confirms
    const partnerParam = rescheduleTarget.partnerBookingId ? `&reschedule_partner_booking_id=${rescheduleTarget.partnerBookingId}` : ''
    window.location.href = `/booking?reschedule_booking_id=${rescheduleTarget.id}&reschedule_credit_id=${rescheduleTarget.creditId}&reschedule_slug=${rescheduleTarget.slug}&reschedule_student_id=${rescheduleTarget.studentId}${partnerParam}`
  }

  if (loading) return (
    <div style={{ minHeight: '100vh', background: DARK, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '32px', marginBottom: '16px' }}>🦈</div>
        <div style={{ fontSize: '14px', color: 'rgba(255,255,255,0.5)' }}>Loading your dashboard...</div>
      </div>
    </div>
  )

  return (
    <div style={{ fontFamily: "'DM Sans', sans-serif", background: DARK, minHeight: '100vh' }}>
      {/* QR Modal */}
      {qrStudent && <QRModal student={qrStudent} onClose={() => setQrStudent(null)} />}

      {/* Info Modal */}
      {infoModal && (
        <div onClick={() => setInfoModal(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#1a2744', borderRadius: '20px', border: '1px solid rgba(255,255,255,0.12)', padding: '32px', maxWidth: '380px', width: '100%' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase', color: '#e05a4a', marginBottom: '8px' }}>Notice</div>
            <div style={{ fontFamily: "'Playfair Display', serif", fontSize: '20px', fontWeight: 900, color: '#fff', marginBottom: '16px' }}>{infoModal.title}</div>
            <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.5)', lineHeight: 1.6, marginBottom: '24px' }}>{infoModal.message}</p>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={() => setInfoModal(null)} style={{ flex: 1, padding: '12px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.15)', background: 'transparent', color: 'rgba(255,255,255,0.6)', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
                Close
              </button>
              {infoModal.onAction && (
                <button onClick={() => { setInfoModal(null); infoModal.onAction?.() }} style={{ flex: 1, padding: '12px', borderRadius: '10px', border: 'none', background: '#c9a84c', color: '#1a2744', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}>
                  {infoModal.actionLabel || 'OK'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Cancel Confirm Modal */}
      {cancelTarget && (
        <div onClick={() => setCancelTarget(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#1a2744', borderRadius: '20px', border: '1px solid rgba(255,255,255,0.12)', padding: '32px', maxWidth: '380px', width: '100%' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase', color: '#e05a4a', marginBottom: '8px' }}>{cancelTarget.type === 'reject' ? 'REJECT INVITATION' : 'CANCEL LESSON'}</div>
            <div style={{ fontFamily: "'Playfair Display', serif", fontSize: '20px', fontWeight: 900, color: '#fff', marginBottom: '16px' }}>{cancelTarget.type === 'reject' ? 'Decline this invitation?' : 'Cancel this booking?'}</div>
            <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: '10px', padding: '14px 16px', marginBottom: '20px' }}>
              <div style={{ fontSize: '14px', fontWeight: 600, color: '#fff', marginBottom: '4px' }}>{cancelTarget.courseName}</div>
              <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.45)' }}>{cancelTarget.date} · {cancelTarget.time}</div>
            </div>
            <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.5)', lineHeight: 1.6, marginBottom: '24px' }}>
              {cancelTarget.type === 'reject' ? 'The invitation will be cancelled.' : cancelTarget.isLate ? `This lesson starts within 24 hours. Cancelling now converts your credit into 1 token — valid 60 days, same-day/next-day bookings only, and final once booked. You have ${cancelQuota?.remaining ?? 0} late-cancellation conversion${(cancelQuota?.remaining ?? 0) === 1 ? '' : 's'} remaining.` : 'This lesson will be cancelled and your credit will be returned to your account.'}
            </p>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={() => setCancelTarget(null)} style={{ flex: 1, padding: '12px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.15)', background: 'transparent', color: 'rgba(255,255,255,0.6)', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
                {cancelTarget.type === 'reject' ? 'Keep Invitation' : 'Keep Lesson'}
              </button>
              <button onClick={async () => { if (cancelTarget.type === 'reject') { await rejectPartnerBooking(cancelTarget.id) } else { await cancelBooking(cancelTarget.id) } setCancelTarget(null) }} style={{ flex: 1, padding: '12px', borderRadius: '10px', border: 'none', background: '#e05a4a', color: '#fff', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}>
                {cancelTarget.type === 'reject' ? 'Yes, Decline' : 'Yes, Cancel'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reschedule Confirm Modal */}
      {rescheduleTarget && (
        <div onClick={() => setRescheduleTarget(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#1a2744', borderRadius: '20px', border: '1px solid rgba(255,255,255,0.12)', padding: '32px', maxWidth: '380px', width: '100%' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase', color: '#c9a84c', marginBottom: '8px' }}>Reschedule Lesson</div>
            <div style={{ fontFamily: "'Playfair Display', serif", fontSize: '20px', fontWeight: 900, color: '#fff', marginBottom: '16px' }}>Change this booking?</div>
            <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: '10px', padding: '14px 16px', marginBottom: '20px' }}>
              <div style={{ fontSize: '14px', fontWeight: 600, color: '#fff', marginBottom: '4px' }}>{rescheduleTarget.courseName}</div>
              <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.45)' }}>{rescheduleTarget.date} · {rescheduleTarget.time}</div>
            </div>
            <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.5)', lineHeight: 1.6, marginBottom: '24px' }}>
              You'll be taken to the booking page to pick a new time. Your current lesson will only be cancelled after you confirm the new booking.
            </p>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={() => setRescheduleTarget(null)} style={{ flex: 1, padding: '12px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.15)', background: 'transparent', color: 'rgba(255,255,255,0.6)', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
                Keep Lesson
              </button>
              <button onClick={confirmReschedule} style={{ flex: 1, padding: '12px', borderRadius: '10px', border: 'none', background: '#c9a84c', color: '#1a2744', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}>
                Yes, Reschedule
              </button>
            </div>
          </div>
        </div>
      )}

<div style={{ maxWidth: '1100px', margin: '0 auto', padding: 'clamp(24px,4vw,48px) clamp(20px,5vw,48px)' }}>

        {/* GREETING */}
        <div style={{ marginBottom: '36px' }}>
          <div style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '2px', textTransform: 'uppercase', color: GOLD, marginBottom: '6px' }}>
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </div>
          <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: 'clamp(22px,3vw,34px)', fontWeight: 900, color: '#fff', margin: 0 }}>
            {greeting}, <em style={{ color: GOLD, fontStyle: 'italic' }}>{parent?.first_name}!</em>
          </h1>
          <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.5)', marginTop: '6px' }}>Here's a summary of your swimmers.</p>
        </div>

        {/* QUICK LINKS */}
        <section>
          <h2 style={{ fontSize: '13px', fontWeight: 700, color: 'rgba(255,255,255,0.5)', margin: '0 0 16px', letterSpacing: '1.5px', textTransform: 'uppercase' }}>Quick Links</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '12px' }}>
            {QUICK_LINKS.map((link) => (
              <Link key={link.label} href={link.href} style={{ display: 'flex', alignItems: 'center', gap: '14px', background: NAVY, borderRadius: '14px', border: '1px solid rgba(255,255,255,0.08)', padding: '18px 20px', textDecoration: 'none' }}
                onMouseEnter={(e) => { const el = e.currentTarget as HTMLElement; el.style.borderColor = link.color + '60'; el.style.transform = 'translateY(-2px)' }}
                onMouseLeave={(e) => { const el = e.currentTarget as HTMLElement; el.style.borderColor = 'rgba(255,255,255,0.08)'; el.style.transform = 'translateY(0)' }}>
                <span style={{ width: '40px', height: '40px', borderRadius: '10px', background: `${link.color}18`, border: `1px solid ${link.color}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', flexShrink: 0 }}>{link.icon}</span>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: '#fff', marginBottom: '2px' }}>{link.label}</div>
                  <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)' }}>{link.desc}</div>
                </div>
              </Link>
            ))}
          </div>
        </section>

        {/* STUDENTS */}
        <section style={{ marginBottom: '36px' }}>
          <h2 style={{ fontSize: '13px', fontWeight: 700, color: 'rgba(255,255,255,0.5)', margin: '0 0 16px', letterSpacing: '1.5px', textTransform: 'uppercase' }}>My Swimmers</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
            {students.map((student) => {
              const hasLevel = student.current_level && Number(student.current_level) >= 1
              const levelColor = hasLevel ? (LEVEL_COLORS[Number(student.current_level)] || GOLD) : 'rgba(255,255,255,0.2)'
              const levelName = hasLevel ? LEVEL_NAMES[Number(student.current_level)] : null
              const age = student.date_of_birth ? getAge(student.date_of_birth) : null
              return (
                <div key={student.id} style={{ background: NAVY, borderRadius: '16px', border: '1px solid rgba(255,255,255,0.08)', padding: '24px', position: 'relative', overflow: 'hidden' }}>
                  <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '3px', background: levelColor }} />
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px' }}>
                    <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: levelColor, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Playfair Display', serif", fontSize: '18px', fontWeight: 900, color: '#fff', flexShrink: 0 }}>
                      {getInitials(student.full_name)}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '16px', fontWeight: 700, color: '#fff', marginBottom: '2px' }}>{student.full_name}</div>
                      <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)' }}>
                        {age !== null ? `Age ${age}` : 'Age unknown'}
                        {student.gender === 'male' ? ' · 👦' : student.gender === 'female' ? ' · 👧' : ''}
                      </div>
                    </div>
                  </div>
                  <div style={{ marginTop: '16px', background: hasLevel ? `${levelColor}18` : 'rgba(255,255,255,0.04)', border: `1px solid ${hasLevel ? levelColor + '35' : 'rgba(255,255,255,0.1)'}`, borderRadius: '10px', padding: '12px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                      <div style={{ fontSize: '10px', fontWeight: 600, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)', marginBottom: '2px' }}>Current Level</div>
                      {hasLevel ? (
                        <div style={{ fontSize: '14px', fontWeight: 700, color: '#fff' }}>Level {student.current_level} · {levelName}</div>
                      ) : (
                        <div style={{ fontSize: '14px', fontWeight: 700, color: 'rgba(255,255,255,0.4)' }}>Pending Assessment</div>
                      )}
                    </div>
                    {hasLevel ? (
                      <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: levelColor, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', fontWeight: 700, color: '#fff' }}>
                        {student.current_level}
                      </div>
                    ) : (
                      <div style={{ fontSize: '20px' }}>📋</div>
                    )}
                  </div>

                  {/* Learning progress section */}
                  {/* QR Code Button */}
                  <button
                    onClick={() => setQrStudent(student)}
                    style={{
                      marginTop: '12px', width: '100%', padding: '10px',
                      borderRadius: '10px', border: `1px solid ${GOLD}40`,
                      background: 'transparent', color: GOLD,
                      fontSize: '12px', fontWeight: 700, cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                      letterSpacing: '0.5px',
                    }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = `${GOLD}15` }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                  >
                    <span style={{ fontSize: '14px' }}>⊞</span> View Check-in QR Code
                  </button>

                  {studentProgressMap[student.id] && (() => {
                    const prog = studentProgressMap[student.id]
                    const isOpen = expandedProgress.has(student.id)
                    const page = progressPage[student.id] || 0
                    const PAGE_SIZE = 10
                    const totalPages = Math.ceil(prog.records.length / PAGE_SIZE)
                    const pageRecords = prog.records.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE)
                    return (
                      <div style={{ marginTop: '12px' }}>
                        <button
                          onClick={() => setExpandedProgress(prev => {
                            const next = new Set(prev)
                            if (next.has(student.id)) next.delete(student.id)
                            else next.add(student.id)
                            return next
                          })}
                          style={{
                            width: '100%', padding: '10px 14px',
                            borderRadius: '10px', border: '1px solid rgba(76,175,114,0.35)',
                            background: 'transparent', color: '#4caf72',
                            fontSize: '12px', fontWeight: 700, cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            letterSpacing: '0.5px',
                          }}
                        >
                          <span>📊 Skill Progress ({prog.records.length} records)</span>
                          <span style={{ fontSize: '10px' }}>{isOpen ? '▲' : '▼'}</span>
                        </button>
                        {isOpen && (
                          <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            {pageRecords.map(rec => {
                              const recKey = student.id + '_' + rec.session_date
                              const recOpen = expandedRecord[recKey]
                              return (
                                <div key={rec.session_date} style={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', overflow: 'hidden' }}>
                                  <button
                                    onClick={() => setExpandedRecord(prev => ({ ...prev, [recKey]: prev[recKey] ? null : rec.session_date }))}
                                    style={{ width: '100%', padding: '8px 12px', background: 'rgba(255,255,255,0.03)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                                  >
                                    <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.7)', fontWeight: 600 }}>{rec.session_date}</span>
                                    <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)' }}>{recOpen ? '▲' : '▼'}</span>
                                  </button>
                                  {recOpen && (
                                    <div style={{ padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                      {rec.skills.map(sk => (
                                        <div key={sk.skill_id}>
                                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
                                            <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.6)' }}>{sk.skill_name}</span>
                                            <span style={{ fontSize: '11px', fontWeight: 700, color: sk.progress_percent >= 100 ? '#4caf72' : sk.progress_percent > 0 ? GOLD : 'rgba(255,255,255,0.25)' }}>{sk.progress_percent}%</span>
                                          </div>
                                          <div style={{ height: '3px', background: 'rgba(255,255,255,0.08)', borderRadius: '2px' }}>
                                            <div style={{ height: '100%', width: sk.progress_percent + '%', background: sk.progress_percent >= 100 ? '#4caf72' : GOLD, borderRadius: '2px' }} />
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              )
                            })}
                            {totalPages > 1 && (
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', marginTop: '4px' }}>
                                <button onClick={() => setProgressPage(prev => ({ ...prev, [student.id]: Math.max(0, page - 1) }))} disabled={page === 0}
                                  style={{ padding: '4px 10px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.12)', background: 'transparent', color: page === 0 ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.6)', fontSize: '11px', cursor: page === 0 ? 'not-allowed' : 'pointer' }}>←</button>
                                {Array.from({ length: totalPages }, (_, i) => (
                                  <button key={i} onClick={() => setProgressPage(prev => ({ ...prev, [student.id]: i }))}
                                    style={{ width: '26px', height: '26px', borderRadius: '6px', border: `1px solid ${i === page ? GOLD : 'rgba(255,255,255,0.12)'}`, background: i === page ? `${GOLD}20` : 'transparent', color: i === page ? GOLD : 'rgba(255,255,255,0.4)', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}
                                  >{i + 1}</button>
                                ))}
                                <button onClick={() => setProgressPage(prev => ({ ...prev, [student.id]: Math.min(totalPages - 1, page + 1) }))} disabled={page === totalPages - 1}
                                  style={{ padding: '4px 10px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.12)', background: 'transparent', color: page === totalPages - 1 ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.6)', fontSize: '11px', cursor: page === totalPages - 1 ? 'not-allowed' : 'pointer' }}>→</button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })()}
                </div>
              )
            })}
          </div>
        </section>

        {/* Pending partner bookings notice */}
        {pendingPartnerBookings.length > 0 && (
          <section style={{ marginBottom: '28px' }}>
            <h2 style={{ fontSize: '13px', fontWeight: 700, color: 'rgba(255,255,255,0.5)', margin: '0 0 12px', letterSpacing: '1.5px', textTransform: 'uppercase' }}>⏳ Pending Invitations</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {pendingPartnerBookings.map((b: any) => {
                const cs = Array.isArray(b.class_sessions) ? b.class_sessions[0] : b.class_sessions
                const student = Array.isArray(b.students) ? b.students[0] : b.students
                const coach = cs ? (Array.isArray(cs.coaches) ? cs.coaches[0] : cs.coaches) : null
                const ct = cs ? (Array.isArray(cs.course_types) ? cs.course_types[0] : cs.course_types) : null
                const expiresAt = new Date(b.pending_expires_at)
                const hoursLeft = Math.max(0, Math.round((expiresAt.getTime() - Date.now()) / 3600000))
                const msLeft = Math.max(0, expiresAt.getTime() - now)
                const minsLeft = Math.floor(msLeft / 60000)
                const secsLeft = Math.floor((msLeft % 60000) / 1000)
                const countdownStr = msLeft <= 0 ? 'Expired' : `${minsLeft}:${String(secsLeft).padStart(2, '0')}`
                return (
                  <div key={b.id} style={{ background: 'rgba(123,97,196,0.1)', border: '1px solid rgba(123,97,196,0.35)', borderRadius: '14px', padding: '16px 20px' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
                      <div>
                        <div style={{ fontSize: '11px', color: '#a78bfa', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '4px' }}>🔔 Partner Booking Invitation</div>
                        <div style={{ fontSize: '14px', fontWeight: 700, color: '#fff', marginBottom: '2px' }}>
                          {student?.full_name} is invited to a lesson
                        </div>
                        <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)', marginBottom: '2px' }}>
                          {ct?.name} · {coach?.first_name} · {cs?.session_date ? formatDate(cs.session_date) : ''} {cs?.start_time ? formatTime(cs.start_time) : ''}
                        </div>
                        <div style={{ fontSize: '11px', color: minsLeft <= 3 ? '#f87171' : 'rgba(255,255,255,0.35)' }}>
                          ⏱ {countdownStr} left to confirm or the invitation auto-cancels
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                        <button
                          onClick={() => setCancelTarget({ id: b.id, courseName: ct?.name || 'Lesson', date: formatDate(cs?.session_date || ''), time: formatTime(cs?.start_time || ''), type: 'reject' })}
                          disabled={rejectingId === b.id || confirmingId === b.id}
                          style={{ padding: '8px 16px', background: 'rgba(248,113,113,0.15)', border: '1px solid rgba(248,113,113,0.4)', borderRadius: '8px', color: '#f87171', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>
                          {rejectingId === b.id ? '...' : 'Decline'}
                        </button>
                        <button
                          onClick={() => confirmPartnerBooking(b.id)}
                          disabled={confirmingId === b.id || rejectingId === b.id}
                          style={{ padding: '8px 16px', background: '#7b61c4', border: 'none', borderRadius: '8px', color: '#fff', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}>
                          {confirmingId === b.id ? 'Confirming...' : 'Confirm (uses 1 credit)'}
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
        )}

        {/* Reschedule Action Modal */}
      {rescheduleActionModal && (
        <div onClick={() => setRescheduleActionModal(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#1a2744', borderRadius: '20px', border: '1px solid rgba(255,255,255,0.12)', padding: '32px', maxWidth: '380px', width: '100%' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase', color: '#c9a84c', marginBottom: '8px' }}>RESCHEDULE</div>
            <div style={{ fontFamily: "'Playfair Display', serif", fontSize: '20px', fontWeight: 900, color: '#fff', marginBottom: '16px' }}>{rescheduleActionModal.title}</div>
            <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.5)', lineHeight: 1.6, marginBottom: '24px' }}>{rescheduleActionModal.message}</p>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={() => setRescheduleActionModal(null)} style={{ flex: 1, padding: '12px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.15)', background: 'transparent', color: 'rgba(255,255,255,0.6)', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
              <button onClick={async () => {
                const id = rescheduleActionModal.bookingId
                setRescheduleActionModal(null)
                const res = await fetch('/api/bookings/reject-reschedule', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ booking_id: id }) })
                if (res.ok) await fetchAll()
              }} style={{ flex: 1, padding: '12px', borderRadius: '10px', border: 'none', background: '#e05a4a', color: '#fff', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}>Confirm</button>
            </div>
          </div>
        </div>
      )}

      {/* UPCOMING LESSONS */}
        <section style={{ marginBottom: '36px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
            <h2 style={{ fontSize: '13px', fontWeight: 700, color: 'rgba(255,255,255,0.5)', margin: 0, letterSpacing: '1.5px', textTransform: 'uppercase' }}>Upcoming Lessons</h2>
            <button onClick={() => window.location.href = '/booking'} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 700, color: GOLD, textDecoration: 'none', border: `1px solid ${GOLD}40`, borderRadius: '8px', padding: '6px 14px', background: 'transparent', cursor: 'pointer' }}>
              + Book a Lesson
            </button>
          </div>
          {upcomingBookings.length === 0 ? (
            <div style={{ background: NAVY, borderRadius: '14px', border: '1px dashed rgba(255,255,255,0.12)', padding: '32px', textAlign: 'center' }}>
              <div style={{ fontSize: '28px', marginBottom: '10px' }}>📅</div>
              <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.4)', margin: '0 0 16px' }}>No upcoming lessons.</p>
              <button onClick={() => window.location.href = '/booking'} style={{ display: 'inline-block', padding: '10px 24px', background: GOLD, color: NAVY, borderRadius: '8px', fontSize: '12px', fontWeight: 700, border: 'none', cursor: 'pointer', letterSpacing: '1px', textTransform: 'uppercase' }}>Book Now</button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {(showAllUpcoming ? upcomingBookings : upcomingBookings.slice(0, 3)).map((booking) => {
                const daysUntil = getDaysUntil(booking.session_date)
                const isToday = daysUntil === 0
                const isTomorrow = daysUntil === 1
                const statusColor = (booking.pending_action === 'reschedule' || booking.pending_action === 'reschedule_initiator') ? GOLD : (STATUS_COLORS[booking.status] || GOLD)
                return (
                  <div key={booking.id} style={{ background: NAVY, borderRadius: '14px', border: `1px solid ${isToday ? GOLD + '40' : 'rgba(255,255,255,0.08)'}`, padding: '18px 20px', display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <div style={{ width: '52px', height: '52px', borderRadius: '12px', background: isToday ? GOLD : 'rgba(255,255,255,0.06)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <div style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: isToday ? NAVY : 'rgba(255,255,255,0.4)' }}>
                        {new Date(booking.session_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short' })}
                      </div>
                      <div style={{ fontSize: '20px', fontWeight: 900, color: isToday ? NAVY : '#fff', lineHeight: 1 }}>
                        {new Date(booking.session_date + 'T00:00:00').getDate()}
                      </div>
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                        <span style={{ fontSize: '14px', fontWeight: 700, color: '#fff' }}>{booking.is_trial ? 'Swim Assessment' : booking.course_name}</span>
                        {(() => { const bk = bandKey(booking.level_min, booking.level_max); return bk ? <span style={{ fontSize: '10px', fontWeight: 700, background: `${BAND_COLORS[bk]}22`, color: BAND_COLORS[bk], border: `1px solid ${BAND_COLORS[bk]}55`, borderRadius: '10px', padding: '2px 8px' }}>Level {booking.level_min}–{booking.level_max}</span> : null })()}
                        {isToday && <span style={{ fontSize: '10px', fontWeight: 700, background: GOLD, color: NAVY, borderRadius: '10px', padding: '2px 8px' }}>TODAY</span>}
                        {isTomorrow && <span style={{ fontSize: '10px', fontWeight: 700, background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.7)', borderRadius: '10px', padding: '2px 8px' }}>TOMORROW</span>}
                        {booking._group && <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px' }}>
                          {(() => {
                            if (booking.checked_in) return <span style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: '#86efac', background: 'rgba(134,239,172,0.12)', border: '1px solid rgba(134,239,172,0.3)', borderRadius: '20px', padding: '3px 10px' }}>&#10003; Checked In</span>
                            if (booking.session_date !== getTodayLA()) return null
                            const [sh, sm] = booking.start_time.split(':').map(Number)
                            const [eh, em] = booking.end_time.split(':').map(Number)
                            const nowMin = getNowMinutesLA()
                            if (nowMin >= sh * 60 + sm - 30 && nowMin < eh * 60 + em) return <span style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: GOLD, background: `${GOLD}18`, border: `1px solid ${GOLD}40`, borderRadius: '20px', padding: '3px 10px' }}>Check-in Open</span>
                            if (nowMin < sh * 60 + sm - 30) return <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.3)', whiteSpace: 'nowrap' }}>Check-in opens 30 min before class</span>
                            return null
                          })()}
                          <span style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: statusColor, background: `${statusColor}18`, border: `1px solid ${statusColor}30`, borderRadius: '20px', padding: '3px 10px' }}>{booking.status}</span>
                        </span>}
                      </div>
                      {(booking.pending_action === 'reschedule' || booking.pending_action === 'reschedule_initiator') && booking.new_coach_name ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '2px', flexWrap: 'wrap' }}>
                          <div style={{ fontSize: '13px', fontWeight: 700 }}>
                            <span style={{ color: 'rgba(255,255,255,0.35)', textDecoration: 'line-through' }}>Coach {booking.coach_name}</span>
                            {booking.student_name ? <span style={{ color: 'rgba(255,255,255,0.25)', textDecoration: 'line-through' }}> · ({booking.student_name})</span> : ''}
                          </div>
                          <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '14px' }}>→</span>
                          <div style={{ fontSize: '13px', fontWeight: 700 }}>
                            <span style={{ color: '#c9a84c' }}>Coach {booking.new_coach_name}</span>
                            {booking.student_name ? <span style={{ color: '#7dd3fc' }}> · ({booking.student_name})</span> : ''}
                          </div>
                        </div>
                      ) : booking._group ? (
                        <div style={{ marginBottom: '2px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          {booking._group.map((m, mi) => {
                            const late = isWithin24Hours(m.session_date, m.start_time) || daysUntil < 1
                            const lateOk = late && !!m.lesson_credit_id && !m.partner_booking_id && m.course_slug !== '1on2' && (cancelQuota?.remaining ?? 0) > 0
                            const cEnabled = (!late || lateOk) && cancellingId !== m.id && m.status !== 'pending_partner'
                            const rDis = reschedulingId === m.id || isWithin24Hours(m.session_date, m.start_time) || m.status === 'pending_partner'
                            return (
                              <div key={m.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap', paddingTop: mi > 0 ? '8px' : undefined, borderTop: mi > 0 && m.course_slug !== '1on2' ? '1px solid rgba(255,255,255,0.07)' : 'none' }}>
                                <div style={{ fontSize: '13px', fontWeight: 700 }}>
                                  <span style={{ color: '#c9a84c' }}>Coach {m.coach_name}</span>
                                  {m.student_name ? <span style={{ color: '#7dd3fc' }}> · ({m.student_name})</span> : ''}
                                </div>
                                {m.token_package_id ? (
                                  <div style={{ padding: '4px 10px', borderRadius: '8px', border: '1px solid rgba(232,136,58,0.4)', background: 'rgba(232,136,58,0.08)', color: '#e8883a', fontSize: '10px', fontWeight: 600 }}>🎫 Token · Final</div>
                                ) : (m.course_slug === '1on2' && mi > 0) ? null : (
                                  <div style={{ display: 'flex', gap: '6px' }}>
                                    <button
                                      onClick={() => m.lesson_credit_id && setRescheduleTarget({ id: m.id, creditId: m.lesson_credit_id, slug: m.course_slug || '', studentId: m.student_id || '', courseName: m.course_name, date: formatDate(m.session_date), time: formatTime(m.start_time), partnerBookingId: m.partner_booking_id })}
                                      disabled={rDis}
                                      style={{ padding: '4px 10px', borderRadius: '8px', border: rDis ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(201,168,76,0.4)', background: 'transparent', color: rDis ? 'rgba(255,255,255,0.2)' : '#c9a84c', fontSize: '10px', fontWeight: 600, cursor: rDis ? 'not-allowed' : 'pointer' }}>
                                      {reschedulingId === m.id ? '...' : 'Reschedule'}
                                    </button>
                                    {cEnabled ? (
                                      <button
                                        onClick={() => setCancelTarget({ id: m.id, courseName: m.course_name, date: formatDate(m.session_date), time: formatTime(m.start_time), isLate: late })}
                                        style={{ padding: '4px 10px', borderRadius: '8px', border: late ? '1px solid rgba(232,136,58,0.4)' : '1px solid rgba(224,90,74,0.3)', background: 'transparent', color: late ? '#e8883a' : '#e05a4a', fontSize: '10px', fontWeight: 600, cursor: 'pointer' }}>
                                        {cancellingId === m.id ? '...' : late ? 'Cancel → Token' : 'Cancel'}
                                      </button>
                                    ) : (
                                      <div style={{ padding: '4px 10px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.2)', fontSize: '10px', fontWeight: 600, cursor: 'not-allowed' }}>Cancel</div>
                                    )}
                                  </div>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      ) : (
                        <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '2px' }}>
                          <span style={{ color: '#c9a84c' }}>Coach {booking.coach_name}</span>
                          {booking.student_name ? <span style={{ color: '#7dd3fc' }}> · ({booking.student_name})</span> : ''}
                        </div>
                      )}
                      {(booking.pending_action === 'reschedule' || booking.pending_action === 'reschedule_initiator') && booking.new_start_time ? (
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                            <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.3)', textDecoration: 'line-through' }}>{formatTime(booking.start_time)} — {formatTime(booking.end_time)} · {formatDate(booking.session_date)}</span>
                            <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '14px' }}>→</span>
                            <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.7)' }}>{formatTime(booking.new_start_time)} — {formatTime(booking.new_end_time || '')} · {formatDate(booking.new_session_date || '')}</span>
                          </div>
                          {booking.pending_expires_at && (() => {
                            const ms = Math.max(0, new Date(booking.pending_expires_at).getTime() - now)
                            const mins = Math.floor(ms / 60000)
                            const secs = Math.floor((ms % 60000) / 1000)
                            const str = ms <= 0 ? 'Expired' : `${mins}:${String(secs).padStart(2, '0')}`
                            return <div style={{ fontSize: '11px', color: mins < 3 ? '#f87171' : '#c9a84c', marginTop: '2px' }}>⏱ Reschedule confirmation: {str} left</div>
                          })()}
                        </div>
                      ) : (
                        <div>
                          <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)' }}>{formatTime(booking.start_time)} — {formatTime(booking.end_time)} · {formatDate(booking.session_date)}</div>
                          {(booking.pending_action === 'reschedule' || booking.pending_action === 'reschedule_initiator') && booking.pending_expires_at && (() => {
                            const ms = Math.max(0, new Date(booking.pending_expires_at).getTime() - now)
                            const mins = Math.floor(ms / 60000)
                            const secs = Math.floor((ms % 60000) / 1000)
                            const str = ms <= 0 ? 'Expired' : `${mins}:${String(secs).padStart(2, '0')}`
                            return <div style={{ fontSize: '11px', color: mins < 3 ? '#f87171' : '#c9a84c', marginTop: '2px' }}>⏱ Reschedule confirmation: {str} left</div>
                          })()}
                        {booking.status === 'pending_partner' && booking.pending_expires_at && (() => {
                            const ms = Math.max(0, new Date(booking.pending_expires_at).getTime() - now)
                            const mins = Math.floor(ms / 60000)
                            const secs = Math.floor((ms % 60000) / 1000)
                            const str = ms <= 0 ? 'Expired' : `${mins}:${String(secs).padStart(2, '0')}`
                            return <div style={{ fontSize: '11px', color: mins < 3 ? '#f87171' : '#c9a84c', marginTop: '2px' }}>⏱ {str} left to confirm or booking auto-cancels</div>
                          })()}
                        </div>
                      )}
                    </div>
                    <div style={{ display: booking._group ? 'none' : 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px', flexShrink: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {(() => {
                        if (booking.checked_in) return <span style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: '#86efac', background: 'rgba(134,239,172,0.12)', border: '1px solid rgba(134,239,172,0.3)', borderRadius: '20px', padding: '3px 10px' }}>&#10003; Checked In</span>
                        if (booking.session_date !== getTodayLA()) return null
                        const [sh, sm] = booking.start_time.split(':').map(Number)
                        const [eh, em] = booking.end_time.split(':').map(Number)
                        const nowMin = getNowMinutesLA()
                        if (nowMin >= sh * 60 + sm - 30 && nowMin < eh * 60 + em) {
                          return <span style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: GOLD, background: `${GOLD}18`, border: `1px solid ${GOLD}40`, borderRadius: '20px', padding: '3px 10px' }}>Check-in Open</span>
                        }
                        return null
                      })()}
                      {!booking._group && <span style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: statusColor, background: `${statusColor}18`, border: `1px solid ${statusColor}30`, borderRadius: '20px', padding: '3px 10px' }}>
                        {(booking.pending_action === 'reschedule' || booking.pending_action === 'reschedule_initiator') ? 'PENDING RESCHEDULE' : booking.status}
                      </span>}
                      </div>
                      {(booking.pending_action === 'reschedule' || booking.pending_action === 'reschedule_initiator') ? (
                        <div style={{ display: 'flex', gap: '8px' }}>
                          {booking.pending_action === 'reschedule' && <>
                          <button
                            onClick={async () => {
                              setReschedulingId(booking.id)
                              const res = await fetch('/api/bookings/confirm-reschedule', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ booking_id: booking.id }) })
                              const json = await res.json()
                              if (!res.ok) alert(json.error || 'Reschedule failed')
                              await fetchAll()
                              setReschedulingId(null)
                            }}
                            style={{ padding: '6px 12px', borderRadius: '8px', border: '1px solid rgba(134,239,172,0.4)', background: 'transparent', color: '#86efac', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}>
                            Accept Reschedule
                          </button>
                          <button
                            onClick={async () => {
                              setRescheduleActionModal({ bookingId: booking.id, type: 'reject', title: 'Decline this reschedule?', message: 'The lesson will keep its original time.' })
                            }}
                            style={{ padding: '6px 12px', borderRadius: '8px', border: '1px solid rgba(224,90,74,0.3)', background: 'transparent', color: '#e05a4a', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}>
                            Decline
                          </button>
                          </>}
                          {booking.pending_action === 'reschedule_initiator' && (
                            <button
                              onClick={async () => {
                                setRescheduleActionModal({ bookingId: booking.id, type: 'cancel', title: 'Cancel this reschedule request?', message: 'The lesson will keep its original time.' })
                              }}
                              style={{ padding: '6px 12px', borderRadius: '8px', border: '1px solid rgba(224,90,74,0.3)', background: 'transparent', color: '#e05a4a', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}>
                              Cancel Reschedule
                            </button>
                          )}
                        </div>
                      ) : booking.status === 'pending_payment' ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                            <div style={{ padding: '6px 12px', borderRadius: '8px', border: '1px solid rgba(201,168,76,0.3)', background: 'rgba(201,168,76,0.08)', color: '#c9a84c', fontSize: '11px', fontWeight: 600 }}>
                              ⏱ Awaiting payment
                            </div>
                            <button
                              onClick={async () => {
                                setPendingPayBusy(booking.id); setPendingPayMsg('')
                                try {
                                  const res = await fetch('/api/bookings/pending-payment', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'link', booking_id: booking.id }) })
                                  const j = await res.json().catch(() => ({}))
                                  if (res.ok && j.url) { window.location.href = j.url; return }
                                  setPendingPayMsg(j.error || 'Could not open the payment page.')
                                } catch { setPendingPayMsg('Network error. Please try again.') }
                                setPendingPayBusy(null)
                              }}
                              disabled={pendingPayBusy === booking.id}
                              style={{ padding: '6px 12px', borderRadius: '8px', border: '1px solid rgba(201,168,76,0.5)', background: '#c9a84c', color: '#1a2744', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}>
                              {pendingPayBusy === booking.id ? '...' : 'Pay Now →'}
                            </button>
                            <button
                              onClick={() => { setPendingPayMsg(''); setPendingCancelConfirm(booking.id) }}
                              disabled={pendingPayBusy === booking.id}
                              style={{ padding: '6px 12px', borderRadius: '8px', border: '1px solid rgba(224,90,74,0.4)', background: 'transparent', color: '#e05a4a', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}>
                              Cancel
                            </button>
                          </div>
                          {pendingPayMsg && <div style={{ fontSize: '11px', color: '#e05a4a' }}>{pendingPayMsg}</div>}
                          {pendingCancelConfirm === booking.id && (
                            <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
                              <div style={{ background: '#1a2744', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '16px', padding: '24px', maxWidth: '400px', width: '100%' }}>
                                <div style={{ fontSize: '16px', fontWeight: 700, color: '#fff', marginBottom: '8px' }}>Cancel this Swim Assessment?</div>
                                <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.6)', lineHeight: 1.6, marginBottom: '20px' }}>
                                  The payment link will be voided and the time slot released. You can book a new assessment right away. No charge will be made.
                                </div>
                                <div style={{ display: 'flex', gap: '10px' }}>
                                  <button
                                    onClick={() => setPendingCancelConfirm(null)}
                                    disabled={pendingPayBusy === booking.id}
                                    style={{ flex: 1, padding: '10px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.2)', background: 'transparent', color: 'rgba(255,255,255,0.7)', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
                                    Keep Booking
                                  </button>
                                  <button
                                    onClick={async () => {
                                      setPendingPayBusy(booking.id); setPendingPayMsg('')
                                      try {
                                        const res = await fetch('/api/bookings/pending-payment', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'cancel', booking_id: booking.id }) })
                                        const j = await res.json().catch(() => ({}))
                                        if (res.ok) { window.location.reload(); return }
                                        setPendingPayMsg(j.error || 'Could not cancel. Please try again.')
                                      } catch { setPendingPayMsg('Network error. Please try again.') }
                                      setPendingPayBusy(null); setPendingCancelConfirm(null)
                                    }}
                                    disabled={pendingPayBusy === booking.id}
                                    style={{ flex: 1, padding: '10px', borderRadius: '10px', border: 'none', background: '#e05a4a', color: '#fff', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}>
                                    {pendingPayBusy === booking.id ? 'Cancelling...' : 'Yes, Cancel ✕'}
                                  </button>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      ) : booking.status === 'in_cart' ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <div style={{ padding: '6px 12px', borderRadius: '8px', border: '1px solid rgba(201,168,76,0.3)', background: 'rgba(201,168,76,0.08)', color: '#c9a84c', fontSize: '11px', fontWeight: 600 }}>
                            🛒 In cart · releases automatically if not checked out
                          </div>
                          <Link href="/booking?cart=1" style={{ padding: '6px 12px', borderRadius: '8px', border: '1px solid rgba(201,168,76,0.4)', background: 'transparent', color: '#c9a84c', fontSize: '11px', fontWeight: 600, textDecoration: 'none' }}>
                            View Cart →
                          </Link>
                        </div>
                      ) : booking._group ? null : booking.token_package_id ? (
                        <div style={{ padding: '6px 12px', borderRadius: '8px', border: '1px solid rgba(232,136,58,0.4)', background: 'rgba(232,136,58,0.08)', color: '#e8883a', fontSize: '11px', fontWeight: 600 }}>
                          🎫 Booked with token · Final
                        </div>
                      ) : (
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button
                            onClick={() => booking.lesson_credit_id && setRescheduleTarget({ id: booking.id, creditId: booking.lesson_credit_id, slug: booking.course_slug || '', studentId: booking.student_id || '', courseName: booking.course_name, date: formatDate(booking.session_date), time: formatTime(booking.start_time), partnerBookingId: booking.partner_booking_id })}
                            disabled={reschedulingId === booking.id || isWithin24Hours(booking.session_date, booking.start_time) || booking.status === 'pending_partner'}
                            style={{ padding: '6px 12px', borderRadius: '8px', border: reschedulingId === booking.id || isWithin24Hours(booking.session_date, booking.start_time) || booking.status === 'pending_partner' ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(201,168,76,0.4)', background: 'transparent', color: reschedulingId === booking.id || isWithin24Hours(booking.session_date, booking.start_time) || booking.status === 'pending_partner' ? 'rgba(255,255,255,0.2)' : '#c9a84c', fontSize: '11px', fontWeight: 600, cursor: reschedulingId === booking.id || isWithin24Hours(booking.session_date, booking.start_time) || booking.status === 'pending_partner' ? 'not-allowed' : 'pointer' }}>
                            {reschedulingId === booking.id ? '...' : 'Reschedule'}
                          </button>
                          {(() => {
                            const late = isWithin24Hours(booking.session_date, booking.start_time) || daysUntil < 1
                            const lateOk = late && !!booking.lesson_credit_id && !booking.partner_booking_id && booking.course_slug !== '1on2' && (cancelQuota?.remaining ?? 0) > 0
                            const enabled = (!late || lateOk) && cancellingId !== booking.id && booking.status !== 'pending_partner'
                            return enabled ? (
                              <button
                                onClick={() => setCancelTarget({ id: booking.id, courseName: booking.course_name, date: formatDate(booking.session_date), time: formatTime(booking.start_time), isLate: late })}
                                style={{ padding: '6px 12px', borderRadius: '8px', border: late ? '1px solid rgba(232,136,58,0.4)' : '1px solid rgba(224,90,74,0.3)', background: 'transparent', color: late ? '#e8883a' : '#e05a4a', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}>
                                {cancellingId === booking.id ? '...' : late ? 'Cancel → Token' : 'Cancel'}
                              </button>
                            ) : (
                              <div style={{ padding: '6px 12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.08)', background: 'transparent', color: 'rgba(255,255,255,0.2)', fontSize: '11px', fontWeight: 600, cursor: 'not-allowed' }}>
                                Cancel
                              </div>
                            )
                          })()}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
          {upcomingBookings.length > 3 && (
            <button
              onClick={() => setShowAllUpcoming(v => !v)}
              style={{ marginTop: '10px', width: '100%', padding: '10px', background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px', color: 'rgba(255,255,255,0.4)', fontSize: '12px', fontWeight: 600, cursor: 'pointer', letterSpacing: '0.5px' }}
            >
              {showAllUpcoming ? '▲ Collapse' : `▼ Show all ${upcomingBookings.length} lessons`}
            </button>
          )}
        </section>

        {/* CREDITS */}
        <section style={{ marginBottom: '36px' }}>
          <h2 style={{ fontSize: '13px', fontWeight: 700, color: 'rgba(255,255,255,0.5)', margin: '0 0 16px', letterSpacing: '1.5px', textTransform: 'uppercase' }}>Lesson Credits</h2>
          {credits.length === 0 && tokenPacks.length === 0 && students.filter(s => s.trial_used_at).length === 0 ? (
            <div style={{ background: NAVY, borderRadius: '14px', border: '1px dashed rgba(255,255,255,0.12)', padding: '28px', textAlign: 'center' }}>
              <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.4)', margin: '0 0 14px' }}>No active lesson credits.</p>
              <Link href="/plans" style={{ display: 'inline-block', padding: '9px 20px', background: 'transparent', color: GOLD, border: `1px solid ${GOLD}`, borderRadius: '8px', fontSize: '12px', fontWeight: 700, textDecoration: 'none', letterSpacing: '1px', textTransform: 'uppercase' }}>Browse Plans</Link>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '12px', alignItems: 'start' }}>
              {(() => {
                // Group credits by course_type_id and sum them up
                const grouped: Record<string, { name: string; total: number; used: number; items: { credits: number; used: number; date: string | null; invoiceId?: string | null; expiresAt?: string | null }[] }> = {}
                credits.forEach(credit => {
                  const ct = Array.isArray(credit.course_types) ? credit.course_types[0] : credit.course_types
                  const pur = Array.isArray(credit.purchases) ? credit.purchases[0] : credit.purchases
                  const key = credit.is_trial ? '__assessment__' : credit.course_type_id
                  const itemDate = pur?.paid_at || pur?.created_at || credit.created_at || null
                  if (!grouped[key]) {
                    grouped[key] = { name: credit.is_trial ? 'Swim Assessment' : (ct?.name || 'Lesson Credits'), total: 0, used: 0, items: [] }
                  }
                  grouped[key].total += credit.total_credits
                  grouped[key].used += credit.used_credits
                  const inv = Array.isArray(credit.invoices) ? credit.invoices[0] : credit.invoices
                  grouped[key].items.push({ credits: credit.total_credits, used: credit.used_credits, date: itemDate, invoiceId: inv?.id || null, expiresAt: credit.expires_at || null })
                })
                return Object.entries(grouped).map(([key, g]) => {
                  const remaining = g.total - g.used
                  const pct = Math.round((remaining / g.total) * 100)
                  return (
                    <CreditCard key={key} g={g} remaining={remaining} pct={pct} note={key === '__assessment__' ? 'One-time assessment · not a lesson package' : undefined} bookHref={key === '__assessment__' && remaining > 0 ? `/booking?student=${credits.find(c => c.is_trial && c.used_credits < c.total_credits)?.student_id || ''}` : undefined} />
                  )
                })
              })()}
              <TokenCard tokens={tokenPacks} />
              <TeamCard memberships={teamMemberships} />
            </div>
          )}
        </section>

        {/* LESSON HISTORY */}
        {pastBookings.length > 0 && (
          <section style={{ marginBottom: '36px' }}>
            <h2 style={{ fontSize: '13px', fontWeight: 700, color: 'rgba(255,255,255,0.5)', margin: '0 0 16px', letterSpacing: '1.5px', textTransform: 'uppercase' }}>Lesson History</h2>
            {(() => {
              const displayed = showAllHistory
                ? pastBookings.slice(historyPage * 10, historyPage * 10 + 10)
                : pastBookings.slice(0, 3)
              const totalPages = Math.ceil(pastBookings.length / 10)
              return (
                <>
                  <div style={{ background: NAVY, borderRadius: '14px', border: '1px solid rgba(255,255,255,0.08)', overflow: 'hidden' }}>
                    {displayed.map((booking, i) => {
                      const isNoShow = booking.status === 'confirmed' && !booking.checked_in
                      const noShowColor = '#e05a4a'
                      const badgeColor = isNoShow ? noShowColor : (STATUS_COLORS[booking.status] || 'rgba(255,255,255,0.3)')
                      const badgeLabel = isNoShow ? 'Absent' : booking.status
                      return (
                      <div key={booking.id} style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '14px 20px', borderBottom: i < displayed.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.35)', flexShrink: 0 }}>{new Date(booking.session_date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}</div>
                          <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.35)', flexShrink: 0 }}>{formatTime(booking.start_time)} — {formatTime(booking.end_time)}</div>
                          <div style={{ fontSize: '13px', fontWeight: 600, color: 'rgba(255,255,255,0.7)', flexShrink: 0 }}>{booking.is_trial ? 'Swim Assessment' : booking.course_name}</div>
                          {booking.student_name && <div style={{ fontSize: '12px', color: '#7dd3fc', flexShrink: 0 }}>{booking.student_name}</div>}
                          <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.35)', flexShrink: 0 }}>with {booking.coach_name}</div>
                        </div>
                        <span style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: badgeColor, background: `${badgeColor}18`, borderRadius: '10px', padding: '2px 8px' }}>
                          {badgeLabel}
                        </span>
                      </div>
                      )
                    })}
                  </div>
                  {/* Expand/collapse button */}
                  {pastBookings.length > 3 && (
                    <button
                      onClick={() => { setShowAllHistory(v => !v); setHistoryPage(0) }}
                      style={{ marginTop: '10px', width: '100%', padding: '10px', background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px', color: 'rgba(255,255,255,0.4)', fontSize: '12px', fontWeight: 600, cursor: 'pointer', letterSpacing: '0.5px' }}
                    >
                      {showAllHistory ? '▲ Collapse' : `▼ Show all ${pastBookings.length} records`}
                    </button>
                  )}
                  {/* Pagination (shown when expanded) */}
                  {showAllHistory && totalPages > 1 && (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginTop: '12px' }}>
                      <button
                        onClick={() => setHistoryPage(p => Math.max(0, p - 1))}
                        disabled={historyPage === 0}
                        style={{ padding: '6px 14px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.12)', background: 'transparent', color: historyPage === 0 ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.6)', fontSize: '12px', cursor: historyPage === 0 ? 'not-allowed' : 'pointer' }}
                      >← Prev</button>
                      {Array.from({ length: totalPages }, (_, i) => (
                        <button key={i}
                          onClick={() => setHistoryPage(i)}
                          style={{ width: '32px', height: '32px', borderRadius: '8px', border: `1px solid ${i === historyPage ? GOLD : 'rgba(255,255,255,0.12)'}`, background: i === historyPage ? `${GOLD}20` : 'transparent', color: i === historyPage ? GOLD : 'rgba(255,255,255,0.4)', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}
                        >{i + 1}</button>
                      ))}
                      <button
                        onClick={() => setHistoryPage(p => Math.min(totalPages - 1, p + 1))}
                        disabled={historyPage === totalPages - 1}
                        style={{ padding: '6px 14px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.12)', background: 'transparent', color: historyPage === totalPages - 1 ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.6)', fontSize: '12px', cursor: historyPage === totalPages - 1 ? 'not-allowed' : 'pointer' }}
                      >Next →</button>
                    </div>
                  )}
                </>
              )
            })()}
          </section>
        )}

        {/* PARTNER ACCOUNTS */}


      </div>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,700;0,900;1,700&family=DM+Sans:wght@400;500;600;700&display=swap');`}</style>
      {parent && <ChatWidget parentId={parent.id} />}
    </div>
  )
}
