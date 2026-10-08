import type { SupabaseClient } from '@supabase/supabase-js'

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

export async function getEffectiveZones(
  svc: SupabaseClient,
  coachId: string,
  dateStr: string, // YYYY-MM-DD (LA calendar date)
): Promise<EffectiveZones> {
  // Legacy check: a coach with no zone rows at all stays on coach_availability.
  const { count } = await svc
    .from('coach_availability_zones')
    .select('id', { count: 'exact', head: true })
    .eq('coach_id', coachId)
  if (!count || count === 0) return { legacy: true, rows: [], overridden: false }

  const dow = new Date(dateStr + 'T00:00:00').getDay()

  // One query for both candidate sets; date rows win if present.
  const { data } = await svc
    .from('coach_availability_zones')
    .select('zone_type, start_time, end_time, kind, override_date, weekday, group_level_min, group_level_max, team_tier_id')
    .eq('coach_id', coachId)
    .or(`and(kind.eq.date,override_date.eq.${dateStr}),and(kind.eq.weekly,weekday.eq.${dow})`)

  const all = data || []
  const dateRows = all.filter(r => r.kind === 'date')
  const picked = dateRows.length > 0 ? dateRows : all.filter(r => r.kind === 'weekly')

  if (picked.some(r => r.zone_type === 'closed')) return { legacy: false, rows: [], overridden: dateRows.length > 0 }

  const rows = picked
    .map(r => ({ zone_type: r.zone_type, start_time: r.start_time.slice(0, 5), end_time: r.end_time.slice(0, 5), group_level_min: r.group_level_min ?? null, group_level_max: r.group_level_max ?? null, team_tier_id: r.team_tier_id ?? null }))
    .sort((a, b) => a.start_time.localeCompare(b.start_time))
  return { legacy: false, rows, overridden: dateRows.length > 0 }
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
  const { data, error } = await svc
    .from('coach_availability_zones')
    .select('coach_id, zone_type, kind, weekday, override_date, start_time, end_time, group_level_min, group_level_max')
    .in('coach_id', [...new Set(needs.map(n => n.coach))])
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
