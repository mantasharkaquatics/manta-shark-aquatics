import type Stripe from 'stripe'
import type { SupabaseClient } from '@supabase/supabase-js'
import { sendEmail } from '@/lib/email'
import { formatTime12h } from '@/lib/date'

/* Turning a paid Swim Assessment checkout into a confirmed booking.

   Two callers reach this: the Stripe webhook, and the family's own dashboard
   (through syncTrialBooking below) when they come back from paying -- so the
   booking confirms even when the webhook is late, misconfigured or missing.
   The pending_payment -> confirmed update is the lock: whichever caller gets
   there first does the work, and the other finds nothing to do ('noop'). */
export async function confirmTrialBooking(
  supabase: SupabaseClient,
  session: Stripe.Checkout.Session,
): Promise<'confirmed' | 'noop'> {
  const meta = session.metadata || {}
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
    throw new Error('Trial booking confirm failed: ' + bookingErr.message)
  }
  if (!locked || locked.length === 0) {
    return 'noop'
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

  // The prepaid Swim Assessment. Still a lesson_credits row with is_trial:
  // the assessment is bought before a family has a wallet, so it never
  // became points. See _archive/README.md.
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
        const body = `Payment received! Your Swim Assessment is confirmed:\n\n- Student: ${studentRow?.full_name || ''}\n- Coach: ${coachName || ''}\n- Date: ${MONTHS[Number(m) - 1]} ${Number(d)}, ${y}\n- Time: ${h12}:${String(mm).padStart(2, '0')} ${ap}\n\nYour receipt and invoice are on your Dashboard. See you at the pool!`
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
  return 'confirmed'
}

/* Bring one unpaid Swim Assessment in line with its Stripe checkout:
   - paid                      -> confirm it
   - expired, or past its hold -> close the checkout and release the slot
   - still open                -> leave it, and say when the hold ends
   Safe to call as often as you like. */
export async function syncTrialBooking(
  supabase: SupabaseClient,
  stripe: Stripe,
  booking: { id: string; status: string; stripe_session_id: string | null; class_session_id: string; pending_expires_at?: string | null },
): Promise<{ state: 'confirmed' | 'released' | 'open' | 'unchanged'; expiresAt?: string }> {
  if (booking.status !== 'pending_payment' || !booking.stripe_session_id) return { state: 'unchanged' }
  let session = await stripe.checkout.sessions.retrieve(booking.stripe_session_id)

  if (session.status === 'complete') {
    // A bank-account payment completes the checkout before the money clears;
    // that one still waits for the webhook, as before.
    if (session.payment_status !== 'paid') return { state: 'open' }
    const r = await confirmTrialBooking(supabase, session)
    return { state: r === 'confirmed' ? 'confirmed' : 'unchanged' }
  }

  const holdEnds = booking.pending_expires_at
    ? new Date(booking.pending_expires_at).getTime()
    : session.expires_at * 1000
  if (session.status === 'open' && Date.now() < holdEnds) {
    return { state: 'open', expiresAt: new Date(holdEnds).toISOString() }
  }

  // Out of time. Close the checkout first so it can never be paid after the
  // slot is gone; if it turns out it was paid a moment ago, confirm instead.
  if (session.status === 'open') {
    try { session = await stripe.checkout.sessions.expire(session.id) }
    catch { session = await stripe.checkout.sessions.retrieve(session.id) }
    if (session.status === 'complete') {
      if (session.payment_status !== 'paid') return { state: 'open' }
      const r = await confirmTrialBooking(supabase, session)
      return { state: r === 'confirmed' ? 'confirmed' : 'unchanged' }
    }
  }

  const { data: locked } = await supabase
    .from('bookings')
    .update({ status: 'cancelled', cancellation_reason: 'payment_expired' })
    .eq('id', booking.id).eq('status', 'pending_payment')
    .select('id')
  if (!locked || locked.length === 0) return { state: 'unchanged' }

  // enrolled_count is recounted by trigger; close the session if it is empty.
  const { data: sess } = await supabase
    .from('class_sessions').select('enrolled_count').eq('id', booking.class_session_id).single()
  if (sess && sess.enrolled_count === 0) {
    await supabase.from('class_sessions')
      .update({ status: 'cancelled' })
      .eq('id', booking.class_session_id).eq('enrolled_count', 0)
  }
  return { state: 'released' }
}
