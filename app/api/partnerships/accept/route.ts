import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

export async function POST(req: NextRequest) {
  const { invite_code } = await req.json()
  if (!invite_code) return NextResponse.json({ error: 'Missing invite_code' }, { status: 400 })

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
    .select('id, initiator_parent_id, status')
    .eq('invite_code', invite_code.toUpperCase())
    .eq('status', 'pending')
    .single()

  if (!partnership) return NextResponse.json({ error: '邀請碼無效或已過期' }, { status: 404 })
  if (partnership.initiator_parent_id === parent.id)
    return NextResponse.json({ error: '不能使用自己的邀請碼' }, { status: 400 })

  // 確認沒有已存在的連動
  const { data: existingPartnership } = await supabase
    .from('parent_partnerships')
    .select('id')
    .or(`and(initiator_parent_id.eq.${parent.id},partner_parent_id.eq.${partnership.initiator_parent_id}),and(initiator_parent_id.eq.${partnership.initiator_parent_id},partner_parent_id.eq.${parent.id})`)
    .eq('status', 'active')
    .maybeSingle()

  if (existingPartnership)
    return NextResponse.json({ error: '兩個帳戶已經連動' }, { status: 400 })

  const { error } = await supabase
    .from('parent_partnerships')
    .update({
      partner_parent_id: parent.id,
      status: 'active',
      accepted_at: new Date().toISOString(),
    })
    .eq('id', partnership.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
