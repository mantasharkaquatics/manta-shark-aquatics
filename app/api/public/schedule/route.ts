import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { isBlocked, type CoachBlock } from '@/lib/availability'
import { meetsLeadTime } from '@/lib/booking-time'
import { getTodayLA, SLOT_STEP_MINUTES } from '@/lib/date'
import { bandKey } from '@/lib/zone-colors'
import { TEAM_SQUAD_CAP } from '@/lib/team-tiers'
import { renewalHolds, heldSeats, allRows } from '@/lib/fixed-classes'
import { inviteHeldSessions } from '@/lib/bookings/invite-holds'
import { privateSlotOpen } from '@/lib/bookings/private-slot'
import { activeLocations, getLocations, locationParam, showLocations, zoneAtLocation, DEFAULT_LOCATION_ID } from '@/lib/locations'

// The week ahead, for the public programme pages (owner, 2026-09-28): each of
// /programs/private, /programs/group and /programs/team shows the open times of
// its own kind of lesson, so a family can see there is room before they sign up.
//
// It is a PREVIEW. No sign-in, no student, nothing held. It answers "is there a
// time on Tuesday" and never "with whom": coach names and ids stay out of the
// response, and so does anything about who is booked. The rules are the ones
// the booking routes use (bookings/openings for private and semi, the range
// shape of bookings/group-classes for group, team zones for the squads) minus
// the parts that need a particular swimmer; the booking page re-checks
// everything when a family actually books.
//
// GET ?kind=private|semi -> { from, days: [{ date, times: ['HH:MM'] }] }
// GET ?kind=group        -> { from, days: [{ date, slots: [{ time, band }] }] }   (band '1-2' | null = any level)
// GET ?kind=team         -> { from, tiers: [...], days: [{ date, slots: [{ time, end, tier_id }] }] }
//
// With more than one pool open to families (lib/locations showLocations) every
// answer is for ONE pool, ?location=<id> (the first open pool when absent or
// unknown), and also carries { location, locations: [{ id, name }] } so the
// preview can draw its pool switch. With one pool the parameter is ignored and
// the answer is exactly what it was.

const DAYS = 7
const LESSON_MIN = 30

const toMin = (t: string) => { const [h, m] = String(t).slice(0, 5).split(':').map(Number); return h * 60 + m }
const toTime = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
const addDays = (ds: string, n: number) => {
  const d = new Date(ds + 'T00:00:00'); d.setDate(d.getDate() + n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const dowOf = (ds: string) => new Date(ds + 'T00:00:00').getDay()

// A few minutes stale is fine for a preview, and it keeps a busy page from
// running the whole calculation for every visitor.
const CACHE = { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=900' }

export async function GET(req: NextRequest) {
  const kind = req.nextUrl.searchParams.get('kind') || 'private'
  if (!['private', 'semi', 'group', 'team'].includes(kind))
    return NextResponse.json({ error: 'Unknown kind' }, { status: 400 })

  const svc = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  // No sign-in here, so the id is checked against the OPEN pools only: a
  // hidden pool's times are not shown to the public by naming it.
  const allLocs = await getLocations(svc)
  const openLocs = activeLocations(allLocs)
  const multi = showLocations(allLocs)
  const loc: string | null = multi ? (locationParam(req.nextUrl.searchParams.get('location'), openLocs) ?? openLocs[0].id) : null
  const locInfo = multi ? { location: loc, locations: openLocs.map(l => ({ id: l.id, name: l.name })) } : {}
  // A coach with no zone rows is on the old weekly hours, which are Brea's.
  const legacyHere = !loc || loc === DEFAULT_LOCATION_ID
  const from = getTodayLA()
  const to = addDays(from, DAYS - 1)
  const dates: string[] = []
  for (let i = 0; i < DAYS; i++) dates.push(addDays(from, i))

  const { data: coachRows } = await svc.from('coaches').select('id').eq('is_active', true)
  const coachIds = (coachRows || []).map((c: any) => c.id as string)

  const [{ data: zrows }, { data: zoned }, { data: offRows }] = await Promise.all([
    svc.from('coach_availability_zones')
      .select('coach_id, zone_type, kind, weekday, override_date, start_time, end_time, group_level_min, group_level_max, team_tier_id, location_id')
      .in('coach_id', coachIds.length ? coachIds : ['00000000-0000-0000-0000-000000000000'])
      .or(`kind.eq.weekly,and(kind.eq.date,override_date.gte.${from},override_date.lte.${to})`),
    svc.from('coach_availability_zones').select('coach_id').in('coach_id', coachIds.length ? coachIds : ['00000000-0000-0000-0000-000000000000']),
    svc.from('coach_time_off').select('coach_id, date, start_time, end_time, block_type')
      .in('coach_id', coachIds.length ? coachIds : ['00000000-0000-0000-0000-000000000000'])
      .gte('date', from).lte('date', to),
  ])
  const zonesBy: Record<string, any[]> = {}
  for (const r of zrows || []) (zonesBy[r.coach_id] ||= []).push(r)
  const hasZones = new Set((zoned || []).map((r: any) => r.coach_id))
  const offBy: Record<string, CoachBlock[]> = {}
  for (const b of (offRows || []) as CoachBlock[]) (offBy[b.coach_id + '|' + b.date] ||= []).push(b)

  // Same resolution as lib/zones: a day's own rows replace the weekly template,
  // and a 'closed' row closes the day -- at every pool, so that is checked
  // before the rows are narrowed to the pool asked for.
  const rowsFor = (cid: string, ds: string): any[] | null => {
    const all = zonesBy[cid] || []
    const dateRows = all.filter(r => r.kind === 'date' && r.override_date === ds)
    const picked = dateRows.length > 0 ? dateRows : all.filter(r => r.kind === 'weekly' && r.weekday === dowOf(ds))
    return picked.some(r => r.zone_type === 'closed') ? null : picked.filter(r => zoneAtLocation(r, loc))
  }

  // ── Squads: their fixed weekly times, and the practices of this week ──
  if (kind === 'team') {
    const [{ data: tiers }, { data: members }] = await Promise.all([
      svc.from('team_tiers').select('id, name, level_min, level_max, min_stage, max_stage, monthly_price_cents')
        .eq('active', true).order('level_min'),
      svc.from('team_memberships').select('team_tier_id').in('status', ['active', 'past_due'])
        .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`),
    ])
    const count: Record<string, number> = {}
    for (const m of members || []) count[m.team_tier_id] = (count[m.team_tier_id] || 0) + 1
    const tierIds = new Set((tiers || []).map((t: any) => t.id))

    const weeklyBy: Record<string, Map<string, any>> = {}
    for (const cid of coachIds) for (const r of zonesBy[cid] || []) {
      if (r.kind !== 'weekly' || r.zone_type !== 'team' || !tierIds.has(r.team_tier_id) || !zoneAtLocation(r, loc)) continue
      const st = String(r.start_time).slice(0, 5), en = String(r.end_time).slice(0, 5)
      // Two coaches on one squad's practice is still one practice.
      ;(weeklyBy[r.team_tier_id] ||= new Map()).set(`${r.weekday}|${st}`, { weekday: r.weekday, start: st, end: en })
    }

    const days = dates.map(ds => {
      const seen = new Map<string, any>()
      for (const cid of coachIds) {
        const rows = rowsFor(cid, ds)
        if (!rows) continue
        for (const r of rows) {
          if (r.zone_type !== 'team' || !tierIds.has(r.team_tier_id)) continue
          const st = String(r.start_time).slice(0, 5), en = String(r.end_time).slice(0, 5)
          if (isBlocked(offBy[cid + '|' + ds] || [], cid, st, en)) continue
          seen.set(`${r.team_tier_id}|${st}`, { time: st, end: en, tier_id: r.team_tier_id })
        }
      }
      return { date: ds, slots: [...seen.values()].sort((a, b) => a.time.localeCompare(b.time)) }
    })

    return NextResponse.json({
      from,
      tiers: (tiers || []).map((t: any) => ({
        id: t.id, name: t.name, level_min: t.level_min, level_max: t.level_max,
        min_stage: t.min_stage ?? 1, max_stage: t.max_stage ?? 3, monthly_price_cents: t.monthly_price_cents,
        spots_left: Math.max(0, TEAM_SQUAD_CAP - (count[t.id] || 0)),
        weekly: [...(weeklyBy[t.id]?.values() || [])].sort((a, b) => a.weekday - b.weekday || a.start.localeCompare(b.start)),
      })),
      days,
      ...locInfo,
    }, { headers: CACHE })
  }

  const slug = kind === 'private' ? '1on1' : kind === 'semi' ? '1on2' : '1on4'
  // The same inputs bookings/openings and bookings/group-classes read (found
  // 2026-10-07: this preview had fallen behind them): only sessions with
  // someone in them, paged past the 1,000-row cap; sessions held by a live
  // 1-on-2 invitation, which look full; and renewal holds. A visitor is
  // nobody's family, so every family's hold counts.
  const [{ data: ct }, { data: sessRows }, { data: legacyRows }, inviteHeld, holds] = await Promise.all([
    svc.from('course_types').select('id, max_students, duration_minutes').eq('slug', slug).single(),
    allRows(() => svc.from('class_sessions').select('id, coach_id, session_date, start_time, end_time, course_type_id, enrolled_count, max_students')
      .gte('session_date', from).lte('session_date', to).in('status', ['open', 'full']).gt('enrolled_count', 0).order('id')),
    kind === 'group'
      ? Promise.resolve({ data: [] as any[] })
      : svc.from('coach_availability').select('coach_id, day_of_week, start_time, end_time').eq('is_active', true),
    inviteHeldSessions(svc, { from, to }),
    renewalHolds(svc, from, to, null),
  ])
  if (!ct) return NextResponse.json({ error: 'Course type missing' }, { status: 500 })
  const sessBy: Record<string, any[]> = {}
  const sessSeen = new Set((sessRows || []).map(s => s.id))
  for (const s of [...(sessRows || []), ...inviteHeld.filter(h => !sessSeen.has(h.id))]) (sessBy[s.coach_id + '|' + s.session_date] ||= []).push(s)
  const sStart = (x: any) => toMin(x.start_time)
  const sEnd = (x: any) => x.end_time ? toMin(x.end_time) : sStart(x) + LESSON_MIN

  // ── Group: every class time with a seat left, by level band ──
  if (kind === 'group') {
    const dur = Number(ct.duration_minutes) || LESSON_MIN
    const days = dates.map(ds => {
      const seen = new Map<string, { time: string; band: string | null }>()
      for (const cid of coachIds) {
        if (!hasZones.has(cid)) continue
        const rows = rowsFor(cid, ds)
        if (!rows) continue
        const blocks = offBy[cid + '|' + ds] || []
        const sess = sessBy[cid + '|' + ds] || []
        for (const z of rows) {
          if (z.zone_type !== 'group') continue
          const band = bandKey(z.group_level_min, z.group_level_max)
          for (let m = toMin(z.start_time); m + dur <= toMin(z.end_time); m += SLOT_STEP_MINUTES) {
            const t = toTime(m)
            if (ds === from && !meetsLeadTime(ds, t)) continue
            if (isBlocked(blocks, cid, t, toTime(m + dur))) continue
            if (sess.some(x => x.course_type_id !== ct.id && x.enrolled_count > 0 && m < sEnd(x) && m + dur > sStart(x))) continue
            // Seats a renewal hold keeps count as taken (bookings/group-classes).
            const held = heldSeats(holds, cid, ds, m, m + dur, ct.id)
            if (held === Infinity) continue
            const own = sess.find(x => x.course_type_id === ct.id && sStart(x) === m)
            if ((own ? own.enrolled_count : 0) + held >= ct.max_students) continue
            seen.set(`${t}|${band}`, { time: t, band })
          }
        }
      }
      return { date: ds, slots: [...seen.values()].sort((a, b) => a.time.localeCompare(b.time) || String(a.band).localeCompare(String(b.band))) }
    })
    return NextResponse.json({ from, days, ...locInfo }, { headers: CACHE })
  }

  // ── Private and semi-private: any coach free at that time ──
  // The booking page's rule (lib/bookings/private-slot), minus the swimmer's
  // own lessons: a 1-on-2 needs both seats.
  const seats = kind === 'semi' ? 2 : 1
  const days = dates.map(ds => {
    const dow = dowOf(ds)
    const times = new Set<string>()
    for (const cid of coachIds) {
      let windows: any[]
      if (hasZones.has(cid)) {
        const rows = rowsFor(cid, ds)
        if (!rows) continue
        windows = rows.filter(r => r.zone_type === 'private')
      } else {
        if (!legacyHere) continue
        windows = (legacyRows || []).filter((r: any) => r.coach_id === cid && r.day_of_week === dow)
      }
      const blocks = offBy[cid + '|' + ds] || []
      const sess = sessBy[cid + '|' + ds] || []
      for (const w of windows) {
        for (let m = toMin(w.start_time); m + LESSON_MIN <= toMin(w.end_time); m += SLOT_STEP_MINUTES) {
          const t = toTime(m), end = m + LESSON_MIN
          if (times.has(t)) continue
          if (ds === from && !meetsLeadTime(ds, t)) continue
          if (!privateSlotOpen({ coachId: cid, date: ds, startMin: m, endMin: end, courseTypeId: ct.id, seats, blocks, sessions: sess, holds })) continue
          times.add(t)
        }
      }
    }
    return { date: ds, times: [...times].sort() }
  })
  return NextResponse.json({ from, days, ...locInfo }, { headers: CACHE })
}
