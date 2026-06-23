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

  const { class_session_id, partner_parent_id, partner_student_id, initiator_parent_id, partnership_id } = await req.json()

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // 確認 initiator 是目前登入的人
  const { data: initiatorParent } = await supabase
    .from('parents').select('id').eq('auth_user_id', user.id).single()
  if (!initiatorParent || initiatorParent.id !== initiator_parent_id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { data, error } = await supabase
    .from('bookings')
    .insert({
      class_session_id,
      parent_id: partner_parent_id,
      lesson_credit_id: null,
      student_id: partner_student_id,
      status: 'pending_partner',
      pending_action: 'confirm',
      pending_expires_at: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(),
      partner_parent_id: initiator_parent_id,
      partnership_id: partnership_id || null,
      is_guest: true,
    })
    .select('id')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ booking_id: data.id })
}
