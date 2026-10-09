import { unstable_cache } from 'next/cache'
import { createClient } from '@supabase/supabase-js'
import { serviceClient } from '@/lib/api-auth'
import { getTodayLA } from '@/lib/date'
import { LOCATION_COLUMNS, activeLocations, showLocations, type Location } from '@/lib/locations'

/* The pool list for the public site's prerendered pages (server only).

   Marketing pages, their metadata, the footer and the sitemap are built ahead
   of time, so they read the locations table through Next's data cache and are
   refreshed every five minutes (ISR): turning a pool on in Admin > Locations
   reaches the public site within five minutes, without a deploy. One cached
   read serves every page, so a busy page does not mean a busy database.

   A failed read -- no env at build, the table not there yet, Supabase down --
   gives an empty list, which every caller treats as "one pool", i.e. the site
   exactly as it was before locations. The read throws inside the cache so a
   failure is never stored; the next request tries again. */

const TTL = 300

// The publishable key is enough: locations has a select policy for anon.
const anon = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } },
)

const readLocations = unstable_cache(async (): Promise<Location[]> => {
  const { data, error } = await anon().from('locations').select(LOCATION_COLUMNS).order('sort_order')
  if (error) throw new Error(error.message)
  return (data || []) as Location[]
}, ['public-locations-v1'], { revalidate: TTL, tags: ['locations'] })

/** Every pool, active or not, in display order; [] when it cannot be read. */
export async function publicLocations(): Promise<Location[]> {
  try { return await readLocations() } catch { return [] }
}

/** The pools a family can see, or [] while only one is open (nothing to show). */
export async function shownLocations(): Promise<Location[]> {
  const all = await publicLocations()
  return showLocations(all) ? activeLocations(all) : []
}

/* First names of the coaches who teach at a pool: anyone active with a
   painted block of hours there -- the weekly template, or a one-day override
   still to come (a single day last spring does not make them a coach of that
   pool). A "closed" block is not teaching. Coaches and zones are not readable
   by anon, hence the service client; only first names leave this function. */
const readCoachesAt = unstable_cache(async (locationId: string): Promise<string[]> => {
  const svc = serviceClient()
  const today = getTodayLA()
  const { data: zones, error } = await svc
    .from('coach_availability_zones')
    .select('coach_id, kind, override_date, zone_type')
    .eq('location_id', locationId)
    .neq('zone_type', 'closed')
  if (error) throw new Error(error.message)
  type Zone = { coach_id: string; kind: string; override_date: string | null }
  const ids = [...new Set(((zones || []) as Zone[])
    .filter(z => z.kind === 'weekly' || (z.override_date && z.override_date >= today))
    .map(z => z.coach_id))]
  if (ids.length === 0) return []
  const { data: coaches, error: cErr } = await svc
    .from('coaches')
    .select('first_name')
    .in('id', ids)
    .eq('is_active', true)
    .order('first_name')
  if (cErr) throw new Error(cErr.message)
  return [...new Set(((coaches || []) as { first_name: string | null }[]).map(c => (c.first_name || '').trim()).filter(Boolean))]
}, ['public-location-coaches-v1'], { revalidate: TTL, tags: ['locations'] })

export interface LocationPageData {
  location: Location
  /** The other pools open to families, for the "also at" links. */
  others: Location[]
  coaches: string[]
}

/** What /locations/[id] shows, or null when that page must not exist: an
 *  unknown or hidden pool, or only one pool open (the site has no location
 *  pages until there is a choice to make). */
export async function locationPageData(id: string): Promise<LocationPageData | null> {
  const active = await shownLocations()
  const location = active.find(l => l.id === id)
  if (!location) return null
  let coaches: string[] = []
  try { coaches = await readCoachesAt(id) } catch { coaches = [] }
  return { location, others: active.filter(l => l.id !== id), coaches }
}

/** Every pool id, for generateStaticParams. Hidden ones too: /zh-Hant and
 *  /zh-Hans only serve ids prerendered at build (app/[locale]/layout.tsx sets
 *  dynamicParams = false), so a pool turned on later must already have its
 *  page, a 404 until then, refreshed by ISR like any other. */
export async function locationIds(): Promise<string[]> {
  return (await publicLocations()).map(l => l.id)
}
