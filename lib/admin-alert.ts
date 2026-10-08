import { sendEmail } from '@/lib/email'

/* A message to the school about money the system could not settle on its own
   (a late assessment payment, a chargeback, a refund made in the Stripe
   dashboard). English, as all staff mail is. Never throws: the caller has
   already recorded what it could, and a mail failure is logged loudly. */
export async function alertAdmin(title: string, lines: string[]): Promise<boolean> {
  try {
    const ok = await sendEmail({
      type: 'admin_alert',
      to: process.env.ADMIN_ALERT_EMAIL || 'info@mantasharkaquatics.net',
      alertTitle: title,
      alertLines: lines,
    })
    if (!ok) console.error(`⚠️ ADMIN ALERT NOT SENT: ${title}\n${lines.join('\n')}`)
    return ok
  } catch (e) {
    console.error(`⚠️ ADMIN ALERT NOT SENT: ${title}\n${lines.join('\n')}`, e)
    return false
  }
}
