import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'
import { getEffectiveZones } from '@/lib/zones'
import { renewalHolds } from '@/lib/fixed-classes'

// GET ?date=YYYY-MM-DD → per-coach effective zone rows for that date
// (null = legacy coach, no zone painting) + active tier order for team colors.
// Also the day's fixed-class renewal holds, so the desk grid can draw a held
// slot as held instead of a plain "+ Book" (2026-10-12; the booking routes
// already refuse it and ask to confirm). One renewalHolds read per day shown,
// not per cell, and it returns at once for any day under three weeks out,
// which is every day a hold cannot reach.
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
  const [holdList] = await Promise.all([
    renewalHolds(svc, date, date, null),
    ...(coaches || []).map(async (c: { id: string }) => {
      const eff = await getEffectiveZones(svc, c.id, date)
      zones[c.id] = eff.legacy ? null : eff.rows
      overridden[c.id] = eff.overridden
    }),
  ])
  const pids = [...new Set(holdList.map(h => h.parentId))]
  const { data: fams } = pids.length
    ? await svc.from('parents').select('id, last_name').in('id', pids)
    : { data: [] as { id: string; last_name: string | null }[] }
  const lastName = new Map((fams || []).map((p: { id: string; last_name: string | null }) => [p.id, p.last_name || '']))
  const holds = holdList.map(h => ({
    coachId: h.coachId, courseTypeId: h.courseTypeId, startMin: h.startMin, endMin: h.endMin,
    seats: h.seats, whole: h.whole, until: h.until, family: lastName.get(h.parentId) || '',
  }))
  return NextResponse.json({
    zones,
    overridden,
    holds,
    tierOrder: (tiers || []).map((t: { id: string }) => t.id),
    tierNames: Object.fromEntries((tiers || []).map((t: { id: string; name: string }) => [t.id, t.name])),
  })
}
