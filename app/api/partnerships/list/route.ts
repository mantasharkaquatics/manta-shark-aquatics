import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

export async function GET(req: NextRequest) {
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

  const { data: partnerships } = await supabase
    .from('parent_partnerships')
    .select('id, initiator_parent_id, partner_parent_id, status, invite_code')
    .or(`initiator_parent_id.eq.${parent.id},partner_parent_id.eq.${parent.id}`)
    .eq('status', 'active')

  const partnerParentIds = (partnerships || []).map(p =>
    p.initiator_parent_id === parent.id ? p.partner_parent_id : p.initiator_parent_id
  )

  let partnerStudents: any[] = []
  if (partnerParentIds.length > 0) {
    const { data: students } = await supabase
      .from('students')
      .select('id, full_name, parent_id')
      .in('parent_id', partnerParentIds)
    partnerStudents = students || []
  }

  return NextResponse.json({
    partnerships: partnerships || [],
    partner_students: partnerStudents,
    my_parent_id: parent.id,
  })
}
