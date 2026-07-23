import { sendEmail } from '@/lib/email'
import { PLANS } from '@/lib/plans'
import { formatTime12h } from '@/lib/date'
import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2026-05-27.dahlia' as any })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  const body = await req.text()
  const sig = req.headers.get('stripe-signature')!

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!)
  } catch (err: any) {
    console.error('Webhook signature error:', err.message)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session
    const meta = session.metadata!

    if (meta.type === 'trial_lesson') {
      const booking_id = meta.booking_id
      const student_id = meta.student_id

      // Idempotency lock: only the pending_payment -> confirmed transition proceeds.
      // Webhook retries and already-cancelled bookings fall through harmlessly.
      const { data: locked, error: bookingErr } = await supabase
        .from('bookings')
        .update({ status: 'confirmed' })
        .eq('id', booking_id)
        .eq('status', 'pending_payment')
        .select('id, parent_id, class_session_id')

      if (bookingErr) {
        console.error('Trial booking confirm error:', bookingErr)
        return NextResponse.json({ error: 'Trial booking confirm failed' }, { status: 500 })
      }
      if (!locked || locked.length === 0) {
        return NextResponse.json({ received: true })
      }
      const bk = locked[0]

      await supabase
        .from('students')
        .update({ trial_used_at: new Date().toISOString() })
        .eq('id', student_id)

      // Resolve course_type_id (new checkouts carry it in metadata; fallback for older ones)
      let course_type_id = meta.course_type_id || null
      if (!course_type_id) {
        const { data: ct } = await supabase.from('course_types').select('id').eq('slug', '1on1').single()
        course_type_id = ct?.id || null
      }

      const amount_cents = session.amount_total ?? 0

      const { data: purchase, error: purchaseErr } = await supabase
        .from('purchases')
        .insert({
          parent_id: bk.parent_id,
          lesson_package_id: null,
          amount_cents,
          status: 'paid',
          stripe_session_id: session.id,
          paid_at: new Date().toISOString(),
        })
        .select()
        .single()
      if (purchaseErr) console.error('Trial purchase insert error:', purchaseErr)

      // Trial credit card: 1 of 1 used, appears under Lesson Credits
      const expiresAt = new Date()
      expiresAt.setMonth(expiresAt.getMonth() + 12)
      const { data: credit, error: creditErr } = await supabase
        .from('lesson_credits')
        .insert({
          student_id,
          parent_id: bk.parent_id,
          purchase_id: purchase?.id || null,
          course_type_id,
          total_credits: 1,
          used_credits: 1,
          is_trial: true,
          expires_at: expiresAt.toISOString(),
        })
        .select()
        .single()
      if (creditErr) console.error('Trial credit insert error:', creditErr)

      if (credit) {
        await supabase.from('bookings').update({ lesson_credit_id: credit.id }).eq('id', booking_id)
      }

      const { data: invStudent } = await supabase
        .from('students').select('full_name').eq('id', student_id).single()
      try {
        await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/invoices/create`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-internal-key': process.env.CRON_SECRET || '' },
          body: JSON.stringify({
            parent_id: bk.parent_id,
            lesson_credit_id: credit?.id || null,
            amount: amount_cents / 100,
            payment_method: 'stripe',
            items: [{ name: `Swim Assessment - ${invStudent?.full_name || ''}`.trim().replace(/ -$/, ''), quantity: 1, unit_price: amount_cents / 100 }],
            stripe_payment_intent_id: session.payment_intent || null,
          }),
        })
      } catch (e) {
        console.error('Trial invoice error:', e)
      }

      // Confirmation email (two-step queries; nested joins are unreliable in production)
      try {
        const [{ data: parentRow }, { data: studentRow }, { data: sess }] = await Promise.all([
          supabase.from('parents').select('first_name, email').eq('id', bk.parent_id).single(),
          supabase.from('students').select('full_name').eq('id', student_id).single(),
          supabase.from('class_sessions').select('coach_id, session_date, start_time').eq('id', bk.class_session_id).single(),
        ])
        let coachName = ''
        if (sess?.coach_id) {
          const { data: coach } = await supabase.from('coaches').select('first_name, last_name').eq('id', sess.coach_id).single()
          if (coach) coachName = `${coach.first_name} ${coach.last_name}`
        }
        // Chat confirmation message (top-up notice: failures only log, never block the webhook)
        try {
          const { data: th } = await supabase.from('chat_threads').select('id').eq('parent_id', bk.parent_id).order('created_at', { ascending: true }).limit(1).maybeSingle()
          if (th && sess) {
            const [y, m, d] = String(sess.session_date).split('-')
            const [hh, mm] = String(sess.start_time).slice(0, 5).split(':').map(Number)
            const ap = hh >= 12 ? 'PM' : 'AM'
            const h12 = hh % 12 === 0 ? 12 : hh % 12
            const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
            const body = `Payment received! Your Swim Assessment is confirmed:\n\n- Student: ${studentRow?.full_name || ''}\n- Coach: ${coachName || ''}\n- Date: ${MONTHS[Number(m) - 1]} ${Number(d)}, ${y}\n- Time: ${h12}:${String(mm).padStart(2, '0')} ${ap}\n\nYour receipt and invoice are available under Lesson Credits on your Dashboard. See you at the pool!`
            const { error: chatErr } = await supabase.from('chat_messages').insert({ thread_id: th.id, sender_type: 'ai', body })
            if (chatErr) console.error('Trial chat confirm error:', chatErr)
            else await supabase.from('chat_threads').update({ last_message_at: new Date().toISOString(), last_message_preview: body.slice(0, 120) }).eq('id', th.id)
          }
        } catch (e) {
          console.error('Trial chat confirm error:', e)
        }

        if (parentRow?.email && sess) {
          await sendEmail({
            type: 'booking_confirmed',
            to: parentRow.email,
            parentName: parentRow.first_name || 'there',
            studentName: studentRow?.full_name || '',
            courseName: 'Swim Assessment',
            coachName,
            date: sess.session_date,
            time: formatTime12h(String(sess.start_time).slice(0, 5)),
          })
        }
      } catch (e) {
        console.error('Trial confirmation email error:', e)
      }

      console.log(`✅ Trial lesson confirmed: booking ${booking_id} for student ${student_id}`)
      return NextResponse.json({ received: true })
    }

    if (meta.type === 'team_subscription') {
      const { error: tmErr } = await supabase.from('team_memberships').insert({
        student_id: meta.student_id,
        team_tier_id: meta.team_tier_id,
        stripe_subscription_id: String(session.subscription || ''),
        status: 'active',
      })
      if (tmErr) console.error('Team membership insert (possibly duplicate retry):', tmErr.message)
      else console.log(`✅ Team membership created: student ${meta.student_id} tier ${meta.team_tier_id}`)
      return NextResponse.json({ received: true })
    }

    const parent_id      = meta.parent_id
    const plan_id        = meta.plan_id
    const sessions       = parseInt(meta.sessions)
    const course_type_id = meta.course_type_id
    const amount_cents   = session.amount_total!

    // 1. Create purchase record
    const { data: purchase, error: purchaseErr } = await supabase
      .from('purchases')
      .insert({
        parent_id,
        lesson_package_id: null,
        amount_cents,
        status: 'paid',
        stripe_session_id: session.id,
        paid_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (purchaseErr || !purchase) {
      console.error('Purchase insert error:', purchaseErr)
      return NextResponse.json({ error: 'Purchase failed' }, { status: 500 })
    }

    // 2. Create lesson_credits
    const purchasedPlan = plan_id ? PLANS[plan_id] : null
    const expiresAt = new Date()
    expiresAt.setMonth(expiresAt.getMonth() + (purchasedPlan?.validityMonths ?? 12))

    const { data: credit, error: creditErr } = await supabase
      .from('lesson_credits')
      .insert({
        student_id: null,
        parent_id,
        purchase_id: purchase.id,
        course_type_id,
        total_credits: sessions,
        used_credits: 0,
        expires_at: expiresAt.toISOString(),
      })
      .select()
      .single()

    if (creditErr) {
      console.error('Credit insert error:', creditErr)
      return NextResponse.json({ error: 'Credit failed' }, { status: 500 })
    }

    const planName = plan_id && PLANS[plan_id] ? PLANS[plan_id].name : 'Swim Lesson Package'

    // 3. Create invoice
    try {
      const unitPrice = amount_cents / 100 / sessions
      const invoiceRes = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/invoices/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-internal-key': process.env.CRON_SECRET || '' },
        body: JSON.stringify({
          parent_id,
          lesson_credit_id: credit?.id || null,
          amount: amount_cents / 100,
          payment_method: 'stripe',
          items: [{
            name: planName,
            quantity: sessions,
            unit_price: unitPrice,
          }],
          stripe_payment_intent_id: session.payment_intent || null,
        }),
      })
      if (invoiceRes.ok) {
        const { invoice } = await invoiceRes.json()
        // Send invoice email
        const { data: parent } = await supabase
          .from('parents')
          .select('email, first_name')
          .eq('id', parent_id)
          .single()
        if (parent?.email && invoice?.id) {
          await sendEmail({
              type: 'invoice',
              to: parent.email,
              parentName: parent.first_name,
              invoiceNumber: invoice.invoice_number,
              invoiceId: invoice.id,
              amount: amount_cents / 100,
            })
        }
      }
    } catch (invoiceErr) {
      console.error('Invoice create error:', invoiceErr)
    }

    // Chat confirmation (best-effort: failures are logged, never block the webhook)
    try {
      const { data: th } = await supabase.from('chat_threads').select('id').eq('parent_id', parent_id).order('created_at', { ascending: true }).limit(1).maybeSingle()
      if (th) {
        const body = `Payment received! "${planName}" has been added to your account (${sessions} lesson credits).\n\nYour receipt and invoice are available under Lesson Credits on your Dashboard. Thank you!`
        const { error: chatErr } = await supabase.from('chat_messages').insert({ thread_id: th.id, sender_type: 'ai', body })
        if (chatErr) console.error('Purchase chat confirm error:', chatErr)
        else await supabase.from('chat_threads').update({ last_message_at: new Date().toISOString(), last_message_preview: body.slice(0, 120) }).eq('id', th.id)
      }
    } catch (e) {
      console.error('Purchase chat confirm error:', e)
    }

    console.log(`✅ Purchase complete: ${plan_id} for parent ${parent_id}`)
  }

  if (event.type === 'customer.subscription.updated') {
    const sub = event.data.object as Stripe.Subscription
    const ts = (sub as any).cancel_at || (sub as any).current_period_end
    const scheduled = sub.cancel_at_period_end || (sub as any).cancel_at != null
    const cancelsAt = scheduled && ts ? new Date(ts * 1000).toISOString() : null
    const { data: updRows, error: updErr } = await supabase.from('team_memberships')
      .update({ cancels_at: cancelsAt, updated_at: new Date().toISOString() })
      .eq('stripe_subscription_id', sub.id).neq('status', 'cancelled')
      .select('id')
    console.log(`sub.updated ${sub.id} cancel_at_period_end=${sub.cancel_at_period_end} ts=${ts} cancelsAt=${cancelsAt} matched=${updRows?.length ?? 0} err=${updErr?.message || 'none'}`)
    return NextResponse.json({ received: true })
  }

  if (event.type === 'customer.subscription.deleted') {
    const sub = event.data.object as Stripe.Subscription
    await supabase.from('team_memberships')
      .update({ status: 'cancelled', cancelled_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('stripe_subscription_id', sub.id).neq('status', 'cancelled')
    console.log(`Team membership cancelled for subscription ${sub.id}`)
    return NextResponse.json({ received: true })
  }

  if (event.type === 'invoice.payment_failed') {
    const inv = event.data.object as any
    const subId = typeof inv.subscription === 'string' ? inv.subscription : inv.subscription?.id
    if (subId) await supabase.from('team_memberships')
      .update({ status: 'past_due', updated_at: new Date().toISOString() })
      .eq('stripe_subscription_id', subId).eq('status', 'active')
    return NextResponse.json({ received: true })
  }

  if (event.type === 'invoice.paid') {
    const inv = event.data.object as any
    const subId = typeof inv.subscription === 'string' ? inv.subscription : (inv.subscription?.id || inv.parent?.subscription_details?.subscription || null)
    if (subId) {
      await supabase.from('team_memberships')
        .update({ status: 'active', updated_at: new Date().toISOString() })
        .eq('stripe_subscription_id', subId).eq('status', 'past_due')

      // Mirror the paid Stripe invoice into our invoices table (MSA-branded PDF + Sales page)
      const { data: existing } = await supabase.from('invoices')
        .select('id').eq('stripe_payment_intent_id', inv.id).maybeSingle()
      if (!existing) {
        const { data: tm } = await supabase.from('team_memberships')
          .select('id, student_id, team_tiers(name)')
          .eq('stripe_subscription_id', subId).single()
        if (tm) {
          const { data: stu } = await supabase.from('students')
            .select('full_name, parent_id').eq('id', tm.student_id).single()
          const tierName = (Array.isArray(tm.team_tiers) ? (tm.team_tiers as any)[0]?.name : (tm.team_tiers as any)?.name) || 'Swim Team'
          const period = inv.lines?.data?.[0]?.period
          const fmt = (sec: number) => new Date(sec * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
          const coverage = period?.start && period?.end ? ` \u00b7 ${fmt(period.start)} \u2013 ${fmt(period.end)}` : ''
          const amount = (inv.amount_paid ?? 0) / 100
          const { data: seqNum } = await supabase.rpc('get_next_invoice_seq')
          const invoice_number = `MSA-${new Date().getFullYear()}-${String(seqNum || 1).padStart(4, '0')}`
          const { data: created, error: invErr } = await supabase.from('invoices').insert({
            invoice_number,
            parent_id: stu?.parent_id || null,
            student_id: tm.student_id,
            team_membership_id: tm.id,
            amount,
            payment_method: 'stripe',
            items: [{ name: `${tierName} \u00b7 Monthly Membership${coverage}`, quantity: 1, unit_price: amount, period_end: period?.end ? new Date(period.end * 1000).toISOString() : null }],
            status: 'paid',
            stripe_payment_intent_id: inv.id,
            issued_at: new Date().toISOString(),
          }).select('id').single()
          if (invErr) console.error('Team invoice mirror insert error:', invErr)
          else console.log(`Team invoice mirrored: ${invoice_number} (${created?.id}) for ${subId}`)
        }
      }
    }
    return NextResponse.json({ received: true })
  }

  if (event.type === 'checkout.session.expired') {
    const session = event.data.object as Stripe.Checkout.Session
    const meta = session.metadata!

    if (meta.type === 'trial_lesson') {
      const booking_id = meta.booking_id
      const class_session_id = meta.class_session_id

      const { data: booking } = await supabase
        .from('bookings')
        .select('status')
        .eq('id', booking_id)
        .single()

      if (booking?.status === 'pending_payment') {
        await supabase
          .from('bookings')
          .update({ status: 'cancelled' })
          .eq('id', booking_id)

        // enrolled_count recalculated by trg_booking_count (includes pending_payment).
        // Only close the session here if it became empty.
        const { data: sess } = await supabase
          .from('class_sessions')
          .select('enrolled_count')
          .eq('id', class_session_id)
          .single()

        if (sess && sess.enrolled_count === 0) {
          await supabase
            .from('class_sessions')
            .update({ status: 'cancelled' })
            .eq('id', class_session_id)
            .eq('enrolled_count', 0)
        }

        console.log(`⏰ Trial lesson payment expired, released slot: booking ${booking_id}`)
      }
    }
  }

  return NextResponse.json({ received: true })
}
