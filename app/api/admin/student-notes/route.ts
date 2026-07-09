import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'

// GET ?counts=1(全學生計數)或 ?student_id=(單一學生備註列表)
export async function GET(req: NextRequest) {
  const auth = await requireAdmin()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const svc = auth.svc
  const url = new URL(req.url)

  if (url.searchParams.get('counts') === '1') {
    const { data } = await svc.from('student_notes').select('student_id')
    const counts: Record<string, number> = {}
    for (const r of (data || []) as any[]) counts[r.student_id] = (counts[r.student_id] || 0) + 1
    return NextResponse.json({ counts })
  }

  const studentId = url.searchParams.get('student_id')
  if (!studentId) return NextResponse.json({ error: 'Missing student_id' }, { status: 400 })

  const { data: notes } = await svc
    .from('student_notes')
    .select('id, student_id, content, pinned, created_at, updated_at, created_by')
    .eq('student_id', studentId)
    .order('pinned', { ascending: false })
    .order('created_at', { ascending: false })

  // 兩步查詢:補作者名
  const adminIds = [...new Set((notes || []).map((n: any) => n.created_by).filter(Boolean))]
  const names: Record<string, string> = {}
  if (adminIds.length) {
    const { data: admins } = await svc.from('admins').select('id, first_name').in('id', adminIds)
    for (const a of (admins || []) as any[]) names[a.id] = a.first_name
  }
  return NextResponse.json({
    notes: (notes || []).map((n: any) => ({ ...n, author: names[n.created_by] || 'Admin' })),
  })
}

// POST { student_id, content }
export async function POST(req: NextRequest) {
  const auth = await requireAdmin()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const svc = auth.svc
  const body = await req.json().catch(() => null)
  const student_id = body?.student_id
  const content = String(body?.content || '').trim()
  if (!student_id || !content) return NextResponse.json({ error: 'Missing student or content' }, { status: 400 })
  if (content.length > 2000) return NextResponse.json({ error: 'Note too long (max 2000 chars)' }, { status: 400 })

  const { data: student } = await svc.from('students').select('id').eq('id', student_id).single()
  if (!student) return NextResponse.json({ error: 'Student not found' }, { status: 404 })

  const { data, error } = await svc
    .from('student_notes')
    .insert({ student_id, content, created_by: auth.admin.id })
    .select('id')
    .single()
  if (error) return NextResponse.json({ error: 'Failed to add note' }, { status: 500 })
  return NextResponse.json({ ok: true, id: data.id })
}

// PATCH { id, content? } 或 { id, pinned? }
export async function PATCH(req: NextRequest) {
  const auth = await requireAdmin()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const svc = auth.svc
  const body = await req.json().catch(() => null)
  const id = body?.id
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const patch: Record<string, unknown> = {}
  if (typeof body?.pinned === 'boolean') patch.pinned = body.pinned
  if (body?.content !== undefined) {
    const content = String(body.content).trim()
    if (!content) return NextResponse.json({ error: 'Content cannot be empty' }, { status: 400 })
    if (content.length > 2000) return NextResponse.json({ error: 'Note too long (max 2000 chars)' }, { status: 400 })
    patch.content = content
    patch.updated_at = new Date().toISOString()
  }
  if (!Object.keys(patch).length) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })

  const { error } = await svc.from('student_notes').update(patch).eq('id', id)
  if (error) return NextResponse.json({ error: 'Failed to update note' }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// DELETE { id }
export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const svc = auth.svc
  const body = await req.json().catch(() => null)
  const id = body?.id
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })
  const { error } = await svc.from('student_notes').delete().eq('id', id)
  if (error) return NextResponse.json({ error: 'Failed to delete note' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
