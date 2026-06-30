import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

async function verifyAdmin(supabase: any, supabaseAuth: any) {
  const { data: { user } } = await supabaseAuth.auth.getUser()
  if (!user) return null
  const { data: admin } = await supabase.from('admins').select('id').eq('auth_user_id', user.id).single()
  return admin ? user : null
}

export async function GET(req: NextRequest) {
  const cookieStore = await cookies()
  const supabaseAuth = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } }
  )
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  const user = await verifyAdmin(supabase, supabaseAuth)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data } = await supabase
    .from('system_settings')
    .select('value')
    .eq('key', 'checkin_period_cutoff')
    .single()

  return NextResponse.json({ cutoff: data?.value || '12:00' })
}

export async function POST(req: NextRequest) {
  const cookieStore = await cookies()
  const supabaseAuth = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } }
  )
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  const user = await verifyAdmin(supabase, supabaseAuth)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { value } = await req.json()
  if (!/^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(value)) {
    return NextResponse.json({ error: 'Invalid time format' }, { status: 400 })
  }

  const { error } = await supabase
    .from('system_settings')
    .upsert({ key: 'checkin_period_cutoff', value, updated_at: new Date().toISOString() }, { onConflict: 'key' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
