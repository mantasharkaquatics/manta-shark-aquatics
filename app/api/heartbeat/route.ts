import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

export const runtime = 'nodejs'

export async function POST() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false }, { status: 401 })

  const svc = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  // Only parents have a last_activity_at to stamp. An admin or a coach browsing
  // the public pages is not an error -- this used to answer 404, which filled
  // the log with what looked like a broken endpoint every two minutes per tab.
  const { data: parent } = await svc.from('parents').select('id').eq('auth_user_id', user.id).single()
  if (!parent) return new NextResponse(null, { status: 204 })

  const { error } = await svc
    .from('parents')
    .update({ last_activity_at: new Date().toISOString() })
    .eq('id', parent.id)
  if (error) {
    console.error('heartbeat update error:', error)
    return NextResponse.json({ ok: false }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
