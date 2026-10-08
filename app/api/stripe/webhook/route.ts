import { sendEmail } from '@/lib/email'
import { centsToPoints } from '@/lib/points'
import { creditPurchase, DuplicateLedgerEntry, purchaseAlreadyCredited, purchaseAlreadyReversed, reversePurchase, type ReversalReason } from '@/lib/points-wallet'
import { reclaimForArrears, type ReleasedLesson } from '@/lib/points-arrears'
import { formatTime12h } from '@/lib/date'
import { captureFee } from '@/lib/stripe-fees'
import { insertInvoice } from '@/lib/invoices/create'
import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'
import { confirmTrialBooking, failTrialBooking } from '@/lib/trial-booking'
import { alertAdmin } from '@/lib/admin-alert'
import { assessmentPaymentReversed } from '@/lib/assessments'

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
      try {
        // Confirms only when payment_status is 'paid' (found 2026-10-05). A
        // bank debit completes the checkout unpaid; it stays pending_payment
        // until checkout.session.async_payment_succeeded / _failed below.
        const r = await confirmTrialBooking(supabase, session)
        if (r === 'noop' && session.payment_status !== 'paid') {
          console.log(`Trial checkout ${session.id} completed unpaid (bank debit); waiting for settlement`)
        }
      } catch (e: any) {
        console.error(e?.message || e)
        return NextResponse.json({ error: 'Trial booking confirm failed' }, { status: 500 })
      }
      return NextResponse.json({ received: true })
    }

    if (meta.type === 'team_subscription') {
      const newSub = String(session.subscription || '')
      // One live subscription per swimmer (owner, 2026-10-06). The checks in
      // /api/stripe/checkout run when a checkout is opened; two checkouts
      // opened side by side (two tabs, Back and Join again) could both be
      // paid, and each became its own monthly subscription. Whatever reaches
      // here second is cancelled and refunded, and the school is told.
      if (meta.prepaid_membership_id) {
        // Prepaid → subscription conversion: take over the existing prepaid
        // row -- only while it has no subscription of its own yet.
        const { data: upd, error: convErr } = await supabase.from('team_memberships')
          .update({
            stripe_subscription_id: newSub,
            status: 'active',
            expires_at: null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', meta.prepaid_membership_id)
          .is('stripe_subscription_id', null)
          .select('id')
        if (convErr) {
          console.error('Prepaid conversion update failed:', convErr.message)
          return NextResponse.json({ error: 'conversion failed' }, { status: 500 })
        }
        if (!upd || upd.length === 0) {
          const { data: row } = await supabase.from('team_memberships')
            .select('stripe_subscription_id').eq('id', meta.prepaid_membership_id).maybeSingle()
          if (row?.stripe_subscription_id && row.stripe_subscription_id !== newSub) {
            await cancelDuplicateTeamSubscription(session, row.stripe_subscription_id)
          } else {
            console.log(`Prepaid membership ${meta.prepaid_membership_id} already carries ${newSub}`)
          }
        } else {
          console.log(`✅ Prepaid membership ${meta.prepaid_membership_id} converted to subscription ${newSub}`)
        }
      } else {
        const { data: live } = await supabase.from('team_memberships')
          .select('stripe_subscription_id')
          .eq('student_id', meta.student_id)
          .not('stripe_subscription_id', 'is', null)
          .in('status', ['active', 'past_due'])
        const other = (live || []).find(r => r.stripe_subscription_id !== newSub)
        if (other) {
          await cancelDuplicateTeamSubscription(session, String(other.stripe_subscription_id))
          return NextResponse.json({ received: true })
        }
        if ((live || []).some(r => r.stripe_subscription_id === newSub)) {
          console.log(`Team membership for ${newSub} already recorded`)
          return NextResponse.json({ received: true })
        }
        const { error: tmErr } = await supabase.from('team_memberships').insert({
          student_id: meta.student_id,
          team_tier_id: meta.team_tier_id,
          stripe_subscription_id: newSub,
          status: 'active',
        })
        if (tmErr) {
          // 23505: a concurrent delivery got there first (the unique index in
          // docs/migration-team-one-subscription.sql). Same subscription is a
          // retry; a different one is a duplicate.
          if (tmErr.code === '23505') {
            const { data: winner } = await supabase.from('team_memberships')
              .select('stripe_subscription_id').eq('student_id', meta.student_id)
              .not('stripe_subscription_id', 'is', null).in('status', ['active', 'past_due']).limit(1)
            const w = winner && winner[0]?.stripe_subscription_id
            if (w && w !== newSub) await cancelDuplicateTeamSubscription(session, String(w))
            return NextResponse.json({ received: true })
          }
          console.error('Team membership insert failed:', tmErr.message)
          return NextResponse.json({ error: 'membership insert failed' }, { status: 500 })
        }
        console.log(`✅ Team membership created: student ${meta.student_id} tier ${meta.team_tier_id}`)
      }
      return NextResponse.json({ received: true })
    }

    // ---- POINTS TOP-UP -------------------------------------------------
    // The only thing bought here besides a team membership. Stripe retries
    // webhooks, so the ledger is asked first whether this session has already
    // been credited -- handing out the points twice is the kind of bug that
    // surfaces in a reconciliation three months later.
    if (meta.kind !== 'points') {
      console.warn(`Ignoring checkout session ${session.id}: unknown kind "${meta.kind || ''}"`)
      return NextResponse.json({ received: true })
    }

    const parent_id = meta.parent_id
    const amount_cents = session.amount_total!
    const points = centsToPoints(amount_cents)

    if (await purchaseAlreadyCredited(supabase, session.id)) {
      console.log(`↩︎ points for session ${session.id} were already credited`)
      return NextResponse.json({ received: true })
    }

    // The wallet first. Everything after this -- the purchase row, the invoice,
    // the chat message -- is a record of something that already happened, and a
    // failure in any of them must not cost the family their points.
    //
    // The check above is not a lock. Two deliveries of the same event can both
    // read an empty ledger and both walk in here; the unique index on
    // point_ledger is what actually decides, and the loser lands in this catch
    // with its wallet write already undone. Answer 200 -- the points are in the
    // wallet, just not by our hand -- because a 500 would have Stripe redeliver
    // this same event for days.
    let res: Awaited<ReturnType<typeof creditPurchase>>
    try {
      res = await creditPurchase(supabase, {
        parentId: parent_id,
        amountCents: amount_cents,
        stripeSessionId: session.id,
      })
    } catch (e) {
      if (e instanceof DuplicateLedgerEntry) {
        console.log(`\u21a9\ufe0e points for session ${session.id} were credited by a concurrent delivery`)
        return NextResponse.json({ received: true })
      }
      throw e
    }
    console.log(`✅ ${points} points credited; balance ${res.balance}`)

    const paymentIntentId = typeof session.payment_intent === 'string'
      ? session.payment_intent
      : (session.payment_intent as any)?.id ?? null

    // The unique index on stripe_session_id is what actually stops a repeated
    // delivery from recording the same money twice; this only has to notice
    // that it fired. A conflict here means the purchase and its invoice were
    // already written, so there is nothing left to do -- carrying on would send
    // the family a second invoice for one payment.
    const { data: purchaseRow, error: purchaseErr } = await supabase.from('purchases').insert({
      parent_id,
      lesson_package_id: null,
      amount_cents,
      status: 'paid',
      stripe_session_id: session.id,
      stripe_payment_intent_id: paymentIntentId,
      paid_at: new Date().toISOString(),
    }).select('id, stripe_payment_intent_id, stripe_session_id').single()
    if (purchaseErr) {
      if (purchaseErr.code === '23505') {
        console.log(`\u21a9\ufe0e purchase for session ${session.id} was already recorded`)
        return NextResponse.json({ received: true })
      }
      // Not a duplicate. The points are already in the wallet and that is the
      // part the family can see, so this is not fatal -- but a missing
      // purchase row is missing revenue, so a person is told (2026-10-08).
      console.error('Purchase row insert failed:', purchaseErr.message)
      await alertAdmin('Points purchase not recorded', [
        `Parent ${parent_id} paid $${(amount_cents / 100).toFixed(2)} and the ${points} points are in their wallet, but the purchase record could not be written (${purchaseErr.message}).`,
        `Add the purchase by hand. Stripe checkout ${session.id}, payment ${paymentIntentId || 'unknown'}.`,
      ])
    }

    // What Stripe kept. Asked for rather than calculated, and entirely
    // best-effort: a card payment answers immediately, a bank debit has no
    // balance transaction until it settles days later, and neither case is
    // allowed to affect the points that are already in the wallet. Whatever is
    // missed here is picked up by the fee backfill.
    if (purchaseRow) {
      captureFee(stripe, supabase, purchaseRow).catch(e =>
        console.error(`fee capture failed for purchase ${purchaseRow.id}:`, e))
    }

    const pointsLabel = `${points.toLocaleString('en-US')} lesson points`

    try {
      const invoiceRes = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/invoices/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-internal-key': process.env.CRON_SECRET || '' },
        body: JSON.stringify({
          parent_id,
          amount: amount_cents / 100,
          payment_method: 'stripe',
          // One point per dollar, so quantity and unit price say the same thing
          // twice on purpose: the invoice has to stand on its own.
          items: [{ name: pointsLabel, quantity: points, unit_price: 1 }],
          stripe_payment_intent_id: paymentIntentId,
          stripe_session_id: session.id,
        }),
      })
      if (invoiceRes.ok) {
        const { invoice } = await invoiceRes.json()
        const { data: parent } = await supabase
          .from('parents').select('email, first_name').eq('id', parent_id).single()
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
      } else {
        console.error(`Invoice create failed for session ${session.id}: HTTP ${invoiceRes.status}`)
        await alertAdmin('Points purchase invoice not created', [
          `Parent ${parent_id} bought ${points} points ($${(amount_cents / 100).toFixed(2)}); the points are in their wallet, but the invoice could not be created, so it is missing from the Sales page and the family got no receipt.`,
          `Create it by hand. Stripe checkout ${session.id}.`,
        ])
      }
    } catch (invoiceErr) {
      console.error('Invoice create error:', invoiceErr)
    }

    // Chat confirmation (best-effort: failures are logged, never block the webhook)
    try {
      const { data: th } = await supabase.from('chat_threads').select('id').eq('parent_id', parent_id).order('created_at', { ascending: true }).limit(1).maybeSingle()
      if (th) {
        // In the family's language, and without volunteering refunds -- the
        // owner's rule is that the site does not bring refunds up on its own.
        const { data: langRow } = await supabase.from('parents').select('preferred_language').eq('id', parent_id).maybeSingle()
        const lang = String(langRow?.preferred_language || 'en')
        const bal = res.balance.toLocaleString('en-US')
        const body = lang === 'zh-Hant'
          ? `已收到付款，${points.toLocaleString('en-US')} 點已存入您的帳戶，目前餘額 ${bal} 點。\n\n點數不會過期。收據在「我的頁面」的點數紀錄裡。`
          : lang === 'zh-Hans'
          ? `已收到付款，${points.toLocaleString('en-US')} 点已存入您的账户，目前余额 ${bal} 点。\n\n点数不会过期。收据在「我的页面」的点数记录里。`
          : `Payment received — ${pointsLabel} are in your wallet. Your balance is now ${bal} points.\n\nPoints you buy never expire. Your receipt is in the points history on your Dashboard.`
        const { error: chatErr } = await supabase.from('chat_messages').insert({ thread_id: th.id, sender_type: 'ai', body })
        if (chatErr) console.error('Purchase chat confirm error:', chatErr)
        else await supabase.from('chat_threads').update({ last_message_at: new Date().toISOString(), last_message_preview: body.slice(0, 120) }).eq('id', th.id)
      }
    } catch (e) {
      console.error('Purchase chat confirm error:', e)
    }
  }

  // ---- A BANK DEBIT FOR A CHECKOUT THAT ALREADY COMPLETED --------------
  // Added 2026-10-05. Only the Swim Assessment waits for these: it is
  // confirmed when the money settles and released if it never does. A points
  // top-up is credited at completion and taken back by
  // payment_intent.payment_failed, so nothing happens for one here.
  if (event.type === 'checkout.session.async_payment_succeeded' || event.type === 'checkout.session.async_payment_failed') {
    const session = event.data.object as Stripe.Checkout.Session
    if (session.metadata?.type === 'trial_lesson') {
      try {
        if (event.type === 'checkout.session.async_payment_succeeded') await confirmTrialBooking(supabase, session)
        else await failTrialBooking(supabase, session)
      } catch (e: any) {
        console.error(`${event.type} ${session.id}:`, e?.message || e)
        return NextResponse.json({ error: 'Trial booking update failed' }, { status: 500 })
      }
    }
    return NextResponse.json({ received: true })
  }

  // ---- A DISPUTE THE SCHOOL WON ------------------------------------------
  // The bank gave the money back, so the points taken at charge.dispute.created
  // should come back as PURCHASED points (found 2026-10-05: they never did).
  //
  // TODO(owner): not done automatically yet. No existing ledger reason fits:
  // 'purchase' would collide with the purchase already recorded for this
  // session and re-count it as new revenue; 'admin_grant' and the refund
  // reasons mislabel it and leave total_paid_cents short by the disputed
  // amount. It needs a new reason (e.g. 'chargeback_won') in
  // point_ledger_reason_check and lib/points-wallet.ts (LedgerReason, and
  // writeMovement adding amount_cents back to total_paid_cents), plus a
  // unique index per session. Until then, say so loudly so it is done by hand.
  if (event.type === 'charge.dispute.closed') {
    const dispute = event.data.object as Stripe.Dispute
    if (dispute.status === 'won') {
      const piId = typeof dispute.payment_intent === 'string' ? dispute.payment_intent : dispute.payment_intent?.id ?? null
      try {
        const cs = piId ? (await stripe.checkout.sessions.list({ payment_intent: piId, limit: 1 })).data[0] : null
        if (cs && cs.metadata?.kind === 'points' && cs.metadata?.parent_id) {
          const { data: rev } = await supabase.from('point_ledger')
            .select('delta_purchased, amount_cents').eq('stripe_session_id', cs.id).eq('reason', 'chargeback').limit(1)
          if (rev && rev.length > 0) {
            console.error(
              `\u26a0\ufe0f DISPUTE WON ${dispute.id}: restore ${-(Number(rev[0].delta_purchased) || 0)} purchased points ` +
              `($${((Number(rev[0].amount_cents) || 0) / 100).toFixed(2)}) to parent=${cs.metadata.parent_id} session=${cs.id} by hand -- ` +
              `no automatic re-credit until a 'chargeback_won' ledger reason exists`
            )
          }
        }
      } catch (e: any) {
        console.error(`charge.dispute.closed ${dispute.id}: could not resolve the checkout:`, e?.message)
      }
    }
    return NextResponse.json({ received: true })
  }

  // ---- A REFUND MADE IN THE STRIPE DASHBOARD ------------------------------
  // The site's own refunds (lib/refunds, the duplicate team subscription
  // below) carry metadata and are already handled where they are made. A
  // refund made by hand in Stripe used to change nothing here: the points
  // stayed spendable and the Sales page still counted the money (found
  // 2026-10-08). Owner's decision: do NOT take the points back automatically
  // -- tell the school (family, amount, points) and let a person decide. The
  // refunded amount is recorded on the purchase, so the Sales page marks it.
  if (event.type === 'charge.refunded') {
    const charge = event.data.object as Stripe.Charge
    try {
      await dashboardRefund(charge)
    } catch (e) {
      console.error(`charge.refunded ${charge.id}:`, e instanceof Error ? e.message : e)
      return NextResponse.json({ error: 'refund handling failed' }, { status: 503 })
    }
    return NextResponse.json({ received: true })
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
    // Same lookup as invoice.paid (found 2026-10-07): on this API version the
    // invoice has no top-level subscription, so reading only that left subId
    // empty and a failed Swim Team charge never showed as past_due.
    const subId = invoiceSubscriptionId(inv)
    if (subId) await supabase.from('team_memberships')
      .update({ status: 'past_due', updated_at: new Date().toISOString() })
      .eq('stripe_subscription_id', subId).eq('status', 'active')
    return NextResponse.json({ received: true })
  }

  if (event.type === 'invoice.paid') {
    const inv = event.data.object as any
    const subId = invoiceSubscriptionId(inv)
    if (subId) {
      await supabase.from('team_memberships')
        .update({ status: 'active', updated_at: new Date().toISOString() })
        .eq('stripe_subscription_id', subId).eq('status', 'past_due')

      // Mirror the paid Stripe invoice into our invoices table (MSA-branded PDF + Sales page)
      const { data: existing } = await supabase.from('invoices')
        .select('id').eq('stripe_payment_intent_id', inv.id).maybeSingle()
      if (!existing && (inv.amount_paid ?? 0) > 0) {
        const { data: tm } = await supabase.from('team_memberships')
          .select('id, student_id, team_tiers(name)')
          .eq('stripe_subscription_id', subId).maybeSingle()

        // The membership row is written by checkout.session.completed. Stripe
        // does not order events, so on a first payment invoice.paid can land
        // first and find nothing -- which used to drop that month's invoice
        // silently, with no error anywhere. Ask Stripe whether this
        // subscription is one of ours; if it is, fail the delivery so Stripe
        // retries once the other event has landed. Anything not ours passes
        // through, so an unrelated subscription can never retry forever.
        //
        // Except a subscription that is already over (found 2026-10-07): a
        // duplicate Swim Team subscription is cancelled and refunded by
        // cancelDuplicateTeamSubscription and deliberately never gets a row,
        // so waiting for one meant failing its first invoice.paid for Stripe's
        // whole ~3-day retry schedule. A cancelled subscription will not get a
        // row later, so log it and let the event go.
        if (!tm) {
          let ours = false
          let ended = false
          try {
            const sub = await stripe.subscriptions.retrieve(subId)
            ours = (sub.metadata as any)?.type === 'team_subscription'
            ended = sub.status === 'canceled' || sub.status === 'incomplete_expired'
          } catch (e: any) {
            console.error(`invoice.paid ${inv.id}: could not read subscription ${subId}:`, e?.message)
          }
          if (ours && ended) {
            console.error(`invoice.paid ${inv.id}: team subscription ${subId} is already cancelled and has no membership row (a cancelled duplicate) - not mirrored`)
            return NextResponse.json({ received: true })
          }
          if (ours) {
            console.error(`invoice.paid ${inv.id}: team subscription ${subId} has no membership row yet - asking Stripe to retry`)
            return NextResponse.json({ error: 'membership not ready' }, { status: 503 })
          }
        }

        if (tm) {
          const { data: stu } = await supabase.from('students')
            .select('full_name, parent_id').eq('id', tm.student_id).single()
          const tierName = (Array.isArray(tm.team_tiers) ? (tm.team_tiers as any)[0]?.name : (tm.team_tiers as any)?.name) || 'Swim Team'
          const period = inv.lines?.data?.[0]?.period
          const fmt = (sec: number) => new Date(sec * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
          const coverage = period?.start && period?.end ? ` \u00b7 ${fmt(period.start)} \u2013 ${fmt(period.end)}` : ''
          const amount = (inv.amount_paid ?? 0) / 100
          let created: any = null
          try {
            created = await insertInvoice(supabase, {
              parent_id: stu?.parent_id || null,
              student_id: tm.student_id,
              team_membership_id: tm.id,
              amount,
              payment_method: 'stripe',
              items: [{ name: `${tierName} \u00b7 Monthly Membership${stu?.full_name ? ` (${stu.full_name})` : ''}${coverage}`, quantity: 1, unit_price: amount, period_end: period?.end ? new Date(period.end * 1000).toISOString() : null }],
              status: 'paid',
              stripe_payment_intent_id: inv.id,
              issued_at: new Date().toISOString(),
            }, 'id, invoice_number')
          } catch (e: any) {
            // The subscription payment itself is settled. A missing mirror
            // costs the family a receipt, not their membership.
            console.error('Team invoice mirror insert error:', e?.message)
          }
          if (created) console.log(`Team invoice mirrored: ${created.invoice_number} (${created.id}) for ${subId}`)
        }
      }
    }
    return NextResponse.json({ received: true })
  }

  // ---- A CREDITED PAYMENT THAT DID NOT STAND UP ------------------------
  // Bank debits are not guaranteed. We credit points the moment checkout
  // completes because a family who has just paid expects to book tonight, and
  // the price of that choice is this branch: when Stripe tells us the money
  // came back out, the points have to come back out too.
  //
  // Two events, one path. payment_intent.payment_failed is the bank returning
  // the debit; charge.dispute.created is the customer's own bank reversing it
  // at their request.
  //
  // charge.dispute.funds_withdrawn (added 2026-10-05) is the moment a dispute
  // actually costs us money, which for an inquiry that escalates comes after
  // .created. Both land here; the one-reversal-per-session index makes the
  // second a no-op.
  if (event.type === 'payment_intent.payment_failed' || event.type === 'charge.dispute.created' || event.type === 'charge.dispute.funds_withdrawn') {
    const obj = event.data.object as any
    const isDispute = event.type !== 'payment_intent.payment_failed'
    const reason: ReversalReason = isDispute ? 'chargeback' : 'payment_failed'
    const paymentIntentId: string | null = isDispute
      ? (typeof obj.payment_intent === 'string' ? obj.payment_intent : obj.payment_intent?.id ?? null)
      : (obj.id ?? null)
    if (!paymentIntentId) return NextResponse.json({ received: true })

    // An inquiry (warning_*) is the bank asking a question; no money has moved
    // and most close with nothing owed. It used to take every point back and
    // release the family's lessons (found 2026-10-05).
    if (isDispute && String(obj.status || '').startsWith('warning_')) {
      console.log(`${event.type} ${obj.id}: inquiry (${obj.status}), nothing reversed`)
      return NextResponse.json({ received: true })
    }

    // Stripe does not order events. A payment_failed for an earlier attempt can
    // arrive after the payment went through, and reversing then takes back
    // points the family did pay for (found 2026-10-05). Ask Stripe where the
    // payment stands now; 'processing' is a newer attempt still on its way,
    // whose own failure would arrive as its own event.
    if (!isDispute) {
      try {
        const pi = await stripe.paymentIntents.retrieve(paymentIntentId, { expand: ['latest_charge'] })
        const lc = (pi as any).latest_charge
        const charge = lc && typeof lc === 'object' ? lc : null
        if (pi.status === 'succeeded' || pi.status === 'processing' || charge?.status === 'succeeded') {
          console.log(`payment_intent.payment_failed ${paymentIntentId}: payment is now ${pi.status}/${charge?.status ?? 'none'}, nothing reversed`)
          return NextResponse.json({ received: true })
        }
      } catch (e: any) {
        console.error(`payment_intent.payment_failed ${paymentIntentId}: could not read the payment intent:`, e?.message)
        return NextResponse.json({ error: 'could not read payment intent' }, { status: 503 })
      }
    }

    // Ask Stripe which checkout this was rather than reading our own tables:
    // the session id is the key the ledger was written under, and it is
    // available even in the case where the purchase row insert failed.
    let topUp: { sessionId: string; parentId: string; amountCents: number } | null = null
    let assessmentSessionId: string | null = null
    try {
      const list = await stripe.checkout.sessions.list({ payment_intent: paymentIntentId, limit: 1 })
      const cs = list.data[0]
      if (cs && cs.metadata?.kind === 'points' && cs.metadata?.parent_id) {
        topUp = { sessionId: cs.id, parentId: cs.metadata.parent_id, amountCents: cs.amount_total ?? 0 }
      } else if (cs && cs.metadata?.type === 'trial_lesson') {
        assessmentSessionId = cs.id
      }
    } catch (e: any) {
      // Without the session we cannot safely reverse anything. Fail the
      // delivery so Stripe brings it back rather than losing it silently.
      console.error(`${event.type} ${paymentIntentId}: could not read the checkout session:`, e?.message)
      return NextResponse.json({ error: 'could not resolve session' }, { status: 503 })
    }

    // A front-desk card sale (Stripe Terminal) has no Checkout Session: the
    // POS routes write the purchase under the payment intent id instead. A
    // chargeback on one used to reverse nothing and leave the refundable
    // points in the wallet (found 2026-10-06).
    let terminalSale = false
    if (!topUp) {
      const { data: posRow, error: posErr } = await supabase
        .from('point_ledger').select('parent_id, amount_cents')
        .eq('stripe_session_id', paymentIntentId).eq('reason', 'purchase').limit(1)
      if (posErr) {
        console.error(`${event.type} ${paymentIntentId}: could not look up a desk sale:`, posErr)
        return NextResponse.json({ error: 'could not resolve desk sale' }, { status: 503 })
      }
      const row = posRow && posRow[0]
      if (row && row.parent_id && Number(row.amount_cents) > 0) {
        topUp = { sessionId: paymentIntentId, parentId: row.parent_id, amountCents: Number(row.amount_cents) }
        terminalSale = true
      }
    }

    // A Swim Assessment charged back (online, or by card at the desk): no
    // points to take back, but its 85-point assessment credit must not be
    // paid out for it, and the school has to know (owner, 2026-10-08). It
    // used to be ignored entirely.
    if (!topUp && isDispute) {
      const r = await assessmentChargeback(paymentIntentId, assessmentSessionId, obj)
      if (r) return r
    }

    // A card decline during checkout, a team subscription: neither put points
    // in a wallet, so there is nothing to take back.
    if (!topUp || topUp.amountCents <= 0) return NextResponse.json({ received: true })

    // A dispute can be for part of the payment; take back only that part, in
    // whole dollars (points are whole dollars), rounded down in the family's
    // favour (found 2026-10-05: the whole checkout was always reversed).
    const reverseCents = isDispute
      ? Math.floor(Math.min(Number(obj.amount) || 0, topUp.amountCents) / 100) * 100
      : topUp.amountCents
    if (reverseCents <= 0) return NextResponse.json({ received: true })
    if (!(await purchaseAlreadyCredited(supabase, topUp.sessionId))) {
      console.log(`${event.type}: session ${topUp.sessionId} was never credited, nothing to reverse`)
      return NextResponse.json({ received: true })
    }
    if (await purchaseAlreadyReversed(supabase, topUp.sessionId)) {
      console.log(`\u21a9\ufe0e session ${topUp.sessionId} was already reversed`)
      return NextResponse.json({ received: true })
    }

    const note = reason === 'chargeback'
      ? `Customer disputed payment ${paymentIntentId} with their bank`
      : `Bank returned payment ${paymentIntentId}`

    try {
      await reversePurchase(supabase, {
        parentId: topUp.parentId,
        amountCents: reverseCents,
        stripeSessionId: topUp.sessionId,
        reason,
        note,
      })
    } catch (e) {
      if (e instanceof DuplicateLedgerEntry) {
        return NextResponse.json({ received: true })
      }
      // The points are still out there. Let Stripe redeliver.
      console.error(`${event.type}: reversal failed for session ${topUp.sessionId}:`, e)
      return NextResponse.json({ error: 'reversal failed' }, { status: 500 })
    }

    // The points are already back; this marks the payment itself, which the
    // Sales page and the finance page read. A failure used to be dropped
    // silently, leaving the payment counted as revenue (found 2026-10-08):
    // the alert names it so a person can mark it.
    const { error: markErr } = await supabase.from('purchases')
      .update({ reversed_at: new Date().toISOString(), reversal_reason: reason })
      .eq(terminalSale ? 'stripe_payment_intent_id' : 'stripe_session_id', topUp.sessionId)
      .is('reversed_at', null)
    if (markErr) {
      console.error(`${event.type}: could not mark purchase ${topUp.sessionId} reversed:`, markErr.message)
      await alertAdmin('Reversed payment not marked', [
        `The points for payment ${topUp.sessionId} ($${(reverseCents / 100).toFixed(2)}, parent ${topUp.parentId}) were taken back after ${reason === 'chargeback' ? 'a chargeback' : 'a bank return'}, but the payment itself could not be marked as reversed (${markErr.message}).`,
        'Until it is, the Sales and finance pages still count it as revenue.',
      ])
    }

    // Give back the lessons they have not swum, which pays down most of the
    // debt on its own. Anything left is for a human to chase.
    let reclaimed = { arrearsAfter: 0, cancelledBookingIds: [] as string[], lessonsReleased: 0, pointsReturned: 0, released: [] as ReleasedLesson[] }
    try {
      reclaimed = await reclaimForArrears(supabase, topUp.parentId, note)
    } catch (e) {
      console.error(`${event.type}: could not release lessons for parent ${topUp.parentId}:`, e)
    }

    console.error(
      `\u26a0\ufe0f PAYMENT REVERSED (${reason}) parent=${topUp.parentId} ` +
      `session=${topUp.sessionId} amount=$${(reverseCents / 100).toFixed(2)} of $${(topUp.amountCents / 100).toFixed(2)} ` +
      `released=${reclaimed.lessonsReleased} lessons (${reclaimed.cancelledBookingIds.length} bookings, ${reclaimed.pointsReturned} pts) ` +
      `still owed=${reclaimed.arrearsAfter} pts`
    )

    // Tell the family. Best-effort on purpose -- the money side is already
    // recorded, and a mail failure must not have Stripe redeliver the event.
    try {
      const { data: parentRow } = await supabase
        .from('parents').select('first_name, email, preferred_language').eq('id', topUp.parentId).single()
      if (parentRow?.email) {
        await sendEmail({
          type: 'payment_reversed',
          to: parentRow.email,
          parentName: parentRow.first_name || 'there',
          amount: reverseCents / 100,
          pointsOwed: reclaimed.arrearsAfter,
          lessonsReleased: reclaimed.lessonsReleased,
          releasedLessons: reclaimed.released,
          reversalKind: reason,
        })
      }
      const { data: th } = await supabase.from('chat_threads').select('id')
        .eq('parent_id', topUp.parentId).order('created_at', { ascending: true }).limit(1).maybeSingle()
      if (th) {
        // In the family's language like the purchase confirmation above, with
        // the cause matching the email (a chargeback is not "didn't complete
        // at the bank") and the released lessons named -- no separate
        // cancellation notice goes out for them (found 2026-10-07).
        const lang = String(parentRow?.preferred_language || 'en')
        const dollars = (reverseCents / 100).toFixed(2)
        const owedPts = reclaimed.arrearsAfter.toLocaleString('en-US')
        const n = reclaimed.lessonsReleased
        const chargeback = reason === 'chargeback'
        const dateTag = lang === 'zh-Hant' ? 'zh-TW' : lang === 'zh-Hans' ? 'zh-CN' : 'en-US'
        const lessonLines = reclaimed.released.map(l => {
          const d = new Date(l.date + 'T12:00:00Z').toLocaleDateString(dateTag, { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })
          const who = l.studentNames.join(lang === 'en' ? ' & ' : '、')
          return `• ${d} ${formatTime12h(l.time)}${who ? ` — ${who}` : ''}`
        }).join('\n')
        let body: string
        if (lang === 'zh-Hant') {
          body = (chargeback
            ? `您已透過銀行撤回 $${dollars} 的付款，所以這筆點數已從您的帳戶扣回。`
            : `您 $${dollars} 的付款銀行沒有完成，所以這筆點數已從您的帳戶扣回。`)
            + (n > 0 ? `\n\n我們已取消 ${n} 堂您還沒上的課，並退回那些點數。以下課程不會進行：\n${lessonLines}` : '')
            + `\n\n${reclaimed.arrearsAfter > 0 ? `您的點數目前不足 ${owedPts} 點，結清之前無法預約。` : '目前已沒有欠款，可以直接預約。'}`
            + '\n\n在「我的頁面」的點數區用信用卡補上欠款即可馬上結清（最少 $50，多付的會留作點數）。如果您認為有誤，直接在這裡回覆我們。'
        } else if (lang === 'zh-Hans') {
          body = (chargeback
            ? `您已通过银行撤回 $${dollars} 的付款，所以这笔点数已从您的账户扣回。`
            : `您 $${dollars} 的付款银行没有完成，所以这笔点数已从您的账户扣回。`)
            + (n > 0 ? `\n\n我们已取消 ${n} 堂您还没上的课，并退回那些点数。以下课程不会进行：\n${lessonLines}` : '')
            + `\n\n${reclaimed.arrearsAfter > 0 ? `您的点数目前不足 ${owedPts} 点，结清之前无法预约。` : '目前已没有欠款，可以直接预约。'}`
            + '\n\n在「我的页面」的点数区用信用卡补上欠款即可马上结清（最少 $50，多付的会留作点数）。如果您认为有误，直接在这里回复我们。'
        } else {
          body = (chargeback
            ? `Your bank has reversed your $${dollars} payment at your request, so those points have been removed from your wallet.`
            : `Your $${dollars} payment didn't complete at the bank, so those points have been removed from your wallet.`)
            + (n > 0 ? `\n\nWe've cancelled ${n} lesson${n === 1 ? '' : 's'} you hadn't taken yet and returned those points. These lessons will not take place:\n${lessonLines}` : '')
            + `\n\n${reclaimed.arrearsAfter > 0 ? `Your balance is now ${owedPts} points short, so booking is paused until it's settled.` : 'Nothing further is owed and you can book again straight away.'}`
            + '\n\nPaying what you owe by card from the points card on your Dashboard clears this right away (at least $50; anything extra stays as points). If you think this is a mistake, just reply here.'
        }
        await supabase.from('chat_messages').insert({ thread_id: th.id, sender_type: 'ai', body })
        await supabase.from('chat_threads')
          .update({ last_message_at: new Date().toISOString(), last_message_preview: body.slice(0, 120) })
          .eq('id', th.id)
      }
    } catch (e) {
      console.error('Payment reversal notice failed:', e)
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

/** The subscription an invoice belongs to. On API version 2026-05-27.dahlia
 *  the id sits under parent.subscription_details; the top-level field is read
 *  first for older payloads. invoice.paid and invoice.payment_failed must
 *  agree on this, so both call it (found 2026-10-07). */
function invoiceSubscriptionId(inv: any): string | null {
  if (typeof inv?.subscription === 'string') return inv.subscription
  const nested = inv?.parent?.subscription_details?.subscription
  return inv?.subscription?.id || (typeof nested === 'string' ? nested : nested?.id) || null
}

/* A second Swim Team subscription for a swimmer who already has one: cancel
   it at once, refund what it charged, and tell the school (owner,
   2026-10-06). Best effort on every step -- whatever could not be done is
   named in the alert, so a person finishes it. */
async function cancelDuplicateTeamSubscription(session: Stripe.Checkout.Session, keptSubscriptionId: string) {
  const meta = session.metadata || {}
  const dupSub = String(session.subscription || '')
  const lines: string[] = []
  let cancelled = false
  try {
    // Casts: in the SDK and Stripe's API, but not in the types this project's
    // type check resolves (the same gap app/api/stripe/checkout notes).
    await (stripe.subscriptions as any).cancel(dupSub)
    cancelled = true
  } catch (e: any) {
    lines.push(`Could not cancel subscription ${dupSub} (${e?.message || 'error'}). Cancel it in the Stripe dashboard.`)
  }
  let refunded = 0
  let pending = false
  const inv0 = (session as any).invoice
  const invoiceId: string | null = typeof inv0 === 'string' ? inv0 : inv0?.id ?? null
  if (invoiceId) {
    try {
      const inv = await stripe.invoices.retrieve(invoiceId, { expand: ['payments'] })
      for (const p of (inv as any).payments?.data || []) {
        const piRef = p?.payment?.payment_intent
        const pi = typeof piRef === 'string' ? piRef : piRef?.id
        if (!pi) continue
        if (p.status === 'paid') {
          // Marked as the site's own, so charge.refunded does not report it
          // as a refund someone made by hand.
          const r = await stripe.refunds.create({ payment_intent: pi, metadata: { msa_source: 'duplicate_team_subscription' } })
          refunded += r.amount || 0
        } else {
          pending = true
        }
      }
    } catch (e: any) {
      lines.push(`Could not refund invoice ${invoiceId} (${e?.message || 'error'}). Refund it in the Stripe dashboard.`)
    }
  }
  console.error(`\u26a0\ufe0f DUPLICATE TEAM SUBSCRIPTION student=${meta.student_id} kept=${keptSubscriptionId} duplicate=${dupSub} cancelled=${cancelled} refunded=${refunded}`)
  try {
    const { data: st } = await supabase.from('students').select('full_name').eq('id', meta.student_id).maybeSingle()
    await sendEmail({
      type: 'admin_alert',
      to: process.env.ADMIN_ALERT_EMAIL || 'info@mantasharkaquatics.net',
      alertTitle: 'Duplicate Swim Team subscription cancelled',
      alertLines: [
        `${st?.full_name || 'A swimmer'} already had a Swim Team subscription (${keptSubscriptionId}), and a second checkout was paid (${dupSub}).`,
        cancelled ? 'The second subscription was cancelled.' : 'The second subscription could NOT be cancelled automatically.',
        refunded > 0 ? `$${(refunded / 100).toFixed(2)} was refunded to the family.` : pending ? 'Its payment is still clearing (bank debit). Refund it in Stripe once it has cleared.' : 'No payment was found to refund.',
        ...lines,
      ],
    })
  } catch (e) {
    console.error('duplicate-subscription alert failed:', e)
  }
}

/* A Swim Assessment payment charged back (owner, 2026-10-08). Found by its
   checkout session (online) or its payment intent (card at the desk). The
   purchase is marked reversed -- which is what settleAssessmentCredits reads,
   so the 85-point assessment credit is never paid for it -- the credit is
   closed if it is still open, and the school is told once (the first event
   that marks the purchase; charge.dispute.funds_withdrawn after .created finds
   it marked). Returns null when the payment is not an assessment. */
async function assessmentChargeback(paymentIntentId: string, sessionId: string | null, dispute: { id?: string; amount?: number }): Promise<NextResponse | null> {
  const { data: rows, error } = await supabase.from('purchases')
    .select('id, parent_id, amount_cents, reversed_at, stripe_session_id')
    .or(`stripe_payment_intent_id.eq.${paymentIntentId}${sessionId ? `,stripe_session_id.eq.${sessionId}` : ''}`)
  if (error) {
    console.error(`dispute ${dispute?.id}: could not look up the assessment payment:`, error.message)
    return NextResponse.json({ error: 'could not resolve assessment' }, { status: 503 })
  }
  const purchaseIds = (rows || []).map(r => r.id)
  const { data: credits, error: creditErr } = purchaseIds.length
    ? await supabase.from('lesson_credits').select('student_id, purchase_id').in('purchase_id', purchaseIds).eq('is_trial', true)
    : { data: [] as { student_id: string; purchase_id: string }[], error: null }
  if (creditErr) {
    console.error(`dispute ${dispute?.id}: could not look up the assessment credit:`, creditErr.message)
    return NextResponse.json({ error: 'could not resolve assessment' }, { status: 503 })
  }
  // Not an assessment: neither an assessment checkout nor a desk sale with an
  // assessment credit.
  if (!sessionId && (!credits || credits.length === 0)) return null

  const { data: marked, error: markErr } = purchaseIds.length
    ? await supabase.from('purchases')
        .update({ reversed_at: new Date().toISOString(), reversal_reason: 'chargeback' })
        .in('id', purchaseIds).is('reversed_at', null).select('id')
    : { data: [] as { id: string }[], error: null }
  if (markErr) {
    console.error(`dispute ${dispute?.id}: could not mark the assessment payment reversed:`, markErr.message)
    return NextResponse.json({ error: 'could not mark assessment' }, { status: 503 })
  }
  // An earlier delivery already did all of this.
  if (purchaseIds.length > 0 && (!marked || marked.length === 0)) return NextResponse.json({ received: true })

  const studentIds = [...new Set((credits || []).map(c => c.student_id).filter(Boolean))]
  let creditState = 'no assessment report yet (the credit will not be paid when one is made)'
  if (studentIds.length > 0) {
    const { data: rep } = await supabase.from('student_assessments')
      .select('student_id, credit_status, credit_awarded_at').in('student_id', studentIds)
    const { error: closeErr } = await supabase.from('student_assessments')
      .update({ credit_status: 'expired' }).in('student_id', studentIds).eq('credit_status', 'pending')
    if (closeErr) console.error(`dispute ${dispute?.id}: could not close the assessment credit (settleAssessmentCredits still skips it):`, closeErr.message)
    const r0 = (rep || [])[0]
    if (r0?.credit_status === 'awarded') creditState = `the 85-point assessment credit was ALREADY GIVEN${r0.credit_awarded_at ? ` on ${String(r0.credit_awarded_at).slice(0, 10)}` : ''} -- take it back by hand if you decide to`
    else if (r0) creditState = 'the 85-point assessment credit has been cancelled'
  }

  const parentId = rows?.[0]?.parent_id || null
  const [{ data: parent }, { data: students }] = await Promise.all([
    parentId ? supabase.from('parents').select('first_name, last_name, email').eq('id', parentId).maybeSingle() : Promise.resolve({ data: null }),
    studentIds.length ? supabase.from('students').select('full_name').in('id', studentIds) : Promise.resolve({ data: [] as { full_name: string | null }[] }),
  ])
  const family = parent ? `${parent.first_name || ''} ${parent.last_name || ''}`.trim() + (parent.email ? ` (${parent.email})` : '') : (parentId ? `parent ${parentId}` : 'an unknown family')
  const who = (students || []).map(x => x.full_name).filter(Boolean).join(', ') || 'a swimmer'
  console.error(`\u26a0\ufe0f ASSESSMENT CHARGEBACK dispute=${dispute?.id} payment=${paymentIntentId} purchases=${purchaseIds.join(',') || 'none'}`)
  await alertAdmin('Swim Assessment payment disputed', [
    `${family} disputed the Swim Assessment payment for ${who} with their bank ($${((Number(dispute?.amount) || 0) / 100).toFixed(2)}, dispute ${dispute?.id || 'unknown'}, payment ${paymentIntentId}).`,
    purchaseIds.length ? 'The payment is now marked as disputed: it is left out of the Sales total and earns no assessment credit.' : 'No purchase record was found for this payment, so nothing could be marked -- check it by hand.',
    `Assessment credit: ${creditState}.`,
    'Respond to the dispute in the Stripe dashboard.',
  ])
  return NextResponse.json({ received: true })
}

/* After a Swim Assessment payment is refunded in full in the Stripe dashboard:
   close the swimmer's open assessment credit, unless another assessment
   payment of theirs still stands. Returns a line for the alert. Never throws:
   settleAssessmentCredits skips the credit anyway (assessmentPaymentReversed
   reads refunded_cents). */
async function closeRefundedAssessmentCredit(purchaseId: string): Promise<string> {
  try {
    const { data: credits, error } = await supabase.from('lesson_credits')
      .select('student_id').eq('purchase_id', purchaseId).eq('is_trial', true)
    if (error) throw new Error(error.message)
    const studentIds = [...new Set((credits || []).map(c => c.student_id).filter(Boolean))] as string[]
    if (studentIds.length === 0) return 'no assessment credit is linked to this payment'
    const out: string[] = []
    for (const sid of studentIds) {
      if (!(await assessmentPaymentReversed(supabase, sid))) {
        out.push('this swimmer has another assessment payment that was not refunded, so the credit was left as it is')
        continue
      }
      const { data: rep, error: repErr } = await supabase.from('student_assessments')
        .select('credit_status, credit_awarded_at').eq('student_id', sid)
      if (repErr) throw new Error(repErr.message)
      const { error: closeErr } = await supabase.from('student_assessments')
        .update({ credit_status: 'expired' }).eq('student_id', sid).eq('credit_status', 'pending')
      if (closeErr) throw new Error(closeErr.message)
      const r0 = (rep || [])[0]
      out.push(r0?.credit_status === 'awarded'
        ? `the 85-point assessment credit was ALREADY GIVEN${r0.credit_awarded_at ? ` on ${String(r0.credit_awarded_at).slice(0, 10)}` : ''} and was NOT taken back -- deduct it by hand on the family's points page if you decide to`
        : r0 ? 'the 85-point assessment credit has been cancelled'
        : 'no assessment report yet (the credit will not be paid when one is made)')
    }
    return out.join('; ')
  } catch (e) {
    console.error(`purchase ${purchaseId}: could not close the refunded assessment credit (settleAssessmentCredits still skips it):`, e instanceof Error ? e.message : e)
    return 'could not be checked (it will still not be paid, since the payment is marked refunded) -- if it was already given, decide by hand whether to deduct it'
  }
}

/* charge.refunded for a refund not made by the site (see the handler). */
async function dashboardRefund(charge: Stripe.Charge) {
  const piId = typeof charge.payment_intent === 'string' ? charge.payment_intent : charge.payment_intent?.id ?? null
  if (!piId) return
  const refunds = (await stripe.refunds.list({ charge: charge.id, limit: 100 })).data
  const byHand = refunds.filter(r => !r.metadata?.ledger_id && !r.metadata?.msa_source && r.status !== 'failed' && r.status !== 'canceled')
  if (byHand.length === 0) return

  // What was bought: a points top-up or an assessment online (checkout
  // session), or a desk card sale (purchase under the payment intent).
  const cs = (await stripe.checkout.sessions.list({ payment_intent: piId, limit: 1 })).data[0] || null
  const kind = cs?.metadata?.kind === 'points' ? 'points' : cs?.metadata?.type === 'trial_lesson' ? 'assessment' : cs ? 'other' : 'desk'
  if (kind === 'other') return // a Swim Team subscription or anything else: not covered here
  const { data: rows, error } = await supabase.from('purchases')
    .select('id, parent_id, amount_cents, refunded_cents, lesson_package_id')
    .or(`stripe_payment_intent_id.eq.${piId}${cs ? `,stripe_session_id.eq.${cs.id}` : ''}`)
    .limit(1)
  if (error) throw new Error('purchase lookup: ' + error.message)
  const p = rows?.[0] || null
  if (!p && kind === 'desk') return // a card payment the site never recorded

  // Record how much went back, so the Sales page marks it. Charge-wide and
  // cumulative, so a repeated delivery writes the same number.
  const refundedCents = Math.min(Number(p?.amount_cents) || 0, charge.amount_refunded || 0)
  let recorded = false
  if (p && refundedCents > (Number(p.refunded_cents) || 0)) {
    const { error: upErr } = await supabase.from('purchases')
      .update({ refunded_cents: refundedCents }).eq('id', p.id).eq('refunded_cents', Number(p.refunded_cents) || 0)
    if (upErr) throw new Error('purchase refund mark: ' + upErr.message)
    recorded = true
  } else if (p) {
    // Already recorded by an earlier delivery: the school was told then.
    return
  }

  // Which family, and what the points side looks like.
  const parentId = p?.parent_id || cs?.metadata?.parent_id || null
  const { data: parent } = parentId
    ? await supabase.from('parents').select('first_name, last_name, email').eq('id', parentId).maybeSingle()
    : { data: null }
  const family = parent ? `${parent.first_name || ''} ${parent.last_name || ''}`.trim() + (parent.email ? ` (${parent.email})` : '') : (parentId ? `parent ${parentId}` : 'an unknown family')
  const thisTime = byHand.reduce((a, r) => a + (r.amount || 0), 0)
  const lines = [
    `${family}: $${(thisTime / 100).toFixed(2)} was refunded in the Stripe dashboard (payment ${piId}${cs ? `, checkout ${cs.id}` : ''}; $${((charge.amount_refunded || 0) / 100).toFixed(2)} of $${((charge.amount || 0) / 100).toFixed(2)} refunded in all).`,
  ]
  let isPoints = kind === 'points'
  let isAssessment = kind === 'assessment'
  if (kind === 'desk' && p) {
    // A desk sale of points has a purchase ledger line; an assessment has a credit.
    const [{ data: led }, { data: cr }] = await Promise.all([
      supabase.from('point_ledger').select('id').eq('reason', 'purchase').eq('stripe_session_id', piId).limit(1),
      supabase.from('lesson_credits').select('id').eq('purchase_id', p.id).eq('is_trial', true).limit(1),
    ])
    isPoints = !!(led && led.length > 0)
    isAssessment = !isPoints && !!(cr && cr.length > 0)
  }
  if (isPoints) {
    const pts = Math.floor((charge.amount_refunded || 0) / 100)
    lines.push(`This was a points purchase of ${Math.round((Number(p?.amount_cents) || charge.amount || 0) / 100)} points. The ${pts} refunded points were NOT taken out of the family's wallet. If they should be, deduct them by hand on the family's points page.`)
  } else if (!isAssessment) {
    lines.push('This was a front-desk card sale that is neither points nor a Swim Assessment; nothing else was changed.')
  } else {
    lines.push('This was a Swim Assessment payment.')
    // A full refund of an assessment that has not been booked yet removes the
    // prepaid assessment, so it cannot be booked for free afterwards.
    if (p && (charge.amount_refunded || 0) >= (charge.amount || 0)) {
      const { data: voided } = await supabase.from('lesson_credits')
        .update({ used_credits: 1 }).eq('purchase_id', p.id).eq('is_trial', true).eq('used_credits', 0).select('id')
      lines.push(voided && voided.length > 0
        ? 'Its prepaid assessment had not been booked yet; it has been removed from the account.'
        : 'If the assessment is still booked, cancel it by hand if that was intended.')
      // Refunded in full means the assessment was not paid for, so it earns
      // no 85-point assessment credit (owner, 2026-10-08), as with a
      // chargeback. The refunded_cents written above is what
      // settleAssessmentCredits reads; an open credit is also closed here.
      // Points already given are never taken back automatically -- say so.
      lines.push(`Assessment credit: ${await closeRefundedAssessmentCredit(p.id)}.`)
    }
  }
  lines.push(recorded ? 'The Sales page now shows this payment as refunded.' : 'No purchase record was found, so the Sales page could not be updated.')
  await alertAdmin('Refund made in the Stripe dashboard', lines)
}
