import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'

// Admin CRUD for coach availability zones (spec v1.1). Weekly template only (C1);
// date overrides handled in a later cut.

const VALID_TYPES = ['private', 'group', 'team']

export async function GET(req: NextRequest) {
  const auth = await requireAdmin()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const svc = auth.svc

  const coachId = req.nextUrl.searchParams.get('coach_id')
  if (!coachId) {
    const { data: coaches } = await svc
      .from('coaches').select('id, first_name, last_name').eq('is_active', true).order('first_name')
    return NextResponse.json({ coaches: coaches || [] })
  }

  const [{ data: weekly }, { data: legacy }, { data: tiers }] = await Promise.all([
    svc.from('coach_availability_zones')
      .select('zone_type, weekday, start_time, end_time, team_tier_id')
      .eq('coach_id', coachId).eq('kind', 'weekly').order('weekday').order('start_time'),
    svc.from('coach_availability')
      .select('day_of_week, start_time, end_time')
      .eq('coach_id', coachId).eq('is_active', true),
    svc.from('team_tiers').select('id, name').eq('active', true).order('level_min'),
  ])
  return NextResponse.json({ weekly: weekly || [], legacy: legacy || [], tiers: tiers || [] })
}

export async function PUT(req: NextRequest) {
  const auth = await requireAdmin()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const svc = auth.svc

  const { coach_id, zones } = await req.json()
  if (!coach_id || !Array.isArray(zones))
    return NextResponse.json({ error: 'coach_id and zones[] required' }, { status: 400 })

  const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m }

  for (const z of zones) {
    if (!VALID_TYPES.includes(z.zone_type))
      return NextResponse.json({ error: 'Invalid zone_type' }, { status: 400 })
    if (typeof z.weekday !== 'number' || z.weekday < 0 || z.weekday > 6)
      return NextResponse.json({ error: 'Invalid weekday' }, { status: 400 })
    if (!/^\d{2}:\d{2}$/.test(z.start_time) || !/^\d{2}:\d{2}$/.test(z.end_time) || toMin(z.start_time) >= toMin(z.end_time))
      return NextResponse.json({ error: 'Invalid time range' }, { status: 400 })
    if (z.zone_type === 'team') {
      if (!z.team_tier_id) return NextResponse.json({ error: 'Team zones need a squad' }, { status: 400 })
      if ((toMin(z.end_time) - toMin(z.start_time)) % 90 !== 0)
        return NextResponse.json({ error: 'Team blocks must be in 90-minute multiples' }, { status: 400 })
    }
  }
  // Overlap check within the submitted template
  for (let d = 0; d < 7; d++) {
    const day = zones.filter((z: any) => z.weekday === d).sort((a: any, b: any) => toMin(a.start_time) - toMin(b.start_time))
    for (let i = 1; i < day.length; i++) {
      if (toMin(day[i].start_time) < toMin(day[i - 1].end_time))
        return NextResponse.json({ error: `Overlapping zones on weekday ${d}` }, { status: 400 })
    }
  }

  const { error: delErr } = await svc
    .from('coach_availability_zones').delete().eq('coach_id', coach_id).eq('kind', 'weekly')
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 })

  if (zones.length > 0) {
    const { error: insErr } = await svc.from('coach_availability_zones').insert(
      zones.map((z: any) => ({
        coach_id, kind: 'weekly', zone_type: z.zone_type, weekday: z.weekday,
        start_time: z.start_time, end_time: z.end_time,
        team_tier_id: z.zone_type === 'team' ? z.team_tier_id : null,
      }))
    )
    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true, count: zones.length })
}
