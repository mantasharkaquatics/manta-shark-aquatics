import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdmin } from '@/lib/api-auth'

const svc = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Get one coach's weekly availability
export async function GET(req: NextRequest) {
  const auth = await requireAdmin()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const coachId = req.nextUrl.searchParams.get('coach_id')
  if (!coachId) return NextResponse.json({ error: 'coach_id required' }, { status: 400 })

  const { data, error } = await svc()
    .from('coach_availability')
    .select('id, day_of_week, start_time, end_time, is_active')
    .eq('coach_id', coachId)
    .order('day_of_week')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ availability: data })
}

// Replace one coach's weekly availability (idempotent full-write)
export async function PUT(req: NextRequest) {
  const auth = await requireAdmin()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { coach_id, days } = await req.json()
  if (!coach_id || !Array.isArray(days)) {
    return NextResponse.json({ error: 'coach_id and days[] required' }, { status: 400 })
  }
  for (const d of days) {
    if (typeof d.day_of_week !== 'number' || d.day_of_week < 0 || d.day_of_week > 6) {
      return NextResponse.json({ error: 'Invalid day_of_week' }, { status: 400 })
    }
    if (!/^\d{2}:\d{2}$/.test(d.start_time) || !/^\d{2}:\d{2}$/.test(d.end_time)) {
      return NextResponse.json({ error: 'Times must be HH:MM' }, { status: 400 })
    }
    if (d.start_time >= d.end_time) {
      return NextResponse.json({ error: 'start_time must be before end_time' }, { status: 400 })
    }
  }

  const s = svc()
  const { error: delErr } = await s.from('coach_availability').delete().eq('coach_id', coach_id)
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 })

  if (days.length > 0) {
    const rows = days.map((d: any) => ({
      coach_id,
      day_of_week: d.day_of_week,
      start_time: d.start_time,
      end_time: d.end_time,
      is_active: true,
    }))
    const { error: insErr } = await s.from('coach_availability').insert(rows)
    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
