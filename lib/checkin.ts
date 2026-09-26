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

/** Today's lessons for one swimmer, earliest first, and which are already checked in. */
async function todaysLessons(svc: SupabaseClient, studentId: string) {
  const todayStr = getTodayLA()
  const { data: bookings } = await svc
    .from('bookings')
    .select('id, class_session_id, status')
    .eq('student_id', studentId)
    .neq('status', 'cancelled')

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
    // Swim Team: membership-based check-in (unlimited practices, no bookings)
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

    return { ok: false, status: 404, code: 'no_lesson_today', error: student.full_name + ' has no lessons today' }
  }

  // Anchor: earliest unattended booking whose window is open. Window = [start - 30 min, end)
  const anchorIdx = openIndex(todays, attended, nowMin)

  if (anchorIdx === -1) {
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

  return {
    ok: true,
    student_id: student.id,
    student_name: student.full_name,
    current_level: student.current_level,
    checked_in_count: rows.length,
    lesson_times: targets.map((b: any) => formatTime12h(b.cs.start_time)),
  }
}
