import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'
import { allCertificates, isPromotion } from '@/lib/certificates'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** GET -> { certificates, needsSql }: every level-up certificate, newest first. */
export async function GET() {
  const auth = await requireAdmin()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { rows, needsSql } = await allCertificates(auth.svc)
  return NextResponse.json({ certificates: rows, needsSql }, { headers: { 'Cache-Control': 'no-store' } })
}

/** POST { id, given: boolean } -> marks a certificate handed to the swimmer, or not. */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json().catch(() => ({}))
  const id = typeof body?.id === 'string' ? body.id : ''
  if (!/^[0-9a-f-]{36}$/i.test(id) || typeof body?.given !== 'boolean') return NextResponse.json({ error: 'Bad request' }, { status: 400 })
  const { data: u } = await auth.svc.from('level_upgrades').select('id, from_level, to_level').eq('id', id).maybeSingle()
  if (!u || !isPromotion(u)) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const { error } = await auth.svc.from('level_upgrades').update(body.given
    ? { certificate_given_at: new Date().toISOString(), certificate_given_by: auth.admin.id }
    : { certificate_given_at: null, certificate_given_by: null }).eq('id', id)
  if (error) return NextResponse.json({ error: 'Save failed' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
