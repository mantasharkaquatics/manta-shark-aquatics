import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'
import { readLevelHistory } from '@/lib/admin/level-history'

/** Level / stage changes, newest first: the whole school, or one swimmer
 *  (?student_id=), after the row ?before= (its upgraded_at) &before_id= (its
 *  id) for "load more". */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const sp = req.nextUrl.searchParams
  const studentId = sp.get('student_id')
  const before = sp.get('before')
  const beforeId = sp.get('before_id')
  // Both go into a PostgREST or() filter, so only the characters a timestamp
  // and an id can hold.
  if (before && (isNaN(Date.parse(before)) || !/^[0-9TZ:.+ -]+$/.test(before))) return NextResponse.json({ error: 'Bad cursor', code: 'bad_cursor' }, { status: 400 })
  if (beforeId && !/^[0-9A-Za-z-]+$/.test(beforeId)) return NextResponse.json({ error: 'Bad cursor', code: 'bad_cursor' }, { status: 400 })
  const { rows, more, error } = await readLevelHistory(auth.svc, { studentId, before, beforeId })
  if (error) return NextResponse.json({ error: error.message, code: 'server' }, { status: 500 })
  return NextResponse.json({ rows, more })
}
