/* eslint-disable @typescript-eslint/no-explicit-any */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Hold } from './fixed-classes'
import { getTodayLA, getNowMinutesLA, formatTime12h } from './date'
import { TEAM_SQUAD_CAP } from './team-tiers'
import { sendEmail } from './email'
import { sendSms, SMS_COMPLIANCE_SUFFIX } from './sms'
import { liveOffers } from './waitlist-seats'
export { teamSeatsHeld, teamSeatsHeldAll } from './waitlist-seats'

/* Waitlists (owner, 2026-10-22, tier 2) -- docs/migration-waitlist.sql.

   Three things a family can wait for:
     team   a full Swim Team squad (team_tier_id)
     group  a full 1-on-4 class (class_session_id)
     slot   a coach's time that someone else has booked (coach_id, course,
            slot_date, slot_start, minutes)

   When a place opens, ONLY the first family in line is told -- email and
   text -- and the place is held for them: 12 hours, or 2 hours when the
   lesson is less than 24 hours away (never past 30 minutes before it starts).
   If they do not book in time the offer lapses and the next family is told.

   The hold is enforced where every booking path already looks: an offer for
   a class or a time is a Hold (lib/fixed-classes renewalHolds includes
   waitlistHolds), and an offer for a squad counts as a taken seat
   (teamSeatsHeld). runWaitlist() does the rest; the cleanup cron calls it
   every 15 minutes. */

export type WaitKind = 'team' | 'group' | 'slot'
export type WaitEntry = {
  id: string; parent_id: string; student_id: string; kind: WaitKind
  team_tier_id: string | null; class_session_id: string | null
  coach_id: string | null; course_type_id: string | null
  slot_date: string | null; slot_start: string | null; minutes: number | null
  status: 'waiting' | 'offered' | 'booked' | 'expired' | 'left'
  offered_at: string | null; offer_expires_at: string | null; created_at: string
}

const COLS = 'id, parent_id, student_id, kind, team_tier_id, class_session_id, coach_id, course_type_id, slot_date, slot_start, minutes, status, offered_at, offer_expires_at, created_at'
const LEAD_MIN = 30
const toMin = (t: string) => { const [h, m] = String(t).slice(0, 5).split(':').map(Number); return h * 60 + m }
const missingTable = (e: any) => !!e && (e.code === '42P01' || e.code === 'PGRST205' || /waitlist_entries/.test(e.message || ''))

/** Minutes from now until a date + time (LA). */
function minutesUntil(date: string, hhmm: string): number {
  const days = Math.round((Date.parse(date + 'T00:00:00Z') - Date.parse(getTodayLA() + 'T00:00:00Z')) / 86400000)
  return days * 1440 + toMin(hhmm) - getNowMinutesLA()
}

/** When an offer made now for a lesson at date + start runs out. */
export function offerExpiry(date: string | null, start: string | null, now = new Date()): Date {
  const hours = date && start && minutesUntil(date, start) < 24 * 60 ? 2 : 12
  let until = now.getTime() + hours * 3600_000
  if (date && start) until = Math.min(until, now.getTime() + Math.max(0, minutesUntil(date, start) - LEAD_MIN) * 60_000)
  return new Date(until)
}

const live = (e: WaitEntry, now = Date.now()) => e.status === 'offered' && !!e.offer_expires_at && Date.parse(e.offer_expires_at) > now

/** Class and time offers as holds (lib/fixed-classes Hold), for every booking
 *  path that already respects renewal holds. Never the given family's own. */
export async function waitlistHolds(svc: SupabaseClient, from: string, to: string, exceptParentId?: string | null): Promise<Hold[]> {
  const offers = (await liveOffers(svc)).filter(o => o.parent_id !== exceptParentId && o.kind !== 'team')
  if (!offers.length) return []
  const sessIds = offers.filter(o => o.kind === 'group' && o.class_session_id).map(o => o.class_session_id!) as string[]
  const { data: sess } = sessIds.length
    ? await svc.from('class_sessions').select('id, coach_id, course_type_id, session_date, start_time, end_time').in('id', sessIds)
    : { data: [] as any[] }
  const sById = new Map((sess || []).map((s: any) => [s.id, s]))
  const out: Hold[] = []
  for (const o of offers) {
    if (o.kind === 'group') {
      const s = sById.get(o.class_session_id || '')
      if (!s || s.session_date < from || s.session_date > to) continue
      const startMin = toMin(s.start_time)
      out.push({ source: 'waitlist', parentId: o.parent_id, coachId: s.coach_id, courseTypeId: s.course_type_id, date: s.session_date,
        startMin, endMin: s.end_time ? toMin(s.end_time) : startMin + 30, seats: 1, whole: false, until: o.offer_expires_at || '' })
    } else if (o.slot_date && o.slot_start && o.coach_id && o.course_type_id) {
      if (o.slot_date < from || o.slot_date > to) continue
      const startMin = toMin(o.slot_start)
      out.push({ source: 'waitlist', parentId: o.parent_id, coachId: o.coach_id, courseTypeId: o.course_type_id, date: o.slot_date,
        startMin, endMin: startMin + (o.minutes || 30), seats: 1, whole: true, until: o.offer_expires_at || '' })
    }
  }
  return out
}

const keyOf = (e: WaitEntry) => e.kind === 'team' ? `team|${e.team_tier_id}` : e.kind === 'group' ? `group|${e.class_session_id}`
  : `slot|${e.coach_id}|${e.slot_date}|${String(e.slot_start).slice(0, 5)}|${e.minutes || 30}`

/** Whether the swimmer has got what they waited for, any way at all. */
async function fulfilled(svc: SupabaseClient, e: WaitEntry): Promise<boolean> {
  if (e.kind === 'team') {
    const { count } = await svc.from('team_memberships').select('id', { count: 'exact', head: true })
      .eq('student_id', e.student_id).eq('team_tier_id', e.team_tier_id).in('status', ['active', 'past_due'])
    return (count || 0) > 0
  }
  if (e.kind === 'group') {
    const { count } = await svc.from('bookings').select('id', { count: 'exact', head: true })
      .eq('student_id', e.student_id).eq('class_session_id', e.class_session_id).eq('status', 'confirmed')
    return (count || 0) > 0
  }
  const { data } = await svc.from('bookings')
    .select('id, class_sessions!bookings_class_session_id_fkey(coach_id, session_date, start_time)')
    .eq('student_id', e.student_id).eq('status', 'confirmed')
  return (data || []).some((b: any) => {
    const s = Array.isArray(b.class_sessions) ? b.class_sessions[0] : b.class_sessions
    return s && s.coach_id === e.coach_id && s.session_date === e.slot_date && String(s.start_time).slice(0, 5) === String(e.slot_start).slice(0, 5)
  })
}

/** Whether the coach teaches this course at that time at all: inside their
 *  hours for it (or legacy weekly hours) and not on time off. */
export async function slotTeachable(svc: SupabaseClient, coachId: string, courseTypeId: string, date: string, startHm: string, minutes: number): Promise<boolean> {
  const start = toMin(startHm), end = start + minutes
  const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
  const [{ getCoachBlocks, isBlocked }, { getEffectiveZones, zoneTypeForSlug, legacyHoursFit }, { data: ct }] = await Promise.all([
    import('./availability'), import('./zones'),
    svc.from('course_types').select('slug').eq('id', courseTypeId).maybeSingle(),
  ])
  if (isBlocked(await getCoachBlocks(svc as any, [coachId], date), coachId, hhmm(start), hhmm(end))) return false
  const zones = await getEffectiveZones(svc as any, coachId, date)
  if (zones.legacy) return legacyHoursFit(svc as any, coachId, date, start, end)
  const zt = zoneTypeForSlug(ct?.slug || '1on1')
  return zones.rows.some((z: any) => z.zone_type === zt && toMin(z.start_time) <= start && end <= toMin(z.end_time))
}

/** Whether a place is free now for the first in line of this target. */
export async function placeOpen(svc: SupabaseClient, e: WaitEntry, offers: WaitEntry[]): Promise<boolean> {
  if (e.kind === 'team') {
    const { count } = await svc.from('team_memberships').select('id', { count: 'exact', head: true })
      .eq('team_tier_id', e.team_tier_id).in('status', ['active', 'past_due'])
      .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
    const held = offers.filter(o => o.kind === 'team' && o.team_tier_id === e.team_tier_id).length
    return (count || 0) + held < TEAM_SQUAD_CAP
  }
  if (e.kind === 'group') {
    const { data: s } = await svc.from('class_sessions').select('id, status, enrolled_count, max_students, session_date, start_time').eq('id', e.class_session_id).maybeSingle()
    if (!s || s.status === 'cancelled' || minutesUntil(s.session_date, s.start_time) < LEAD_MIN) return false
    const held = offers.filter(o => o.kind === 'group' && o.class_session_id === e.class_session_id).length
    return (s.enrolled_count || 0) + held < (s.max_students || 4)
  }
  // A coach's time: the coach still teaches this course then (hours, no time
  // off), nothing else with swimmers in the coach's lane, no renewal hold.
  if (!e.slot_date || !e.slot_start || !e.coach_id) return false
  if (minutesUntil(e.slot_date, e.slot_start) < LEAD_MIN) return false
  const start = toMin(e.slot_start), end = start + (e.minutes || 30)
  if (!(await slotTeachable(svc, e.coach_id, e.course_type_id || '', e.slot_date, e.slot_start, e.minutes || 30))) return false
  const [{ data: sess }, { renewalHolds, heldSeats }] = await Promise.all([
    svc.from('class_sessions').select('id, start_time, end_time, enrolled_count').eq('coach_id', e.coach_id).eq('session_date', e.slot_date).in('status', ['open', 'full']).gt('enrolled_count', 0),
    import('./fixed-classes'),
  ])
  if ((sess || []).some((s: any) => start < (s.end_time ? toMin(s.end_time) : toMin(s.start_time) + 30) && end > toMin(s.start_time))) return false
  const holds = await renewalHolds(svc as any, e.slot_date, e.slot_date, e.parent_id)
  return heldSeats(holds.filter(h => h.source !== 'waitlist'), e.coach_id, e.slot_date, start, end, e.course_type_id || '') <= 0
}

/** What the offer is for, in words and a link, for the email and text. */
async function describe(svc: SupabaseClient, e: WaitEntry) {
  const [{ data: kid }, { data: parent }] = await Promise.all([
    svc.from('students').select('full_name').eq('id', e.student_id).maybeSingle(),
    svc.from('parents').select('first_name, email, phone, preferred_language, terms_version').eq('id', e.parent_id).maybeSingle(),
  ])
  const SITE = 'https://www.mantasharkaquatics.net'
  if (e.kind === 'team') {
    const { data: tier } = await svc.from('team_tiers').select('name').eq('id', e.team_tier_id).maybeSingle()
    return { kid: kid?.full_name || '', parent, what: tier?.name || 'Swim Team', date: undefined as string | undefined, time: undefined as string | undefined, coach: '', course: tier?.name || 'Swim Team', link: `${SITE}/checkout?plan=team` }
  }
  let coachId = e.coach_id, date = e.slot_date, start = e.slot_start, minutes = e.minutes || 30, courseId = e.course_type_id
  if (e.kind === 'group') {
    const { data: s } = await svc.from('class_sessions').select('coach_id, session_date, start_time, end_time, course_type_id').eq('id', e.class_session_id).maybeSingle()
    if (s) { coachId = s.coach_id; date = s.session_date; start = s.start_time; courseId = s.course_type_id; minutes = s.end_time ? toMin(s.end_time) - toMin(s.start_time) : 30 }
  }
  const [{ data: coach }, { data: ct }] = await Promise.all([
    svc.from('coaches').select('first_name, last_name').eq('id', coachId).maybeSingle(),
    svc.from('course_types').select('name, slug').eq('id', courseId).maybeSingle(),
  ])
  const hm = String(start || '').slice(0, 5)
  const endM = toMin(hm) + minutes
  const end = `${String(Math.floor(endM / 60)).padStart(2, '0')}:${String(endM % 60).padStart(2, '0')}`
  const slug = ct?.slug || (e.kind === 'group' ? '1on4' : '1on1')
  const link = `${SITE}/booking?course=${encodeURIComponent(slug)}&date=${date}&time=${hm}${coachId ? `&coach=${coachId}` : ''}`
  return {
    kid: kid?.full_name || '', parent, what: ct?.name || '', date: date || undefined,
    time: `${formatTime12h(hm)} – ${formatTime12h(end)}`, coach: coach ? `${coach.first_name || ''} ${coach.last_name || ''}`.trim() : '',
    course: `${ct?.name || ''}${minutes >= 55 ? ' (60 min)' : ''}`, link,
  }
}

/** Tell the family their place is open. */
async function sendOffer(svc: SupabaseClient, e: WaitEntry, until: Date): Promise<void> {
  try {
    const d = await describe(svc, e)
    const p = d.parent as any
    const untilText = until.toLocaleString('en-US', { timeZone: 'America/Los_Angeles', weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
    if (p?.email) await sendEmail({
      type: 'waitlist_offer', to: p.email, lang: p.preferred_language || undefined, parentName: p.first_name || '',
      studentName: d.kid, courseName: d.course, coachName: d.coach, date: d.date, time: d.time,
      deadline: untilText, linkUrl: d.link, waitKind: e.kind,
    })
    // Texts follow the same consent rule as reminders (SMS terms list
    // "Waitlist notices" from 2026-10-22).
    if (p?.phone && p.terms_version && p.terms_version >= '2026-10-05') {
      const when = d.date ? ` on ${new Date(d.date + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })} ${d.time?.split(' – ')[0] || ''}` : ''
      await sendSms(p.phone, `Manta Shark Aquatics: a place opened for ${d.kid} (${d.course}${when}). It is held for you until ${untilText}. Book: ${d.link}${SMS_COMPLIANCE_SUFFIX}`)
    }
  } catch (err) {
    console.error('waitlist offer notice failed for', e.id, err instanceof Error ? err.message : '')
  }
}

/**
 * One pass: close offers and places that are done, then offer each open
 * place to the first family in line. Returns counts for the cron's log.
 */
export async function runWaitlist(svc: SupabaseClient): Promise<{ offered: number; expired: number; booked: number } | { skipped: string }> {
  const nowIso = new Date().toISOString()
  const { data, error } = await svc.from('waitlist_entries').select(COLS).in('status', ['waiting', 'offered']).order('created_at')
  if (error) return { skipped: missingTable(error) ? 'run docs/migration-waitlist.sql' : error.message }
  const entries = (data || []) as WaitEntry[]
  let expired = 0, booked = 0, offered = 0
  const today = getTodayLA()

  const set = async (id: string, patch: Record<string, unknown>, from: string) => {
    const { data: r } = await svc.from('waitlist_entries').update(patch).eq('id', id).eq('status', from).select('id')
    return (r || []).length > 0
  }
  const still: WaitEntry[] = []
  for (const e of entries) {
    if (await fulfilled(svc, e)) { if (await set(e.id, { status: 'booked' }, e.status)) booked++; continue }
    const past = (e.kind === 'slot' && (!e.slot_date || e.slot_date < today || (e.slot_date === today && e.slot_start && minutesUntil(e.slot_date, e.slot_start) < LEAD_MIN)))
    const lapsed = e.status === 'offered' && !live(e)
    if (past || lapsed) {
      // A lapsed offer does not go back in line: the place moves on (owner).
      if (await set(e.id, { status: 'expired' }, e.status)) expired++
      continue
    }
    still.push(e)
  }
  // A group class that has started or been cancelled ends its line.
  const groupIds = [...new Set(still.filter(e => e.kind === 'group').map(e => e.class_session_id!))]
  if (groupIds.length) {
    const { data: sess } = await svc.from('class_sessions').select('id, status, session_date, start_time').in('id', groupIds)
    const done = new Set((sess || []).filter((s: any) => s.status === 'cancelled' || minutesUntil(s.session_date, s.start_time) < LEAD_MIN).map((s: any) => s.id))
    for (const e of still.filter(x => x.kind === 'group' && done.has(x.class_session_id!))) if (await set(e.id, { status: 'expired' }, e.status)) expired++
    for (let i = still.length - 1; i >= 0; i--) if (still[i].kind === 'group' && done.has(still[i].class_session_id!)) still.splice(i, 1)
  }

  const offers = still.filter(e => live(e))
  const lines = new Map<string, WaitEntry[]>()
  for (const e of still) lines.set(keyOf(e), [...(lines.get(keyOf(e)) || []), e])
  for (const line of lines.values()) {
    // One offer at a time per place in line; slot and group lines that
    // already have a live offer wait for it to be taken or to lapse.
    if (line.some(e => live(e))) continue
    const first = line.find(e => e.status === 'waiting')
    if (!first) continue
    if (!(await placeOpen(svc, first, offers))) continue
    let date: string | null = first.slot_date, start: string | null = first.slot_start
    if (first.kind === 'group') {
      const { data: s } = await svc.from('class_sessions').select('session_date, start_time').eq('id', first.class_session_id).maybeSingle()
      date = s?.session_date || null; start = s?.start_time || null
    }
    const until = offerExpiry(first.kind === 'team' ? null : date, first.kind === 'team' ? null : start)
    if (!(await set(first.id, { status: 'offered', offered_at: nowIso, offer_expires_at: until.toISOString() }, 'waiting'))) continue
    offers.push({ ...first, status: 'offered', offered_at: nowIso, offer_expires_at: until.toISOString() })
    offered++
    await sendOffer(svc, first, until)
  }
  return { offered, expired, booked }
}

/** A family's live waitlist entries, for the dashboard. */
export async function familyWaitlist(svc: SupabaseClient, parentId: string) {
  const { data, error } = await svc.from('waitlist_entries').select(COLS).eq('parent_id', parentId).in('status', ['waiting', 'offered']).order('created_at')
  if (error) return []
  const out = []
  for (const e of (data || []) as WaitEntry[]) {
    const d = await describe(svc, e)
    // Place in line: entries for the same thing that joined earlier.
    const { count } = await svc.from('waitlist_entries').select('id', { count: 'exact', head: true })
      .eq('kind', e.kind).in('status', ['waiting', 'offered']).lt('created_at', e.created_at)
      .match(e.kind === 'team' ? { team_tier_id: e.team_tier_id } : e.kind === 'group' ? { class_session_id: e.class_session_id } : { coach_id: e.coach_id, slot_date: e.slot_date, slot_start: e.slot_start })
    out.push({
      id: e.id, kind: e.kind, status: live(e) ? 'offered' : 'waiting', studentName: d.kid, course: d.course, coach: d.coach,
      date: d.date || null, time: d.time || null, link: d.link, until: live(e) ? e.offer_expires_at : null, position: (count || 0) + 1,
    })
  }
  return out
}
