// Server half of Zelle-as-cash (see lib/zelle.ts for the why).
//
//  - The Gmail connection: the owner signs in once with Google and grants
//    READ-ONLY access to the company mailbox (gmail.readonly). The refresh
//    token is kept in zelle_gmail, which only the service role can read.
//  - syncZelle(): reads BofA's "<name> sent you $x" emails received since the
//    connection and records each once in zelle_receipts. Run every 5 minutes by
//    cron-job.org (/api/cron/zelle-sync) and on demand from POS and the Zelle
//    page.
//  - withZelle(): what the four POS sale routes wrap themselves in, so a sale
//    paid by Zelle takes its amount from one receipt -- and gives it back when
//    the sale ends up writing nothing.
//
// Plain fetch against Google's REST endpoints; no Google SDK.

import { NextResponse } from 'next/server'
import { BOFA_FROM_DOMAIN, ZELLE_EMAIL, htmlToText, isVerifiedBofa, parseZelleMemo, parseZelleSubject } from '@/lib/zelle'

type Svc = any

export const GMAIL_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly'

export function googleConfigured(): boolean {
  return !!(process.env.GOOGLE_OAUTH_CLIENT_ID && process.env.GOOGLE_OAUTH_CLIENT_SECRET)
}

/** Back to the same site the owner started from (www.mantasharkaquatics.net
 *  or the vercel.app address): the sign-in and the state cookie live on that
 *  host, so a return to the other one would find neither. Each host used has
 *  to be listed as a redirect URI on the Google OAuth client. */
export function gmailRedirectUri(origin: string): string {
  return `${origin.replace(/\/$/, '')}/api/admin/zelle/gmail/callback`
}

/** Google's consent page. login_hint picks the company mailbox for the owner;
 *  the callback refuses any other address anyway. prompt=consent makes Google
 *  hand back a refresh token every time, including on a reconnect. */
export function gmailAuthUrl(state: string, origin: string): string {
  const p = new URLSearchParams({
    client_id: process.env.GOOGLE_OAUTH_CLIENT_ID || '',
    redirect_uri: gmailRedirectUri(origin),
    response_type: 'code',
    scope: GMAIL_SCOPE,
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'false',
    login_hint: ZELLE_EMAIL,
    state,
  })
  return `https://accounts.google.com/o/oauth2/v2/auth?${p.toString()}`
}

async function tokenRequest(body: Record<string, string>) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_OAUTH_CLIENT_ID || '',
      client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET || '',
      ...body,
    }).toString(),
    cache: 'no-store',
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = new Error(`google token: ${data.error || res.status}${data.error_description ? ' - ' + data.error_description : ''}`) as Error & { code?: string }
    err.code = data.error
    throw err
  }
  return data as { access_token: string; refresh_token?: string; scope?: string; expires_in: number }
}

export function exchangeCode(code: string, origin: string) {
  return tokenRequest({ code, grant_type: 'authorization_code', redirect_uri: gmailRedirectUri(origin) })
}

async function accessTokenFrom(refreshToken: string): Promise<string> {
  const t = await tokenRequest({ refresh_token: refreshToken, grant_type: 'refresh_token' })
  return t.access_token
}

export async function gmail(path: string, accessToken: string) {
  const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(`gmail ${path.split('?')[0]}: ${res.status} ${data?.error?.message || ''}`.trim())
  return data
}

// --- Reading BofA's emails -----------------------------------------------------

type Part = { mimeType?: string; body?: { data?: string }; parts?: Part[]; headers?: { name: string; value: string }[] }

function b64url(s: string): string {
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')
}

/** The plain-text body if the email has one, otherwise its HTML as text. */
function bodyText(payload: Part): string {
  let plain = ''
  let html = ''
  const walk = (p: Part) => {
    if (p.mimeType === 'text/plain' && p.body?.data && !plain) plain = b64url(p.body.data)
    else if (p.mimeType === 'text/html' && p.body?.data && !html) html = b64url(p.body.data)
    for (const c of p.parts || []) walk(c)
  }
  walk(payload)
  // BofA's plain part, when there is one, can be a one-line "view in browser";
  // prefer the HTML when it holds the headline the memo is read against.
  if (html && !/sent you\s+\$/i.test(plain)) return htmlToText(html)
  return plain || htmlToText(html)
}

export type SyncResult = {
  connected: boolean
  added: number
  seen: number
  error?: string
}

/**
 * Records every BofA "sent you $x" email received since the mailbox was
 * connected. Safe to run at any time and as often as wanted: each email is
 * recorded once (gmail_message_id is unique), and one already recorded is not
 * even fetched again.
 */
export async function syncZelle(svc: Svc): Promise<SyncResult> {
  const { data: conn } = await svc.from('zelle_gmail').select('*').eq('id', 1).maybeSingle()
  if (!conn) return { connected: false, added: 0, seen: 0 }
  const finish = async (error: string | null) => {
    await svc.from('zelle_gmail').update({ last_sync_at: new Date().toISOString(), last_error: error }).eq('id', 1)
  }
  if (!googleConfigured()) {
    await finish('GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET are not set')
    return { connected: true, added: 0, seen: 0, error: 'not_configured' }
  }

  let token: string
  try {
    token = await accessTokenFrom(conn.refresh_token)
  } catch (e: any) {
    // invalid_grant: the access was removed in the Google account, or the
    // password changed. Only connecting again fixes it.
    const msg = e?.code === 'invalid_grant' ? 'Gmail access was revoked. Connect Gmail again.' : String(e?.message || e)
    await finish(msg)
    return { connected: true, added: 0, seen: 0, error: e?.code === 'invalid_grant' ? 'revoked' : 'token' }
  }

  try {
    // A minute of slack before the connection, so a payment that arrived
    // while the owner was on Google's consent page is not missed.
    const since = Math.floor(Date.parse(conn.sync_since) / 1000) - 60
    const q = `from:${BOFA_FROM_DOMAIN} subject:"sent you" after:${since}`
    const ids: string[] = []
    let pageToken = ''
    for (let page = 0; page < 5; page++) {
      const list = await gmail(`messages?maxResults=100&q=${encodeURIComponent(q)}${pageToken ? `&pageToken=${pageToken}` : ''}`, token)
      for (const m of list.messages || []) ids.push(m.id)
      if (!list.nextPageToken) break
      pageToken = list.nextPageToken
    }
    if (ids.length === 0) { await finish(null); return { connected: true, added: 0, seen: 0 } }

    const known = new Set<string>()
    for (let i = 0; i < ids.length; i += 200) {
      const { data } = await svc.from('zelle_receipts').select('gmail_message_id').in('gmail_message_id', ids.slice(i, i + 200))
      for (const r of data || []) known.add(r.gmail_message_id)
    }

    let added = 0
    for (const id of ids) {
      if (known.has(id)) continue
      const msg = await gmail(`messages/${id}?format=full`, token)
      const headers: { name: string; value: string }[] = msg.payload?.headers || []
      const h = (n: string) => headers.find(x => x.name.toLowerCase() === n)?.value || ''
      const subject = h('subject')
      const parsed = parseZelleSubject(subject)
      // Another kind of BofA alert that happens to say "sent you": skip it.
      if (!parsed) continue
      const text = bodyText(msg.payload || {})
      const row = {
        gmail_message_id: id,
        payer_name: parsed.payerName.slice(0, 200),
        amount_cents: parsed.amountCents,
        memo: parseZelleMemo(text),
        body_excerpt: text.slice(0, 1500),
        subject: subject.slice(0, 300),
        received_at: new Date(Number(msg.internalDate) || Date.now()).toISOString(),
        verified: isVerifiedBofa(headers, h('from')),
      }
      const { error } = await svc.from('zelle_receipts').upsert(row, { onConflict: 'gmail_message_id', ignoreDuplicates: true })
      if (error) throw new Error(`save receipt: ${error.message}`)
      added++
      if (!row.verified) console.error(`⚠️ Zelle email ${id} did not pass the BofA check; recorded as unverified`)
    }
    await finish(null)
    return { connected: true, added, seen: ids.length }
  } catch (e: any) {
    const msg = String(e?.message || e).slice(0, 500)
    console.error('zelle sync failed:', msg)
    await finish(msg)
    return { connected: true, added: 0, seen: 0, error: 'sync' }
  }
}

// --- Spending a receipt in POS -------------------------------------------------

export type ZelleSaleKind = 'points' | 'trial' | 'team' | 'sdp'

/** What a POS sale route sees. All of it is a no-op when the sale is not paid
 *  by Zelle, so a route calls it on every path without asking. */
export type ZelleCtx = {
  /** True when this sale is paid by Zelle. */
  active: boolean
  /** Takes `cents` from the chosen receipt. Call it after the sale's checks
   *  and before the first write; a returned response is the refusal to send. */
  claim: (svc: Svc, cents: number, parentId: string, adminId: string) => Promise<NextResponse | null>
  /** The sale has written something (a purchase, a membership): from here
   *  the receipt stays spent even if a later step fails. */
  wrote: (ids?: { purchaseId?: string; invoiceId?: string; teamMembershipId?: string }) => void
  /** A write was undone again: back to "nothing written". */
  unwrote: () => void
}

const REFUSALS: Record<string, { status: number; code: string; error: string }> = {
  ZELLE_NOT_FOUND: { status: 404, code: 'zelle_not_found', error: 'That Zelle payment was not found. Pick it again from the list.' },
  ZELLE_UNVERIFIED: { status: 409, code: 'zelle_unverified', error: 'That Zelle email could not be confirmed as coming from Bank of America, so it cannot be used. Check the bank account.' },
  ZELLE_DISMISSED: { status: 409, code: 'zelle_dismissed', error: 'That Zelle payment was marked "not a sale". Undo that on the Zelle page first.' },
  ZELLE_NOT_ENOUGH: { status: 409, code: 'zelle_not_enough', error: 'That Zelle payment does not have enough left for this sale.' },
}

/**
 * Wraps a POS sale route. When the sale is paid by Zelle, the receipt the desk
 * picked is checked and part of it taken (zelle_allocate, which locks the
 * receipt, so two desks can never spend more than the bank received). If the
 * sale then ends without writing anything -- a refusal, or a failure the route
 * reports as safe to send again -- that part is given back.
 */
export async function withZelle(
  body: { paymentMethod?: unknown; paymentIntentId?: unknown; zelleReceiptId?: unknown },
  kind: ZelleSaleKind,
  run: (z: ZelleCtx) => Promise<NextResponse>,
): Promise<NextResponse> {
  const active = body?.paymentMethod === 'zelle'
  if (active && body.paymentIntentId)
    return NextResponse.json({ error: 'A Zelle sale has no card payment.' }, { status: 400 })
  if (active && !(typeof body.zelleReceiptId === 'string' && /^[0-9a-f-]{36}$/i.test(body.zelleReceiptId)))
    return NextResponse.json({ error: 'Pick the Zelle payment this sale is paid with.', code: 'zelle_missing' }, { status: 400 })

  let svcUsed: Svc = null
  let allocationId: string | null = null
  let written = false
  const ids: Record<string, string> = {}

  const z: ZelleCtx = {
    active,
    claim: async (svc, cents, parentId, adminId) => {
      if (!active) return null
      if (allocationId) return null
      const { data, error } = await svc.rpc('zelle_allocate', {
        p_receipt: body.zelleReceiptId, p_cents: cents, p_kind: kind, p_parent: parentId, p_admin: adminId,
      })
      if (error) {
        const msg = String(error.message || '')
        const key = Object.keys(REFUSALS).find(k => msg.includes(k))
        if (key) {
          const r = REFUSALS[key]
          const left = key === 'ZELLE_NOT_ENOUGH' ? Number(msg.split('ZELLE_NOT_ENOUGH:')[1]) : NaN
          return NextResponse.json({
            error: r.error, code: r.code,
            ...(Number.isFinite(left) ? { reason: `$${(left / 100).toFixed(2)}` } : {}),
          }, { status: r.status })
        }
        console.error('zelle_allocate failed:', msg)
        return NextResponse.json({ error: 'The Zelle payment could not be used. Nothing was recorded.', code: 'zelle_failed' }, { status: 500 })
      }
      svcUsed = svc
      allocationId = String(data)
      return null
    },
    wrote: (more) => {
      written = true
      if (more?.purchaseId) ids.purchase_id = more.purchaseId
      if (more?.invoiceId) ids.invoice_id = more.invoiceId
      if (more?.teamMembershipId) ids.team_membership_id = more.teamMembershipId
    },
    unwrote: () => { written = false },
  }

  let res: NextResponse
  try {
    res = await run(z)
  } catch (e) {
    // A throw in the route is a 500 it did not plan for. If nothing was
    // written the receipt goes back; otherwise it stays spent, as the money is.
    if (allocationId && !written) await svcUsed.from('zelle_allocations').delete().eq('id', allocationId)
    throw e
  }
  if (allocationId) {
    if (!written) {
      const { error } = await svcUsed.from('zelle_allocations').delete().eq('id', allocationId)
      if (error) console.error(`⚠️ Zelle allocation ${allocationId} could not be given back after a sale that wrote nothing:`, error.message)
    } else if (Object.keys(ids).length) {
      const { error } = await svcUsed.from('zelle_allocations').update(ids).eq('id', allocationId)
      if (error) console.error(`Zelle allocation ${allocationId} not linked to its sale:`, error.message)
    }
  }
  return res
}
