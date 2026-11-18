import { NextRequest, NextResponse } from 'next/server'
import { requireParent } from '@/lib/api-auth'
import { familySwimTimes } from '@/lib/swim-times-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/* 成績 (owner, 2026-11-17; lib/swim-times.ts), for the family's own
   swimmers, view-only members too (it is learning).
   GET ?student=<id> -> { name, times: SwimTime[] } (newest first)
   GET (no student)  -> { counts: { <student id>: n } } -- who has any time,
       for the 成績 tile on 首頁 (shown only then). */
export async function GET(req: NextRequest) {
  const auth = await requireParent({ viewer: true })
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { svc, parent } = auth
  const { data: kids } = await svc.from('students').select('id, full_name').eq('parent_id', parent.id)
  const mine = (kids || []) as { id: string; full_name: string | null }[]
  const want = req.nextUrl.searchParams.get('student')
  if (want) {
    const kid = mine.find(k => k.id === want)
    if (!kid) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const times = await familySwimTimes(svc, kid.id).catch(() => [])
    return NextResponse.json({ name: String(kid.full_name || '').trim(), times })
  }
  const counts: Record<string, number> = {}
  await Promise.all(mine.map(async k => {
    const n = (await familySwimTimes(svc, k.id).catch(() => [])).length
    if (n) counts[k.id] = n
  }))
  return NextResponse.json({ counts })
}
