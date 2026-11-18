import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/* Admin > 成績 (owner, 2026-11-17): the school's meets (meet_*,
   docs/migration-swim-times.sql) and who each meet swimmer is.
   GET  -> { meets: [{ id, title, meet_date, published, swimmers: [{ id, name, birthdate, gender, student_id, entries }] }],
            students: [{ id, name, dob, family }] }
   POST { link: { swimmer_id, student_id | null } } -- who this swimmer is
   POST { publish: { meet_id, published } } -- show the meet's results on
        the linked swimmers' 成績 pages, or take them off. */

export async function GET() {
  const auth = await requireAdmin()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { svc } = auth
  const [{ data: meets, error }, { data: swimmers }, { data: students }] = await Promise.all([
    svc.from('meet_meets').select('id, title, meet_date, published').order('meet_date', { ascending: false }),
    svc.from('meet_swimmers').select('id, meet_id, name, birthdate, gender, student_id').order('name'),
    svc.from('students').select('id, full_name, date_of_birth, parent_id, is_active, parents(first_name, last_name)').order('full_name'),
  ])
  if (error) return NextResponse.json({ error: error.message, missing: /published|does not exist/.test(error.message) }, { status: 500 })
  const sw = (swimmers || []) as { id: number; meet_id: number; name: string; birthdate: string | null; gender: string | null; student_id: string | null }[]
  const { data: entries } = sw.length
    ? await svc.from('meet_entries').select('swimmer_id').in('swimmer_id', sw.map(s => s.id))
    : { data: [] }
  const count = new Map<number, number>()
  for (const e of (entries || []) as { swimmer_id: number }[]) count.set(e.swimmer_id, (count.get(e.swimmer_id) || 0) + 1)
  return NextResponse.json({
    meets: ((meets || []) as { id: number; title: string; meet_date: string | null; published: boolean }[]).map(m => ({
      ...m, swimmers: sw.filter(s => s.meet_id === m.id).map(s => ({ ...s, entries: count.get(s.id) || 0 })),
    })),
    students: ((students || []) as unknown as { id: string; full_name: string | null; date_of_birth: string | null; is_active: boolean | null; parents: { first_name: string | null; last_name: string | null } | null }[])
      .filter(s => s.is_active !== false)
      .map(s => ({ id: s.id, name: String(s.full_name || '').trim(), dob: s.date_of_birth, family: [s.parents?.first_name, s.parents?.last_name].filter(Boolean).join(' ') })),
  })
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json().catch(() => null) as { link?: { swimmer_id?: unknown; student_id?: unknown }; publish?: { meet_id?: unknown; published?: unknown } } | null
  const { svc } = auth
  if (body?.link) {
    const swimmerId = Number(body.link.swimmer_id)
    const studentId = body.link.student_id === null ? null : String(body.link.student_id || '')
    if (!Number.isInteger(swimmerId) || (studentId !== null && !/^[0-9a-f-]{36}$/i.test(studentId))) {
      return NextResponse.json({ error: 'Bad request' }, { status: 400 })
    }
    if (studentId) {
      const { data: kid } = await svc.from('students').select('id').eq('id', studentId).maybeSingle()
      if (!kid) return NextResponse.json({ error: 'No such student' }, { status: 404 })
    }
    const { error } = await svc.from('meet_swimmers').update({ student_id: studentId }).eq('id', swimmerId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }
  if (body?.publish) {
    const meetId = Number(body.publish.meet_id)
    if (!Number.isInteger(meetId) || typeof body.publish.published !== 'boolean') return NextResponse.json({ error: 'Bad request' }, { status: 400 })
    const { error } = await svc.from('meet_meets').update({ published: body.publish.published }).eq('id', meetId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }
  return NextResponse.json({ error: 'Bad request' }, { status: 400 })
}
