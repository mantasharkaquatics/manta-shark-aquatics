import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { cancelBookingWithPartner, notifyCancellation, type CancelTarget } from '@/lib/bookings/cancel'
import { readJson, badRequest } from '@/lib/http'

export async function POST(req: NextRequest) {
  const cookieStore = await cookies()
  const supabaseAuth = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } }
  )
  const { data: { user } } = await supabaseAuth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await readJson(req)
  if (!body) return badRequest()
  const { booking_id } = body
  if (!booking_id) return NextResponse.json({ error: 'Missing booking_id' }, { status: 400 })

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // A parent may only cancel their own bookings (admin accounts have no parents row)
  const { data: callerParent } = await supabase
    .from('parents').select('id').eq('auth_user_id', user.id).single()
  const parentId = callerParent?.id || null

  // Is this booking half of a 60-minute lesson? Decided BEFORE cancelling, so
  // every half can suppress its own email and one message covering the whole
  // hour goes out at the end. Otherwise the family gets one email per half,
  // each naming only 30 minutes of a lesson that is one lesson.
  const { data: self } = await supabase
    .from('bookings').select('lesson_group_id').eq('id', booking_id).single()
  const groupId: string | null = self?.lesson_group_id || null

  const result = await cancelBookingWithPartner(supabase, booking_id, parentId, { skipEmail: !!groupId })
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }

  const cancelled = [...(result.cancelledBookingIds || [])]
  const targets: CancelTarget[] = [...(result.emailTargets || [])]

  if (!groupId) {
    // Ordinary 30-minute booking: the library already emailed.
    return NextResponse.json({ ok: true, cancelled_booking_ids: cancelled })
  }

  // A 60-minute lesson is two linked halves — cancelling one cancels the hour.
  // Leaving half behind would strand an off-grid 30 minutes nobody can book.
  const { data: siblings } = await supabase
    .from('bookings').select('id')
    .eq('lesson_group_id', groupId)
    .not('status', 'in', '("cancelled")')

  for (const sib of siblings || []) {
    if (cancelled.includes(sib.id)) continue
    const r = await cancelBookingWithPartner(supabase, sib.id, parentId, { skipEmail: true })
    if (r.ok) {
      cancelled.push(...(r.cancelledBookingIds || [sib.id]))
      targets.push(...(r.emailTargets || []))
    }
    // A 403 here is expected and harmless: rows belonging to the other family
    // are not ours to cancel directly, and the cross-account sweep inside their
    // own half picks them up. Any other failure is caught by the check below.
  }

  // Trust the database, not the loop. Whatever is still standing means the hour
  // is only half cancelled, which is the one outcome the spec forbids — so say
  // so instead of returning success. Nothing is un-cancelled here: the halves
  // that did go are refunded, and staff can finish the rest by hand.
  const { data: leftover } = await supabase
    .from('bookings').select('id')
    .eq('lesson_group_id', groupId)
    .not('status', 'in', '("cancelled")')

  if (leftover && leftover.length > 0) {
    return NextResponse.json({
      error: 'Part of this 60-minute lesson could not be cancelled. Please contact us so we can finish it.',
      cancelled_booking_ids: cancelled,
      remaining_booking_ids: leftover.map((r: any) => r.id),
    }, { status: 409 })
  }

  // One email per family, spanning the full hour.
  await notifyCancellation(supabase, { bookingIds: cancelled, targets })

  return NextResponse.json({ ok: true, cancelled_booking_ids: cancelled })
}
