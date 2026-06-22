import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

export async function POST(req: NextRequest) {
  const { partnership_id } = await req.json()
  if (!partnership_id) return NextResponse.json({ error: 'Missing partnership_id' }, { status: 400 })

  const cookieStore = await cookies()
  const supabaseAuth = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } }
  )
  const { data: { user } } = await supabaseAuth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: parent } = await supabase
    .from('parents').select('id').eq('auth_user_id', user.id).single()
  if (!parent) return NextResponse.json({ error: 'Parent not found' }, { status: 404 })

  const { data: partnership } = await supabase
    .from('parent_partnerships')
    .select('id, initiator_parent_id, partner_parent_id')
    .eq('id', partnership_id)
    .eq('status', 'active')
    .single()

  if (!partnership) return NextResponse.json({ error: 'Partnership not found' }, { status: 404 })
  if (partnership.initiator_parent_id !== parent.id && partnership.partner_parent_id !== parent.id)
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // 取消所有 pending 跨帳戶預約
  const otherParentId = partnership.initiator_parent_id === parent.id
    ? partnership.partner_parent_id
    : partnership.initiator_parent_id

  const { data: pendingBookings } = await supabase
    .from('bookings')
    .select('id, lesson_credit_id')
    .eq('partner_parent_id', otherParentId)
    .eq('pending_action', 'confirm')
    .eq('status', 'pending_partner')

  for (const b of pendingBookings || []) {
    await supabase.from('bookings').update({ status: 'cancelled' }).eq('id', b.id)
  }

  await supabase
    .from('parent_partnerships')
    .update({ status: 'revoked', revoked_at: new Date().toISOString() })
    .eq('id', partnership_id)

  return NextResponse.json({ success: true })
}
