import { createHmac, timingSafeEqual } from 'crypto'
import { SITE_URL } from '@/lib/site-config'

/* One-click unsubscribe from marketing email (owner, 2026-10-14; first used by
   the birthday card). US law (CAN-SPAM) wants a way out that needs nothing
   more than visiting one page -- no login -- so each email carries a link that
   names the family and is signed, which is what stops a stranger from
   unsubscribing someone else by guessing an id.

   Unsubscribing turns parents.newsletter_subscribed off, the same switch the
   family sees on their account page. Every marketing send reads that switch. */

function secret(): string | null {
  return process.env.UNSUBSCRIBE_SECRET || process.env.CRON_SECRET || null
}

function sign(parentId: string, key: string): string {
  return createHmac('sha256', key).update('unsubscribe:' + parentId).digest('base64url').slice(0, 32)
}

/** The token for this family, or null when no secret is configured (then
 *  nothing that needs an unsubscribe link may be sent). */
export function unsubscribeToken(parentId: string): string | null {
  const key = secret()
  return key ? sign(parentId, key) : null
}

export function verifyUnsubscribeToken(parentId: string, token: string): boolean {
  const key = secret()
  if (!key || !parentId || !token) return false
  const a = Buffer.from(sign(parentId, key))
  const b = Buffer.from(token)
  return a.length === b.length && timingSafeEqual(a, b)
}

/** The page a person clicks (a confirm button, so a mail scanner that opens
 *  links cannot unsubscribe anyone by itself). */
export function unsubscribePageUrl(parentId: string, token: string): string {
  return `${SITE_URL}/unsubscribe?p=${encodeURIComponent(parentId)}&t=${encodeURIComponent(token)}`
}

/** The address mail apps call for their own "Unsubscribe" button (RFC 8058
 *  one-click: a POST with List-Unsubscribe=One-Click). */
export function unsubscribeApiUrl(parentId: string, token: string): string {
  return `${SITE_URL}/api/unsubscribe?p=${encodeURIComponent(parentId)}&t=${encodeURIComponent(token)}`
}

export function unsubscribeHeaders(parentId: string, token: string): Record<string, string> {
  return {
    'List-Unsubscribe': `<${unsubscribeApiUrl(parentId, token)}>`,
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
  }
}
