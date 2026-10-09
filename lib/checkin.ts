import type { SupabaseClient } from '@supabase/supabase-js'
import { getTodayLA, getNowMinutesLA, formatTime12h } from '@/lib/date'

/* Checking a swimmer in for today. One rule for every way in: the front desk
   scanning the QR code, staff ticking the name, and (from 2026-09) the parent
   tapping "I'm here" on their phone at the pool. It used to live inside the
   admin route; it moved here unchanged so the parent's button cannot drift
   from what the desk does.

   The window is the same for all of them: from 30 minutes before a lesson
   starts until it ends. Back-to-back lessons (a gap of 30 minutes or less)
   are checked in together. */

export const EARLY_WINDOW_MIN = 30
const CHAIN_GAP_MIN = 30

export type CheckInMethod = 'qr' | 'manual' | 'self'

export type CheckInResult =
  | { ok: true; student_id: string; student_name: string; current_level: number | null; checked_in_count: number; lesson_times: string[] }
  | { ok: false; status: number; code: 'not_found' | 'no_lesson_today' | 'not_open' | 'team_wrong_session' | 'team_not_open' | 'db'; error: string }

function toMinutes(t: string): number {
  const parts = t.split(':').map(Number)
  return parts[0] * 60 + parts[1]
}

/** Today's lessons for one swimmer, earliest first, and which are already checked in.
 *  Confirmed bookings only: a basket item (in_cart), an unpaid Swim Assessment
 *  hold (pending_payment) or an invite nobody accepted (pending_partner) is not
 *  a lesson. They used to count, so a swimmer could be checked in for a lesson
 *  nobody had paid for, which the cleanup job could then delete (found
 *  2026-10-07). */
async function todaysLessons(svc: SupabaseClient, studentId: string) {
  const todayStr = getTodayLA()
  const { data: bookings } = await svc
    .from('bookings')
    .select('id, class_session_id, status, lesson_group_id')
    .eq('student_id', studentId)
    .eq('status', 'confirmed')

  const sessionIds = Array.from(new Set((bookings || []).map((b: any) => b.class_session_id).filter(Boolean)))
  const { data: sessions } = sessionIds.length
    ? await svc.from('class_sessions').select('id, session_date, start_time, end_time').in('id', sessionIds)
    : { data: [] as any[] }
  const sessionMap = new Map((sessions || []).map((s: any) => [s.id, s]))

  const todays = (bookings || [])
    .map((b: any) => ({ ...b, cs: sessionMap.get(b.class_session_id) || null }))
    .filter((b: any) => b.cs && b.cs.session_date === todayStr && b.cs.start_time && b.cs.end_time)
    .sort((a: any, b: any) => toMinutes(a.cs.start_time) - toMinutes(b.cs.start_time))

  const { data: existing } = todays.length
    ? await svc.from('attendance').select('booking_id').in('booking_id', todays.map((b: any) => b.id))
    : { data: [] as any[] }
  const attended = new Set((existing || []).map((r: any) => r.booking_id))
  return { todays, attended }
}

function openIndex(todays: any[], attended: Set<string>, nowMin: number) {
  return todays.findIndex((b: any) => {
    const s = toMinutes(b.cs.start_time)
    const e = toMinutes(b.cs.end_time)
    return !attended.has(b.id) && nowMin >= s - EARLY_WINDOW_MIN && nowMin < e
  })
}

/** What the parent's page needs to know about one swimmer right now: is a
 *  lesson open for check-in, and has today's lesson already been checked in.
 *  Lessons only -- Swim Team practices still check in at the desk. */
export async function checkInStatus(svc: SupabaseClient, studentId: string) {
  const { todays, attended } = await todaysLessons(svc, studentId)
  const nowMin = getNowMinutesLA()
  const idx = openIndex(todays, attended, nowMin)
  const done = todays.filter((b: any) => attended.has(b.id))
  return {
    open: idx !== -1,
    lessonTime: idx !== -1 ? formatTime12h(todays[idx].cs.start_time) : null,
    checkedInTime: done.length ? formatTime12h(done[done.length - 1].cs.start_time) : null,
  }
}

/** The pool (class_sessions.location_id) of the lesson a check-in right now
 *  would start from, for the parent's "I'm here" button: a family at one pool
 *  must not tick a lesson at the other. null when no lesson is open (the
 *  check-in itself then says so, or finds a team practice); a lesson read
 *  before the locations migration has no pool and reads as null too. */
export async function openLessonLocationId(svc: SupabaseClient, studentId: string): Promise<string | null> {
  const { todays, attended } = await todaysLessons(svc, studentId)
  const idx = openIndex(todays, attended, getNowMinutesLA())
  if (idx === -1) return null
  const { data } = await svc.from('class_sessions').select('location_id').eq('id', todays[idx].class_session_id).maybeSingle()
  return ((data as any)?.location_id as string | null) || null
}

/** Swim Team: membership-based check-in (unlimited practices, no bookings).
 *  null when the swimmer has no current membership. */
async function teamCheckIn(svc: SupabaseClient, student: { id: string; full_name: string; current_level: number | null }, method: CheckInMethod, todayStr: string, nowMin: number): Promise<CheckInResult | null> {
  const studentId = student.id
  const { data: tm } = await svc
    .from('team_memberships')
    .select('team_tier_id, status, team_tiers(name)')
    .eq('student_id', studentId)
    .in('status', ['active', 'past_due'])
    .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
    .limit(1)
  const membership: any = (tm || [])[0] || null

  if (membership) {
    const tierName = Array.isArray(membership.team_tiers) ? membership.team_tiers[0]?.name : membership.team_tiers?.name
    const dow = new Date(todayStr + 'T00:00:00').getDay()
    const { data: zoneRows } = await svc
      .from('coach_availability_zones')
      .select('coach_id, zone_type, kind, start_time, end_time, team_tier_id')
      .or(`and(kind.eq.date,override_date.eq.${todayStr}),and(kind.eq.weekly,weekday.eq.${dow})`)

    // Per-coach resolution: date rows replace weekly; a closed row kills the coach's day
    const byCoach = new Map<string, any[]>()
    for (const r of zoneRows || []) {
      if (!byCoach.has(r.coach_id)) byCoach.set(r.coach_id, [])
      byCoach.get(r.coach_id)!.push(r)
    }
    const teamRows: any[] = []
    for (const rows of byCoach.values()) {
      const dateRows = rows.filter((r: any) => r.kind === 'date')
      const picked = dateRows.length > 0 ? dateRows : rows
      if (picked.some((r: any) => r.zone_type === 'closed')) continue
      for (const r of picked) if (r.zone_type === 'team') teamRows.push(r)
    }

    const open = teamRows.filter((r: any) => {
      const st = toMinutes(String(r.start_time).slice(0, 5))
      const en = toMinutes(String(r.end_time).slice(0, 5))
      return nowMin >= st - EARLY_WINDOW_MIN && nowMin < en
    })
    const mine = open.find((r: any) => r.team_tier_id === membership.team_tier_id)

    if (mine) {
      const startHH = String(mine.start_time).slice(0, 5)
      const { error: taErr } = await svc.from('team_attendance').upsert({
        student_id: studentId,
        team_tier_id: membership.team_tier_id,
        practice_date: todayStr,
        start_time: startHH,
        check_in_method: method,
      }, { onConflict: 'student_id,practice_date,start_time' })
      if (taErr) return { ok: false, status: 500, code: 'db', error: taErr.message }
      return {
        ok: true,
        student_id: student.id,
        student_name: student.full_name,
        current_level: student.current_level,
        checked_in_count: 1,
        lesson_times: [formatTime12h(startHH) + ' · ' + (tierName || 'Team') + ' practice'],
      }
    }
    if (open.length > 0) {
      return { ok: false, status: 403, code: 'team_wrong_session', error: 'The current practice is not for ' + (tierName || student.full_name + "'s team") + ' — check-in not allowed for this session.' }
    }
    return { ok: false, status: 404, code: 'team_not_open', error: 'No ' + (tierName || 'team') + ' practice is open for check-in right now' }
  }
  return null
}

export async function checkInStudent(svc: SupabaseClient, studentId: string, method: CheckInMethod): Promise<CheckInResult> {
  const { data: student } = await svc
    .from('students')
    .select('id, full_name, current_level')
    .eq('id', studentId)
    .single()

  if (!student) return { ok: false, status: 404, code: 'not_found', error: 'Student not found' }

  const todayStr = getTodayLA()
  const nowMin = getNowMinutesLA()
  const { todays, attended } = await todaysLessons(svc, studentId)

  if (todays.length === 0) {
    const team = await teamCheckIn(svc, student, method, todayStr, nowMin)
    if (team) return team
    return { ok: false, status: 404, code: 'no_lesson_today', error: student.full_name + ' has no lessons today' }
  }

  // Anchor: earliest unattended booking whose window is open. Window = [start - 30 min, end)
  const anchorIdx = openIndex(todays, attended, nowMin)

  if (anchorIdx === -1) {
    // A Swim Team member with a lesson later today (or one already done) used
    // to be refused at practice time: the team check-in only ran on a day with
    // no lessons at all, and team_attendance was never written (found
    // 2026-10-07). With no lesson open, try the practice.
    const team = await teamCheckIn(svc, student, method, todayStr, nowMin)
    if (team?.ok) return team
    return {
      ok: false, status: 400, code: 'not_open',
      error: student.full_name + ' has no lesson open for check-in right now. Check-in opens 30 minutes before class and closes when the class ends.',
    }
  }

  // Chain forward: consecutive lessons with gap <= 30 min join the same check-in
  const chain: any[] = [todays[anchorIdx]]
  for (let i = anchorIdx + 1; i < todays.length; i++) {
    const prevEnd = toMinutes(chain[chain.length - 1].cs.end_time)
    const nextStart = toMinutes(todays[i].cs.start_time)
    if (nextStart - prevEnd <= CHAIN_GAP_MIN) {
      chain.push(todays[i])
    } else {
      break
    }
  }

  const nowIso = new Date().toISOString()
  const anchorId = todays[anchorIdx].id
  const targets = chain.filter((b: any) => !attended.has(b.id))
  const rows = targets.map((b: any) => ({
    booking_id: b.id,
    student_id: student.id,
    class_session_id: b.class_session_id,
    check_in_method: method,
    checked_in_by: null,
    checked_in_at: nowIso,
    is_chained: b.id !== anchorId,
  }))

  const { error } = await svc
    .from('attendance')
    .upsert(rows, { onConflict: 'booking_id,student_id' })

  if (error) return { ok: false, status: 500, code: 'db', error: error.message }

  // A 60-minute lesson is two bookings: counting rows said "2 lessons" and
  // listed the second half's start as a lesson of its own (found 2026-10-04).
  // One entry per lesson, at the time that lesson starts.
  const lessonOf = (b: any) => b.lesson_group_id || b.id
  const startOf = new Map<string, string>()
  for (const b of todays) if (!startOf.has(lessonOf(b))) startOf.set(lessonOf(b), b.cs.start_time)
  const lessonKeys = [...new Set(targets.map(lessonOf))]

  return {
    ok: true,
    student_id: student.id,
    student_name: student.full_name,
    current_level: student.current_level,
    checked_in_count: lessonKeys.length,
    lesson_times: lessonKeys.map(k => formatTime12h(startOf.get(k))),
  }
}
