import type Stripe from 'stripe'
import type { SupabaseClient } from '@supabase/supabase-js'
import { sendEmail } from '@/lib/email'
import { formatTime12h } from '@/lib/date'
import { alertAdmin } from '@/lib/admin-alert'
import { assessmentSlotError } from '@/lib/assessment-slot'

const piOf = (session: Stripe.Checkout.Session): string | null =>
  typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id ?? null

/* Turning a paid Swim Assessment checkout into a confirmed booking.

   Two callers reach this: the Stripe webhook, and the family's own dashboard
   (through syncTrialBooking below) when they come back from paying -- so the
   booking confirms even when the webhook is late, misconfigured or missing.
   The pending_payment -> confirmed update is the lock: whichever caller gets
   there first does the work, and the other finds nothing to do ('noop').

   The records of the payment (trial_used_at, the purchase, the assessment
   credit) are written by the lock holder. Each of those writes is
   idempotent, and if one fails the lock is handed back (confirmed ->
   pending_payment) and this throws, so the webhook answers 500 and Stripe's
   redelivery -- or the dashboard, or the cron -- does them again. They used
   to fail with a log line only, and nothing ever retried them (found
   2026-10-08). */
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
  // Webhook retries fall through harmlessly; a hold that was already released
  // goes to paidAfterRelease below. cancellation_reason is left alone here: it
  // may carry the 'payment_records_failed' stamp, which must survive retries
  // (it is cleared below once the records are written).
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
    return paidAfterRelease(supabase, session)
  }
  const bk = locked[0]

  const amount_cents = session.amount_total ?? 0
  let credit: { id: string }
  try {
    credit = await recordTrialPayment(supabase, session, bk.parent_id, student_id, { bookingId: booking_id, used: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    // Give the lock back so the next caller writes what is missing.
    const { error: undoErr } = await supabase.from('bookings')
      .update({ status: 'pending_payment' }).eq('id', booking_id).eq('status', 'confirmed')
    console.error(`Trial booking ${booking_id}: payment records failed${undoErr ? ' and the booking could not be reopened' : '; reopened for a retry'}:`, msg)
    // Tell the school once per booking, not on every retry: the first
    // failure stamps the (otherwise unused) cancellation_reason of the held
    // booking, and only the call that stamps it sends the alert. The lock
    // above does not clear the stamp; only a successful write does, so a
    // failure that keeps coming back is reported once (found 2026-10-08: the
    // lock used to clear it, and every retry alerted again).
    const { data: firstFailure } = undoErr ? { data: [{ id: booking_id }] } : await supabase.from('bookings')
      .update({ cancellation_reason: 'payment_records_failed' })
      .eq('id', booking_id).eq('status', 'pending_payment').is('cancellation_reason', null).select('id')
    if (firstFailure && firstFailure.length > 0) {
      await alertAdmin('Swim Assessment payment not fully recorded', [
        `A Swim Assessment (booking ${booking_id}) was paid, but its payment records could not be written (${msg}).`,
        undoErr
          ? 'The booking shows as confirmed, but the records will NOT be retried automatically.'
          : 'It is retried automatically (Stripe, the family\'s dashboard and the 15-minute cleanup all try again). If the booking is not confirmed within the hour, record it by hand.',
        `Stripe checkout ${session.id}, payment ${piOf(session) || 'unknown'}, $${(amount_cents / 100).toFixed(2)}.`,
      ])
    }
    throw new Error('Trial booking records failed: ' + msg)
  }
  // The records are written: a confirmed booking carries no cancellation reason.
  const { error: unstampErr } = await supabase.from('bookings')
    .update({ cancellation_reason: null })
    .eq('id', booking_id).eq('cancellation_reason', 'payment_records_failed')
  if (unstampErr) console.error(`Trial booking ${booking_id}: could not clear the payment_records_failed stamp:`, unstampErr.message)

  const { data: invStudent } = await supabase
    .from('students').select('full_name').eq('id', student_id).single()
  const invoiceOk = await createTrialInvoice(session, bk.parent_id, credit.id, invStudent?.full_name)
  // The receipt is the one record a person has to make by hand when it is
  // missing, so say so rather than only logging it.
  if (!invoiceOk) {
    await alertAdmin('Swim Assessment invoice not created', [
      `The Swim Assessment for ${invStudent?.full_name || 'a swimmer'} was paid ($${(amount_cents / 100).toFixed(2)}) and confirmed, but its invoice could not be created, so it is missing from the Sales page.`,
      `Create the invoice by hand. Stripe checkout ${session.id}, payment ${piOf(session) || 'unknown'}.`,
    ])
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

/* The invoice (receipt) for a paid Swim Assessment, which is what puts it on
   the Sales page. Not idempotent: each caller reaches it once per payment
   (confirmTrialBooking through its lock, paidAfterRelease through its
   purchase claim). Returns whether it was created; never throws. */
async function createTrialInvoice(
  session: Stripe.Checkout.Session,
  parentId: string,
  creditId: string,
  studentName: string | null | undefined,
): Promise<boolean> {
  const amount = (session.amount_total ?? 0) / 100
  try {
    const invRes = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/invoices/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-internal-key': process.env.CRON_SECRET || '' },
      body: JSON.stringify({
        parent_id: parentId,
        lesson_credit_id: creditId,
        amount,
        payment_method: 'stripe',
        items: [{ name: `Swim Assessment - ${studentName || ''}`.trim().replace(/ -$/, ''), quantity: 1, unit_price: amount }],
        stripe_payment_intent_id: piOf(session),
      }),
    })
    return invRes.ok
  } catch (e) {
    console.error('Trial invoice error:', e)
    return false
  }
}

/* The records of a paid Swim Assessment: the swimmer's assessment marked used,
   the purchase, and the assessment credit. Every step can be repeated: the
   purchase is found by its checkout session (unique) before one is written,
   and the credit by its purchase. `used` says whether a booking already holds
   the assessment (an online booking) or it is still to be scheduled (a
   payment that arrived after its time was released). Throws on any failure. */
async function recordTrialPayment(
  supabase: SupabaseClient,
  session: Stripe.Checkout.Session,
  parentId: string,
  studentId: string,
  o: { bookingId?: string; used: boolean },
): Promise<{ id: string }> {
  const { error: usedErr } = await supabase.from('students')
    .update({ trial_used_at: new Date().toISOString() })
    .eq('id', studentId).is('trial_used_at', null)
  if (usedErr) throw new Error('trial_used_at: ' + usedErr.message)

  let purchaseId: string | null = null
  const { data: seen, error: seenErr } = await supabase.from('purchases')
    .select('id').eq('stripe_session_id', session.id).limit(1)
  if (seenErr) throw new Error('purchase lookup: ' + seenErr.message)
  if (seen && seen.length > 0) purchaseId = seen[0].id
  else {
    const row: Record<string, unknown> = {
      parent_id: parentId,
      lesson_package_id: null,
      amount_cents: session.amount_total ?? 0,
      status: 'paid',
      stripe_session_id: session.id,
      paid_at: new Date().toISOString(),
    }
    const pi = piOf(session)
    if (pi) row.stripe_payment_intent_id = pi
    const { data: ins, error: insErr } = await supabase.from('purchases').insert(row).select('id').single()
    if (insErr && insErr.code !== '23505') throw new Error('purchase insert: ' + insErr.message)
    if (ins) purchaseId = ins.id
    else {
      const { data: again } = await supabase.from('purchases').select('id').eq('stripe_session_id', session.id).limit(1)
      purchaseId = again?.[0]?.id ?? null
    }
  }
  if (!purchaseId) throw new Error('purchase not found after insert')

  // The prepaid Swim Assessment. Still a lesson_credits row with is_trial:
  // the assessment is bought before a family has a wallet, so it never
  // became points. See _archive/README.md.
  const { data: had, error: hadErr } = await supabase.from('lesson_credits')
    .select('id, used_credits').eq('purchase_id', purchaseId).eq('is_trial', true).limit(1)
  if (hadErr) throw new Error('credit lookup: ' + hadErr.message)
  let creditId: string
  if (had && had.length > 0) {
    creditId = had[0].id
    if (o.used && Number(had[0].used_credits) === 0) {
      const { error: useErr } = await supabase.from('lesson_credits').update({ used_credits: 1 }).eq('id', creditId)
      if (useErr) throw new Error('credit use: ' + useErr.message)
    }
  } else {
    let course_type_id = (session.metadata || {}).course_type_id || null
    if (!course_type_id) {
      const { data: ct } = await supabase.from('course_types').select('id').eq('slug', '1on1').single()
      course_type_id = ct?.id || null
    }
    const expiresAt = new Date()
    expiresAt.setMonth(expiresAt.getMonth() + 12)
    const { data: credit, error: creditErr } = await supabase.from('lesson_credits').insert({
      student_id: studentId,
      parent_id: parentId,
      purchase_id: purchaseId,
      course_type_id,
      total_credits: 1,
      used_credits: o.used ? 1 : 0,
      is_trial: true,
      expires_at: expiresAt.toISOString(),
    }).select('id').single()
    if (creditErr || !credit) throw new Error('credit insert: ' + (creditErr?.message || 'no row'))
    creditId = credit.id
  }

  if (o.bookingId) {
    const { error: linkErr } = await supabase.from('bookings').update({ lesson_credit_id: creditId }).eq('id', o.bookingId)
    if (linkErr) throw new Error('booking link: ' + linkErr.message)
  }
  return { id: creditId }
}

/* A checkout that was paid after its hold had been released (owner,
   2026-10-08). It used to answer 'noop': the $85 was taken, the booking stayed
   cancelled, and nothing recorded or reported it.
     - the same time is still free: the booking is put back and confirmed as
       if it had been paid in time;
     - it is not: the payment is recorded and kept on the account as a prepaid
       Swim Assessment (nothing to pay again), and the school is told so the
       desk books a new time or refunds it.
   Nothing is ever charged: this only decides what the money already taken
   pays for. Runs once per checkout -- a purchase for the session means an
   earlier call already settled it. */
async function paidAfterRelease(
  supabase: SupabaseClient,
  session: Stripe.Checkout.Session,
): Promise<'confirmed' | 'noop'> {
  const meta = session.metadata || {}
  if (!meta.booking_id) return 'noop'
  const { data: cur, error: curErr } = await supabase.from('bookings')
    .select('id, status, parent_id, student_id, class_session_id')
    .eq('id', meta.booking_id).maybeSingle()
  if (curErr) throw new Error('Trial booking lookup failed: ' + curErr.message)
  if (!cur || cur.status !== 'cancelled') return 'noop'
  const { data: seen, error: seenErr } = await supabase.from('purchases')
    .select('id').eq('stripe_session_id', session.id).limit(1)
  if (seenErr) throw new Error('Trial purchase lookup failed: ' + seenErr.message)
  if (seen && seen.length > 0) return 'noop'

  const studentId: string = cur.student_id || meta.student_id
  const parentId: string = cur.parent_id || meta.parent_id
  const [{ data: cs }, { data: st }, { data: others }] = await Promise.all([
    supabase.from('class_sessions').select('id, coach_id, session_date, start_time, status').eq('id', cur.class_session_id).maybeSingle(),
    supabase.from('students').select('full_name, current_level, trial_used_at').eq('id', studentId).maybeSingle(),
    supabase.from('bookings').select('id').eq('student_id', studentId).eq('is_trial', true)
      .neq('status', 'cancelled').neq('id', cur.id).limit(1),
  ])
  // Still needs an assessment: no level, and no other one booked or paid.
  const stillNeeds = !!st && st.current_level == null && !(others && others.length > 0)
  const time = cs ? String(cs.start_time).slice(0, 5) : ''
  let why: string | null = stillNeeds ? null : 'the swimmer already has another Swim Assessment or a level'

  // 1. The same time, if it is still free.
  if (stillNeeds && cs) {
    why = await assessmentSlotError(supabase, { coachId: cs.coach_id, date: cs.session_date, time, studentId, minutes: 30 })
    if (!why) {
      const reopened = cs.status === 'cancelled'
      if (reopened) await supabase.from('class_sessions').update({ status: 'open' }).eq('id', cs.id).eq('status', 'cancelled')
      const { data: back, error: backErr } = await supabase.from('bookings')
        .update({ status: 'pending_payment', cancellation_reason: null })
        .eq('id', cur.id).eq('status', 'cancelled').select('id')
      if (!backErr && back && back.length > 0) {
        const r = await confirmTrialBooking(supabase, session)
        if (r === 'confirmed') console.log(`Trial booking ${cur.id} paid after its hold was released; the same time was free and it is confirmed`)
        return r
      }
      if (reopened) await supabase.from('class_sessions').update({ status: 'cancelled' }).eq('id', cs.id).eq('enrolled_count', 0)
      // Someone else put it back first; they finish it.
      if (!backErr) return 'noop'
      why = backErr.message
    }
  } else if (stillNeeds && !cs) {
    why = 'the held lesson could not be found'
  }

  // 2. Not free: keep the money as a prepaid assessment (or, for a swimmer
  // who no longer needs one, just record it) and tell the school.
  const { data: recheck } = await supabase.from('bookings').select('status').eq('id', cur.id).maybeSingle()
  if (recheck && recheck.status !== 'cancelled') return 'noop'
  // The purchase row is the claim: its checkout session is unique, so only
  // one caller gets past here and the school hears about it once.
  const row: Record<string, unknown> = {
    parent_id: parentId, lesson_package_id: null, amount_cents: session.amount_total ?? 0,
    status: 'paid', stripe_session_id: session.id, paid_at: new Date().toISOString(),
  }
  const pi = piOf(session)
  if (pi) row.stripe_payment_intent_id = pi
  const { error: insErr } = await supabase.from('purchases').insert(row)
  if (insErr?.code === '23505') return 'noop'
  if (insErr) throw new Error('Trial purchase insert failed: ' + insErr.message)
  let creditProblem = ''
  // A payment kept as a prepaid assessment gets its receipt now, like one
  // paid in time -- the Sales page lists invoices only, and booking the
  // prepaid assessment later (trial-credit-book) makes none (owner,
  // 2026-10-08). Only the caller that won the purchase claim above gets here,
  // so a retry cannot invoice it twice.
  let invoiceOk = true
  if (stillNeeds) {
    let credit: { id: string } | null = null
    try {
      credit = await recordTrialPayment(supabase, session, parentId, studentId, { used: false })
    } catch (e) {
      creditProblem = e instanceof Error ? e.message : String(e)
      console.error(`Trial session ${session.id}: prepaid assessment not created:`, creditProblem)
    }
    if (credit) invoiceOk = await createTrialInvoice(session, parentId, credit.id, st?.full_name)
  }

  const [{ data: parent }, { data: coach }] = await Promise.all([
    supabase.from('parents').select('first_name, last_name, email').eq('id', parentId).maybeSingle(),
    cs?.coach_id ? supabase.from('coaches').select('first_name, last_name').eq('id', cs.coach_id).maybeSingle() : Promise.resolve({ data: null }),
  ])
  const family = parent ? `${parent.first_name || ''} ${parent.last_name || ''}`.trim() + (parent.email ? ` (${parent.email})` : '') : `parent ${parentId}`
  const coachName = coach ? `${coach.first_name || ''} ${coach.last_name || ''}`.trim() : 'unknown coach'
  console.error(`⚠️ Swim Assessment paid after its hold was released: booking ${cur.id}, session ${session.id}: ${why}`)
  await alertAdmin('Swim Assessment paid after its time was released', [
    `${family} paid $${((session.amount_total ?? 0) / 100).toFixed(2)} for ${st?.full_name || 'a swimmer'}'s Swim Assessment after the time held for them had already been released.`,
    cs ? `The time was ${cs.session_date} at ${formatTime12h(time)} with ${coachName}. It could not be booked again: ${why || 'unknown reason'}.` : `It could not be booked again: ${why || 'unknown reason'}.`,
    !stillNeeds
      ? 'This swimmer does not need this assessment, so the payment is a duplicate: refund it in Stripe.'
      : creditProblem
      ? `The payment is recorded, but the prepaid Swim Assessment could not be added to the family's account (${creditProblem}). Add it by hand (and create its invoice by hand, so it shows on the Sales page) before booking them a new time, or refund it in Stripe.`
      : 'The payment is kept on the family\'s account as a prepaid Swim Assessment, so they do not pay again. Book a new time for them (admin Booking, Swim Assessment), or refund it in Stripe -- a full refund also removes that prepaid assessment.',
    ...(invoiceOk ? [] : ['Its invoice could not be created, so it is missing from the Sales page: create the invoice by hand.']),
    `Stripe checkout ${session.id}, payment ${piOf(session) || 'unknown'}.`,
  ])
  return 'noop'
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
  // Only a checkout Stripe says is closed gives the slot back. When the close
  // failed and the checkout still reads 'open' it can still be paid, and
  // releasing then was how $85 arrived for a cancelled booking (found
  // 2026-10-08). Leave it for the next round.
  if (session.status !== 'expired') return { state: 'unchanged' }

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
