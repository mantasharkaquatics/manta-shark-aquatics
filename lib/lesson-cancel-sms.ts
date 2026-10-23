import type { SupabaseClient } from '@supabase/supabase-js'
import { sendSms, SMS_COMPLIANCE_SUFFIX } from '@/lib/sms'
import { formatTime12h, getTodayLA, getNowMinutesLA } from '@/lib/date'

/* A text when the SCHOOL cancels a lesson that starts within 48 hours (owner,
   2026-10-22, tier-1 review item 3). The email alone can sit unread until the
   family is already in the car. Lessons further out get the email only.

   Sent only to families whose SMS consent covers it: the SMS terms list
   "Lesson changes" from 2026-10-22, and accounts that agreed before reminders
   were added (2026-10-05) are deleted before launch, exactly as the reminder
   cron treats them. Best effort: a failed text never fails the cancellation,
   and the number is never logged. */

export const CANCEL_SMS_WINDOW_HOURS = 48
const SMS_TERMS_FROM = '2026-10-05'

/** Minutes from now until a lesson's start, Los Angeles time. */
export function minutesUntil(sessionDate: string, startTime: string): number {
  const today = getTodayLA()
  const days = Math.round((Date.parse(sessionDate + 'T00:00:00Z') - Date.parse(today + 'T00:00:00Z')) / 86400000)
  const [h, m] = String(startTime || '00:00').split(':').map(Number)
  return days * 1440 + (h * 60 + (m || 0)) - getNowMinutesLA()
}

/** Whether a lesson the school just cancelled is close enough to text about. */
export function cancelNeedsText(sessionDate: string, startTime: string): boolean {
  const mins = minutesUntil(sessionDate, startTime)
  return mins > 0 && mins <= CANCEL_SMS_WINDOW_HOURS * 60
}

/**
 * Text one family that the school cancelled their lesson. `who` is the
 * swimmer name(s); returns whether a message went out.
 */
export async function textLessonCancelled(svc: SupabaseClient, opts: {
  parentId: string; who: string; sessionDate: string; startTime: string
}): Promise<boolean> {
  try {
    if (!cancelNeedsText(opts.sessionDate, opts.startTime)) return false
    const { data: p } = await svc.from('parents').select('first_name, phone, terms_version').eq('id', opts.parentId).maybeSingle()
    const parent = p as { first_name?: string | null; phone?: string | null; terms_version?: string | null } | null
    if (!parent?.phone) return false
    if (!parent.terms_version || parent.terms_version < SMS_TERMS_FROM) return false
    const day = opts.sessionDate === getTodayLA() ? 'today'
      : new Date(opts.sessionDate + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })
    const who = opts.who.trim() || 'your swimmer'
    const msg = `Hi ${parent.first_name || 'there'}, Manta Shark Aquatics here. We're sorry: we had to cancel ${who}'s lesson ${day === 'today' ? 'today' : `on ${day}`} at ${formatTime12h(opts.startTime)}. Please don't come to the pool for it. Details are in your email and on your dashboard.${SMS_COMPLIANCE_SUFFIX}`
    const r = await sendSms(parent.phone, msg)
    return r.ok && !!r.sid
  } catch (e) {
    console.error('textLessonCancelled failed for parent', opts.parentId, e instanceof Error ? e.message : '')
    return false
  }
}

/**
 * Text one family that the pool is closed (owner, 2026-10-23; lib/closures.ts):
 * one message for all their cancelled lessons (kind 'lesson') or Swim Team
 * practices (kind 'team'), sent when the earliest of them starts within 48
 * hours. Same consent rule as textLessonCancelled. `reason` is English.
 */
export async function textClosure(svc: SupabaseClient, opts: {
  parentId: string; who: string; items: { date: string; start: string }[]; reason: string; kind: 'lesson' | 'team'
}): Promise<boolean> {
  try {
    const soon = opts.items.filter(i => cancelNeedsText(i.date, i.start))
      .sort((a, b) => `${a.date} ${a.start}`.localeCompare(`${b.date} ${b.start}`))
    if (!soon.length) return false
    const { data: p } = await svc.from('parents').select('first_name, phone, terms_version').eq('id', opts.parentId).maybeSingle()
    const parent = p as { first_name?: string | null; phone?: string | null; terms_version?: string | null } | null
    if (!parent?.phone) return false
    if (!parent.terms_version || parent.terms_version < SMS_TERMS_FROM) return false
    const dayOf = (d: string) => d === getTodayLA() ? 'today'
      : 'on ' + new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })
    const first = soon[0]
    const more = opts.items.length > 1
    const who = opts.who.trim() || 'your swimmer'
    const what = opts.kind === 'team'
      ? `${who}'s Swim Team practice ${dayOf(first.date)} at ${formatTime12h(first.start)}${more ? ' (and the other practices in that time)' : ''} is cancelled`
      : `we cancelled ${who}'s lesson ${dayOf(first.date)} at ${formatTime12h(first.start)}${more ? ' and the other lessons in that time' : ''}`
    const msg = `Hi ${parent.first_name || 'there'}, Manta Shark Aquatics here. The pool is closed (${opts.reason}), so ${what}. Please don't come to the pool. Details are in your email and on your dashboard.${SMS_COMPLIANCE_SUFFIX}`
    const r = await sendSms(parent.phone, msg)
    return r.ok && !!r.sid
  } catch (e) {
    console.error('textClosure failed for parent', opts.parentId, e instanceof Error ? e.message : '')
    return false
  }
}
