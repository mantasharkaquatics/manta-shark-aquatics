import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'
import { allRowsIn } from '@/lib/db-paging'

/**
 * The live bookings of each session, with student, parent and -- for a
 * 60-minute lesson -- the real span of the hour. Keyed by session id.
 *
 * One read for any number of sessions. The admin calendar used to make one
 * request per booked session on every date change, history included (found
 * 2026-10-07); it now asks once with POST { session_ids }.
 */
async function bookingsBySession(svc: any, sessionIds: string[]): Promise<{ map: Record<string, any[]>; error: any }> {
  const map: Record<string, any[]> = {}
  for (const id of sessionIds) map[id] = []
  if (sessionIds.length === 0) return { map, error: null }

  const { data: bookings, error } = await allRowsIn(sessionIds, chunk => svc
    .from('bookings')
    .select('id, status, lesson_credit_id, parent_id, student_id, is_trial, lesson_group_id, class_session_id')
    .in('class_session_id', chunk)
    .neq('status', 'cancelled')
    .order('id'))
  if (error) return { map, error }
  if (!bookings.length) return { map, error: null }

  const studentIds = [...new Set(bookings.map((b: any) => b.student_id).filter(Boolean))] as string[]
  const parentIds = [...new Set(bookings.map((b: any) => b.parent_id).filter(Boolean))] as string[]
  const [{ data: students }, { data: parents }] = await Promise.all([
    allRowsIn(studentIds, chunk => svc.from('students').select('id, full_name, current_level').in('id', chunk).order('id')),
    allRowsIn(parentIds, chunk => svc.from('parents').select('id, first_name, last_name').in('id', chunk).order('id')),
  ])
  const studentOf = new Map((students || []).map((s: any) => [s.id, s]))
  const parentOf = new Map((parents || []).map((p: any) => [p.id, p]))

  // A 60-minute lesson lives in TWO sessions linked by lesson_group_id, and the
  // admin calendar only ever knows about the one that was clicked. Hand back the
  // real span so the modal can say 10:55-11:55 instead of the half's 10:55-11:25.
  const bySession = new Map<string, any[]>()
  for (const b of bookings) bySession.set(b.class_session_id, [...(bySession.get(b.class_session_id) || []), b])
  const groupOfSession = new Map<string, string>()
  for (const [sid, rows] of bySession) {
    const g = rows.map((b: any) => b.lesson_group_id).find(Boolean)
    if (g) groupOfSession.set(sid, g)
  }
  const groupIds = [...new Set(groupOfSession.values())]
  const span = new Map<string, { start: string | null; end: string | null }>()
  if (groupIds.length) {
    const { data: sibs } = await allRowsIn(groupIds, chunk => svc
      .from('bookings').select('id, class_session_id, lesson_group_id')
      .in('lesson_group_id', chunk).neq('status', 'cancelled').order('id'))
    const sessOfGroup = new Map<string, Set<string>>()
    for (const s of sibs || []) {
      if (!s.class_session_id) continue
      if (!sessOfGroup.has(s.lesson_group_id)) sessOfGroup.set(s.lesson_group_id, new Set())
      sessOfGroup.get(s.lesson_group_id)!.add(s.class_session_id)
    }
    const allSess = [...new Set([...sessOfGroup.values()].flatMap(x => [...x]))]
    const { data: gs } = await allRowsIn(allSess, chunk => svc
      .from('class_sessions').select('id, start_time, end_time').in('id', chunk).neq('status', 'cancelled').order('id'))
    const timeOf = new Map((gs || []).map((g: any) => [g.id, g]))
    for (const [g, sids] of sessOfGroup) {
      if (sids.size < 2) continue
      let start: string | null = null, end: string | null = null
      for (const sid of sids) {
        const t: any = timeOf.get(sid)
        if (!t) continue
        if (!start || String(t.start_time) < start) start = String(t.start_time)
        if (!end || String(t.end_time) > end) end = String(t.end_time)
      }
      span.set(g, { start, end })
    }
  }

  for (const [sid, rows] of bySession) {
    const g = groupOfSession.get(sid)
    const sp = g ? span.get(g) : undefined
    map[sid] = rows.map((b: any) => {
      const { class_session_id: _sid, ...rest } = b
      return {
        ...rest,
        group_start_time: sp?.start ?? null,
        group_end_time: sp?.end ?? null,
        students: studentOf.get(b.student_id) || null,
        parents: parentOf.get(b.parent_id) || null,
      }
    })
  }
  return { map, error: null }
}

export async function GET(req: NextRequest) {
  const auth = await requireAdmin()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const session_id = req.nextUrl.searchParams.get('session_id')
  if (!session_id) return NextResponse.json({ error: 'Missing session_id' }, { status: 400 })

  const { map, error } = await bookingsBySession(auth.svc, [session_id])
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(map[session_id] || [])
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json().catch(() => null)
  const ids = Array.isArray(body?.session_ids)
    ? [...new Set((body.session_ids as unknown[]).filter((x): x is string => typeof x === 'string' && /^[0-9a-f-]{36}$/i.test(x)))]
    : null
  if (!ids) return NextResponse.json({ error: 'Missing session_ids' }, { status: 400 })

  const { map, error } = await bookingsBySession(auth.svc, ids)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ bySession: map })
}
