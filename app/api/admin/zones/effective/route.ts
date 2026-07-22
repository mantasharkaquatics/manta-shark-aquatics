import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'
import { getEffectiveZones } from '@/lib/zones'

// GET ?date=YYYY-MM-DD → per-coach effective zone rows for that date
// (null = legacy coach, no zone painting) + active tier order for team colors.
export async function GET(req: NextRequest) {
  const auth = await requireAdmin()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const date = req.nextUrl.searchParams.get('date')
  if (!date) return NextResponse.json({ error: 'date required' }, { status: 400 })
  const svc = auth.svc
  const [{ data: coaches }, { data: tiers }] = await Promise.all([
    svc.from('coaches').select('id').eq('is_active', true),
    svc.from('team_tiers').select('id, name').eq('active', true).order('level_min'),
  ])
  const zones: Record<string, unknown> = {}
  const overridden: Record<string, boolean> = {}
  await Promise.all((coaches || []).map(async (c: { id: string }) => {
    const eff = await getEffectiveZones(svc, c.id, date)
    zones[c.id] = eff.legacy ? null : eff.rows
    overridden[c.id] = eff.overridden
  }))
  return NextResponse.json({
    zones,
    overridden,
    tierOrder: (tiers || []).map((t: { id: string }) => t.id),
    tierNames: Object.fromEntries((tiers || []).map((t: { id: string; name: string }) => [t.id, t.name])),
  })
}
