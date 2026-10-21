// Zelle, treated as cash sent remotely (owner, 2026-10-21).
//
// The site never credits a family from a Zelle by itself. It reads Bank of
// America's "<name> sent you $<amount>" emails from the company mailbox
// (lib/zelle-server.ts, Gmail read-only) and records one zelle_receipts row per
// payment. The desk then sells in POS with "Zelle" as the payment method and
// has to pick one of those rows; a row can pay for several sales until its
// amount is used up (docs/migration-zelle-receipts.sql).
//
// This file is safe to import anywhere, the browser included: the address the
// family pays, and the pure parsing of a BofA email. Nothing secret.

/** The Zelle address enrolled on the company's BofA account. It is also the
 *  mailbox the BofA emails arrive in, which is the one the site reads. */
export const ZELLE_EMAIL = 'mantasharkaquatics@mantasharkaquatics.com'
/** The name a family sees in their bank app when they pay it. */
export const ZELLE_NAME = 'MANTA SHARK AQUATICS'
/** The QR code from the BofA app (Zelle > Receive), served from /public. */
export const ZELLE_QR_SRC = '/zelle-qr.png'

/** BofA's sender. Only mail from this domain, with DKIM passing for
 *  bankofamerica.com, is ever recorded as verified. */
export const BOFA_FROM_DOMAIN = 'ealerts.bankofamerica.com'

export type ParsedZelle = { payerName: string; amountCents: number }

/** "Hsiao-yung Chou sent you $1.00" -> name and cents. null when the subject is
 *  not a received-Zelle notice (BofA sends other alerts from the same address). */
export function parseZelleSubject(subject: string): ParsedZelle | null {
  const m = /^\s*(.+?)\s+sent you\s+\$\s?([\d,]+(?:\.\d{1,2})?)\s*$/i.exec(String(subject || ''))
  if (!m) return null
  const payerName = m[1].replace(/\s+/g, ' ').trim()
  const cents = Math.round(Number(m[2].replace(/,/g, '')) * 100)
  if (!payerName || !Number.isFinite(cents) || cents <= 0) return null
  return { payerName, amountCents: cents }
}

/** The memo is the line(s) between the "<name> sent you $x" headline and the
 *  "View your balance" button in the email body. A payment sent with no memo
 *  has nothing there, and that comes back as null. */
export function parseZelleMemo(bodyText: string): string | null {
  const lines = String(bodyText || '').split(/\r?\n/).map(l => l.replace(/\s+/g, ' ').trim())
  let start = -1
  for (let i = 0; i < lines.length; i++) if (/\bsent you\s+\$\s?[\d,]+/i.test(lines[i])) start = i
  if (start < 0) return null
  const out: string[] = []
  for (let i = start + 1; i < lines.length; i++) {
    const l = lines[i]
    if (!l) continue
    if (/^(view your balance|please allow up to|bank of america|zelle®? and the zelle)/i.test(l)) break
    // A link Gmail writes out as text ("View your balance <https://...>").
    if (/^<?https?:\/\//i.test(l)) break
    out.push(l)
    if (out.length >= 4) break
  }
  const memo = out.join(' ').trim()
  return memo ? memo.slice(0, 500) : null
}

/** Turns an HTML email body into lines of text, enough for parseZelleMemo. */
export function htmlToText(html: string): string {
  return String(html || '')
    .replace(/<(script|style|head)[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|td|th|h[1-6]|li|table|center)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n\n')
    .trim()
}

/**
 * Whether Google's own check says this email really came from Bank of America.
 *
 * Gmail puts its verdict in the FIRST Authentication-Results header, written by
 * mx.google.com. Anything below it came with the message and could have been
 * written by the sender, so only that first one counts. It must say DKIM passed
 * for a bankofamerica.com signature, and the From address must be BofA's
 * alerts domain.
 */
export function isVerifiedBofa(headers: { name: string; value: string }[], fromHeader: string): boolean {
  const first = headers.find(h => h.name.toLowerCase() === 'authentication-results')
  if (!first) return false
  const ar = first.value.replace(/\s+/g, ' ')
  if (!/^\s*mx\.google\.com\s*;/i.test(ar)) return false
  const dkimOk = /\bdkim=pass\b[^;]*header\.(?:i|d)=@?(?:[a-z0-9-]+\.)*bankofamerica\.com(?=[\s;)]|$)/i.test(ar)
  const addr = (/<([^>]+)>/.exec(fromHeader)?.[1] || fromHeader).trim().toLowerCase()
  const fromOk = addr.endsWith('@' + BOFA_FROM_DOMAIN)
  return dkimOk && fromOk
}
