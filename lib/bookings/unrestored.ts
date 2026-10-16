import type { SupabaseClient } from '@supabase/supabase-js'
import { refundBookingPoints } from '@/lib/bookings/refund'
import { alertAdmin } from '@/lib/admin-alert'
import { isSessionFull } from '@/lib/bookings/session-full'

/* A move claims the old lesson first (cancels its rows) and puts it back if
   the new one cannot be booked. With the last-seat guard
   (docs/migration-capacity-guard.sql, F81) that putting-back can be refused:
   the seat the old lesson freed was sold to someone else in the moment
   between. The rows then stay cancelled and the family has neither lesson,
   so their points must not stay on a lesson nobody will teach.

   Call with the rows the rollback tried to put back and the error it got.
   Rows that did go back (no longer 'cancelled') are left alone. For the rest:
   the points still owed on each go back to the family, a row still labelled
   'rescheduled' (which tells Reviews and the activity feed the points moved
   to a new lesson) is relabelled as cancelled by the school, and the desk is
   emailed so someone can call the family. Any other restore error is only
   logged, as before. Never throws. */
/** What settleUnrestored did: the rows left cancelled (0 = everything went
 *  back, or the error was not the seat guard), the points that reached the
 *  families, and those points per parent. A caller with rows > 0 must not
 *  tell the family their lesson was kept (lessonLostBody). */
export type Settled = { rows: number; points: number; byParent: Record<string, number> }
export const NOTHING_SETTLED: Settled = { rows: 0, points: 0, byParent: {} }

export async function settleUnrestored(svc: SupabaseClient, a: {
  rowIds: string[]
  error: unknown
  where: string
}): Promise<Settled> {
  if (a.rowIds.length === 0) return { ...NOTHING_SETTLED, byParent: {} }
  if (!isSessionFull(a.error)) {
    console.error(`⚠️ ${a.where}: rows ${a.rowIds.join(', ')} could not be put back:`, (a.error as { message?: string } | null)?.message ?? a.error)
    return { ...NOTHING_SETTLED, byParent: {} }
  }
  const out: Settled = { rows: 0, points: 0, byParent: {} }
  const lines: string[] = []
  try {
    const { data: rows, error } = await svc.from('bookings')
      .select('id, parent_id, class_session_id, points_charged, points_refunded, cancellation_reason')
      .in('id', a.rowIds).eq('status', 'cancelled')
    if (error) throw new Error(error.message)
    type Row = { id: string; parent_id: string; class_session_id: string; points_charged: number | null; points_refunded: number | null; cancellation_reason: string | null }
    for (const r of (rows || []) as Row[]) {
      out.rows++
      const back = await refundBookingPoints(svc, {
        booking: r, parentId: r.parent_id, reason: 'cancel_refund', actor: 'system',
        note: 'the lesson could not be put back: its seat was taken while it was being moved',
      })
      out.points += back
      out.byParent[r.parent_id] = (out.byParent[r.parent_id] || 0) + back
      const owed = (Number(r.points_charged) || 0) - (Number(r.points_refunded) || 0)
      if (r.cancellation_reason === 'rescheduled') {
        const { error: relErr } = await svc.from('bookings')
          .update({ cancellation_reason: 'cancelled_by_school', cancelled_by: 'system' })
          .eq('id', r.id).eq('status', 'cancelled').eq('cancellation_reason', 'rescheduled')
        if (relErr) console.error(`⚠️ ${a.where}: booking ${r.id} could not be relabelled:`, relErr.message)
      }
      lines.push(`Booking ${r.id} (parent ${r.parent_id}, lesson ${r.class_session_id}): ` +
        (owed > 0 ? (back > 0 ? `${back} points returned.` : `${owed} points NOT returned -- refund by hand (Reviews).`) : 'nothing was owed.'))
    }
  } catch (e) {
    // The put-back was refused, so the lesson is gone either way; nothing
    // could be refunded here, and the desk has to.
    console.error(`⚠️ ${a.where}: rows ${a.rowIds.join(', ')} were not put back and could not be settled:`, e)
    if (out.rows === 0) out.rows = a.rowIds.length
    lines.push(`Rows ${a.rowIds.join(', ')}: could not be read or refunded (${e instanceof Error ? e.message : String(e)}) -- refund by hand.`)
  }
  if (lines.length > 0) {
    await alertAdmin('Lesson lost while being moved', [
      `Where: ${a.where}. A family's lesson was being moved; the new time could not be booked, and the old lesson could not be put back because its seat had just been taken (SESSION_FULL).`,
      ...lines,
      `When: ${new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles' })} (Pacific).`,
      'Please contact the family to rebook.',
    ]).catch(e => console.error(`${a.where}: lost-lesson alert failed:`, e))
  }
  return out
}

/** Two settlements as one (a fixed-class move settles lesson by lesson). */
export function addSettled(x: Settled, y: Settled): Settled {
  const byParent = { ...x.byParent }
  for (const [k, v] of Object.entries(y.byParent)) byParent[k] = (byParent[k] || 0) + v
  return { rows: x.rows + y.rows, points: x.points + y.points, byParent }
}

/**
 * A rollback removing the class_sessions rows it opened (F81 follow-up):
 * only rows with nobody in them. After SESSION_FULL another family may have
 * booked into a session this request opened; bookings_class_session_id_fkey
 * would refuse that delete anyway, but asking for enrolled_count = 0 says so
 * plainly. A session whose count is stale (this request's own rows just
 * deleted) is removed when no booking row points at it. Best effort: logs,
 * never throws, so the caller's real answer is the one that goes out.
 */
export async function dropEmptySessions(svc: SupabaseClient, ids: string[], where: string): Promise<void> {
  if (ids.length === 0) return
  try {
    const { data: gone, error } = await svc.from('class_sessions').delete().in('id', ids).eq('enrolled_count', 0).select('id')
    if (error) throw new Error(error.message)
    const left = ids.filter(id => !(gone || []).some((g: { id: string }) => g.id === id))
    if (left.length === 0) return
    const { data: used, error: uErr } = await svc.from('bookings').select('class_session_id').in('class_session_id', left)
    if (uErr) throw new Error(uErr.message)
    const free = left.filter(id => !(used || []).some((u: { class_session_id: string }) => u.class_session_id === id))
    if (free.length === 0) return
    const { error: dErr } = await svc.from('class_sessions').delete().in('id', free)
    if (dErr) throw new Error(dErr.message)
  } catch (e) {
    console.error(`${where}: opened sessions ${ids.join(', ')} not removed:`, e instanceof Error ? e.message : e)
  }
}
