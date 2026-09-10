import { NextRequest, NextResponse } from 'next/server'
import { requireCoach } from '@/lib/api-auth'
import { readJson } from '@/lib/http'

/**
 * A coach's own portal language. Separate from default_note_language, which is
 * the language a lesson note is spoken in for a family -- a coach may record in
 * Chinese for a Chinese household and still want an English portal.
 *
 * The coach writes only their own row: the id comes from the session, never
 * from the request body.
 */
const ALLOWED = ['en', 'zh-Hant'] as const
type Allowed = (typeof ALLOWED)[number]

export async function POST(req: NextRequest) {
  const me = await requireCoach()
  if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await readJson(req)
  const language = body?.language as string | undefined
  if (!language || !ALLOWED.includes(language as Allowed)) {
    return NextResponse.json({ error: 'Unsupported language' }, { status: 400 })
  }

  const { error } = await me.svc
    .from('coaches').update({ ui_language: language }).eq('id', me.coach.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, language })
}
