import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'

export const runtime = 'nodejs'

const STATUSES = ['new', 'reviewing', 'interview', 'hired', 'rejected', 'archived']

export async function PATCH(req: Request) {
  const auth = await requireAdmin()
  if (!auth) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  }

  const id = typeof body.id === 'string' ? body.id : ''
  if (!id) {
    return NextResponse.json({ error: 'Missing application id.' }, { status: 400 })
  }

  const patch: Record<string, unknown> = {}

  if (typeof body.status === 'string') {
    if (!STATUSES.includes(body.status)) {
      return NextResponse.json({ error: 'Unknown status.' }, { status: 400 })
    }
    patch.status = body.status
  }

  if (typeof body.adminNotes === 'string') {
    patch.admin_notes = body.adminNotes.trim().slice(0, 4000) || null
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'Nothing to update.' }, { status: 400 })
  }

  patch.reviewed_at = new Date().toISOString()
  patch.reviewed_by = auth.admin.id

  const { error } = await auth.svc
    .from('coach_applications')
    .update(patch)
    .eq('id', id)

  if (error) {
    return NextResponse.json({ error: 'Could not save.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
