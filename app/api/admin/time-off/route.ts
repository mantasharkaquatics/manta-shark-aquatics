import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const TIME_RE = /^\d{2}:\d{2}$/

// POST: create an admin block (admin_block)
export async function POST(req: NextRequest) {
  const auth = await requireAdmin()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const svc = auth.svc

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  const { coach_id, date, all_day, start_time, end_time, reason } = body

  if (!coach_id || !date) return NextResponse.json({ error: 'Missing coach or date' }, { status: 400 })
  if (!DATE_RE.test(date)) return NextResponse.json({ error: 'Invalid date format' }, { status: 400 })
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' })
  if (date < today) return NextResponse.json({ error: 'Cannot block past dates' }, { status: 400 })

  let st: string | null = null
  let et: string | null = null
  if (!all_day) {
    if (!start_time || !end_time || !TIME_RE.test(start_time) || !TIME_RE.test(end_time))
      return NextResponse.json({ error: 'Invalid time range' }, { status: 400 })
    if (start_time >= end_time)
      return NextResponse.json({ error: 'End time must be after start time' }, { status: 400 })
    st = start_time
    et = end_time
  }

  const { data: coach } = await svc.from('coaches').select('id').eq('id', coach_id).single()
  if (!coach) return NextResponse.json({ error: 'Coach not found' }, { status: 404 })

  // Overlap check (same coach, same date; all-day or range overlap)
  const { data: existing } = await svc
    .from('coach_time_off')
    .select('id, start_time, end_time')
    .eq('coach_id', coach_id)
    .eq('date', date)
  const toM = (t: string) => { const [h, m] = String(t).slice(0, 5).split(':').map(Number); return h * 60 + m }
  const clash = (existing || []).some((b: any) => {
    if (st == null || b.start_time == null || b.end_time == null) return true
    return toM(st) < toM(b.end_time) && toM(et!) > toM(b.start_time)
  })
  if (clash) return NextResponse.json({ error: 'This overlaps an existing time off or block on that date' }, { status: 409 })

  const { data: created, error } = await svc
    .from('coach_time_off')
    .insert({ coach_id, date, start_time: st, end_time: et, reason: reason || null, block_type: 'admin_block' })
    .select('id, coach_id, date, start_time, end_time, reason, block_type, created_at')
    .single()
  if (error || !created) return NextResponse.json({ error: 'Failed to create block' }, { status: 500 })

  return NextResponse.json({ ok: true, block: created })
}

// PATCH: edit an admin block (time range / reason); coach time off is managed on the Time Off page
export async function PATCH(req: NextRequest) {
  const auth = await requireAdmin()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const svc = auth.svc

  const body = await req.json().catch(() => null)
  if (!body?.id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })
  const { id, all_day, start_time, end_time, reason } = body

  const { data: blk } = await svc.from('coach_time_off').select('id, coach_id, date, block_type').eq('id', id).single()
  if (!blk) return NextResponse.json({ error: 'Block not found' }, { status: 404 })
  if (blk.block_type !== 'admin_block')
    return NextResponse.json({ error: 'Coach time off can only be adjusted from the Time Off page' }, { status: 400 })

  let st: string | null = null
  let et: string | null = null
  if (!all_day) {
    if (!start_time || !end_time || !TIME_RE.test(start_time) || !TIME_RE.test(end_time))
      return NextResponse.json({ error: 'Invalid time range' }, { status: 400 })
    if (start_time >= end_time)
      return NextResponse.json({ error: 'End time must be after start time' }, { status: 400 })
    st = start_time
    et = end_time
  }

  const { data: existing } = await svc
    .from('coach_time_off')
    .select('id, start_time, end_time')
    .eq('coach_id', blk.coach_id)
    .eq('date', blk.date)
    .neq('id', id)
  const toM = (t: string) => { const [h, m] = String(t).slice(0, 5).split(':').map(Number); return h * 60 + m }
  const clash = (existing || []).some((b: any) => {
    if (st == null || b.start_time == null || b.end_time == null) return true
    return toM(st) < toM(b.end_time) && toM(et!) > toM(b.start_time)
  })
  if (clash) return NextResponse.json({ error: 'This overlaps an existing time off or block on that date' }, { status: 409 })

  const { error } = await svc
    .from('coach_time_off')
    .update({ start_time: st, end_time: et, reason: reason || null })
    .eq('id', id)
  if (error) return NextResponse.json({ error: 'Failed to update block' }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// DELETE: remove any block / time off (admin power)
export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const svc = auth.svc

  const body = await req.json().catch(() => null)
  const id = body?.id
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const { error } = await svc.from('coach_time_off').delete().eq('id', id)
  if (error) return NextResponse.json({ error: 'Failed to delete' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
