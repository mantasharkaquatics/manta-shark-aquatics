import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { lookupReferrer } from '@/lib/referrals'
import { readJson } from '@/lib/http'

export const runtime = 'nodejs'

// Register page: is this code real, and whose is it? Answers with the owner's
// first name and last initial only ("Shane C."), which is all a friend needs to
// see that they typed the right code.
export async function POST(req: NextRequest) {
  const body = await readJson(req)
  if (!body) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  const svc = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const owner = await lookupReferrer(svc, (body as any).code)
  if (!owner) return NextResponse.json({ valid: false })
  // Matched by phone: say only that it matched (see lookupReferrer).
  if (owner.byPhone) return NextResponse.json({ valid: true, byPhone: true })
  return NextResponse.json({ valid: true, referrer: owner.display })
}
