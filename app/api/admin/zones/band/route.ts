import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'
import { getEffectiveZones } from '@/lib/zones'

// GET ?coach_id&date&start&end → the group level band (if any) covering that slot.
// Used by admin Add Student to warn (not block) on out-of-band students.
export async function GET(req: NextRequest) {
  const auth = await requireAdmin()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const coachId = req.nextUrl.searchParams.get('coach_id')
  const date = req.nextUrl.searchParams.get('date')
  const start = req.nextUrl.searchParams.get('start')
  const end = req.nextUrl.searchParams.get('end')
  if (!coachId || !date || !start || !end)
    return NextResponse.json({ error: 'coach_id, date, start, end required' }, { status: 400 })

  const eff = await getEffectiveZones(auth.svc, coachId, date)
  if (eff.legacy) return NextResponse.json({ band: null })
  const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m }
  const s = toMin(start.slice(0, 5))
  const e = toMin(end.slice(0, 5))
  const z = eff.rows.find(z => z.zone_type === 'group' && toMin(z.start_time) <= s && e <= toMin(z.end_time))
  const band = z && z.group_level_min != null && z.group_level_max != null
    ? { min: z.group_level_min, max: z.group_level_max }
    : null
  return NextResponse.json({ band })
}
