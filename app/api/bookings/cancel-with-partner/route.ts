import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { cancelBookingWithPartner } from '@/lib/bookings/cancel'

export async function POST(req: NextRequest) {
  const cookieStore = await cookies()
  const supabaseAuth = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } }
  )
  const { data: { user } } = await supabaseAuth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { booking_id } = await req.json()
  if (!booking_id) return NextResponse.json({ error: 'Missing booking_id' }, { status: 400 })

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // A parent may only cancel their own bookings (admin accounts have no parents row)
  const { data: callerParent } = await supabase
    .from('parents').select('id').eq('auth_user_id', user.id).single()

  const result = await cancelBookingWithPartner(supabase, booking_id, callerParent?.id || null)
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }
  const cancelled = [...(result.cancelledBookingIds || [])]

  // A 60-minute lesson is two linked halves — cancelling one cancels the hour.
  // Leaving half behind would strand an off-grid 30 minutes nobody can book.
  const { data: self } = await supabase
    .from('bookings').select('lesson_group_id').eq('id', booking_id).single()
  if (self?.lesson_group_id) {
    const { data: siblings } = await supabase
      .from('bookings').select('id')
      .eq('lesson_group_id', self.lesson_group_id)
      .not('status', 'in', '("cancelled")')
    for (const sib of siblings || []) {
      if (cancelled.includes(sib.id)) continue
      const r = await cancelBookingWithPartner(supabase, sib.id, callerParent?.id || null)
      if (r.ok) cancelled.push(...(r.cancelledBookingIds || [sib.id]))
    }
  }
  return NextResponse.json({ ok: true, cancelled_booking_ids: cancelled })
}
