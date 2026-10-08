import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'
import { readJson, badRequest } from '@/lib/http'
import { confirmAssessment } from '@/lib/admin/confirm-assessment'

// Two translations (the note and the recommendation line) can run back to back.
export const maxDuration = 60

/**
 * Confirms a swimmer's assessment from its Reviews card: the level, the skill
 * scores and the lesson note, in one step. The steps, their order and why are
 * in lib/admin/confirm-assessment.ts, shared with the backfill route.
 */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await readJson(req)
  if (!body) return badRequest()
  const r = await confirmAssessment(auth.svc, auth.admin.id, body)
  return NextResponse.json(r.body, { status: r.status })
}
