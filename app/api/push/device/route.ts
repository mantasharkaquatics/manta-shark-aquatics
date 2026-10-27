import { NextRequest, NextResponse } from 'next/server'
import { requireParent, serviceClient } from '@/lib/api-auth'
import { readJson, badRequest } from '@/lib/http'
import { isLocale } from '@/lib/i18n'

/* The phone app's push token (owner, 2026-10-27; lib/push.ts).

   POST   { token, platform, permission, lang } -- called by the app every time
          it opens signed in (components/AppBridge.tsx). The token moves to
          whoever is signed in on that phone now, and last_seen_at says the
          family still uses the app.
   DELETE { token } -- the phone signed out. No sign-in needed: by then the
          session is gone, and only the phone itself knows its token. */

export const runtime = 'nodejs'

const validToken = (t: unknown): t is string => typeof t === 'string' && t.length >= 20 && t.length <= 4096

export async function POST(req: NextRequest) {
  const auth = await requireParent({ viewer: true })
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await readJson(req)
  if (!body) return badRequest()
  const { token, platform, permission, lang } = body
  if (!validToken(token) || (platform !== 'ios' && platform !== 'android')) return badRequest()

  const { error } = await auth.svc.from('push_devices').upsert({
    token,
    platform,
    auth_user_id: auth.user.id,
    parent_id: auth.parent.id,
    lang: isLocale(lang) ? lang : 'en',
    permission: permission !== false,
    last_seen_at: new Date().toISOString(),
  }, { onConflict: 'token' })
  if (error) {
    console.error('push device not saved:', error.message)
    return NextResponse.json({ error: 'Not saved' }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const body = await readJson(req)
  if (!body || !validToken(body.token)) return badRequest()
  await serviceClient().from('push_devices').delete().eq('token', body.token)
  return NextResponse.json({ ok: true })
}
