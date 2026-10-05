import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { readJson, badRequest } from '@/lib/http'

export async function POST(req: NextRequest) {
  const body = await readJson(req)
  if (!body) return badRequest()
  const { partnership_id } = body
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

  // Cancel all pending cross-account bookings
  const otherParentId = partnership.initiator_parent_id === parent.id
    ? partnership.partner_parent_id
    : partnership.initiator_parent_id

  // Only pending invitations, which were never charged -- nothing to refund.
  // Exactly the invitations between THESE two parents, in both directions
  // (found 2026-10-05). It used to match partner_parent_id = the other parent
  // alone, which cancelled every invite that parent had sent to ANY family
  // and missed the ones this parent had sent to them. On an invite row,
  // parent_id is the invited family and partner_parent_id the inviter.
  const { data: pendingBookings, error: findErr } = await supabase
    .from('bookings')
    .select('id, partner_booking_id, lesson_group_id')
    .or(`and(parent_id.eq.${parent.id},partner_parent_id.eq.${otherParentId}),and(parent_id.eq.${otherParentId},partner_parent_id.eq.${parent.id})`)
    .eq('pending_action', 'confirm')
    .eq('status', 'pending_partner')
  if (findErr) return NextResponse.json({ error: 'Could not unlink the accounts' }, { status: 500 })

  // The inviter's own pending (also uncharged) half of each invitation goes
  // with it, as in reject-partner: the linked row, or the whole hour group.
  const ids = new Set<string>()
  const groups = new Set<string>()
  for (const b of pendingBookings || []) {
    ids.add(b.id)
    if (b.partner_booking_id) ids.add(b.partner_booking_id)
    if (b.lesson_group_id) groups.add(b.lesson_group_id)
  }
  if (groups.size > 0) {
    const { data: groupRows } = await supabase.from('bookings')
      .select('id').in('lesson_group_id', [...groups]).eq('status', 'pending_partner')
    for (const r of groupRows || []) ids.add(r.id)
  }
  if (ids.size > 0) {
    const { error: cancelErr } = await supabase.from('bookings')
      .update({ status: 'cancelled' })
      .in('id', [...ids])
      .eq('status', 'pending_partner')
    if (cancelErr) return NextResponse.json({ error: 'Could not unlink the accounts' }, { status: 500 })
  }

  const { error: revokeErr } = await supabase
    .from('parent_partnerships')
    .update({ status: 'revoked', revoked_at: new Date().toISOString() })
    .eq('id', partnership_id)
  if (revokeErr) return NextResponse.json({ error: 'Could not unlink the accounts' }, { status: 500 })

  return NextResponse.json({ success: true })
}
