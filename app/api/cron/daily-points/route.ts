import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { expireGrantedPoints } from '@/lib/points-wallet'

export const runtime = 'nodejs'

// Once a day (cron-job.org, Authorization: Bearer CRON_SECRET).
//
// Granted points last one year (lib/points GRANTED_POINTS_VALID_MONTHS). This
// takes away whatever is left of a grant whose year is up, one ledger line per
// family ("grant_expired"), so the family's statement says where the points
// went. Purchased points are never touched.
//
// Safe to run more than once a day, or to miss a day: each run expires only
// what is due at that moment and what has not already been expired.
export async function GET(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const svc = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

  const { data: wallets, error } = await svc
    .from('point_wallets')
    .select('parent_id')
    .gt('balance_granted', 0)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  let expiredFamilies = 0
  let expiredPoints = 0
  const failed: string[] = []
  for (const w of wallets || []) {
    try {
      const n = await expireGrantedPoints(svc, w.parent_id)
      if (n > 0) { expiredFamilies++; expiredPoints += n }
    } catch (e) {
      // One family's wallet must not stop everyone else's; tomorrow retries it.
      console.error(`daily-points: could not expire granted points for ${w.parent_id}:`, e)
      failed.push(w.parent_id)
    }
  }

  return NextResponse.json({ checked: (wallets || []).length, expiredFamilies, expiredPoints, failed: failed.length })
}
