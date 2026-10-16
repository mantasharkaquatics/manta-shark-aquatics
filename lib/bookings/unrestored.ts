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
export async function settleUnrestored(svc: SupabaseClient, a: {
  rowIds: string[]
  error: unknown
  where: string
}): Promise<void> {
  if (a.rowIds.length === 0) return
  if (!isSessionFull(a.error)) {
    console.error(`⚠️ ${a.where}: rows ${a.rowIds.join(', ')} could not be put back:`, (a.error as { message?: string } | null)?.message ?? a.error)
    return
  }
  try {
    const { data: rows, error } = await svc.from('bookings')
      .select('id, parent_id, class_session_id, points_charged, points_refunded, cancellation_reason')
      .in('id', a.rowIds).eq('status', 'cancelled')
    if (error) throw new Error(error.message)
    const lines: string[] = []
    type Row = { id: string; parent_id: string; class_session_id: string; points_charged: number | null; points_refunded: number | null; cancellation_reason: string | null }
    for (const r of (rows || []) as Row[]) {
      const back = await refundBookingPoints(svc, {
        booking: r, parentId: r.parent_id, reason: 'cancel_refund', actor: 'system',
        note: 'the lesson could not be put back: its seat was taken while it was being moved',
      })
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
    if (lines.length === 0) return
    await alertAdmin('Lesson lost while being moved', [
      `Where: ${a.where}. A family's lesson was being moved; the new time could not be booked, and the old lesson could not be put back because its seat had just been taken (SESSION_FULL).`,
      ...lines,
      `When: ${new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles' })} (Pacific).`,
      'Please contact the family to rebook.',
    ])
  } catch (e) {
    console.error(`⚠️ ${a.where}: rows ${a.rowIds.join(', ')} were not put back and could not be settled:`, e)
  }
}
