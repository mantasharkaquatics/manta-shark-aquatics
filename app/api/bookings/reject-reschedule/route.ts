import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { readJson, badRequest } from '@/lib/http'
import { mailRescheduleNotMoved } from '@/lib/bookings/partner-reschedule-mail'

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

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: parent } = await supabase
    .from('parents').select('id').eq('auth_user_id', user.id).single()
  if (!parent) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data: myBooking } = await supabase
    .from('bookings')
    .select('id, parent_id, partner_booking_id, pending_action, pending_new_session_id')
    .eq('id', booking_id)
    .in('pending_action', ['reschedule', 'reschedule_initiator'])
    .single()

  if (!myBooking) return NextResponse.json({ error: 'Booking not found or in the wrong state' }, { status: 404 })
  if (myBooking.parent_id !== parent.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // Clear both sides' pending state, keep the original time. Only while the
  // request is still open, so a double click (or a request that was confirmed
  // or lapsed a moment ago) does not send the families a second notice.
  const { data: cleared } = await supabase.from('bookings')
    .update({ pending_action: null, pending_new_session_id: null })
    .eq('id', myBooking.id).in('pending_action', ['reschedule', 'reschedule_initiator']).select('id')
  if (myBooking.partner_booking_id) {
    await supabase.from('bookings').update({ pending_action: null, pending_new_session_id: null }).eq('id', myBooking.partner_booking_id)
  }

  // Tell both families how it ended (found 2026-10-07): the family who asked
  // was never told, and kept waiting on a request that no longer existed.
  // The family who was asked declines; the one who asked withdraws.
  if ((cleared || []).length > 0) {
    await mailRescheduleNotMoved(supabase, {
      bookingIds: [myBooking.id, myBooking.partner_booking_id].filter(Boolean) as string[],
      newSessionId: myBooking.pending_new_session_id,
      outcome: myBooking.pending_action === 'reschedule_initiator' ? 'withdrawn' : 'declined',
    })
  }

  return NextResponse.json({ success: true })
}
