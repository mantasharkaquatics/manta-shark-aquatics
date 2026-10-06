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

  // Only money that has arrived confirms a lesson. A bank-debit checkout
  // completes with payment_status 'unpaid' and settles days later; this used
  // to confirm it (and record it as paid) on the spot, so a returned debit
  // left a confirmed, unpaid assessment (found 2026-10-05). Such a booking
  // stays pending_payment until checkout.session.async_payment_succeeded
  // brings a session that says 'paid', or async_payment_failed releases it.
  if (session.payment_status !== 'paid') return 'noop'

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
      supabase.from('parents').select('first_name, email, preferred_language').eq('id', bk.parent_id).single(),
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
        const time = `${h12}:${String(mm).padStart(2, '0')} ${ap}`
        const student = studentRow?.full_name || ''
        // In the family's own language: this used to be English for everyone,
        // on a page a Chinese-reading parent had set to Chinese. The receipt
        // line names the place it actually is -- the points statement.
        const lang = String((parentRow as any)?.preferred_language || 'en')
        const body = lang === 'zh-Hant'
          ? `已收到付款！您的游泳評估已確認：\n\n- 學生：${student}\n- 教練：${coachName || ''}\n- 日期：${y}年${Number(m)}月${Number(d)}日\n- 時間：${time}\n\n收據在「我的頁面」的點數紀錄裡。泳池見！`
          : lang === 'zh-Hans'
          ? `已收到付款！您的游泳评估已确认：\n\n- 学生：${student}\n- 教练：${coachName || ''}\n- 日期：${y}年${Number(m)}月${Number(d)}日\n- 时间：${time}\n\n收据在「我的页面」的点数记录里。泳池见！`
          : `Payment received! Your Swim Assessment is confirmed:\n\n- Student: ${student}\n- Coach: ${coachName || ''}\n- Date: ${MONTHS[Number(m) - 1]} ${Number(d)}, ${y}\n- Time: ${time}\n\nYour receipt is in the points history on your Dashboard. See you at the pool!`
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

/* Give a held (pending_payment) assessment slot back. Only the request that
   flips pending_payment -> cancelled does anything, so callers may race and
   repeat. Returns whether this call released it. */
export async function releaseTrialHold(
  supabase: SupabaseClient,
  bookingId: string,
  classSessionId: string | null | undefined,
  reason: string,
): Promise<boolean> {
  const { data: locked } = await supabase
    .from('bookings')
    .update({ status: 'cancelled', cancellation_reason: reason })
    .eq('id', bookingId).eq('status', 'pending_payment')
    .select('id, class_session_id')
  if (!locked || locked.length === 0) return false

  // enrolled_count is recounted by trigger; close the session if it is empty.
  const sessId = classSessionId || locked[0].class_session_id
  if (sessId) {
    const { data: sess } = await supabase
      .from('class_sessions').select('enrolled_count').eq('id', sessId).single()
    if (sess && sess.enrolled_count === 0) {
      await supabase.from('class_sessions')
        .update({ status: 'cancelled' })
        .eq('id', sessId).eq('enrolled_count', 0)
    }
  }
  return true
}

/* A bank-debit assessment payment that did not go through: release the held
   slot and mark any purchase recorded for it as not paid. Added 2026-10-05 --
   before this a failed debit was never handled, so the slot stayed held (or,
   on older checkouts, the assessment stayed confirmed and "paid").
   Idempotent: the release is a conditional update, the purchase mark only
   touches a row not already marked. */
export async function failTrialBooking(
  supabase: SupabaseClient,
  session: Stripe.Checkout.Session,
): Promise<'released' | 'noop'> {
  const meta = session.metadata || {}

  // Same columns a returned points top-up uses; purchases.status keeps its
  // legacy CHECK and is left alone (docs/migration-ach-reversal.sql).
  await supabase.from('purchases')
    .update({ reversed_at: new Date().toISOString(), reversal_reason: 'payment_failed' })
    .eq('stripe_session_id', session.id).is('reversed_at', null)

  if (!meta.booking_id) return 'noop'
  const released = await releaseTrialHold(supabase, meta.booking_id, meta.class_session_id, 'payment_failed')
  if (!released) {
    // A checkout from before this fix may have confirmed the assessment on
    // completion. Cancelling a lesson that may already have happened is a
    // judgment call, so it goes to a person.
    const { data: bk } = await supabase.from('bookings').select('status').eq('id', meta.booking_id).maybeSingle()
    if (bk?.status === 'confirmed') {
      console.error(`\u26a0\ufe0f Swim Assessment ${meta.booking_id} is confirmed but its bank payment (session ${session.id}) failed -- settle by hand`)
    }
    return 'noop'
  }

  // Tell the family (best-effort), in their language.
  try {
    const parentId = meta.parent_id
    const { data: th } = parentId
      ? await supabase.from('chat_threads').select('id').eq('parent_id', parentId).order('created_at', { ascending: true }).limit(1).maybeSingle()
      : { data: null as any }
    if (th) {
      const { data: langRow } = await supabase.from('parents').select('preferred_language').eq('id', parentId).maybeSingle()
      const lang = String(langRow?.preferred_language || 'en')
      const body = lang === 'zh-Hant'
        ? '您的游泳評估銀行付款沒有成功，所以這個時段已經釋出。請回到「我的頁面」重新預約，或直接在這裡回覆我們。'
        : lang === 'zh-Hans'
        ? '您的游泳评估银行付款没有成功，所以这个时段已经释出。请回到「我的页面」重新预约，或直接在这里回复我们。'
        : "Your bank payment for the Swim Assessment didn't go through, so that time slot has been released. You can book again from your Dashboard, or just reply here."
      const { error: chatErr } = await supabase.from('chat_messages').insert({ thread_id: th.id, sender_type: 'ai', body })
      if (!chatErr) await supabase.from('chat_threads').update({ last_message_at: new Date().toISOString(), last_message_preview: body.slice(0, 120) }).eq('id', th.id)
    }
  } catch (e) {
    console.error('Trial payment-failed notice error:', e)
  }
  console.log(`Trial lesson bank payment failed, released slot: booking ${meta.booking_id}`)
  return 'released'
}

/* Bring one unpaid Swim Assessment in line with its Stripe checkout:
   - paid                      -> confirm it
   - bank debit that failed    -> release the slot
   - expired, or past its hold -> close the checkout and release the slot
   - still open                -> leave it, and say when the hold ends
   Safe to call as often as you like. */
export async function syncTrialBooking(
  supabase: SupabaseClient,
  stripe: Stripe,
  booking: { id: string; status: string; stripe_session_id: string | null; class_session_id: string; pending_expires_at?: string | null },
): Promise<{ state: 'confirmed' | 'released' | 'open' | 'unchanged'; expiresAt?: string }> {
  if (booking.status !== 'pending_payment') return { state: 'unchanged' }

  // A hold with no checkout: Stripe failed (or the request died) between the
  // booking insert and the session create, so there is nothing anyone can
  // pay. It used to be skipped here and so held the coach's slot forever
  // (found 2026-10-05). Release it once its hold has passed; a hold stamped
  // before pending_expires_at existed is judged by age, as the cron does.
  if (!booking.stripe_session_id) {
    let holdEnds = booking.pending_expires_at ? new Date(booking.pending_expires_at).getTime() : NaN
    if (!Number.isFinite(holdEnds)) {
      const { data: row } = await supabase.from('bookings').select('created_at').eq('id', booking.id).maybeSingle()
      holdEnds = row?.created_at ? new Date(row.created_at).getTime() + 35 * 60 * 1000 : NaN
    }
    if (!Number.isFinite(holdEnds) || Date.now() < holdEnds) return { state: 'unchanged' }
    const released = await releaseTrialHold(supabase, booking.id, booking.class_session_id, 'payment_expired')
    return { state: released ? 'released' : 'unchanged' }
  }

  let session = await stripe.checkout.sessions.retrieve(booking.stripe_session_id)

  if (session.status === 'complete') {
    // A bank-account payment completes the checkout before the money clears;
    // that one waits for the webhook -- unless the debit has already failed
    // and the async_payment_failed delivery was missed, in which case the
    // payment intent says so and the slot is released here instead.
    if (session.payment_status !== 'paid') {
      if (await debitFailed(stripe, session)) {
        const r = await failTrialBooking(supabase, session)
        return { state: r === 'released' ? 'released' : 'unchanged' }
      }
      return { state: 'open' }
    }
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

  const released = await releaseTrialHold(supabase, booking.id, booking.class_session_id, 'payment_expired')
  return { state: released ? 'released' : 'unchanged' }
}

/* Has the bank debit behind a completed-but-unpaid checkout already failed?
   A failed attempt sends the payment intent back to requires_payment_method
   (or it is canceled); 'processing' is a debit still on its way. */
async function debitFailed(stripe: Stripe, session: Stripe.Checkout.Session): Promise<boolean> {
  const piId = typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id
  if (!piId) return false
  const pi = await stripe.paymentIntents.retrieve(piId)
  return pi.status === 'requires_payment_method' || pi.status === 'canceled'
}

/* Before the SCHOOL cancels a held (unpaid) Swim Assessment, close its Stripe
   checkout, as the family's own cancel does. The admin cancel routes used to
   flip the booking and leave the checkout open, so the family could still pay
   $85 for an assessment that no longer existed (found 2026-10-06).
     'closed'  -- the checkout can no longer be paid; cancel the hold.
     'paid'    -- it was paid a moment ago; it is now a confirmed, paid
                  assessment, and the caller cancels it as one.
     'unknown' -- Stripe could not be asked, or a bank payment is still
                  clearing; cancel nothing and let the admin try again. */
export async function closeTrialCheckout(
  supabase: SupabaseClient,
  stripe: Stripe,
  stripeSessionId: string | null | undefined,
): Promise<'closed' | 'paid' | 'unknown'> {
  if (!stripeSessionId) return 'closed'
  try {
    await stripe.checkout.sessions.expire(stripeSessionId)
    return 'closed'
  } catch {
    try {
      const session = await stripe.checkout.sessions.retrieve(stripeSessionId)
      if (session.status === 'expired') return 'closed'
      if (session.status === 'complete' && session.payment_status === 'paid') {
        await confirmTrialBooking(supabase, session)
        return 'paid'
      }
      return 'unknown'
    } catch {
      return 'unknown'
    }
  }
}

/** Cancellation reasons that mean the SCHOOL cancelled. A paid assessment
 *  cancelled for one of these is still owed to the family: it shows on the
 *  admin Reviews page until it is booked again (owner, 2026-10-06). */
export const SCHOOL_CANCEL_REASONS = ['cancelled_by_school', 'coach_time_off'] as const
