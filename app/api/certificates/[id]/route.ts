import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser, serviceClient, familyOf } from '@/lib/api-auth'
import { readCertificate, certificateHtml, PRINT_JS_HASH } from '@/lib/certificates'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/* A swimmer's level-up certificate (lib/certificates.ts). The family of the
   swimmer, or the desk. Signed out (from the email): sign in and come back. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await getAuthUser()
  if (!user) {
    const url = new URL('/login', req.url)
    url.searchParams.set('next', `/api/certificates/${encodeURIComponent(id)}`)
    return NextResponse.redirect(url)
  }
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const svc = serviceClient()
  const c = await readCertificate(svc, id)
  if (!c) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const [{ data: parent }, { data: admin }] = await Promise.all([
    familyOf(svc, user.id, 'id, preferred_language'),
    svc.from('admins').select('id').eq('auth_user_id', user.id).maybeSingle(),
  ])
  if (!admin && parent?.id !== c.parentId) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  let lang = parent?.preferred_language
  if (admin && !lang) {
    const { data: fam } = await svc.from('parents').select('preferred_language').eq('id', c.parentId).maybeSingle()
    lang = fam?.preferred_language
  }
  return new NextResponse(certificateHtml(c, lang), {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'private, no-store',
      'Content-Security-Policy': `default-src 'none'; style-src 'unsafe-inline'; img-src 'self' data:; script-src 'sha256-${PRINT_JS_HASH}'`,
    },
  })
}
