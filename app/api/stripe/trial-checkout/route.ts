import { sendEmail } from '@/lib/email'
import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { requireAdmin, requireParent, serviceClient } from '@/lib/api-auth'
import { TRIAL_PRICE_CENTS } from '@/lib/plans'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2026-05-27.dahlia' as any })

export async function POST(req: NextRequest) {
  try {
    const { studentId, coachId, date, time } = await req.json()

    if (!studentId || !coachId || !date || !time) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Auth: admin (books on behalf of any student) or parent (self-serve, own students only)
    let svc: ReturnType<typeof serviceClient>
    let isParentFlow = false

    const adminCtx = await requireAdmin()
    if (adminCtx) {
      svc = adminCtx.svc
    } else {
      const parentCtx = await requireParent()
      if (!parentCtx) {
        return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
      }
      isParentFlow = true
      svc = parentCtx.svc
      const { data: owned } = await svc
        .from('students')
        .select('id')
        .eq('id', studentId)
        .eq('parent_id', parentCtx.parent.id)
        .single()
      if (!owned) {
        return NextResponse.json({ error: 'Student not found' }, { status: 403 })
      }
    }

    const { data: student } = await svc
      .from('students')
      .select('id, full_name, parent_id, trial_used_at')
      .eq('id', studentId)
      .single()

    if (!student) return NextResponse.json({ error: 'Student not found' }, { status: 404 })
    if (student.trial_used_at) {
      return NextResponse.json({ error: 'This student has already used their trial lesson' }, { status: 400 })
    }

    // Guard: no duplicate trial while one is pending payment or already confirmed
    const { data: existingTrial } = await svc
      .from('bookings')
      .select('id')
      .eq('student_id', studentId)
      .eq('is_trial', true)
      .neq('status', 'cancelled')
      .limit(1)
    if (existingTrial && existingTrial.length > 0) {
      return NextResponse.json({ error: 'A trial lesson is already booked or awaiting payment for this student' }, { status: 400 })
    }

    const { data: parent } = await svc
      .from('parents')
      .select('first_name, email')
      .eq('id', student.parent_id)
      .single()

    const { data: courseType } = await svc
      .from('course_types')
      .select('id, duration_minutes, max_students')
      .eq('slug', '1on1')
      .single()

    if (!courseType) return NextResponse.json({ error: '1-on-1 course type not found' }, { status: 500 })

    const { data: coach } = await svc
      .from('coaches')
      .select('first_name, last_name')
      .eq('id', coachId)
      .single()

    const [h, m] = time.split(':').map(Number)
    const endMins = h * 60 + m + courseType.duration_minutes
    const endTime = `${String(Math.floor(endMins / 60)).padStart(2, '0')}:${String(endMins % 60).padStart(2, '0')}`

    const { data: existingSession } = await svc
      .from('class_sessions')
      .select('id, enrolled_count, max_students')
      .eq('coach_id', coachId)
      .eq('session_date', date)
      .eq('start_time', time)
      .in('status', ['open', 'full'])
      .eq('course_type_id', courseType.id)
      .maybeSingle()

    if (!existingSession) {
      const { data: conflicts } = await svc
        .from('class_sessions').select('id')
        .eq('coach_id', coachId).eq('session_date', date).eq('start_time', time)
        .in('status', ['open', 'full']).gt('enrolled_count', 0)
      if (conflicts && conflicts.length > 0)
        return NextResponse.json({ error: 'The coach already has another lesson at this time' }, { status: 400 })
    }

    let sessId: string

    if (existingSession) {
      if (existingSession.enrolled_count >= existingSession.max_students) {
        return NextResponse.json({ error: 'This time slot is already full' }, { status: 400 })
      }
      sessId = existingSession.id
    } else {
      const { data: newSess, error: sessErr } = await svc
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
        return NextResponse.json({ error: 'Failed to create session: ' + (sessErr?.message || 'unknown error') }, { status: 500 })
      }
      sessId = newSess.id
    }

    const { data: booking, error: bookErr } = await svc
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
      return NextResponse.json({ error: 'Failed to create booking: ' + (bookErr?.message || 'unknown error') }, { status: 500 })
    }

    const checkoutSession = await stripe.checkout.sessions.create({
      payment_method_types: ['card', 'us_bank_account'],
      mode: 'payment',
      customer_email: parent?.email,
      expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: { name: `Trial Lesson (Skill Assessment) - 30 min - ${student.full_name}` },
          unit_amount: TRIAL_PRICE_CENTS,
        },
        quantity: 1,
      }],
      metadata: {
        type: 'trial_lesson',
        booking_id: booking.id,
        student_id: studentId,
        class_session_id: sessId,
        parent_id: student.parent_id,
        course_type_id: courseType.id,
      },
      success_url: `${process.env.NEXT_PUBLIC_APP_URL}${isParentFlow ? '/dashboard' : '/'}?trial=success`,
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}${isParentFlow ? '/dashboard' : '/'}?trial=cancelled`,
    })

    try {
      await sendEmail({
          type: 'trial_payment_link',
          to: parent?.email || '',
          parentName: parent?.first_name || 'there',
          studentName: student.full_name,
          courseName: 'Trial Lesson (Skill Assessment)',
          coachName: coach ? `${coach.first_name} ${coach.last_name}` : '',
          date,
          time,
          paymentUrl: checkoutSession.url || '',
          amount: TRIAL_PRICE_CENTS / 100,
        })
    } catch (e) {
      console.error('Trial payment email error:', e)
    }

    return NextResponse.json({ url: checkoutSession.url })
  } catch (err: any) {
    console.error('Trial checkout error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
