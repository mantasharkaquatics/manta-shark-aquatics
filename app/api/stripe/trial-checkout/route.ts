import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2026-05-27.dahlia' as any })

const TRIAL_PRICE_CENTS = 8500

export async function POST(req: NextRequest) {
  try {
    const { studentId, coachId, date, time } = await req.json()

    if (!studentId || !coachId || !date || !time) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } }
    )

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Not logged in' }, { status: 401 })

    const { data: admin } = await supabase
      .from('admins')
      .select('id')
      .eq('auth_user_id', user.id)
      .single()

    if (!admin) return NextResponse.json({ error: 'Admin only' }, { status: 403 })

    const { data: student } = await supabase
      .from('students')
      .select('id, full_name, parent_id, trial_used_at')
      .eq('id', studentId)
      .single()

    if (!student) return NextResponse.json({ error: 'Student not found' }, { status: 404 })
    if (student.trial_used_at) {
      return NextResponse.json({ error: '此學生已經使用過體驗課' }, { status: 400 })
    }

    const { data: parent } = await supabase
      .from('parents')
      .select('first_name, email')
      .eq('id', student.parent_id)
      .single()

    const { data: courseType } = await supabase
      .from('course_types')
      .select('id, duration_minutes, max_students')
      .eq('slug', '1on1')
      .single()

    if (!courseType) return NextResponse.json({ error: '1-on-1 course type not found' }, { status: 500 })

    const { data: coach } = await supabase
      .from('coaches')
      .select('first_name, last_name')
      .eq('id', coachId)
      .single()

    const [h, m] = time.split(':').map(Number)
    const endMins = h * 60 + m + courseType.duration_minutes
    const endTime = `${String(Math.floor(endMins / 60)).padStart(2, '0')}:${String(endMins % 60).padStart(2, '0')}`

    const { data: existingSession } = await supabase
      .from('class_sessions')
      .select('id, enrolled_count, max_students')
      .eq('coach_id', coachId)
      .eq('session_date', date)
      .eq('start_time', time)
      .eq('status', 'open')
      .maybeSingle()

    let sessId: string
    let currentEnrolled: number

    if (existingSession) {
      if (existingSession.enrolled_count >= existingSession.max_students) {
        return NextResponse.json({ error: '這個時段已經額滿' }, { status: 400 })
      }
      sessId = existingSession.id
      currentEnrolled = existingSession.enrolled_count
    } else {
      const { data: newSess, error: sessErr } = await supabase
        .from('class_sessions')
        .insert({
          coach_id: coachId,
          course_type_id: courseType.id,
          session_date: date,
          start_time: time,
          end_time: endTime,
          max_students: courseType.max_students,
          enrolled_count: 0,
          status: 'open',
        })
        .select()
        .single()

      if (sessErr || !newSess) {
        return NextResponse.json({ error: '建立課程失敗：' + (sessErr?.message || '未知錯誤') }, { status: 500 })
      }
      sessId = newSess.id
      currentEnrolled = 0
    }

    const { data: booking, error: bookErr } = await supabase
      .from('bookings')
      .insert({
        class_session_id: sessId,
        parent_id: student.parent_id,
        student_id: studentId,
        lesson_credit_id: null,
        status: 'pending_payment',
        is_trial: true,
      })
      .select()
      .single()

    if (bookErr || !booking) {
      return NextResponse.json({ error: '建立預約失敗：' + (bookErr?.message || '未知錯誤') }, { status: 500 })
    }

    await supabase
      .from('class_sessions')
      .update({ enrolled_count: currentEnrolled + 1 })
      .eq('id', sessId)

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card', 'us_bank_account'],
      mode: 'payment',
      customer_email: parent?.email,
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: { name: `Trial 1-on-1 Lesson · ${student.full_name}` },
          unit_amount: TRIAL_PRICE_CENTS,
        },
        quantity: 1,
      }],
      metadata: {
        type: 'trial_lesson',
        booking_id: booking.id,
        student_id: studentId,
        class_session_id: sessId,
      },
      success_url: `${process.env.NEXT_PUBLIC_APP_URL}/?trial=success`,
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/?trial=cancelled`,
    })

    try {
      await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'trial_payment_link',
          to: parent?.email,
          parentName: parent?.first_name || 'there',
          studentName: student.full_name,
          courseName: 'Trial 1-on-1 Lesson',
          coachName: coach ? `${coach.first_name} ${coach.last_name}` : '',
          date,
          time,
          paymentUrl: session.url,
        }),
      })
    } catch (e) {
      console.error('Trial payment email error:', e)
    }

    return NextResponse.json({ url: session.url })
  } catch (err: any) {
    console.error('Trial checkout error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
