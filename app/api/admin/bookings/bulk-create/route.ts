import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { requireAdmin } from '@/lib/api-auth'
import { sendEmail } from '@/lib/email'
import { getTodayLA, getNowMinutesLA, formatTime12h } from '@/lib/date'
import { getEffectiveZones, zoneTypeForSlug } from '@/lib/zones'
import { isWithinTokenWindow, tokenSlugsForTarget } from '@/lib/tokens'

// Recurring bulk booking for admin.
// action=preview: generate weekly candidate dates with per-date conflict status.
// action=commit: re-validate confirmed dates, create sessions/bookings, FIFO credit
// deduction via atomic RPCs, full rollback on any failure. enrolled_count is owned
// by DB trigger trg_booking_count and never touched here.
// All date math is pure YYYY-MM-DD string arithmetic in UTC domain; "today" and
// "now" come from lib/date.ts LA helpers. Same-day bookings are allowed as long
// as the start time has not passed in LA.

type Candidate = { date: string; status: 'ok' | 'past' | 'coach_time_off' | 'conflict' | 'full' | 'skipped' }

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const TIME_RE = /^\d{2}:\d{2}(:\d{2})?$/

function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}
function minutesToTime(mins: number): string {
  const h = String(Math.floor(mins / 60)).padStart(2, '0')
  const m = String(mins % 60).padStart(2, '0')
  return `${h}:${m}:00`
}

async function evaluateDates(
  svc: any,
  opts: { coachId: string; courseTypeId: string; startTime: string; startDate: string; count: number; spotsNeeded: number; skipDates: string[]; hour?: boolean; durationMinutes?: number }
): Promise<Candidate[]> {
  const { coachId, courseTypeId, startTime, startDate, count, spotsNeeded, skipDates, hour, durationMinutes } = opts
  const today = getTodayLA()
  const nowMins = getNowMinutesLA()
  const startMins = timeToMinutes(startTime)

  // Generate enough weekly candidates to cover skips/conflicts (safety cap)
  const maxWeeks = count * 3 + 12
  const allDates: string[] = []
  for (let i = 0; i < maxWeeks; i++) allDates.push(addDays(startDate, i * 7))

  const { data: timeOffRows } = await svc
    .from('coach_time_off')
    .select('date')
    .eq('coach_id', coachId)
    .in('date', allDates)
  const timeOffSet = new Set((timeOffRows || []).map((r: any) => r.date))

  const { data: sessRows } = await svc
    .from('class_sessions')
    .select('session_date, start_time, end_time, course_type_id, enrolled_count, max_students, status')
    .eq('coach_id', coachId)
    .in('session_date', allDates)
    .in('status', ['open', 'full'])
  const sessByDate = new Map<string, any[]>()
  for (const s of sessRows || []) {
    if (!sessByDate.has(s.session_date)) sessByDate.set(s.session_date, [])
    sessByDate.get(s.session_date)!.push(s)
  }

  const skipSet = new Set(skipDates)
  const candidates: Candidate[] = []
  let okCount = 0

  for (const date of allDates) {
    if (okCount >= count) break
    let status: Candidate['status'] = 'ok'

    // Past dates are allowed: this API is admin-only (requireAdmin) and past
    // bookings are legitimate back-entries of lessons that already happened
    // (credits deducted as normal). Conflict/time-off/capacity checks still apply.
    if (skipSet.has(date)) status = 'skipped'
    else if (timeOffSet.has(date)) status = 'coach_time_off'
    else if (hour) {
      // An hour occupies two halves and the second one starts OFF the grid, so a
      // lesson at the next grid slot overlaps it without sharing a start time.
      // Equality would miss that; the whole span has to be tested as an interval.
      const spanStart = startMins
      const spanEnd = startMins + (durationMinutes || 30) * 2
      const clash = (sessByDate.get(date) || []).some((s: any) => {
        if ((s.enrolled_count || 0) <= 0) return false
        const ss = timeToMinutes(s.start_time)
        const se = s.end_time ? timeToMinutes(s.end_time) : ss + (durationMinutes || 30)
        return spanStart < se && spanEnd > ss
      })
      if (clash) status = 'conflict'
    }
    else {
      const daySessions = sessByDate.get(date) || []
      const sameSlot = daySessions.filter((s: any) => timeToMinutes(s.start_time) === startMins)
      const matching = sameSlot.find((s: any) => s.course_type_id === courseTypeId)
      const foreign = sameSlot.find((s: any) => s.course_type_id !== courseTypeId && s.enrolled_count > 0)
      if (foreign) status = 'conflict'
      else if (matching && matching.enrolled_count + spotsNeeded > matching.max_students) status = 'full'
    }

    if (status === 'ok') okCount++
    candidates.push({ date, status })
  }
  return candidates
}

async function allocateCredits(svc: any, parentId: string, courseTypeId: string, needed: number) {
  const { data: credits } = await svc
    .from('lesson_credits')
    .select('id, used_credits, total_credits')
    .eq('parent_id', parentId)
    .eq('course_type_id', courseTypeId)
    .is('converted_to_token_at', null)
    .order('expires_at', { ascending: true })
  const pool = (credits || []).map((c: any) => ({ id: c.id, remaining: c.total_credits - c.used_credits }))
  const totalRemaining = pool.reduce((s: number, c: any) => s + c.remaining, 0)
  if (totalRemaining < needed) return { ok: false as const, totalRemaining, allocation: [] as string[] }
  const allocation: string[] = []
  for (let i = 0; i < needed; i++) {
    const c = pool.find((p: any) => p.remaining > 0)!
    allocation.push(c.id)
    c.remaining--
  }
  return { ok: true as const, totalRemaining, allocation }
}

// Tokens spendable on this course type, earliest-expiring first. Mirrors the
// parent-side pool: pickTokenPackage cannot be reused because it re-picks the
// same package, and we need the whole pool to count what is available.
async function tokenPool(svc: any, parentId: string, targetSlug: string): Promise<{ id: string; remaining: number }[]> {
  const slugs = tokenSlugsForTarget(targetSlug)
  if (slugs.length === 0) return []
  const { data: ctRows } = await svc.from('course_types').select('id, slug').in('slug', slugs)
  const ctIds = (ctRows ?? []).map((r: any) => r.id)
  if (ctIds.length === 0) return []
  const { data: packs } = await svc.from('token_packages')
    .select('id, total_tokens, used_tokens, expires_at')
    .eq('parent_id', parentId).in('course_type_id', ctIds)
    .gt('expires_at', new Date().toISOString())
    .order('expires_at', { ascending: true })
  return (packs ?? []).map((x: any) => ({ id: x.id, remaining: x.total_tokens - x.used_tokens })).filter((x: any) => x.remaining > 0)
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const svc = auth.svc

  const body = await req.json().catch(() => null)
  if (!body?.action) return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })

  const { action, coach_id, course_type_id, start_time, student_id, student2_id, payment_method, hour } = body
  if (!coach_id || !course_type_id || !start_time || !student_id) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }
  if (!TIME_RE.test(start_time)) {
    return NextResponse.json({ error: 'Invalid start_time format (HH:MM or HH:MM:SS)' }, { status: 400 })
  }
  if (student2_id && student2_id === student_id) {
    return NextResponse.json({ error: 'Student 2 must be different from Student 1' }, { status: 400 })
  }

  const { data: ct } = await svc
    .from('course_types')
    .select('id, name, slug, duration_minutes, max_students')
    .eq('id', course_type_id)
    .single()
  if (!ct) return NextResponse.json({ error: 'Course type not found' }, { status: 404 })

  const { data: student1 } = await svc.from('students').select('id, parent_id, full_name, current_level').eq('id', student_id).single()
  if (!student1) return NextResponse.json({ error: 'Student not found' }, { status: 404 })
  let student2: any = null
  if (student2_id) {
    const { data } = await svc.from('students').select('id, parent_id, full_name, current_level').eq('id', student2_id).single()
    if (!data) return NextResponse.json({ error: 'Student 2 not found' }, { status: 404 })
    student2 = data
  }
  // A 60-minute lesson is 1-on-1 only and single-swimmer, matching the parent
  // side. It costs two of everything: two half-sessions, two bookings sharing a
  // lesson_group_id, two credits (or two tokens).
  if (hour && (ct.slug !== '1on1' || student2))
    return NextResponse.json({ error: '60-minute lessons are 1-on-1 with a single swimmer.' }, { status: 400 })
  const spotsNeeded = student2 ? 2 : 1
  const twoFromParent1 = !!hour || (student2 ? student2.parent_id === student1.parent_id : false)
  const sameParent = student2 ? student2.parent_id === student1.parent_id : false

  if (action === 'preview') {
    const { start_date, count, skip_dates } = body
    if (!start_date || !DATE_RE.test(start_date) || !count || count < 1 || count > 50) {
      return NextResponse.json({ error: 'Invalid start_date (YYYY-MM-DD) or count (1-50)' }, { status: 400 })
    }
    if (Array.isArray(skip_dates) && skip_dates.some((d: any) => typeof d !== 'string' || !DATE_RE.test(d))) {
      return NextResponse.json({ error: 'Invalid skip_dates format' }, { status: 400 })
    }
    const candidates = await evaluateDates(svc, {
      coachId: coach_id, courseTypeId: course_type_id, startTime: start_time,
      startDate: start_date, count, spotsNeeded, skipDates: skip_dates || [], hour: !!hour, durationMinutes: ct.duration_minutes,
    })
    const needed1 = twoFromParent1 ? count * 2 : count
    const alloc1 = await allocateCredits(svc, student1.parent_id, course_type_id, needed1)
    let credits2Remaining: number | null = null
    let creditsOk = alloc1.ok
    if (student2 && !sameParent) {
      const alloc2 = await allocateCredits(svc, student2.parent_id, course_type_id, count)
      credits2Remaining = alloc2.totalRemaining
      creditsOk = creditsOk && alloc2.ok
    }
    const nameIds = student2 && !sameParent ? [student1.parent_id, student2.parent_id] : [student1.parent_id]
    const { data: pRows } = await svc.from('parents').select('id, first_name, last_name').in('id', nameIds)
    const nameOf = (pid: string) => {
      const r = (pRows || []).find(x => x.id === pid)
      return r ? `${r.first_name} ${r.last_name || ''}`.trim() : ''
    }
    const tp = await tokenPool(svc, student1.parent_id, ct.slug || '')
    const tokensRemaining = tp.reduce((n: number, x: any) => n + x.remaining, 0)
    return NextResponse.json({
      candidates,
      tokens: {
        remaining: tokensRemaining,
        eligible: !student2 && count === 1 && isWithinTokenWindow(start_date, String(start_time).slice(0, 5)),
      },
      credits: {
        parent1_name: nameOf(student1.parent_id), parent1_remaining: alloc1.totalRemaining, parent1_needed: needed1,
        parent2_name: student2 && !sameParent ? nameOf(student2.parent_id) : null,
        parent2_remaining: credits2Remaining, parent2_needed: student2 && !sameParent ? count : null, sufficient: creditsOk,
      },
    })
  }

  if (action === 'commit') {
    const { dates } = body
    if (!Array.isArray(dates) || dates.length < 1 || dates.length > 50 || dates.some((d: any) => typeof d !== 'string' || !DATE_RE.test(d))) {
      return NextResponse.json({ error: 'Invalid dates' }, { status: 400 })
    }
    // Re-validate every confirmed date server-side
    const candidates = await evaluateDates(svc, {
      coachId: coach_id, courseTypeId: course_type_id, startTime: start_time,
      startDate: dates[0], count: 1000, spotsNeeded, skipDates: [], hour: !!hour, durationMinutes: ct.duration_minutes,
    })
    const statusByDate = new Map(candidates.map(c => [c.date, c.status]))
    for (const d of dates) {
      const st = statusByDate.get(d)
      if (st !== 'ok') {
        return NextResponse.json({ error: `Date ${d} is no longer available (${st || 'out of range'})` }, { status: 409 })
      }
    }

    // Level-band hard block (owner rule): banded 1on4 rejects out-of-band students for everyone, admin included.
    if (zoneTypeForSlug(ct.slug || '') === 'group') {
      const slotStartMin = timeToMinutes(start_time)
      const slotEndMin = slotStartMin + ct.duration_minutes
      for (const d of dates) {
        const eff = await getEffectiveZones(svc, coach_id, d)
        if (eff.legacy) continue
        const z = eff.rows.find(z => z.zone_type === 'group' && timeToMinutes(z.start_time) <= slotStartMin && slotEndMin <= timeToMinutes(z.end_time))
        if (!z || z.group_level_min == null || z.group_level_max == null) continue
        for (const stu of [student1, student2].filter(Boolean)) {
          if (stu.current_level == null || stu.current_level < z.group_level_min || stu.current_level > z.group_level_max) {
            const who = stu.current_level == null ? `${stu.full_name} has not been assessed yet` : `${stu.full_name} is Level ${stu.current_level}`
            return NextResponse.json({ error: `${who}; the ${d} class is Level ${z.group_level_min}\u2013${z.group_level_max} only.` }, { status: 409 })
          }
        }
      }
    }

    // Payment method is the operator's explicit choice; credits stay the default
    // so every existing caller behaves exactly as before. Tokens are same-day /
    // next-day only and weekly dates sit seven days apart, so at most one date in
    // a series could ever qualify — a token booking is therefore single-date and
    // single-swimmer by construction, matching the parent-side rule.
    const payWithToken = payment_method === 'token'
    let tokenAlloc: string[] = []
    let credit1PerDate: string[] = []
    let credit2PerDate: string[] = []
    if (payWithToken) {
      if (dates.length !== 1)
        return NextResponse.json({ error: 'Tokens are valid today or tomorrow only, so they cannot pay for a recurring series — book a single date.' }, { status: 400 })
      if (student2)
        return NextResponse.json({ error: 'A token covers one swimmer only. Use credits for a two-swimmer booking.' }, { status: 400 })
      if (!isWithinTokenWindow(dates[0], String(start_time).slice(0, 5)))
        return NextResponse.json({ error: 'Tokens can only be used for a lesson today or tomorrow.' }, { status: 400 })
      const needTokens = hour ? 2 : 1
      const tp = await tokenPool(svc, student1.parent_id, ct.slug || '')
      if (tp.reduce((n: number, x: any) => n + x.remaining, 0) < needTokens)
        return NextResponse.json({ error: `This family needs ${needTokens} token(s) for that booking and does not have enough.` }, { status: 409 })
      for (let k = 0; k < needTokens; k++) { const x = tp.find((y: any) => y.remaining > 0)!; tokenAlloc.push(x.id); x.remaining-- }
    } else {
      const needed1 = twoFromParent1 ? dates.length * 2 : dates.length
      const alloc1 = await allocateCredits(svc, student1.parent_id, course_type_id, needed1)
      if (!alloc1.ok) return NextResponse.json({ error: `Parent 1 has ${alloc1.totalRemaining} credits, needs ${needed1}` }, { status: 409 })
      let alloc2: string[] = []
      if (student2 && !sameParent) {
        const a2 = await allocateCredits(svc, student2.parent_id, course_type_id, dates.length)
        if (!a2.ok) return NextResponse.json({ error: `Parent 2 has ${a2.totalRemaining} credits, needs ${dates.length}` }, { status: 409 })
        alloc2 = a2.allocation
      }
      // For same-parent 1on2, allocation covers both bookings interleaved
      credit1PerDate = twoFromParent1 ? alloc1.allocation.filter((_, i) => i % 2 === 0) : alloc1.allocation
      credit2PerDate = twoFromParent1 ? alloc1.allocation.filter((_, i) => i % 2 === 1) : alloc2
    }

    const endTime = minutesToTime(timeToMinutes(start_time) + ct.duration_minutes)
    const hourEndTime = minutesToTime(timeToMinutes(start_time) + ct.duration_minutes * 2)
    const createdBookingIds: string[] = []
    const createdSessionIds: string[] = []
    const incrementedCredits: string[] = []

    async function rollback() {
      for (const cid of incrementedCredits) {
        await svc.rpc('decrement_used_credits', { credit_id: cid })
      }
      if (createdBookingIds.length > 0) {
        await svc.from('bookings').delete().in('id', createdBookingIds)
      }
      // Sessions we created ourselves go too, or a failed hour booking leaves an
      // empty off-grid slot sitting in the calendar.
      if (createdSessionIds.length > 0) {
        await svc.from('class_sessions').delete().in('id', createdSessionIds)
      }
    }

    for (let i = 0; i < dates.length; i++) {
      const date = dates[i]
      if (hour) {
        const groupId = randomUUID()
        const legs = [
          { start: start_time, end: endTime, credit: credit1PerDate[i], token: tokenAlloc[0] },
          { start: endTime, end: hourEndTime, credit: credit2PerDate[i], token: tokenAlloc[1] },
        ]
        for (const leg of legs) {
          const { data: exist } = await svc
            .from('class_sessions')
            .select('id, enrolled_count, max_students')
            .eq('coach_id', coach_id).eq('session_date', date).eq('start_time', leg.start)
            .eq('course_type_id', course_type_id).in('status', ['open', 'full'])
            .maybeSingle()
          let sid: string
          if (exist) {
            if (exist.enrolled_count + 1 > exist.max_students) {
              await rollback()
              return NextResponse.json({ error: `The ${leg.start} half on ${date} is already taken` }, { status: 409 })
            }
            sid = exist.id
          } else {
            const { data: ns, error: se } = await svc
              .from('class_sessions')
              .insert({ coach_id, course_type_id, session_date: date, start_time: leg.start, end_time: leg.end, max_students: ct.max_students, enrolled_count: 0, status: 'open' })
              .select('id').single()
            if (se || !ns) {
              await rollback()
              const conflict = se?.message?.includes('coach_timeslot_conflict')
              return NextResponse.json({ error: conflict ? `The coach already has another class during the hour on ${date}` : `Failed to create session on ${date}: ${se?.message || 'unknown'}` }, { status: 409 })
            }
            sid = ns.id
            createdSessionIds.push(ns.id)
          }
          const { data: bk, error: be } = await svc
            .from('bookings')
            .insert({ class_session_id: sid, parent_id: student1.parent_id, student_id: student1.id, lesson_credit_id: payWithToken ? null : leg.credit, token_package_id: payWithToken ? leg.token : null, status: 'confirmed', lesson_group_id: groupId })
            .select('id').single()
          if (be || !bk) {
            await rollback()
            const conflict = be?.message?.includes('coach_timeslot_conflict')
            return NextResponse.json({ error: conflict ? `The coach already has another class during the hour on ${date}` : `Failed to book ${date}: ${be?.message || 'unknown'}` }, { status: conflict ? 409 : 500 })
          }
          createdBookingIds.push(bk.id)
          if (!payWithToken) {
            await svc.rpc('increment_used_credits', { credit_id: leg.credit })
            incrementedCredits.push(leg.credit)
          }
        }
        continue
      }
      // find or create session
      const { data: existing } = await svc
        .from('class_sessions')
        .select('id, enrolled_count, max_students')
        .eq('coach_id', coach_id).eq('session_date', date).eq('start_time', start_time)
        .eq('course_type_id', course_type_id).in('status', ['open', 'full'])
        .maybeSingle()
      let sessId: string
      if (existing) {
        if (existing.enrolled_count + spotsNeeded > existing.max_students) {
          await rollback()
          return NextResponse.json({ error: `Session on ${date} became full` }, { status: 409 })
        }
        sessId = existing.id
      } else {
        const { data: newSess, error: sessErr } = await svc
          .from('class_sessions')
          .insert({ coach_id, course_type_id, session_date: date, start_time, end_time: endTime, max_students: ct.max_students, enrolled_count: 0, status: 'open' })
          .select('id').single()
        if (sessErr || !newSess) {
          await rollback()
          return NextResponse.json({ error: `Failed to create session on ${date}: ${sessErr?.message || 'unknown'}` }, { status: 500 })
        }
        sessId = newSess.id
        createdSessionIds.push(newSess.id)
      }

      const toCreate = [
        { parent_id: student1.parent_id, student_id: student1.id, credit_id: credit1PerDate[i] },
        ...(student2 ? [{ parent_id: student2.parent_id, student_id: student2.id, credit_id: credit2PerDate[i] }] : []),
      ]
      for (const b of toCreate) {
        const { data: created, error: bookErr } = await svc
          .from('bookings')
          .insert({ class_session_id: sessId, parent_id: b.parent_id, student_id: b.student_id, lesson_credit_id: payWithToken ? null : b.credit_id, token_package_id: payWithToken ? tokenAlloc[0] : null, status: 'confirmed' })
          .select('id').single()
        if (bookErr || !created) {
          await rollback()
          const isConflict = bookErr?.message?.includes('coach_timeslot_conflict')
          return NextResponse.json(
            { error: isConflict ? `Date ${date} conflicts with another session for this coach` : `Failed to book ${date}: ${bookErr?.message || 'unknown'}` },
            { status: isConflict ? 409 : 500 }
          )
        }
        createdBookingIds.push(created.id)
        if (!payWithToken) {
          await svc.rpc('increment_used_credits', { credit_id: b.credit_id })
          incrementedCredits.push(b.credit_id)
        }
      }
    }

    // Tokens are spent only after every booking exists: there is no
    // decrement_used_tokens RPC, so rollback() could never hand one back.
    for (const tid of tokenAlloc) await svc.rpc('increment_used_tokens', { token_id: tid })

    // One summary email per parent (best effort)
    try {
      const { data: coach } = await svc.from('coaches').select('first_name, last_name').eq('id', coach_id).single()
      const coachName = coach ? `${coach.first_name} ${coach.last_name || ''}`.trim() : ''
      const timeStr = `${formatTime12h(start_time)} \u2013 ${formatTime12h(hour ? hourEndTime : endTime)}`
      const targets: { parent_id: string; studentName: string; partnerName?: string }[] = sameParent || !student2
        ? [{ parent_id: student1.parent_id, studentName: student2 ? `${student1.full_name} & ${student2.full_name}` : student1.full_name }]
        : [
            { parent_id: student1.parent_id, studentName: student1.full_name, partnerName: student2.full_name },
            { parent_id: student2.parent_id, studentName: student2.full_name, partnerName: student1.full_name },
          ]
      for (const t of targets) {
        const { data: p } = await svc.from('parents').select('first_name, email').eq('id', t.parent_id).single()
        if (!p?.email) continue
        if (dates.length === 1) {
          await sendEmail({
            type: 'booking_confirmed', to: p.email, parentName: p.first_name,
            studentName: t.studentName, partnerName: t.partnerName, courseName: hour ? `${ct.name} (60 min)` : ct.name, coachName,
            date: dates[0], time: timeStr,
          })
        } else {
          await sendEmail({
            type: 'booking_series_confirmed', to: p.email, parentName: p.first_name,
            studentName: t.studentName, partnerName: t.partnerName, courseName: hour ? `${ct.name} (60 min)` : ct.name, coachName,
            dates, time: timeStr,
          })
        }
      }
    } catch {}

    return NextResponse.json({ ok: true, created_count: createdBookingIds.length, dates })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
