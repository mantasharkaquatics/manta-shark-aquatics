import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

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

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: parent } = await supabase
    .from('parents').select('id').eq('auth_user_id', user.id).single()
  if (!parent) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data: myBooking } = await supabase
    .from('bookings')
    .select('id, parent_id, partner_booking_id, pending_action')
    .eq('id', booking_id)
    .eq('pending_action', 'reschedule')
    .single()

  if (!myBooking) return NextResponse.json({ error: '預約不存在或狀態不符' }, { status: 404 })
  if (myBooking.parent_id !== parent.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // 清除雙方 pending，維持原時段
  await supabase.from('bookings').update({ pending_action: null, pending_new_session_id: null }).eq('id', myBooking.id)
  if (myBooking.partner_booking_id) {
    await supabase.from('bookings').update({ pending_action: null, pending_new_session_id: null }).eq('id', myBooking.partner_booking_id)
  }

  return NextResponse.json({ success: true })
}
