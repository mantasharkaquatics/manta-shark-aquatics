import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'
import { tokenExpiryFromNow } from '@/lib/tokens'

function auditLine(email: string, action: string) {
  return `[${new Date().toISOString()} ${email}] ${action}`
}

export async function GET(req: NextRequest) {
  const auth = await requireAdmin()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const parentId = req.nextUrl.searchParams.get('parent_id')
  if (!parentId) return NextResponse.json({ error: 'parent_id required' }, { status: 400 })

  const { data: packages, error } = await auth.svc
    .from('token_packages')
    .select('id, course_type_id, total_tokens, used_tokens, expires_at, source, note, created_at')
    .eq('parent_id', parentId)
    .order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { data: courseTypes } = await auth.svc
    .from('course_types')
    .select('id, name')
    .order('name')

  return NextResponse.json({ packages: packages || [], courseTypes: courseTypes || [] })
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  const { parent_id, course_type_id, total_tokens, note } = body
  if (!parent_id || !course_type_id || !Number.isInteger(total_tokens) || total_tokens < 1) {
    return NextResponse.json({ error: 'parent_id, course_type_id, and total_tokens (>= 1) required' }, { status: 400 })
  }

  const audit = auditLine(auth.user.email || 'admin', `created manual package: ${total_tokens} token(s)`)
  const { data: pkg, error } = await auth.svc
    .from('token_packages')
    .insert({
      parent_id,
      course_type_id,
      total_tokens,
      used_tokens: 0,
      expires_at: tokenExpiryFromNow(),
      source: 'manual',
      note: note ? `${note}\n${audit}` : audit,
    })
    .select('id')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, package_id: pkg.id })
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAdmin()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  const { package_id, total_tokens, note } = body
  if (!package_id || !Number.isInteger(total_tokens) || total_tokens < 0) {
    return NextResponse.json({ error: 'package_id and total_tokens (>= 0) required' }, { status: 400 })
  }

  const { data: pkg, error: fetchErr } = await auth.svc
    .from('token_packages')
    .select('id, total_tokens, used_tokens, note')
    .eq('id', package_id)
    .single()
  if (fetchErr || !pkg) return NextResponse.json({ error: 'Package not found' }, { status: 404 })
  if (total_tokens < pkg.used_tokens) {
    return NextResponse.json({ error: `Total cannot be below used (${pkg.used_tokens})` }, { status: 400 })
  }
  if (total_tokens === pkg.total_tokens) {
    return NextResponse.json({ ok: true, unchanged: true })
  }

  const audit = auditLine(
    auth.user.email || 'admin',
    `adjusted total ${pkg.total_tokens} \u2192 ${total_tokens}${note ? ` (${note})` : ''}`
  )
  const { error: updErr } = await auth.svc
    .from('token_packages')
    .update({
      total_tokens,
      note: pkg.note ? `${pkg.note}\n${audit}` : audit,
      updated_at: new Date().toISOString(),
    })
    .eq('id', package_id)
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
