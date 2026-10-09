import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'
import { readJson, badRequest } from '@/lib/http'
import { getLocations } from '@/lib/locations'

export const runtime = 'nodejs'

// Admin > Locations: the pools (docs/migration-locations.sql). Families read
// the table directly (RLS select), but only the service role writes it, so
// every change goes through here.
//
// GET  -> { locations } every pool, closed-to-families ones too
// POST -> { id, name?, address?, map_url?, is_active? } edits one pool
//         (a refusal carries `code`, which the page turns into its own words)
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
  if (Object.keys(patch).length === 0) return badRequest('Nothing to change')

  const { data, error } = await svc.from('locations').update(patch).eq('id', loc.id)
    .select('id, name, address, map_url, sort_order, is_active').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, location: data })
}
