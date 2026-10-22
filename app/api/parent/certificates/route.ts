import { NextResponse } from 'next/server'
import { requireParent } from '@/lib/api-auth'
import { familyCertificates } from '@/lib/certificates'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** GET -> { certificates: [{ id, studentId, toLevel, date }] }, newest first. */
export async function GET() {
  const ctx = await requireParent()
  if (!ctx) return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
  return NextResponse.json({ certificates: await familyCertificates(ctx.svc, ctx.parent.id) }, { headers: { 'Cache-Control': 'no-store' } })
}
