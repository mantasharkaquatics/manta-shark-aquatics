import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'

// Admin CRUD for coach availability zones (spec v1.1).
// GET ?coach_id → weekly template + legacy hours + tiers
// GET ?coach_id&date → that date's override rows
// PUT → replace weekly template
// POST → date override: { coach_id, date, clear? } | { ..., closed: true } | { ..., zones: [...] }

const VALID_TYPES = ['private', 'group', 'team']
const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m }

function validateZones(zones: any[], needWeekday: boolean): string | null {
  for (const z of zones) {
    if (!VALID_TYPES.includes(z.zone_type)) return 'Invalid zone_type'
    if (needWeekday && (typeof z.weekday !== 'number' || z.weekday < 0 || z.weekday > 6)) return 'Invalid weekday'
    if (!/^\d{2}:\d{2}$/.test(z.start_time) || !/^\d{2}:\d{2}$/.test(z.end_time) || toMin(z.start_time) >= toMin(z.end_time)) return 'Invalid time range'
    if (z.zone_type === 'team') {
      if (!z.team_tier_id) return 'Team zones need a squad'
      if ((toMin(z.end_time) - toMin(z.start_time)) % 90 !== 0) return 'Team blocks must be in 90-minute multiples'
    }
  }
  const groups: Record<string, any[]> = {}
  for (const z of zones) {
    const k = needWeekday ? String(z.weekday) : 'day'
    if (!groups[k]) groups[k] = []
    groups[k].push(z)
  }
  for (const k of Object.keys(groups)) {
    const day = groups[k].sort((a, b) => toMin(a.start_time) - toMin(b.start_time))
    for (let i = 1; i < day.length; i++) {
      if (toMin(day[i].start_time) < toMin(day[i - 1].end_time)) return 'Overlapping zones' + (needWeekday ? ` on weekday ${k}` : '')
    }
  }
  return null
}

export async function GET(req: NextRequest) {
  const auth = await requireAdmin()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const svc = auth.svc

  const coachId = req.nextUrl.searchParams.get('coach_id')
  const date = req.nextUrl.searchParams.get('date')
  if (!coachId) {
    const { data: coaches } = await svc
      .from('coaches').select('id, first_name, last_name').eq('is_active', true).order('first_name')
    return NextResponse.json({ coaches: coaches || [] })
  }
  if (date) {
    const { data: dateRows } = await svc
      .from('coach_availability_zones')
      .select('zone_type, start_time, end_time, team_tier_id')
      .eq('coach_id', coachId).eq('kind', 'date').eq('override_date', date)
      .order('start_time')
    return NextResponse.json({ dateRows: dateRows || [] })
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
  const err = validateZones(zones, true)
  if (err) return NextResponse.json({ error: err }, { status: 400 })

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

export async function POST(req: NextRequest) {
  const auth = await requireAdmin()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const svc = auth.svc

  const { coach_id, date, clear, closed, zones } = await req.json()
  if (!coach_id || !date || !/^\d{4}-\d{2}-\d{2}$/.test(date))
    return NextResponse.json({ error: 'coach_id and date required' }, { status: 400 })

  const { error: delErr } = await svc
    .from('coach_availability_zones').delete()
    .eq('coach_id', coach_id).eq('kind', 'date').eq('override_date', date)
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 })

  if (clear) return NextResponse.json({ ok: true, mode: 'cleared' })

  if (closed) {
    const { error: insErr } = await svc.from('coach_availability_zones').insert({
      coach_id, kind: 'date', override_date: date, zone_type: 'closed',
      start_time: '00:00', end_time: '23:59',
    })
    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 })
    return NextResponse.json({ ok: true, mode: 'closed' })
  }

  if (!Array.isArray(zones) || zones.length === 0)
    return NextResponse.json({ error: 'zones[] required (or closed/clear flag)' }, { status: 400 })
  const err = validateZones(zones, false)
  if (err) return NextResponse.json({ error: err }, { status: 400 })

  const { error: insErr } = await svc.from('coach_availability_zones').insert(
    zones.map((z: any) => ({
      coach_id, kind: 'date', override_date: date, zone_type: z.zone_type,
      start_time: z.start_time, end_time: z.end_time,
      team_tier_id: z.zone_type === 'team' ? z.team_tier_id : null,
    }))
  )
  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 })
  return NextResponse.json({ ok: true, mode: 'set', count: zones.length })
}
