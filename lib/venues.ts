import type { SupabaseClient } from '@supabase/supabase-js'
import { getLocations, type Location } from '@/lib/locations'

/* The pools a parent can check in from with the "I'm here" button.

   Each is a row of `locations` with coordinates, typed in on Admin >
   Locations (docs/migration-locations-checkin.sql) -- it used to be a list in
   this file, so opening a pool meant a code change. A pool with no
   coordinates is not a check-in point; with none set anywhere the button
   never appears and families check in with the QR code as before.

   is_active is NOT a condition: it says whether families can book a pool,
   and the desk may run lessons at one (a coach's first week, a make-up day)
   before opening it to booking. Coordinates are the switch for check-in.

   radiusM is how close counts as "at the pool" (default 150 m: the building
   and its car park at a typical community pool without reaching the street
   beyond); the phone's own accuracy estimate is allowed on top of it, capped,
   so a weak indoor fix does not lock out a parent who is standing at the door. */

export interface CheckInVenue {
  /** locations.id */
  id: string
  name: string
  lat: number
  lng: number
  radiusM: number
}

/** The default "at the pool" distance, as in the migration's column default. */
export const DEFAULT_RADIUS_M = 150

/** The check-in points among these pools: every one with both coordinates. */
export function venuesOf(all: Location[]): CheckInVenue[] {
  return all
    .filter(l => typeof l.lat === 'number' && typeof l.lng === 'number')
    .map(l => ({
      id: l.id,
      name: l.name,
      lat: l.lat as number,
      lng: l.lng as number,
      radiusM: typeof l.checkin_radius_m === 'number' && l.checkin_radius_m > 0 ? l.checkin_radius_m : DEFAULT_RADIUS_M,
    }))
}

/** The check-in points, read from the database. Empty before the migration
 *  (getLocations reads `*`, so rows simply have no lat/lng yet). */
export async function getCheckInVenues(svc: SupabaseClient): Promise<CheckInVenue[]> {
  return venuesOf(await getLocations(svc))
}

/** The most slack a poor GPS fix can add to a venue's radius. */
export const MAX_ACCURACY_SLACK_M = 100
/** A fix worse than this is not evidence of anything. */
export const MAX_ACCURACY_M = 500

/** Great-circle distance in metres. */
export function distanceM(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371000
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(bLat - aLat)
  const dLng = toRad(bLng - aLng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

/** The nearest venue and how far away it is, or null when none are configured. */
export function nearestVenue(venues: CheckInVenue[], lat: number, lng: number): { venue: CheckInVenue; distance: number } | null {
  let best: { venue: CheckInVenue; distance: number } | null = null
  for (const v of venues) {
    const d = distanceM(lat, lng, v.lat, v.lng)
    if (!best || d < best.distance) best = { venue: v, distance: d }
  }
  return best
}
