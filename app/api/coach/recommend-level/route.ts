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

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: coach } = await supabase
    .from('coaches')
    .select('id')
    .eq('auth_user_id', user.id)
    .single()

  if (!coach) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { student_id, recommended_level, notes, previous_recommended_level } = await req.json()

  // Mark old pendings as superseded
  await supabase
    .from('level_recommendations')
    .update({ status: 'rejected' })
    .eq('student_id', student_id)
    .eq('coach_id', coach.id)
    .eq('status', 'pending')

  const { data, error } = await supabase
    .from('level_recommendations')
    .insert({
      student_id,
      coach_id: coach.id,
      recommended_level,
      notes: notes || null,
      previous_recommended_level: previous_recommended_level || null
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, id: data.id })
}
