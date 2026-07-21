import type { SupabaseClient } from '@supabase/supabase-js'

// Coach availability zones (spec v1.0, docs/coach-availability-zones-spec.md).
// Resolution: date rows replace the whole day; 'closed' date row = day off;
// otherwise weekly template; coach with ZERO zone rows = legacy coach_availability.

export interface ZoneRow {
  zone_type: 'private' | 'group' | 'team' | 'closed'
  start_time: string
  end_time: string
}

export interface EffectiveZones {
  legacy: boolean
  rows: ZoneRow[]
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
  if (!count || count === 0) return { legacy: true, rows: [] }

  const dow = new Date(dateStr + 'T00:00:00').getDay()

  // One query for both candidate sets; date rows win if present.
  const { data } = await svc
    .from('coach_availability_zones')
    .select('zone_type, start_time, end_time, kind, override_date, weekday')
    .eq('coach_id', coachId)
    .or(`and(kind.eq.date,override_date.eq.${dateStr}),and(kind.eq.weekly,weekday.eq.${dow})`)

  const all = data || []
  const dateRows = all.filter(r => r.kind === 'date')
  const picked = dateRows.length > 0 ? dateRows : all.filter(r => r.kind === 'weekly')

  if (picked.some(r => r.zone_type === 'closed')) return { legacy: false, rows: [] }

  const rows = picked
    .map(r => ({ zone_type: r.zone_type, start_time: r.start_time.slice(0, 5), end_time: r.end_time.slice(0, 5) }))
    .sort((a, b) => a.start_time.localeCompare(b.start_time))
  return { legacy: false, rows }
}
