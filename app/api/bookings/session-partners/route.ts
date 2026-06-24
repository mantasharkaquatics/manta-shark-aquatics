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

  const { session_ids, parent_id } = await req.json()
  if (!session_ids?.length) return NextResponse.json({ partners: {} })

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // 查詢這些 session 中，不屬於此 parent 的其他 active booking
  const { data: partnerBookings } = await supabase
    .from('bookings')
    .select('class_session_id, student_id')
    .in('class_session_id', session_ids)
    .neq('parent_id', parent_id)
    .not('status', 'in', '("cancelled")')

  if (!partnerBookings?.length) return NextResponse.json({ partners: {} })

  const studentIds = [...new Set(partnerBookings.map((b: any) => b.student_id).filter(Boolean))]
  const { data: students } = await supabase
    .from('students')
    .select('id, full_name')
    .in('id', studentIds)

  const studentMap: Record<string, string> = {}
  for (const s of students || []) { studentMap[(s as any).id] = (s as any).full_name }

  // 回傳 { session_id: partner_student_name }
  const partners: Record<string, string> = {}
  for (const b of partnerBookings) {
    if (b.student_id && studentMap[b.student_id]) {
      partners[b.class_session_id] = studentMap[b.student_id]
    }
  }

  return NextResponse.json({ partners })
}
