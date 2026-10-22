import { NextRequest, NextResponse } from 'next/server'
import { requireParent } from '@/lib/api-auth'
import { createBooking } from '@/lib/bookings/create-booking'

// The rules live in lib/bookings/create-booking.ts (shared with the sibling route).
export async function POST(req: NextRequest) {
  const auth = await requireParent()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return createBooking(auth, await req.json().catch(() => null))
}
