import type { SupabaseClient } from '@supabase/supabase-js'
import type { EmailPayload, EmailType } from '@/lib/email'
import { getT } from '@/lib/i18n/all'
import { dateTag, type Locale } from '@/lib/i18n'
import { getTodayLA } from '@/lib/date'
import { courseIn, holdUntil, VIEWER_COPY } from '@/lib/email-family'
import { pushFamily, type PushCategory, type PushMessage } from '@/lib/push'

/* The words of each push (owner approved the sample page, 2026-10-27).

   Most pushes ride on a family email that already goes out: the same
   booking, cancellation, reminder, closure or waitlist offer, so every place
   that emails a family about it pushes too, with nothing to add at each
   call site (pushForEmail, called from lib/email.ts). The email still goes.
   The lesson report has no email; review-progress calls pushReport.

   Never the pool's address: a push shows on a locked screen (owner,
   2026-10-22: the address is only for families with a booking). */

type T = (key: string, vars?: Record<string, string | number>) => string

const PUSHED: Partial<Record<EmailType, PushCategory>> = {
  reminder_24h: 'reminders',
  booking_confirmed: 'bookings',
  booking_series_confirmed: 'bookings',
  booking_rescheduled: 'bookings',
  booking_cancelled: 'bookings',
  waitlist_offer: 'bookings',
  block_cancellation_notice: 'always',
  team_practice_cancelled: 'always',
}

/** "today", "tomorrow" or "on Fri, Oct 30" / "10/30（週五）". */
function dayText(L: Locale, t: T, d?: string): string {
  if (!d) return ''
  const today = getTodayLA()
  if (d === today) return t('push.today')
  const tomorrow = new Date(Date.parse(today + 'T12:00:00Z') + 86400000).toISOString().slice(0, 10)
  if (d === tomorrow) return t('push.tomorrow')
  return t('push.onDate', { date: new Date(d + 'T12:00:00Z').toLocaleDateString(dateTag(L), {
    month: L === 'en' ? 'short' : 'numeric', day: 'numeric', weekday: 'short', timeZone: 'UTC',
  }) })
}

/** "3:35 PM" out of "3:35 PM – 4:05 PM". */
const startOf = (time?: string) => String(time || '').split(/\s[–-]\s/)[0].trim()

/** The path of a link to our own site ("/booking?x=1"), else the fallback. */
function sitePath(link: string | undefined, fallback: string): string {
  if (!link) return fallback
  try {
    const u = new URL(link, 'https://www.mantasharkaquatics.net')
    return u.pathname + u.search
  } catch { return fallback }
}

function closureReasonText(t: T, p: EmailPayload): string {
  const key = p.closureReasonKey as string | undefined
  return key && key !== 'other' ? t('closure.reason.' + key) : String(p.closureReasonText || '')
}

/** The push for one family email, or null when that email has none. */
export function pushOfEmail(p: EmailPayload): PushMessage | null {
  const category = PUSHED[p.type]
  if (!category) return null
  return {
    category,
    viewerOk: VIEWER_COPY.has(p.type),
    url: p.type === 'waitlist_offer' ? sitePath(p.linkUrl as string | undefined, '/booking') : '/dashboard',
    text: (L) => {
      const t = getT(L) as T
      const who = String(p.studentName || '').trim() || t('push.yourSwimmer')
      const course = courseIn(L, t, p.courseName)
      const coach = String(p.coachName || '').trim()
      const v = { who, course, coach, day: dayText(L, t, p.date), time: startOf(p.time) }
      switch (p.type) {
        case 'reminder_24h':
          return { title: t('push.reminder.title'), body: t(coach ? 'push.reminder.body' : 'push.reminder.bodyNoCoach', v) }
        case 'booking_confirmed':
          return { title: t('push.booked.title'), body: t(coach ? 'push.booked.body' : 'push.booked.bodyNoCoach', v) }
        case 'booking_series_confirmed': {
          const dates = (p.dates as string[] | undefined) || []
          const times = (p.times as string[] | undefined) || []
          const first = { ...v, day: dayText(L, t, dates[0]), time: startOf(times[0] || p.time) }
          return dates.length > 1
            ? { title: t('push.series.title'), body: t('push.series.body', { ...first, n: dates.length }) }
            : { title: t('push.booked.title'), body: t(coach ? 'push.booked.body' : 'push.booked.bodyNoCoach', first) }
        }
        case 'booking_rescheduled':
          return { title: t('push.moved.title'), body: t(coach ? 'push.moved.body' : 'push.moved.bodyNoCoach', v) }
        case 'booking_cancelled':
          return { title: t('push.cancel.title'), body: t('push.cancel.body', v) }
        case 'block_cancellation_notice':
          return p.closureReasonKey
            ? { title: t('push.closure.title'), body: t('push.closure.body', { ...v, reason: closureReasonText(t, p) }) }
            : { title: t('push.schoolCancel.title'), body: t('push.schoolCancel.body', v) }
        case 'team_practice_cancelled':
          return { title: t('push.closure.title'), body: t('push.teamClosure.body', { ...v, reason: closureReasonText(t, p) }) }
        case 'waitlist_offer':
          return {
            title: t('push.wait.title'),
            body: t('push.wait.body', { ...v, until: holdUntil(L, p.deadlineAt as string | undefined, p.deadline) }),
          }
        default:
          return { title: '', body: '' }
      }
    },
  }
}

/** Push the notice that goes with this family email, to the family it is
 *  addressed to. Best effort. */
export async function pushForEmail(svc: SupabaseClient, p: EmailPayload): Promise<void> {
  const msg = pushOfEmail(p)
  if (!msg) return
  const to = String(p.to || '').trim().toLowerCase()
  if (!to) return
  const { data: fam } = await svc.from('parents').select('id').eq('email', to).limit(1).maybeSingle()
  const id = (fam as { id?: string } | null)?.id
  if (id) await pushFamily(svc, id, msg)
}

/** A lesson report the desk just approved (no email goes with it). Opens the
 *  swimmer's lesson records. */
export async function pushReport(svc: SupabaseClient, opts: { studentId: string; coachId?: string | null }): Promise<void> {
  try {
    const { data: s } = await svc.from('students').select('parent_id, full_name').eq('id', opts.studentId).maybeSingle()
    const st = s as { parent_id?: string | null; full_name?: string | null } | null
    if (!st?.parent_id) return
    let coach = ''
    if (opts.coachId) {
      const { data: c } = await svc.from('coaches').select('first_name').eq('id', opts.coachId).maybeSingle()
      coach = String((c as { first_name?: string | null } | null)?.first_name || '').trim()
    }
    const first = String(st.full_name || '').trim().split(/\s+/)[0] || ''
    await pushFamily(svc, st.parent_id, {
      category: 'reports',
      viewerOk: true,
      url: `/dashboard?records=${encodeURIComponent(opts.studentId)}`,
      text: (L) => {
        const t = getT(L) as T
        const who = first || t('push.yourSwimmer')
        return {
          title: t('push.report.title', { who }),
          body: coach ? t('push.report.body', { coach }) : t('push.report.bodyNoCoach'),
        }
      },
    })
  } catch (e) {
    console.warn('push: report push failed', e instanceof Error ? e.message : '')
  }
}

/** The desk's test notice (admin family page, owner 2026-10-27): proves a
 *  family's phones get notices. Sent like a closure -- past the family's
 *  switches -- so a switched-off kind cannot make the test look broken. */
export async function pushTest(svc: SupabaseClient, parentId: string): Promise<number> {
  return pushFamily(svc, parentId, {
    category: 'always',
    viewerOk: true,
    url: '/dashboard',
    text: (L) => {
      const t = getT(L) as T
      return { title: t('push.test.title'), body: t('push.test.body') }
    },
  })
}
