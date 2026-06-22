import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

export async function POST(req: NextRequest) {
  try {
    const { parentId, studentId, coachId, date, time, paymentMethod, paymentIntentId } = await req.json()

    const cookieStore = await cookies()
    const supabaseAuth = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } }
    )
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { data: admin } = await supabaseAuth.from('admins').select('id').eq('auth_user_id', user.id).single()
    if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const { data: student } = await supabase
      .from('students').select('id, full_name, parent_id, trial_used_at').eq('id', studentId).single()
    if (!student) return NextResponse.json({ error: 'Student not found' }, { status: 404 })
    if (student.trial_used_at) return NextResponse.json({ error: '此學生已使用過體驗課' }, { status: 400 })

    const { data: activeTrial } = await supabase
      .from('bookings').select('id').eq('student_id', studentId).eq('is_trial', true).neq('status', 'cancelled').maybeSingle()
    if (activeTrial) return NextResponse.json({ error: '此學生已有進行中的體驗課預約' }, { status: 400 })

    const { data: courseType } = await supabase
      .from('course_types').select('id, duration_minutes, max_students').eq('slug', '1on1').single()
    if (!courseType) return NextResponse.json({ error: '1-on-1 course type not found' }, { status: 500 })

    const [h, m] = time.split(':').map(Number)
    const endMins = h * 60 + m + courseType.duration_minutes
    const endTime = `${String(Math.floor(endMins / 60)).padStart(2, '0')}:${String(endMins % 60).padStart(2, '0')}`

    const { data: existingSession } = await supabase
      .from('class_sessions').select('id, enrolled_count, max_students')
      .eq('coach_id', coachId).eq('session_date', date).eq('start_time', time).eq('status', 'open').maybeSingle()

    let sessId: string
    let currentEnrolled: number

    if (existingSession) {
      if (existingSession.enrolled_count >= existingSession.max_students)
        return NextResponse.json({ error: '這個時段已經額滿' }, { status: 400 })
      sessId = existingSession.id
      currentEnrolled = existingSession.enrolled_count
    } else {
      const { data: newSess, error: sessErr } = await supabase.from('class_sessions').insert({
        coach_id: coachId,
        course_type_id: courseType.id,
        session_date: date,
        start_time: time,
        end_time: endTime,
        max_students: courseType.max_students,
        enrolled_count: 0,
        status: 'open',
      }).select().single()
      if (sessErr || !newSess) return NextResponse.json({ error: 'Session creation failed' }, { status: 500 })
      sessId = newSess.id
      currentEnrolled = 0
    }

    const { data: booking, error: bookErr } = await supabase.from('bookings').insert({
      class_session_id: sessId,
      parent_id: parentId,
      student_id: studentId,
      lesson_credit_id: null,
      status: 'confirmed',
      is_trial: true,
    }).select().single()
    if (bookErr || !booking) return NextResponse.json({ error: 'Booking creation failed' }, { status: 500 })

    await supabase.from('class_sessions').update({ enrolled_count: currentEnrolled + 1 }).eq('id', sessId)
    await supabase.from('students').update({ trial_used_at: new Date().toISOString() }).eq('id', studentId)

    const insertData: Record<string, unknown> = {
      parent_id: parentId,
      lesson_package_id: null,
      amount_cents: 8500,
      status: 'paid',
      paid_at: new Date().toISOString(),
      payment_method: paymentMethod,
      recorded_by: user.id,
    }
    if (paymentIntentId) insertData.stripe_payment_intent_id = paymentIntentId

    const { data: purchase } = await supabase.from('purchases').insert(insertData).select().single()

    console.log(`✅ POS trial: student=${studentId} parent=${parentId} booking=${booking.id} method=${paymentMethod}`)
    return NextResponse.json({ success: true, bookingId: booking.id, purchaseId: purchase?.id })
  } catch (err: any) {
    console.error('POS complete-trial-sale error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
