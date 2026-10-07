import { sendEmail } from '@/lib/email'
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { insertInvoice } from '@/lib/invoices/create'
import { checkTrialSale, invoicePaymentLabel, TRIAL_PRICE_CENTS } from '@/lib/pos/sale-checks'

// How old a claimed-but-unsold assessment must be before a card sale's
// "record it again" takes it over (see below).
const ORPHAN_AFTER_MS = 90_000

// A Swim Assessment sold at the desk: the $85 purchase, and the assessment
// credit the family books with from their dashboard.
//
// Order matters, because the card has already been charged when this runs.
// The assessment is claimed first (trial_used_at, set only if still empty, so
// two presses cannot both sell it); then the purchase and the credit are
// written, each checked. If either fails, what was written is undone and the
// claim is given back, so the same request can simply be sent again. This
// used to set trial_used_at, ignore a failed purchase insert, only log a
// failed credit and report success anyway -- the family had paid, had no
// credit, and could not book the assessment online either (found 2026-10-05).

export async function POST(req: NextRequest) {
  try {
    const { parentId, studentId, paymentMethod, paymentIntentId } = await req.json()

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

    // A card payment is recorded once. complete-sale and complete-sdp-sale key
    // on the payment intent the same way. Checked BEFORE the sale checks: once
    // recorded, the swimmer's assessment is used, so a "record again" after a
    // lost answer used to be refused as "already used" instead of being told
    // it was done (found 2026-10-07).
    if (paymentIntentId) {
      const { data: seen } = await supabase
        .from('purchases').select('id').eq('stripe_payment_intent_id', paymentIntentId).limit(1)
      if (seen && seen.length) {
        // Done only if its assessment credit exists too: a purchase left
        // without one (see below) is not a finished sale, and the desk screen
        // treats "already recorded" as finished.
        const { data: credit } = await supabase
          .from('lesson_credits').select('id').eq('purchase_id', seen[0].id).eq('is_trial', true).limit(1)
        if (credit && credit.length)
          return NextResponse.json({ error: 'This payment has already been recorded.', alreadyRecorded: true }, { status: 409 })
        return NextResponse.json({
          error: 'The payment was recorded but the assessment credit was not created. Do not take payment again — ask the owner to add the credit.',
          purchaseId: seen[0].id,
        }, { status: 409 })
      }
    }

    // A card sale cut off between claiming the assessment and writing the
    // purchase (a timeout) left trial_used_at set with nothing sold, so
    // "record it again" was refused as "already used" and the desk was told
    // to refund -- and the swimmer could never buy an assessment after that
    // (found 2026-10-07). Such a claim is taken over: no assessment credit for
    // this swimmer anywhere (every sale, online or at the desk, writes one)
    // and no live assessment booking. A claim younger than ORPHAN_AFTER_MS may
    // still be the first request at work, so the desk is asked to wait.
    if (paymentIntentId) {
      const { data: st } = await supabase.from('students').select('trial_used_at, parent_id, current_level').eq('id', studentId).maybeSingle()
      // Only a swimmer this sale could be for at all: the family's, not yet
      // assessed. Anything else is refused below without touching the record.
      if (st?.trial_used_at && st.parent_id === parentId && st.current_level == null) {
        const [{ data: credits }, { data: live }] = await Promise.all([
          supabase.from('lesson_credits').select('id').eq('student_id', studentId).eq('is_trial', true).limit(1),
          supabase.from('bookings').select('id').eq('student_id', studentId).eq('is_trial', true).neq('status', 'cancelled').limit(1),
        ])
        if ((credits || []).length === 0 && (live || []).length === 0) {
          if (Date.now() - Date.parse(st.trial_used_at) < ORPHAN_AFTER_MS)
            return NextResponse.json({ error: 'This sale may still be being recorded. Wait a minute, then record it again. Do not take payment again.', retryable: true }, { status: 409 })
          await supabase.from('students').update({ trial_used_at: null }).eq('id', studentId).eq('trial_used_at', st.trial_used_at)
        }
      }
    }

    // The card has already been charged when this runs for a terminal sale,
    // so a refusal must say so, as complete-team-sale does: a plain "already
    // has an assessment" (another desk or the parent booked one while the
    // reader was busy) used to look like nothing happened (found 2026-10-07).
    const chargedRefusal = (why: string) =>
      `The card was charged, but this sale cannot be recorded: ${why.replace(/\.?$/, '.')} Do not charge again. Refund the payment from the Stripe dashboard.`

    // Who, and whether this swimmer can have an assessment at all -- the same
    // checks the terminal PaymentIntent was made under (lib/pos/sale-checks),
    // including that the swimmer belongs to this family.
    const sale = await checkTrialSale(supabase, { parentId, studentId })
    if (!sale.ok) return NextResponse.json({ error: paymentIntentId ? chargedRefusal(sale.error) : sale.error }, { status: sale.status })

    const notRecorded = 'The payment was taken but the Swim Assessment was not recorded. Do not take payment again — record it again with the button below.'

    // Claim the assessment. The condition is what stops a second sale racing
    // this one; the check above only read it.
    const claimedAt = new Date().toISOString()
    const { data: claimed, error: claimErr } = await supabase
      .from('students').update({ trial_used_at: claimedAt })
      .eq('id', studentId).is('trial_used_at', null).select('id')
    if (claimErr) {
      console.error('POS trial claim error:', claimErr)
      return NextResponse.json({ error: notRecorded, retryable: true }, { status: 500 })
    }
    if (!claimed || claimed.length === 0) {
      // Two "record again" presses at once: the other one may have just
      // recorded this very payment.
      if (paymentIntentId) {
        const { data: done } = await supabase.from('purchases').select('id').eq('stripe_payment_intent_id', paymentIntentId).limit(1)
        if (done && done.length)
          return NextResponse.json({ error: 'This payment is still being recorded. Do not take payment again — wait a minute, then record it again with the button below.', retryable: true }, { status: 409 })
      }
      const used = 'This student has already used their Swim Assessment.'
      return NextResponse.json({ error: paymentIntentId ? chargedRefusal(used) : used }, { status: 409 })
    }
    // Gives the claim back -- only if it is still this request's.
    const releaseClaim = () => supabase.from('students').update({ trial_used_at: null })
      .eq('id', studentId).eq('trial_used_at', claimedAt)

    const insertData: Record<string, unknown> = {
      parent_id: parentId,
      lesson_package_id: null,
      amount_cents: TRIAL_PRICE_CENTS,
      status: 'paid',
      paid_at: new Date().toISOString(),
      payment_method: paymentMethod,
      recorded_by: user.id,
    }
    if (paymentIntentId) insertData.stripe_payment_intent_id = paymentIntentId

    const { data: purchase, error: purchaseErr } = await supabase.from('purchases').insert(insertData).select().single()
    if (purchaseErr || !purchase) {
      console.error('POS trial purchase error:', purchaseErr)
      await releaseClaim()
      return NextResponse.json({ error: notRecorded, retryable: true }, { status: 500 })
    }

    // Create the assessment credit — visible on parent dashboard, consumed when booked
    const { data: ct1on1 } = await supabase.from('course_types').select('id').eq('slug', '1on1').single()
    const expiresAt = new Date()
    expiresAt.setFullYear(expiresAt.getFullYear() + 1)
    const { data: trialCredit, error: creditErr } = await supabase.from('lesson_credits').insert({
      student_id: studentId,
      parent_id: parentId,
      purchase_id: purchase.id,
      course_type_id: ct1on1?.id || null,
      total_credits: 1,
      used_credits: 0,
      is_trial: true,
      expires_at: expiresAt.toISOString(),
    }).select().single()
    if (creditErr || !trialCredit) {
      console.error('POS trial credit insert error:', creditErr)
      // Undo the purchase so the same request can be sent again; a purchase
      // left behind would trip the payment-intent guard above.
      const { error: delErr } = await supabase.from('purchases').delete().eq('id', purchase.id)
      if (delErr) {
        console.error(`\u26a0\ufe0f POS trial: purchase ${purchase.id} has no assessment credit and could not be removed:`, delErr)
        // The assessment stays claimed: the purchase is real, and the credit
        // is what has to be added by hand.
        return NextResponse.json({
          error: 'The payment was recorded but the assessment credit was not created. Do not take payment again — ask the owner to add the credit.',
          purchaseId: purchase.id,
        }, { status: 500 })
      }
      await releaseClaim()
      return NextResponse.json({ error: notRecorded, retryable: true }, { status: 500 })
    }

    // Create invoice
    try {
      const { data: parentData } = await supabase.from('parents').select('first_name, last_name, email').eq('id', parentId).single()
      const studentData = sale.student
      const inv = await insertInvoice(supabase, {
        parent_id: parentId,
        lesson_credit_id: trialCredit.id,
        amount: 85,
        payment_method: invoicePaymentLabel(paymentMethod),
        items: [{ name: `Swim Assessment - ${studentData?.full_name || ''}`, quantity: 1, unit_price: 85 }],
        status: 'sent',
        stripe_payment_intent_id: paymentIntentId || null,
        issued_at: new Date().toISOString(),
      })
      if (parentData && inv) {
        await sendEmail({
            type: 'invoice',
            to: parentData.email,
            parentName: parentData.first_name,
            invoiceNumber: inv.invoice_number,
            invoiceUrl: `${process.env.NEXT_PUBLIC_APP_URL || 'https://www.mantasharkaquatics.net'}/api/invoices/${inv.id}/pdf`,
            amount: '85.00',
            items: [{ name: `Swim Assessment - ${studentData?.full_name || ''}`, quantity: 1, unit_price: 85 }],
            paymentMethod: invoicePaymentLabel(paymentMethod),
          })
      }
    } catch (e) { console.error('Trial invoice/email error:', e) }

    console.log(`✅ POS trial purchase: student=${studentId} parent=${parentId} method=${paymentMethod}`)
    return NextResponse.json({ success: true, purchaseId: purchase.id })
  } catch (err: any) {
    console.error('POS complete-trial-sale error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
