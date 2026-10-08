import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendEmail } from '@/lib/email'
import { requireCron } from '@/lib/cron-auth'

export const runtime = 'nodejs'
export const maxDuration = 60

// Every 5 minutes (cron-job.org, Authorization: Bearer CRON_SECRET).
//
// The desk replies to a family in the chat (an AI handoff: a refund, a new
// assessment time, a sick-day exception), and the family has closed the page.
// Nothing told them (found 2026-10-08), so a reply could sit unseen for days.
// Owner, 2026-10-08: a dot on the chat button (components/ChatWidget) and, when
// a desk reply has gone unread for 10 minutes, one email in the family's
// language. No SMS.
//
// "Unread" is a desk message newer than chat_threads.parent_last_read_at, which
// the widget sets to the newest message on screen while the family has the
// chat open. One email per batch of replies: the batch starts at the first
// unread reply, and parent_reply_emailed_at (when the email went out) later
// than that means this batch has had its email. A reply the family reads
// within 10 minutes is never emailed. Both columns come from
// docs/migration-fix5-A.sql; before that is run this job does nothing.
//
// Only replies from the last day are looked at, so the first run after the
// migration does not email about old conversations, and a job that was down
// for a while does not send a pile of stale notices.
const UNREAD_MINUTES = 10
const LOOKBACK_HOURS = 24

export async function GET(req: NextRequest) {
  const denied = requireCron(req)
  if (denied) return denied
  const svc = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

  const now = Date.now()
  const cutoff = new Date(now - UNREAD_MINUTES * 60000).toISOString()
  const since = new Date(now - LOOKBACK_HOURS * 3600000).toISOString()

  // Desk replies old enough to count as unread. Few rows: only the desk writes these.
  const { data: replies, error: rErr } = await svc.from('chat_messages')
    .select('thread_id, created_at')
    .eq('sender_type', 'admin')
    .gte('created_at', since).lte('created_at', cutoff)
    .order('created_at', { ascending: true })
    .limit(1000)
  if (rErr) return NextResponse.json({ error: rErr.message }, { status: 500 })
  if (!replies?.length) return NextResponse.json({ sent: 0 })

  // The newest such reply per thread.
  const newestReply = new Map<string, string>()
  for (const r of replies) newestReply.set(r.thread_id, r.created_at)

  const { data: threads, error: tErr } = await svc.from('chat_threads')
    .select('id, parent_id, parent_last_read_at, parent_reply_emailed_at')
    .in('id', [...newestReply.keys()])
    .not('parent_id', 'is', null)
  if (tErr) {
    // 42703: the columns are not there yet (docs/migration-fix5-A.sql).
    if (tErr.code === '42703') return NextResponse.json({ sent: 0, note: 'migration-fix5-A.sql not run yet' })
    return NextResponse.json({ error: tErr.message }, { status: 500 })
  }

  const ms = (v: string | null | undefined) => (v ? Date.parse(v) : -Infinity)
  // A desk reply (10+ minutes old) after the family last had the chat open.
  const unread = (threads || []).filter((th: any) => ms(newestReply.get(th.id)) > ms(th.parent_last_read_at))

  let sent = 0
  let due = 0
  const failed: string[] = []
  for (const th of unread as any[]) {
    // Where this batch starts: the first desk reply after the read mark (it
    // may be older than the look-back, so it is asked for on its own).
    let first = svc.from('chat_messages').select('created_at')
      .eq('thread_id', th.id).eq('sender_type', 'admin')
    if (th.parent_last_read_at) first = first.gt('created_at', th.parent_last_read_at)
    const { data: f } = await first.order('created_at', { ascending: true }).limit(1).maybeSingle()
    if (!f) continue
    // This batch has had its email.
    if (ms(th.parent_reply_emailed_at) >= ms(f.created_at)) continue
    due++
    // Claimed before sending, on the value just read, so two runs that
    // overlap cannot both send it.
    const stamp = new Date().toISOString()
    let claim = svc.from('chat_threads').update({ parent_reply_emailed_at: stamp }).eq('id', th.id)
    claim = th.parent_reply_emailed_at ? claim.eq('parent_reply_emailed_at', th.parent_reply_emailed_at) : claim.is('parent_reply_emailed_at', null)
    const { data: claimed, error: cErr } = await claim.select('id')
    if (cErr || !claimed?.length) continue

    const { data: p } = await svc.from('parents').select('first_name, email, preferred_language').eq('id', th.parent_id).maybeSingle()
    if (!p?.email) continue
    const ok = await sendEmail({ type: 'chat_reply', to: p.email, parentName: p.first_name || '', lang: p.preferred_language || 'en' })
    if (ok) { sent++; continue }
    // Not sent: put the stamp back so the next run tries again.
    failed.push(th.id)
    await svc.from('chat_threads').update({ parent_reply_emailed_at: th.parent_reply_emailed_at ?? null })
      .eq('id', th.id).eq('parent_reply_emailed_at', stamp)
  }

  return NextResponse.json({ sent, due, failed })
}
