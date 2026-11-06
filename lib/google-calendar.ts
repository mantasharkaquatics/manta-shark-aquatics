import { createHash, createHmac, timingSafeEqual } from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { familyEvents } from './calendar-feed'

/* "Sign in with Google" for the lesson calendar (owner, 2026-11-02).

   Google Calendar's phone app cannot subscribe to a calendar link, so on a
   phone the family signs in with Google instead -- whichever Google account
   the phone uses, nothing to do with the email it registered with -- and
   allows us one thing: the scope calendar.app.created, "make secondary
   calendars and manage the events on them". We create one calendar, "Manta
   Shark 課程", in that account and keep it equal to the family's live
   lessons. We cannot see or touch the rest of their calendar.

   Google Cloud project "Manta Shark Calendar" (company account), OAuth client
   "Manta Shark Website"; env GOOGLE_CALENDAR_CLIENT_ID and
   GOOGLE_CALENDAR_CLIENT_SECRET. Without them the feature is off and the
   card offers what it did before.

   One row per signed-in person and Google account (google_calendar_links,
   docs/migration-google-calendar.sql and migration-calendar-marks.sql, server
   only): the refresh token, the calendar's id, and which Google account it
   is (google_sub, google_email -- from the "openid email" scopes, shown on
   the card). One login may connect up to MAX_GOOGLE_PER_PERSON accounts
   (owner, 2026-11-03: two phones on one login, each with its own Google);
   connecting the same account again keeps its calendar. syncFamily() rewrites every linked calendar of a family
   from familyEvents(): each event's id is derived from the lesson's UID, so
   a lesson is never added twice, a moved one is updated and a cancelled one
   deleted. It runs when the person connects, after every lesson email
   (lib/email.ts -- a booking, move or cancellation sends one) and, as a
   catch-all, when the schedule is opened and the last sync is over an hour
   old. */

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const API = 'https://www.googleapis.com/calendar/v3'
export const GOOGLE_CAL_SCOPE = 'https://www.googleapis.com/auth/calendar.app.created'
export const MAX_GOOGLE_PER_PERSON = 3
const TZ = 'America/Los_Angeles'

// Trimmed: a value pasted into Vercel with spaces in front (it happened,
// 2026-11-03) would otherwise go to Google as a client id it does not know.
const clientId = () => (process.env.GOOGLE_CALENDAR_CLIENT_ID || '').trim()
const clientSecret = () => (process.env.GOOGLE_CALENDAR_CLIENT_SECRET || '').trim()
export const googleCalendarOn = () => !!clientId() && !!clientSecret()

export type GoogleLink = { id: string; parent_id: string; auth_user_id: string; refresh_token: string; calendar_id: string | null; synced_at: string | null }
const LINK_COLS = 'id, parent_id, auth_user_id, refresh_token, calendar_id, synced_at'

/* ---------- sign-in ---------- */

/** state = who asked, signed, good for 15 minutes. The callback has no
 *  cookie to go on: inside the app Google's page opens in Safari. */
export function makeState(parentId: string, userId: string, app: boolean): string {
  const body = Buffer.from(JSON.stringify({ p: parentId, u: userId, a: app ? 1 : 0, t: Date.now() + 15 * 60_000 })).toString('base64url')
  const sig = createHmac('sha256', clientSecret()).update(body).digest('base64url')
  return `${body}.${sig}`
}

export function readState(state: string): { parentId: string; userId: string; app: boolean } | null {
  const [body, sig] = String(state || '').split('.')
  if (!body || !sig) return null
  const want = createHmac('sha256', clientSecret()).update(body).digest()
  const got = Buffer.from(sig, 'base64url')
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null
  try {
    const j = JSON.parse(Buffer.from(body, 'base64url').toString())
    if (!j.p || !j.u || typeof j.t !== 'number' || j.t < Date.now()) return null
    return { parentId: String(j.p), userId: String(j.u), app: j.a === 1 }
  } catch { return null }
}

export const redirectUri = (origin: string) => `${origin.replace(/\/$/, '')}/api/calendar/google/callback`

export function authUrl(origin: string, state: string): string {
  const q = new URLSearchParams({
    client_id: clientId(), redirect_uri: redirectUri(origin), response_type: 'code',
    // openid email: which account it is, for the card. select_account: a
    // second phone on the same login can pick a different Google account.
    scope: `openid email ${GOOGLE_CAL_SCOPE}`, access_type: 'offline', prompt: 'consent select_account', state,
  })
  return `${AUTH_URL}?${q.toString()}`
}

/** The code from the callback, for a refresh token (and the scope granted). */
export async function exchangeCode(origin: string, code: string): Promise<{ refresh_token?: string; access_token?: string; scope?: string; id_token?: string }> {
  const r = await fetch(TOKEN_URL, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code, client_id: clientId(), client_secret: clientSecret(), redirect_uri: redirectUri(origin), grant_type: 'authorization_code' }),
  })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error('token exchange failed: ' + (j.error || r.status))
  return j
}

/** Which Google account: the id token came straight from Google's token
 *  endpoint over TLS, so its payload is read without checking the
 *  signature. */
export function idClaims(idToken: string | undefined): { sub: string; email: string | null } | null {
  try {
    const j = JSON.parse(Buffer.from(String(idToken || '').split('.')[1] || '', 'base64url').toString())
    return j.sub ? { sub: String(j.sub), email: j.email ? String(j.email) : null } : null
  } catch { return null }
}

/** The person revoked us in their Google account, or the token expired. */
class Revoked extends Error {}

async function accessToken(refresh: string): Promise<string> {
  const r = await fetch(TOKEN_URL, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ refresh_token: refresh, client_id: clientId(), client_secret: clientSecret(), grant_type: 'refresh_token' }),
  })
  const j = await r.json().catch(() => ({}))
  if (j.error === 'invalid_grant') throw new Revoked('invalid_grant')
  if (!r.ok || !j.access_token) throw new Error('refresh failed: ' + (j.error || r.status))
  return j.access_token
}

async function api(token: string, method: string, path: string, body?: unknown): Promise<{ status: number; json: any }> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const r = await fetch(API + path, {
    method, headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  const json = r.status === 204 ? null : await r.json().catch(() => null)
  return { status: r.status, json }
}

/* ---------- sync ---------- */

/** A lesson's Google event id: lowercase hex is inside Google's base32hex
 *  alphabet, so a hash of the UID is a valid id and the same every time. */
const eventId = (uid: string) => 'ms' + createHash('sha1').update(uid).digest('hex')

/** Wall-clock LA time for Google: "2026-11-05T16:15:00" with timeZone. */
function at(date: string, hhmm: string, plusMin = 0) {
  const [h, m] = hhmm.split(':').map(Number)
  const t = Math.min(h * 60 + m + plusMin, 23 * 60 + 59)
  return { dateTime: `${date}T${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}:00`, timeZone: TZ }
}

/** Make this one person's Google calendar equal to the family's lessons. */
export async function syncLink(svc: SupabaseClient, link: GoogleLink, want: Awaited<ReturnType<typeof familyEvents>>): Promise<void> {
  const token = await accessToken(link.refresh_token)
  let cal = link.calendar_id
  if (cal) {
    const got = await api(token, 'GET', `/calendars/${encodeURIComponent(cal)}`)
    if (got.status === 404 || got.status === 410) cal = null // the family deleted it: make it again
  }
  if (!cal) {
    const made = await api(token, 'POST', '/calendars', { summary: want.name, timeZone: TZ })
    if (made.status >= 300 || !made.json?.id) throw new Error('calendar create failed: ' + made.status)
    cal = made.json.id as string
    await svc.from('google_calendar_links').update({ calendar_id: cal }).eq('id', link.id)
  }
  const base = `/calendars/${encodeURIComponent(cal)}/events`

  // What is there now (ours only: the calendar is ours).
  const have = new Map<string, { status?: string; summary?: string; location?: string; description?: string; start?: { dateTime?: string }; end?: { dateTime?: string } }>()
  let page: string | undefined
  do {
    const q = new URLSearchParams({ maxResults: '2500', showDeleted: 'false', timeMin: `${want.from}T00:00:00Z`, ...(page ? { pageToken: page } : {}) })
    const r = await api(token, 'GET', `${base}?${q}`)
    if (r.status >= 300) throw new Error('events list failed: ' + r.status)
    for (const e of r.json?.items || []) have.set(e.id, e)
    page = r.json?.nextPageToken
  } while (page)

  const keep = new Set<string>()
  for (const e of want.events) {
    const id = eventId(e.uid)
    keep.add(id)
    const body = {
      id, summary: e.title, location: e.location || '', description: e.description || '',
      start: at(e.date, e.start), end: at(e.date, e.start, e.minutes),
      reminders: { useDefault: true }, status: 'confirmed',
    }
    const cur = have.get(id)
    if (cur && cur.summary === body.summary && (cur.location || '') === body.location && (cur.description || '') === body.description
      && cur.start?.dateTime?.slice(0, 16) === body.start.dateTime.slice(0, 16) && cur.end?.dateTime?.slice(0, 16) === body.end.dateTime.slice(0, 16)) continue
    if (cur) {
      const r = await api(token, 'PUT', `${base}/${id}`, body)
      if (r.status >= 300) throw new Error('event update failed: ' + r.status)
    } else {
      let r = await api(token, 'POST', base, body)
      // Deleted once before: the id is still taken, so bring it back.
      if (r.status === 409) r = await api(token, 'PUT', `${base}/${id}`, body)
      if (r.status >= 300) throw new Error('event insert failed: ' + r.status)
    }
  }
  for (const id of have.keys()) {
    if (keep.has(id)) continue
    const r = await api(token, 'DELETE', `${base}/${id}`)
    if (r.status >= 300 && r.status !== 404 && r.status !== 410) throw new Error('event delete failed: ' + r.status)
  }
  await svc.from('google_calendar_links').update({ synced_at: new Date().toISOString(), last_error: null }).eq('id', link.id)
}

/** Sync every Google calendar linked to this family. Never throws. */
export async function syncFamily(svc: SupabaseClient, parentId: string, only?: { linkId?: string; ifOlderThanMs?: number }): Promise<void> {
  if (!googleCalendarOn()) return
  try {
    let q = svc.from('google_calendar_links').select(LINK_COLS).eq('parent_id', parentId)
    if (only?.linkId) q = q.eq('id', only.linkId)
    const { data } = await q
    let links = (data || []) as GoogleLink[]
    if (only?.ifOlderThanMs) links = links.filter(l => !l.synced_at || Date.now() - new Date(l.synced_at).getTime() > only.ifOlderThanMs!)
    if (!links.length) return
    // Only the people still in the family (14-role test 2, J05): a removed
    // member's calendar is not written to.
    const [{ data: p }, { data: gs }] = await Promise.all([
      svc.from('parents').select('auth_user_id').eq('id', parentId).maybeSingle(),
      svc.from('parent_guardians').select('auth_user_id').eq('parent_id', parentId).is('removed_at', null),
    ])
    const inFamily = new Set([(p as { auth_user_id?: string | null } | null)?.auth_user_id, ...((gs || []) as { auth_user_id: string | null }[]).map(g => g.auth_user_id)].filter(Boolean))
    links = links.filter(l => !l.auth_user_id || inFamily.has(l.auth_user_id))
    if (!links.length) return
    const want = await familyEvents(svc, parentId)
    for (const link of links) {
      try { await syncLink(svc, link, want) } catch (e) {
        if (e instanceof Revoked) {
          // They took the permission back in Google: forget the link.
          await svc.from('google_calendar_links').delete().eq('id', link.id)
          console.warn('google calendar link revoked; removed', link.id)
        } else {
          const msg = e instanceof Error ? e.message : String(e)
          await svc.from('google_calendar_links').update({ last_error: msg.slice(0, 300) }).eq('id', link.id)
          console.error('google calendar sync failed:', msg)
        }
      }
    }
  } catch (e) {
    console.error('google calendar syncFamily failed:', e instanceof Error ? e.message : e)
  }
}

/** Stop one Google account: delete the calendar we made there (every
 *  lesson in it goes with it) and forget the link. Only the person who
 *  connected it can. */
export async function disconnect(svc: SupabaseClient, parentId: string, authUserId: string, linkId: string): Promise<void> {
  const { data } = await svc.from('google_calendar_links').select(LINK_COLS)
    .eq('id', linkId).eq('parent_id', parentId).eq('auth_user_id', authUserId).maybeSingle()
  const link = data as GoogleLink | null
  if (!link) return
  try {
    const token = await accessToken(link.refresh_token)
    if (link.calendar_id) await api(token, 'DELETE', `/calendars/${encodeURIComponent(link.calendar_id)}`)
    // Give the permission back too, so the account no longer lists us.
    await fetch('https://oauth2.googleapis.com/revoke?token=' + encodeURIComponent(link.refresh_token), { method: 'POST' }).catch(() => {})
  } catch (e) {
    if (!(e instanceof Revoked)) console.warn('google calendar disconnect: could not delete the calendar', e instanceof Error ? e.message : '')
  }
  await svc.from('google_calendar_links').delete().eq('id', link.id)
}
