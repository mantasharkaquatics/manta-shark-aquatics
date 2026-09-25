'use client'
import ChatWidget from '@/components/ChatWidget'
import { masteryOf, masteryKey, MASTERY_COLOR } from '@/lib/mastery'

import { useEffect, useState, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import QRCode from 'qrcode'
import { getTodayLA, getNowMinutesLA } from '@/lib/date'
import { isWithin24Hours } from '@/lib/booking-time'
import { priceLesson, LESSONS_PER_FORGIVENESS, REFERRAL_POINTS } from '@/lib/points'
import { BAND_COLORS, bandKey } from '@/lib/zone-colors'
import { useLocale, useT } from '@/lib/i18n/provider'
import { tDb } from '@/lib/i18n'
import { errorKey } from '@/lib/i18n/errors'
import NoticeModal from '@/components/NoticeModal'
import { LEVEL_COLORS, stageProgress, resolveStage, stageNameKey, type StageProgress } from '@/lib/levels'
import SkillTree from './SkillTree'
import { BRAND, HERO_GRADIENT, FONT_BODY } from '@/lib/brand'

/* The phone layout lives here rather than in inline styles, because an inline
   style beats a media query and these three sections have to be shaped
   differently on a phone than on a desktop. Anything that stays inline is a
   colour the component computes; anything that changes with width is a class. */
const MOBILE_CSS = `

.msa-rail { display: grid; gap: 16px }
.msa-addkid { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px;
  min-height: 180px; border-radius: 16px; border: 1.5px dashed rgba(255,255,255,0.3); background: rgba(255,255,255,0.06);
  color: rgba(255,255,255,0.85); font-size: 13px; font-weight: 700; text-decoration: none;
  transition: border-color .15s, color .15s }
.msa-addkid:hover { border-color: #f7b733; color: #fff; background: rgba(255,255,255,0.1) }
.msa-addkid-plus { width: 40px; height: 40px; border-radius: 50%; display: grid; place-items: center;
  font-size: 22px; font-weight: 400; background: #fff; color: #12254a }
.msa-partner { margin: 12px 0 0; text-align: center; font-size: 13px; color: rgba(255,255,255,0.78) }
.msa-partner a { color: #f7b733; font-weight: 700; text-decoration: none; white-space: nowrap }
.msa-refer { margin-top: 6px }
.msa-refer a { color: #f7b733 }
.msa-act { display: grid; grid-template-columns: 1fr auto; gap: 10px; margin-top: 16px }
.msa-act-book { background: #f09800; color: #12254a; border: none; border-radius: 12px; padding: 15px;
  font-size: 15px; font-weight: 800; cursor: pointer; transition: background .15s }
.msa-act-book:hover { background: #d98900 }
.msa-act-pts { display: flex; align-items: center; gap: 14px; background: #fff; border-radius: 12px;
  border: 1px solid transparent; padding: 10px 16px; cursor: pointer; color: #56647d; font-size: 12px }
.msa-act-pts:hover { border-color: #c9d8ee }
.msa-act-pts b { font-size: 19px; color: #12254a; font-variant-numeric: tabular-nums }
.msa-act-pts em { font-style: normal; font-weight: 700; color: #2050a0 }
.msa-act-pts.owe { border-color: #f5c2bd }
.msa-gift { font-size: 12px; font-weight: 700; color: #1f7a57; background: #e6f4ee;
  border: 1px solid #b7e0cc; border-radius: 999px; padding: 3px 9px; white-space: nowrap;
  font-variant-numeric: tabular-nums }
.msa-act-pts.owe b, .msa-act-pts.owe em { color: #c0392b }
.msa-sheet-back { position: fixed; inset: 0; z-index: 1000; background: rgba(14,29,59,0.55);
  display: flex; align-items: center; justify-content: center; padding: 20px }
.msa-sheet { background: #f6f9fd; border: 1px solid #e3ebf6; border-radius: 18px; box-shadow: 0 30px 60px rgba(14,29,59,0.3);
  width: 100%; max-width: 520px; max-height: 86vh; overflow-y: auto; padding: 20px }
.msa-sheet-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px }
.msa-sheet-head b { font-size: 17px; color: #12254a }
.msa-sheet-x { width: 34px; height: 34px; border-radius: 9px; border: none; background: #e8eef7;
  color: #34435e; font-size: 16px; cursor: pointer }
/* The greeting: the site's dark top, short -- this is a working page. */
.msa-hello { background: ${HERO_GRADIENT}; color: #fff; position: relative; overflow: hidden }
.msa-hello::before { content: ''; position: absolute; pointer-events: none; width: 520px; height: 520px; right: -40px; top: 50%;
  transform: translateY(-50%); background: url('/logo.png') center / contain no-repeat; filter: brightness(0) invert(1); opacity: 0.03 }
.msa-hello-in { position: relative; max-width: 1100px; margin: 0 auto; padding: 40px clamp(20px,5vw,48px) 44px }
.msa-hello h1 { font-family: var(--font-display), 'PingFang TC', serif; font-size: clamp(26px,3vw,36px); font-weight: 900; margin: 0; color: #fff }
.msa-hello h1 em { color: #f7b733 }
/* Palette B on this page (owner, 2026-09-25): the dark top carries on down
   the page and every card is white on it, lifted by a shadow. */
.msa-card { box-shadow: 0 10px 30px rgba(0,0,0,0.22) }
.msa-sec-h { font-size: 12px; font-weight: 800; color: #f7b733; margin: 0 0 16px; letter-spacing: 2px; text-transform: uppercase }
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
.msa-lesson-meta { font-size: 13px; line-height: 1.55; color: #56647d; min-width: 0 }
.msa-lesson-meta b { font-weight: 700; color: #16294a }
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

  /* One card at a time, with the next one's edge showing so it is obvious
     the row moves. The negative margin lets it run to the screen edge. */
  .msa-act { grid-template-columns: 1fr }
  .msa-act-pts { justify-content: space-between }
  .msa-sheet-back { align-items: flex-end; padding: 0 }
  .msa-sheet { border-radius: 18px 18px 0 0; max-height: 88vh; padding-bottom: calc(20px + env(safe-area-inset-bottom)) }
  .msa-rail { display: flex; gap: 12px; overflow-x: auto; scroll-snap-type: x mandatory;
              padding: 2px clamp(20px,5vw,48px) 10px; margin: 0 calc(-1 * clamp(20px,5vw,48px));
              scrollbar-width: none }
  .msa-rail::-webkit-scrollbar { display: none }
  .msa-rail > * { scroll-snap-align: center; flex: 0 0 92% }
  .msa-dots { display: flex; justify-content: center; gap: 6px; margin-top: 10px }
  .msa-dot { width: 6px; height: 6px; border-radius: 50%; background: rgba(255,255,255,0.3); transition: width .18s, background .18s }
  .msa-dot-on { width: 18px; border-radius: 3px; background: #f7b733 }
  .msa-hello-in { padding-top: 28px; padding-bottom: 30px }
  .msa-hello::before { width: 320px; height: 320px; right: -80px }

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

// Palette B (2026-09). GOLD was the old accent and is still the name the
// page uses for it; it is now the LOGO blue. Filled buttons use AMBER.
const NAVY = BRAND.navy
const GOLD = BRAND.blue
const AMBER = BRAND.amber


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
  /** every skill the coach has ever recorded, across all levels -- the learning
   *  map needs this because a coach may now record ahead of the current stage */
  allPercents: Record<string, number>
}

interface Booking {
  id: string; status: string
  session_date: string; start_time: string; end_time: string
  course_name: string; course_type_id?: string; coach_name: string; student_name?: string; _group?: Booking[]; lesson_group_id?: string | null; _hour?: boolean
  level_min?: number | null; level_max?: number | null
  points_charged?: number | null
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
/* The most swimmers one family can hold. The account page enforces the same
   number; the home page hides its "add" card once it is reached. */
const MAX_SWIMMERS = 3

const SWIMMER_COLORS = ['#2050a0', '#c2621a', '#2e9d6a', '#7b5ea7', '#c2185b']

// QR payload: base64 encode of student_id so it's not raw UUID
function makeQRPayload(studentId: string): string {
  return `MSA:${btoa(studentId)}`
}

const STATUS_COLORS: Record<string, string> = {
  confirmed: '#4caf72',
  cancelled: '#e05a4a',
  completed: '#a0a0a0',
  pending: GOLD,
}

// QR Modal Component
/* One swimmer's lessons, in one list.
 *
 * There used to be two: a "lesson records" drawer inside each card, which only
 * listed lessons a coach had written up, and a "lesson history" section at the
 * foot of the page listing every past booking for the whole family. A parent
 * looking for last Tuesday had to know which list it would be in. This is both,
 * for one swimmer: every past lesson, and where the coach wrote something, the
 * note and the skills open underneath it.
 *
 * Records are matched to bookings on date and start time; a record whose time
 * does not line up takes the only unmatched lesson on its date. Anything still
 * left over is listed on its own rather than dropped -- losing a coach's note
 * would be worse than showing a lesson twice. */
function RecordsSheet({ student, past, records, page, setPage, onClose }: {
  student: Student
  past: Booking[]
  records: ProgressRecord[]
  page: number
  setPage: (n: number) => void
  onClose: () => void
}) {
  const t = useT()
  const locale = useLocale()
  const [open, setOpen] = useState<Record<string, boolean>>({})

  type Row = { key: string; date: string; start?: string; end?: string; course?: string; courseId?: string; coach?: string; b?: Booking; rec?: ProgressRecord }
  const hm = (x?: string) => (x || '').slice(0, 5)
  const rows: Row[] = past.map(b => ({
    key: b.id, date: b.session_date, start: b.start_time, end: b.end_time,
    course: b.is_trial ? t('common.assessment') : b.course_name, courseId: b.is_trial ? undefined : b.course_type_id,
    coach: b.coach_name, b,
  }))
  const leftover: ProgressRecord[] = []
  for (const r of records) {
    const exact = rows.find(x => !x.rec && x.date === r.session_date && r.start_time && hm(x.start) === hm(r.start_time))
    const sameDay = rows.filter(x => !x.rec && x.date === r.session_date)
    const hit = exact || (sameDay.length === 1 ? sameDay[0] : undefined)
    if (hit) hit.rec = r
    else leftover.push(r)
  }
  for (const r of leftover) rows.push({
    key: 'rec_' + r.session_date + '_' + (r.lesson_key || r.start_time || ''), date: r.session_date,
    start: r.start_time, course: r.course_name, courseId: r.course_type_id, rec: r,
  })
  rows.sort((a, b) => b.date.localeCompare(a.date) || (b.start || '').localeCompare(a.start || ''))

  const PER = 10
  const pages = Math.max(1, Math.ceil(rows.length / PER))
  const pg = Math.min(page, pages - 1)
  const shown = rows.slice(pg * PER, pg * PER + PER)
  const dateFmt = locale === 'en' ? 'en-US' : locale === 'zh-Hans' ? 'zh-CN' : 'zh-TW'

  return (
    <div className="msa-sheet-back" onClick={onClose}>
      <div className="msa-sheet" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true"
        aria-label={t('dash.recordsOf', { name: student.full_name })}>
        <div className="msa-sheet-head">
          <b>{t('dash.recordsOf', { name: student.full_name })}</b>
          <button className="msa-sheet-x" onClick={onClose} aria-label={t('common.close')}>✕</button>
        </div>
        {rows.length === 0 && (
          <p style={{ fontSize: '13px', color: '#56647d', textAlign: 'center', padding: '24px 0', margin: 0 }}>
            {t('dash.noRecordsYet')}
          </p>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {shown.map(r => {
            const b = r.b
            const attended = !!b && b.status === 'confirmed' && !!b.checked_in
            const absent = !!b && b.status === 'confirmed' && !b.checked_in
            const badgeColor = absent ? '#e05a4a' : attended ? '#1f7a57' : b ? (STATUS_COLORS[b.status] || '#9aa6ba') : ''
            const badge = !b ? '' : absent ? t('status.absent') : attended ? t('status.attended') : b.status
            const hasDetail = !!r.rec && (!!r.rec.note || r.rec.skills.length > 0)
            const isOpen = !!open[r.key]
            return (
              <div key={r.key} style={{ border: '1px solid #e3ebf6', borderRadius: '10px', overflow: 'hidden', background: '#fff' }}>
                <button className="tap-auto" disabled={!hasDetail} aria-expanded={hasDetail ? isOpen : undefined}
                  onClick={() => hasDetail && setOpen(o => ({ ...o, [r.key]: !o[r.key] }))}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '10px', padding: '11px 12px',
                    background: 'transparent', border: 'none', textAlign: 'left', cursor: hasDetail ? 'pointer' : 'default' }}>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#16294a' }}>
                      {new Date(r.date + 'T00:00:00').toLocaleDateString(dateFmt, { year: 'numeric', month: 'numeric', day: 'numeric', weekday: 'short' })}
                      {r.start ? ` · ${formatTime(r.start)}` : ''}
                    </span>
                    <span style={{ display: 'block', fontSize: '11.5px', color: '#56647d', marginTop: '2px' }}>
                      {r.course ? (r.courseId ? tDb(locale, 'course_types', r.courseId, r.course) : r.course) : ''}
                      {r.coach ? ` · ${t('dash.withCoach', { name: r.coach })}` : ''}
                    </span>
                  </span>
                  {r.rec?.note && <span style={{ fontSize: '10px', fontWeight: 700, color: GOLD, flexShrink: 0 }}>{t('dash.coachNote')}</span>}
                  {badge && (
                    <span style={{ fontSize: '10px', fontWeight: 700, color: badgeColor, background: `${badgeColor}18`,
                      borderRadius: '10px', padding: '2px 8px', flexShrink: 0, whiteSpace: 'nowrap' }}>{badge}</span>
                  )}
                  {hasDetail && <span style={{ fontSize: '10px', color: '#56647d', flexShrink: 0 }}>{isOpen ? '▲' : '▼'}</span>}
                </button>
                {hasDetail && isOpen && r.rec && (
                  <div style={{ padding: '0 12px 12px', display: 'flex', flexDirection: 'column', gap: '7px' }}>
                    {r.rec.note && (
                      <div style={{ background: `${GOLD}14`, border: `1px solid ${GOLD}40`, borderRadius: '8px', padding: '9px 11px' }}>
                        <div style={{ fontSize: '10px', color: GOLD, fontWeight: 700, letterSpacing: '0.5px', marginBottom: '3px' }}>{t('dash.coachNote')}</div>
                        <div style={{ fontSize: '12px', color: '#16294a', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{r.rec.note}</div>
                      </div>
                    )}
                    {r.rec.skills.map(sk => (
                      <div key={sk.skill_id}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', marginBottom: '3px' }}>
                          <span style={{ fontSize: '11.5px', color: '#56647d' }}>{sk.skill_id ? tDb(locale, 'skills', sk.skill_id, sk.skill_name) : sk.skill_name}</span>
                          <span style={{ fontSize: '11.5px', fontWeight: 700, flexShrink: 0, color: MASTERY_COLOR[masteryOf(sk.progress_percent)] }}>{t(masteryKey(masteryOf(sk.progress_percent)))}</span>
                        </div>
                        <div style={{ height: '3px', background: '#eef2f8', borderRadius: '2px' }}>
                          <div style={{ height: '100%', width: sk.progress_percent + '%', background: sk.progress_percent >= 100 ? '#4caf72' : AMBER, borderRadius: '2px' }} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
        {pages > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginTop: '14px' }}>
            <button className="tap-auto" disabled={pg === 0} onClick={() => setPage(pg - 1)}
              style={{ padding: '7px 14px', borderRadius: '8px', border: '1px solid #e3ebf6', background: 'transparent',
                color: pg === 0 ? '#9aa6ba' : '#56647d', fontSize: '12px', cursor: pg === 0 ? 'default' : 'pointer' }}>
              ← {t('dash.prev')}
            </button>
            <span style={{ fontSize: '12px', color: '#56647d', fontVariantNumeric: 'tabular-nums' }}>{pg + 1} / {pages}</span>
            <button className="tap-auto" disabled={pg === pages - 1} onClick={() => setPage(pg + 1)}
              style={{ padding: '7px 14px', borderRadius: '8px', border: '1px solid #e3ebf6', background: 'transparent',
                color: pg === pages - 1 ? '#9aa6ba' : '#56647d', fontSize: '12px', cursor: pg === pages - 1 ? 'default' : 'pointer' }}>
              {t('dash.next')} →
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

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
        position: 'fixed', inset: 0, background: 'rgba(14,29,59,0.55)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1000, padding: '20px',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#fff', borderRadius: '20px',
          border: '1px solid #e3ebf6',
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
            background: '#eef2f8', border: 'none',
            borderRadius: '50%', width: '32px', height: '32px',
            color: '#56647d', fontSize: '16px',
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >×</button>

        {/* Header */}
        <div style={{ marginBottom: '24px' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase', color: GOLD, marginBottom: '6px' }}>
            {t('dash.qr.eyebrow')}
          </div>
          <div style={{ fontFamily: 'var(--font-display), serif', fontSize: '22px', fontWeight: 900, color: '#16294a' }}>
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

        {/* Download button */}
        <button
          onClick={handleDownload}
          style={{
            width: '100%', padding: '12px', borderRadius: '10px',
            background: AMBER, color: NAVY, border: 'none',
            fontSize: '13px', fontWeight: 700, cursor: 'pointer',
            letterSpacing: '0.5px',
          }}
        >
          {t('dash.qr.download')}
        </button>
      </div>
    </div>
  )
}

type WalletSummary = {
  balance: number
  balancePurchased: number
  balanceGranted: number
  /** Points owed after a bank return or a dispute. Zero for almost everyone. */
  arrears: number
  /** The next date some granted points expire, and how many. */
  grantedNextExpiry: { date: string; points: number } | null
  lessonsCompleted: number
  forgiveness: number
  lessonsPerForgiveness: number
  history?: LedgerRow[]
}
type LedgerRow = {
  id: string
  at: string
  points: number
  balanceAfter: number
  reason: string
  note: string | null
  amountCents: number | null
  invoice?: { id: string; number: string } | null
}

/** The wallet, as one card. */
function PointsCard({ w, onBuy }: { w: WalletSummary | null; onBuy: () => void }) {
  const t = useT()
  const locale = useLocale()
  const [showHistory, setShowHistory] = useState(false)
  const [histPage, setHistPage] = useState(0)
  // Where a swipe began. A ref, not state: it changes on every touchmove and
  // nothing on screen depends on it.
  const swipeFrom = useRef<{ x: number; y: number } | null>(null)
  if (!w) return null

  /* The ledger is every movement of money, for ever. Left whole it was longer
     than the rest of the dashboard put together and pushed the lesson history
     off the bottom of the page. Ten at a time, oldest stays reachable. */
  const HIST_PER_PAGE = 10
  const history = w.history ?? []
  const pageCount = Math.max(1, Math.ceil(history.length / HIST_PER_PAGE))
  // Clamped rather than stored: the list can shrink under a reload, and page 4
  // of a two-page list renders as an empty card with no explanation.
  const page = Math.min(histPage, pageCount - 1)
  const pageRows = history.slice(page * HIST_PER_PAGE, (page + 1) * HIST_PER_PAGE)
  const goPage = (n: number) => setHistPage(Math.min(pageCount - 1, Math.max(0, n)))

  const reasonLabel = (r: string) => {
    const key = 'points.reason.' + r
    const v = t(key)
    return v === key ? r : v
  }

  return (
    <div style={{ background: '#fff', borderRadius: '14px', border: '1px solid #c9d8ee', padding: '20px' }}>
      <div style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '1.5px', textTransform: 'uppercase', color: '#56647d', marginBottom: '8px' }}>
        {t('points.card.title')}
      </div>
      {/* Purchased and bonus points are shown apart, never as one total: they
          follow different rules (bonus points expire, are spent first, and are
          not refundable), and a family should see which is which at a glance. */}
      {w.balanceGranted > 0 && (
        <div style={{ fontSize: '12px', color: '#56647d', marginBottom: '4px' }}>{t('points.card.purchasedLabel')}</div>
      )}
      <div style={{ fontFamily: 'var(--font-display), serif', fontSize: '36px', fontWeight: 900, color: GOLD, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
        {w.balancePurchased.toLocaleString()}
      </div>
      <div style={{ fontSize: '12px', color: '#56647d', marginTop: '4px', marginBottom: '14px' }}>
        {/* This line used to read "worth $1,985", which was the single
            strongest cue on the screen that the balance is MONEY PARKED HERE
            rather than lessons already bought. The rate is unchanged and still
            stated on the pricing page and in the FAQ -- it is just no longer
            the second thing a parent reads about their own account. */}
        {t(w.balanceGranted > 0 ? 'points.card.neverExpires' : 'points.card.worth')}
      </div>
      {/* Bonus points: their own box, with the date they stop working, said
          before it arrives so an expiry is never the first a family hears of it. */}
      {w.balanceGranted > 0 && (
        <div style={{ background: '#e6f4ee', border: '1px solid #b7e0cc', borderRadius: '10px', padding: '12px 14px', marginBottom: '14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '10px' }}>
            <span style={{ fontSize: '13px', fontWeight: 700, color: '#1f7a57' }}>{t('points.card.grantedLabel')}</span>
            <span style={{ fontFamily: 'var(--font-display), serif', fontSize: '22px', fontWeight: 900, color: '#1f7a57', fontVariantNumeric: 'tabular-nums' }}>
              {w.balanceGranted.toLocaleString()}
            </span>
          </div>
          <div style={{ fontSize: '12px', color: '#56647d', marginTop: '6px', lineHeight: 1.5 }}>
            {w.grantedNextExpiry
              ? t('points.card.grantedNote', {
                  n: w.grantedNextExpiry.points.toLocaleString(),
                  date: new Date(w.grantedNextExpiry.date).toLocaleDateString(
                    locale === 'en' ? 'en-US' : locale === 'zh-Hans' ? 'zh-CN' : 'zh-TW',
                    { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'America/Los_Angeles' }),
                })
              : t('points.card.grantedNoteNoDate')}
          </div>
        </div>
      )}

      {/* A bank return is rare and alarming, so it gets the top of the card and
          plain words: what is paused, how much, and the one button that fixes
          it. Nothing else on this screen changes -- their lessons and their
          history are all still theirs. */}
      {w.arrears > 0 && (
        <div style={{ background: '#fdecea', border: '1px solid #f5c2bd', borderRadius: '10px', padding: '12px 14px', marginBottom: '14px' }}>
          <div style={{ fontSize: '13px', fontWeight: 700, color: '#c0392b', marginBottom: '4px' }}>
            {t('points.card.arrearsTitle', { n: w.arrears.toLocaleString() })}
          </div>
          <div style={{ fontSize: '12px', color: '#56647d', lineHeight: 1.5, marginBottom: '10px' }}>
            {t('points.card.arrearsBody')}
          </div>
          <button
            onClick={onBuy}
            style={{ background: AMBER, color: NAVY, border: 'none', borderRadius: '8px', padding: '9px 16px', fontSize: '12px', fontWeight: 700, cursor: 'pointer', minHeight: '40px' }}
          >
            {t('points.card.arrearsCta')}
          </button>
        </div>
      )}

      <div style={{ fontSize: '11px', color: '#56647d', marginBottom: '4px', lineHeight: 1.5 }}>
        {t('points.card.done', { n: w.lessonsCompleted })}
      </div>
      <div style={{ fontSize: '11px', color: '#56647d', marginBottom: '14px', lineHeight: 1.5 }}>
        {t('points.card.forgiveness', { n: w.forgiveness, per: w.lessonsPerForgiveness })}
      </div>

      <button onClick={onBuy}
        style={{ display: 'block', width: '100%', textAlign: 'center', padding: '9px 0', marginBottom: '12px', background: AMBER, color: NAVY, border: 'none', borderRadius: '8px', fontSize: '12px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', cursor: 'pointer' }}>
        {t('points.card.buy')}
      </button>

      {(w.history?.length ?? 0) > 0 && (
        <>
          <button onClick={() => { setShowHistory(!showHistory); setHistPage(0) }}
            style={{ background: 'none', border: 'none', padding: 0, fontSize: '11px', color: '#56647d', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', letterSpacing: '0.5px' }}>
            <span style={{ fontSize: '9px' }}>{showHistory ? '▲' : '▼'}</span>
            {t(showHistory ? 'points.card.hideHistory' : 'points.card.showHistory')}
          </button>
          {showHistory && (
            <div
              /* Swipe to turn the page on a phone. Only a decisively SIDEWAYS
                 drag counts -- anything with a vertical component is the page
                 being scrolled, and stealing that would make the dashboard feel
                 broken. The buttons below stay visible on every screen size,
                 because a gesture nobody is told about is not a feature. */
              onTouchStart={(e) => { const p0 = e.touches[0]; swipeFrom.current = { x: p0.clientX, y: p0.clientY } }}
              onTouchEnd={(e) => {
                const from = swipeFrom.current
                swipeFrom.current = null
                if (!from) return
                const p1 = e.changedTouches[0]
                const dx = p1.clientX - from.x
                const dy = p1.clientY - from.y
                if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy) * 1.5) return
                goPage(page + (dx < 0 ? 1 : -1))
              }}
              style={{ marginTop: '12px', borderTop: '1px solid #e3ebf6', paddingTop: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {pageRows.map(row => (
                <div key={row.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '10px' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: '12px', color: '#56647d' }}>{reasonLabel(row.reason)}</div>
                    <div style={{ fontSize: '10px', color: '#56647d', fontVariantNumeric: 'tabular-nums' }}>
                      {new Date(row.at).toLocaleDateString(locale === 'en' ? 'en-US' : locale, { month: 'short', day: 'numeric' })}
                      {row.note ? ' · ' + row.note : ''}
                    </div>
                    {/* The receipt for the money, on the line that spent it. */}
                    {row.invoice && (
                      <a href={`/api/invoices/${row.invoice.id}/pdf`} target="_blank" rel="noopener noreferrer"
                        title={t('points.card.receiptTitle', { number: row.invoice.number })}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', marginTop: '3px', fontSize: '10px', color: GOLD, textDecoration: 'none' }}>
                        <span aria-hidden>🧾</span>{t('points.card.receipt')}
                      </a>
                    )}
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
                    <div style={{ fontSize: '12.5px', fontWeight: 700, color: row.points >= 0 ? '#1f7a57' : '#16294a' }}>
                      {row.points >= 0 ? '+' : '−'}{Math.abs(row.points).toLocaleString()}
                    </div>
                    <div style={{ fontSize: '10px', color: '#56647d' }}>{row.balanceAfter.toLocaleString()}</div>
                  </div>
                </div>
              ))}
              {pageCount > 1 && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '14px', marginTop: '6px' }}>
                  {/* Arrows and a counter rather than one chip per page: a year
                      of activity is dozens of pages, and that row would wrap
                      into a block taller than the ten rows above it. */}
                  <button onClick={() => goPage(page - 1)} disabled={page === 0}
                    aria-label={t('points.card.prevPage')} className="tap-auto"
                    style={{ width: '30px', height: '30px', borderRadius: '6px', border: '1px solid #e3ebf6', background: 'transparent', color: page === 0 ? '#9aa6ba' : '#56647d', fontSize: '12px', cursor: page === 0 ? 'not-allowed' : 'pointer' }}>←</button>
                  <span style={{ fontSize: '11px', color: '#56647d', fontVariantNumeric: 'tabular-nums' }}>
                    {page + 1} / {pageCount}
                  </span>
                  <button onClick={() => goPage(page + 1)} disabled={page === pageCount - 1}
                    aria-label={t('points.card.nextPage')} className="tap-auto"
                    style={{ width: '30px', height: '30px', borderRadius: '6px', border: '1px solid #e3ebf6', background: 'transparent', color: page === pageCount - 1 ? '#9aa6ba' : '#56647d', fontSize: '12px', cursor: page === pageCount - 1 ? 'not-allowed' : 'pointer' }}>→</button>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}

/**
 * Refer a friend: this family's code, a link to share, and who has used it.
 * Loaded when the sheet opens, not with the dashboard -- most visits never
 * open it. The referred families are shown by last name only (owner's call).
 */
function ReferralCard({ focus }: { focus: boolean }) {
  const t = useT()
  const [data, setData] = useState<{ code: string; link: string; points: number; referrals: { family: string; status: 'pending' | 'awarded' }[] } | null>(null)
  const [copied, setCopied] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    let alive = true
    fetch('/api/parent/referral').then(r => r.ok ? r.json() : null).then(j => { if (alive && j?.code) setData(j) }).catch(() => {})
    return () => { alive = false }
  }, [])
  useEffect(() => {
    if (focus && data) ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [focus, data])
  if (!data) return null

  // A phone gets the system share sheet (LINE, Messages, WhatsApp...); a
  // computer copies the link.
  const share = async () => {
    const text = t('ref.shareText', { n: data.points })
    if (typeof navigator !== 'undefined' && (navigator as any).share && /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent)) {
      try { await (navigator as any).share({ title: 'Manta Shark Aquatics', text, url: data.link }); return } catch { /* cancelled */ }
    }
    try {
      await navigator.clipboard.writeText(data.link)
      setCopied(true); setTimeout(() => setCopied(false), 2000)
    } catch {}
  }

  return (
    <div ref={ref} style={{ background: '#fff', borderRadius: '14px', border: '1px solid #b7e0cc', padding: '18px 20px', scrollMarginTop: '12px' }}>
      <div style={{ fontSize: '15px', fontWeight: 700, color: '#16294a', marginBottom: '4px' }}>{t('ref.title', { n: data.points })}</div>
      <div style={{ fontSize: '12px', color: '#56647d', lineHeight: 1.6, marginBottom: '12px' }}>{t('ref.desc', { n: data.points })}</div>
      <div style={{ display: 'flex', gap: '8px', alignItems: 'stretch' }}>
        <span style={{ flex: 1, background: '#fff', border: '1px dashed #c9d8ee', borderRadius: '8px', padding: '9px 12px', fontFamily: 'ui-monospace, Menlo, monospace', fontSize: '17px', fontWeight: 700, letterSpacing: '3px', color: GOLD, textAlign: 'center' }}>
          {data.code}
        </span>
        <button className="tap-auto" onClick={share}
          style={{ background: 'none', border: '1px solid #c9d8ee', color: GOLD, borderRadius: '8px', padding: '0 14px', fontSize: '13px', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
          {copied ? t('ref.copied') : t('ref.share')}
        </button>
      </div>
      {data.referrals.length > 0 && (
        <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {data.referrals.map((r, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', fontSize: '12.5px', background: '#f6f9fd', borderRadius: '8px', padding: '8px 10px' }}>
              <span style={{ color: '#16294a' }}>{t('ref.family', { name: r.family })}</span>
              <span style={{ color: r.status === 'awarded' ? '#1f7a57' : '#56647d', fontWeight: r.status === 'awarded' ? 700 : 400 }}>
                {r.status === 'awarded' ? t('ref.awarded', { n: data.points }) : t('ref.pending')}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

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
    <div style={{ background: '#fff', borderRadius: '14px', border: `1px solid ${RED}55`, padding: '20px' }}>
      <NoticeModal title={t('common.noticeTitle')} message={notice} closeLabel={t('common.close')} onClose={() => setNotice(null)} />
      <div style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '1.5px', textTransform: 'uppercase', color: RED, marginBottom: '8px' }}>{t('team.title')}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {memberships.map((m, mi) => (
          <div key={m.id} style={{ borderTop: mi > 0 ? '1px solid #e3ebf6' : 'none', marginTop: mi > 0 ? '16px' : 0, paddingTop: mi > 0 ? '16px' : 0 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: '14px', fontWeight: 700, color: '#16294a' }}>{m.student_name}</div>
              <div style={{ fontSize: '11px', color: '#56647d' }}>{m.team_tier_id ? tDb(locale, 'team_tiers', m.team_tier_id, m.tier_name) : m.tier_name} · {m.is_prepaid ? t('team.prepaid') : m.monthly_price_cents ? t('dash.team.perMonth', { price: '$' + (m.monthly_price_cents / 100).toLocaleString() }) : ''}</div>
              <div style={{ fontSize: '11px', color: '#56647d' }}>{t('team.unlimited')}</div>
              {(m.weekly_slots || []).length > 0 && (
                <div style={{ marginTop: '8px' }}>
                  <button onClick={() => setSchedOpen(prev => ({ ...prev, [m.id]: !prev[m.id] }))}
                    style={{ background: 'none', border: 'none', padding: 0, fontSize: '11px', color: '#56647d', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', letterSpacing: '0.5px' }}>
                    <span style={{ fontSize: '9px' }}>{schedOpen[m.id] ? '\u25b2' : '\u25bc'}</span>
                    {t(schedOpen[m.id] ? 'team.hideSchedule' : 'team.showSchedule')}
                  </button>
                  {schedOpen[m.id] && (
                    <div style={{ marginTop: '8px', borderLeft: `2px solid ${RED}55`, paddingLeft: '10px', display: 'flex', flexDirection: 'column', gap: '5px' }}>
                      {practiceLines(m.weekly_slots || []).map((ln, li) => (
                        <div key={li} style={{ fontSize: '11px', lineHeight: 1.5 }}>
                          <span style={{ color: '#16294a', fontWeight: 600 }}>{ln.days}</span>
                          <span style={{ color: '#56647d' }}> · {ln.time}{ln.coach ? ` · Coach ${ln.coach}` : ''}</span>
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
              const c = expired ? '#c0392b' : '#1f7a57'
              const bg = expired ? '#fdecea' : '#e6f4ee'
              const bd = expired ? '1px solid #f5c2bd' : '1px solid #b7e0cc'
              return <span style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: c, background: bg, border: bd, borderRadius: '20px', padding: '3px 10px', whiteSpace: 'nowrap' }}>{label}</span>
            })() : m.cancels_at ? <span style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: '#c2621a', background: '#fdf1e6', border: '1px solid #f3cfae', borderRadius: '20px', padding: '3px 10px' }}>{t('team.cancels', { date: new Date(m.cancels_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) })}</span> : <span style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: m.status === 'active' ? '#1f7a57' : '#c2621a', background: m.status === 'active' ? '#e6f4ee' : '#fdf1e6', border: m.status === 'active' ? '1px solid #b7e0cc' : '1px solid #f3cfae', borderRadius: '20px', padding: '3px 10px' }}>{m.status === 'active' ? t('team.active') : t('team.pastDue')}</span>}
            {!m.is_prepaid && (
            <button onClick={() => openPortal(m.id)} disabled={portalLoading === m.id}
              style={{ padding: '5px 12px', borderRadius: '8px', border: '1px solid #e3ebf6', background: 'transparent', color: '#56647d', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}>
              {portalLoading === m.id ? '...' : t('team.manage')}
            </button>
            )}
            </div>
          </div>
          {(m.invoices || []).length > 0 && (
            <div style={{ marginTop: '10px' }}>
              <button onClick={() => setExpanded(prev => ({ ...prev, [m.id]: !prev[m.id] }))}
                style={{ background: 'none', border: 'none', padding: 0, fontSize: '11px', color: '#56647d', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', letterSpacing: '0.5px' }}>
                <span style={{ fontSize: '9px' }}>{expanded[m.id] ? '\u25b2' : '\u25bc'}</span>
                {t(`team.${expanded[m.id] ? 'hide' : 'show'}Invoice${(m.invoices || []).length === 1 ? '' : 's'}`, { n: (m.invoices || []).length })}
              </button>
              {expanded[m.id] && (
                <div style={{ marginTop: '12px', borderTop: '1px solid #e3ebf6', paddingTop: '12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {(m.invoices || []).map((iv, i) => {
                    const dateStr = formatDateNum(iv.date)
                    const expStr = iv.period_end ? formatDateNum(iv.period_end) : null
                    return (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px 8px', flexWrap: 'wrap', paddingBottom: i < (m.invoices || []).length - 1 ? '8px' : 0, borderBottom: i < (m.invoices || []).length - 1 ? '1px solid #e3ebf6' : 'none' }}>
                        <div style={{ fontSize: '11px', color: '#56647d', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{dateStr}{expStr && <span style={{ color: '#56647d' }}> · {t('credit.expPrefix')} {expStr}</span>}</div>
                        {iv.url && (
                          <a href={iv.url} target="_blank" rel="noopener noreferrer" title={t('credit.downloadInvoiceFull')}
                            style={{ fontSize: '11px', fontWeight: 700, color: GOLD, background: '#eef4fc', border: '1px solid #c9d8ee', padding: '3px 7px', borderRadius: 6, textDecoration: 'none', whiteSpace: 'nowrap' }}>
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

export default function DashboardPage() {
  const supabase = createClient()
  const locale = useLocale()
  const t = useT()
  const [parent, setParent] = useState<Parent | null>(null)
  const [students, setStudents] = useState<Student[]>([])
  const [wallet, setWallet] = useState<WalletSummary | null>(null)
  const [teamMemberships, setTeamMemberships] = useState<any[]>([])
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

  async function loadWallet() {
    try {
      const [res, tmRes] = await Promise.all([
        fetch('/api/parent/wallet?history=12'),
        fetch('/api/parent/team-memberships'),
      ])
      if (res.ok) setWallet(await res.json())
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
  const [rescheduleTarget, setRescheduleTarget] = useState<{ id: string; slug: string; studentId: string; courseName: string; courseTypeId?: string; date: string; time: string; partnerBookingId?: string; groupId?: string | null } | null>(null)
  const [rescheduleActionModal, setRescheduleActionModal] = useState<{ bookingId: string; type: 'reject' | 'cancel'; title: string; message: string } | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [cancelTarget, setCancelTarget] = useState<{ id: string; courseName: string; courseTypeId?: string; date: string; time: string; type?: 'cancel' | 'reject'; isLate?: boolean; points?: number | null } | null>(null)
  const [infoModal, setInfoModal] = useState<{ title: string; message: string; actionLabel?: string; onAction?: () => void } | null>(null)
  const [qrStudent, setQrStudent] = useState<Student | null>(null)
  const [studentProgressMap, setStudentProgressMap] = useState<Record<string, StudentProgress>>({})
  // Which stage a family has opened on a student's card, keyed by student id.
  const [recordsFor, setRecordsFor] = useState<Student | null>(null)
  const [recordsPage, setRecordsPage] = useState(0)
  const [pointsOpen, setPointsOpen] = useState(false)
  // Opened from the "refer a friend" line: scroll the sheet to that card.
  const [referralFocus, setReferralFocus] = useState(false)
  useEffect(() => {
    if (!recordsFor && !pointsOpen) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setRecordsFor(null); setPointsOpen(false) } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [recordsFor, pointsOpen])
  /* The tree is a whole-curriculum view, so it opens over the page rather than
     inside a 280px card. One at a time: it is a reading surface, not a panel. */
  const [treeFor, setTreeFor] = useState<{ name: string; level: number; stage: number; percents: Record<string, number> } | null>(null)
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

  /* locale is a dependency because the coach's note is now read in the site's
     language: the text is chosen during this fetch, so without it a parent who
     switches language keeps the note they already had until a full reload --
     which is the same thing that made the coach portal's switcher look dead. */
  useEffect(() => { fetchAll() }, [locale])

  async function fetchAll() {
    loadWallet()
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

    const [{ data: studs }, { data: rawBookings }, { data: pendingRaw }] = await Promise.all([
      supabase.from('students').select('*').eq('parent_id', parentData.id).eq('is_active', true).order('sort_order'),
      supabase.from('bookings')
        .select('id, status, student_id, points_charged, is_trial, class_session_id, partner_booking_id, pending_action, pending_new_session_id, pending_expires_at, lesson_group_id')
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
        ? supabase.from('class_sessions').select('id, session_date, start_time, end_time, course_types(id, name, slug), coaches(first_name)').in('id', pendingSessionIds)
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
          points_charged: b.points_charged,
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

        /* The note is read in whatever language the family is reading the SITE
           in. Keying it off the account setting alone meant a parent could
           switch the page to English and still be handed a Chinese note, which
           reads as broken however deliberate it was. Every approved note is
           translated into all three of en / zh-Hant / zh-Hans on approval, and
           those are exactly the site's three locales, so the lookup always has
           something to find. The account setting stays as the fallback -- it is
           what a family who never touches the site switcher gets -- and a
           missing translation still falls through to the original. */
        const wantLang = locale || (parentData as any).preferred_language || 'en'
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
              allPercents: currentPct,
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
          progressMap[sid] = { student_id: sid, records, stages: [], stageSkills: [], allPercents: {} }
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
            setInfoModal({ title: t('points.short.title'), message: data.error || t('points.short.message'), actionLabel: t('points.card.buy'), onAction: () => { window.location.href = '/plans#buy' } })
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
    window.location.href = `/booking?reschedule_booking_id=${rescheduleTarget.id}&reschedule_slug=${rescheduleTarget.slug}&reschedule_student_id=${rescheduleTarget.studentId}${partnerParam}${groupParam}`
  }

  if (loading) return (
    <div style={{ minHeight: '100vh', background: NAVY, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center' }}>
        <style>{`@keyframes msaPulse { 0%, 100% { opacity: 1; transform: scale(1) } 50% { opacity: .55; transform: scale(.94) } }`}</style>
        <img src="/logo.png" alt="Manta Shark Aquatics" width={72} height={72}
          style={{ display: 'block', margin: '0 auto 16px', borderRadius: '50%', objectFit: 'cover', animation: 'msaPulse 1.6s ease-in-out infinite' }} />
        <div style={{ fontSize: '14px', color: '#56647d' }}>{t('common.loading')}</div>
      </div>
    </div>
  )

  // Why a lesson inside 24 hours can't be cancelled online. Silence here reads
  // as a bug -- the button greys out with nothing to explain it -- so the
  // greyed control becomes a "contact us" button carrying the real reason.
  const lateLockHelp = (b: { course_slug?: string | null; partner_booking_id?: string | null }) =>
    (b.course_slug === '1on2' || b.partner_booking_id)
      ? t('dash.up.cancelPairHelp')
      : t('dash.up.cancelLockedHelp', { per: wallet?.lessonsPerForgiveness ?? LESSONS_PER_FORGIVENESS })
  const openChatOr = (msg: string) => {
    const toggle = document.querySelector('[data-chat-toggle]') as HTMLElement | null
    if (toggle) toggle.click()
    else setNotice(msg)
  }

  return (
    <div style={{ fontFamily: FONT_BODY, background: `linear-gradient(180deg, ${BRAND.navyMid} 0px, ${NAVY} 520px)`, minHeight: '100vh' }}>
      {/* QR Modal */}
      {qrStudent && <QRModal student={qrStudent} onClose={() => setQrStudent(null)} />}

      {recordsFor && (
        <RecordsSheet
          student={recordsFor}
          past={pastBookings.filter(b => b.student_id === recordsFor.id)}
          records={studentProgressMap[recordsFor.id]?.records || []}
          page={recordsPage}
          setPage={setRecordsPage}
          onClose={() => setRecordsFor(null)}
        />
      )}

      {pointsOpen && wallet && (
        <div className="msa-sheet-back" onClick={() => { setPointsOpen(false); setReferralFocus(false) }}>
          <div className="msa-sheet" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={t('points.card.title')}>
            <div className="msa-sheet-head">
              <b>{t('points.card.title')}</b>
              <button className="msa-sheet-x" onClick={() => { setPointsOpen(false); setReferralFocus(false) }} aria-label={t('common.close')}>✕</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <PointsCard w={wallet} onBuy={() => { window.location.href = '/plans#buy' }} />
              <ReferralCard focus={referralFocus} />
              {teamMemberships.length > 0 && <TeamCard memberships={teamMemberships} />}
            </div>
          </div>
        </div>
      )}

      {/* Info Modal */}
      {infoModal && (
        <div onClick={() => setInfoModal(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(14,29,59,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: '20px', border: '1px solid #e3ebf6', padding: '32px', maxWidth: '380px', width: '100%' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase', color: '#c0392b', marginBottom: '8px' }}>Notice</div>
            <div style={{ fontFamily: 'var(--font-display), serif', fontSize: '20px', fontWeight: 900, color: '#16294a', marginBottom: '16px' }}>{infoModal.title}</div>
            <p style={{ fontSize: '13px', color: '#56647d', lineHeight: 1.6, marginBottom: '24px' }}>{infoModal.message}</p>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={() => setInfoModal(null)} style={{ flex: 1, padding: '12px', borderRadius: '10px', border: '1px solid #e3ebf6', background: 'transparent', color: '#56647d', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
                Close
              </button>
              {infoModal.onAction && (
                <button onClick={() => { setInfoModal(null); infoModal.onAction?.() }} style={{ flex: 1, padding: '12px', borderRadius: '10px', border: 'none', background: AMBER, color: NAVY, fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}>
                  {infoModal.actionLabel || 'OK'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Cancel Confirm Modal */}
      {cancelTarget && (
        <div onClick={() => setCancelTarget(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(14,29,59,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: '20px', border: '1px solid #e3ebf6', padding: '32px', maxWidth: '380px', width: '100%' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase', color: '#c0392b', marginBottom: '8px' }}>{t(cancelTarget.type === 'reject' ? 'dash.cancelModal.eyebrowReject' : 'dash.cancelModal.eyebrowCancel')}</div>
            <div style={{ fontFamily: 'var(--font-display), serif', fontSize: '20px', fontWeight: 900, color: '#16294a', marginBottom: '16px' }}>{t(cancelTarget.type === 'reject' ? 'dash.cancelModal.titleReject' : 'dash.cancelModal.titleCancel')}</div>
            <div style={{ background: '#f6f9fd', borderRadius: '10px', padding: '14px 16px', marginBottom: '20px' }}>
              <div style={{ fontSize: '14px', fontWeight: 600, color: '#16294a', marginBottom: '4px' }}>{cancelTarget.courseTypeId ? tDb(locale, 'course_types', cancelTarget.courseTypeId, cancelTarget.courseName) : cancelTarget.courseName}</div>
              <div style={{ fontSize: '12px', color: '#56647d' }}>{cancelTarget.date} · {cancelTarget.time}</div>
            </div>
            <p style={{ fontSize: '13px', color: '#56647d', lineHeight: 1.6, marginBottom: '24px' }}>
              {cancelTarget.type === 'reject'
                ? t('dash.cancelModal.bodyReject')
                : cancelTarget.isLate
                ? t('dash.cancelModal.bodyLatePoints', { n: cancelTarget.points ?? 0, left: wallet?.forgiveness ?? 0 })
                : t('dash.cancelModal.bodyNormalPoints', { n: cancelTarget.points ?? 0 })}
            </p>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={() => setCancelTarget(null)} style={{ flex: 1, padding: '12px', borderRadius: '10px', border: '1px solid #e3ebf6', background: 'transparent', color: '#56647d', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
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
        <div onClick={() => setRescheduleTarget(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(14,29,59,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: '20px', border: '1px solid #e3ebf6', padding: '32px', maxWidth: '380px', width: '100%' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase', color: GOLD, marginBottom: '8px' }}>{t('dash.resModal.eyebrow')}</div>
            <div style={{ fontFamily: 'var(--font-display), serif', fontSize: '20px', fontWeight: 900, color: '#16294a', marginBottom: '16px' }}>{t('dash.resModal.title')}</div>
            <div style={{ background: '#f6f9fd', borderRadius: '10px', padding: '14px 16px', marginBottom: '20px' }}>
              <div style={{ fontSize: '14px', fontWeight: 600, color: '#16294a', marginBottom: '4px' }}>{rescheduleTarget.courseTypeId ? tDb(locale, 'course_types', rescheduleTarget.courseTypeId, rescheduleTarget.courseName) : rescheduleTarget.courseName}</div>
              <div style={{ fontSize: '12px', color: '#56647d' }}>{rescheduleTarget.date} · {rescheduleTarget.time}</div>
            </div>
            <p style={{ fontSize: '13px', color: '#56647d', lineHeight: 1.6, marginBottom: '24px' }}>
              {t('dash.resModal.body')}
            </p>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={() => setRescheduleTarget(null)} style={{ flex: 1, padding: '12px', borderRadius: '10px', border: '1px solid #e3ebf6', background: 'transparent', color: '#56647d', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
                {t('dash.cancelModal.keepLesson')}
              </button>
              <button onClick={confirmReschedule} style={{ flex: 1, padding: '12px', borderRadius: '10px', border: 'none', background: AMBER, color: NAVY, fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}>
                {t('dash.resModal.confirm')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* GREETING -- the site's dark top, kept short: this is a working page. */}
      <header className="msa-hello">
        <div className="msa-hello-in">
          <div style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '2.5px', textTransform: 'uppercase', color: BRAND.yellow, marginBottom: '8px' }}>
            {(() => { const d = new Date(); return t('date.header', { weekday: t('date.weekday.' + d.getDay()), month: t('date.month.' + (d.getMonth() + 1)), day: d.getDate() }) })()}
          </div>
          <h1>
            {t('dash.greeting.' + greeting)}<em style={{ fontStyle: locale.startsWith('zh') ? 'normal' : 'italic' }}>{parent?.first_name}{t('dash.greeting.bang')}</em>
          </h1>
          <p style={{ fontSize: '15px', color: 'rgba(255,255,255,0.78)', margin: '8px 0 0' }}>{t('dash.summary')}</p>
        </div>
      </header>

<div style={{ maxWidth: '1100px', margin: '0 auto', padding: 'clamp(24px,4vw,40px) clamp(20px,5vw,48px) clamp(40px,5vw,64px)' }}>

        {/* STUDENTS */}
        <section style={{ marginBottom: '36px' }}>
          <h2 className="msa-sec-h">{t('dash.mySwimmers')}</h2>
          <Rail variant="students" count={students.length + (students.length < MAX_SWIMMERS ? 1 : 0)}>
            {students.map((student) => {
              const hasLevel = student.current_level && Number(student.current_level) >= 1
              const levelColor = hasLevel ? (LEVEL_COLORS[String(student.current_level)] || GOLD) : '#c9d3e3'
              const levelName = hasLevel ? t(`level.${Number(student.current_level)}.name`) : null
              const age = student.date_of_birth ? getAge(student.date_of_birth) : null
              const ageMonths = student.date_of_birth && age === 0 ? getAgeMonths(student.date_of_birth) : null
              const ageLabel = age === null ? t('dash.ageUnknown') : age >= 1 ? t('dash.age', { n: age }) : ageMonths !== null && ageMonths >= 1 ? t(ageMonths === 1 ? 'dash.ageMonth' : 'dash.ageMonths', { n: ageMonths }) : t('dash.ageNewborn')
              return (
                <div key={student.id} className="msa-card" style={{ background: '#fff', borderRadius: '16px', padding: '24px', position: 'relative', overflow: 'hidden' }}>
                  <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '3px', background: levelColor }} />
                  <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                    <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: levelColor, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-display), serif', fontSize: '18px', fontWeight: 900, color: '#fff', flexShrink: 0 }}>
                      {getInitials(student.full_name)}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '16px', fontWeight: 700, color: '#16294a', marginBottom: '2px' }}>{student.full_name}</div>
                      <div style={{ fontSize: '12px', color: '#56647d' }}>
                        {ageLabel}
                        {student.gender === 'male' ? ' · 👦' : student.gender === 'female' ? ' · 👧' : ''}
                      </div>
                    </div>
                    {/* Check-in sits beside the name it belongs to: a family
                        with two swimmers used to scroll to the bottom of each
                        card to find the right one, on the pool deck, holding
                        a towel. Outlined rather than filled, so it does not
                        compete with the card's main button. */}
                    <button className="tap-auto" onClick={() => setQrStudent(student)}
                      aria-label={t('dash.viewQr')}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 12px',
                        borderRadius: '10px', border: `1px solid ${GOLD}75`, background: `${GOLD}14`, color: GOLD,
                        fontSize: '12px', fontWeight: 700, cursor: 'pointer', flexShrink: 0, whiteSpace: 'nowrap' }}>
                      <svg width="15" height="15" viewBox="0 0 20 20" aria-hidden="true"><path d="M3 3h5v5H3zM12 3h5v5h-5zM3 12h5v5H3z" fill="none" stroke="currentColor" strokeWidth="1.7" /><path d="M12 12h2v2h-2zM15 15h2v2h-2zM15 12h2v2h-2zM12 15h2v2h-2z" fill="currentColor" /></svg>
                      {t('dash.checkIn')}
                    </button>
                  </div>
                  {!hasLevel && (
                    <div style={{ marginTop: '16px', background: '#f6f9fd', border: '1px solid #e3ebf6', borderRadius: '10px', padding: '12px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div>
                        <div style={{ fontSize: '10px', fontWeight: 600, letterSpacing: '1.5px', textTransform: 'uppercase', color: '#56647d', marginBottom: '2px' }}>{t('dash.currentLevel')}</div>
                        <div style={{ fontSize: '14px', fontWeight: 700, color: '#56647d' }}>{t('dash.pendingAssessment')}</div>
                      </div>
                      <div style={{ fontSize: '20px' }}>📋</div>
                    </div>
                  )}

                  {!hasLevel && pastBookings.some(b => b.student_id === student.id) && (
                    <button className="tap-auto" onClick={() => { setRecordsFor(student); setRecordsPage(0) }}
                      style={{ width: '100%', marginTop: '14px', padding: '11px', borderRadius: '10px',
                        border: '1px solid #e3ebf6', background: '#f6f9fd',
                        color: '#16294a', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}>
                      {t('dash.records')}
                    </button>
                  )}

                  {hasLevel && (() => {
                    const prog: StudentProgress = studentProgressMap[student.id] || { student_id: student.id, records: [], stages: [], stageSkills: [], allPercents: {} }
                    const lvl = Number(student.current_level)
                    const stages: StageProgress[] = prog.stages.length === 3
                      ? prog.stages
                      : [1, 2, 3].map(n => ({ stage: n as 1 | 2 | 3, percent: 0, complete: false, skillCount: 0 }))
                    const curStage = resolveStage(student.current_stage, stages)
                    const curPct = stages[curStage - 1]?.percent ?? 0
                    /* One level line, one stage line, one bar, two buttons. The
                       three stage buttons and the skill list they opened said the
                       same thing the learning map says, a second time and smaller;
                       the map is one tap away and says it properly. */
                    return (
                      <div style={{ marginTop: '18px' }}>
                        <div style={{ fontSize: '14px', fontWeight: 700, color: '#16294a' }}>
                          {t('level.badge', { n: student.current_level ?? '', name: levelName || '' })}
                        </div>
                        <div style={{ fontSize: '12px', color: '#56647d', marginTop: '3px' }}>
                          {t('dash.stageN', { n: curStage })} · {t(stageNameKey(lvl, curStage))}
                        </div>
                        <div style={{ height: '6px', background: '#eef2f8', borderRadius: '3px', overflow: 'hidden', marginTop: '14px' }}>
                          <div style={{ height: '100%', width: curPct + '%', background: AMBER, borderRadius: '3px', transition: 'width .3s ease' }} />
                        </div>
                        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginTop: '6px' }}>
                          <span style={{ fontSize: '11px', color: '#56647d' }}>{t('dash.stageCompletion')}</span>
                          <b style={{ fontSize: '12px', color: GOLD }}>{curPct}%</b>
                        </div>
                        <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
                          <button className="tap-auto"
                            onClick={() => setTreeFor({ name: student.full_name, level: lvl, stage: curStage, percents: prog.allPercents })}
                            style={{ flex: 1, padding: '11px 6px', borderRadius: '10px', border: 'none', background: NAVY,
                              color: '#fff', fontSize: '13px', fontWeight: 800, cursor: 'pointer' }}>
                            {t('dash.skillTree')}
                          </button>
                          <button className="tap-auto"
                            onClick={() => { setRecordsFor(student); setRecordsPage(0) }}
                            style={{ flex: 1, padding: '11px 6px', borderRadius: '10px', border: '1px solid #e3ebf6',
                              background: '#f6f9fd', color: '#16294a', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}>
                            {t('dash.records')}
                          </button>
                        </div>
                      </div>
                    )
                  })()}
                </div>
              )
            })}
            {/* Adding a child used to live only on the account page, behind a
                footer link. A parent looking to add one looks next to the
                children they already have. Gone at the limit the account page
                enforces. */}
            {students.length < MAX_SWIMMERS && (
              <Link href="/dashboard/account?add=1" className="msa-addkid">
                <span className="msa-addkid-plus">+</span>
                <span>{t('account.addSwimmer')}</span>
              </Link>
            )}
          </Rail>

          {/* The two things a family comes here to do most, under the
              children they are doing them for. Points open a sheet with the
              whole card -- balance, history, swim team -- so none of it
              is lost, it just stops taking a screen of its own. */}
          <div className="msa-act">
            <button className="tap-auto msa-act-book" onClick={() => { window.location.href = '/booking' }}>
              + {t('quick.book')}
            </button>
            {wallet && (
              <button className={'tap-auto msa-act-pts msa-card' + ((wallet.arrears > 0 || wallet.balance < 0) ? ' owe' : '')}
                onClick={() => setPointsOpen(true)}>
                <span><b>{wallet.balancePurchased.toLocaleString()}</b> {t('dash.pointsUnit')}</span>
                {/* Bonus points apart from purchased ones, in their own colour. */}
                {wallet.balanceGranted > 0 && (
                  <span className="msa-gift">{t('dash.pointsGift', { n: wallet.balanceGranted.toLocaleString() })}</span>
                )}
                <em>{t('dash.topUp')} ›</em>
              </button>
            )}
          </div>
          {/* Booking with another family is a way of booking, so it sits under
              the booking button. An invitation already surfaces at the top of
              the page when there is one. */}
          <p className="msa-partner">
            {t('dash.partnerPrompt')}{' '}
            <Link href="/dashboard/partnerships">{t('quick.partnerships')} ›</Link>
          </p>
          {/* Refer a friend: one quiet line, opening the points sheet at the
              referral card. Without it almost nobody would find the offer. */}
          {wallet && (
            <p className="msa-partner msa-refer">
              {t('ref.prompt')}{' '}
              <a href="#" onClick={e => { e.preventDefault(); setReferralFocus(true); setPointsOpen(true) }}>{t('ref.promptLink', { n: REFERRAL_POINTS })} ›</a>
            </p>
          )}
        </section>

        {/* Pending partner bookings notice */}
        {pendingPartnerBookings.length > 0 && (
          <section style={{ marginBottom: '28px' }}>
            <h2 className="msa-sec-h">⏳ {t('dash.invite.section')}</h2>
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
                // What accepting costs THIS family: their own seat, priced from
                // the live price list.
                let inviteCost: number | null = null
                if (wallet && ct?.slug && cs?.session_date && cs?.start_time) {
                  try {
                    inviteCost = priceLesson({
                      courseSlug: ct.slug, minutes: 30,
                      sessionDate: cs.session_date,
                      startTime: String(cs.start_time).slice(0, 5),
                      seats: 1,
                    }).perSeat * (b._seats || 1)
                  } catch { inviteCost = null }
                }
                return (
                  <div key={b.id} style={{ background: '#f3effc', border: '1px solid #d6cbf2', borderRadius: '14px', padding: '16px 20px' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
                      <div>
                        <div style={{ fontSize: '11px', color: '#6d4fc2', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '4px' }}>🔔 {t('dash.invite.badge')}</div>
                        <div style={{ fontSize: '14px', fontWeight: 700, color: '#16294a', marginBottom: '2px' }}>
                          {t('dash.invite.line', { name: student?.full_name || '' })}
                        </div>
                        <div style={{ fontSize: '12px', color: '#56647d', marginBottom: '2px' }}>
                          {ct?.id ? tDb(locale, 'course_types', ct.id, ct.name) : ct?.name} · {coach?.first_name} · {cs?.session_date ? formatDate(cs.session_date) : ''} {cs?.start_time ? formatTime(cs.start_time) : ''}{b._endTime ? ` – ${formatTime(b._endTime)}` : ''}
                        </div>
                        <div style={{ fontSize: '11px', color: minsLeft <= 3 ? '#c0392b' : '#56647d' }}>
                          ⏱ {t('dash.invite.countdown', { time: countdownStr })}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                        <button
                          onClick={() => setCancelTarget({ id: b.id, courseName: ct?.name || 'Lesson', date: formatDate(cs?.session_date || ''), time: formatTime(cs?.start_time || ''), type: 'reject' })}
                          disabled={rejectingId === b.id || confirmingId === b.id}
                          style={{ padding: '8px 16px', background: '#fdecea', border: '1px solid #f5c2bd', borderRadius: '8px', color: '#c0392b', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>
                          {rejectingId === b.id ? '...' : t('dash.invite.decline')}
                        </button>
                        <button
                          onClick={() => confirmPartnerBooking(b.id)}
                          disabled={confirmingId === b.id || rejectingId === b.id}
                          style={{ padding: '8px 16px', background: '#7b61c4', border: 'none', borderRadius: '8px', color: '#fff', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}>
                          {confirmingId === b.id
                            ? t('dash.invite.confirming')
                            : inviteCost != null
                            ? t('dash.invite.confirmPoints', { n: inviteCost })
                            : t('dash.invite.confirmPlain')}
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
        <div onClick={() => setRescheduleActionModal(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(14,29,59,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: '20px', border: '1px solid #e3ebf6', padding: '32px', maxWidth: '380px', width: '100%' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase', color: GOLD, marginBottom: '8px' }}>{t('dash.resAction.eyebrow')}</div>
            <div style={{ fontFamily: 'var(--font-display), serif', fontSize: '20px', fontWeight: 900, color: '#16294a', marginBottom: '16px' }}>{rescheduleActionModal.title}</div>
            <p style={{ fontSize: '13px', color: '#56647d', lineHeight: 1.6, marginBottom: '24px' }}>{rescheduleActionModal.message}</p>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={() => setRescheduleActionModal(null)} style={{ flex: 1, padding: '12px', borderRadius: '10px', border: '1px solid #e3ebf6', background: 'transparent', color: '#56647d', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>{t('dash.up.cancel')}</button>
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
            <h2 className="msa-sec-h" style={{ margin: 0 }}>{t('dash.upcomingLessons')}</h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ display: 'inline-flex', border: '1px solid #e3ebf6', borderRadius: '8px', overflow: 'hidden' }}>
                {(['list', 'month'] as const).map(v => (
                  <button key={v} onClick={() => setLessonView(v)}
                    style={{ padding: '6px 14px', fontSize: '12px', fontWeight: 700, border: 'none', cursor: 'pointer',
                      background: lessonView === v ? NAVY : '#fff',
                      color: lessonView === v ? '#fff' : '#56647d' }}>
                    {v === 'list' ? t('dash.viewList') : t('dash.viewMonth')}</button>
                ))}
              </div>
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
                    style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.25)', borderRadius: '8px', padding: '6px 14px', fontSize: '13px', fontWeight: 600, color: '#fff', cursor: 'pointer' }}>‹ Prev</button>
                  <span style={{ fontSize: '15px', fontWeight: 800, color: '#fff' }}>{MONTH_NAMES[lvMonth]} {lvYear}</span>
                  <button onClick={() => { if (lvMonth === 11) { setLvMonth(0); setLvYear(lvYear + 1) } else setLvMonth(lvMonth + 1) }}
                    style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.25)', borderRadius: '8px', padding: '6px 14px', fontSize: '13px', fontWeight: 600, color: '#fff', cursor: 'pointer' }}>Next ›</button>
                </div>
                {students.length > 1 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 14px', marginBottom: '10px', background: '#fff', borderRadius: '10px', padding: '6px 12px', width: 'fit-content' }}>
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
                    <div key={d} style={{ textAlign: 'center', fontSize: '10px', fontWeight: 700, letterSpacing: '1px', color: 'rgba(255,255,255,0.7)', padding: '4px 0' }}>{d}</div>
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
                        style={{ cursor: dayBookings.length > 0 ? 'pointer' : 'default', backgroundColor: '#fff', backgroundImage: isPast ? 'repeating-linear-gradient(135deg, rgba(18,37,74,0.05) 0px, rgba(18,37,74,0.05) 2px, transparent 2px, transparent 10px)' : 'none', border: `1px solid ${isTodayCell ? GOLD + '66' : '#e3ebf6'}`, borderRadius: '8px', padding: '5px 3px', minHeight: '76px', minWidth: 0 }}>
                        <div style={{ textAlign: 'center', fontSize: '12px', fontWeight: 700, marginBottom: '4px', color: isTodayCell ? GOLD : isPast ? '#9aa6ba' : dayBookings.length > 0 ? '#16294a' : '#56647d' }}>{i + 1}</div>
                        {/* Three at most. A busy Tuesday had six, which made one cell
                            three times the height of its neighbours and pushed the rest of
                            the month off the screen. The rest are one tap away. */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                          {dayBookings.slice(0, MAX_PER_DAY).map((b, j) => (
                            <button key={b.id + j} onClick={e => { e.stopPropagation(); setLessonDetail(b) }} style={{ padding: '3px 2px', borderRadius: '5px', cursor: 'pointer', width: '100%', minWidth: 0, textAlign: 'center',
                              border: `1px solid ${isPast ? '#e3ebf6' : GOLD + '55'}`,
                              background: isPast ? '#f6f9fd' : `${GOLD}14` }}>
                              <span style={{ display: 'block', fontSize: '9.5px', fontWeight: 800, letterSpacing: '-0.3px', whiteSpace: 'nowrap', color: isPast ? '#56647d' : '#16294a' }}>
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
                                fontSize: '9.5px', fontWeight: 800, color: '#56647d',
                                background: '#f6f9fd', border: '1px solid #e3ebf6' }}>
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
                      style={{ position: 'fixed', inset: 0, background: 'rgba(14,29,59,0.55)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
                      <div className="msa-sheet" onClick={e => e.stopPropagation()}
                        style={{ background: '#fff', border: '1px solid #e3ebf6', borderRadius: '16px', padding: '18px 20px 24px', width: '100%', maxWidth: '420px', maxHeight: '78vh', overflowY: 'auto' }}>
                        <div style={{ width: '38px', height: '4px', borderRadius: '2px', background: '#eef2f8', margin: '0 auto 14px' }} />
                        <div style={{ fontFamily: 'var(--font-display), serif', fontSize: '19px', fontWeight: 700, color: '#16294a' }}>{dateStr}</div>
                        <div style={{ fontSize: '12px', color: '#56647d', marginBottom: '14px' }}>
                          {t(rows.length === 1 ? 'dash.day.oneLesson' : 'dash.day.nLessons', { n: rows.length })}
                        </div>
                        {rows.map((b, j) => (
                          <button key={b.id + j} onClick={() => { setDaySheet(null); setLessonDetail(b) }}
                            style={{ display: 'flex', alignItems: 'center', gap: '12px', width: '100%', textAlign: 'left', cursor: 'pointer',
                              padding: '11px 12px', borderRadius: '12px', marginBottom: '8px',
                              background: '#f6f9fd', border: '1px solid #e3ebf6' }}>
                            <span style={{ fontSize: '13px', fontWeight: 800, whiteSpace: 'nowrap', minWidth: '66px', color: '#16294a' }}>{t12(b.start_time)}</span>
                            <span style={{ minWidth: 0, flex: 1 }}>
                              <span style={{ display: 'block', fontSize: '12px', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: swimmerColor(b.student_name) }}>{b.student_name || '—'}</span>
                              <span style={{ display: 'block', fontSize: '11px', color: '#56647d', marginTop: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {b.coach_name ? t('dash.up.coach', { name: b.coach_name }) : ''}{b.coach_name && b.course_name ? ' · ' : ''}{b.course_type_id ? tDb(locale, 'course_types', b.course_type_id, b.course_name) : b.course_name}
                              </span>
                            </span>
                            <span style={{ color: '#9aa6ba', fontSize: '15px', flexShrink: 0 }}>›</span>
                          </button>
                        ))}
                        <button onClick={() => setDaySheet(null)}
                          style={{ marginTop: '10px', width: '100%', padding: '12px', background: 'transparent', border: '1px solid #e3ebf6', borderRadius: '10px', color: '#56647d', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}>{t('common.close')}</button>
                      </div>
                    </div>
                  )
                })()}
                {lessonDetail && (() => {
                  const b = lessonDetail
                  const past = !!(b.session_date && b.session_date < todayDs)
                  const dateStr = b.session_date ? new Date(b.session_date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) : ''
                  const statusLabel = past ? (b.checked_in ? t('status.attended') : t('status.absent')) : b.checked_in ? t('status.checkedIn') : t('status.confirmed')
                  const statusColor = past ? (b.checked_in ? '#1f7a57' : '#c0392b') : b.checked_in ? '#1f7a57' : GOLD
                  const funding = b.is_trial ? t('common.assessment') : b.points_charged != null ? t('points.unit', { n: b.points_charged }) : '—'
                  return (
                    <div onClick={() => setLessonDetail(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(14,29,59,0.55)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
                      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', border: '1px solid #e3ebf6', borderRadius: '16px', padding: '24px', width: '100%', maxWidth: '380px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                          <div>
                            <div style={{ fontSize: '17px', fontWeight: 700, color: '#16294a' }}>{(b.course_type_id ? tDb(locale, 'course_types', b.course_type_id, b.course_name) : b.course_name) || 'Lesson'}</div>
                            {b.level_min != null && b.level_max != null && (
                              <div style={{ fontSize: '12px', color: '#56647d', marginTop: '2px' }}>Level {b.level_min}–{b.level_max} Group</div>
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
                          <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 0', borderBottom: '1px solid #e3ebf6' }}>
                            <span style={{ fontSize: '13px', color: '#56647d' }}>{row.label}</span>
                            <span style={{ fontSize: '13px', fontWeight: 600, color: '#16294a', textAlign: 'right' }}>{row.value}</span>
                          </div>
                        ))}
                        <button onClick={() => setLessonDetail(null)}
                          style={{ marginTop: '18px', width: '100%', padding: '12px', background: '#fff', border: '1px solid #d5e0ef', borderRadius: '10px', color: '#16294a', fontSize: '13px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', cursor: 'pointer' }}>Close</button>
                      </div>
                    </div>
                  )
                })()}
              </div>
            )
          })() : upcomingBookings.length === 0 ? (
            <div className="msa-card" style={{ background: '#fff', borderRadius: '14px', padding: '32px', textAlign: 'center' }}>
              <div style={{ fontSize: '28px', marginBottom: '10px' }}>📅</div>
              <p style={{ fontSize: '14px', color: '#56647d', margin: 0 }}>{t('dash.noUpcoming')}</p>
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
                        <span style={{ fontSize: '13px', fontWeight: 800, color: du === 0 ? BRAND.yellow : '#fff' }}>
                          {dd.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
                        </span>
                        {du === 0 && <span style={{ fontSize: '10px', fontWeight: 700, background: AMBER, color: NAVY, borderRadius: '10px', padding: '2px 8px' }}>{t('dash.up.today')}</span>}
                        {du === 1 && <span style={{ fontSize: '10px', fontWeight: 700, background: 'rgba(255,255,255,0.14)', color: '#fff', borderRadius: '10px', padding: '2px 8px' }}>{t('dash.up.tomorrow')}</span>}
                        <span style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.18)' }} />
                        <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.65)', whiteSpace: 'nowrap' }}>
                          {t(day.items.length === 1 ? 'dash.day.oneLesson' : 'dash.day.nLessons', { n: day.items.length })}
                        </span>
                      </div>
                      {day.items.map((booking) => {
                const daysUntil = getDaysUntil(booking.session_date)
                const isToday = daysUntil === 0
                const isTomorrow = daysUntil === 1
                const statusColor = (booking.pending_action === 'reschedule' || booking.pending_action === 'reschedule_initiator') ? GOLD : (STATUS_COLORS[booking.status] || GOLD)
                return (
                  <div key={booking.id} className="msa-lesson msa-card" style={{ background: '#fff', border: `1px solid ${isToday ? BRAND.amber : 'transparent'}` }}>
                    <div className="msa-lesson-date" style={{ background: isToday ? AMBER : '#f6f9fd' }}>
                      <div style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: isToday ? NAVY : '#56647d' }}>
                        {new Date(booking.session_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short' })}
                      </div>
                      <div style={{ fontSize: '20px', fontWeight: 900, color: isToday ? NAVY : '#16294a', lineHeight: 1 }}>
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
                        {isToday && <span className="msa-lesson-daybadge" style={{ fontSize: '10px', fontWeight: 700, background: AMBER, color: NAVY, borderRadius: '10px', padding: '2px 8px' }}>{t('dash.up.today')}</span>}
                        {isTomorrow && <span className="msa-lesson-daybadge" style={{ fontSize: '10px', fontWeight: 700, background: '#eef2f8', color: '#56647d', borderRadius: '10px', padding: '2px 8px' }}>{t('dash.up.tomorrow')}</span>}
                        {booking._group && <span className="msa-lesson-status-inline msa-lesson-pill">
                          {(() => {
                            if (booking.checked_in) return <span style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: '#1f7a57', background: '#e6f4ee', border: '1px solid #b7e0cc', borderRadius: '20px', padding: '3px 10px' }}>&#10003; {t('dash.up.checkedIn')}</span>
                            if (booking.session_date !== getTodayLA()) return null
                            const [sh, sm] = booking.start_time.split(':').map(Number)
                            const [eh, em] = booking.end_time.split(':').map(Number)
                            const nowMin = getNowMinutesLA()
                            if (nowMin >= sh * 60 + sm - 30 && nowMin < eh * 60 + em) return <span style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: GOLD, background: `${GOLD}18`, border: `1px solid ${GOLD}40`, borderRadius: '20px', padding: '3px 10px' }}>{t('dash.up.checkinOpen')}</span>
                            if (nowMin < sh * 60 + sm - 30) return <span style={{ fontSize: '10px', color: '#56647d', whiteSpace: 'nowrap' }}>{t('dash.up.checkinSoon')}</span>
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
                            <span style={{ color: '#56647d', textDecoration: 'line-through' }}>{t('dash.up.coach', { name: booking.coach_name })}</span>
                            {booking.student_name ? <span style={{ color: '#9aa6ba', textDecoration: 'line-through' }}> · ({booking.student_name})</span> : ''}
                          </div>
                          <span style={{ color: '#56647d', fontSize: '14px' }}>→</span>
                          <div style={{ fontSize: '13px', fontWeight: 700 }}>
                            <span style={{ color: GOLD }}>{t('dash.up.coach', { name: booking.new_coach_name })}</span>
                            {booking.student_name ? <span style={{ color: '#1d6fa5' }}> · ({booking.student_name})</span> : ''}
                          </div>
                        </div>
                      ) : booking._group ? (
                        <div style={{ marginBottom: '2px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          {booking._group.map((m, mi) => {
                            const late = isWithin24Hours(m.session_date, m.start_time) || daysUntil < 1
                            const lateOk = late && m.points_charged != null && !m.partner_booking_id && m.course_slug !== '1on2' && (wallet?.forgiveness ?? 0) > 0
                            const cEnabled = (!late || lateOk) && cancellingId !== m.id && m.status !== 'pending_partner'
                            const rDis = reschedulingId === m.id || isWithin24Hours(m.session_date, m.start_time) || m.status === 'pending_partner'
                            // Two siblings in a 1-on-2 are one lesson: cancelling
                            // takes both seats and refunds both. This card groups
                            // by session, so the pair's points are the group's --
                            // quoting one seat's 47 for a 94-point refund would
                            // have undersold every cancellation.
                            const refundPts = (m.course_slug === '1on2' && !booking._hour)
                              ? (booking._group || []).filter(x => x.course_slug === '1on2' && x.status !== 'cancelled')
                                  .reduce((a, x) => a + (x.points_charged ?? 0), 0)
                              : (m.points_charged ?? 0)
                            return (
                              <div key={m.id} className="msa-lesson-row" style={{ paddingTop: mi > 0 ? '8px' : undefined, borderTop: mi > 0 && m.course_slug !== '1on2' ? '1px solid #e3ebf6' : 'none' }}>
                                <div style={{ minWidth: 0 }}>
                                  <div style={{ fontSize: '15px', fontWeight: 800, letterSpacing: '-0.2px', color: swimmerColor(m.student_name) }}>{m.student_name || '—'}</div>
                                  <div style={{ fontSize: '12px', color: '#56647d', marginTop: '1px' }}>
                                    {formatTime(m.start_time)} — {formatTime(m.end_time)} · {t('dash.up.coach', { name: m.coach_name })}
                                  </div>
                                </div>
                                {(m.course_slug === '1on2' && mi > 0) ? null : (
                                  <div className="msa-lesson-actions">
                                    <button
                                      onClick={() => setRescheduleTarget({ id: m.id, slug: m.course_slug || '', studentId: m.student_id || '', courseName: m.course_name, courseTypeId: m.course_type_id, date: formatDate(m.session_date), time: formatTime(m.start_time), partnerBookingId: m.partner_booking_id, groupId: m.lesson_group_id })}
                                      disabled={rDis}
                                      style={{ padding: '4px 10px', borderRadius: '8px', border: rDis ? '1px solid #e3ebf6' : '1px solid #c9d8ee', background: 'transparent', color: rDis ? '#9aa6ba' : GOLD, fontSize: '10px', fontWeight: 600, cursor: rDis ? 'not-allowed' : 'pointer' }}>
                                      {reschedulingId === m.id ? '...' : t('dash.up.reschedule')}
                                    </button>
                                    {cEnabled ? (
                                      <button
                                        onClick={() => setCancelTarget({ id: m.id, courseName: m.course_name, courseTypeId: m.course_type_id, date: formatDate(m.session_date), time: formatTime(m.start_time), isLate: late, points: refundPts })}
                                        style={{ padding: '4px 10px', borderRadius: '8px', border: late ? '1px solid #f3cfae' : '1px solid #f5c2bd', background: 'transparent', color: late ? '#c2621a' : '#c0392b', fontSize: '10px', fontWeight: 600, cursor: 'pointer' }}>
                                        {cancellingId === m.id ? '...' : late ? t('dash.up.cancelLate') : t('dash.up.cancel')}
                                      </button>
                                    ) : late ? (
                                      <button
                                        onClick={() => openChatOr(lateLockHelp(m))}
                                        title={lateLockHelp(m)}
                                        style={{ padding: '4px 10px', borderRadius: '8px', border: '1px solid #e3ebf6', background: 'transparent', color: '#56647d', fontSize: '10px', fontWeight: 600, cursor: 'pointer' }}>
                                        {t('dash.up.cancelLocked')}
                                      </button>
                                    ) : (
                                      <div style={{ padding: '4px 10px', borderRadius: '8px', border: '1px solid #e3ebf6', color: '#9aa6ba', fontSize: '10px', fontWeight: 600, cursor: 'not-allowed' }}>{t('dash.up.cancel')}</div>
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
                            <span style={{ fontSize: '12px', color: '#56647d', textDecoration: 'line-through' }}>{formatTime(booking.start_time)} — {formatTime(booking.end_time)} · {formatDate(booking.session_date)}</span>
                            <span style={{ color: '#56647d', fontSize: '14px' }}>→</span>
                            <span style={{ fontSize: '12px', color: '#56647d' }}>{formatTime(booking.new_start_time)} — {formatTime(booking.new_end_time || '')} · {formatDate(booking.new_session_date || '')}</span>
                          </div>
                          {booking.pending_expires_at && (() => {
                            const ms = Math.max(0, new Date(booking.pending_expires_at).getTime() - now)
                            const mins = Math.floor(ms / 60000)
                            const secs = Math.floor((ms % 60000) / 1000)
                            const str = ms <= 0 ? t('dash.up.expired') : `${mins}:${String(secs).padStart(2, '0')}`
                            return <div style={{ fontSize: '11px', color: mins < 3 ? '#c0392b' : GOLD, marginTop: '2px' }}>⏱ {t('dash.up.rescheduleCountdown', { time: str })}</div>
                          })()}
                        </div>
                      ) : (
                        <div>
                          {(booking.pending_action === 'reschedule' || booking.pending_action === 'reschedule_initiator') && booking.pending_expires_at && (() => {
                            const ms = Math.max(0, new Date(booking.pending_expires_at).getTime() - now)
                            const mins = Math.floor(ms / 60000)
                            const secs = Math.floor((ms % 60000) / 1000)
                            const str = ms <= 0 ? t('dash.up.expired') : `${mins}:${String(secs).padStart(2, '0')}`
                            return <div style={{ fontSize: '11px', color: mins < 3 ? '#c0392b' : GOLD, marginTop: '2px' }}>⏱ {t('dash.up.rescheduleCountdown', { time: str })}</div>
                          })()}
                        {booking.status === 'pending_partner' && booking.pending_expires_at && (() => {
                            const ms = Math.max(0, new Date(booking.pending_expires_at).getTime() - now)
                            const mins = Math.floor(ms / 60000)
                            const secs = Math.floor((ms % 60000) / 1000)
                            const str = ms <= 0 ? t('dash.up.expired') : `${mins}:${String(secs).padStart(2, '0')}`
                            return <div style={{ fontSize: '11px', color: mins < 3 ? '#c0392b' : GOLD, marginTop: '2px' }}>⏱ {t('dash.up.partnerCountdown', { time: str })}</div>
                          })()}
                        </div>
                      )}
                    </div>
                    <div className="msa-lesson-side" style={{ display: booking._group ? 'none' : 'flex' }}>
                      <div className="msa-lesson-status">
                      {(() => {
                        if (booking.checked_in) return <span style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: '#1f7a57', background: '#e6f4ee', border: '1px solid #b7e0cc', borderRadius: '20px', padding: '3px 10px' }}>&#10003; {t('dash.up.checkedIn')}</span>
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
                            style={{ padding: '6px 12px', borderRadius: '8px', border: '1px solid #b7e0cc', background: 'transparent', color: '#1f7a57', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}>
                            {t('dash.up.acceptReschedule')}
                          </button>
                          <button
                            onClick={async () => {
                              setRescheduleActionModal({ bookingId: booking.id, type: 'reject', title: t('dash.resAction.declineTitle'), message: t('dash.resAction.keepsTime') })
                            }}
                            style={{ padding: '6px 12px', borderRadius: '8px', border: '1px solid #f5c2bd', background: 'transparent', color: '#c0392b', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}>
                            {t('dash.up.decline')}
                          </button>
                          </>}
                          {booking.pending_action === 'reschedule_initiator' && (
                            <button
                              onClick={async () => {
                                setRescheduleActionModal({ bookingId: booking.id, type: 'cancel', title: t('dash.resAction.cancelTitle'), message: t('dash.resAction.keepsTime') })
                              }}
                              style={{ padding: '6px 12px', borderRadius: '8px', border: '1px solid #f5c2bd', background: 'transparent', color: '#c0392b', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}>
                              {t('dash.up.cancelReschedule')}
                            </button>
                          )}
                        </div>
                      ) : booking.status === 'pending_payment' ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                            <div style={{ padding: '6px 12px', borderRadius: '8px', border: '1px solid #c9d8ee', background: '#eef4fc', color: GOLD, fontSize: '11px', fontWeight: 600 }}>
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
                              style={{ padding: '6px 12px', borderRadius: '8px', border: '1px solid #c9d8ee', background: AMBER, color: NAVY, fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}>
                              {pendingPayBusy === booking.id ? '...' : t('dash.pend.payNow')}
                            </button>
                            <button
                              onClick={() => { setPendingPayMsg(''); setPendingCancelConfirm(booking.id) }}
                              disabled={pendingPayBusy === booking.id}
                              style={{ padding: '6px 12px', borderRadius: '8px', border: '1px solid #f5c2bd', background: 'transparent', color: '#c0392b', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}>
                              Cancel
                            </button>
                          </div>
                          {pendingPayMsg && <div style={{ fontSize: '11px', color: '#c0392b' }}>{pendingPayMsg}</div>}
                          {pendingCancelConfirm === booking.id && (
                            <div style={{ position: 'fixed', inset: 0, background: 'rgba(14,29,59,0.55)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
                              <div style={{ background: '#fff', border: '1px solid #e3ebf6', borderRadius: '16px', padding: '24px', maxWidth: '400px', width: '100%' }}>
                                <div style={{ fontSize: '16px', fontWeight: 700, color: '#16294a', marginBottom: '8px' }}>{t('dash.pend.cancelTitle')}</div>
                                <div style={{ fontSize: '13px', color: '#56647d', lineHeight: 1.6, marginBottom: '20px' }}>
                                  {t('dash.pend.cancelBody')}
                                </div>
                                <div style={{ display: 'flex', gap: '10px' }}>
                                  <button
                                    onClick={() => setPendingCancelConfirm(null)}
                                    disabled={pendingPayBusy === booking.id}
                                    style={{ flex: 1, padding: '10px', borderRadius: '10px', border: '1px solid #e3ebf6', background: 'transparent', color: '#56647d', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
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
                          <div style={{ padding: '6px 12px', borderRadius: '8px', border: '1px solid #c9d8ee', background: '#eef4fc', color: GOLD, fontSize: '11px', fontWeight: 600 }}>
                            🛒 {t('dash.cart.held')}
                          </div>
                          <Link href="/booking?cart=1" style={{ padding: '6px 12px', borderRadius: '8px', border: '1px solid #c9d8ee', background: 'transparent', color: GOLD, fontSize: '11px', fontWeight: 600, textDecoration: 'none' }}>
                            {t('dash.cart.view')}
                          </Link>
                        </div>
                      ) : booking._group ? null : (
                        <div className="msa-lesson-actions">
                          <button
                            onClick={() => setRescheduleTarget({ id: booking.id, slug: booking.course_slug || '', studentId: booking.student_id || '', courseName: booking.course_name, courseTypeId: booking.course_type_id, date: formatDate(booking.session_date), time: formatTime(booking.start_time), partnerBookingId: booking.partner_booking_id, groupId: booking.lesson_group_id })}
                            disabled={reschedulingId === booking.id || isWithin24Hours(booking.session_date, booking.start_time) || booking.status === 'pending_partner'}
                            style={{ padding: '6px 12px', borderRadius: '8px', border: reschedulingId === booking.id || isWithin24Hours(booking.session_date, booking.start_time) || booking.status === 'pending_partner' ? '1px solid #e3ebf6' : '1px solid #c9d8ee', background: 'transparent', color: reschedulingId === booking.id || isWithin24Hours(booking.session_date, booking.start_time) || booking.status === 'pending_partner' ? '#9aa6ba' : GOLD, fontSize: '11px', fontWeight: 600, cursor: reschedulingId === booking.id || isWithin24Hours(booking.session_date, booking.start_time) || booking.status === 'pending_partner' ? 'not-allowed' : 'pointer' }}>
                            {reschedulingId === booking.id ? '...' : t('dash.up.reschedule')}
                          </button>
                          {(() => {
                            // A Swim Assessment is paid by card, not out of the
                            // wallet, so there are no points to hand back. The parent
                            // tells us and the front desk cancels it. The API refuses
                            // it too.
                            if (booking.is_trial) return (
                              <button
                                onClick={() => {
                                  const toggle = document.querySelector('[data-chat-toggle]') as HTMLElement | null
                                  if (toggle) toggle.click()
                                  else setNotice(t('dash.up.cancelContactHelp'))
                                }}
                                style={{ padding: '6px 12px', borderRadius: '8px', border: '1px solid #e3ebf6', background: 'transparent', color: '#56647d', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}>
                                {t('dash.up.cancelContact')}
                              </button>
                            )
                            const late = isWithin24Hours(booking.session_date, booking.start_time) || daysUntil < 1
                            const lateOk = late && booking.points_charged != null && !booking.partner_booking_id && booking.course_slug !== '1on2' && (wallet?.forgiveness ?? 0) > 0
                            const enabled = (!late || lateOk) && cancellingId !== booking.id && booking.status !== 'pending_partner'
                            return enabled ? (
                              <button
                                onClick={() => setCancelTarget({ id: booking.id, courseName: booking.course_name, courseTypeId: booking.course_type_id, date: formatDate(booking.session_date), time: formatTime(booking.start_time), isLate: late, points: booking.points_charged })}
                                style={{ padding: '6px 12px', borderRadius: '8px', border: late ? '1px solid #f3cfae' : '1px solid #f5c2bd', background: 'transparent', color: late ? '#c2621a' : '#c0392b', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}>
                                {cancellingId === booking.id ? '...' : late ? t('dash.up.cancelLate') : t('dash.up.cancel')}
                              </button>
                            ) : late ? (
                              <button
                                onClick={() => openChatOr(lateLockHelp(booking))}
                                title={lateLockHelp(booking)}
                                style={{ padding: '6px 12px', borderRadius: '8px', border: '1px solid #e3ebf6', background: 'transparent', color: '#56647d', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}>
                                {t('dash.up.cancelLocked')}
                              </button>
                            ) : (
                              <div style={{ padding: '6px 12px', borderRadius: '8px', border: '1px solid #e3ebf6', background: 'transparent', color: '#9aa6ba', fontSize: '11px', fontWeight: 600, cursor: 'not-allowed' }}>
                                {t('dash.up.cancel')}
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
                    style={{ flex: 1, padding: '10px', background: 'transparent', border: '1px solid #e3ebf6', borderRadius: '10px', color: '#56647d', fontSize: '12px', fontWeight: 600, cursor: 'pointer', letterSpacing: '0.5px' }}>
                    ▼ {t('dash.showMoreDays', { n: Math.min(UPCOMING_STEP, more) })}
                  </button>
                )}
                {dayWindow > UPCOMING_DAYS && (
                  <button onClick={collapseUpcoming}
                    style={{ flex: more > 0 ? '0 0 auto' : 1, padding: '10px 18px', background: 'transparent', border: '1px solid #e3ebf6', borderRadius: '10px', color: '#56647d', fontSize: '12px', fontWeight: 600, cursor: 'pointer', letterSpacing: '0.5px' }}>
                    ▲ {t('dash.collapse')}
                  </button>
                )}
              </div>
            )
          })()}
        </section>

        {/* PARTNER ACCOUNTS */}


      </div>
      <style>{MOBILE_CSS}</style>
      {parent && <ChatWidget parentId={parent.id} />}
      {treeFor && (
        <SkillTree
          studentName={treeFor.name}
          currentLevel={treeFor.level}
          currentStage={treeFor.stage}
          percentBySkillId={treeFor.percents}
          onClose={() => setTreeFor(null)}
        />
      )}
    </div>
  )
}
