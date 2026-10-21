import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { requireAdmin } from '@/lib/api-auth'
import { adminRole } from '@/lib/staff-accounts'
import { gmailAuthUrl, googleConfigured } from '@/lib/zelle-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const STATE_COOKIE = 'zelle_gmail_state'

/** "Connect Gmail" on the Zelle page. Owner only: it grants the site read
 *  access to the company mailbox. Sends the owner to Google's consent page;
 *  Google sends them back to ./callback. */
export async function GET(req: NextRequest) {
  const origin = req.nextUrl.origin
  const auth = await requireAdmin()
  if (!auth) return NextResponse.redirect(new URL('/login', origin))
  const back = (code: string) => NextResponse.redirect(new URL(`/admin/zelle?gmail=${code}`, origin))
  if ((await adminRole(auth.svc, auth.admin.id)) !== 'super_admin') return back('not_owner')
  if (!googleConfigured()) return back('not_configured')

  const state = randomBytes(24).toString('hex')
  const res = NextResponse.redirect(gmailAuthUrl(state, origin))
  res.cookies.set(STATE_COOKIE, state, {
    httpOnly: true, secure: true, sameSite: 'lax', path: '/api/admin/zelle/gmail', maxAge: 600,
  })
  return res
}
