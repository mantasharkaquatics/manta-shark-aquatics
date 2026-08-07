import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

export async function PATCH(req: NextRequest) {
  const cookieStore = await cookies()
  const supabaseAuth = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } }
  )
  const { data: { user } } = await supabaseAuth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const svc = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: admin } = await svc
    .from('admins').select('id').eq('auth_user_id', user.id).single()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id, note, action } = await req.json()
  if (!id || (action !== 'approve' && action !== 'reject')) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }

  const text = String(note ?? '').trim()
  if (action === 'approve' && !text) {
    return NextResponse.json({ error: 'An approved note cannot be empty' }, { status: 400 })
  }

  // The transcript is never touched here. Editing changes only what the family
  // reads; what the coach actually said stays on the record for comparison.
  const { error } = await svc
    .from('lesson_notes')
    .update({
      note: text,
      status: action === 'approve' ? 'approved' : 'rejected',
      reviewed_by: admin.id,
      reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)

  if (error) {
    console.error('admin/lesson-notes: save failed', error)
    return NextResponse.json({ error: 'Could not save the note' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
