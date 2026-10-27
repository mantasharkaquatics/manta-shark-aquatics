/* The test environment (owner, 2026-10-26: development and production
   databases split). The live site is the Vercel production deployment;
   everything else -- a preview link, `next dev` on a laptop -- is the test
   environment and works on the manta-dev Supabase project.

   In the test environment nothing reaches a real family by accident:
     - email goes only to the addresses in DEV_EMAIL_ALLOW (comma-separated);
       everything else is skipped and logged. Unset = no email at all.
     - text messages are never sent; the text is logged instead, so a sign-up
       code can still be read from the server log.
   Callers see a normal "sent" result, so the flows behave as they will live. */

export const isLiveSite = () => process.env.VERCEL_ENV === 'production'

function allowList(): Set<string> {
  return new Set((process.env.DEV_EMAIL_ALLOW || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean))
}

/** On the live site: the addresses unchanged. Elsewhere: only the allowed
    ones; the rest are logged as skipped. */
export function testModeRecipients(to: string | string[], what: string): string[] {
  const list = (Array.isArray(to) ? to : [to]).filter(Boolean)
  if (isLiveSite()) return list
  const ok = allowList()
  const kept = list.filter(a => ok.has(a.trim().toLowerCase()))
  const skipped = list.filter(a => !kept.includes(a))
  if (skipped.length) console.log(`[test mode] email "${what}" not sent to ${skipped.join(', ')} (not in DEV_EMAIL_ALLOW)`)
  return kept
}
