import type { SupabaseClient } from '@supabase/supabase-js'
import { alertAdmin } from '@/lib/admin-alert'
import { sendSms } from '@/lib/sms'
import { SITE_URL } from '@/lib/site-config'

/* When the AI hands a family over to a person (owner, 2026-10-22, tier-1
   review item 4): an email to ADMIN_ALERT_EMAIL and a text to
   ADMIN_ALERT_PHONE, so the desk can answer the same day instead of finding
   the thread whenever someone next opens Messages.

   At most one alert per conversation every 30 minutes
   (chat_threads.staff_alerted_at, docs/migration-safety-info.sql): a family
   who writes five times in a row while waiting sends one alert, not five.
   The stamp is claimed before sending, so two messages at once cannot both
   alert. Before the migration there is no stamp, and every hand-off alerts.

   Never throws; a failed alert never stops the chat reply. The text names
   the family's first name only, never what they wrote: the summary may hold
   medical or payment details, and it is in the email and in Messages. */

const THROTTLE_MS = 30 * 60 * 1000

export async function alertDeskChat(svc: SupabaseClient, opts: {
  threadId: string; parentFirstName?: string | null; reason?: string | null
}): Promise<void> {
  try {
    const now = new Date()
    const since = new Date(now.getTime() - THROTTLE_MS).toISOString()
    const { data: claimed, error } = await svc.from('chat_threads')
      .update({ staff_alerted_at: now.toISOString() })
      .eq('id', opts.threadId)
      .or(`staff_alerted_at.is.null,staff_alerted_at.lt.${since}`)
      .select('id')
    const missingColumn = !!error && (error.code === '42703' || error.code === 'PGRST204' || /staff_alerted_at/.test(error.message || ''))
    if (error && !missingColumn) { console.error('[chat-desk-alert] claim failed', error.message); return }
    if (!error && (!claimed || claimed.length === 0)) return // alerted within the last 30 minutes

    const who = (opts.parentFirstName || '').trim() || 'A family'
    const link = `${SITE_URL}/admin/messages`
    const reason = String(opts.reason || '').trim().slice(0, 600)
    await Promise.allSettled([
      alertAdmin(`Chat: ${who} is waiting for a person`, [
        `The assistant handed this conversation to the team. Please reply today (evening messages: the next morning).`,
        ...(reason ? [`What they need: ${reason}`] : []),
        `Open Messages: ${link}`,
      ]),
      process.env.ADMIN_ALERT_PHONE
        ? sendSms(process.env.ADMIN_ALERT_PHONE, `Manta Shark: ${who} is waiting for a person in chat. Reply in admin Messages: ${link}`)
        : Promise.resolve(null),
    ])
  } catch (e) {
    console.error('[chat-desk-alert] failed', e instanceof Error ? e.message : '')
  }
}
