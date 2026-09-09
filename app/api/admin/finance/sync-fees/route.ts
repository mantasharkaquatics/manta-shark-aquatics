import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'
import { requireAdmin } from '@/lib/api-auth'
import { backfillFees } from '@/lib/stripe-fees'

export const runtime = 'nodejs'
export const maxDuration = 60

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2026-05-27.dahlia' as any })

// Fill in the Stripe fee on payments that do not have one yet.
//
// Two reasons a payment arrives without its fee. History: every purchase taken
// before fees were recorded at all. And bank debits, whose balance transaction
// does not exist until the money settles, two to four business days after the
// points were handed out -- the webhook asks and gets nothing, by design.
//
// Safe to run as often as you like: it only ever touches rows with no fee
// recorded, and asking Stripe about a payment changes nothing.
//
// Called from the Finance page, and worth putting on the same daily schedule as
// the SMS jobs so the ACH ones fill themselves in.
export async function POST(req: NextRequest) {
  const internal = req.headers.get('x-internal-key')
  const viaCron = !!process.env.CRON_SECRET && internal === process.env.CRON_SECRET

  let svc
  if (viaCron) {
    svc = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  } else {
    const auth = await requireAdmin()
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    svc = auth.svc
  }

  const limit = Math.min(500, Math.max(1, Number(req.nextUrl.searchParams.get('limit') || 100)))

  try {
    const result = await backfillFees(stripe, svc, limit)
    return NextResponse.json({
      ok: true,
      attempted: result.attempted,
      captured: result.captured,
      feesCaptured: result.feeCentsCaptured / 100,
      // Named for what it usually is. A bank debit that has not settled is the
      // ordinary reason a payment has no fee yet, not a failure to look into.
      stillPending: result.skipped.length,
      reasons: [...new Set(result.skipped.map(s => s.reason))].slice(0, 5),
    })
  } catch (e: any) {
    console.error('fee backfill failed:', e)
    return NextResponse.json({ error: e?.message || 'Backfill failed' }, { status: 500 })
  }
}
