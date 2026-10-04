import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'
import { sendEmail } from '@/lib/email'
import { formatTime12h, getTodayLA, getNowMinutesLA } from '@/lib/date'
import { refundBookingPoints } from '@/lib/bookings/refund'
import { giveBackVouchers } from '@/lib/vouchers'

const toM = (t: string) => { const [h, m] = String(t).slice(0, 5).split(':').map(Number); return h * 60 + m }

// Find sessions and bookings overlapping the block range (confirmed + cancelled-by-leave, for history)
async function getAffected(svc: any, block: any) {
  const { data: sessions } = await svc
    .from('class_sessions')
    .select('id, session_date, start_time, end_time, course_type_id, status')
    .eq('coach_id', block.coach_id)
    .eq('session_date', block.date)
  const overlapped = (sessions || []).filter((s: any) => {
    if (block.start_time == null || block.end_time == null) return true
    return toM(s.start_time) < toM(block.end_time) && toM(s.end_time) > toM(block.start_time)
  })
  if (!overlapped.length) return { sessions: [], bookings: [] }
  const ids = overlapped.map((s: any) => s.id)
  const COLS = 'id, class_session_id, parent_id, student_id, status, points_charged, points_refunded, block_notice_sent_at, cancellation_reason, lesson_group_id, voucher_id'
  const { data: bookings } = await svc
    .from('bookings')
    .select(COLS)
    .in('class_session_id', ids)
    .or('status.eq.confirmed,and(status.eq.cancelled,cancellation_reason.eq.coach_time_off)')
  // A 60-minute lesson is two linked halves. Time off covering only one of
  // them used to cancel and refund that half and leave the other booked
  // (found 2026-10-03): the lesson goes as a whole.
  let all: any[] = bookings || []
  const groups = [...new Set(all.map((b: any) => b.lesson_group_id).filter(Boolean))]
  if (groups.length) {
    const { data: more } = await svc.from('bookings').select(COLS)
      .in('lesson_group_id', groups)
      .or('status.eq.confirmed,and(status.eq.cancelled,cancellation_reason.eq.coach_time_off)')
    const seen = new Set(all.map((b: any) => b.id))
    const extra = (more || []).filter((b: any) => !seen.has(b.id))
    if (extra.length) {
      all = all.concat(extra)
      const missing = [...new Set(extra.map((b: any) => b.class_session_id))].filter(id => !ids.includes(id))
      if (missing.length) {
        const { data: ms } = await svc.from('class_sessions')
          .select('id, session_date, start_time, end_time, course_type_id, status').in('id', missing)
        overlapped.push(...(ms || []))
      }
    }
  }
  return { sessions: overlapped, bookings: all }
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const svc = auth.svc

  const body = await req.json().catch(() => null)
  const { action, block_id } = body || {}
  if (!action || !block_id) return NextResponse.json({ error: 'Missing action or block_id' }, { status: 400 })

  const { data: block } = await svc
    .from('coach_time_off')
    .select('id, coach_id, date, start_time, end_time, block_type')
    .eq('id', block_id)
    .single()
  if (!block) return NextResponse.json({ error: 'Block not found' }, { status: 404 })

  const { sessions, bookings } = await getAffected(svc, block)
  const sessMap = new Map(sessions.map((s: any) => [s.id, s]))

  // A lesson that has ended, or where the swimmer checked in, was delivered:
  // "cancel & refund" used to cancel and refund it anyway (found 2026-10-04).
  // Same rule as cancel-session / cancel-booking, applied per swimmer-lesson so
  // both halves of a 60-minute lesson stay together.
  const lessonKey = (b: any) => `${b.lesson_group_id || b.class_session_id}|${b.student_id}`
  const today = getTodayLA()
  const nowMin = getNowMinutesLA()
  const hasEnded = (s: any) => !!s && (s.session_date < today || (s.session_date === today && !!s.end_time && toM(s.end_time) <= nowMin))
  const { data: attended } = bookings.length
    ? await svc.from('attendance').select('booking_id').in('booking_id', bookings.map((b: any) => b.id))
    : { data: [] }
  const attendedIds = new Set((attended || []).map((a: any) => a.booking_id))
  const delivered = new Set<string>()
  for (const b of bookings) {
    if (attendedIds.has(b.id) || hasEnded(sessMap.get(b.class_session_id))) delivered.add(lessonKey(b))
  }

  // Two-step queries: students / parents / course_types
  const stuIds = [...new Set(bookings.map((b: any) => b.student_id).filter(Boolean))]
  const parIds = [...new Set(bookings.map((b: any) => b.parent_id).filter(Boolean))]
  const ctIds = [...new Set(sessions.map((s: any) => s.course_type_id).filter(Boolean))]
  const [{ data: stus }, { data: pars }, { data: cts }, { data: coach }] = await Promise.all([
    stuIds.length ? svc.from('students').select('id, full_name').in('id', stuIds) : Promise.resolve({ data: [] }),
    parIds.length ? svc.from('parents').select('id, first_name, last_name, email').in('id', parIds) : Promise.resolve({ data: [] }),
    ctIds.length ? svc.from('course_types').select('id, name').in('id', ctIds) : Promise.resolve({ data: [] }),
    svc.from('coaches').select('first_name, last_name').eq('id', block.coach_id).single(),
  ])
  const stuMap = new Map((stus || []).map((x: any) => [x.id, x]))
  const parMap = new Map((pars || []).map((x: any) => [x.id, x]))
  const ctMap = new Map((cts || []).map((x: any) => [x.id, x]))
  const coachName = coach ? (coach.first_name + ' ' + (coach.last_name || '')).trim() : ''

  // Sorted on sort_key (raw date + 24-hour start): sorting the formatted
  // 12-hour text put "1:00 PM" before "9:00 AM" (found 2026-10-04).
  const items = bookings.map((b: any) => {
    const s: any = sessMap.get(b.class_session_id)
    const stu: any = stuMap.get(b.student_id)
    const par: any = parMap.get(b.parent_id)
    return {
      booking_id: b.id,
      lesson_key: lessonKey(b),
      delivered: delivered.has(lessonKey(b)),
      sort_key: s ? `${s.session_date} ${String(s.start_time).slice(0, 5)}` : '',
      status: b.status,
      notice_sent_at: b.block_notice_sent_at,
      student_name: stu?.full_name || '',
      parent_name: par ? `${par.first_name} ${par.last_name || ''}`.trim() : '',
      course_name: (ctMap.get(s?.course_type_id) as any)?.name || '',
      course_type_id: s?.course_type_id || null,
      date: s?.session_date || '',
      time: s ? `${formatTime12h(s.start_time)} \u2013 ${formatTime12h(s.end_time)}` : '',
    }
  }).sort((a: any, b: any) => a.sort_key.localeCompare(b.sort_key))

  if (action === 'list') {
    return NextResponse.json({ items })
  }

  if (action === 'notify') {
    const targets = bookings.filter((b: any) => b.status === 'confirmed' && !b.block_notice_sent_at && !delivered.has(lessonKey(b)))
    let sent = 0
    // One email per family per lesson: a 60-minute lesson's two halves and a
    // sibling pair's two seats used to send two (found 2026-10-03).
    const byLesson = new Map<string, any[]>()
    for (const b of targets) {
      const k = `${b.parent_id}|${b.lesson_group_id || b.class_session_id}`
      byLesson.set(k, [...(byLesson.get(k) || []), b])
    }
    for (const rows of byLesson.values()) {
      const sorted = [...rows].sort((x: any, y: any) => String((sessMap.get(x.class_session_id) as any)?.start_time || '').localeCompare(String((sessMap.get(y.class_session_id) as any)?.start_time || '')))
      const b = sorted[0]
      const s: any = sessMap.get(b.class_session_id)
      const sLast: any = sessMap.get(sorted[sorted.length - 1].class_session_id) || s
      const par: any = parMap.get(b.parent_id)
      const names = [...new Set(rows.map((r: any) => (stuMap.get(r.student_id) as any)?.full_name).filter(Boolean))]
      if (!s || !par?.email) continue
      // A make-up was paid with a voucher, which comes back -- not points.
      const kind = rows.some((r: any) => r.points_charged) ? 'points' : rows.some((r: any) => r.voucher_id) ? 'voucher' : 'none'
      const ok = await sendEmail({
        type: 'block_cancellation_notice',
        refundKind: kind,
        to: par.email,
        parentName: par.first_name,
        studentName: names.join(' & '),
        courseName: (ctMap.get(s.course_type_id) as any)?.name || '',
        coachName,
        date: s.session_date,
        time: `${formatTime12h(s.start_time)} \u2013 ${formatTime12h(sLast.end_time)}`,
      })
      if (ok) {
        await svc.from('bookings').update({ block_notice_sent_at: new Date().toISOString() }).in('id', rows.map((r: any) => r.id))
        sent++
      }
    }
    return NextResponse.json({ ok: true, sent })
  }

  if (action === 'cancel') {
    const targets = bookings.filter((b: any) => b.status === 'confirmed' && b.block_notice_sent_at && !delivered.has(lessonKey(b)))
    if (!targets.length) return NextResponse.json({ error: 'No notified bookings to cancel. Send notices first.' }, { status: 400 })
    let cancelled = 0
    const touchedSessions = new Set<string>()
    for (const b of targets) {
      // claim: only the side that flips confirmed→cancelled refunds the credit (prevents concurrent double refunds)
      const { data: c } = await svc
        .from('bookings')
        .update({
          status: 'cancelled',
          pending_action: null,
          cancellation_reason: 'coach_time_off',
          cancelled_by: 'admin',
          cancelled_at: new Date().toISOString(),
        })
        .eq('id', b.id)
        .eq('status', 'confirmed')
        .select('id')
      if (!c || c.length === 0) continue
      // Coach time-off is a school-side cancellation: full points back, no
      // allowance spent, however close to the lesson it happens.
      await refundBookingPoints(svc, {
        booking: b, parentId: b.parent_id, reason: 'school_cancel',
        actor: 'admin', note: 'Coach unavailable',
      })
      // A make-up lesson cost a voucher, not points: that comes back instead.
      await giveBackVouchers(svc, [b.id])
      touchedSessions.add(b.class_session_id)
      cancelled++
    }
    // If the session has no remaining active bookings → mark cancelled (enrolled_count handled by trigger)
    for (const sid of touchedSessions) {
      const { data: remain } = await svc
        .from('bookings')
        .select('id')
        .eq('class_session_id', sid)
        .neq('status', 'cancelled')
        .limit(1)
      if (!remain || remain.length === 0) {
        await svc.from('class_sessions').update({ status: 'cancelled' }).eq('id', sid).neq('status', 'cancelled')
      }
    }
    return NextResponse.json({ ok: true, cancelled })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
