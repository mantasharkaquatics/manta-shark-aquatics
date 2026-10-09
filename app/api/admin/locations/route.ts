import { NextRequest, NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { requireAdmin } from '@/lib/api-auth'
import { readJson, badRequest } from '@/lib/http'
import { getLocations, hasCheckInColumns } from '@/lib/locations'

export const runtime = 'nodejs'

// Admin > Locations: the pools (docs/migration-locations.sql). Families read
// the table directly (RLS select), but only the service role writes it, so
// every change goes through here.
//
// GET  -> { locations } every pool, closed-to-families ones too
// POST -> { id, name?, address?, map_url?, is_active?, lat?, lng?, checkin_radius_m? }
//         edits one pool (a refusal carries `code`, which the page turns into
//         its own words). lat/lng are the "I'm here" check-in point
//         (docs/migration-locations-checkin.sql): both or neither; both
//         empty turns self check-in off at that pool.
//
// No create or delete: the two rows come from the migration, and a pool's id
// is referenced by every zone and lesson at it.

export async function GET() {
  const auth = await requireAdmin()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return NextResponse.json({ locations: await getLocations(auth.svc) })
}

const clean = (v: unknown, max: number) => {
  const s = String(v ?? '').trim()
  return s.length > max ? null : s
}

/** A coordinate as typed: empty = none (null), a plain decimal = that number,
 *  anything else = undefined (refused). Parsed here rather than in the page,
 *  because JSON turns a NaN into null and that would quietly clear the point. */
const coord = (v: unknown, limit: number): number | null | undefined => {
  if (v === null || v === undefined) return null
  const s = String(v).trim()
  if (s === '') return null
  if (!/^[-+]?\d+(\.\d+)?$/.test(s)) return undefined
  const n = Number(s)
  return Number.isFinite(n) && Math.abs(n) <= limit ? n : undefined
}

// A database without the check-in columns answers an update naming them with
// "column ... does not exist" (Postgres 42703) or PostgREST's schema-cache
// miss (PGRST204).
const missingColumn = (e: { code?: string; message?: string }) =>
  e.code === '42703' || e.code === 'PGRST204' || /\b(lat|lng|checkin_radius_m)\b/.test(e.message || '')

export async function POST(req: NextRequest) {
  const auth = await requireAdmin()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const svc = auth.svc
  const body = await readJson(req)
  if (!body || typeof body.id !== 'string' || !body.id) return badRequest()

  const all = await getLocations(svc)
  const loc = all.find(l => l.id === body.id)
  if (!loc) return NextResponse.json({ error: 'Unknown location' }, { status: 404 })

  const patch: Record<string, unknown> = {}
  if ('name' in body) {
    const name = clean(body.name, 80)
    if (!name) return NextResponse.json({ error: 'Name is required (80 characters at most)', code: 'name' }, { status: 400 })
    patch.name = name
  }
  if ('address' in body) {
    const address = clean(body.address, 300)
    if (address === null) return NextResponse.json({ error: 'Address is too long', code: 'address' }, { status: 400 })
    patch.address = address || null
  }
  if ('map_url' in body) {
    const url = clean(body.map_url, 2000)
    if (url === null) return NextResponse.json({ error: 'Map link is too long', code: 'mapUrl' }, { status: 400 })
    // Families tap this link on their lesson card and in emails, so only a
    // real web address is stored; anything else would be a dead or odd link.
    if (url && !/^https?:\/\/\S+$/i.test(url)) return NextResponse.json({ error: 'Map link must start with https://', code: 'mapUrl' }, { status: 400 })
    patch.map_url = url || null
  }
  if ('is_active' in body) {
    if (typeof body.is_active !== 'boolean') return badRequest()
    // With no pool open the booking page would have nowhere to book at all.
    // Closing the last one is never what the desk means.
    if (!body.is_active && loc.is_active && all.filter(l => l.is_active).length <= 1)
      return NextResponse.json({ error: 'At least one location must stay open to families', code: 'lastOpen' }, { status: 400 })
    patch.is_active = body.is_active
  }
  const wantsCheckIn = 'lat' in body || 'lng' in body || 'checkin_radius_m' in body
  if (wantsCheckIn) {
    // Before the migration the rest of the page keeps working; only this
    // part is refused, in words the desk can act on.
    if (!hasCheckInColumns(all))
      return NextResponse.json({ error: 'Run docs/migration-locations-checkin.sql first', code: 'needsMigration' }, { status: 409 })
    if ('lat' in body || 'lng' in body) {
      const lat = coord(body.lat, 90)
      const lng = coord(body.lng, 180)
      // Half a point is no point: both or neither.
      if (lat === undefined || lng === undefined || (lat === null) !== (lng === null))
        return NextResponse.json({ error: 'Enter both coordinates (latitude -90 to 90, longitude -180 to 180) or clear both', code: 'coords' }, { status: 400 })
      patch.lat = lat
      patch.lng = lng
    }
    if ('checkin_radius_m' in body) {
      const r = Number(String(body.checkin_radius_m ?? '').trim())
      if (!Number.isInteger(r) || r < 50 || r > 500)
        return NextResponse.json({ error: 'Check-in distance must be 50 to 500 meters', code: 'radius' }, { status: 400 })
      patch.checkin_radius_m = r
    }
  }
  if (Object.keys(patch).length === 0) return badRequest('Nothing to change')

  const { data, error } = await svc.from('locations').update(patch).eq('id', loc.id).select('*').single()
  if (error) {
    if (wantsCheckIn && missingColumn(error))
      return NextResponse.json({ error: 'Run docs/migration-locations-checkin.sql first', code: 'needsMigration' }, { status: 409 })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  // The public site reads the pool list through a five-minute cache
  // (lib/public-locations.ts). Expire it now, so opening or closing a pool, or
  // a new address, shows on the home page, footer and location pages at once.
  revalidateTag('locations', { expire: 0 })
  return NextResponse.json({ ok: true, location: data })
}
