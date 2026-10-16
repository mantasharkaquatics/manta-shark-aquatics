import type { SupabaseClient } from '@supabase/supabase-js'
import { DEFAULT_LOCATION_ID, familyCanBookAt, zoneAtLocation, type Location } from '@/lib/locations'
import { allRows } from '@/lib/db-paging'

// Coach availability zones (spec v1.0, docs/coach-availability-zones-spec.md).
// Resolution: date rows replace the whole day; 'closed' date row = day off;
// otherwise weekly template; coach with ZERO zone rows = legacy coach_availability.

export interface ZoneRow {
  zone_type: 'private' | 'group' | 'team' | 'closed'
  start_time: string
  end_time: string
  group_level_min?: number | null
  group_level_max?: number | null
  team_tier_id?: string | null
  /** Which pool this block is at (lib/locations.ts). */
  location_id?: string | null
}

export interface EffectiveZones {
  legacy: boolean
  rows: ZoneRow[]
  overridden: boolean
}

// Course slug -> zone that admits it. 1on1/1on2 share private; 1on4 -> group.
export function zoneTypeForSlug(slug: string): 'private' | 'group' | 'team' | null {
  if (slug === '1on1' || slug === '1on2') return 'private'
  if (slug === '1on4') return 'group'
  if (slug === 'team') return 'team'
  return null
}

/** Whether a coach still runs on the legacy coach_availability hours (no zone
 *  rows at all). Those hours start on the hour or half hour and are offered
 *  every 35 minutes from there, so they never sit on the zone grid; the grid
 *  check (lib/date.ts isGridStart) applies to zoned coaches only (found
 *  2026-10-15, when it refused every time of a not-yet-zoned coach). */
export async function isLegacyCoach(svc: SupabaseClient, coachId: string): Promise<boolean> {
  const { count } = await svc
    .from('coach_availability_zones')
    .select('id', { count: 'exact', head: true })
    .eq('coach_id', coachId)
  return !count
}

export async function getEffectiveZones(
  svc: SupabaseClient,
  coachId: string,
  dateStr: string, // YYYY-MM-DD (LA calendar date)
  // Only the blocks at this pool (a family booking at one location). Omitted =
  // every block, as before locations existed.
  locationId?: string | null,
): Promise<EffectiveZones> {
  // Legacy check: a coach with no zone rows at all stays on coach_availability.
  const { count } = await svc
    .from('coach_availability_zones')
    .select('id', { count: 'exact', head: true })
    .eq('coach_id', coachId)
  if (!count || count === 0) {
    // The old weekly table predates locations: those hours are the first pool's.
    if (locationId && locationId !== DEFAULT_LOCATION_ID) return { legacy: false, rows: [], overridden: false }
    return { legacy: true, rows: [], overridden: false }
  }

  const dow = new Date(dateStr + 'T00:00:00').getDay()

  // One query for both candidate sets; date rows win if present.
  const { data } = await svc
    .from('coach_availability_zones')
    .select('zone_type, start_time, end_time, kind, override_date, weekday, group_level_min, group_level_max, team_tier_id, location_id')
    .eq('coach_id', coachId)
    .or(`and(kind.eq.date,override_date.eq.${dateStr}),and(kind.eq.weekly,weekday.eq.${dow})`)

  const all = data || []
  const dateRows = all.filter(r => r.kind === 'date')
  const picked = dateRows.length > 0 ? dateRows : all.filter(r => r.kind === 'weekly')

  if (picked.some(r => r.zone_type === 'closed')) return { legacy: false, rows: [], overridden: dateRows.length > 0 }

  // A closed day closes every pool; only then narrow to the one asked for.
  const rows = picked
    .filter(r => zoneAtLocation(r, locationId))
    .map(r => ({ zone_type: r.zone_type, start_time: r.start_time.slice(0, 5), end_time: r.end_time.slice(0, 5), group_level_min: r.group_level_min ?? null, group_level_max: r.group_level_max ?? null, team_tier_id: r.team_tier_id ?? null, location_id: r.location_id ?? DEFAULT_LOCATION_ID }))
    .sort((a, b) => a.start_time.localeCompare(b.start_time))
  return { legacy: false, rows, overridden: dateRows.length > 0 }
}

/**
 * A coach's day as a family may book it: only the blocks at pools open to
 * families (lib/locations familyCanBookAt, found 2026-10-15, F168). A legacy
 * coach's hours are the default pool's, so with that pool hidden they are no
 * hours at all. For the parent booking routes; staff screens use the day as is.
 */
export function familyZones(eff: EffectiveZones, all: Location[]): EffectiveZones {
  if (eff.legacy) return familyCanBookAt(DEFAULT_LOCATION_ID, all) ? eff : { legacy: false, rows: [], overridden: eff.overridden }
  return { ...eff, rows: eff.rows.filter(r => familyCanBookAt(r.location_id, all)) }
}

/**
 * For a legacy coach (no zone rows, getEffectiveZones -> legacy): whether
 * startMin..endMin fits inside one of the coach's active coach_availability
 * windows for that weekday -- the hours the booking page and openings offer
 * for such a coach. The booking routes used to skip every check for a legacy
 * coach, so a coach just added on Admin > Coaches (no zones yet) took any
 * time at all from a hand-made request, 06:05 included (found 2026-10-15).
 * A coach with no rows that day fits nothing. A failed read fits nothing too:
 * refusing a booking is recoverable, a lesson at an hour nobody works is not.
 */
export async function legacyHoursFit(
  svc: SupabaseClient, coachId: string, dateStr: string, startMin: number, endMin: number,
): Promise<boolean> {
  const dow = new Date(dateStr + 'T12:00:00Z').getUTCDay()
  const { data, error } = await svc.from('coach_availability')
    .select('start_time, end_time').eq('coach_id', coachId).eq('day_of_week', dow).eq('is_active', true)
  if (error || !data) return false
  const toMin = (t: string) => { const [h, m] = String(t).slice(0, 5).split(':').map(Number); return h * 60 + m }
  return data.some((w: any) => toMin(w.start_time) <= startMin && endMin <= toMin(w.end_time))
}

/**
 * The level band to stamp on new 1-on-4 sessions (found 2026-10-08): the band
 * of the group zone each one sits in, as /api/bookings/create already writes.
 * The batch path (/api/bookings/recurring, how families book group lessons)
 * and the fixed-class move opened sessions with no band, so the dashboard's
 * "Level x-y" tag showed on some of a child's group lessons and not others.
 * One read for every coach. Any other course, a legacy coach, or a failed
 * read gives nulls -- the tag is display only, and booking goes ahead.
 */
export async function groupBandsFor(
  svc: SupabaseClient,
  slug: string,
  needs: { coach: string; date: string; start: string; end: string }[],
): Promise<{ level_min: number | null; level_max: number | null }[]> {
  const none = needs.map(() => ({ level_min: null, level_max: null }))
  if (zoneTypeForSlug(slug) !== 'group' || needs.length === 0) return none
  // Only the weekly template and the date rows for the dates asked about, and
  // paged. Date overrides are never deleted, so reading every row a coach ever
  // had passed the API's 1,000-row cap and the newest -- the ones that matter
  // -- were the ones cut off (found 2026-10-12).
  const dates = [...new Set(needs.map(n => n.date))]
  const { data, error } = await allRows(() => svc
    .from('coach_availability_zones')
    .select('id, coach_id, zone_type, kind, weekday, override_date, start_time, end_time, group_level_min, group_level_max')
    .in('coach_id', [...new Set(needs.map(n => n.coach))])
    .or(`kind.eq.weekly,and(kind.eq.date,override_date.in.(${dates.join(',')}))`)
    .order('id'))
  if (error || !data) return none
  const toMin = (t: string) => { const [h, m] = String(t).slice(0, 5).split(':').map(Number); return h * 60 + m }
  return needs.map(n => {
    const mine = data.filter((r: any) => r.coach_id === n.coach)
    // Same resolution as getEffectiveZones: that day's own rows, else the weekly template.
    const dateRows = mine.filter((r: any) => r.kind === 'date' && r.override_date === n.date)
    const dow = new Date(n.date + 'T12:00:00Z').getUTCDay()
    const picked = dateRows.length > 0 ? dateRows : mine.filter((r: any) => r.kind === 'weekly' && r.weekday === dow)
    const z: any = picked.find((r: any) => r.zone_type === 'group' && toMin(r.start_time) <= toMin(n.start) && toMin(n.end) <= toMin(r.end_time))
    return z && z.group_level_min != null && z.group_level_max != null
      ? { level_min: z.group_level_min, level_max: z.group_level_max }
      : { level_min: null, level_max: null }
  })
}
