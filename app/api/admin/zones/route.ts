import { NextRequest, NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { requireAdmin } from '@/lib/api-auth'
import { zoneTypeForSlug } from '@/lib/zones'
import { getTodayLA } from '@/lib/date'
import { readJson, badRequest } from '@/lib/http'
import { MAX_LEVEL } from '@/lib/levels'
import { bandRange } from '@/lib/zone-colors'
import { getLocations, DEFAULT_LOCATION_ID, type Location } from '@/lib/locations'

// Admin CRUD for coach availability zones (spec v1.1).
// GET ?coach_id → weekly template + legacy hours + tiers
// GET ?coach_id&date → that date's override rows
// PUT → replace weekly template
// POST → date override: { coach_id, date, clear? } | { ..., closed: true } | { ..., zones: [...] }

const VALID_TYPES = ['private', 'group', 'team']

// A location page lists the coaches with hours at that pool, read through the
// public site's cache (lib/public-locations.ts, tag 'locations'). Any change
// to a coach's blocks may change that list, so it expires with every save.
const refreshPublicPools = () => { try { revalidateTag('locations', { expire: 0 }) } catch { /* outside a request: nothing cached to expire */ } }

// Which pool each block is at. A missing location_id is the default pool, so a
// payload from before locations (or a cached old editor tab) still saves as
// Brea. An id that is not in the table is refused rather than stored: the
// column has a foreign key, and a 500 from that says less than this does.
// Before the migration the table is empty and only the default is accepted.
function zoneLocation(z: any, all: Location[]): string | null {
  const id = z.location_id == null || z.location_id === '' ? DEFAULT_LOCATION_ID : String(z.location_id)
  if (all.length === 0) return id === DEFAULT_LOCATION_ID ? id : null
  return all.some(l => l.id === id) ? id : null
}
function checkLocations(zones: any[], all: Location[]): string | null {
  for (const z of zones) if (!zoneLocation(z, all)) return 'Unknown location'
  return null
}
const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m }

type DayRow = { zone_type: string; start_time: string; end_time: string; group_level_min?: number | null; group_level_max?: number | null; location_id?: string | null }

// The pool the class_sessions trigger (docs/migration-locations.sql,
// class_session_location) gives a lesson starting at `st` on a day with these
// blocks: the block covering the start, else the nearest one, else the
// default pool. Kept to the same rule so the warning names the pool the
// lesson WOULD get if it were booked now.
function triggerPool(rows: DayRow[], st: number): string {
  let best: { loc: string; rank: number; dist: number } | null = null
  for (const z of rows) {
    if (z.zone_type === 'closed') continue
    const zs = toMin(String(z.start_time).slice(0, 5)), ze = toMin(String(z.end_time).slice(0, 5))
    const rank = zs <= st && st < ze ? 0 : 1
    const dist = Math.min(Math.abs(zs - st), Math.abs(ze - st))
    if (!best || rank < best.rank || (rank === best.rank && dist < best.dist))
      best = { loc: z.location_id || DEFAULT_LOCATION_ID, rank, dist }
  }
  return best ? best.loc : DEFAULT_LOCATION_ID
}

// Q3 (warn-and-save): list future enrolled sessions that no longer fit the new zones.
// `band`: group classes that still fit a group zone, but whose level band (the
// one stamped on the session when it opened) is not the zone's new band (found
// 2026-10-15, F82). Repainting an L1-2 block as L3-4 used to say nothing, and
// L3-4 families were then let into the class with its Level 1 swimmers. The
// classes are not moved (owner, 2026-10-15): the desk is told, and the booking
// routes keep anyone outside a class's own band out of it.
// `pool`: booked lessons whose block is now at another pool (found 2026-10-15,
// F6). class_sessions.location_id is set by a trigger only when a lesson is
// created or moved, so repainting a coach's Saturday from Brea to Monrovia
// left every lesson already booked there at Brea -- the reminders, cards and
// "I'm here" all said Brea -- and the save said nothing. The lessons are not
// changed here (the app cannot re-run the trigger without a database change):
// the desk is told which families to contact.
async function bookingWarnings(
  svc: any,
  coachId: string,
  evalDay: (dateStr: string) => { skip?: boolean; closed?: boolean; rows: DayRow[] },
  locations: Location[] = [],
): Promise<{ outside: string[]; band: string[]; pool: string[] }> {
  const { data: sessions } = await svc
    .from('class_sessions')
    .select('session_date, start_time, end_time, enrolled_count, level_min, level_max, location_id, course_types(slug, name)')
    .eq('coach_id', coachId).gte('session_date', getTodayLA()).gt('enrolled_count', 0)
  const outside: string[] = []
  const band: string[] = []
  const pool: string[] = []
  const poolName = (id: string) => locations.find(l => l.id === id)?.name || id
  for (const sess of sessions || []) {
    const day = evalDay(sess.session_date)
    if (!day || day.skip) continue
    const ct: any = Array.isArray(sess.course_types) ? sess.course_types[0] : sess.course_types
    const zt = zoneTypeForSlug(ct?.slug || '')
    const st = toMin(String(sess.start_time).slice(0, 5))
    const en = toMin(String(sess.end_time).slice(0, 5))
    const zone = day.closed ? undefined : day.rows.find(z => z.zone_type === zt && toMin(String(z.start_time).slice(0, 5)) <= st && en <= toMin(String(z.end_time).slice(0, 5)))
    const label = `${sess.session_date} ${String(sess.start_time).slice(0, 5)} ${ct?.name || ''} (${sess.enrolled_count} booked)`
    // With one pool in the table every lesson is at it; a closed day has no pool to move to.
    if (locations.length > 1 && !day.closed) {
      const was = sess.location_id || DEFAULT_LOCATION_ID
      const now = triggerPool(day.rows, st)
      if (now !== was) pool.push(`${label} ${poolName(was)} \u2192 ${poolName(now)}`)
    }
    if (!zone) { outside.push(label); continue }
    if (zt === 'group' && sess.level_min != null && sess.level_max != null
        && zone.group_level_min != null && zone.group_level_max != null
        // Compared as read (bandRange): the top band is stored as both 7-9 and 7-7.
        && bandRange(sess.level_min, sess.level_max) !== bandRange(zone.group_level_min, zone.group_level_max))
      band.push(`${label} L${bandRange(sess.level_min, sess.level_max)} \u2192 L${bandRange(zone.group_level_min, zone.group_level_max)}`)
  }
  return { outside, band, pool }
}

function validateZones(zones: any[], needWeekday: boolean): string | null {
  for (const z of zones) {
    if (!VALID_TYPES.includes(z.zone_type)) return 'Invalid zone_type'
    if (needWeekday && (typeof z.weekday !== 'number' || z.weekday < 0 || z.weekday > 6)) return 'Invalid weekday'
    if (!/^\d{2}:\d{2}$/.test(z.start_time) || !/^\d{2}:\d{2}$/.test(z.end_time) || toMin(z.start_time) >= toMin(z.end_time)) return 'Invalid time range'
    if (z.zone_type === 'team') {
      if (!z.team_tier_id) return 'Team zones need a squad'
      if ((toMin(z.end_time) - toMin(z.start_time)) % 90 !== 0) return 'Team blocks must be in 90-minute multiples'
    }
    if (z.zone_type === 'group') {
      const mn = z.group_level_min, mx = z.group_level_max
      if (mn == null || mx == null) return 'Group zones must have a level band'
      if (!Number.isInteger(mn) || !Number.isInteger(mx) || mn < 1 || mx > MAX_LEVEL || mn > mx) return 'Invalid group level band'
    }
  }
  const groups: Record<string, any[]> = {}
  for (const z of zones) {
    const k = needWeekday ? String(z.weekday) : 'day'
    if (!groups[k]) groups[k] = []
    groups[k].push(z)
  }
  for (const k of Object.keys(groups)) {
    const day = groups[k].sort((a, b) => toMin(a.start_time) - toMin(b.start_time))
    for (let i = 1; i < day.length; i++) {
      if (toMin(day[i].start_time) < toMin(day[i - 1].end_time)) return 'Overlapping zones' + (needWeekday ? ` on weekday ${k}` : '')
    }
  }
  return null
}

export async function GET(req: NextRequest) {
  const auth = await requireAdmin()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const svc = auth.svc

  const coachId = req.nextUrl.searchParams.get('coach_id')
  const date = req.nextUrl.searchParams.get('date')
  if (!coachId) {
    const { data: coaches } = await svc
      .from('coaches').select('id, first_name, last_name').eq('is_active', true).order('first_name')
    return NextResponse.json({ coaches: coaches || [] })
  }
  if (date) {
    const { data: dateRows } = await svc
      .from('coach_availability_zones')
      .select('zone_type, start_time, end_time, team_tier_id, group_level_min, group_level_max, location_id')
      .eq('coach_id', coachId).eq('kind', 'date').eq('override_date', date)
      .order('start_time')
    return NextResponse.json({ dateRows: dateRows || [] })
  }

  // Every pool, closed-to-families ones too: the admin paints Monrovia hours
  // before turning Monrovia on.
  const [{ data: weekly }, { data: legacy }, { data: tiers }, { data: ovRows }, locations] = await Promise.all([
    svc.from('coach_availability_zones')
      .select('zone_type, weekday, start_time, end_time, team_tier_id, group_level_min, group_level_max, location_id')
      .eq('coach_id', coachId).eq('kind', 'weekly').order('weekday').order('start_time'),
    svc.from('coach_availability')
      .select('day_of_week, start_time, end_time')
      .eq('coach_id', coachId).eq('is_active', true),
    svc.from('team_tiers').select('id, name').eq('active', true).order('level_min'),
    svc.from('coach_availability_zones')
      .select('override_date, zone_type')
      .eq('coach_id', coachId).eq('kind', 'date').order('override_date'),
    getLocations(svc),
  ])
  const ovMap: Record<string, boolean> = {}
  for (const r of (ovRows || []) as any[]) ovMap[r.override_date] = ovMap[r.override_date] || r.zone_type === 'closed'
  const overrideDates = Object.entries(ovMap).map(([date, closed]) => ({ date, closed }))
  return NextResponse.json({ weekly: weekly || [], legacy: legacy || [], tiers: tiers || [], overrideDates, locations })
}

export async function PUT(req: NextRequest) {
  const auth = await requireAdmin()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const svc = auth.svc

  const body = await readJson(req)
  if (!body) return badRequest()
  const { coach_id, zones } = body
  if (!coach_id || !Array.isArray(zones))
    return NextResponse.json({ error: 'coach_id and zones[] required' }, { status: 400 })
  const err = validateZones(zones, true)
  if (err) return NextResponse.json({ error: err }, { status: 400 })
  const locations = await getLocations(svc)
  const locErr = checkLocations(zones, locations)
  if (locErr) return NextResponse.json({ error: locErr }, { status: 400 })

  /* An empty template means the coach is closed for booking (owner,
     2026-10-16, F60), on every date without a date override; lessons already
     booked stay and are listed below as before. Saving any weekly template
     also retires the coach's old coach_availability hours (is_active =
     false): lib/zones counts a coach as legacy only while those hours are
     active, so erasing every block can no longer put them back on sale for
     every course type. Done first, so a failure here changes nothing, and a
     failed insert further down leaves the coach closed rather than on the
     old hours. Rows are kept, not deleted, for the record. */
  const { error: retireErr } = await svc
    .from('coach_availability').update({ is_active: false })
    .eq('coach_id', coach_id).eq('is_active', true)
  if (retireErr) return NextResponse.json({ error: retireErr.message }, { status: 500 })

  const { error: delErr } = await svc
    .from('coach_availability_zones').delete().eq('coach_id', coach_id).eq('kind', 'weekly')
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 })

  if (zones.length > 0) {
    const { error: insErr } = await svc.from('coach_availability_zones').insert(
      zones.map((z: any) => ({
        coach_id, kind: 'weekly', zone_type: z.zone_type, weekday: z.weekday,
        start_time: z.start_time, end_time: z.end_time, location_id: zoneLocation(z, locations),
        team_tier_id: z.zone_type === 'team' ? z.team_tier_id : null,
        group_level_min: z.zone_type === 'group' ? z.group_level_min ?? null : null,
        group_level_max: z.zone_type === 'group' ? z.group_level_max ?? null : null,
      }))
    )
    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 })
  }
  const { data: ovr } = await svc
    .from('coach_availability_zones')
    .select('override_date').eq('coach_id', coach_id).eq('kind', 'date')
  const ovrSet = new Set((ovr || []).map((r: any) => r.override_date))
  const { outside: warnings, band: band_warnings, pool: pool_warnings } = await bookingWarnings(svc, coach_id, (dateStr) => {
    if (ovrSet.has(dateStr)) return { skip: true, rows: [] }
    const dow = new Date(dateStr + 'T00:00:00').getDay()
    return { rows: zones.filter((z: any) => z.weekday === dow).map((z: any) => ({ ...z, location_id: zoneLocation(z, locations) })) }
  }, locations)
  refreshPublicPools()
  return NextResponse.json({ ok: true, count: zones.length, warnings, band_warnings, pool_warnings })
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const svc = auth.svc

  const body = await readJson(req)
  if (!body) return badRequest()
  const { coach_id, date, clear, closed, zones } = body
  if (!coach_id || !date || !/^\d{4}-\d{2}-\d{2}$/.test(date))
    return NextResponse.json({ error: 'coach_id and date required' }, { status: 400 })

  const { error: delErr } = await svc
    .from('coach_availability_zones').delete()
    .eq('coach_id', coach_id).eq('kind', 'date').eq('override_date', date)
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 })

  if (clear) {
    // The day goes back to the weekly template, which may put the coach at the
    // other pool than the override did (F6): say which booked lessons that leaves.
    const dow = new Date(date + 'T00:00:00').getDay()
    const [{ data: weekly }, locations] = await Promise.all([
      svc.from('coach_availability_zones')
        .select('zone_type, start_time, end_time, group_level_min, group_level_max, location_id')
        .eq('coach_id', coach_id).eq('kind', 'weekly').eq('weekday', dow),
      getLocations(svc),
    ])
    const { pool: pool_warnings } = await bookingWarnings(svc, coach_id, (d) => d === date ? { rows: (weekly || []) as DayRow[] } : { skip: true, rows: [] }, locations)
    refreshPublicPools()
    return NextResponse.json({ ok: true, mode: 'cleared', pool_warnings })
  }

  if (closed) {
    const { error: insErr } = await svc.from('coach_availability_zones').insert({
      coach_id, kind: 'date', override_date: date, zone_type: 'closed',
      start_time: '00:00', end_time: '23:59',
    })
    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 })
    const { outside: warnings } = await bookingWarnings(svc, coach_id, (d) => d === date ? { closed: true, rows: [] } : { skip: true, rows: [] })
    refreshPublicPools()
    return NextResponse.json({ ok: true, mode: 'closed', warnings })
  }

  if (!Array.isArray(zones) || zones.length === 0)
    return NextResponse.json({ error: 'zones[] required (or closed/clear flag)' }, { status: 400 })
  const err = validateZones(zones, false)
  if (err) return NextResponse.json({ error: err }, { status: 400 })
  const locations = await getLocations(svc)
  const locErr = checkLocations(zones, locations)
  if (locErr) return NextResponse.json({ error: locErr }, { status: 400 })

  const { error: insErr } = await svc.from('coach_availability_zones').insert(
    zones.map((z: any) => ({
      coach_id, kind: 'date', override_date: date, zone_type: z.zone_type,
      start_time: z.start_time, end_time: z.end_time, location_id: zoneLocation(z, locations),
      team_tier_id: z.zone_type === 'team' ? z.team_tier_id : null,
      group_level_min: z.zone_type === 'group' ? z.group_level_min ?? null : null,
      group_level_max: z.zone_type === 'group' ? z.group_level_max ?? null : null,
    }))
  )
  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 })
  const { outside: warnings, band: band_warnings, pool: pool_warnings } = await bookingWarnings(svc, coach_id, (d) => d === date
    ? { rows: zones.map((z: any) => ({ ...z, location_id: zoneLocation(z, locations) })) }
    : { skip: true, rows: [] }, locations)
  refreshPublicPools()
  return NextResponse.json({ ok: true, mode: 'set', count: zones.length, warnings, band_warnings, pool_warnings })
}
