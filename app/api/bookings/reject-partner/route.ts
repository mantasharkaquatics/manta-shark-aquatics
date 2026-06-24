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

  const { data: pending } = await supabase
    .from('bookings')
    .select('id, class_session_id, partner_parent_id, partner_booking_id, status')
    .eq('id', booking_id)
    .single()

  if (!pending || pending.status !== 'pending_partner') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // 取消夥伴方 booking
  await supabase.from('bookings').update({ status: 'cancelled', pending_action: null }).eq('id', booking_id)

  // 取消發起方 booking（透過 partner_booking_id 直接找）
  if (pending.partner_booking_id) {
    await supabase.from('bookings').update({ status: 'cancelled', pending_action: null }).eq('id', pending.partner_booking_id)
  }

  return NextResponse.json({ ok: true })
}
