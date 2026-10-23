import { NextRequest, NextResponse } from 'next/server'
import { requireParent } from '@/lib/api-auth'
import { readJson, badRequest } from '@/lib/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/* The family opened a swimmer's lesson records (owner, 2026-10-23): reports
   approved before now are no longer "new" (the red dot on the dashboard).
   One mark per swimmer, shared by the main account and a second guardian.
   POST { student_id } -> { ok }. Needs docs/migration-reports-seen.sql. */

export async function POST(req: NextRequest) {
  const ctx = await requireParent()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const b = await readJson(req)
  const id = typeof b?.student_id === 'string' ? b.student_id : ''
  if (!id) return badRequest()
  const { data, error } = await ctx.svc.from('students').update({ reports_seen_at: new Date().toISOString() })
    .eq('id', id).eq('parent_id', ctx.parent.id).select('id')
  if (error) return NextResponse.json({ error: 'unavailable' }, { status: 503 })
  if (!data?.length) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ ok: true })
}
