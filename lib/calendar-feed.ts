import { randomBytes } from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { allRows } from './db-paging'
import { lessonCalendar } from './lesson-calendar'
import { calendarEvents } from './email-family'
import { icsFile } from './ics'
import { getT, toLocale } from './i18n/all'
import { CONTACT_EMAIL } from './site-config'
import { getTodayLA } from './date'

/* The family's lessons as a calendar to subscribe to (owner, 2026-11-02:
   "all lessons in the calendar at once, kept up to date, never twice, and a
   cancelled lesson goes away").

   One private link per family (table calendar_feeds,
   docs/migration-calendar-feed.sql). Google Calendar or the iPhone
   subscribes to it once and reads it again on its own: new lessons appear,
   cancelled ones disappear, moved ones move -- the feed always holds exactly
   the family's live lessons. Google reads it every few hours at best; the
   iPhone as often as its settings say.

   The link is the only key: anyone with it sees the lessons (names, times,
   pool, coach), so it is long and random and never shown to anyone but the
   family. A family whose feed a calendar has read in the last FRESH_DAYS
   gets no .ics files in its lesson emails (lib/email.ts): the same lesson
   would otherwise show twice. */

type FeedRow = { parent_id: string; token: string; fetched_at: string | null }

export const FRESH_DAYS = 14
/** How far back the feed goes; older lessons drop out of the calendar. */
const PAST_DAYS = 60

/** The family's feed token, made the first time it is asked for. */
export async function feedToken(svc: SupabaseClient, parentId: string): Promise<{ token: string; fetchedAt: string | null }> {
  const read = async () => {
    const { data } = await svc.from('calendar_feeds').select('token, fetched_at').eq('parent_id', parentId).maybeSingle()
    const row = data as FeedRow | null
    return row ? { token: row.token, fetchedAt: row.fetched_at } : null
  }
  const have = await read()
  if (have) return have
  const token = randomBytes(24).toString('base64url')
  const { error } = await svc.from('calendar_feeds').insert({ parent_id: parentId, token })
  if (error) {
    // Two tabs at once: the other one made it.
    const again = await read()
    if (again) return again
    throw new Error('calendar_feeds insert failed: ' + error.message)
  }
  return { token, fetchedAt: null }
}

/** The links a family subscribes with. origin: the site the family is on. */
export function feedLinks(origin: string, token: string) {
  const https = `${origin.replace(/\/$/, '')}/api/calendar/feed/${token}.ics`
  const webcal = https.replace(/^https?:\/\//, 'webcal://')
  return { https, webcal, google: `https://calendar.google.com/calendar/render?cid=${encodeURIComponent(webcal)}` }
}

export const isFresh = (fetchedAt: string | null | undefined) =>
  !!fetchedAt && Date.now() - new Date(fetchedAt).getTime() < FRESH_DAYS * 86_400_000

/** True when a calendar has read this family's feed lately, or someone in
 *  it connected Google Calendar (by email, as the family emails are
 *  addressed). */
export async function familySynced(svc: SupabaseClient, email: string | undefined): Promise<boolean> {
  const to = String(email || '').trim().toLowerCase()
  if (!to) return false
  const { data: fam } = await svc.from('parents').select('id').eq('email', to).limit(1).maybeSingle()
  if (!fam) return false
  const id = (fam as { id: string }).id
  const [{ data }, { count }] = await Promise.all([
    svc.from('calendar_feeds').select('fetched_at').eq('parent_id', id).maybeSingle(),
    // A Google Calendar connected by sign-in (lib/google-calendar) counts too.
    svc.from('google_calendar_links').select('id', { count: 'exact', head: true }).eq('parent_id', id),
  ])
  return isFresh((data as Pick<FeedRow, 'fetched_at'> | null)?.fetched_at) || (count || 0) > 0
}

/** The family's live lessons from PAST_DAYS ago on, as calendar events in
 *  its language -- for the feed and for Google Calendar (lib/google-calendar). */
export async function familyEvents(svc: SupabaseClient, parentId: string) {
  const from = new Date(new Date(getTodayLA() + 'T12:00:00Z').getTime() - PAST_DAYS * 86_400_000).toISOString().slice(0, 10)
  const [{ data: rows }, { data: p }] = await Promise.all([
    allRows(() => svc.from('bookings')
      .select('id, class_sessions!bookings_class_session_id_fkey!inner(session_date)')
      .eq('parent_id', parentId).eq('status', 'confirmed')
      .gte('class_sessions.session_date', from).order('id')),
    svc.from('parents').select('preferred_language').eq('id', parentId).maybeSingle(),
  ])
  const ids = ((rows || []) as { id: string }[]).map(b => b.id)
  const L = toLocale((p as { preferred_language?: string } | null)?.preferred_language || 'en')
  const lessons = ids.length ? (await lessonCalendarChunked(svc, parentId, ids)) : []
  const events = calendarEvents(lessons.filter(l => !l.cancelled), L)
    // Its own UIDs: an event a family added from an email before subscribing
    // lives in another calendar and must not be taken for this one.
    .map(e => ({ ...e, uid: 'feed-' + e.uid }))
  return { events, L, from, name: getT(L)('mail.ics.calName') }
}

/** The feed itself. null: no such token. */
export async function feedIcs(svc: SupabaseClient, token: string): Promise<string | null> {
  const { data } = await svc.from('calendar_feeds').select('parent_id, fetched_at').eq('token', token).maybeSingle()
  const feed = data as Pick<FeedRow, 'parent_id' | 'fetched_at'> | null
  if (!feed) return null
  const parentId = feed.parent_id
  const { events, name } = await familyEvents(svc, parentId)
  // Remember that a calendar reads it, at most once an hour.
  if (!feed.fetched_at || Date.now() - new Date(feed.fetched_at).getTime() > 3_600_000) {
    await svc.from('calendar_feeds').update({ fetched_at: new Date().toISOString() }).eq('parent_id', parentId)
  }
  return icsFile({ method: 'PUBLISH', events, organizer: { name: 'Manta Shark Aquatics', email: CONTACT_EMAIL }, name })
}

/** lessonCalendar in pieces, so a family with many lessons never sends one
 *  enormous id list in a URL. */
async function lessonCalendarChunked(svc: SupabaseClient, parentId: string, ids: string[]) {
  const out: NonNullable<Awaited<ReturnType<typeof lessonCalendar>>> = []
  const seen = new Set<string>()
  for (let i = 0; i < ids.length; i += 150) {
    for (const l of (await lessonCalendar(svc, parentId, ids.slice(i, i + 150))) || []) {
      if (seen.has(l.uid)) continue
      seen.add(l.uid); out.push(l)
    }
  }
  return out
}
