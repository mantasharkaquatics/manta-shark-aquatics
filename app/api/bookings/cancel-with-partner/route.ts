import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { cancelLesson } from '@/lib/bookings/cancel'
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

  // The whole lesson, hour lessons included. That sweep used to live here,
  // which meant the chat assistant -- calling the library directly -- cancelled
  // one half of an hour and told the family it was done. It belongs next to the
  // cancellation itself, so both callers get it.
  const result = await cancelLesson(supabase, booking_id, parentId)

  if (!result.ok) {
    return NextResponse.json({
      error: result.error,
      ...(result.cancelledBookingIds.length ? { cancelled_booking_ids: result.cancelledBookingIds } : {}),
      ...(result.remainingBookingIds ? { remaining_booking_ids: result.remainingBookingIds } : {}),
    }, { status: result.status })
  }

  return NextResponse.json({ ok: true, cancelled_booking_ids: result.cancelledBookingIds })
}
