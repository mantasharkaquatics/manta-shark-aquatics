import { sendEmail } from '@/lib/email'
import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { requireAdmin, requireParent, serviceClient } from '@/lib/api-auth'
import { TRIAL_PRICE_CENTS, TRIAL_HOLD_MINUTES } from '@/lib/plans'
import { formatTime12h } from '@/lib/date'
import { assessmentSlotError } from '@/lib/assessment-slot'
import { releaseTrialHold, syncTrialBooking } from '@/lib/trial-booking'
import { renewalHoldsInWay, renewalHoldRefusal } from '@/lib/bookings/desk-checks'
import { sessionLocationLine } from '@/lib/locations'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2026-05-27.dahlia' as any })

export async function POST(req: NextRequest) {
  try {
    const { studentId, coachId, date, time, sendPaymentEmail, override_holds } = await req.json()

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
      .select('id, full_name, parent_id, trial_used_at, current_level')
      .eq('id', studentId)
      .single()

    if (!student) return NextResponse.json({ error: 'Student not found' }, { status: 404 })
    if (student.trial_used_at) {
      return NextResponse.json({ error: 'This student has already used their trial lesson' }, { status: 400 })
    }
    if (student.current_level != null) {
      return NextResponse.json({ error: 'This student already has an assigned level and does not need a Swim Assessment' }, { status: 400 })
    }

    // Guard: no duplicate trial while one is pending payment or already confirmed
    const trialQ = () => svc
      .from('bookings')
      .select('id, status, stripe_session_id, class_session_id, pending_expires_at')
      .eq('student_id', studentId)
      .eq('is_trial', true)
      .neq('status', 'cancelled')
      .limit(1)
    let { data: existingTrial } = await trialQ()
    // An unpaid hold past its 15 minutes is settled here first (released, or
    // confirmed if it was just paid), so the family -- or the AI booking for
    // them -- can pick a new time straight away instead of being refused
    // until the cleanup cron runs (found 2026-10-08).
    const stale = existingTrial?.[0]
    if (stale && stale.status === 'pending_payment' && stale.pending_expires_at
        && Date.parse(stale.pending_expires_at) <= Date.now()) {
      try {
        const r = await syncTrialBooking(svc, stripe, stale)
        if (r.state === 'released' || r.state === 'confirmed') ({ data: existingTrial } = await trialQ())
      } catch (e) {
        console.error('trial-checkout: could not settle an expired hold', stale.id, e)
      }
    }
    if (existingTrial && existingTrial.length > 0) {
      // An unpaid hold says so: "already booked" sent a family who had never
      // paid away believing they had (found 2026-10-08).
      return NextResponse.json({ error: existingTrial[0].status === 'pending_payment'
        ? 'This swimmer has a Swim Assessment waiting for payment. Pay for it or cancel it on your dashboard.'
        : 'A trial lesson is already booked or awaiting payment for this student' }, { status: 400 })
    }
    // A parent's own booking keeps the booking rules; the desk may override.
    if (isParentFlow) {
      const why = await assessmentSlotError(svc, { coachId, date, time, studentId, minutes: 30 })
      if (why) return NextResponse.json({ error: why }, { status: 400 })
    } else if (override_holds !== true) {
      // Except a fixed-class family's renewal hold: the desk is asked, and
      // goes ahead only on a second confirmation (owner, 2026-10-08).
      const [hh, mm] = String(time).split(':').map(Number)
      const s0 = hh * 60 + mm
      const hits = await renewalHoldsInWay(svc, {
        coachId, courseTypeId: '', dates: [date], spanStart: s0, spanEnd: s0 + 30,
        seatsNeeded: 1, defaultMax: 1, exceptParentIds: [student.parent_id],
      })
      if (hits.size > 0) return NextResponse.json(renewalHoldRefusal(hits), { status: 409 })
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
        console.error('trial-checkout session insert failed:', sessErr?.message)
        return NextResponse.json({ error: 'Failed to create session' }, { status: 500 })
      }
      sessId = newSess.id
    }

    // How long the slot is held for payment. The dashboard counts down to
    // this, and when it passes the checkout is closed and the slot released
    // (lib/trial-booking.ts). Stripe's own expiry cannot be under 30 minutes,
    // so it is only the outer limit, not the hold.
    const holdEndsSec = Math.floor(Date.now() / 1000) + TRIAL_HOLD_MINUTES * 60

    const { data: booking, error: bookErr } = await svc
      .from('bookings')
      .insert({
        pending_expires_at: new Date(holdEndsSec * 1000).toISOString(),
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
      console.error('trial-checkout booking insert failed:', bookErr?.message)
      return NextResponse.json({ error: (bookErr?.message || '').includes('STUDENT_DOUBLE_BOOKED')
        ? 'This swimmer already has a lesson at this time. Please pick another time.' : 'Failed to create booking' }, { status: 500 })
    }

    // The hold above already exists, and nothing else would ever release it:
    // with no stripe_session_id there is no checkout to expire or pay. If
    // Stripe throws, give the slot straight back (found 2026-10-05).
    let checkoutSession: Stripe.Checkout.Session
    try {
      checkoutSession = await stripe.checkout.sessions.create({
        locale: 'en',
        // Card only (owner, 2026-10-05). An assessment can be booked 30
        // minutes ahead, and a bank debit takes days to settle: the booking
        // sat in pending_payment, hidden from the coach and with no reminder,
        // until after the lesson had happened.
        payment_method_types: ['card'],
        mode: 'payment',
        customer_email: parent?.email,
        expires_at: Math.floor(Date.now() / 1000) + 30 * 60 + 60,
        line_items: [{
          price_data: {
            currency: 'usd',
            product_data: { name: `Swim Assessment - 30 min - ${student.full_name}` },
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
        // The family's own booking returns to their dashboard, which checks
        // the payment itself. A link the desk made is often paid on a phone
        // that is not signed in, so it lands on a page that confirms this
        // payment by its checkout id (it used to land on the home page and
        // say nothing). So is a link the AI assistant emails for the family
        // (sendPaymentEmail): it is made with the parent's sign-in, but paid
        // from the email, often on a phone that is not signed in, which then
        // showed only the login page (found 2026-10-08). Leaving the payment
        // page goes to the dashboard, where the hold can be paid or cancelled.
        success_url: isParentFlow && sendPaymentEmail !== true
          ? `${process.env.NEXT_PUBLIC_APP_URL}/dashboard?trial=success`
          : `${process.env.NEXT_PUBLIC_APP_URL}/checkout/success?assessment=1&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard?trial=cancelled`,
      })
    } catch (stripeErr) {
      await releaseTrialHold(svc, booking.id, sessId, 'checkout_failed').catch(e =>
        console.error('trial-checkout: could not release hold after Stripe error', booking.id, e))
      throw stripeErr
    }

    await svc.from('bookings').update({ stripe_session_id: checkoutSession.id }).eq('id', booking.id)

    // The "please complete payment" email goes with a link someone ELSE made
    // -- the desk, or the AI assistant in chat (it asks for it). A family
    // booking on the site is already on the payment page, and the email only
    // made a second, contradicting message in their inbox next to the
    // confirmation (owner, 2026-10-08).
    if (!isParentFlow || sendPaymentEmail === true) {
      try {
        await sendEmail({
          type: 'trial_payment_link',
          to: parent?.email || '',
          parentName: parent?.first_name || 'there',
          studentName: student.full_name,
          courseName: 'Swim Assessment',
          coachName: coach ? `${coach.first_name} ${coach.last_name}` : '',
          date,
          time: formatTime12h(time),
          location: await sessionLocationLine(svc, sessId),
          paymentUrl: checkoutSession.url || '',
          amount: TRIAL_PRICE_CENTS / 100,
          // When the hold ends, on the school's clock.
          deadline: new Date(holdEndsSec * 1000).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'America/Los_Angeles' }),
        })
      } catch (e) {
        console.error('Trial payment email error:', e)
      }
    }

    return NextResponse.json({ url: checkoutSession.url })
  } catch (err: any) {
    console.error('Trial checkout error:', err)
    return NextResponse.json({ error: 'Booking failed. Please try again.' }, { status: 500 })
  }
}
