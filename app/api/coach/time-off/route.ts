import { NextRequest, NextResponse } from 'next/server'
import { requireCoach } from '@/lib/api-auth'
import { handledTimeOffIds } from '@/lib/time-off'

// DELETE: a coach removes their own time off.
//
// This used to be a direct table delete from the browser, with nothing that
// looked at the families. A coach could remove time off after the admin had
// emailed families that their lessons were cancelled, which left the lessons
// with no record on the admin's Time Off page of why they were cancelled (or,
// under the old two-step flow, still booked and charged) (found 2026-10-07).
// Once families have been told, only the office can change it (owner,
// 2026-10-07).
export async function DELETE(req: NextRequest) {
  const auth = await requireCoach()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { svc, coach } = auth

  const body = await req.json().catch(() => null)
  const id = body?.id
  if (!id || typeof id !== 'string') return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  // Only the coach's own time off; an admin block is the office's.
  const { data: block } = await svc
    .from('coach_time_off')
    .select('id, coach_id, date, start_time, end_time, block_type')
    .eq('id', id)
    .eq('coach_id', coach.id)
    .eq('block_type', 'time_off')
    .maybeSingle()
  if (!block) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const handled = await handledTimeOffIds(svc, [block])
  if (!handled) return NextResponse.json({ error: 'Lookup failed' }, { status: 500 })
  if (handled.has(block.id))
    return NextResponse.json({ error: 'Families have already been told about this time off. Ask the office to change it.', code: 'locked' }, { status: 409 })

  const { data: gone, error } = await svc
    .from('coach_time_off').delete().eq('id', block.id).eq('coach_id', coach.id).select('id')
  if (error || !gone || gone.length === 0) return NextResponse.json({ error: 'Failed to delete' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
