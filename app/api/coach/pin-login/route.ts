import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createHash } from 'crypto'

export async function POST(req: NextRequest) {
  const { pin } = await req.json()
  if (!pin || pin.length !== 8) {
    return NextResponse.json({ error: 'Invalid PIN' }, { status: 400 })
  }

  const pinHash = createHash('sha256').update(pin).digest('hex')

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: coach } = await supabase
    .from('coaches')
    .select('id, first_name, auth_user_id, email')
    .eq('pin_hash', pinHash)
    .eq('is_active', true)
    .single()

  if (!coach) {
    return NextResponse.json({ error: 'Invalid PIN' }, { status: 401 })
  }

  const { data: linkData, error } = await supabase.auth.admin.generateLink({
    type: 'magiclink',
    email: coach.email,
  })

  if (error || !linkData) {
    return NextResponse.json({ error: 'Login failed' }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    name: coach.first_name,
    token_hash: linkData.properties?.hashed_token,
    email: coach.email,
  })
}
