import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { requireParent } from '@/lib/api-auth'
import { getCoachBlocks, isBlocked } from '@/lib/availability'
import { getEffectiveZones } from '@/lib/zones'
import { getTodayLA, getNowMinutesLA, formatTime12h, minutesUntil, daySlots, LESSON_MINUTES } from '@/lib/date'
import { LEAD_TIME_MINUTES } from '@/lib/tokens'
import { sendEmail } from '@/lib/email'

export const runtime = 'nodejs'

// One continuous 60-minute private lesson = two contiguous 30-minute halves
// (09:10–09:40 + 09:40–10:10) linked by lesson_group_id, one 30-min credit each.
// The second half starts off-grid on purpose: it swallows the 5-minute turnover,
// so the coach's next grid slot is 70 minutes later — a single 10-minute break.
// Halves may be taught by different coaches (relay) when no one covers the hour.

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const TIME_RE = /^\d{2}:\d{2}$/
const HOUR_MINUTES = LESSON_MINUTES * 2
const toMin = (t: string) => { const [h, m] = String(t).slice(0, 5).split(':').map(Number); return h * 60 + m }
const toT = (m: number) => String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0')

type Iv = { s: number; e: number }

async function loadDay(svc: any, date: string, courseTypeId: string) {
  const [{ data: coaches }, { data: sessions }] = await Promise.all([
    svc.from('coaches').select('id, first_name, last_name').eq('is_active', true),
    svc.from('class_sessions')
      .select('id, coach_id, start_time, end_time, course_type_id, enrolled_count, max_students, status')
      .eq('session_date', date).in('status', ['open', 'full']),
  ])
  const ids = (coaches || []).map((c: any) => c.id)
  const blocks = await getCoachBlocks(svc, ids, date)
  const zones = new Map<string, any>()
  await Promise.all(ids.map(async (id: string) => { zones.set(id, await getEffectiveZones(svc, id, date)) }))
  const busy = new Map<string, Iv[]>()
  for (const s of sessions || []) {
    if ((s.enrolled_count || 0) <= 0) continue
    const st = toMin(s.start_time)
    const en = s.end_time ? toMin(s.end_time) : st + LESSON_MINUTES
    if (!busy.has(s.coach_id)) busy.set(s.coach_id, [])
    busy.get(s.coach_id)!.push({ s: st, e: en })
  }
  return { coaches: coaches || [], sessions: sessions || [], blocks, zones, busy }
}

function coachFree(day: any, coachId: string, startMin: number, endMin: number) {
  const eff = day.zones.get(coachId)
  if (!eff) return false
  if (!eff.legacy) {
    const inZone = eff.rows.some((z: any) => z.zone_type === 'private' && toMin(z.start_time) <= startMin && endMin <= toMin(z.end_time))
    if (!inZone) return false
  }
  if (isBlocked(day.blocks, coachId, toT(startMin), toT(endMin))) return false
  return !(day.busy.get(coachId) || []).some((iv: Iv) => startMin < iv.e && endMin > iv.s)
}

export async function POST(req: NextRequest) {
  const auth = await requireParent()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { parent, svc } = auth

  const body = await req.json().catch(() => null)
  if (!body?.action) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  const { action, student_id, session_date } = body
  if (!student_id || !session_date || !DATE_RE.test(session_date))
    return NextResponse.json({ error: 'Missing or invalid fields' }, { status: 400 })

  const { data: ct } = await svc.from('course_types')
    .select('id, name, slug, duration_minutes, max_students').eq('slug', '1on1').single()
  if (!ct) return NextResponse.json({ error: 'Course type missing' }, { status: 500 })

  const { data: student } = await svc.from('students')
    .select('id, parent_id, full_name, current_level').eq('id', student_id).single()
  if (!student || student.parent_id !== parent.id)
    return NextResponse.json({ error: 'Student not found' }, { status: 403 })
  if (student.current_level == null)
    return NextResponse.json({ error: 'This student must complete a Swim Assessment before booking lessons.' }, { status: 403 })

  const today = getTodayLA()
  const nowMin = getNowMinutesLA()
  if (session_date < today) return NextResponse.json({ error: 'That date has passed.' }, { status: 400 })

  const day = await loadDay(svc, session_date, ct.id)
  const nameOf = (id: string) => { const c = day.coaches.find((x: any) => x.id === id); return c ? c.first_name : '' }

  const { data: myBookings } = await svc.from('bookings')
    .select('class_session_id, status').eq('student_id', student_id)
    .not('status', 'in', '("cancelled","pending_partner")')
  const mySessIds = new Set((myBookings || []).map((b: any) => b.class_session_id))
  const mine: Iv[] = day.sessions.filter((s: any) => mySessIds.has(s.id)).map((s: any) => {
    const st = toMin(s.start_time)
    return { s: st, e: s.end_time ? toMin(s.end_time) : st + LESSON_MINUTES }
  })
  const studentBusy = (a: number, b: number) => mine.some(iv => a < iv.e && b > iv.s)

  if (action === 'options') {
    const slots = daySlots()
    const out: any[] = []
    for (const sl of slots) {
      const s1 = toMin(sl.start)
      const mid = s1 + LESSON_MINUTES
      const e2 = s1 + HOUR_MINUTES
      if (minutesUntil(session_date, sl.start, today, nowMin) < LEAD_TIME_MINUTES) continue
      if (studentBusy(s1, e2)) continue
      const firstOk = day.coaches.filter((c: any) => coachFree(day, c.id, s1, mid)).map((c: any) => c.id)
      const secondOk = day.coaches.filter((c: any) => coachFree(day, c.id, mid, e2)).map((c: any) => c.id)
      if (firstOk.length === 0 || secondOk.length === 0) continue
      const both = firstOk.filter((id: string) => secondOk.includes(id))
      const combos = both.length > 0
        ? both.map((id: string) => ({ coach1_id: id, coach2_id: id, relay: false }))
        : firstOk.flatMap((a: string) => secondOk.filter((b: string) => b !== a).map((b: string) => ({ coach1_id: a, coach2_id: b, relay: true })))
      if (combos.length === 0) continue
      out.push({
        start_time: sl.start, mid_time: toT(mid), end_time: toT(e2),
        label: `${formatTime12h(sl.start)} – ${formatTime12h(toT(e2))}`,
        options: combos.map((c: any) => ({ ...c, coach1_name: nameOf(c.coach1_id), coach2_name: nameOf(c.coach2_id) })),
      })
    }
    const { data: credits } = await svc.from('lesson_credits')
      .select('total_credits, used_credits').eq('parent_id', parent.id).eq('course_type_id', ct.id)
      .is('converted_to_token_at', null)
    const remaining = (credits || []).reduce((n: number, c: any) => n + (c.total_credits - c.used_credits), 0)
    return NextResponse.json({ slots: out, credits_remaining: remaining })
  }

  if (action === 'book') {
    const { start_time, coach1_id, coach2_id } = body
    if (!start_time || !TIME_RE.test(start_time) || !coach1_id || !coach2_id)
      return NextResponse.json({ error: 'Missing or invalid fields' }, { status: 400 })
    const s1 = toMin(start_time)
    const mid = s1 + LESSON_MINUTES
    const e2 = s1 + HOUR_MINUTES
    if (!daySlots().some(sl => sl.start === start_time))
      return NextResponse.json({ error: 'That start time is not on the schedule.' }, { status: 400 })
    if (minutesUntil(session_date, start_time, today, nowMin) < LEAD_TIME_MINUTES)
      return NextResponse.json({ error: 'Bookings must be made at least 30 minutes before the lesson starts.' }, { status: 400 })
    if (studentBusy(s1, e2))
      return NextResponse.json({ error: 'This swimmer already has a lesson during that hour.' }, { status: 409 })
    if (!coachFree(day, coach1_id, s1, mid))
      return NextResponse.json({ error: 'The first half is no longer available. Please pick another time.' }, { status: 409 })
    if (!coachFree(day, coach2_id, mid, e2))
      return NextResponse.json({ error: 'The second half is no longer available. Please pick another time.' }, { status: 409 })

    const { data: credits } = await svc.from('lesson_credits')
      .select('id, total_credits, used_credits').eq('parent_id', parent.id).eq('course_type_id', ct.id)
      .is('converted_to_token_at', null).order('expires_at', { ascending: true })
    const pool = (credits || []).map((c: any) => ({ id: c.id, remaining: c.total_credits - c.used_credits })).filter((c: any) => c.remaining > 0)
    const total = pool.reduce((n: number, c: any) => n + c.remaining, 0)
    if (total < 2)
      return NextResponse.json({ error: `A 60-minute lesson uses 2 credits — you have ${total}.` }, { status: 409 })
    const alloc: string[] = []
    for (let i = 0; i < 2; i++) { const c = pool.find((p: any) => p.remaining > 0)!; alloc.push(c.id); c.remaining-- }

    const groupId = randomUUID()
    const halves = [
      { coach_id: coach1_id, start: toT(s1), end: toT(mid), credit: alloc[0] },
      { coach_id: coach2_id, start: toT(mid), end: toT(e2), credit: alloc[1] },
    ]
    const createdBookings: string[] = []
    const createdSessions: string[] = []
    const incremented: string[] = []
    async function rollback() {
      for (const cid of incremented) await svc.rpc('decrement_used_credits', { credit_id: cid })
      if (createdBookings.length > 0) await svc.from('bookings').delete().in('id', createdBookings)
      if (createdSessions.length > 0) await svc.from('class_sessions').delete().in('id', createdSessions)
    }

    for (const h of halves) {
      const { data: existing } = await svc.from('class_sessions')
        .select('id, enrolled_count, max_students')
        .eq('coach_id', h.coach_id).eq('session_date', session_date).eq('start_time', h.start)
        .eq('course_type_id', ct.id).in('status', ['open', 'full']).maybeSingle()
      let sessId: string
      if (existing && existing.enrolled_count < existing.max_students) {
        sessId = existing.id
      } else if (existing) {
        await rollback()
        return NextResponse.json({ error: 'That time just filled up. Please pick another.' }, { status: 409 })
      } else {
        const { data: created, error: sErr } = await svc.from('class_sessions')
          .insert({ course_type_id: ct.id, coach_id: h.coach_id, session_date, start_time: h.start, end_time: h.end, max_students: ct.max_students, enrolled_count: 0, status: 'open' })
          .select('id').single()
        if (sErr || !created) { await rollback(); return NextResponse.json({ error: sErr?.message?.includes('coach_timeslot_conflict') ? 'The coach already has another class at this time.' : 'Could not create the time slot.' }, { status: 409 }) }
        sessId = created.id
        createdSessions.push(created.id)
      }
      const { data: bk, error: bErr } = await svc.from('bookings')
        .insert({ class_session_id: sessId, parent_id: parent.id, student_id: student.id, lesson_credit_id: h.credit, status: 'confirmed', lesson_group_id: groupId })
        .select('id').single()
      if (bErr || !bk) { await rollback(); return NextResponse.json({ error: bErr?.message?.includes('coach_timeslot_conflict') ? 'The coach already has another class at this time.' : 'Could not complete the booking.' }, { status: 409 }) }
      createdBookings.push(bk.id)
      await svc.rpc('increment_used_credits', { credit_id: h.credit })
      incremented.push(h.credit)
    }

    try {
      const { data: p } = await svc.from('parents').select('first_name, email').eq('id', parent.id).single()
      if (p?.email) {
        const who = coach1_id === coach2_id ? nameOf(coach1_id) : `${nameOf(coach1_id)} → ${nameOf(coach2_id)}`
        await sendEmail({
          type: 'booking_confirmed', to: p.email, parentName: p.first_name,
          studentName: student.full_name, courseName: `${ct.name} (60 min)`, coachName: who,
          date: session_date, time: `${formatTime12h(toT(s1))} – ${formatTime12h(toT(e2))}`,
        } as any)
      }
    } catch {}

    return NextResponse.json({ ok: true, lesson_group_id: groupId, booking_ids: createdBookings, start_time: toT(s1), end_time: toT(e2), relay: coach1_id !== coach2_id })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
