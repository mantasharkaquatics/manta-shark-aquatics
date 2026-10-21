import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'
import { adminRole } from '@/lib/staff-accounts'
import { ZELLE_EMAIL } from '@/lib/zelle'
import { GMAIL_SCOPE, exchangeCode, gmail } from '@/lib/zelle-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const STATE_COOKIE = 'zelle_gmail_state'

/** Where Google sends the owner back. Checks it is the same browser that
 *  started (state), that read access was granted, and that the mailbox is the
 *  company one -- the address BofA writes to -- then keeps the refresh token.
 *  A reconnect keeps sync_since, so emails that arrived while access was
 *  broken are still picked up. */
export async function GET(req: NextRequest) {
  const appUrl = req.nextUrl.origin
  const back = (code: string) => {
    const res = NextResponse.redirect(new URL(`/admin/zelle?gmail=${code}`, appUrl))
    res.cookies.set(STATE_COOKIE, '', { path: '/api/admin/zelle/gmail', maxAge: 0 })
    return res
  }
  const auth = await requireAdmin()
  if (!auth) return NextResponse.redirect(new URL('/login', appUrl))
  if ((await adminRole(auth.svc, auth.admin.id)) !== 'super_admin') return back('not_owner')

  const sp = req.nextUrl.searchParams
  if (sp.get('error')) return back('denied')
  const state = sp.get('state') || ''
  const expected = req.cookies.get(STATE_COOKIE)?.value || ''
  if (!state || !expected || state !== expected) return back('state')
  const code = sp.get('code')
  if (!code) return back('denied')

  try {
    const tok = await exchangeCode(code, appUrl)
    if (!tok.refresh_token) return back('no_refresh')
    if (!(tok.scope || '').split(' ').includes(GMAIL_SCOPE)) return back('scope')
    const profile = await gmail('profile', tok.access_token)
    const email = String(profile.emailAddress || '').toLowerCase()
    if (email !== ZELLE_EMAIL.toLowerCase()) return back('wrong_mailbox')

    const { data: had } = await auth.svc.from('zelle_gmail').select('id').eq('id', 1).maybeSingle()
    const row = {
      email, refresh_token: tok.refresh_token,
      connected_at: new Date().toISOString(), connected_by: auth.admin.id, last_error: null,
    }
    const { error } = had
      ? await auth.svc.from('zelle_gmail').update(row).eq('id', 1)
      : await auth.svc.from('zelle_gmail').insert({ id: 1, ...row, sync_since: new Date().toISOString() })
    if (error) {
      console.error('zelle gmail: could not save the connection:', error.message)
      return back('save')
    }
    return back('connected')
  } catch (e: any) {
    console.error('zelle gmail callback failed:', e?.message || e)
    return back('failed')
  }
}
