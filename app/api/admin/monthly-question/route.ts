import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'
import { readJson, badRequest } from '@/lib/http'

export const runtime = 'nodejs'

/** A family's "I have a question" on a monthly report: mark it handled, which
 *  takes it off Reviews (lib/admin/review-queues loadMonthlyQuestions). Needs
 *  docs/migration-fix5-A.sql. */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await readJson(req)
  const id = String(body?.id || '')
  if (!id) return badRequest()
  const { data, error } = await auth.svc.from('monthly_reports')
    .update({ question_resolved_at: new Date().toISOString(), question_resolved_by: auth.admin.id })
    .eq('id', id).eq('feedback', 'down')
    .select('id')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data?.length) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ ok: true })
}
