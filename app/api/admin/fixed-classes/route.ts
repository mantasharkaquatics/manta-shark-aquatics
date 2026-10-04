import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'
import { readJson, badRequest } from '@/lib/http'
import { getTodayLA, getNowMinutesLA } from '@/lib/date'
import { refundBookingPoints } from '@/lib/bookings/refund'
import { issueVoucher, voucherExpiry } from '@/lib/vouchers'
import { sendEmail } from '@/lib/email'

export const runtime = 'nodejs'

const toMin = (t: string) => { const [h, m] = String(t).slice(0, 5).split(':').map(Number); return h * 60 + m }

/** A fixed class's lessons that have not happened yet and can still be cancelled. */
async function remainingLessons(svc: any, fixedClassIds: string[]) {
  if (fixedClassIds.length === 0) return []
  const { data: bs } = await svc.from('bookings')
    .select('id, fixed_class_id, class_session_id, student_id, parent_id, status, points_charged, points_refunded, points_granted, points_granted_expires_at, lesson_group_id')
    .in('fixed_class_id', fixedClassIds).eq('status', 'confirmed')
  const rows = bs || []
  const sessIds = [...new Set(rows.map((b: any) => b.class_session_id))]
  const { data: sess } = sessIds.length
    ? await svc.from('class_sessions').select('id, session_date, start_time').in('id', sessIds)
    : { data: [] }
  const sOf = new Map((sess || []).map((s: any) => [s.id, s]))
  const today = getTodayLA(), now = getNowMinutesLA()
  return rows
    .map((b: any) => ({ ...b, session: sOf.get(b.class_session_id) as any }))
    .filter((b: any) => b.session && (b.session.session_date > today || (b.session.session_date === today && toMin(b.session.start_time) > now)))
}

// Fixed classes for the front desk: who, when, how much is left -- and the
// one thing families cannot do online, ending a class part-way (moving away,
// say). The desk chooses what the remaining lessons become: points back,
// make-up vouchers, or nothing; and writes down why.
export async function GET() {
  const auth = await requireAdmin()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { svc } = auth
  const { data: fcs, error } = await svc.from('fixed_classes')
    .select('id, parent_id, student_id, student2_id, course_type_id, minutes, coach_id, weekday, start_time, status, ended_at, ended_reason, created_at')
    .order('created_at', { ascending: false }).limit(300)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const list = fcs || []
  const ids = list.map((f: any) => f.id)
  const [{ data: all }, left, { data: ps }, { data: ss }, { data: cs }, { data: cts }] = await Promise.all([
    ids.length ? svc.from('bookings').select('fixed_class_id, class_session_id, status, cancellation_reason').in('fixed_class_id', ids) : Promise.resolve({ data: [] as any[] }),
    remainingLessons(svc, list.filter((f: any) => f.status === 'active').map((f: any) => f.id)),
    svc.from('parents').select('id, first_name, last_name').in('id', [...new Set(list.map((f: any) => f.parent_id))]),
    svc.from('students').select('id, full_name').in('id', [...new Set(list.flatMap((f: any) => [f.student_id, f.student2_id]).filter(Boolean))]),
    svc.from('coaches').select('id, first_name').in('id', [...new Set(list.map((f: any) => f.coach_id))]),
    svc.from('course_types').select('id, name, slug'),
  ])
  const pName = new Map((ps || []).map((p: any) => [p.id, `${p.first_name || ''} ${p.last_name || ''}`.trim()]))
  const sName = new Map((ss || []).map((s: any) => [s.id, s.full_name]))
  const cName = new Map((cs || []).map((c: any) => [c.id, c.first_name]))
  const ctOf = new Map((cts || []).map((c: any) => [c.id, c]))
  return NextResponse.json({
    classes: list.map((f: any) => {
      const mine = left.filter((b: any) => b.fixed_class_id === f.id)
      const lessonsLeft = new Set(mine.map((b: any) => b.lesson_group_id || b.class_session_id)).size
      // Lessons moved by a change of slot leave their old rows behind as
      // 'rescheduled'; counting them showed a 10-lesson class as ~18.
      const total = new Set((all || []).filter((b: any) => b.fixed_class_id === f.id && !(b.status === 'cancelled' && b.cancellation_reason === 'rescheduled')).map((b: any) => b.class_session_id)).size
      const ct: any = ctOf.get(f.course_type_id)
      return {
        id: f.id, status: f.status, endedAt: f.ended_at, endedReason: f.ended_reason,
        family: pName.get(f.parent_id) || '',
        swimmers: [sName.get(f.student_id), f.student2_id ? sName.get(f.student2_id) : null].filter(Boolean),
        course: ct?.name || '', courseTypeId: f.course_type_id, courseSlug: ct?.slug || '', minutes: f.minutes,
        coach: cName.get(f.coach_id) || '', weekday: f.weekday, time: String(f.start_time).slice(0, 5),
        lessonsTotal: f.minutes === 60 ? Math.round(total / 2) : total,
        lessonsLeft,
        pointsLeft: mine.reduce((a: number, b: any) => a + Math.max(0, (b.points_charged || 0) - (b.points_refunded || 0)), 0),
        nextDate: mine.map((b: any) => b.session.session_date).sort()[0] || null,
      }
    }),
  })
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { svc, admin } = auth
  const body = await readJson(req)
  if (!body) return badRequest()
  if (body.action !== 'end') return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  const id = String(body.id || '')
  const mode: 'refund' | 'voucher' | 'keep' | '' = ['refund', 'voucher', 'keep'].includes(body.mode) ? body.mode : ''
  const reason = String(body.reason || '').trim().slice(0, 300)
  if (!id || !mode) return NextResponse.json({ error: 'Choose what happens to the remaining lessons.' }, { status: 400 })
  if (!reason) return NextResponse.json({ error: 'Write why the class is ending.' }, { status: 400 })

  // Claimed first: only one press ends it.
  const { data: fcRows } = await svc.from('fixed_classes')
    .update({ status: 'ended', ended_at: new Date().toISOString(), ended_by: admin.id, ended_reason: `${mode}: ${reason}` })
    .eq('id', id).eq('status', 'active').select('*')
  const fc: any = fcRows?.[0]
  if (!fc) return NextResponse.json({ error: 'This class has already ended. Refresh and try again.' }, { status: 409 })
  const { data: ct } = await svc.from('course_types').select('slug, name').eq('id', fc.course_type_id).single()

  const rows = await remainingLessons(svc, [id])
  let refunded = 0, vouchers = 0
  const cancelled: any[] = []
  for (const r of rows) {
    const { data: c } = await svc.from('bookings')
      .update({
        status: 'cancelled', pending_action: null,
        cancellation_reason: mode === 'refund' ? 'cancelled_by_school' : 'cancelled_by_parent',
        cancelled_by: 'admin', cancelled_at: new Date().toISOString(),
      })
      .eq('id', r.id).eq('status', 'confirmed').select('id')
    if (!c || c.length === 0) continue
    cancelled.push(r)
    if (mode === 'refund' && (r.points_charged || 0) > 0)
      refunded += await refundBookingPoints(svc, { booking: r, parentId: r.parent_id, reason: 'cancel_refund', actor: 'admin', note: `Fixed class ended: ${reason}` })
  }
  if (mode === 'voucher') {
    // One voucher per lesson: a sibling 1-on-2's two seats are one lesson, and
    // so are the two halves of an hour.
    const seen = new Set<string>()
    for (const r of cancelled) {
      const key = r.lesson_group_id || r.class_session_id
      if (seen.has(key)) continue
      seen.add(key)
      const v = await issueVoucher(svc, {
        parentId: fc.parent_id, studentId: fc.student_id, student2Id: fc.student2_id,
        courseSlug: ct?.slug || '', minutes: fc.minutes, reason: 'end_of_term',
        expiresOn: voucherExpiry(r.session.session_date), sourceBookingId: r.id, fixedClassId: fc.id,
        createdBy: admin.id, note: reason,
      })
      if (v.voucher) vouchers++
      else console.error('fixed class end: voucher not issued', r.id, v)
    }
  }
  // Sessions nobody is left in are closed.
  for (const sid of new Set(cancelled.map((r: any) => r.class_session_id))) {
    const { count } = await svc.from('bookings').select('id', { count: 'exact', head: true })
      .eq('class_session_id', sid).neq('status', 'cancelled')
    if ((count || 0) === 0) await svc.from('class_sessions').update({ status: 'cancelled' }).eq('id', sid).neq('status', 'cancelled')
  }

  try {
    const { data: p } = await svc.from('parents').select('first_name, email').eq('id', fc.parent_id).single()
    const { data: kids } = await svc.from('students').select('full_name').in('id', [fc.student_id, fc.student2_id].filter(Boolean))
    if (p?.email) await sendEmail({
      type: 'fixed_class_ended', to: p.email, parentName: p.first_name || '',
      studentName: (kids || []).map((k: any) => k.full_name).join(' & '), courseName: ct?.name || '',
      amount: mode === 'refund' ? refunded : mode === 'voucher' ? vouchers : 0, reason: mode,
      lessonsReleased: new Set(cancelled.map((r: any) => r.lesson_group_id || r.class_session_id)).size,
    })
  } catch {}

  // Lessons, not rows: a 60-minute lesson is two rows and a sibling 1-on-2 two
  // seats, and "20 bookings cancelled" for a 10-lesson class read as 20 lessons.
  return NextResponse.json({ ok: true, lessons: new Set(cancelled.map((r: any) => r.lesson_group_id || r.class_session_id)).size, refunded, vouchers })
}
