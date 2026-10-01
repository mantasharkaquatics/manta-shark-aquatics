// Change of slot (換時段) for a fixed class -- docs/fixed-class-spec.md section 4.
//
// The family picks a new weekday, time and coach for the same course and
// length. Every lesson still 24 hours or more away moves, in order, onto the
// new slot week by week from the date they start on. A week the new slot is
// full (or the coach is off) is skipped and the lesson goes on the end
// instead. Lessons that still cannot be placed within a few weeks past the
// end are put with another coach at the same time on one of the skipped
// weeks; failing that, they become make-up vouchers. Points move with the
// lessons untouched: same course, same length, same price (owner, 2026-10-01).
//
// A move is written the way a reschedule is (confirm-reschedule): the old rows
// are cancelled as 'rescheduled' and new rows carry their points forward, with
// original_booking_id pointing back. The class itself then takes the new slot.

import { randomUUID } from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getTodayLA, getNowMinutesLA, minutesUntil, SLOT_STEP_MINUTES } from '@/lib/date'
import { addDaysStr, issueVoucher, voucherExpiry } from '@/lib/vouchers'
import {
  FC_COLUMNS, MOVE_EXTRA_WEEKS, evalSlot, halvesOf, isUpcoming, lessonsOf, loadWindow, minToTime,
  renewalHolds, studentBusy, toMin, weekdayOf,
  type FixedClass, type Lesson,
} from '@/lib/fixed-classes'
import { zoneTypeForSlug } from '@/lib/zones'

type Svc = SupabaseClient

export type MoveCtx = {
  fc: FixedClass
  ct: { id: string; slug: string; name: string; max_students: number }
  level: number
  studentIds: string[]
  seats: number
  /** Upcoming lessons 24 hours or more away: these move. */
  movable: Lesson[]
  /** Upcoming lessons inside 24 hours: these stay where they are. */
  stay: Lesson[]
  coachIds: string[]
}

export type MoveItem = { from: string; to: string | null; coachId: string | null; kind: 'move' | 'later' | 'other_coach' | 'voucher' }
export type MovePlan = { items: MoveItem[]; sig: string }
export type MoveTarget = { startDate: string; startTime: string; coachId: string }

/** Read a class and everything a move needs, or say why it cannot move. */
export async function moveContext(svc: Svc, fcId: string, parentId: string): Promise<MoveCtx | { error: string; status: number }> {
  const { data: fcRow } = await svc.from('fixed_classes').select(FC_COLUMNS).eq('id', fcId).maybeSingle()
  const fc = fcRow as FixedClass | null
  if (!fc || fc.parent_id !== parentId) return { error: 'Fixed class not found', status: 404 }
  if (fc.status !== 'active') return { error: 'This fixed class has ended.', status: 400 }
  const [{ data: ct }, { data: st }, { data: coaches }, lessons] = await Promise.all([
    svc.from('course_types').select('id, slug, name, max_students').eq('id', fc.course_type_id).single(),
    svc.from('students').select('id, current_level').eq('id', fc.student_id).single(),
    svc.from('coaches').select('id').eq('is_active', true),
    lessonsOf(svc, [fc.id]),
  ])
  if (!ct || !st) return { error: 'Fixed class not found', status: 404 }
  const today = getTodayLA(), nowMin = getNowMinutesLA()
  const upcoming = (lessons.get(fc.id) || []).filter(l => isUpcoming(l, today, nowMin) && l.rows.every(r => r.status === 'confirmed'))
  const far = (l: Lesson) => minutesUntil(l.date, l.start, today, nowMin) >= 24 * 60
  const studentIds = [fc.student_id, fc.student2_id].filter(Boolean) as string[]
  return {
    fc, ct: ct as any, level: Number(st.current_level ?? 0), studentIds, seats: studentIds.length,
    movable: upcoming.filter(far), stay: upcoming.filter(l => !far(l)),
    coachIds: (coaches || []).map((c: any) => c.id),
  }
}

/** The first day a new slot can start on: tomorrow, and after any lesson that is staying. */
export function earliestStart(ctx: MoveCtx, today = getTodayLA()): string {
  let d = addDaysStr(today, 1)
  for (const l of ctx.stay) if (l.date >= d) d = addDaysStr(l.date, 1)
  return d
}
const firstOnOrAfter = (d: string, weekday: number) => addDaysStr(d, (weekday - weekdayOf(d) + 7) % 7)

function hashSig(items: MoveItem[]): string {
  const str = items.map(i => `${i.from}>${i.to || '-'}@${i.coachId || '-'}`).join(',')
  let h = 5381
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0
  return (h >>> 0).toString(36) + '.' + items.length
}

/** Where every lesson would go. Reads only. */
export async function planMove(svc: Svc, ctx: MoveCtx, target: MoveTarget): Promise<MovePlan | { error: string; status: number }> {
  const today = getTodayLA(), nowMin = getNowMinutesLA()
  const N = ctx.movable.length
  if (N === 0) return { error: 'NOTHING_TO_MOVE', status: 400 }
  const startMin = toMin(target.startTime)
  if (weekdayOf(target.startDate) === ctx.fc.weekday && startMin === toMin(ctx.fc.start_time) && target.coachId === ctx.fc.coach_id)
    return { error: 'SAME_SLOT', status: 400 }
  if (target.startDate < earliestStart(ctx, today) || !ctx.coachIds.includes(target.coachId))
    return { error: 'Invalid slot', status: 400 }

  const dates: string[] = []
  for (let i = 0, d = target.startDate; i < N + MOVE_EXTRA_WEEKS; i++, d = addDaysStr(d, 7)) dates.push(d)
  const last = dates[dates.length - 1]
  // The seats and rows being moved do not stand in their own way.
  const ignoreSeats = new Map<string, number>()
  const ignoreIds = new Set<string>()
  for (const l of ctx.movable) for (const r of l.rows) {
    ignoreSeats.set(r.class_session_id, (ignoreSeats.get(r.class_session_id) || 0) + 1)
    ignoreIds.add(r.id)
  }
  const [w, busy, holds] = await Promise.all([
    loadWindow(svc, ctx.coachIds, target.startDate, last),
    studentBusy(svc, ctx.studentIds, target.startDate, last, ignoreIds),
    renewalHolds(svc, target.startDate, last, ctx.fc.parent_id, today),
  ])
  const ok = (coachId: string, date: string) => evalSlot(w, {
    coachId, date, startMin, minutes: ctx.fc.minutes, ct: ctx.ct, level: ctx.level, seats: ctx.seats,
    holds, ignoreSeats, busy, today, nowMin,
  }).status === 'ok'

  const targets: { date: string; coachId: string; kind: MoveItem['kind'] }[] = []
  const skipped: string[] = []
  for (let i = 0; i < dates.length && targets.length < N; i++) {
    if (ok(target.coachId, dates[i])) targets.push({ date: dates[i], coachId: target.coachId, kind: i < N ? 'move' : 'later' })
    else skipped.push(dates[i])
  }
  // Could not all be appended: another coach, same time, on a skipped week.
  for (const d of skipped) {
    if (targets.length >= N) break
    const other = ctx.coachIds.filter(c => c !== target.coachId).find(c => ok(c, d))
    if (other) targets.push({ date: d, coachId: other, kind: 'other_coach' })
  }
  targets.sort((a, b) => a.date.localeCompare(b.date))
  const items: MoveItem[] = ctx.movable.map((l, i) => targets[i]
    ? { from: l.date, to: targets[i].date, coachId: targets[i].coachId, kind: targets[i].kind }
    : { from: l.date, to: null, coachId: null, kind: 'voucher' })
  return { items, sig: hashSig(items) }
}

export type MoveOption = { weekday: number; time: string; coachId: string; startDate: string; okWeeks: number; weeks: number }

/**
 * Every weekday, time and coach the class could move to, with how many of the
 * coming weeks are open there -- the list the family chooses from.
 */
export async function moveOptions(svc: Svc, ctx: MoveCtx): Promise<{ options: MoveOption[]; from: string }> {
  const today = getTodayLA(), nowMin = getNowMinutesLA()
  const base = earliestStart(ctx, today)
  const K = Math.max(1, Math.min(ctx.movable.length, 10))
  const end = addDaysStr(base, 7 * K + 6)
  const ignoreSeats = new Map<string, number>()
  const ignoreIds = new Set<string>()
  for (const l of ctx.movable) for (const r of l.rows) {
    ignoreSeats.set(r.class_session_id, (ignoreSeats.get(r.class_session_id) || 0) + 1)
    ignoreIds.add(r.id)
  }
  const [w, busy, holds] = await Promise.all([
    loadWindow(svc, ctx.coachIds, base, end),
    studentBusy(svc, ctx.studentIds, base, end, ignoreIds),
    renewalHolds(svc, base, end, ctx.fc.parent_id, today),
  ])
  const zoneType = zoneTypeForSlug(ctx.ct.slug)
  const minutes = ctx.fc.minutes
  const curMin = toMin(ctx.fc.start_time)
  const out: MoveOption[] = []
  for (const coachId of ctx.coachIds) {
    if (!w.zoned.has(coachId)) continue
    for (let wd = 0; wd < 7; wd++) {
      const startDate = firstOnOrAfter(base, wd)
      // The times come from the coach's weekly template for that weekday;
      // each week is then judged on its own (time off, date overrides, holds).
      const rows = (w.zones.get(coachId) || []).filter(r => r.kind === 'weekly' && r.weekday === wd && r.zone_type === zoneType)
      const times = new Set<number>()
      for (const r of rows) {
        if (zoneType === 'group' && r.group_level_min != null && r.group_level_max != null
            && (ctx.level < r.group_level_min || ctx.level > r.group_level_max)) continue
        for (let m = toMin(r.start_time); m + minutes <= toMin(r.end_time); m += SLOT_STEP_MINUTES) times.add(m)
      }
      for (const m of times) {
        if (wd === ctx.fc.weekday && m === curMin && coachId === ctx.fc.coach_id) continue
        let okWeeks = 0
        for (let k = 0; k < K; k++) {
          const date = addDaysStr(startDate, 7 * k)
          if (evalSlot(w, { coachId, date, startMin: m, minutes, ct: ctx.ct, level: ctx.level, seats: ctx.seats, holds, ignoreSeats, busy, today, nowMin }).status === 'ok') okWeeks++
        }
        if (okWeeks > 0) out.push({ weekday: wd, time: minToTime(m), coachId, startDate, okWeeks, weeks: K })
      }
    }
  }
  // Monday first; Sunday last.
  out.sort((a, b) => ((a.weekday + 6) % 7) - ((b.weekday + 6) % 7) || a.time.localeCompare(b.time) || b.okWeeks - a.okWeeks)
  return { options: out, from: base }
}

/** Split n into k whole parts that add back up to n. */
function split(n: number, k: number): number[] {
  const base = Math.floor(n / k)
  return Array.from({ length: k }, (_, i) => base + (i < n - base * k ? 1 : 0))
}

/** Carry out a plan already shown to the family. */
export async function commitMove(svc: Svc, ctx: MoveCtx, target: MoveTarget, plan: MovePlan):
  Promise<{ ok: true; moved: number; vouchers: number } | { error: string; status: number }> {
  const byDate = new Map(ctx.movable.map(l => [l.date, l]))
  const moving = plan.items.filter(i => i.to)
  const toVoucher = plan.items.filter(i => !i.to)
  const startMin = toMin(target.startTime)
  const { fc, ct } = ctx

  // 1. Take the old rows out of their lessons -- conditionally, so a second
  //    press finds nothing to take.
  const oldIds = moving.flatMap(i => byDate.get(i.from)!.rows.map(r => r.id))
  const putBack = async (ids: string[]) => {
    if (ids.length === 0) return
    const { error } = await svc.from('bookings').update({ status: 'confirmed', cancellation_reason: null })
      .in('id', ids).eq('status', 'cancelled').eq('cancellation_reason', 'rescheduled')
    if (error) console.error(`⚠️ fixed-class move: could not restore ${ids.join(', ')} -- fix by hand:`, error.message)
  }
  if (oldIds.length > 0) {
    const { data: claimed } = await svc.from('bookings')
      .update({ status: 'cancelled', cancellation_reason: 'rescheduled' })
      .in('id', oldIds).eq('status', 'confirmed').select('id')
    const got = (claimed || []).map((r: any) => r.id)
    if (got.length !== oldIds.length) { await putBack(got); return { error: 'MOVE_CHANGED', status: 409 } }
  }

  // 2. The sessions the lessons go into: reused when one exists with room,
  //    otherwise opened.
  const parts = moving.flatMap(i => halvesOf(startMin, fc.minutes, ct.slug).map((h, idx) => ({ item: i, idx, ...h, key: `${i.to}|${h.start}|${i.coachId}` })))
  const createdSessions: string[] = []
  const sessionOf = new Map<string, string>()
  if (parts.length > 0) {
    const { data: ex } = await svc.from('class_sessions')
      .select('id, coach_id, session_date, start_time, enrolled_count, max_students')
      .in('coach_id', [...new Set(moving.map(i => i.coachId!))]).eq('course_type_id', ct.id)
      .in('session_date', [...new Set(moving.map(i => i.to!))]).in('status', ['open', 'full'])
    for (const s of ex || []) {
      const k = `${s.session_date}|${String(s.start_time).slice(0, 5)}|${s.coach_id}`
      if (s.enrolled_count + ctx.seats <= s.max_students && !sessionOf.has(k)) sessionOf.set(k, s.id)
    }
    const need = parts.filter(p => !sessionOf.has(p.key))
    if (need.length > 0) {
      const { data: made, error } = await svc.from('class_sessions').insert(need.map(p => ({
        coach_id: p.item.coachId, course_type_id: ct.id, session_date: p.item.to, start_time: p.start, end_time: p.end,
        max_students: ct.max_students, enrolled_count: 0, status: 'open',
      }))).select('id, coach_id, session_date, start_time')
      if (error || !made) {
        await putBack(oldIds)
        return { error: error?.message?.includes('coach_timeslot_conflict') ? 'MOVE_CHANGED' : 'Could not move the lessons.', status: 409 }
      }
      for (const s of made as any[]) {
        createdSessions.push(s.id)
        sessionOf.set(`${s.session_date}|${String(s.start_time).slice(0, 5)}|${s.coach_id}`, s.id)
      }
    }
  }

  // 3. The new rows, carrying each old row's points (and its share of any
  //    granted points) forward. Same course and length, so the shape matches
  //    half for half; if it ever did not, the points are split evenly.
  const rows: any[] = []
  for (const i of moving) {
    const l = byDate.get(i.from)!
    const halves = halvesOf(startMin, fc.minutes, ct.slug)
    const group = halves.length > 1 ? randomUUID() : null
    for (const sid of ctx.studentIds) {
      const src = l.rows.filter(r => r.student_id === sid)
      if (src.length === 0) continue
      const same = src.length === halves.length
      const pts = split(src.reduce((a, r) => a + (r.points_charged || 0), 0), halves.length)
      const gr = split(src.reduce((a, r) => a + (r.points_granted || 0), 0), halves.length)
      halves.forEach((h, idx) => {
        const s = same ? src[idx] : src[0]
        rows.push({
          class_session_id: sessionOf.get(`${i.to}|${h.start}|${i.coachId}`), parent_id: fc.parent_id, student_id: sid,
          lesson_credit_id: null, status: 'confirmed', fixed_class_id: fc.id, lesson_group_id: group,
          points_charged: same ? (s.points_charged || 0) : pts[idx],
          points_granted: same ? (s.points_granted || 0) : gr[idx],
          points_granted_expires_at: s.points_granted_expires_at,
          original_booking_id: s.original_booking_id || s.id,
        })
      })
    }
  }
  if (rows.length > 0) {
    const { error } = await svc.from('bookings').insert(rows)
    if (error) {
      if (createdSessions.length) await svc.from('class_sessions').delete().in('id', createdSessions)
      await putBack(oldIds)
      console.error('fixed-class move: rows not written:', error.message)
      return { error: error.message.includes('STUDENT_DOUBLE_BOOKED') || error.message.includes('coach_timeslot_conflict') ? 'MOVE_CHANGED' : 'Could not move the lessons.', status: 409 }
    }
  }

  // 4. Lessons that could not be placed anywhere become make-up vouchers.
  let vouchers = 0
  for (const i of toVoucher) {
    const l = byDate.get(i.from)!
    const ids = l.rows.map(r => r.id)
    const { data: c } = await svc.from('bookings')
      .update({ status: 'cancelled', pending_action: null, cancellation_reason: 'cancelled_by_parent', cancelled_by: 'parent', cancelled_at: new Date().toISOString() })
      .in('id', ids).eq('status', 'confirmed').select('id')
    if (!c || c.length === 0) continue
    const v = await issueVoucher(svc, {
      parentId: fc.parent_id, studentId: fc.student_id, student2Id: fc.student2_id,
      courseSlug: ct.slug, minutes: fc.minutes, reason: 'moved',
      expiresOn: voucherExpiry(i.from), sourceBookingId: l.rows[0].id, fixedClassId: fc.id,
    })
    if (v.voucher) vouchers++
    else console.error('fixed-class move: voucher not issued for', l.rows[0].id, v)
  }

  // 5. The class takes its new slot.
  const { error: fcErr } = await svc.from('fixed_classes')
    .update({ coach_id: target.coachId, weekday: weekdayOf(target.startDate), start_time: target.startTime })
    .eq('id', fc.id)
  if (fcErr) console.error(`⚠️ fixed-class move: lessons moved but class ${fc.id} still shows the old slot:`, fcErr.message)

  // 6. Sessions nobody is left in are closed.
  const oldSessions = new Set(plan.items.flatMap(i => byDate.get(i.from)!.rows.map(r => r.class_session_id)))
  for (const sid of oldSessions) {
    const { count } = await svc.from('bookings').select('id', { count: 'exact', head: true })
      .eq('class_session_id', sid).neq('status', 'cancelled')
    if ((count || 0) === 0) await svc.from('class_sessions').update({ status: 'cancelled' }).eq('id', sid).neq('status', 'cancelled')
  }
  return { ok: true, moved: moving.length, vouchers }
}
