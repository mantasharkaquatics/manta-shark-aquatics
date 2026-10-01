import { NextRequest, NextResponse } from 'next/server'
import { requireParent } from '@/lib/api-auth'
import { readJson, badRequest } from '@/lib/http'

export const runtime = 'nodejs'

const MAX_LENGTH = 2000
const PER_DAY = 5

// The suggestion box on the dashboard (owner, 2026-09-30): optional, written
// whenever a family likes, read only by managers on /admin/suggestions. Not
// anonymous -- the manager needs to know whom to get back to -- and the form
// does not raise the question at all.
export async function POST(req: NextRequest) {
  const ctx = await requireParent()
  if (!ctx) return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
  const body = await readJson(req)
  if (!body) return badRequest()
  const text = String(body.body ?? '').trim()
  if (!text) return NextResponse.json({ error: 'EMPTY' }, { status: 400 })
  if (text.length > MAX_LENGTH) return NextResponse.json({ error: 'TOO_LONG' }, { status: 400 })

  // A handful a day is plenty; this only stops a stuck button or a script.
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const { count } = await ctx.svc.from('parent_suggestions')
    .select('id', { count: 'exact', head: true }).eq('parent_id', ctx.parent.id).gte('created_at', since)
  if ((count ?? 0) >= PER_DAY) return NextResponse.json({ error: 'TOO_MANY' }, { status: 429 })

  const { error } = await ctx.svc.from('parent_suggestions').insert({ parent_id: ctx.parent.id, body: text })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
