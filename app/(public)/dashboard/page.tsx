'use client'
import ChatWidget from '@/components/ChatWidget'

import { useEffect, useState, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import QRCode from 'qrcode'
import { getTodayLA, getNowMinutesLA } from '@/lib/date'
import { isWithin24Hours } from '@/lib/tokens'
import { BAND_COLORS, bandKey } from '@/lib/zone-colors'
import { useLocale, useT } from '@/lib/i18n/provider'
import { tDb } from '@/lib/i18n'
import { errorKey } from '@/lib/i18n/errors'
import NoticeModal from '@/components/NoticeModal'
import { LEVEL_COLORS, stageProgress, resolveStage, stageNameKey, type StageProgress } from '@/lib/levels'

/* The phone layout lives here rather than in inline styles, because an inline
   style beats a media query and these three sections have to be shaped
   differently on a phone than on a desktop. Anything that stays inline is a
   colour the component computes; anything that changes with width is a class. */
const MOBILE_CSS = `
.msa-ql { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 12px }
.msa-ql-item { display: flex; align-items: center; gap: 14px; border-radius: 14px; padding: 18px 20px; text-decoration: none }
.msa-ql-icon { width: 40px; height: 40px; border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 20px; flex-shrink: 0 }
.msa-ql-label { font-size: 13px; font-weight: 700; color: #fff; margin-bottom: 2px }
.msa-ql-desc { font-size: 11px; color: rgba(255,255,255,0.4) }

.msa-rail { display: grid; gap: 16px }
.msa-rail-students { grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)) }
.msa-rail-credits  { grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)) }
.msa-dots { display: none }

/* Two columns, two rows. The head spans both so the status pill reaches the
   corner; the name and the buttons then share the second row instead of the
   buttons taking a row of their own with empty space beside the name. */
.msa-lesson { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center;
              column-gap: 14px; row-gap: 4px; border-radius: 14px; padding: 14px 18px }
.msa-lesson-head { grid-column: 1 / -1 }
.msa-lesson-date { width: 52px; height: 52px; border-radius: 12px; display: flex; flex-direction: column;
                   align-items: center; justify-content: center; flex-shrink: 0 }
.msa-lesson-actions { display: flex; flex-wrap: wrap; gap: 6px }
.msa-lesson-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap }
.msa-lesson-side { flex-direction: row; justify-content: flex-end; align-items: center; gap: 8px }
.msa-lesson-status { display: flex; align-items: center; gap: 8px }
.msa-lesson-status-inline { margin-left: auto; display: flex; align-items: center; gap: 8px }
/* A lesson card answers "whose lesson is this?" first. The swimmer's name is
   the largest thing on it, in the same colour that swimmer has in the calendar;
   what kind of lesson, when and with whom is one quiet line above it. */
.msa-lesson-head { display: flex; align-items: flex-start; gap: 10px }
.msa-lesson-meta { font-size: 12.5px; line-height: 1.55; color: rgba(255,255,255,0.45); min-width: 0 }
.msa-lesson-meta b { font-weight: 700; color: rgba(255,255,255,0.82) }
/* Its own margin sat on top of the card's 10px gap, so the name floated with
   about 20px under it. The leading is tightened instead of the space removed --
   the line above and the buttons below still get room. */
.msa-lesson-name { font-size: 17px; font-weight: 800; letter-spacing: -0.2px; line-height: 1.2; margin: 0 }
.msa-lesson-pill { flex-shrink: 0; margin-left: auto }
.msa-day-head { display: flex; align-items: center; gap: 8px; margin: 14px 2px 0 }
.msa-day-head:first-child { margin-top: 0 }
/* Stated once in the heading above, so the card does not repeat it: not as a
   chip on its left, not as a today/tomorrow badge, not trailing its time. */
.msa-lesson-date { display: none }
.msa-lesson-daybadge { display: none }
.msa-lesson-datesuffix { display: none }

/* A purchase line carries two dates, how many are left and the receipt. They sit
   on one row and wrap as two groups, so a narrow card never strands the button
   on a line of its own under a half-empty one. */
.msa-pkg { display: flex; align-items: baseline; justify-content: space-between;
           gap: 6px 8px; flex-wrap: wrap }
.msa-pkg-end { display: flex; align-items: center; gap: 6px; margin-left: auto }

@media (max-width: 640px) {
  /* Six full-width rows cost about 1140px of scrolling before the first
     swimmer. Three columns of icon-and-label cost about 200px. */
  .msa-ql { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px }
  .msa-ql-item { flex-direction: column; justify-content: center; gap: 8px; padding: 14px 6px; min-height: 88px; text-align: center }
  .msa-ql-icon { width: 36px; height: 36px; font-size: 18px }
  .msa-ql-label { font-size: 11px; margin-bottom: 0; line-height: 1.25 }
  .msa-ql-desc { display: none }

  /* One card at a time, with the next one's edge showing so it is obvious
     the row moves. The negative margin lets it run to the screen edge. */
  .msa-rail { display: flex; gap: 12px; overflow-x: auto; scroll-snap-type: x mandatory;
              padding: 2px clamp(20px,5vw,48px) 10px; margin: 0 calc(-1 * clamp(20px,5vw,48px));
              scrollbar-width: none }
  .msa-rail::-webkit-scrollbar { display: none }
  .msa-rail > * { scroll-snap-align: center; flex: 0 0 92% }
  .msa-dots { display: flex; justify-content: center; gap: 6px; margin-top: 10px }
  .msa-dot { width: 6px; height: 6px; border-radius: 50%; background: rgba(255,255,255,0.18); transition: width .18s, background .18s }
  .msa-dot-on { width: 18px; border-radius: 3px; background: #c9a84c }

  /* Four things fought for one 240px row: course name, level badge, day badge and
     status pill, with the coach line and two buttons under them. The date block
     lies down into a strip, the pills get their own line, and the buttons take
     half the width each -- which is also the size a thumb wants. */
  /* Back to one column: the buttons want the full width under a thumb. */
  .msa-lesson { grid-template-columns: minmax(0, 1fr); row-gap: 10px; padding: 14px 16px }
  .msa-lesson-actions { flex: 1 }
  .msa-lesson-actions > * { flex: 1 1 0; min-width: 0; text-align: center; white-space: nowrap }
  .msa-lesson-row { flex-direction: column; align-items: stretch; gap: 8px }
  /* A thumb wants the buttons full width, not tucked into a corner. */
  .msa-lesson-side { flex-direction: column; align-items: stretch }
  .msa-lesson-status { justify-content: flex-start }

  /* A day sheet belongs at the bottom of a phone, under the thumb. */
  .msa-sheet-wrap { align-items: flex-end !important; padding: 0 !important }
  .msa-sheet { max-width: none !important; border-radius: 20px 20px 0 0 !important }
}
`

const NAVY = '#1a2744'
const DARK = '#111d38'
const GOLD = '#c9a84c'


interface Parent { id: string; first_name: string; last_name: string; email: string }
interface Student { id: string; full_name: string; date_of_birth: string; current_level: number | null; current_stage: number | null; gender: string; trial_used_at: string | null }
interface SkillProgress {
  skill_id: string
  skill_name: string
  progress_percent: number
  sort_order: number
}
interface ProgressRecord {
  session_date: string
  lesson_key?: string
  start_time?: string
  course_name?: string
  course_type_id?: string
  minutes?: number
  note?: string
  skills: SkillProgress[]
}
interface StageSkill {
  stage: number
  skill_id: string
  skill_name: string
  percent: number
}
interface StudentProgress {
  student_id: string
  records: ProgressRecord[]
  // Where the swimmer stands right now, per stage of their current level.
  stages: StageProgress[]
  // Every skill of the current level, so a family can open a stage and read it.
  stageSkills: StageSkill[]
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
  course_types?: { id: string; name: string } | { id: string; name: string }[]
  purchases?: { paid_at: string | null; created_at: string } | { paid_at: string | null; created_at: string }[]
  invoice_id?: string | null
  invoices?: { id: string } | { id: string }[] | null
}
interface Booking {
  id: string; status: string
  session_date: string; start_time: string; end_time: string
  course_name: string; course_type_id?: string; coach_name: string; student_name?: string; _group?: Booking[]; lesson_group_id?: string | null; _hour?: boolean
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

function getAgeMonths(dob: string): number {
  const birth = new Date(dob)
  const today = new Date()
  let months = (today.getFullYear() - birth.getFullYear()) * 12 + (today.getMonth() - birth.getMonth())
  if (today.getDate() < birth.getDate()) months--
  return months < 0 ? 0 : months
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

// 08/27/2026. Purchase lines put two dates, a count and a button on one row, so
// they use the numeric form -- "Aug 27, 2026" is half as wide again and is
// English on a Chinese page.
function formatDateNum(d: string | Date): string {
  const date = typeof d === 'string' ? new Date(d) : d
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  return `${mm}/${dd}/${date.getFullYear()}`
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

/* A row of cards that becomes a swipeable rail on a phone. The dots are the
   only reason this needs state: they say how many cards there are and which
   one you are on, which a bare overflow-x row cannot. */
function Rail({ variant, count, children }: { variant: 'students' | 'credits'; count: number; children: React.ReactNode }) {
  const [active, setActive] = useState(0)
  return (
    <>
      <div className={`msa-rail msa-rail-${variant}`}
        onScroll={e => {
          const el = e.currentTarget
          const step = el.scrollWidth / Math.max(1, count)
          const next = Math.min(count - 1, Math.max(0, Math.round(el.scrollLeft / step)))
          setActive(prev => (prev === next ? prev : next))
        }}>
        {children}
      </div>
      {count > 1 && (
        <div className="msa-dots">
          {Array.from({ length: count }).map((_, i) => (
            <span key={i} className={`msa-dot${i === active ? ' msa-dot-on' : ''}`} />
          ))}
        </div>
      )}
    </>
  )
}

// A calendar cell is about 46px wide on a phone -- room for a time, not a name.
// Each swimmer gets a colour instead, keyed to the order they appear on the
// page, with a legend above the grid. One swimmer needs neither.
const SWIMMER_COLORS = ['#c9a84c', '#4a90c4', '#4caf72', '#7b5ea7', '#e8883a']

// QR payload: base64 encode of student_id so it's not raw UUID
function makeQRPayload(studentId: string): string {
  return `MSA:${btoa(studentId)}`
}

const QUICK_LINKS = [
  { labelKey: 'quick.account', icon: '👤', href: '/dashboard/account', color: '#4a90c4', descKey: 'quick.account.desc' },
  { labelKey: 'quick.book', icon: '📅', href: '/booking', color: GOLD, descKey: 'quick.book.desc' },
  { labelKey: 'page.levels', icon: '🏊', href: '/levels', color: '#4a90c4', descKey: 'quick.levels.desc' },
  { labelKey: 'page.plans', icon: '📦', href: '/plans', color: '#4caf72', descKey: 'quick.plans.desc' },
  { labelKey: 'page.policies', icon: '📋', href: '/policies', color: '#9c7a3c', descKey: 'quick.policies.desc' },
  { labelKey: 'quick.partnerships', icon: '🤝', href: '/dashboard/partnerships', color: '#7b5ea7', descKey: 'quick.partnerships.desc' },
]

const STATUS_COLORS: Record<string, string> = {
  confirmed: '#4caf72',
  cancelled: '#e05a4a',
  completed: '#a0a0a0',
  pending: GOLD,
}

// QR Modal Component
function QRModal({ student, onClose }: { student: Student; onClose: () => void }) {
  const t = useT()
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
          className="tap-auto"
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
              {t('common.loading')}
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
  const t = useT()
  const [expanded, setExpanded] = useState(false)
  return (
    <div style={{ background: '#1a2744', borderRadius: '14px', border: '1px solid rgba(255,255,255,0.08)', padding: '20px' }}>
      <div style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)', marginBottom: '8px' }}>
        {g.name}
      </div>
      <div style={{ fontFamily: "'Playfair Display', serif", fontSize: '36px', fontWeight: 900, color: '#c9a84c', lineHeight: 1 }}>{remaining}</div>
      <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', marginTop: '4px', marginBottom: note ? '2px' : '12px' }}>{t('credit.remaining', { total: g.total })}</div>
      {note && <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.3)', marginBottom: '12px' }}>{note}</div>}
      <div style={{ height: '4px', background: 'rgba(255,255,255,0.08)', borderRadius: '2px', marginBottom: '12px' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: '#c9a84c', borderRadius: '2px' }} />
      </div>
      {bookHref && (
        <Link href={bookHref} style={{ display: 'block', textAlign: 'center', padding: '9px 0', marginBottom: '12px', background: '#c9a84c', color: '#1a2744', borderRadius: '8px', fontSize: '12px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', textDecoration: 'none' }}>
          {t('dash.bookNow')}
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
        {t(`credit.${expanded ? 'hide' : 'show'}Package${g.items.length === 1 ? '' : 's'}`, { n: g.items.length })}
      </button>
      {expanded && (
        <div style={{ marginTop: '12px', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {g.items.map((item, i) => {
            const itemRemaining = item.credits - item.used
            const dateStr = item.date ? formatDateNum(item.date) : '—'
            const expStr = item.expiresAt ? formatDateNum(item.expiresAt) : null
            const isExpired = item.expiresAt ? new Date(item.expiresAt).getTime() < Date.now() : false
            return (
              // Dates, count and receipt on one row. On a phone the card is 86%
              // of the viewport, so the right-hand pair wraps as a unit rather
              // than the button landing alone under a half-empty line.
              <div key={i} className="msa-pkg" style={{ paddingBottom: i < g.items.length - 1 ? '8px' : 0, marginBottom: i < g.items.length - 1 ? '8px' : 0, borderBottom: i < g.items.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
                <div style={{ fontSize: '11px', color: isExpired ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.4)', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{dateStr}{expStr && <span style={{ color: isExpired ? 'rgba(224,90,74,0.6)' : 'rgba(255,255,255,0.3)' }}> · {t('credit.expPrefix')} {expStr}</span>}</div>
                <div className="msa-pkg-end">
                  <span style={{ fontSize: '12.5px', fontWeight: 600, color: isExpired ? 'rgba(255,255,255,0.25)' : itemRemaining > 0 ? '#c9a84c' : 'rgba(255,255,255,0.3)', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                    {t('credit.nLeft', { n: itemRemaining, total: item.credits })}
                  </span>
                  {item.invoiceId && (
                    <a href={`/api/invoices/${item.invoiceId}/pdf`} target="_blank" rel="noopener noreferrer" title={t('credit.downloadInvoiceFull')}
                      style={{ fontSize: '11px', fontWeight: 700, color: '#1a2744', background: '#c9a84c', padding: '3px 7px', borderRadius: 6, textDecoration: 'none', whiteSpace: 'nowrap' }}>
                      {t('credit.downloadInvoice')}
                    </a>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

interface TokenPack { id: string; course_type_id?: string; course_name: string; remaining: number; expires_at: string; source: string }

function TeamCard({ memberships }: { memberships: { id: string; student_name: string; tier_name: string; team_tier_id?: string; monthly_price_cents?: number; status: string; cancels_at?: string | null; expires_at?: string | null; is_prepaid?: boolean; weekly_slots?: { weekday: number; start_time: string; end_time: string; coach_name: string }[]; invoices?: { date: string; period_end: string | null; url: string | null }[] }[] }) {
  const locale = useLocale()
  const [portalLoading, setPortalLoading] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [schedOpen, setSchedOpen] = useState<Record<string, boolean>>({})
  const t = useT()
  if (memberships.length === 0) return null
  const RED = '#e05a4a'
  const DAYS3 = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const t12tc = (v: string) => { const [h, m] = String(v).slice(0, 5).split(':').map(Number); const ap = h >= 12 ? 'PM' : 'AM'; const h12 = h % 12 === 0 ? 12 : h % 12; return `${h12}:${String(m).padStart(2, '0')} ${ap}` }
  const practiceLines = (slots: { weekday: number; start_time: string; end_time: string; coach_name: string }[]) => {
    const g: Record<string, { days: string[]; st: string; en: string; coach: string }> = {}
    for (const s of slots) {
      const k = s.start_time + '|' + s.end_time + '|' + s.coach_name
      ;(g[k] ||= { days: [], st: s.start_time, en: s.end_time, coach: s.coach_name }).days.push(DAYS3[s.weekday])
    }
    return Object.values(g).map(x => ({ days: x.days.length === 7 ? 'Every day' : x.days.join(', '), time: `${t12tc(x.st)} – ${t12tc(x.en)}`, coach: x.coach }))
  }
  const openPortal = async (id: string) => {
    setPortalLoading(id)
    try {
      const r = await fetch('/api/team/portal', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ membership_id: id }) })
      const j = await r.json()
      if (r.ok && j.url) { window.location.href = j.url; return }
      const k = errorKey(j.error)
      setNotice(k ? t(k) : (j.error || t('team.portalError')))
    } finally { setPortalLoading(null) }
  }
  return (
    <div style={{ background: '#1a2744', borderRadius: '14px', border: `1px solid ${RED}55`, padding: '20px' }}>
      <NoticeModal title={t('common.noticeTitle')} message={notice} closeLabel={t('common.close')} onClose={() => setNotice(null)} />
      <div style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '1.5px', textTransform: 'uppercase', color: RED, marginBottom: '8px' }}>{t('team.title')}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {memberships.map((m, mi) => (
          <div key={m.id} style={{ borderTop: mi > 0 ? '1px solid rgba(255,255,255,0.08)' : 'none', marginTop: mi > 0 ? '16px' : 0, paddingTop: mi > 0 ? '16px' : 0 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: '14px', fontWeight: 700, color: '#fff' }}>{m.student_name}</div>
              <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)' }}>{m.team_tier_id ? tDb(locale, 'team_tiers', m.team_tier_id, m.tier_name) : m.tier_name} · {m.is_prepaid ? t('team.prepaid') : m.monthly_price_cents ? t('dash.team.perMonth', { price: '$' + (m.monthly_price_cents / 100).toLocaleString() }) : ''}</div>
              <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)' }}>{t('team.unlimited')}</div>
              {(m.weekly_slots || []).length > 0 && (
                <div style={{ marginTop: '8px' }}>
                  <button onClick={() => setSchedOpen(prev => ({ ...prev, [m.id]: !prev[m.id] }))}
                    style={{ background: 'none', border: 'none', padding: 0, fontSize: '11px', color: 'rgba(255,255,255,0.35)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', letterSpacing: '0.5px' }}>
                    <span style={{ fontSize: '9px' }}>{schedOpen[m.id] ? '\u25b2' : '\u25bc'}</span>
                    {t(schedOpen[m.id] ? 'team.hideSchedule' : 'team.showSchedule')}
                  </button>
                  {schedOpen[m.id] && (
                    <div style={{ marginTop: '8px', borderLeft: `2px solid ${RED}55`, paddingLeft: '10px', display: 'flex', flexDirection: 'column', gap: '5px' }}>
                      {practiceLines(m.weekly_slots || []).map((ln, li) => (
                        <div key={li} style={{ fontSize: '11px', lineHeight: 1.5 }}>
                          <span style={{ color: '#fff', fontWeight: 600 }}>{ln.days}</span>
                          <span style={{ color: 'rgba(255,255,255,0.5)' }}> · {ln.time}{ln.coach ? ` · Coach ${ln.coach}` : ''}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0 }}>
            {m.is_prepaid ? (() => {
              const exp = m.expires_at ? new Date(m.expires_at) : null
              const expired = exp ? exp.getTime() < Date.now() : false
              const label = exp ? t(expired ? 'team.expired' : 'team.paidThru', { date: exp.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) }) : t('team.prepaid')
              const c = expired ? '#e05a4a' : '#86efac'
              const bg = expired ? 'rgba(224,90,74,0.12)' : 'rgba(134,239,172,0.12)'
              const bd = expired ? '1px solid rgba(224,90,74,0.3)' : '1px solid rgba(134,239,172,0.3)'
              return <span style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: c, background: bg, border: bd, borderRadius: '20px', padding: '3px 10px', whiteSpace: 'nowrap' }}>{label}</span>
            })() : m.cancels_at ? <span style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: '#e8883a', background: 'rgba(232,136,58,0.12)', border: '1px solid rgba(232,136,58,0.3)', borderRadius: '20px', padding: '3px 10px' }}>{t('team.cancels', { date: new Date(m.cancels_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) })}</span> : <span style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: m.status === 'active' ? '#86efac' : '#e8883a', background: m.status === 'active' ? 'rgba(134,239,172,0.12)' : 'rgba(232,136,58,0.12)', border: m.status === 'active' ? '1px solid rgba(134,239,172,0.3)' : '1px solid rgba(232,136,58,0.3)', borderRadius: '20px', padding: '3px 10px' }}>{m.status === 'active' ? t('team.active') : t('team.pastDue')}</span>}
            {!m.is_prepaid && (
            <button onClick={() => openPortal(m.id)} disabled={portalLoading === m.id}
              style={{ padding: '5px 12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.2)', background: 'transparent', color: 'rgba(255,255,255,0.7)', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}>
              {portalLoading === m.id ? '...' : t('team.manage')}
            </button>
            )}
            </div>
          </div>
          {(m.invoices || []).length > 0 && (
            <div style={{ marginTop: '10px' }}>
              <button onClick={() => setExpanded(prev => ({ ...prev, [m.id]: !prev[m.id] }))}
                style={{ background: 'none', border: 'none', padding: 0, fontSize: '11px', color: 'rgba(255,255,255,0.35)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', letterSpacing: '0.5px' }}>
                <span style={{ fontSize: '9px' }}>{expanded[m.id] ? '\u25b2' : '\u25bc'}</span>
                {t(`team.${expanded[m.id] ? 'hide' : 'show'}Invoice${(m.invoices || []).length === 1 ? '' : 's'}`, { n: (m.invoices || []).length })}
              </button>
              {expanded[m.id] && (
                <div style={{ marginTop: '12px', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {(m.invoices || []).map((iv, i) => {
                    const dateStr = formatDateNum(iv.date)
                    const expStr = iv.period_end ? formatDateNum(iv.period_end) : null
                    return (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px 8px', flexWrap: 'wrap', paddingBottom: i < (m.invoices || []).length - 1 ? '8px' : 0, borderBottom: i < (m.invoices || []).length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
                        <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{dateStr}{expStr && <span style={{ color: 'rgba(255,255,255,0.3)' }}> · {t('credit.expPrefix')} {expStr}</span>}</div>
                        {iv.url && (
                          <a href={iv.url} target="_blank" rel="noopener noreferrer" title={t('credit.downloadInvoiceFull')}
                            style={{ fontSize: '11px', fontWeight: 700, color: '#1a2744', background: '#c9a84c', padding: '3px 7px', borderRadius: 6, textDecoration: 'none', whiteSpace: 'nowrap' }}>
                            {t('credit.downloadInvoice')}
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
  const t = useT()
  const locale = useLocale()
  if (tokens.length === 0) return null
  const totalTokens = tokens.reduce((s, tp) => s + tp.remaining, 0)
  const ORANGE = '#e8883a'
  return (
    <div style={{ background: '#1a2744', borderRadius: '14px', border: `1px solid ${ORANGE}55`, padding: '20px' }}>
      <div style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '1.5px', textTransform: 'uppercase', color: ORANGE, marginBottom: '8px' }}>
        {t('token.title')}
      </div>
      <div style={{ fontFamily: "'Playfair Display', serif", fontSize: '36px', fontWeight: 900, color: ORANGE, lineHeight: 1 }}>{totalTokens}</div>
      <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', marginTop: '4px', marginBottom: '10px' }}>{t('token.available')}</div>
      <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.3)', marginBottom: '12px' }}>{t('token.final')}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '12px' }}>
        {tokens.map(tp => {
          const daysLeft = Math.max(0, Math.ceil((new Date(tp.expires_at).getTime() - Date.now()) / 86400000))
          const urgent = daysLeft <= 7
          return (
            <div key={tp.id} style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, minWidth: 0 }}>
                <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{tp.course_type_id ? tDb(locale, 'course_types', tp.course_type_id, tp.course_name) : tp.course_name}</div>
                <span style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '0.5px', textTransform: 'uppercase', flexShrink: 0, borderRadius: '8px', padding: '1px 7px', color: tp.source === 'manual' ? '#c9a84c' : ORANGE, background: tp.source === 'manual' ? 'rgba(201,168,76,0.12)' : 'rgba(232,136,58,0.1)', border: tp.source === 'manual' ? '1px solid rgba(201,168,76,0.35)' : '1px solid rgba(232,136,58,0.3)' }}>{tp.source === 'manual' ? t('token.courtesy') : t('token.makeup')}</span>
              </div>
              <div style={{ fontSize: '11px', whiteSpace: 'nowrap', flexShrink: 0 }}>
                <span style={{ fontWeight: 600, color: ORANGE }}>{t(tp.remaining === 1 ? 'token.count' : 'token.countPlural', { n: tp.remaining })}</span>
                <span style={{ color: urgent ? '#e05a4a' : 'rgba(255,255,255,0.35)', fontWeight: urgent ? 700 : 400 }}> · {t(daysLeft === 1 ? 'token.dayLeft' : 'token.daysLeft', { n: daysLeft })}</span>
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
  const locale = useLocale()
  const t = useT()
  const [parent, setParent] = useState<Parent | null>(null)
  const [students, setStudents] = useState<Student[]>([])
  const [credits, setCredits] = useState<Credit[]>([])
  const [tokenPacks, setTokenPacks] = useState<TokenPack[]>([])
  const [teamMemberships, setTeamMemberships] = useState<any[]>([])
  const [cancelQuota, setCancelQuota] = useState<{ total: number; used: number; remaining: number } | null>(null)
  const [upcomingBookings, setUpcomingBookings] = useState<Booking[]>([])
  const [pastBookings, setPastBookings] = useState<Booking[]>([])
  const [lessonView, setLessonView] = useState<'list' | 'month'>('list')
  const [lessonDetail, setLessonDetail] = useState<Booking | null>(null)
  const [daySheet, setDaySheet] = useState<string | null>(null)
  const firstName = (n?: string) => (n || '').split(',')[0].trim().split(' ')[0]
  /* One colour per swimmer, keyed to the order they appear on the page, used by
     both the calendar cells and the lesson cards so the two agree. */
  const swimmerColor = (n?: string) => {
    const i = students.findIndex(st => firstName(st.full_name) === firstName(n))
    return i >= 0 ? SWIMMER_COLORS[i % SWIMMER_COLORS.length] : GOLD
  }
  const [lvMonth, setLvMonth] = useState(() => new Date().getMonth())
  const [lvYear, setLvYear] = useState(() => new Date().getFullYear())
  const [loading, setLoading] = useState(true)
  const [greeting, setGreeting] = useState('morning')
  const router = useRouter()

  async function loadTokens() {
    try {
      const [res, tmRes] = await Promise.all([
        fetch('/api/parent/tokens'),
        fetch('/api/parent/team-memberships'),
      ])
      if (res.ok) {
        const data = await res.json()
        setTokenPacks(data.tokens || [])
        setCancelQuota(data.quota || null)
      }
      if (tmRes.ok) { const tmData = await tmRes.json(); setTeamMemberships(tmData.memberships || []) }
    } catch {}
  }
  /* Team practice is the same hour every week and the squad card below already
     states it. Drawing it into every cell of the month buried the thing the
     calendar is actually for -- the lessons a family booked and can still move.
     The API still expands practice days on request (?month=); nothing here asks
     for them. */
  const [cancellingId, setCancellingId] = useState<string | null>(null)
  const [reschedulingId, setReschedulingId] = useState<string | null>(null)
  const [rescheduleTarget, setRescheduleTarget] = useState<{ id: string; creditId: string; slug: string; studentId: string; courseName: string; courseTypeId?: string; date: string; time: string; partnerBookingId?: string; groupId?: string | null } | null>(null)
  const [rescheduleActionModal, setRescheduleActionModal] = useState<{ bookingId: string; type: 'reject' | 'cancel'; title: string; message: string } | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [cancelTarget, setCancelTarget] = useState<{ id: string; courseName: string; courseTypeId?: string; date: string; time: string; type?: 'cancel' | 'reject'; isLate?: boolean } | null>(null)
  const [infoModal, setInfoModal] = useState<{ title: string; message: string; actionLabel?: string; onAction?: () => void } | null>(null)
  const [qrStudent, setQrStudent] = useState<Student | null>(null)
  const [studentProgressMap, setStudentProgressMap] = useState<Record<string, StudentProgress>>({})
  // Which stage a family has opened on a student's card, keyed by student id.
  const [openStageMap, setOpenStageMap] = useState<Record<string, number>>({})
  const [expandedProgress, setExpandedProgress] = useState<Set<string>>(new Set())
  const [progressPage, setProgressPage] = useState<Record<string, number>>({})
  const [expandedRecord, setExpandedRecord] = useState<Record<string, string | null>>({})
  // An hour invitation arrives as two rows (one per half). Show ONE card
  // spanning both, priced at the number of rows this family actually owes.
  // Confirming from it sends the first row's id; the server resolves the group.
  const mergePendingInvites = (rows: any[]): any[] => {
    const sessOf = (x: any) => Array.isArray(x.class_sessions) ? x.class_sessions[0] : x.class_sessions
    const groups = new Map<string, any[]>()
    for (const b of rows) {
      const key = b.lesson_group_id || `single:${b.id}`
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key)!.push(b)
    }
    return Array.from(groups.values()).map(g => {
      const sorted = [...g].sort((a, b) =>
        String(sessOf(a)?.start_time || '').localeCompare(String(sessOf(b)?.start_time || '')))
      return { ...sorted[0], _seats: g.length, _endTime: sessOf(sorted[sorted.length - 1])?.end_time || null }
    })
  }
  const [pendingPartnerBookings, setPendingPartnerBookings] = useState<any[]>([])
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const [rejectingId, setRejectingId] = useState<string | null>(null)
  const [now, setNow] = useState(Date.now())
  /* The list opens on the next two days that have lessons and grows two days at
     a time. Counting lessons instead of days used to cut a busy Thursday in half. */
  const UPCOMING_DAYS = 2
  const UPCOMING_STEP = 2
  const [dayWindow, setDayWindow] = useState(UPCOMING_DAYS)
  /* Collapsing three weeks of lessons pulls the ground out from under you --
     whatever you were reading is suddenly above the viewport. Go back to the top
     of the section, which is where the list you are left with starts.
     
     The scroll has to happen AFTER the list has shrunk, not in the click. Asked
     for in the same tick it ran first, then the page lost most of its height and
     the browser clamped the scroll position to the new bottom -- which on a
     phone, where the collapsed page is barely taller than the screen, dropped
     you at the footer. */
  const upcomingRef = useRef<HTMLElement | null>(null)
  const scrollUpcomingRef = useRef(false)
  const collapseUpcoming = () => {
    scrollUpcomingRef.current = true
    setDayWindow(UPCOMING_DAYS)
  }
  useEffect(() => {
    if (!scrollUpcomingRef.current) return
    scrollUpcomingRef.current = false
    const id = requestAnimationFrame(() => upcomingRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
    return () => cancelAnimationFrame(id)
  }, [dayWindow])
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
    if (hour < 12) setGreeting('morning')
    else if (hour < 17) setGreeting('afternoon')
    else setGreeting('evening')
  }, [])

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    loadTokens()
    const { data: { user } } = await supabase.auth.getUser()
    // Both of these used to be a bare `return`, which left loading at true and
    // the page on its spinner for ever. A coach or an admin who follows a link
    // here -- or anyone whose session has expired -- just watched it turn.
    if (!user) { router.replace('/login'); return }

    const { data: parentData } = await supabase
      .from('parents').select('*').eq('auth_user_id', user.id).single()
    if (!parentData) {
      const { data: admin } = await supabase
        .from('admins').select('id').eq('auth_user_id', user.id).maybeSingle()
      if (admin) { router.replace('/admin'); return }
      const { data: coach } = await supabase
        .from('coaches').select('id').eq('auth_user_id', user.id).maybeSingle()
      if (coach) { router.replace('/coach'); return }
      router.replace('/login')
      return
    }
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

    const [{ data: studs }, { data: credData }, { data: rawBookings }, { data: pendingRaw }] = await Promise.all([
      supabase.from('students').select('*').eq('parent_id', parentData.id).eq('is_active', true).order('sort_order'),
      supabase
        .from('lesson_credits')
        .select('id, total_credits, used_credits, course_type_id, student_id, created_at, expires_at, is_trial, course_types(id, name), purchases(paid_at, created_at), invoices(id)')
        .eq('parent_id', parentData.id)
        .gt('total_credits', 0)
        .is('converted_to_token_at', null),
      supabase.from('bookings')
        .select('id, status, student_id, lesson_credit_id, token_package_id, is_trial, class_session_id, partner_booking_id, pending_action, pending_new_session_id, pending_expires_at, lesson_group_id')
        .eq('parent_id', parentData.id)
        .neq('status', 'cancelled')
        .order('created_at', { ascending: true }),
      supabase.from('bookings')
        .select('id, student_id, pending_expires_at, partner_parent_id, class_session_id, lesson_group_id')
        .eq('parent_id', parentData.id)
        .eq('status', 'pending_partner')
        .eq('pending_action', 'confirm')
        .gt('pending_expires_at', nowIso),
    ])

    // Query class_sessions and students separately
    const sessionIds = [...new Set((rawBookings || []).map((b: any) => b.class_session_id).filter(Boolean))]
    const studentIds = [...new Set((rawBookings || []).map((b: any) => b.student_id).filter(Boolean))]

    const newSessionIds = [...new Set((rawBookings || [])
      .filter((b: any) => b.pending_new_session_id)
      .map((b: any) => b.pending_new_session_id)
      .filter(Boolean))]
    const pendingSessionIds = [...new Set((pendingRaw || []).map((b: any) => b.class_session_id).filter(Boolean))]
    const pendingStudentIds = [...new Set((pendingRaw || []).map((b: any) => b.student_id).filter(Boolean))]

    const [{ data: sessionsData }, { data: studentsData }, { data: newSessionsData }, { data: pSessions }, { data: pStudents }] = await Promise.all([
      sessionIds.length > 0
        ? supabase.from('class_sessions').select('id, session_date, start_time, end_time, level_min, level_max, course_types(id, name, slug), coaches(first_name)').in('id', sessionIds)
        : Promise.resolve({ data: [] }),
      studentIds.length > 0
        ? supabase.from('students').select('id, full_name').in('id', studentIds)
        : Promise.resolve({ data: [] }),
      newSessionIds.length > 0
        ? supabase.from('class_sessions').select('id, session_date, start_time, end_time, level_min, level_max, course_types(id, name, slug), coaches(first_name)').in('id', newSessionIds)
        : Promise.resolve({ data: [] }),
      pendingSessionIds.length > 0
        ? supabase.from('class_sessions').select('id, session_date, start_time, end_time, course_types(id, name), coaches(first_name)').in('id', pendingSessionIds)
        : Promise.resolve({ data: [] }),
      pendingStudentIds.length > 0
        ? supabase.from('students').select('id, full_name').in('id', pendingStudentIds)
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

    // Merge pending-reschedule target sessions (fetched in the Promise.all above)
    for (const s of newSessionsData || []) {
      const ct = Array.isArray((s as any).course_types) ? (s as any).course_types[0] : (s as any).course_types
      const coach = Array.isArray((s as any).coaches) ? (s as any).coaches[0] : (s as any).coaches
      sessionMap[(s as any).id] = { ...(s as any), ct, coach }
    }

    setStudents(studs || [])
    setCredits(credData || [])

    // pendingRaw / pSessions / pStudents fetched in the Promise.all batches above

    // Early-start independent fetches (awaited later where needed).
    // Promise.resolve() forces lazy supabase builders to fire immediately.
    const on2IdsEarly = (rawBookings || [])
      .filter((b: any) => b.status !== 'cancelled')
      .map((b: any) => b.class_session_id)
      .filter(Boolean)
    const partnerPromise: Promise<Response | null> = (on2IdsEarly.length > 0 && parentData?.id)
      ? fetch('/api/bookings/session-partners', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ session_ids: on2IdsEarly, parent_id: parentData.id }),
        }).catch(() => null)
      : Promise.resolve(null)
    const bookingIdsEarly = (rawBookings || []).map((b: any) => b.id)
    const attendancePromise: Promise<Response | null> = bookingIdsEarly.length > 0
      ? fetch('/api/parent/attendance?booking_ids=' + bookingIdsEarly.join(',')).catch(() => null)
      : Promise.resolve(null)
    const histStudentIdsEarly = (studs || []).map((s: any) => s.id)
    const histPromise: Promise<{ data: any[] | null }> = histStudentIdsEarly.length > 0
      ? Promise.resolve(supabase.from('progress_history')
          .select('student_id, session_date, snapshot, lesson_key, class_session_id')
          .in('student_id', histStudentIdsEarly)
          .eq('status', 'approved')
          .order('session_date', { ascending: false })) as any
      : Promise.resolve({ data: [] })
    const levelNumsEarly = [...new Set((studs || []).map((s: any) => s.current_level).filter(Boolean))]
    const levPromise: Promise<{ data: any[] | null }> = levelNumsEarly.length > 0
      ? Promise.resolve(supabase.from('levels').select('id, level_number').in('level_number', levelNumsEarly)) as any
      : Promise.resolve({ data: [] })
    /* The curriculum for these swimmers' levels depends on nothing the history
       reads produce, so it is chained straight onto the levels lookup and runs
       beside them instead of queueing behind. */
    const levelSkillsPromise: Promise<{ levelIdMap: Record<string, string>; skRows: any[] | null }> =
      levPromise.then(async ({ data: levRows }) => {
        const levelIdMap: Record<string, string> = {}
        for (const l of levRows || []) levelIdMap[String((l as any).level_number)] = (l as any).id
        const ids = Object.values(levelIdMap)
        if (ids.length === 0) return { levelIdMap, skRows: null }
        const { data: skRows } = await supabase
          .from('skills').select('id, name, sort_order, level_id, stage')
          .in('level_id', ids).order('sort_order')
        return { levelIdMap, skRows: skRows as any[] | null }
      })
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

    // Fetch partner student names for 1-on-2 sessions (early-started above)
    try {
      const partnerRes = await partnerPromise
      if (partnerRes && partnerRes.ok) {
        const { partners } = await partnerRes.json()
        for (const b of rawBookings || []) {
          if (partners[b.class_session_id]) {
            (b as any)._partner_student_name = partners[b.class_session_id]
          }
        }
      }
    } catch {}

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
          course_type_id: cs?.ct?.id,
          level_min: cs?.level_min ?? null, level_max: cs?.level_max ?? null,
          coach_name: cs?.coach?.first_name,
          student_name: studentMap[b.student_id]?.full_name ? ((cs?.ct?.slug === '1on2' && b._partner_student_name) ? studentMap[b.student_id].full_name + ', ' + b._partner_student_name : studentMap[b.student_id].full_name) : undefined,
          lesson_credit_id: b.lesson_credit_id,
          token_package_id: b.token_package_id,
          lesson_group_id: b.lesson_group_id,
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
    // Two linked halves are one 60-minute lesson to the family: show one card
    // spanning both, keeping the first half's id so actions hit the whole group.
    const mergeHours = (bookings: Booking[]): Booking[] => {
      const byGroup: Record<string, Booking[]> = {}
      const out: Booking[] = []
      for (const b of bookings) {
        if (!b.lesson_group_id) { out.push(b); continue }
        ;(byGroup[b.lesson_group_id] ||= []).push(b)
      }
      for (const halves of Object.values(byGroup)) {
        if (halves.length === 1) { out.push(halves[0]); continue }
        const sorted = [...halves].sort((a, b) => (a.start_time || '').localeCompare(b.start_time || ''))
        const first = sorted[0], last = sorted[sorted.length - 1]
        const coaches = [...new Set(sorted.map(h => h.coach_name).filter(Boolean))]
        out.push({ ...first, end_time: last.end_time, coach_name: coaches.join(' → '), _hour: true })
      }
      return out
    }

    const allUpcoming = mergeHours(mergeBySession(parseBookings(rawBookings || []).filter(b => !isLessonPast(b))))
    const allPast = mergeHours(parseBookings(rawBookings || []).filter(b => isLessonPast(b)))

    // Fetch attendance for ALL bookings (incl. today's) so Upcoming cards can show check-in status
    let checkedInSet = new Set<string>()
    {
      const res = await attendancePromise
      const json = res ? await res.json().catch(() => ({ checkedInBookingIds: [] })) : { checkedInBookingIds: [] }
      for (const id of (json.checkedInBookingIds || [])) {
        checkedInSet.add(id)
      }
    }

    setUpcomingBookings(allUpcoming.map(b => ({ ...b, checked_in: checkedInSet.has(b.id) })).sort((a, b) => a.session_date.localeCompare(b.session_date) || (a.start_time || '').localeCompare(b.start_time || '')))

    const allPastWithCheckin = allPast.map(b => ({ ...b, checked_in: checkedInSet.has(b.id) }))
    // No display cap: the history list already paginates at 10 per page, and the
    // Month view reads this same array — capping it made older months lose lessons.
    setPastBookings(allPastWithCheckin.sort((a, b) => b.session_date.localeCompare(a.session_date) || (b.start_time || '').localeCompare(a.start_time || '')))
    // Fetch each student's latest approved progress_history
    const studentIdList = (studs || []).map((s: any) => s.id)
    if (studentIdList.length > 0) {
      const { data: histRows } = await histPromise

      // Group all records by student
      const allByStudent: Record<string, { session_date: string; snapshot: Record<string, number>; lesson_key: string | null; class_session_id: string | null }[]> = {}
      for (const row of histRows || []) {
        const sid = (row as any).student_id
        if (!allByStudent[sid]) allByStudent[sid] = []
        allByStudent[sid].push({
          session_date: (row as any).session_date,
          snapshot: (row as any).snapshot || {},
          lesson_key: (row as any).lesson_key || null,
          class_session_id: (row as any).class_session_id || null,
        })
      }

      // What lesson each record belongs to, and what the coach said about it.
      // Keyed on lesson_key so an hour lesson is one entry and two lessons on the
      // same day stay apart - a date alone cannot tell them apart.
      const lessonInfo: Record<string, { start_time: string; course_name: string; course_type_id: string; minutes: number }> = {}
      const noteByKey: Record<string, string> = {}
      const histSessionIds = [...new Set((histRows || []).map((r: any) => r.class_session_id).filter(Boolean))]
      const histLessonKeys = [...new Set((histRows || []).map((r: any) => r.lesson_key).filter(Boolean))]
      /* These two reads share no data, and the translations only need the notes.
         Issued one after another they cost three round trips before the progress
         panel could render; issued together they cost two. */
      const [hSessionsRes, hNotesRes] = await Promise.all([
        histSessionIds.length > 0
          ? supabase.from('class_sessions').select('id, start_time, course_types(id, name)').in('id', histSessionIds)
          : Promise.resolve({ data: null }),
        histLessonKeys.length > 0
          ? supabase.from('lesson_notes').select('id, lesson_key, language, note').in('lesson_key', histLessonKeys).eq('status', 'approved')
          : Promise.resolve({ data: null }),
      ])
      {
        const hSessions = hSessionsRes.data as any[] | null
        for (const cs of hSessions || []) {
          const ct = Array.isArray((cs as any).course_types) ? (cs as any).course_types[0] : (cs as any).course_types
          lessonInfo[(cs as any).id] = {
            start_time: (cs as any).start_time || '',
            course_name: ct?.name || '',
            course_type_id: ct?.id || '',
            minutes: 30,
          }
        }
      }
      {
        const hNotes = hNotesRes.data as any[] | null
        for (const n of hNotes || []) noteByKey[(n as any).lesson_key] = (n as any).note || ''

        // A family reads notes in the language they chose. Only notes recorded
        // in another language have a translation stored, and a missing one just
        // leaves the original in place.
        const wantLang = (parentData as any).preferred_language || 'en'
        const foreignIds = (hNotes || []).filter((n: any) => n.language !== wantLang).map((n: any) => n.id)
        if (foreignIds.length > 0) {
          const { data: hTrans } = await supabase
            .from('lesson_note_translations')
            .select('lesson_note_id, text')
            .in('lesson_note_id', foreignIds)
            .eq('language', wantLang)
          const keyById: Record<string, string> = {}
          for (const n of hNotes || []) keyById[(n as any).id] = (n as any).lesson_key
          for (const t of hTrans || []) {
            const k = keyById[(t as any).lesson_note_id]
            if (k && (t as any).text) noteByKey[k] = (t as any).text
          }
        }
      }

      // Fetch skill names (including all skills used in snapshots)
      const allSkillIds = [...new Set((histRows || []).flatMap((r: any) => Object.keys(r.snapshot || {})))]
      let skillNameMap: Record<string, { name: string; sort_order: number; level_id: string }> = {}

      // Also fetch all skills for each student's current_level, fill missing with 0%
      const studentLevelMap: Record<string, string | null> = {}
      for (const s of studs || []) studentLevelMap[s.id] = s.current_level
      const allLevelNums = [...new Set(Object.values(studentLevelMap).filter(Boolean))]
      let levelSkillsMap: Record<string, { id: string; name: string; sort_order: number; stage: number }[]> = {}

      if (allLevelNums.length > 0) {
        const { levelIdMap, skRows } = await levelSkillsPromise
        const allLevelIds = Object.values(levelIdMap)
        if (allLevelIds.length > 0) {
          for (const sk of skRows || []) {
            skillNameMap[(sk as any).id] = { name: (sk as any).name, sort_order: (sk as any).sort_order, level_id: (sk as any).level_id }
            // Build levelId → skills map
            if (!levelSkillsMap[(sk as any).level_id]) levelSkillsMap[(sk as any).level_id] = []
            levelSkillsMap[(sk as any).level_id].push({ id: (sk as any).id, name: (sk as any).name, sort_order: (sk as any).sort_order, stage: Number((sk as any).stage) || 1 })
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
              const info = hist.class_session_id ? lessonInfo[hist.class_session_id] : null
              return {
                session_date: hist.session_date,
                lesson_key: hist.lesson_key || hist.class_session_id || hist.session_date,
                start_time: info?.start_time || '',
                course_name: info?.course_name || '',
                course_type_id: info?.course_type_id || '',
                // An hour is two sessions but one lesson; the record is stored
                // against the first half, so its own end time would read short.
                minutes: hist.lesson_key && hist.lesson_key !== hist.class_session_id ? 60 : 30,
                note: hist.lesson_key ? (noteByKey[hist.lesson_key] || '') : '',
                skills: skillsForRecord,
              }
            })
            // The live percentage for a skill is whatever the most recent
            // lesson that touched it recorded. Snapshots arrive newest first, so
            // the first value wins and older lessons only fill the gaps.
            const currentPct: Record<string, number> = {}
            for (const hist of hists) {
              for (const [skId, pct] of Object.entries(hist.snapshot || {})) {
                if (!(skId in currentPct)) currentPct[skId] = pct as number
              }
            }
            progressMap[sid] = {
              student_id: sid,
              records,
              stages: stageProgress(allLevelSkills, currentPct),
              stageSkills: allLevelSkills.map(sk => ({
                stage: Number(sk.stage) || 1,
                skill_id: sk.id,
                skill_name: sk.name,
                percent: Math.max(0, Math.min(100, currentPct[sk.id] ?? 0)),
              })),
            }
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
            lesson_key: hist.lesson_key || hist.class_session_id || hist.session_date,
            start_time: (hist.class_session_id ? lessonInfo[hist.class_session_id]?.start_time : '') || '',
            course_name: (hist.class_session_id ? lessonInfo[hist.class_session_id]?.course_name : '') || '',
            course_type_id: (hist.class_session_id ? lessonInfo[hist.class_session_id]?.course_type_id : '') || '',
            minutes: hist.lesson_key && hist.lesson_key !== hist.class_session_id ? 60 : 30,
            note: hist.lesson_key ? (noteByKey[hist.lesson_key] || '') : '',
            skills: Object.entries(hist.snapshot).map(([skill_id, pct]) => ({
              skill_id, skill_name: skillNameMap[skill_id]?.name || skill_id,
              progress_percent: pct as number, sort_order: skillNameMap[skill_id]?.sort_order || 999,
            })).sort((a, b) => a.sort_order - b.sort_order),
          }))
          progressMap[sid] = { student_id: sid, records, stages: [], stageSkills: [] }
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
    // A 60-minute lesson travels as a group: the booking page needs the group id
    // so the server can move both halves and ignore this lesson's own sessions.
    const groupParam = rescheduleTarget.groupId ? `&reschedule_group_id=${rescheduleTarget.groupId}` : ''
    window.location.href = `/booking?reschedule_booking_id=${rescheduleTarget.id}&reschedule_credit_id=${rescheduleTarget.creditId}&reschedule_slug=${rescheduleTarget.slug}&reschedule_student_id=${rescheduleTarget.studentId}${partnerParam}${groupParam}`
  }

  if (loading) return (
    <div style={{ minHeight: '100vh', background: DARK, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center' }}>
        <style>{`@keyframes msaPulse { 0%, 100% { opacity: 1; transform: scale(1) } 50% { opacity: .55; transform: scale(.94) } }`}</style>
        <img src="/logo.png" alt="Manta Shark Aquatics" width={72} height={72}
          style={{ display: 'block', margin: '0 auto 16px', borderRadius: '50%', objectFit: 'cover', animation: 'msaPulse 1.6s ease-in-out infinite' }} />
        <div style={{ fontSize: '14px', color: 'rgba(255,255,255,0.5)' }}>{t('common.loading')}</div>
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
            <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase', color: '#e05a4a', marginBottom: '8px' }}>{t(cancelTarget.type === 'reject' ? 'dash.cancelModal.eyebrowReject' : 'dash.cancelModal.eyebrowCancel')}</div>
            <div style={{ fontFamily: "'Playfair Display', serif", fontSize: '20px', fontWeight: 900, color: '#fff', marginBottom: '16px' }}>{t(cancelTarget.type === 'reject' ? 'dash.cancelModal.titleReject' : 'dash.cancelModal.titleCancel')}</div>
            <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: '10px', padding: '14px 16px', marginBottom: '20px' }}>
              <div style={{ fontSize: '14px', fontWeight: 600, color: '#fff', marginBottom: '4px' }}>{cancelTarget.courseTypeId ? tDb(locale, 'course_types', cancelTarget.courseTypeId, cancelTarget.courseName) : cancelTarget.courseName}</div>
              <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.45)' }}>{cancelTarget.date} · {cancelTarget.time}</div>
            </div>
            <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.5)', lineHeight: 1.6, marginBottom: '24px' }}>
              {cancelTarget.type === 'reject' ? t('dash.cancelModal.bodyReject') : cancelTarget.isLate ? t((cancelQuota?.remaining ?? 0) === 1 ? 'dash.cancelModal.bodyLateOne' : 'dash.cancelModal.bodyLate', { n: cancelQuota?.remaining ?? 0 }) : t('dash.cancelModal.bodyNormal')}
            </p>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={() => setCancelTarget(null)} style={{ flex: 1, padding: '12px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.15)', background: 'transparent', color: 'rgba(255,255,255,0.6)', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
                {t(cancelTarget.type === 'reject' ? 'dash.cancelModal.keepInvitation' : 'dash.cancelModal.keepLesson')}
              </button>
              <button onClick={async () => { if (cancelTarget.type === 'reject') { await rejectPartnerBooking(cancelTarget.id) } else { await cancelBooking(cancelTarget.id) } setCancelTarget(null) }} style={{ flex: 1, padding: '12px', borderRadius: '10px', border: 'none', background: '#e05a4a', color: '#fff', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}>
                {t(cancelTarget.type === 'reject' ? 'dash.cancelModal.yesDecline' : 'dash.cancelModal.yesCancel')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reschedule Confirm Modal */}
      {rescheduleTarget && (
        <div onClick={() => setRescheduleTarget(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#1a2744', borderRadius: '20px', border: '1px solid rgba(255,255,255,0.12)', padding: '32px', maxWidth: '380px', width: '100%' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase', color: '#c9a84c', marginBottom: '8px' }}>{t('dash.resModal.eyebrow')}</div>
            <div style={{ fontFamily: "'Playfair Display', serif", fontSize: '20px', fontWeight: 900, color: '#fff', marginBottom: '16px' }}>{t('dash.resModal.title')}</div>
            <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: '10px', padding: '14px 16px', marginBottom: '20px' }}>
              <div style={{ fontSize: '14px', fontWeight: 600, color: '#fff', marginBottom: '4px' }}>{rescheduleTarget.courseTypeId ? tDb(locale, 'course_types', rescheduleTarget.courseTypeId, rescheduleTarget.courseName) : rescheduleTarget.courseName}</div>
              <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.45)' }}>{rescheduleTarget.date} · {rescheduleTarget.time}</div>
            </div>
            <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.5)', lineHeight: 1.6, marginBottom: '24px' }}>
              {t('dash.resModal.body')}
            </p>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={() => setRescheduleTarget(null)} style={{ flex: 1, padding: '12px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.15)', background: 'transparent', color: 'rgba(255,255,255,0.6)', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
                {t('dash.cancelModal.keepLesson')}
              </button>
              <button onClick={confirmReschedule} style={{ flex: 1, padding: '12px', borderRadius: '10px', border: 'none', background: '#c9a84c', color: '#1a2744', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}>
                {t('dash.resModal.confirm')}
              </button>
            </div>
          </div>
        </div>
      )}

<div style={{ maxWidth: '1100px', margin: '0 auto', padding: 'clamp(24px,4vw,48px) clamp(20px,5vw,48px)' }}>

        {/* GREETING */}
        <div style={{ marginBottom: '36px' }}>
          <div style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '2px', textTransform: 'uppercase', color: GOLD, marginBottom: '6px' }}>
            {(() => { const d = new Date(); return t('date.header', { weekday: t('date.weekday.' + d.getDay()), month: t('date.month.' + (d.getMonth() + 1)), day: d.getDate() }) })()}
          </div>
          <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: 'clamp(22px,3vw,34px)', fontWeight: 900, color: '#fff', margin: 0 }}>
            {t('dash.greeting.' + greeting)}<em style={{ color: GOLD, fontStyle: 'italic' }}>{parent?.first_name}{t('dash.greeting.bang')}</em>
          </h1>
          <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.5)', marginTop: '6px' }}>{t('dash.summary')}</p>
        </div>

        {/* QUICK LINKS */}
        <section>
          <h2 style={{ fontSize: '13px', fontWeight: 700, color: 'rgba(255,255,255,0.5)', margin: '0 0 16px', letterSpacing: '1.5px', textTransform: 'uppercase' }}>{t('dash.quickLinks')}</h2>
          <div className="msa-ql">
            {QUICK_LINKS.map((link) => (
              <Link key={link.href} href={link.href} className="msa-ql-item" style={{ background: NAVY, border: '1px solid rgba(255,255,255,0.08)' }}
                onMouseEnter={(e) => { const el = e.currentTarget as HTMLElement; el.style.borderColor = link.color + '60'; el.style.transform = 'translateY(-2px)' }}
                onMouseLeave={(e) => { const el = e.currentTarget as HTMLElement; el.style.borderColor = 'rgba(255,255,255,0.08)'; el.style.transform = 'translateY(0)' }}>
                <span className="msa-ql-icon" style={{ background: `${link.color}18`, border: `1px solid ${link.color}30` }}>{link.icon}</span>
                <div style={{ minWidth: 0 }}>
                  <div className="msa-ql-label">{t(link.labelKey)}</div>
                  <div className="msa-ql-desc">{t(link.descKey)}</div>
                </div>
              </Link>
            ))}
          </div>
        </section>

        {/* STUDENTS */}
        <section style={{ marginBottom: '36px' }}>
          <h2 style={{ fontSize: '13px', fontWeight: 700, color: 'rgba(255,255,255,0.5)', margin: '28px 0 16px', letterSpacing: '1.5px', textTransform: 'uppercase' }}>{t('dash.mySwimmers')}</h2>
          <Rail variant="students" count={students.length}>
            {students.map((student) => {
              const hasLevel = student.current_level && Number(student.current_level) >= 1
              const levelColor = hasLevel ? (LEVEL_COLORS[String(student.current_level)] || GOLD) : 'rgba(255,255,255,0.2)'
              const levelName = hasLevel ? t(`level.${Number(student.current_level)}.name`) : null
              const age = student.date_of_birth ? getAge(student.date_of_birth) : null
              const ageMonths = student.date_of_birth && age === 0 ? getAgeMonths(student.date_of_birth) : null
              const ageLabel = age === null ? t('dash.ageUnknown') : age >= 1 ? t('dash.age', { n: age }) : ageMonths !== null && ageMonths >= 1 ? t(ageMonths === 1 ? 'dash.ageMonth' : 'dash.ageMonths', { n: ageMonths }) : t('dash.ageNewborn')
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
                        {ageLabel}
                        {student.gender === 'male' ? ' · 👦' : student.gender === 'female' ? ' · 👧' : ''}
                      </div>
                    </div>
                  </div>
                  {!hasLevel && (
                    <div style={{ marginTop: '16px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px', padding: '12px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div>
                        <div style={{ fontSize: '10px', fontWeight: 600, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)', marginBottom: '2px' }}>{t('dash.currentLevel')}</div>
                        <div style={{ fontSize: '14px', fontWeight: 700, color: 'rgba(255,255,255,0.4)' }}>{t('dash.pendingAssessment')}</div>
                      </div>
                      <div style={{ fontSize: '20px' }}>📋</div>
                    </div>
                  )}

                  {hasLevel && (() => {
                    const prog: StudentProgress = studentProgressMap[student.id] || { student_id: student.id, records: [], stages: [], stageSkills: [] }
                    const lvl = Number(student.current_level)
                    const stages: StageProgress[] = prog.stages.length === 3
                      ? prog.stages
                      : [1, 2, 3].map(n => ({ stage: n as 1 | 2 | 3, percent: 0, complete: false, skillCount: 0 }))
                    const curStage = resolveStage(student.current_stage, stages)
                    const curPct = stages[curStage - 1]?.percent ?? 0
                    const hasRecords = prog.records.length > 0
                    const isOpen = expandedProgress.has(student.id)
                    const page = progressPage[student.id] || 0
                    const PAGE_SIZE = 10
                    const totalPages = Math.ceil(prog.records.length / PAGE_SIZE)
                    const pageRecords = prog.records.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE)
                    return (
                      <div style={{ marginTop: '12px', borderRadius: '12px', border: `1px solid ${levelColor}40`, background: `${levelColor}14`, padding: '14px' }}>
                        {/* which level, and which stage of it */}
                        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '10px' }}>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: '10px', fontWeight: 600, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)', marginBottom: '3px' }}>{t('dash.currentLevel')}</div>
                            <div style={{ fontSize: '14px', fontWeight: 700, color: '#fff' }}>{t('level.badge', { n: student.current_level ?? '', name: levelName || '' })}</div>
                            <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.55)', marginTop: '2px' }}>
                              {t('dash.stageN', { n: curStage })} · {t(stageNameKey(lvl, curStage))}
                            </div>
                          </div>
                          <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: levelColor, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', fontWeight: 700, color: '#fff', flexShrink: 0 }}>
                            {student.current_level}
                          </div>
                        </div>

                        {/* Three stages, each one openable. A stage below the one
                            the swimmer is in has been passed by definition -- that
                            is the only way to leave it -- so it reads as finished
                            even before an admin has approved the lesson that did
                            it. */}
                        <div style={{ display: 'flex', gap: '6px', marginTop: '14px' }}>
                          {/* Three states, three different colours -- done is
                              green, here-now is solid gold, not-yet is grey.
                              Tinting one hue could not separate "passed" from
                              "current" at a glance, which is the one distinction
                              a parent actually looks for. */}
                          {stages.map(sp => {
                            const isNow = sp.stage === curStage
                            const passed = sp.stage < curStage || sp.complete
                            const isOpenStage = openStageMap[student.id] === sp.stage
                            const skin = isNow
                              ? { background: GOLD, border: `1px solid ${GOLD}`, color: '#152036', weight: 800 }
                              : passed
                                ? { background: 'rgba(76,175,114,0.16)', border: '1px solid #4caf72', color: '#7fd6a2', weight: 700 }
                                : { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.09)', color: 'rgba(255,255,255,0.3)', weight: 700 }
                            return (
                              <button key={sp.stage} className="tap-auto"
                                aria-expanded={isOpenStage}
                                onClick={() => setOpenStageMap(prev => ({ ...prev, [student.id]: isOpenStage ? 0 : sp.stage }))}
                                style={{
                                  flex: 1, textAlign: 'center', padding: '5px 2px', borderRadius: '7px',
                                  fontSize: '10px', fontWeight: skin.weight, letterSpacing: '0.3px', cursor: 'pointer',
                                  background: skin.background, border: skin.border, color: skin.color,
                                  boxShadow: isOpenStage ? '0 0 0 2px rgba(255,255,255,0.45)' : 'none',
                                  whiteSpace: 'nowrap',
                                }}>
                                {t('dash.stageN', { n: sp.stage })}{passed ? ' 🎊' : isNow ? ' ●' : ''}
                              </button>
                            )
                          })}
                        </div>

                        {/* the opened stage, skill by skill */}
                        {(() => {
                          const openStage = openStageMap[student.id]
                          if (!openStage) return null
                          const rows = prog.stageSkills.filter(k => k.stage === openStage)
                          if (rows.length === 0) return null
                          const stagePassed = openStage < curStage
                          return (
                            <div style={{ marginTop: '10px', padding: '10px 12px', borderRadius: '9px', background: 'rgba(0,0,0,0.22)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                              <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.8px', color: levelColor }}>
                                {t('dash.stageN', { n: openStage })} · {t(stageNameKey(lvl, openStage))}
                              </div>
                              {rows.map(k => {
                                // A passed stage is 100% by definition of how a
                                // swimmer leaves it; the approved history can lag.
                                const pct = stagePassed ? 100 : k.percent
                                return (
                                  <div key={k.skill_id}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', marginBottom: '3px' }}>
                                      <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.7)' }}>{tDb(locale, 'skills', k.skill_id, k.skill_name)}</span>
                                      <span style={{ fontSize: '11px', fontWeight: 700, flexShrink: 0, color: pct >= 100 ? '#4caf72' : pct > 0 ? GOLD : 'rgba(255,255,255,0.25)' }}>{pct}%</span>
                                    </div>
                                    <div style={{ height: '3px', background: 'rgba(255,255,255,0.08)', borderRadius: '2px' }}>
                                      <div style={{ height: '100%', width: pct + '%', background: pct >= 100 ? '#4caf72' : GOLD, borderRadius: '2px' }} />
                                    </div>
                                  </div>
                                )
                              })}
                            </div>
                          )
                        })()}

                        {/* how far through the current stage */}
                        <div style={{ marginTop: '12px' }}>
                          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '5px' }}>
                            <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.45)', letterSpacing: '0.5px' }}>{t('dash.stageCompletion')}</span>
                            <b style={{ fontSize: '13px', color: GOLD }}>{curPct}%</b>
                          </div>
                          <div style={{ height: '6px', background: 'rgba(255,255,255,0.1)', borderRadius: '3px', overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: curPct + '%', background: GOLD, borderRadius: '3px', transition: 'width .3s ease' }} />
                          </div>
                        </div>

                        {/* the lesson-by-lesson record still lives underneath */}
                        <button
                          className="tap-auto"
                          disabled={!hasRecords}
                          aria-expanded={isOpen}
                          onClick={() => { if (!hasRecords) return; setExpandedProgress(prev => {
                            const next = new Set(prev)
                            if (next.has(student.id)) next.delete(student.id)
                            else next.add(student.id)
                            return next
                          }) }}
                          style={{
                            width: '100%', marginTop: '12px', paddingTop: '10px', border: 'none', borderTop: '1px solid rgba(255,255,255,0.08)',
                            background: 'transparent', cursor: hasRecords ? 'pointer' : 'default',
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            fontSize: '11px', fontWeight: 700, color: hasRecords ? '#4caf72' : 'rgba(255,255,255,0.3)',
                          }}
                        >
                          <span>📋 {hasRecords ? t('dash.lessonRecords', { n: prog.records.length }) : t('dash.noRecordsYet')}</span>
                          {hasRecords && <span style={{ fontSize: '10px' }}>{isOpen ? '▲' : '▼'}</span>}
                        </button>
                        {isOpen && (
                          <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            {pageRecords.map(rec => {
                              const recKey = student.id + '_' + (rec.lesson_key || rec.session_date)
                              const recOpen = expandedRecord[recKey]
                              return (
                                <div key={recKey} style={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', overflow: 'hidden' }}>
                                  <button
                                    onClick={() => setExpandedRecord(prev => ({ ...prev, [recKey]: prev[recKey] ? null : rec.session_date }))}
                                    style={{ width: '100%', padding: '8px 12px', background: 'rgba(255,255,255,0.03)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                                  >
                                    <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.7)', fontWeight: 600 }}>
                                      {rec.session_date}
                                      {rec.start_time ? ` · ${formatTime(rec.start_time)}` : ''}
                                      {rec.minutes ? ` · ${rec.minutes} min` : ''}
                                      {rec.course_name ? ` · ${rec.course_type_id ? tDb(locale, 'course_types', rec.course_type_id, rec.course_name) : rec.course_name}` : ''}
                                    </span>
                                    <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)' }}>{recOpen ? '▲' : '▼'}</span>
                                  </button>
                                  {recOpen && (
                                    <div style={{ padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                      {rec.note && (
                                        <div style={{ background: `${GOLD}14`, border: `1px solid ${GOLD}40`, borderRadius: '6px', padding: '8px 10px', marginBottom: '4px' }}>
                                          <div style={{ fontSize: '10px', color: GOLD, fontWeight: 700, letterSpacing: '0.5px', marginBottom: '3px' }}>{t('dash.coachNote')}</div>
                                          <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.75)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{rec.note}</div>
                                        </div>
                                      )}
                                      {rec.skills.map(sk => (
                                        <div key={sk.skill_id}>
                                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
                                            <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.6)' }}>{sk.skill_id ? tDb(locale, 'skills', sk.skill_id, sk.skill_name) : sk.skill_name}</span>
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
                                  <button key={i} onClick={() => setProgressPage(prev => ({ ...prev, [student.id]: i }))} className="tap-auto"
                                    style={{ width: '32px', height: '32px', borderRadius: '6px', border: `1px solid ${i === page ? GOLD : 'rgba(255,255,255,0.12)'}`, background: i === page ? `${GOLD}20` : 'transparent', color: i === page ? GOLD : 'rgba(255,255,255,0.4)', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}
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
                    <span style={{ fontSize: '14px' }}>⊞</span> {t('dash.viewQr')}
                  </button>
                </div>
              )
            })}
          </Rail>
        </section>

        {/* Pending partner bookings notice */}
        {pendingPartnerBookings.length > 0 && (
          <section style={{ marginBottom: '28px' }}>
            <h2 style={{ fontSize: '13px', fontWeight: 700, color: 'rgba(255,255,255,0.5)', margin: '0 0 12px', letterSpacing: '1.5px', textTransform: 'uppercase' }}>⏳ {t('dash.invite.section')}</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {mergePendingInvites(pendingPartnerBookings).map((b: any) => {
                const cs = Array.isArray(b.class_sessions) ? b.class_sessions[0] : b.class_sessions
                const student = Array.isArray(b.students) ? b.students[0] : b.students
                const coach = cs ? (Array.isArray(cs.coaches) ? cs.coaches[0] : cs.coaches) : null
                const ct = cs ? (Array.isArray(cs.course_types) ? cs.course_types[0] : cs.course_types) : null
                const expiresAt = new Date(b.pending_expires_at)
                const hoursLeft = Math.max(0, Math.round((expiresAt.getTime() - Date.now()) / 3600000))
                const msLeft = Math.max(0, expiresAt.getTime() - now)
                const minsLeft = Math.floor(msLeft / 60000)
                const secsLeft = Math.floor((msLeft % 60000) / 1000)
                const countdownStr = msLeft <= 0 ? t('dash.invite.expired') : `${minsLeft}:${String(secsLeft).padStart(2, '0')}`
                return (
                  <div key={b.id} style={{ background: 'rgba(123,97,196,0.1)', border: '1px solid rgba(123,97,196,0.35)', borderRadius: '14px', padding: '16px 20px' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
                      <div>
                        <div style={{ fontSize: '11px', color: '#a78bfa', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '4px' }}>🔔 {t('dash.invite.badge')}</div>
                        <div style={{ fontSize: '14px', fontWeight: 700, color: '#fff', marginBottom: '2px' }}>
                          {t('dash.invite.line', { name: student?.full_name || '' })}
                        </div>
                        <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)', marginBottom: '2px' }}>
                          {ct?.id ? tDb(locale, 'course_types', ct.id, ct.name) : ct?.name} · {coach?.first_name} · {cs?.session_date ? formatDate(cs.session_date) : ''} {cs?.start_time ? formatTime(cs.start_time) : ''}{b._endTime ? ` – ${formatTime(b._endTime)}` : ''}
                        </div>
                        <div style={{ fontSize: '11px', color: minsLeft <= 3 ? '#f87171' : 'rgba(255,255,255,0.35)' }}>
                          ⏱ {t('dash.invite.countdown', { time: countdownStr })}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                        <button
                          onClick={() => setCancelTarget({ id: b.id, courseName: ct?.name || 'Lesson', date: formatDate(cs?.session_date || ''), time: formatTime(cs?.start_time || ''), type: 'reject' })}
                          disabled={rejectingId === b.id || confirmingId === b.id}
                          style={{ padding: '8px 16px', background: 'rgba(248,113,113,0.15)', border: '1px solid rgba(248,113,113,0.4)', borderRadius: '8px', color: '#f87171', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>
                          {rejectingId === b.id ? '...' : t('dash.invite.decline')}
                        </button>
                        <button
                          onClick={() => confirmPartnerBooking(b.id)}
                          disabled={confirmingId === b.id || rejectingId === b.id}
                          style={{ padding: '8px 16px', background: '#7b61c4', border: 'none', borderRadius: '8px', color: '#fff', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}>
                          {confirmingId === b.id ? t('dash.invite.confirming') : t(b._seats === 1 ? 'dash.invite.confirmOne' : 'dash.invite.confirm', { n: b._seats })}
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
      <NoticeModal title={t('common.noticeTitle')} message={notice} closeLabel={t('common.close')} onClose={() => setNotice(null)} />
      {rescheduleActionModal && (
        <div onClick={() => setRescheduleActionModal(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#1a2744', borderRadius: '20px', border: '1px solid rgba(255,255,255,0.12)', padding: '32px', maxWidth: '380px', width: '100%' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase', color: '#c9a84c', marginBottom: '8px' }}>{t('dash.resAction.eyebrow')}</div>
            <div style={{ fontFamily: "'Playfair Display', serif", fontSize: '20px', fontWeight: 900, color: '#fff', marginBottom: '16px' }}>{rescheduleActionModal.title}</div>
            <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.5)', lineHeight: 1.6, marginBottom: '24px' }}>{rescheduleActionModal.message}</p>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={() => setRescheduleActionModal(null)} style={{ flex: 1, padding: '12px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.15)', background: 'transparent', color: 'rgba(255,255,255,0.6)', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>{t('dash.up.cancel')}</button>
              <button onClick={async () => {
                const id = rescheduleActionModal.bookingId
                setRescheduleActionModal(null)
                const res = await fetch('/api/bookings/reject-reschedule', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ booking_id: id }) })
                if (res.ok) await fetchAll()
              }} style={{ flex: 1, padding: '12px', borderRadius: '10px', border: 'none', background: '#e05a4a', color: '#fff', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}>{t('dash.resAction.confirm')}</button>
            </div>
          </div>
        </div>
      )}

      {/* UPCOMING LESSONS */}
        <section ref={upcomingRef} style={{ marginBottom: '36px', scrollMarginTop: '80px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px', marginBottom: '16px' }}>
            <h2 style={{ fontSize: '13px', fontWeight: 700, color: 'rgba(255,255,255,0.5)', margin: 0, letterSpacing: '1.5px', textTransform: 'uppercase' }}>{t('dash.upcomingLessons')}</h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ display: 'inline-flex', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', overflow: 'hidden' }}>
                {(['list', 'month'] as const).map(v => (
                  <button key={v} onClick={() => setLessonView(v)}
                    style={{ padding: '6px 14px', fontSize: '12px', fontWeight: 700, border: 'none', cursor: 'pointer',
                      background: lessonView === v ? GOLD : 'transparent',
                      color: lessonView === v ? NAVY : 'rgba(255,255,255,0.5)' }}>
                    {v === 'list' ? t('dash.viewList') : t('dash.viewMonth')}</button>
                ))}
              </div>
              <button onClick={() => window.location.href = '/booking'} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 700, color: GOLD, textDecoration: 'none', border: `1px solid ${GOLD}40`, borderRadius: '8px', padding: '6px 14px', background: 'transparent', cursor: 'pointer' }}>
                + {t('quick.book')}
              </button>
            </div>
          </div>
          {lessonView === 'month' ? (() => {
            const todayDs = getTodayLA()
            const mm2 = String(lvMonth + 1).padStart(2, '0')
            const monthPrefix = `${lvYear}-${mm2}`
            const all = [...upcomingBookings, ...pastBookings].filter(b => b.session_date && b.session_date.startsWith(monthPrefix))
            const byDate: Record<string, Booking[]> = {}
            for (const b of all) (byDate[b.session_date] ||= []).push(b)
            for (const k of Object.keys(byDate)) byDate[k].sort((a, b) => (a.start_time || '').localeCompare(b.start_time || ''))
            const daysIn = new Date(lvYear, lvMonth + 1, 0).getDate()
            const firstDow = new Date(lvYear, lvMonth, 1).getDay()
            const t12 = (t?: string) => { if (!t) return ''; const [h, m] = String(t).slice(0, 5).split(':').map(Number); const ap = h >= 12 ? 'PM' : 'AM'; const h12 = h % 12 === 0 ? 12 : h % 12; return `${h12}:${String(m).padStart(2, '0')} ${ap}` }
            /* "10:55a" rather than "10:55 AM". The pool runs 6am to 9pm, so 6
               through 9 happen twice a day and the meridiem cannot just be
               dropped -- but one letter of it is enough, and three did not fit. */
            const t12c = (t?: string) => { if (!t) return ''; const [h, m] = String(t).slice(0, 5).split(':').map(Number); const h12 = h % 12 === 0 ? 12 : h % 12; return `${h12}:${String(m).padStart(2, '0')}${h >= 12 ? 'p' : 'a'}` }
            const MAX_PER_DAY = 3
            const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
            return (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                  <button onClick={() => { if (lvMonth === 0) { setLvMonth(11); setLvYear(lvYear - 1) } else setLvMonth(lvMonth - 1) }}
                    style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', padding: '6px 14px', fontSize: '13px', fontWeight: 600, color: 'rgba(255,255,255,0.7)', cursor: 'pointer' }}>‹ Prev</button>
                  <span style={{ fontSize: '14px', fontWeight: 700, color: '#fff' }}>{MONTH_NAMES[lvMonth]} {lvYear}</span>
                  <button onClick={() => { if (lvMonth === 11) { setLvMonth(0); setLvYear(lvYear + 1) } else setLvMonth(lvMonth + 1) }}
                    style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', padding: '6px 14px', fontSize: '13px', fontWeight: 600, color: 'rgba(255,255,255,0.7)', cursor: 'pointer' }}>Next ›</button>
                </div>
                {students.length > 1 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 14px', marginBottom: '10px' }}>
                    {students.map((st, i) => (
                      <span key={st.id} style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px', fontWeight: 700, color: SWIMMER_COLORS[i % SWIMMER_COLORS.length] }}>
                        <i style={{ width: '7px', height: '7px', borderRadius: '50%', display: 'block', background: SWIMMER_COLORS[i % SWIMMER_COLORS.length] }} />
                        {firstName(st.full_name)}
                      </span>
                    ))}
                  </div>
                )}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: '4px', marginBottom: '4px' }}>
                  {['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'].map(d => (
                    <div key={d} style={{ textAlign: 'center', fontSize: '10px', fontWeight: 700, letterSpacing: '1px', color: 'rgba(255,255,255,0.35)', padding: '4px 0' }}>{d}</div>
                  ))}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: '4px' }}>
                  {Array.from({ length: firstDow }).map((_, i) => <div key={`e-${i}`} />)}
                  {Array.from({ length: daysIn }).map((_, i) => {
                    const ds = `${monthPrefix}-${String(i + 1).padStart(2, '0')}`
                    const dayBookings = byDate[ds] || []
                    const isPast = ds < todayDs
                    const isTodayCell = ds === todayDs
                    return (
                      <div key={ds}
                        onClick={() => { if (dayBookings.length > 0) setDaySheet(ds) }}
                        role={dayBookings.length > 0 ? 'button' : undefined}
                        tabIndex={dayBookings.length > 0 ? 0 : undefined}
                        onKeyDown={e => { if (dayBookings.length > 0 && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); setDaySheet(ds) } }}
                        style={{ cursor: dayBookings.length > 0 ? 'pointer' : 'default', backgroundColor: NAVY, backgroundImage: isPast ? 'repeating-linear-gradient(135deg, rgba(255,255,255,0.05) 0px, rgba(255,255,255,0.05) 2px, transparent 2px, transparent 10px)' : 'none', border: `1px solid ${isTodayCell ? GOLD + '66' : 'rgba(255,255,255,0.08)'}`, borderRadius: '8px', padding: '5px 3px', minHeight: '76px', minWidth: 0 }}>
                        <div style={{ textAlign: 'center', fontSize: '12px', fontWeight: 700, marginBottom: '4px', color: isTodayCell ? GOLD : isPast ? 'rgba(255,255,255,0.25)' : dayBookings.length > 0 ? '#fff' : 'rgba(255,255,255,0.4)' }}>{i + 1}</div>
                        {/* Three at most. A busy Tuesday had six, which made one cell
                            three times the height of its neighbours and pushed the rest of
                            the month off the screen. The rest are one tap away. */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                          {dayBookings.slice(0, MAX_PER_DAY).map((b, j) => (
                            <button key={b.id + j} onClick={e => { e.stopPropagation(); setLessonDetail(b) }} style={{ padding: '3px 2px', borderRadius: '5px', cursor: 'pointer', width: '100%', minWidth: 0, textAlign: 'center',
                              border: `1px solid ${isPast ? 'rgba(255,255,255,0.1)' : GOLD + '55'}`,
                              background: isPast ? 'rgba(255,255,255,0.04)' : `${GOLD}14` }}>
                              <span style={{ display: 'block', fontSize: '9.5px', fontWeight: 800, letterSpacing: '-0.3px', whiteSpace: 'nowrap', color: isPast ? 'rgba(255,255,255,0.4)' : '#fff' }}>
                                {t12c(b.start_time)}{b.checked_in ? ' ✓' : ''}
                              </span>
                              {students.length > 1 && (
                                /* An initial is ambiguous the moment two swimmers share one --
                                   Kayden and Kylie are both K. The name goes on its own line and
                                   the browser trims it to whatever the column holds, which is
                                   four or five letters rather than a hard three. */
                                <span style={{ display: 'block', fontSize: '9px', fontWeight: 700, letterSpacing: '-0.2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', opacity: isPast ? 0.55 : 1, color: swimmerColor(b.student_name) }}>
                                  {firstName(b.student_name)}
                                </span>
                              )}
                            </button>
                          ))}
                          {dayBookings.length > MAX_PER_DAY && (
                            <button onClick={e => { e.stopPropagation(); setDaySheet(ds) }}
                              style={{ padding: '3px 2px', borderRadius: '5px', width: '100%', cursor: 'pointer', textAlign: 'center',
                                fontSize: '9.5px', fontWeight: 800, color: 'rgba(255,255,255,0.55)',
                                background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)' }}>
                              +{dayBookings.length - MAX_PER_DAY}
                            </button>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
                {/* One day, in full. A bottom sheet on a phone and a centred card on
                    a desktop -- same markup, the width decides. Tapping a line hands
                    over to the lesson detail that already exists. */}
                {daySheet && (() => {
                  const rows = byDate[daySheet] || []
                  const dateStr = new Date(daySheet + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
                  return (
                    <div className="msa-sheet-wrap" onClick={() => setDaySheet(null)}
                      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
                      <div className="msa-sheet" onClick={e => e.stopPropagation()}
                        style={{ background: DARK, border: '1px solid rgba(255,255,255,0.12)', borderRadius: '16px', padding: '18px 20px 24px', width: '100%', maxWidth: '420px', maxHeight: '78vh', overflowY: 'auto' }}>
                        <div style={{ width: '38px', height: '4px', borderRadius: '2px', background: 'rgba(255,255,255,0.18)', margin: '0 auto 14px' }} />
                        <div style={{ fontFamily: "'Playfair Display', serif", fontSize: '19px', fontWeight: 700, color: '#fff' }}>{dateStr}</div>
                        <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', marginBottom: '14px' }}>
                          {t(rows.length === 1 ? 'dash.day.oneLesson' : 'dash.day.nLessons', { n: rows.length })}
                        </div>
                        {rows.map((b, j) => (
                          <button key={b.id + j} onClick={() => { setDaySheet(null); setLessonDetail(b) }}
                            style={{ display: 'flex', alignItems: 'center', gap: '12px', width: '100%', textAlign: 'left', cursor: 'pointer',
                              padding: '11px 12px', borderRadius: '12px', marginBottom: '8px',
                              background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
                            <span style={{ fontSize: '13px', fontWeight: 800, whiteSpace: 'nowrap', minWidth: '66px', color: '#fff' }}>{t12(b.start_time)}</span>
                            <span style={{ minWidth: 0, flex: 1 }}>
                              <span style={{ display: 'block', fontSize: '12px', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: swimmerColor(b.student_name) }}>{b.student_name || '—'}</span>
                              <span style={{ display: 'block', fontSize: '11px', color: 'rgba(255,255,255,0.42)', marginTop: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {b.coach_name ? t('dash.up.coach', { name: b.coach_name }) : ''}{b.coach_name && b.course_name ? ' · ' : ''}{b.course_type_id ? tDb(locale, 'course_types', b.course_type_id, b.course_name) : b.course_name}
                              </span>
                            </span>
                            <span style={{ color: 'rgba(255,255,255,0.25)', fontSize: '15px', flexShrink: 0 }}>›</span>
                          </button>
                        ))}
                        <button onClick={() => setDaySheet(null)}
                          style={{ marginTop: '10px', width: '100%', padding: '12px', background: 'transparent', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '10px', color: 'rgba(255,255,255,0.6)', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}>{t('common.close')}</button>
                      </div>
                    </div>
                  )
                })()}
                {lessonDetail && (() => {
                  const b = lessonDetail
                  const past = !!(b.session_date && b.session_date < todayDs)
                  const dateStr = b.session_date ? new Date(b.session_date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) : ''
                  const statusLabel = past ? (b.checked_in ? t('status.attended') : t('status.absent')) : b.checked_in ? t('status.checkedIn') : t('status.confirmed')
                  const statusColor = past ? (b.checked_in ? '#7fd8a0' : '#e05a4a') : b.checked_in ? '#7fd8a0' : GOLD
                  const funding = b.is_trial ? t('common.assessment') : b.token_package_id ? (b.lesson_group_id ? '2 tokens' : '1 token') : b.lesson_credit_id ? (b.lesson_group_id ? '2 credits' : '1 credit') : '—'
                  return (
                    <div onClick={() => setLessonDetail(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
                      <div onClick={e => e.stopPropagation()} style={{ background: DARK, border: '1px solid rgba(255,255,255,0.12)', borderRadius: '16px', padding: '24px', width: '100%', maxWidth: '380px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                          <div>
                            <div style={{ fontSize: '17px', fontWeight: 700, color: '#fff' }}>{(b.course_type_id ? tDb(locale, 'course_types', b.course_type_id, b.course_name) : b.course_name) || 'Lesson'}</div>
                            {b.level_min != null && b.level_max != null && (
                              <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)', marginTop: '2px' }}>Level {b.level_min}–{b.level_max} Group</div>
                            )}
                          </div>
                          <span style={{ fontSize: '11px', fontWeight: 700, padding: '4px 10px', borderRadius: '12px', color: statusColor, background: statusColor + '22', whiteSpace: 'nowrap' }}>{statusLabel}</span>
                        </div>
                        {[
                          { label: 'Swimmer', value: b.student_name || '—' },
                          { label: 'Date', value: dateStr },
                          { label: 'Time', value: `${(() => { const f = (t?: string) => { if (!t) return ''; const [h, m] = String(t).slice(0, 5).split(':').map(Number); const ap = h >= 12 ? 'PM' : 'AM'; const h12 = h % 12 === 0 ? 12 : h % 12; return `${h12}:${String(m).padStart(2, '0')} ${ap}` }; return `${f(b.start_time)} – ${f(b.end_time)}` })()}` },
                          { label: 'Coach', value: b.coach_name ? `Coach ${b.coach_name}` : '—' },
                          { label: 'Payment', value: funding },
                        ].map(row => (
                          <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                            <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.4)' }}>{row.label}</span>
                            <span style={{ fontSize: '13px', fontWeight: 600, color: '#fff', textAlign: 'right' }}>{row.value}</span>
                          </div>
                        ))}
                        <button onClick={() => setLessonDetail(null)}
                          style={{ marginTop: '18px', width: '100%', padding: '12px', background: GOLD, border: 'none', borderRadius: '10px', color: NAVY, fontSize: '13px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', cursor: 'pointer' }}>Close</button>
                      </div>
                    </div>
                  )
                })()}
              </div>
            )
          })() : upcomingBookings.length === 0 ? (
            <div style={{ background: NAVY, borderRadius: '14px', border: '1px dashed rgba(255,255,255,0.12)', padding: '32px', textAlign: 'center' }}>
              <div style={{ fontSize: '28px', marginBottom: '10px' }}>📅</div>
              <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.4)', margin: '0 0 16px' }}>{t('dash.noUpcoming')}</p>
              <button onClick={() => window.location.href = '/booking'} style={{ display: 'inline-block', padding: '10px 24px', background: GOLD, color: NAVY, borderRadius: '8px', fontSize: '12px', fontWeight: 700, border: 'none', cursor: 'pointer', letterSpacing: '1px', textTransform: 'uppercase' }}>{t('dash.bookNow')}</button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {/* Four lessons on one day meant four date chips saying the same
                  thing. The date is stated once above the day's lessons; each card
                  then only says what is different about it. The chip still exists
                  for the desktop card -- which of the two you see is a media
                  query, so the markup stays single. */}
              {(() => {
                const allDays: { date: string; items: Booking[] }[] = []
                for (const b of upcomingBookings) {
                  const last = allDays[allDays.length - 1]
                  if (last && last.date === b.session_date) last.items.push(b)
                  else allDays.push({ date: b.session_date, items: [b] })
                }
                const days = allDays.slice(0, dayWindow)
                return days.map(day => {
                  const du = getDaysUntil(day.date)
                  const dd = new Date(day.date + 'T00:00:00')
                  return (
                    <div key={day.date} style={{ display: 'contents' }}>
                      <div className="msa-day-head">
                        <span style={{ fontSize: '13px', fontWeight: 800, color: du === 0 ? GOLD : '#fff' }}>
                          {dd.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
                        </span>
                        {du === 0 && <span style={{ fontSize: '10px', fontWeight: 700, background: GOLD, color: NAVY, borderRadius: '10px', padding: '2px 8px' }}>{t('dash.up.today')}</span>}
                        {du === 1 && <span style={{ fontSize: '10px', fontWeight: 700, background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.7)', borderRadius: '10px', padding: '2px 8px' }}>{t('dash.up.tomorrow')}</span>}
                        <span style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.09)' }} />
                        <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.35)', whiteSpace: 'nowrap' }}>
                          {t(day.items.length === 1 ? 'dash.day.oneLesson' : 'dash.day.nLessons', { n: day.items.length })}
                        </span>
                      </div>
                      {day.items.map((booking) => {
                const daysUntil = getDaysUntil(booking.session_date)
                const isToday = daysUntil === 0
                const isTomorrow = daysUntil === 1
                const statusColor = (booking.pending_action === 'reschedule' || booking.pending_action === 'reschedule_initiator') ? GOLD : (STATUS_COLORS[booking.status] || GOLD)
                return (
                  <div key={booking.id} className="msa-lesson" style={{ background: NAVY, border: `1px solid ${isToday ? GOLD + '40' : 'rgba(255,255,255,0.08)'}` }}>
                    <div className="msa-lesson-date" style={{ background: isToday ? GOLD : 'rgba(255,255,255,0.06)' }}>
                      <div style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: isToday ? NAVY : 'rgba(255,255,255,0.4)' }}>
                        {new Date(booking.session_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short' })}
                      </div>
                      <div style={{ fontSize: '20px', fontWeight: 900, color: isToday ? NAVY : '#fff', lineHeight: 1 }}>
                        {new Date(booking.session_date + 'T00:00:00').getDate()}
                      </div>
                    </div>
                      <div className="msa-lesson-head">
                        <span className="msa-lesson-meta">
                          <b>{booking.is_trial ? t('common.assessment') : (booking.course_type_id ? tDb(locale, 'course_types', booking.course_type_id, booking.course_name) : booking.course_name)}</b>
                          {!booking._group && <> · {formatTime(booking.start_time)} — {formatTime(booking.end_time)}</>}
                          {!booking._group && booking.coach_name ? <> · {t('dash.up.coach', { name: booking.coach_name })}</> : null}
                          {(() => { const bk = bandKey(booking.level_min, booking.level_max); return bk ? <span style={{ fontSize: '10px', fontWeight: 700, marginLeft: '6px', background: `${BAND_COLORS[bk]}22`, color: BAND_COLORS[bk], border: `1px solid ${BAND_COLORS[bk]}55`, borderRadius: '10px', padding: '2px 8px', whiteSpace: 'nowrap' }}>{t('dash.up.levelBadge', { min: booking.level_min ?? '', max: booking.level_max ?? '' })}</span> : null })()}
                        </span>
                        {isToday && <span className="msa-lesson-daybadge" style={{ fontSize: '10px', fontWeight: 700, background: GOLD, color: NAVY, borderRadius: '10px', padding: '2px 8px' }}>{t('dash.up.today')}</span>}
                        {isTomorrow && <span className="msa-lesson-daybadge" style={{ fontSize: '10px', fontWeight: 700, background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.7)', borderRadius: '10px', padding: '2px 8px' }}>{t('dash.up.tomorrow')}</span>}
                        {booking._group && <span className="msa-lesson-status-inline msa-lesson-pill">
                          {(() => {
                            if (booking.checked_in) return <span style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: '#86efac', background: 'rgba(134,239,172,0.12)', border: '1px solid rgba(134,239,172,0.3)', borderRadius: '20px', padding: '3px 10px' }}>&#10003; {t('dash.up.checkedIn')}</span>
                            if (booking.session_date !== getTodayLA()) return null
                            const [sh, sm] = booking.start_time.split(':').map(Number)
                            const [eh, em] = booking.end_time.split(':').map(Number)
                            const nowMin = getNowMinutesLA()
                            if (nowMin >= sh * 60 + sm - 30 && nowMin < eh * 60 + em) return <span style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: GOLD, background: `${GOLD}18`, border: `1px solid ${GOLD}40`, borderRadius: '20px', padding: '3px 10px' }}>{t('dash.up.checkinOpen')}</span>
                            if (nowMin < sh * 60 + sm - 30) return <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.3)', whiteSpace: 'nowrap' }}>{t('dash.up.checkinSoon')}</span>
                            return null
                          })()}
                          <span style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: statusColor, background: `${statusColor}18`, border: `1px solid ${statusColor}30`, borderRadius: '20px', padding: '3px 10px' }}>{t('dash.status.' + booking.status)}</span>
                        </span>}
                        {!booking._group && (
                          <span className="msa-lesson-pill" style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', whiteSpace: 'nowrap', color: statusColor, background: `${statusColor}18`, border: `1px solid ${statusColor}30`, borderRadius: '20px', padding: '3px 10px' }}>
                            {(booking.pending_action === 'reschedule' || booking.pending_action === 'reschedule_initiator') ? t('dash.up.pendingReschedule') : t('dash.status.' + booking.status)}
                          </span>
                        )}
                      </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {!booking._group && booking.student_name && (
                        <div className="msa-lesson-name" style={{ color: swimmerColor(booking.student_name) }}>{booking.student_name}</div>
                      )}
                      {(booking.pending_action === 'reschedule' || booking.pending_action === 'reschedule_initiator') && booking.new_coach_name ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '2px', flexWrap: 'wrap' }}>
                          <div style={{ fontSize: '13px', fontWeight: 700 }}>
                            <span style={{ color: 'rgba(255,255,255,0.35)', textDecoration: 'line-through' }}>{t('dash.up.coach', { name: booking.coach_name })}</span>
                            {booking.student_name ? <span style={{ color: 'rgba(255,255,255,0.25)', textDecoration: 'line-through' }}> · ({booking.student_name})</span> : ''}
                          </div>
                          <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '14px' }}>→</span>
                          <div style={{ fontSize: '13px', fontWeight: 700 }}>
                            <span style={{ color: '#c9a84c' }}>{t('dash.up.coach', { name: booking.new_coach_name })}</span>
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
                              <div key={m.id} className="msa-lesson-row" style={{ paddingTop: mi > 0 ? '8px' : undefined, borderTop: mi > 0 && m.course_slug !== '1on2' ? '1px solid rgba(255,255,255,0.07)' : 'none' }}>
                                <div style={{ minWidth: 0 }}>
                                  <div style={{ fontSize: '15px', fontWeight: 800, letterSpacing: '-0.2px', color: swimmerColor(m.student_name) }}>{m.student_name || '—'}</div>
                                  <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.45)', marginTop: '1px' }}>
                                    {formatTime(m.start_time)} — {formatTime(m.end_time)} · {t('dash.up.coach', { name: m.coach_name })}
                                  </div>
                                </div>
                                {m.token_package_id ? (
                                  <div style={{ padding: '4px 10px', borderRadius: '8px', border: '1px solid rgba(232,136,58,0.4)', background: 'rgba(232,136,58,0.08)', color: '#e8883a', fontSize: '10px', fontWeight: 600 }}>🎫 {t('dash.up.tokenFinal')}</div>
                                ) : (m.course_slug === '1on2' && mi > 0) ? null : (
                                  <div className="msa-lesson-actions">
                                    <button
                                      onClick={() => m.lesson_credit_id && setRescheduleTarget({ id: m.id, creditId: m.lesson_credit_id, slug: m.course_slug || '', studentId: m.student_id || '', courseName: m.course_name, courseTypeId: m.course_type_id, date: formatDate(m.session_date), time: formatTime(m.start_time), partnerBookingId: m.partner_booking_id, groupId: m.lesson_group_id })}
                                      disabled={rDis}
                                      style={{ padding: '4px 10px', borderRadius: '8px', border: rDis ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(201,168,76,0.4)', background: 'transparent', color: rDis ? 'rgba(255,255,255,0.2)' : '#c9a84c', fontSize: '10px', fontWeight: 600, cursor: rDis ? 'not-allowed' : 'pointer' }}>
                                      {reschedulingId === m.id ? '...' : t('dash.up.reschedule')}
                                    </button>
                                    {cEnabled ? (
                                      <button
                                        onClick={() => setCancelTarget({ id: m.id, courseName: m.course_name, courseTypeId: m.course_type_id, date: formatDate(m.session_date), time: formatTime(m.start_time), isLate: late })}
                                        style={{ padding: '4px 10px', borderRadius: '8px', border: late ? '1px solid rgba(232,136,58,0.4)' : '1px solid rgba(224,90,74,0.3)', background: 'transparent', color: late ? '#e8883a' : '#e05a4a', fontSize: '10px', fontWeight: 600, cursor: 'pointer' }}>
                                        {cancellingId === m.id ? '...' : late ? t('dash.up.cancelToken') : t('dash.up.cancel')}
                                      </button>
                                    ) : (
                                      <div style={{ padding: '4px 10px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.2)', fontSize: '10px', fontWeight: 600, cursor: 'not-allowed' }}>{t('dash.up.cancel')}</div>
                                    )}
                                  </div>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      ) : (
                        null
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
                            const str = ms <= 0 ? t('dash.up.expired') : `${mins}:${String(secs).padStart(2, '0')}`
                            return <div style={{ fontSize: '11px', color: mins < 3 ? '#f87171' : '#c9a84c', marginTop: '2px' }}>⏱ {t('dash.up.rescheduleCountdown', { time: str })}</div>
                          })()}
                        </div>
                      ) : (
                        <div>
                          {(booking.pending_action === 'reschedule' || booking.pending_action === 'reschedule_initiator') && booking.pending_expires_at && (() => {
                            const ms = Math.max(0, new Date(booking.pending_expires_at).getTime() - now)
                            const mins = Math.floor(ms / 60000)
                            const secs = Math.floor((ms % 60000) / 1000)
                            const str = ms <= 0 ? t('dash.up.expired') : `${mins}:${String(secs).padStart(2, '0')}`
                            return <div style={{ fontSize: '11px', color: mins < 3 ? '#f87171' : '#c9a84c', marginTop: '2px' }}>⏱ {t('dash.up.rescheduleCountdown', { time: str })}</div>
                          })()}
                        {booking.status === 'pending_partner' && booking.pending_expires_at && (() => {
                            const ms = Math.max(0, new Date(booking.pending_expires_at).getTime() - now)
                            const mins = Math.floor(ms / 60000)
                            const secs = Math.floor((ms % 60000) / 1000)
                            const str = ms <= 0 ? t('dash.up.expired') : `${mins}:${String(secs).padStart(2, '0')}`
                            return <div style={{ fontSize: '11px', color: mins < 3 ? '#f87171' : '#c9a84c', marginTop: '2px' }}>⏱ {t('dash.up.partnerCountdown', { time: str })}</div>
                          })()}
                        </div>
                      )}
                    </div>
                    <div className="msa-lesson-side" style={{ display: booking._group ? 'none' : 'flex' }}>
                      <div className="msa-lesson-status">
                      {(() => {
                        if (booking.checked_in) return <span style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: '#86efac', background: 'rgba(134,239,172,0.12)', border: '1px solid rgba(134,239,172,0.3)', borderRadius: '20px', padding: '3px 10px' }}>&#10003; {t('dash.up.checkedIn')}</span>
                        if (booking.session_date !== getTodayLA()) return null
                        const [sh, sm] = booking.start_time.split(':').map(Number)
                        const [eh, em] = booking.end_time.split(':').map(Number)
                        const nowMin = getNowMinutesLA()
                        if (nowMin >= sh * 60 + sm - 30 && nowMin < eh * 60 + em) {
                          return <span style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: GOLD, background: `${GOLD}18`, border: `1px solid ${GOLD}40`, borderRadius: '20px', padding: '3px 10px' }}>{t('dash.up.checkinOpen')}</span>
                        }
                        return null
                      })()}
                      </div>
                      {(booking.pending_action === 'reschedule' || booking.pending_action === 'reschedule_initiator') ? (
                        <div className="msa-lesson-actions">
                          {booking.pending_action === 'reschedule' && <>
                          <button
                            onClick={async () => {
                              setReschedulingId(booking.id)
                              const res = await fetch('/api/bookings/confirm-reschedule', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ booking_id: booking.id }) })
                              const json = await res.json()
                              if (!res.ok) setNotice(json.error || t('dash.resAction.failed'))
                              await fetchAll()
                              setReschedulingId(null)
                            }}
                            style={{ padding: '6px 12px', borderRadius: '8px', border: '1px solid rgba(134,239,172,0.4)', background: 'transparent', color: '#86efac', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}>
                            {t('dash.up.acceptReschedule')}
                          </button>
                          <button
                            onClick={async () => {
                              setRescheduleActionModal({ bookingId: booking.id, type: 'reject', title: t('dash.resAction.declineTitle'), message: t('dash.resAction.keepsTime') })
                            }}
                            style={{ padding: '6px 12px', borderRadius: '8px', border: '1px solid rgba(224,90,74,0.3)', background: 'transparent', color: '#e05a4a', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}>
                            {t('dash.up.decline')}
                          </button>
                          </>}
                          {booking.pending_action === 'reschedule_initiator' && (
                            <button
                              onClick={async () => {
                                setRescheduleActionModal({ bookingId: booking.id, type: 'cancel', title: t('dash.resAction.cancelTitle'), message: t('dash.resAction.keepsTime') })
                              }}
                              style={{ padding: '6px 12px', borderRadius: '8px', border: '1px solid rgba(224,90,74,0.3)', background: 'transparent', color: '#e05a4a', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}>
                              {t('dash.up.cancelReschedule')}
                            </button>
                          )}
                        </div>
                      ) : booking.status === 'pending_payment' ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                            <div style={{ padding: '6px 12px', borderRadius: '8px', border: '1px solid rgba(201,168,76,0.3)', background: 'rgba(201,168,76,0.08)', color: '#c9a84c', fontSize: '11px', fontWeight: 600 }}>
                              ⏱ {t('dash.pend.awaiting')}
                            </div>
                            <button
                              onClick={async () => {
                                setPendingPayBusy(booking.id); setPendingPayMsg('')
                                try {
                                  const res = await fetch('/api/bookings/pending-payment', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'link', booking_id: booking.id }) })
                                  const j = await res.json().catch(() => ({}))
                                  if (res.ok && j.url) { window.location.href = j.url; return }
                                  setPendingPayMsg(j.error || t('dash.pend.linkFailed'))
                                } catch { setPendingPayMsg(t('dash.pend.network')) }
                                setPendingPayBusy(null)
                              }}
                              disabled={pendingPayBusy === booking.id}
                              style={{ padding: '6px 12px', borderRadius: '8px', border: '1px solid rgba(201,168,76,0.5)', background: '#c9a84c', color: '#1a2744', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}>
                              {pendingPayBusy === booking.id ? '...' : t('dash.pend.payNow')}
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
                                <div style={{ fontSize: '16px', fontWeight: 700, color: '#fff', marginBottom: '8px' }}>{t('dash.pend.cancelTitle')}</div>
                                <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.6)', lineHeight: 1.6, marginBottom: '20px' }}>
                                  {t('dash.pend.cancelBody')}
                                </div>
                                <div style={{ display: 'flex', gap: '10px' }}>
                                  <button
                                    onClick={() => setPendingCancelConfirm(null)}
                                    disabled={pendingPayBusy === booking.id}
                                    style={{ flex: 1, padding: '10px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.2)', background: 'transparent', color: 'rgba(255,255,255,0.7)', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
                                    {t('dash.pend.keep')}
                                  </button>
                                  <button
                                    onClick={async () => {
                                      setPendingPayBusy(booking.id); setPendingPayMsg('')
                                      try {
                                        const res = await fetch('/api/bookings/pending-payment', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'cancel', booking_id: booking.id }) })
                                        const j = await res.json().catch(() => ({}))
                                        if (res.ok) { window.location.reload(); return }
                                        setPendingPayMsg(j.error || t('dash.pend.cancelFailed'))
                                      } catch { setPendingPayMsg(t('dash.pend.network')) }
                                      setPendingPayBusy(null); setPendingCancelConfirm(null)
                                    }}
                                    disabled={pendingPayBusy === booking.id}
                                    style={{ flex: 1, padding: '10px', borderRadius: '10px', border: 'none', background: '#e05a4a', color: '#fff', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}>
                                    {pendingPayBusy === booking.id ? t('dash.pend.cancelling') : t('dash.cancelModal.yesCancel')}
                                  </button>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      ) : booking.status === 'in_cart' ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <div style={{ padding: '6px 12px', borderRadius: '8px', border: '1px solid rgba(201,168,76,0.3)', background: 'rgba(201,168,76,0.08)', color: '#c9a84c', fontSize: '11px', fontWeight: 600 }}>
                            🛒 {t('dash.cart.held')}
                          </div>
                          <Link href="/booking?cart=1" style={{ padding: '6px 12px', borderRadius: '8px', border: '1px solid rgba(201,168,76,0.4)', background: 'transparent', color: '#c9a84c', fontSize: '11px', fontWeight: 600, textDecoration: 'none' }}>
                            {t('dash.cart.view')}
                          </Link>
                        </div>
                      ) : booking._group ? null : booking.token_package_id ? (
                        <div style={{ padding: '6px 12px', borderRadius: '8px', border: '1px solid rgba(232,136,58,0.4)', background: 'rgba(232,136,58,0.08)', color: '#e8883a', fontSize: '11px', fontWeight: 600 }}>
                          🎫 {t('dash.up.tokenFinal')}
                        </div>
                      ) : (
                        <div className="msa-lesson-actions">
                          <button
                            onClick={() => booking.lesson_credit_id && setRescheduleTarget({ id: booking.id, creditId: booking.lesson_credit_id, slug: booking.course_slug || '', studentId: booking.student_id || '', courseName: booking.course_name, courseTypeId: booking.course_type_id, date: formatDate(booking.session_date), time: formatTime(booking.start_time), partnerBookingId: booking.partner_booking_id, groupId: booking.lesson_group_id })}
                            disabled={reschedulingId === booking.id || isWithin24Hours(booking.session_date, booking.start_time) || booking.status === 'pending_partner'}
                            style={{ padding: '6px 12px', borderRadius: '8px', border: reschedulingId === booking.id || isWithin24Hours(booking.session_date, booking.start_time) || booking.status === 'pending_partner' ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(201,168,76,0.4)', background: 'transparent', color: reschedulingId === booking.id || isWithin24Hours(booking.session_date, booking.start_time) || booking.status === 'pending_partner' ? 'rgba(255,255,255,0.2)' : '#c9a84c', fontSize: '11px', fontWeight: 600, cursor: reschedulingId === booking.id || isWithin24Hours(booking.session_date, booking.start_time) || booking.status === 'pending_partner' ? 'not-allowed' : 'pointer' }}>
                            {reschedulingId === booking.id ? '...' : t('dash.up.reschedule')}
                          </button>
                          {(() => {
                            // A Swim Assessment is a one-off at its own price, not a
                            // lesson out of a package, so it can neither come back as a
                            // credit nor turn into a token. The parent tells us and the
                            // front desk cancels it by hand. The API refuses it too.
                            if (booking.is_trial) return (
                              <button
                                onClick={() => {
                                  const toggle = document.querySelector('[data-chat-toggle]') as HTMLElement | null
                                  if (toggle) toggle.click()
                                  else setNotice(t('dash.up.cancelContactHelp'))
                                }}
                                style={{ padding: '6px 12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.18)', background: 'transparent', color: 'rgba(255,255,255,0.55)', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}>
                                {t('dash.up.cancelContact')}
                              </button>
                            )
                            const late = isWithin24Hours(booking.session_date, booking.start_time) || daysUntil < 1
                            const lateOk = late && !!booking.lesson_credit_id && !booking.partner_booking_id && booking.course_slug !== '1on2' && (cancelQuota?.remaining ?? 0) > 0
                            const enabled = (!late || lateOk) && cancellingId !== booking.id && booking.status !== 'pending_partner'
                            return enabled ? (
                              <button
                                onClick={() => setCancelTarget({ id: booking.id, courseName: booking.course_name, courseTypeId: booking.course_type_id, date: formatDate(booking.session_date), time: formatTime(booking.start_time), isLate: late })}
                                style={{ padding: '6px 12px', borderRadius: '8px', border: late ? '1px solid rgba(232,136,58,0.4)' : '1px solid rgba(224,90,74,0.3)', background: 'transparent', color: late ? '#e8883a' : '#e05a4a', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}>
                                {cancellingId === booking.id ? '...' : late ? t('dash.up.cancelToken') : t('dash.up.cancel')}
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
                  )
                })
              })()}
            </div>
          )}
          {lessonView === 'list' && (() => {
            const totalDays = new Set(upcomingBookings.map(b => b.session_date)).size
            const more = totalDays - dayWindow
            if (more <= 0 && dayWindow <= UPCOMING_DAYS) return null
            return (
              <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
                {more > 0 && (
                  <button onClick={() => setDayWindow(w => w + UPCOMING_STEP)}
                    style={{ flex: 1, padding: '10px', background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px', color: 'rgba(255,255,255,0.4)', fontSize: '12px', fontWeight: 600, cursor: 'pointer', letterSpacing: '0.5px' }}>
                    ▼ {t('dash.showMoreDays', { n: Math.min(UPCOMING_STEP, more) })}
                  </button>
                )}
                {dayWindow > UPCOMING_DAYS && (
                  <button onClick={collapseUpcoming}
                    style={{ flex: more > 0 ? '0 0 auto' : 1, padding: '10px 18px', background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px', color: 'rgba(255,255,255,0.4)', fontSize: '12px', fontWeight: 600, cursor: 'pointer', letterSpacing: '0.5px' }}>
                    ▲ {t('dash.collapse')}
                  </button>
                )}
              </div>
            )
          })()}
        </section>

        {/* CREDITS */}
        <section style={{ marginBottom: '36px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
            <h2 style={{ fontSize: '13px', fontWeight: 700, color: 'rgba(255,255,255,0.5)', margin: 0, letterSpacing: '1.5px', textTransform: 'uppercase' }}>{t('dash.lessonCredits')}</h2>
            <button onClick={() => window.location.href = '/plans'} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 700, color: GOLD, textDecoration: 'none', border: `1px solid ${GOLD}40`, borderRadius: '8px', padding: '6px 14px', background: 'transparent', cursor: 'pointer' }}>
              + {t('dash.buyCredits')}
            </button>
          </div>
          {credits.length === 0 && tokenPacks.length === 0 && students.filter(s => s.trial_used_at).length === 0 ? (
            <div style={{ background: NAVY, borderRadius: '14px', border: '1px dashed rgba(255,255,255,0.12)', padding: '28px', textAlign: 'center' }}>
              <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.4)', margin: '0 0 14px' }}>{t('dash.noCredits')}</p>
              <Link href="/plans" style={{ display: 'inline-block', padding: '9px 20px', background: 'transparent', color: GOLD, border: `1px solid ${GOLD}`, borderRadius: '8px', fontSize: '12px', fontWeight: 700, textDecoration: 'none', letterSpacing: '1px', textTransform: 'uppercase' }}>{t('dash.browsePlans')}</Link>
            </div>
          ) : (
            <Rail variant="credits" count={Object.keys(credits.reduce((m: Record<string, true>, c) => { m[c.is_trial ? '__assessment__' : c.course_type_id] = true; return m }, {})).length}>
              {(() => {
                // Group credits by course_type_id and sum them up
                const grouped: Record<string, { name: string; total: number; used: number; items: { credits: number; used: number; date: string | null; invoiceId?: string | null; expiresAt?: string | null }[] }> = {}
                credits.forEach(credit => {
                  const ct = Array.isArray(credit.course_types) ? credit.course_types[0] : credit.course_types
                  const pur = Array.isArray(credit.purchases) ? credit.purchases[0] : credit.purchases
                  const key = credit.is_trial ? '__assessment__' : credit.course_type_id
                  const itemDate = pur?.paid_at || pur?.created_at || credit.created_at || null
                  if (!grouped[key]) {
                    grouped[key] = { name: credit.is_trial ? t('common.assessment') : (ct?.id ? tDb(locale, 'course_types', ct.id, ct.name) : (ct?.name || 'Lesson Credits')), total: 0, used: 0, items: [] }
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
                    <CreditCard key={key} g={g} remaining={remaining} pct={pct} note={key === '__assessment__' ? t('credit.assessmentNote') : undefined} bookHref={key === '__assessment__' && remaining > 0 ? `/booking?student=${credits.find(c => c.is_trial && c.used_credits < c.total_credits)?.student_id || ''}` : undefined} />
                  )
                })
              })()}
              <TokenCard tokens={tokenPacks} />
              <TeamCard memberships={teamMemberships} />
            </Rail>
          )}
        </section>

        {/* LESSON HISTORY */}
        {pastBookings.length > 0 && (
          <section style={{ marginBottom: '36px' }}>
            <h2 style={{ fontSize: '13px', fontWeight: 700, color: 'rgba(255,255,255,0.5)', margin: '0 0 16px', letterSpacing: '1.5px', textTransform: 'uppercase' }}>{t('dash.lessonHistory')}</h2>
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
                      const isAttended = booking.status === 'confirmed' && booking.checked_in
                      const noShowColor = '#e05a4a'
                      const attendedColor = '#7fd8a0'
                      const badgeColor = isNoShow ? noShowColor : isAttended ? attendedColor : (STATUS_COLORS[booking.status] || 'rgba(255,255,255,0.3)')
                      const badgeLabel = isNoShow ? t('status.absent') : isAttended ? t('status.attended') : booking.status
                      return (
                      /* Every one of the five fields below is flexShrink: 0, so this row
                         could not narrow: on a phone the coach's name ran past the card,
                         the card is overflow:hidden, and the status badge landed on top
                         of the student's name. Wrapping is the fix -- at desktop width
                         nothing wraps, so that layout is unchanged. */
                      <div key={booking.id} style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '14px 20px', borderBottom: i < displayed.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
                        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', columnGap: '10px', rowGap: '2px', flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.35)', flexShrink: 0 }}>{new Date(booking.session_date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}</div>
                          <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.35)', flexShrink: 0 }}>{formatTime(booking.start_time)} — {formatTime(booking.end_time)}</div>
                          <div style={{ fontSize: '13px', fontWeight: 600, color: 'rgba(255,255,255,0.7)', flexShrink: 0 }}>{booking.is_trial ? t('common.assessment') : (booking.course_type_id ? tDb(locale, 'course_types', booking.course_type_id, booking.course_name) : booking.course_name)}</div>
                          {booking.student_name && <div style={{ fontSize: '12px', color: '#7dd3fc', flexShrink: 0 }}>{booking.student_name}</div>}
                          <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.35)', flexShrink: 0 }}>{t('dash.withCoach', { name: booking.coach_name })}</div>
                        </div>
                        <span style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: badgeColor, background: `${badgeColor}18`, borderRadius: '10px', padding: '2px 8px', flexShrink: 0, whiteSpace: 'nowrap' }}>
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
                      {showAllHistory ? '▲ ' + t('dash.collapse') : '▼ ' + t('dash.showAllRecords', { n: pastBookings.length })}
                    </button>
                  )}
                  {/* Pagination (shown when expanded) */}
                  {showAllHistory && totalPages > 1 && (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginTop: '12px' }}>
                      <button
                        onClick={() => setHistoryPage(p => Math.max(0, p - 1))}
                        disabled={historyPage === 0}
                        style={{ padding: '6px 14px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.12)', background: 'transparent', color: historyPage === 0 ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.6)', fontSize: '12px', cursor: historyPage === 0 ? 'not-allowed' : 'pointer' }}
                      >← {t('dash.prev')}</button>
                      {Array.from({ length: totalPages }, (_, i) => (
                        <button key={i}
                          onClick={() => setHistoryPage(i)} className="tap-auto"
                          style={{ width: '32px', height: '32px', borderRadius: '8px', border: `1px solid ${i === historyPage ? GOLD : 'rgba(255,255,255,0.12)'}`, background: i === historyPage ? `${GOLD}20` : 'transparent', color: i === historyPage ? GOLD : 'rgba(255,255,255,0.4)', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}
                        >{i + 1}</button>
                      ))}
                      <button
                        onClick={() => setHistoryPage(p => Math.min(totalPages - 1, p + 1))}
                        disabled={historyPage === totalPages - 1}
                        style={{ padding: '6px 14px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.12)', background: 'transparent', color: historyPage === totalPages - 1 ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.6)', fontSize: '12px', cursor: historyPage === totalPages - 1 ? 'not-allowed' : 'pointer' }}
                      >{t('dash.next')} →</button>
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
      <style>{MOBILE_CSS}</style>
      {parent && <ChatWidget parentId={parent.id} />}
    </div>
  )
}
