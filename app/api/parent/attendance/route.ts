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
    .from('parents')
    .select('id')
    .eq('auth_user_id', user.id)
    .single()

  if (!parent) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const bookingIdsParam = req.nextUrl.searchParams.get('booking_ids') || ''
  const bookingIds = bookingIdsParam.split(',').filter(Boolean)
  if (bookingIds.length === 0) return NextResponse.json({ checkedInBookingIds: [] })

  // 驗證這些 booking 確實屬於這個家長底下的學生，避免查到別人的資料
  const { data: ownedBookings } = await supabase
    .from('bookings')
    .select('id, student_id, students!inner(parent_id)')
    .in('id', bookingIds)
    .eq('students.parent_id', parent.id)

  const ownedIds = (ownedBookings || []).map((b: any) => b.id)
  if (ownedIds.length === 0) return NextResponse.json({ checkedInBookingIds: [] })

  const { data, error } = await supabase
    .from('attendance')
    .select('booking_id')
    .in('booking_id', ownedIds)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ checkedInBookingIds: (data || []).map(d => d.booking_id) })
}
