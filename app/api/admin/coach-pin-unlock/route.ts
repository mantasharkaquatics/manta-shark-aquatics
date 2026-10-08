import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'

export const runtime = 'nodejs'

/* The front desk's way to lift a coach PIN lockout (owner, 2026-10-08: coaches
   have no password, so there is no email way round a lock -- the desk unlocks
   it instead).

   /api/coach/pin-login locks per CALLER (a peppered hash of the IP), not per
   coach: a wrong PIN matches nobody, so there is no account to lock. The desk
   cannot know which hash is the pool iPad's, so this clears every failed
   attempt from the last 24 hours, which is the longest window the lock looks
   at (5 per 15 minutes, 30 per day). Successful sign-ins stay: the table is
   also the record of who signed in, and from where. */
const DAY_MS = 86_400_000

export async function POST() {
  const auth = await requireAdmin()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const since = new Date(Date.now() - DAY_MS).toISOString()
  const { error, count } = await auth.svc
    .from('coach_pin_attempts')
    .delete({ count: 'exact' })
    .eq('ok', false)
    .gte('created_at', since)
  if (error) {
    console.error('coach-pin-unlock: delete failed', error)
    return NextResponse.json({ error: 'Could not unlock PIN sign-in' }, { status: 500 })
  }
  console.log(`coach-pin-unlock: admin ${auth.admin.id} cleared ${count ?? 0} failed PIN attempts`)
  return NextResponse.json({ ok: true, cleared: count ?? 0 })
}
