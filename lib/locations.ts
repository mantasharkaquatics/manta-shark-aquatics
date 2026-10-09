import type { SupabaseClient } from '@supabase/supabase-js'

/* The pools the school teaches at (docs/migration-locations.sql).

   Where a lesson is lives on the lesson itself (class_sessions.location_id),
   filled by a database trigger from the coach's zone that covers its start --
   so no booking route sets it, and no route can set it wrong. The zones
   (coach_availability_zones.location_id) are where the admin decides it.

   is_active = families can see and book that pool. While only one pool is
   active the site looks exactly as it did with one pool: no picker, no
   location line on cards or emails (showLocations). */

export interface Location {
  id: string
  name: string
  address: string | null
  map_url: string | null
  sort_order: number
  is_active: boolean
  /** The "I'm here" check-in point (docs/migration-locations-checkin.sql).
   *  Absent (undefined) before that migration has run; null = not set. */
  lat?: number | null
  lng?: number | null
  checkin_radius_m?: number
}

/** The pool every existing zone and lesson belongs to. */
export const DEFAULT_LOCATION_ID = 'brea'

/** The columns every phase-1 pool row has. getLocations reads `*` instead, so
 *  the check-in columns come along once docs/migration-locations-checkin.sql
 *  has run and nothing breaks before it has (a fixed list naming lat/lng
 *  would fail outright on a database without them). */
export const LOCATION_COLUMNS = 'id, name, address, map_url, sort_order, is_active'

/** Every pool, active or not, in display order. Empty before the migration. */
export async function getLocations(svc: SupabaseClient): Promise<Location[]> {
  const { data, error } = await svc.from('locations').select('*').order('sort_order')
  if (error || !data) return []
  return data as Location[]
}

/** Whether the check-in columns exist yet (docs/migration-locations-checkin.sql). */
export const hasCheckInColumns = (all: Location[]) => all.some(l => 'checkin_radius_m' in l)

export const activeLocations = (all: Location[]) => all.filter(l => l.is_active)

/** More than one pool open to families: the picker and the location lines show. */
export const showLocations = (all: Location[]) => activeLocations(all).length > 1

/** "Monrovia" or "Monrovia · 123 Main St" -- for email rows and SMS. */
export function locationLine(loc: Pick<Location, 'name' | 'address'> | null | undefined): string {
  if (!loc) return ''
  const addr = (loc.address || '').trim()
  return addr && addr.toLowerCase() !== loc.name.trim().toLowerCase() ? `${loc.name} · ${addr}` : loc.name
}

/** A Google Maps link for the pool: its own map_url, else a search for the address. */
export function locationMapUrl(loc: Pick<Location, 'name' | 'address' | 'map_url'> | null | undefined): string | null {
  if (!loc) return null
  if (loc.map_url) return loc.map_url
  const q = (loc.address || '').trim()
  return q ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}` : null
}

/**
 * The location line for a lesson's emails and SMS, or undefined while only one
 * pool is open to families (so nothing changes until a second one opens).
 * Reads the pool list once per call; callers sending many emails pass `all`.
 */
export async function lessonLocationLine(
  svc: SupabaseClient,
  locationId: string | null | undefined,
  all?: Location[],
): Promise<string | undefined> {
  const list = all ?? await getLocations(svc)
  if (!showLocations(list)) return undefined
  const loc = list.find(l => l.id === (locationId || DEFAULT_LOCATION_ID))
  return loc ? locationLine(loc) : undefined
}

/** The location of one lesson (class_sessions row), for routes that only hold its id. */
export async function sessionLocationLine(svc: SupabaseClient, sessionId: string | null | undefined): Promise<string | undefined> {
  if (!sessionId) return undefined
  const list = await getLocations(svc)
  if (!showLocations(list)) return undefined
  const { data } = await svc.from('class_sessions').select('location_id').eq('id', sessionId).maybeSingle()
  const loc = list.find(l => l.id === ((data as any)?.location_id || DEFAULT_LOCATION_ID))
  return loc ? locationLine(loc) : undefined
}

/**
 * Whether a zone row belongs to the pool a family is booking at. No pool asked
 * for = every row (staff screens, and callers that predate locations). A row
 * read before the migration has no location_id and counts as the default pool.
 */
export function zoneAtLocation(row: { location_id?: string | null }, locationId: string | null | undefined): boolean {
  if (!locationId) return true
  return (row.location_id || DEFAULT_LOCATION_ID) === locationId
}

/** A `location` query parameter, checked against the known ids; null when absent or unknown. */
export function locationParam(raw: string | null | undefined, all: Location[]): string | null {
  if (!raw) return null
  if (all.length === 0) return raw === DEFAULT_LOCATION_ID ? raw : null
  return all.some(l => l.id === raw) ? raw : null
}

/**
 * The location line of many lessons at once (class_sessions id -> line), for
 * emails that list a batch. Empty while only one pool is open to families, so
 * a caller that finds nothing in it sends the email exactly as before.
 */
export async function sessionLocationLines(svc: SupabaseClient, sessionIds: (string | null | undefined)[]): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  const ids = [...new Set(sessionIds.filter((x): x is string => !!x))]
  if (ids.length === 0) return out
  const list = await getLocations(svc)
  if (!showLocations(list)) return out
  for (let i = 0; i < ids.length; i += 150) {
    const { data } = await svc.from('class_sessions').select('id, location_id').in('id', ids.slice(i, i + 150))
    for (const r of (data || []) as { id: string; location_id: string | null }[]) {
      const loc = list.find(l => l.id === (r.location_id || DEFAULT_LOCATION_ID))
      if (loc) out.set(r.id, locationLine(loc))
    }
  }
  return out
}
