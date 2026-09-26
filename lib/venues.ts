/* The pools a parent can check in from with the "I'm here" button.

   The school rents its pools, so this is a short list kept by hand: add a pool
   when lessons start there, remove it when they stop. While the list is empty
   the button never appears and families check in with the QR code as before.

   radiusM is how close counts as "at the pool". 150 m covers the building and
   its car park at a typical community pool without reaching the street beyond;
   the phone's own accuracy estimate is allowed on top of it, capped, so a weak
   indoor fix does not lock out a parent who is standing at the door. */

export interface CheckInVenue {
  name: string
  lat: number
  lng: number
  radiusM: number
}

export const CHECKIN_VENUES: CheckInVenue[] = []

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
export function nearestVenue(lat: number, lng: number): { venue: CheckInVenue; distance: number } | null {
  let best: { venue: CheckInVenue; distance: number } | null = null
  for (const v of CHECKIN_VENUES) {
    const d = distanceM(lat, lng, v.lat, v.lng)
    if (!best || d < best.distance) best = { venue: v, distance: d }
  }
  return best
}
