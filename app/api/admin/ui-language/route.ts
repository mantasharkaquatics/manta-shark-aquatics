import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'
import { readJson } from '@/lib/http'

/**
 * An admin's own back-office language -- the same idea as the coach portal's
 * /api/coach/ui-language. The admin writes only their own row: the id comes
 * from the session, never from the request body.
 */
const ALLOWED = ['en', 'zh-Hant'] as const
type Allowed = (typeof ALLOWED)[number]

export async function POST(req: NextRequest) {
  const me = await requireAdmin()
  if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await readJson(req)
  const language = body?.language as string | undefined
  if (!language || !ALLOWED.includes(language as Allowed)) {
    return NextResponse.json({ error: 'Unsupported language' }, { status: 400 })
  }

  const { error } = await me.svc
    .from('admins').update({ ui_language: language }).eq('id', me.admin.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, language })
}
