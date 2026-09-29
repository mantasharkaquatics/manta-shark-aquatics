import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'
import { readJson, badRequest } from '@/lib/http'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/**
 * Adds a swimmer to a family from the back office.
 *
 * Owner's rule (2026-09-29): the three-swimmer limit is for what a parent adds
 * themselves; staff have none. The database enforces the parent limit only for
 * signed-in parent sessions, so this service-role insert is not counted
 * against it. The swimmer starts with no level: the assessment places them.
 */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await readJson(req)
  if (!body) return badRequest()
  const parentId = String(body.parent_id || '')
  const fullName = String(body.full_name || '').trim()
  const dob = body.date_of_birth ? String(body.date_of_birth) : null
  if (!parentId || !fullName) return NextResponse.json({ error: 'Name is required' }, { status: 400 })
  if (fullName.length > 80) return NextResponse.json({ error: 'That name is too long' }, { status: 400 })
  if (dob) {
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' })
    if (!DATE_RE.test(dob) || dob > today) return NextResponse.json({ error: 'Birthday must be a real date, not in the future' }, { status: 400 })
  }

  const svc = auth.svc
  const { data: parent } = await svc.from('parents').select('id').eq('id', parentId).maybeSingle()
  if (!parent) return NextResponse.json({ error: 'Family not found' }, { status: 404 })

  // Placed after the family's other swimmers, active or not.
  const { data: last } = await svc
    .from('students').select('sort_order').eq('parent_id', parentId)
    .order('sort_order', { ascending: false }).limit(1).maybeSingle()
  const sortOrder = (Number(last?.sort_order) || 0) + 1

  const { data: student, error } = await svc.from('students').insert({
    parent_id: parentId,
    full_name: fullName,
    date_of_birth: dob,
    current_level: null,
    is_active: true,
    added_by_parent: false,
    sort_order: sortOrder,
  }).select('id, full_name, current_level, is_active, date_of_birth, created_at, added_by_parent, legal_full_name, uci_number, service_code').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ student })
}
