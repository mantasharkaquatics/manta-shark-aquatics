// The desk took a chat over (mode 'human') and went quiet, or forgot to
// press "Hand back to AI". The AI stayed silent for good, so a family writing
// in the evening got no answer at all (found 2026-10-08).
//
// Owner, 2026-10-08: once the desk has been quiet for 30 minutes, the
// family's next message goes back to the AI. "Quiet" is measured from the
// desk's newest message in the thread, or from when the desk took it over
// (chat_threads.human_since, docs/migration-chat-handback.sql), whichever is
// later, so a take-over with no reply yet still counts as the desk being
// there. The switch happens when the family writes (no scheduled job): the
// thread goes back to 'ai', a notice is posted in both screens, the desk's
// open issue (escalation_summary) is kept and the thread is flagged unread,
// so the desk still sees it.

import { CHAT_HANDBACK_AUTO_EN, CHAT_HANDBACK_AUTO_KEY } from '@/lib/chat-open'

export const DESK_IDLE_MINUTES = 30

const ms = (t: unknown) => (t ? new Date(String(t)).getTime() || 0 : 0)

/**
 * Hands the thread back to the AI when the desk has been quiet long enough.
 * `triggerAt` is the created_at of the family's message that came in. Returns
 * that time (the AI's new context cutoff) when the thread is now the AI's,
 * or null when the desk is still on it.
 */
export async function autoHandBackIfIdle(svc: any, threadId: string, triggerAt: string): Promise<string | null> {
  const [{ data: lastDesk }, sinceRes] = await Promise.all([
    svc.from('chat_messages').select('created_at').eq('thread_id', threadId).eq('sender_type', 'admin')
      .order('created_at', { ascending: false }).limit(1).maybeSingle(),
    svc.from('chat_threads').select('human_since').eq('id', threadId).maybeSingle(),
  ])
  // Before the migration the column is missing: only the desk's messages count.
  const since = sinceRes?.error ? null : sinceRes?.data?.human_since
  const lastDeskAt = Math.max(ms(lastDesk?.created_at), ms(since))
  if (Date.now() - lastDeskAt < DESK_IDLE_MINUTES * 60_000) return null

  // Only the call that flips the mode posts the notice; a second message
  // racing in finds it already flipped and simply goes on to the AI (whose
  // per-message claim stops a double answer).
  const { data: flipped, error } = await svc.from('chat_threads')
    .update({ mode: 'ai', ai_context_from: triggerAt, unread_by_admin: true })
    .eq('id', threadId).eq('mode', 'human').select('id')
  if (error) { console.error('chat auto hand-back failed', error); return null }
  if (flipped && flipped.length > 0) {
    await svc.from('chat_messages').insert({
      thread_id: threadId,
      sender_type: 'system',
      body: CHAT_HANDBACK_AUTO_EN,
      metadata: { key: CHAT_HANDBACK_AUTO_KEY },
    })
  }
  return triggerAt
}
