import { NextRequest, NextResponse } from 'next/server'
import { requireParent } from '@/lib/api-auth'
import { formatTime12h } from '@/lib/date'
import { sendEmail } from '@/lib/email'
import { commitMove, moveContext, moveOptions, planMove, type MoveTarget } from '@/lib/fixed-move'
import { minToTime, toMin, weekdayOf } from '@/lib/fixed-classes'

export const runtime = 'nodejs'

// Change of slot for a fixed class (換時段) -- lib/fixed-move.ts.
//
// POST { action: 'options', fixed_class_id }
//   -> every weekday/time/coach it could move to, with how many coming weeks are open
// POST { action: 'preview', fixed_class_id, start_date, start_time, coach_id }
//   -> where each remaining lesson would go, and a signature of that plan
// POST { action: 'commit', ...same, sig }
//   -> carries the plan out, if it is still the one the family was shown

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const TIME_RE = /^\d{2}:\d{2}$/

export async function POST(req: NextRequest) {
  const auth = await requireParent()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { parent, svc } = auth
  const body = await req.json().catch(() => null)
  if (!body?.action || typeof body.fixed_class_id !== 'string')
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })

  const ctx = await moveContext(svc, body.fixed_class_id, parent.id)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })

  if (body.action === 'options') {
    const { options, from } = await moveOptions(svc, ctx)
    const { data: coaches } = await svc.from('coaches').select('id, first_name').eq('is_active', true)
    return NextResponse.json({
      options, from, moving: ctx.movable.length, staying: ctx.stay.map(l => l.date),
      coaches: (coaches || []).map((c: any) => ({ id: c.id, first_name: c.first_name })),
    })
  }

  const { start_date, start_time, coach_id } = body
  if (typeof start_date !== 'string' || !DATE_RE.test(start_date) || typeof start_time !== 'string'
      || !TIME_RE.test(start_time) || typeof coach_id !== 'string')
    return NextResponse.json({ error: 'Invalid slot' }, { status: 400 })
  const target: MoveTarget = { startDate: start_date, startTime: start_time, coachId: coach_id }

  const plan = await planMove(svc, ctx, target)
  if ('error' in plan) return NextResponse.json({ error: plan.error }, { status: plan.status })

  if (body.action === 'preview') return NextResponse.json({ plan: plan.items, sig: plan.sig, staying: ctx.stay.map(l => l.date) })

  if (body.action === 'commit') {
    // The family agreed to a particular plan. If the calendar has moved since
    // (someone took a week), they see the new one before anything happens.
    if (body.sig !== plan.sig)
      return NextResponse.json({ error: 'PLAN_CHANGED', plan: plan.items, sig: plan.sig }, { status: 409 })
    const done = await commitMove(svc, ctx, target, plan)
    if ('error' in done) return NextResponse.json({ error: done.error }, { status: done.status })

    try {
      const [{ data: p }, { data: kids }, { data: coaches }] = await Promise.all([
        svc.from('parents').select('first_name, email, preferred_language').eq('id', parent.id).single(),
        svc.from('students').select('full_name').in('id', ctx.studentIds),
        svc.from('coaches').select('id, first_name'),
      ])
      const cName = new Map<string, string>((coaches || []).map((c: any) => [c.id, c.first_name]))
      const end = minToTime(toMin(start_time) + ctx.fc.minutes)
      if (p?.email) await sendEmail({
        type: 'fixed_class_moved', to: p.email, parentName: p.first_name || '', lang: p.preferred_language || 'en',
        studentNames: (kids || []).map((k: any) => k.full_name),
        weekday: weekdayOf(start_date), time: `${formatTime12h(start_time)} – ${formatTime12h(end)}`,
        coachName: cName.get(coach_id) || '', amount: done.vouchers,
        moveItems: plan.items.filter(i => i.to).map(i => ({ date: i.to!, kind: i.kind, coach: cName.get(i.coachId!) || '' })),
      })
    } catch (e) { console.error('fixed-move email failed:', e) }

    return NextResponse.json({ ok: true, moved: done.moved, vouchers: done.vouchers })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
