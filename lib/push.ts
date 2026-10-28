import { createSign } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { toLocale, type Locale } from '@/lib/i18n'

/* Push notifications to the phone app (owner, 2026-10-27).
   docs/migration-push.sql, lib/push-text.ts.

   Firebase Cloud Messaging delivers to both iPhone and Android (the app asks
   Firebase for its token on either). The server signs in to Firebase with the
   service account in FCM_SERVICE_ACCOUNT -- the JSON key file's contents, as
   is or base64 -- and nothing is sent while that is not set.

   Who gets a push: every phone of the family -- the main account, the second
   guardian and the view-only members -- signed in on the app, allowing
   notifications, with the switch for that kind of notice on (push_settings;
   no row = all on). A view-only member only gets lesson notices
   (viewerOk), as with email. Closures and lessons the school cancels have no
   switch ('always').

   Never throws: a push is extra, it must not fail the booking or the cron. */

/** 'news': the school's announcements, pushed only to people who turned the
 *  switch on (Apple 4.5.4: no promotional push without opting in). */
export type PushCategory = 'reports' | 'reminders' | 'bookings' | 'news' | 'always'

export type PushText = { title: string; body: string }

export type PushMessage = {
  category: PushCategory
  /** What it was about, for the 通知 history and the chat's event strips
   *  (push_log.kind): the email type, 'report', 'test'... */
  kind: string
  /** false: not kept in push_log (an announcement has its own tab). */
  log?: boolean
  /** Whether a view-only family member gets it too. */
  viewerOk: boolean
  /** The page the notification opens, a path on the site. */
  url: string
  /** The words, in the language of the phone's owner. */
  text: (lang: Locale) => PushText
}

/** A family "has the app" when the main account's phone was seen this recently. */
export const APP_ACTIVE_DAYS = 60

type ServiceAccount = { project_id: string; client_email: string; private_key: string }

function serviceAccount(): ServiceAccount | null {
  const raw = process.env.FCM_SERVICE_ACCOUNT
  if (!raw) return null
  for (const text of [raw, (() => { try { return Buffer.from(raw, 'base64').toString('utf8') } catch { return '' } })()]) {
    try {
      const j = JSON.parse(text)
      if (j?.project_id && j?.client_email && j?.private_key) return j
    } catch { /* try the next form */ }
  }
  console.warn('push: FCM_SERVICE_ACCOUNT is set but is not a service account key')
  return null
}

export const pushConfigured = () => serviceAccount() !== null

const b64url = (b: Buffer | string) => Buffer.from(b).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')

let cachedToken: { value: string; until: number } | null = null

async function accessToken(sa: ServiceAccount): Promise<string | null> {
  if (cachedToken && cachedToken.until > Date.now() + 60_000) return cachedToken.value
  const now = Math.floor(Date.now() / 1000)
  const head = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const claims = b64url(JSON.stringify({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }))
  const sig = b64url(createSign('RSA-SHA256').update(`${head}.${claims}`).sign(sa.private_key))
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${head}.${claims}.${sig}` }),
  })
  const j = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number }
  if (!res.ok || !j.access_token) {
    console.error('push: Firebase sign-in failed', res.status)
    return null
  }
  cachedToken = { value: j.access_token, until: Date.now() + (j.expires_in || 3600) * 1000 }
  return j.access_token
}

/** 'ok' delivered to Firebase; 'gone' the token no longer exists (app removed). */
async function sendOne(sa: ServiceAccount, bearer: string, token: string, text: PushText, url: string): Promise<'ok' | 'gone' | 'error'> {
  try {
    const res = await fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: {
          token,
          notification: { title: text.title, body: text.body },
          data: { url },
          android: { priority: 'HIGH', notification: { sound: 'default' } },
          apns: { payload: { aps: { sound: 'default' } } },
        },
      }),
    })
    if (res.ok) return 'ok'
    const j = (await res.json().catch(() => ({}))) as { error?: { status?: string; details?: { errorCode?: string }[] } }
    const code = j.error?.details?.find(d => d.errorCode)?.errorCode || j.error?.status
    if (res.status === 404 || code === 'UNREGISTERED') return 'gone'
    console.warn('push: Firebase refused a message', res.status, code)
    return 'error'
  } catch (e) {
    console.warn('push: Firebase not reached', e instanceof Error ? e.message : '')
    return 'error'
  }
}

type Member = { userId: string; role: 'main' | 'full' | 'viewer' }

/** The people of a family who can sign in: the main account and live guardians. */
async function familyMembers(svc: SupabaseClient, parentId: string): Promise<Member[]> {
  const out: Member[] = []
  const { data: p } = await svc.from('parents').select('auth_user_id').eq('id', parentId).maybeSingle()
  const main = (p as { auth_user_id?: string | null } | null)?.auth_user_id
  if (main) out.push({ userId: main, role: 'main' })
  const live = (cols: string) => svc.from('parent_guardians').select(cols)
    .eq('parent_id', parentId).is('removed_at', null).not('auth_user_id', 'is', null)
  let { data: g, error } = await live('auth_user_id, role')
  if (error) ({ data: g, error } = await live('auth_user_id'))
  for (const r of (error ? [] : (g || [])) as unknown as { auth_user_id: string; role?: string }[]) {
    out.push({ userId: r.auth_user_id, role: r.role === 'viewer' ? 'viewer' : 'full' })
  }
  return out
}

/** Which of these people turned this kind of notice off. School news is the
 *  other way round: off unless the person turned it on (no row = off). */
async function switchedOff(svc: SupabaseClient, userIds: string[], category: PushCategory): Promise<Set<string>> {
  if (category === 'always' || userIds.length === 0) return new Set()
  const { data, error } = await svc.from('push_settings').select('*').in('auth_user_id', userIds)
  const rows = (error ? [] : (data || [])) as Record<string, unknown>[]
  if (category === 'news') {
    const on = new Set(rows.filter(r => r.news === true).map(r => r.auth_user_id as string))
    return new Set(userIds.filter(u => !on.has(u)))
  }
  return new Set(rows.filter(r => r[category] === false).map(r => r.auth_user_id as string))
}

/* The 通知 tab and the chat's event strips (owner, 2026-10-28): what the
   school told each person, in the language of their phone, kept 90 days
   (the cleanup cron). One row per person with the app, whether or not the
   push itself was switched off or delivered -- a notice muted on the lock
   screen is still something they may look up. docs/migration-app-inbox.sql;
   before it runs, nothing is kept and nothing fails. */
export async function logFamily(svc: SupabaseClient, parentId: string, msg: Pick<PushMessage, 'kind' | 'url' | 'text' | 'viewerOk'>, people?: { userId: string; role: Member['role'] }[]): Promise<void> {
  try {
    const members = people ?? await familyMembers(svc, parentId)
    if (!members.length) return
    const { data: devs } = await svc.from('push_devices').select('auth_user_id, lang, last_seen_at')
      .eq('parent_id', parentId).order('last_seen_at', { ascending: false })
    const langOf = new Map<string, string>()
    for (const d of (devs || []) as { auth_user_id: string; lang: string }[]) if (!langOf.has(d.auth_user_id)) langOf.set(d.auth_user_id, d.lang)
    const rows = members
      .filter(m => langOf.has(m.userId) && (m.role !== 'viewer' || msg.viewerOk))
      .map(m => {
        const tx = msg.text(toLocale(langOf.get(m.userId)))
        return { parent_id: parentId, auth_user_id: m.userId, kind: msg.kind, title: tx.title.slice(0, 200), body: tx.body.slice(0, 1000), url: msg.url }
      })
      .filter(r => r.title)
    if (!rows.length) return
    const { error } = await svc.from('push_log').insert(rows)
    if (error && error.code !== '42P01' && error.code !== 'PGRST205') console.warn('push: log failed', error.message)
  } catch (e) {
    console.warn('push: log failed', e instanceof Error ? e.message : '')
  }
}

/**
 * Push one notice to every phone of a family. Returns how many phones
 * Firebase accepted it for.
 */
export async function pushFamily(svc: SupabaseClient, parentId: string, msg: PushMessage): Promise<number> {
  try {
    if (!parentId) return 0
    const members = await familyMembers(svc, parentId)
    if (msg.log !== false) await logFamily(svc, parentId, msg, members)
    const sa = serviceAccount()
    if (!sa) return 0
    const roleOf = new Map(members.map(m => [m.userId, m.role]))
    const { data: devs, error } = await svc.from('push_devices')
      .select('token, auth_user_id, lang').eq('parent_id', parentId).eq('permission', true)
    if (error || !devs?.length) return 0
    const off = await switchedOff(svc, members.map(m => m.userId), msg.category)
    const targets = (devs as { token: string; auth_user_id: string; lang: string }[]).filter(d => {
      const role = roleOf.get(d.auth_user_id)
      // A phone left signed in as someone who is no longer in the family.
      if (!role) return false
      if (role === 'viewer' && !msg.viewerOk) return false
      return !off.has(d.auth_user_id)
    })
    if (!targets.length) return 0
    const bearer = await accessToken(sa)
    if (!bearer) return 0
    let sent = 0
    const gone: string[] = []
    await Promise.all(targets.map(async d => {
      const r = await sendOne(sa, bearer, d.token, msg.text(toLocale(d.lang)), msg.url)
      if (r === 'ok') sent++
      else if (r === 'gone') gone.push(d.token)
    }))
    if (gone.length) await svc.from('push_devices').delete().in('token', gone)
    return sent
  } catch (e) {
    console.warn('push: family push failed', parentId, e instanceof Error ? e.message : '')
    return 0
  }
}

/**
 * Whether this family gets a push instead of a text message: the main
 * account (the phone number texts go to) has a phone with the app, allowing
 * notifications, opened within APP_ACTIVE_DAYS, and has not switched this
 * kind of notice off. Otherwise the text goes out as before.
 */
export async function familyUsesApp(svc: SupabaseClient, parentId: string, category: PushCategory): Promise<boolean> {
  try {
    if (!pushConfigured() || !parentId) return false
    const { data: p } = await svc.from('parents').select('auth_user_id').eq('id', parentId).maybeSingle()
    const main = (p as { auth_user_id?: string | null } | null)?.auth_user_id
    if (!main) return false
    const since = new Date(Date.now() - APP_ACTIVE_DAYS * 86400000).toISOString()
    const { data: devs, error } = await svc.from('push_devices').select('token')
      .eq('parent_id', parentId).eq('auth_user_id', main).eq('permission', true).gte('last_seen_at', since).limit(1)
    if (error || !devs?.length) return false
    return !(await switchedOff(svc, [main], category)).has(main)
  } catch {
    return false
  }
}
