import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'
import { readLevelHistory } from '@/lib/admin/level-history'

/** Level / stage changes, newest first: the whole school, or one swimmer
 *  (?student_id=), older than ?before= (an upgraded_at) for "load more". */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const sp = req.nextUrl.searchParams
  const studentId = sp.get('student_id')
  const before = sp.get('before')
  if (before && isNaN(Date.parse(before))) return NextResponse.json({ error: 'Bad cursor', code: 'bad_cursor' }, { status: 400 })
  const { rows, more, error } = await readLevelHistory(auth.svc, { studentId, before })
  if (error) return NextResponse.json({ error: error.message, code: 'server' }, { status: 500 })
  return NextResponse.json({ rows, more })
}
