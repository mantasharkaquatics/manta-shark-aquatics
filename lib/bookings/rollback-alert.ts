import { alertAdmin } from '@/lib/admin-alert'

/* A booking takes the points first and writes the lessons second; when the
   write fails the points go back ('booking_failed'). If that give-back fails
   too (a database blip, or the wallet guard losing four races in a row), the
   family has paid for lessons that do not exist -- and the Reviews "refund
   not finished" list cannot show it, because it works from cancelled booking
   rows and none was ever written. This tells the school, so the desk can add
   the points back by hand on the family's points page (found 2026-10-08; the
   same way a Stripe purchase that could not be recorded is reported). Never
   throws. */
export async function alertRollbackFailed(svc: any, a: {
  parentId: string
  points: number
  /** How many of them were granted (bonus) points. */
  granted?: number
  why: string
  where: string
  error: unknown
}): Promise<void> {
  const msg = a.error instanceof Error ? a.error.message : String(a.error)
  console.error(`points rollback failed (${a.where}, parent ${a.parentId}, ${a.points} points):`, msg)
  try {
    let family = `parent ${a.parentId}`
    try {
      const { data: p } = await svc.from('parents').select('first_name, last_name, email').eq('id', a.parentId).maybeSingle()
      if (p) family = `${p.first_name || ''} ${p.last_name || ''}`.trim() + (p.email ? ` (${p.email})` : '')
    } catch { /* the alert still goes, with the id */ }
    await alertAdmin('Booking charge not returned', [
      `${family} was charged ${a.points} points${a.granted ? ` (${a.granted} of them bonus points)` : ''} for a booking that could not be saved, and giving the points back failed.`,
      `Where: ${a.where}. Why the booking failed: ${a.why}.`,
      `Error while returning the points: ${msg}.`,
      `When: ${new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles' })} (Pacific).`,
      "No lesson was booked. Check the family's points history (a 'booking' line with no matching lesson) and add the points back by hand on the family's points page.",
    ])
  } catch (e) {
    console.error('rollback alert failed:', e)
  }
}
