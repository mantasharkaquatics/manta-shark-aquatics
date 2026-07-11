import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

function generateCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = 'MSA-'
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)]
  return code
}

export async function POST(req: NextRequest) {
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

  // Check for an existing pending invite code
  const { data: existing } = await supabase
    .from('parent_partnerships')
    .select('invite_code')
    .eq('initiator_parent_id', parent.id)
    .eq('status', 'pending')
    .maybeSingle()

  if (existing) return NextResponse.json({ invite_code: existing.invite_code })

  // Generate a unique invite code
  let code = generateCode()
  let attempts = 0
  while (attempts < 10) {
    const { data: conflict } = await supabase
      .from('parent_partnerships').select('id').eq('invite_code', code).maybeSingle()
    if (!conflict) break
    code = generateCode()
    attempts++
  }

  const { data: partnership, error } = await supabase
    .from('parent_partnerships')
    .insert({
      initiator_parent_id: parent.id,
      partner_parent_id: parent.id, // placeholder, will be updated on accept
      invite_code: code,
      status: 'pending',
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ invite_code: partnership.invite_code })
}
