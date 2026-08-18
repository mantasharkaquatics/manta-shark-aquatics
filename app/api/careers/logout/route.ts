import { NextResponse } from 'next/server'
import { revokeSession } from '@/lib/applicant-auth'

export const runtime = 'nodejs'

export async function POST() {
  await revokeSession()
  return NextResponse.json({ ok: true })
}
