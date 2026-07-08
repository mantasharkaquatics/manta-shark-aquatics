import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'
import { sendEmail } from '@/lib/email'
import { formatTime12h } from '@/lib/date'

const toM = (t: string) => { const [h, m] = String(t).slice(0, 5).split(':').map(Number); return h * 60 + m }

// 找出與 block 區間重疊的 sessions 與 bookings(confirmed + 已因請假取消的,供歷史回溯)
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
  const { data: bookings } = await svc
    .from('bookings')
    .select('id, class_session_id, parent_id, student_id, status, lesson_credit_id, block_notice_sent_at, cancellation_reason')
    .in('class_session_id', ids)
    .or('status.eq.confirmed,and(status.eq.cancelled,cancellation_reason.eq.coach_time_off)')
  return { sessions: overlapped, bookings: bookings || [] }
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

  // 兩步查詢:students / parents / course_types
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

  const items = bookings.map((b: any) => {
    const s: any = sessMap.get(b.class_session_id)
    const stu: any = stuMap.get(b.student_id)
    const par: any = parMap.get(b.parent_id)
    return {
      booking_id: b.id,
      status: b.status,
      notice_sent_at: b.block_notice_sent_at,
      student_name: stu?.full_name || '',
      parent_name: par ? `${par.first_name} ${par.last_name || ''}`.trim() : '',
      course_name: (ctMap.get(s?.course_type_id) as any)?.name || '',
      date: s?.session_date || '',
      time: s ? `${formatTime12h(s.start_time)} \u2013 ${formatTime12h(s.end_time)}` : '',
    }
  }).sort((a: any, b: any) => a.time.localeCompare(b.time))

  if (action === 'list') {
    return NextResponse.json({ items })
  }

  if (action === 'notify') {
    const targets = bookings.filter((b: any) => b.status === 'confirmed' && !b.block_notice_sent_at)
    let sent = 0
    for (const b of targets) {
      const s: any = sessMap.get(b.class_session_id)
      const par: any = parMap.get(b.parent_id)
      const stu: any = stuMap.get(b.student_id)
      if (!s || !par?.email) continue
      const ok = await sendEmail({
        type: 'block_cancellation_notice',
        to: par.email,
        parentName: par.first_name,
        studentName: stu?.full_name || '',
        courseName: (ctMap.get(s.course_type_id) as any)?.name || '',
        coachName,
        date: s.session_date,
        time: `${formatTime12h(s.start_time)} \u2013 ${formatTime12h(s.end_time)}`,
      })
      if (ok) {
        await svc.from('bookings').update({ block_notice_sent_at: new Date().toISOString() }).eq('id', b.id)
        sent++
      }
    }
    return NextResponse.json({ ok: true, sent })
  }

  if (action === 'cancel') {
    const targets = bookings.filter((b: any) => b.status === 'confirmed' && b.block_notice_sent_at)
    if (!targets.length) return NextResponse.json({ error: 'No notified bookings to cancel. Send notices first.' }, { status: 400 })
    let cancelled = 0
    const touchedSessions = new Set<string>()
    for (const b of targets) {
      // claim:只有由 confirmed 翻成 cancelled 的那一方退 credit(防併發雙退)
      const { data: c } = await svc
        .from('bookings')
        .update({
          status: 'cancelled',
          pending_action: null,
          cancellation_reason: 'coach_time_off',
          cancelled_by: 'admin',
        })
        .eq('id', b.id)
        .eq('status', 'confirmed')
        .select('id')
      if (!c || c.length === 0) continue
      if (b.lesson_credit_id) {
        await svc.rpc('decrement_used_credits', { credit_id: b.lesson_credit_id })
      }
      touchedSessions.add(b.class_session_id)
      cancelled++
    }
    // session 若已無任何未取消 booking → 標 cancelled(enrolled_count 交給 trigger)
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
