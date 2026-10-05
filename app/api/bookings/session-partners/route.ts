import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { readJson, badRequest } from '@/lib/http'
import { allRowsIn } from '@/lib/fixed-classes'

export async function POST(req: NextRequest) {
  const cookieStore = await cookies()
  const supabaseAuth = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } }
  )
  const { data: { user } } = await supabaseAuth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await readJson(req)
  if (!body) return badRequest()
  const { session_ids: rawIds, parent_id: requestedParentId } = body
  if (!Array.isArray(rawIds) || !rawIds.length) return NextResponse.json({ partners: {} })
  let session_ids = [...new Set(rawIds.filter((x: unknown): x is string => typeof x === 'string' && !!x))]

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // parent_id: parents may only query as themselves; admins may pass any id
  const { data: adminRow } = await supabase
    .from('admins').select('id').eq('auth_user_id', user.id).single()
  let parent_id = requestedParentId
  if (!adminRow) {
    const { data: callerParent } = await supabase
      .from('parents').select('id').eq('auth_user_id', user.id).single()
    if (!callerParent) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    parent_id = callerParent.id
    // Only sessions the caller is really in (found 2026-10-05). This used to
    // answer for ANY session_ids, so a signed-in parent could list other
    // families' children by full name across the schedule. A parent now gets
    // names only for sessions where they hold a booking that is not
    // cancelled -- what the dashboard asks about. Admins keep any session.
    const { data: own } = await allRowsIn(session_ids, chunk => supabase
      .from('bookings').select('id, class_session_id')
      .in('class_session_id', chunk).eq('parent_id', parent_id)
      .neq('status', 'cancelled').order('id'))
    const mine = new Set((own || []).map((b: any) => b.class_session_id))
    session_ids = session_ids.filter(id => mine.has(id))
    if (!session_ids.length) return NextResponse.json({ partners: {} })
  }

  // Fetch other active bookings in these sessions not belonging to this parent
  // (chunked and paged: a dashboard's whole booking history is a long list).
  const { data: partnerBookings } = await allRowsIn(session_ids, chunk => supabase
    .from('bookings')
    .select('id, class_session_id, student_id')
    .in('class_session_id', chunk)
    .neq('parent_id', parent_id)
    .not('status', 'in', '("cancelled")')
    .order('id'))

  if (!partnerBookings?.length) return NextResponse.json({ partners: {} })

  const studentIds = [...new Set(partnerBookings.map((b: any) => b.student_id).filter(Boolean))]
  const { data: students } = await allRowsIn(studentIds as string[], chunk => supabase
    .from('students')
    .select('id, full_name')
    .in('id', chunk)
    .order('id'))

  const studentMap: Record<string, string> = {}
  for (const s of students || []) { studentMap[(s as any).id] = (s as any).full_name }

  // Return { session_id: partner_student_name }
  const partners: Record<string, string> = {}
  for (const b of partnerBookings) {
    if (b.student_id && studentMap[b.student_id]) {
      partners[b.class_session_id] = studentMap[b.student_id]
    }
  }

  return NextResponse.json({ partners })
}
