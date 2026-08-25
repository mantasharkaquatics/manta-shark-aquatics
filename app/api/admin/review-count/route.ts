import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'
import { countReviewQueues } from '@/lib/admin/review-queues'

export const dynamic = 'force-dynamic'

// The sidebar badge. Counting the queues means reading every confirmed booking
// and differencing it against recorded progress — about a second of work. The
// sidebar renders on every admin page, so this is deliberately NOT computed
// during the render: the nav paints immediately and asks for the number
// afterwards, and the answer is held for a minute so a burst of page views
// costs one query rather than one each.
//
// The cache is per warm instance, which is the right trade for a badge: worst
// case a number is up to a minute stale, and it self-corrects.
const TTL_MS = 60_000
let cached: { at: number; body: unknown } | null = null

export async function GET() {
  const auth = await requireAdmin()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (cached && Date.now() - cached.at < TTL_MS) {
    return NextResponse.json(cached.body)
  }

  try {
    const counts = await countReviewQueues(auth.svc)
    cached = { at: Date.now(), body: counts }
    return NextResponse.json(counts)
  } catch (e: unknown) {
    // A badge is never worth breaking the page over.
    console.error('review-count failed:', e)
    return NextResponse.json({ total: 0, missing: 0, pending: 0, recommendations: 0 })
  }
}
