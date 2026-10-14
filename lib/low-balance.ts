// "Your points are running low" (owner, 2026-10-14).
//
// The question a family cares about is not "how many points do I have" but
// "how long until my child's lessons stop". So this measures the balance in
// WEEKS of the family's own lessons:
//
//   weeks left = (points in the wallet + points already paid for lessons
//                 not yet taken) / points the family uses in a week
//
// Lessons already booked count, because they were paid for when they were
// booked: a fixed class takes ten weeks of points on day one, and that family
// is not "out of points" with eight paid lessons still ahead of it.
//
// A week's use is measured from lessons actually taken in the last four weeks
// (by lesson date, not by when they were paid for -- the ten-week charge of a
// fixed class would otherwise look like one enormous week). A family that only
// started a fortnight ago is averaged over its two weeks, not four.
//
// Under LOW_BALANCE_WEEKS the family is "low": the daily cron emails them
// once, and the dashboard shows a one-line hint. Who counts at all: a family
// with a points-paid lesson in the last ACTIVE_DAYS or one still booked. Swim
// Team is a subscription with no points on its bookings, so a team-only
// family never qualifies. A family in arrears is left out -- its dashboard
// already says it owes, which is a different message.

import type { SupabaseClient } from '@supabase/supabase-js'
import { getTodayLA } from '@/lib/date'
import { addDaysStr } from '@/lib/vouchers'
import { allRows, allRowsIn } from '@/lib/db-paging'
import { totalBalance, arrears, type Wallet } from '@/lib/points-wallet'

type Svc = SupabaseClient | any

export const LOW_BALANCE_WEEKS = 2
/** How far back a lesson still makes the family "currently taking lessons". */
export const ACTIVE_DAYS = 45
/** The window a week's use is averaged over. */
export const USAGE_DAYS = 28

export type Runway = {
  /** Points the family can spend now (purchased + bonus). */
  balance: number
  /** Points already paid for lessons from today on. */
  booked: number
  /** Points the family uses in a typical week. */
  weekly: number
  weeksLeft: number
  low: boolean
}

type Paid = { date: string; net: number }

const BOOKING_COLS = 'id, parent_id, points_charged, points_refunded, class_sessions!bookings_class_session_id_fkey!inner(session_date)'

/** Points-paid, not-cancelled, not-fully-refunded lessons from `from` on. */
function paidLessons(rows: any[]): Map<string, Paid[]> {
  const out = new Map<string, Paid[]>()
  for (const b of rows) {
    const net = Number(b.points_charged || 0) - Number(b.points_refunded || 0)
    const date = b.class_sessions?.session_date
    if (net <= 0 || !date || !b.parent_id) continue
    const list = out.get(b.parent_id) || []
    list.push({ date, net })
    out.set(b.parent_id, list)
  }
  return out
}

/** The arithmetic, on rows already read. Null = not a family this applies to. */
export function runwayOf(wallet: Wallet | null, lessons: Paid[], today: string): Runway | null {
  if (!wallet || arrears(wallet) > 0 || lessons.length === 0) return null
  const usageFrom = addDaysStr(today, -USAGE_DAYS)
  const past = lessons.filter(l => l.date < today && l.date >= usageFrom)
  const future = lessons.filter(l => l.date >= today)
  const booked = future.reduce((a, l) => a + l.net, 0)

  let weekly = 0
  if (past.length) {
    const first = past.reduce((m, l) => (l.date < m ? l.date : m), past[0].date)
    const days = Math.round((Date.parse(today + 'T12:00:00Z') - Date.parse(first + 'T12:00:00Z')) / 86_400_000)
    const weeks = Math.min(USAGE_DAYS / 7, Math.max(1, Math.ceil(days / 7)))
    weekly = past.reduce((a, l) => a + l.net, 0) / weeks
  } else {
    // Nothing taken in four weeks, but a lesson within ACTIVE_DAYS or one
    // booked: count one lesson day a week, the day nearest today (every
    // swimmer and half-hour of it).
    const dates = [...new Set(lessons.map(l => l.date))]
    const next = dates.filter(d => d >= today).sort()[0]
    const last = dates.filter(d => d < today).sort().reverse()[0]
    const day = next || last
    weekly = lessons.filter(l => l.date === day).reduce((a, l) => a + l.net, 0)
  }
  if (weekly <= 0) return null

  const balance = Math.max(0, totalBalance(wallet))
  const weeksLeft = (balance + booked) / weekly
  return { balance, booked, weekly: Math.round(weekly), weeksLeft, low: weeksLeft < LOW_BALANCE_WEEKS }
}

/** One family's runway, for the dashboard and the desk's family view. */
export async function familyRunway(svc: Svc, parentId: string, wallet: Wallet | null): Promise<Runway | null> {
  const today = getTodayLA()
  const { data, error } = await svc.from('bookings')
    .select(BOOKING_COLS)
    .eq('parent_id', parentId)
    .neq('status', 'cancelled')
    .not('points_charged', 'is', null)
    .gte('class_sessions.session_date', addDaysStr(today, -ACTIVE_DAYS))
  if (error) { console.error('low-balance: bookings read failed:', error.message); return null }
  return runwayOf(wallet, paidLessons(data || []).get(parentId) || [], today)
}

export type SweepResult = { checked: number; low: number; sent: number; cleared: number; failed: number; dry?: { parentId: string; weeksLeft: number }[] }

/**
 * The daily pass. Emails each family that has just become low, once; forgets
 * that it emailed a family once the family is no longer low (topped up, or
 * stopped taking lessons), so the next time they run low they hear again.
 *
 * The family is claimed (low_balance_notified_at set) before the email goes,
 * so two runs at once cannot both send; a failed email releases the claim and
 * tomorrow's run tries again.
 */
export async function sweepLowBalance(
  svc: Svc,
  send: (parentId: string, r: Runway) => Promise<boolean>,
  opts: { dry?: boolean } = {},
): Promise<SweepResult> {
  const today = getTodayLA()
  const { data: rows, error } = await allRows(() => svc.from('bookings')
    .select(BOOKING_COLS)
    .neq('status', 'cancelled')
    .not('points_charged', 'is', null)
    .gte('class_sessions.session_date', addDaysStr(today, -ACTIVE_DAYS))
    .order('id'))
  if (error) throw new Error('bookings read failed: ' + (error.message || error))
  const lessons = paidLessons(rows)

  // Families flagged last time, so a family that has stopped taking lessons
  // (and so is no longer in `lessons`) still gets its flag cleared.
  const { data: flagged, error: fErr } = await allRows(() => svc.from('point_wallets')
    .select('parent_id').not('low_balance_notified_at', 'is', null).order('parent_id'))
  if (fErr) throw new Error('wallet flags read failed: ' + (fErr.message || fErr))

  const ids = [...new Set([...lessons.keys(), ...flagged.map((w: any) => w.parent_id)])]
  const { data: wallets, error: wErr } = await allRowsIn(ids, chunk => svc.from('point_wallets')
    .select('*').in('parent_id', chunk).order('parent_id'))
  if (wErr) throw new Error('wallets read failed: ' + (wErr.message || wErr))
  const walletOf = new Map<string, any>(wallets.map((w: any) => [w.parent_id, w]))

  const res: SweepResult = { checked: ids.length, low: 0, sent: 0, cleared: 0, failed: 0 }
  if (opts.dry) res.dry = []
  for (const id of ids) {
    const w = walletOf.get(id) || null
    const r = runwayOf(w, lessons.get(id) || [], today)
    const notified = !!w?.low_balance_notified_at
    try {
      if (r?.low) {
        res.low++
        if (notified) continue
        if (opts.dry) { res.dry!.push({ parentId: id, weeksLeft: Math.round(r.weeksLeft * 10) / 10 }); continue }
        const { data: claimed } = await svc.from('point_wallets')
          .update({ low_balance_notified_at: new Date().toISOString() })
          .eq('parent_id', id).is('low_balance_notified_at', null).select('parent_id')
        if (!claimed?.length) continue
        if (await send(id, r)) res.sent++
        else {
          res.failed++
          await svc.from('point_wallets').update({ low_balance_notified_at: null }).eq('parent_id', id)
        }
      } else if (notified && !opts.dry) {
        await svc.from('point_wallets').update({ low_balance_notified_at: null }).eq('parent_id', id)
        res.cleared++
      }
    } catch (e) {
      console.error(`low-balance: family ${id} failed:`, e)
      res.failed++
    }
  }
  return res
}
