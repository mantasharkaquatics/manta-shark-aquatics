import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { insertInvoice } from '@/lib/invoices/create'
import { checkTeamSale, invoicePaymentLabel } from '@/lib/pos/sale-checks'

// POS prepaid team membership sale: buy N months upfront (cash or terminal one-off).
// Rules (owner 2026-07-22): one track per student (block if active subscription);
// renewal extends from current expiry, never resets; one invoice per purchase with coverage dates.
// How recently an identical cash sale counts as the same sale (as in
// /api/pos/complete-sale).
const DUPLICATE_WINDOW_MS = 90_000

// Nothing was written, so sending the same sale again is safe.
const NOT_RECORDED = {
  error: 'The payment was taken but the sale was not recorded. Do not take payment again — record it again with the button below.',
  retryable: true,
}

export async function POST(req: NextRequest) {
  try {
    const { parentId, studentId, tierId, months, paymentMethod, paymentIntentId, override } = await req.json()
    if (paymentMethod !== 'cash' && paymentMethod !== 'stripe_terminal') {
      return NextResponse.json({ error: 'Invalid payment method' }, { status: 400 })
    }

    const cookieStore = await cookies()
    const supabaseAuth = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } }
    )
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { data: admin } = await supabaseAuth.from('admins').select('id, first_name, last_name').eq('auth_user_id', user.id).single()
    if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // The squad, the swimmer's family, the one-track rule and the level band
    // are checked by lib/pos/sale-checks -- the same function the terminal
    // PaymentIntent was made under, so a card is never charged for a sale
    // this route would then refuse (found 2026-10-05). The counter keeps the
    // last word on the band -- a swimmer promoted this morning whose record is
    // not updated yet is a real thing at a desk -- but an out-of-band sale has
    // to be confirmed, and what was overridden, and by whom, is written onto
    // the invoice.
    // Recorded already? A terminal payment is keyed on its payment intent; a
    // cash sale on its shape (this swimmer, this amount, moments ago). Without
    // this a lost response, or a second press, extended the membership again
    // -- and for a card, charged again (found 2026-10-06).
    if (paymentIntentId) {
      const { data: seen } = await supabase
        .from('invoices').select('id').eq('stripe_payment_intent_id', paymentIntentId).limit(1)
      if (seen && seen.length)
        return NextResponse.json({ error: 'This payment has already been recorded.' }, { status: 409 })
    }

    const sale = await checkTeamSale(supabase, { parentId, studentId, tierId, months, override })
    if (!sale.ok) {
      // The card has already been charged when this route runs for a terminal
      // sale, so a refusal here must say so: the desk used to see a plain error
      // and charge again. An out-of-band refusal (the squad filled while the
      // reader was busy) can still be recorded with the override, without
      // touching the card.
      if (paymentIntentId) {
        const canOverride = !!(sale.extra && (sale.extra as { needs_override?: boolean }).needs_override)
        return NextResponse.json({
          error: canOverride
            ? `The card was charged, but this sale needs confirming first: ${sale.error} Do not charge again. Record it with the button below to confirm the override.`
            : `The card was charged, but this sale cannot be recorded: ${sale.error} Do not charge again. Refund the payment from the Stripe dashboard.`,
          ...(sale.extra || {}),
          retryable: canOverride,
          retryWithOverride: canOverride,
        }, { status: sale.status })
      }
      return NextResponse.json({ error: sale.error, ...(sale.extra || {}) }, { status: sale.status })
    }
    const { tier, student, reasons, months: m } = sale

    if (!paymentIntentId) {
      const since = new Date(Date.now() - DUPLICATE_WINDOW_MS).toISOString()
      const { data: recent } = await supabase
        .from('invoices').select('id')
        .eq('student_id', studentId).not('team_membership_id', 'is', null)
        .eq('amount', (tier.monthly_price_cents / 100) * m)
        .gte('issued_at', since).limit(1)
      if (recent && recent.length)
        return NextResponse.json({
          error: 'An identical team payment for this swimmer was recorded moments ago. If that was this sale, it is already done — check the membership before taking payment again.',
        }, { status: 409 })
    }
    const overrideNote = reasons.length > 0
      ? `Level override: sold as ${tier.name} — ${reasons.join('; ')}. Approved at the counter by ${[admin.first_name, admin.last_name].filter(Boolean).join(' ') || 'an admin'}.`
      : null

    // Reuse the latest prepaid row if one exists; extend from current expiry when still in the future
    const { data: prepaidRows } = await supabase
      .from('team_memberships').select('id, expires_at')
      .eq('student_id', studentId)
      .is('stripe_subscription_id', null)
      .order('created_at', { ascending: false }).limit(1)
    const existing = (prepaidRows || [])[0] || null

    const now = new Date()
    const base = existing?.expires_at && new Date(existing.expires_at) > now ? new Date(existing.expires_at) : now
    const end = new Date(base)
    end.setMonth(end.getMonth() + m)

    let membershipId: string
    if (existing) {
      const { data: upd, error: updErr } = await supabase
        .from('team_memberships')
        .update({ team_tier_id: tierId, status: 'active', expires_at: end.toISOString(), cancelled_at: null, updated_at: now.toISOString() })
        .eq('id', existing.id)
        .select('id').single()
      if (updErr || !upd) {
        console.error('Prepaid membership update error:', updErr)
        return NextResponse.json(NOT_RECORDED, { status: 500 })
      }
      membershipId = upd.id
    } else {
      const { data: ins, error: insErr } = await supabase
        .from('team_memberships')
        .insert({ student_id: studentId, team_tier_id: tierId, status: 'active', started_at: now.toISOString(), expires_at: end.toISOString() })
        .select('id').single()
      if (insErr || !ins) {
        console.error('Prepaid membership insert error:', insErr)
        return NextResponse.json(NOT_RECORDED, { status: 500 })
      }
      membershipId = ins.id
    }

    const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    const unitPrice = tier.monthly_price_cents / 100
    const amount = unitPrice * m
    // The membership is written; from here the sale has happened. An invoice
    // failure is logged and reported, never turned into "the sale failed",
    // which is what used to send the desk back to Charge (found 2026-10-06).
    let invoice: { id: string; invoice_number: string } | null = null
    try {
      invoice = await insertInvoice(supabase, {
        parent_id: parentId,
        student_id: studentId,
        team_membership_id: membershipId,
        amount,
        payment_method: invoicePaymentLabel(paymentMethod),
        items: [{
          name: `${tier.name} \u00b7 Prepaid Membership (${student.full_name}) \u00b7 ${m} month${m > 1 ? 's' : ''} \u00b7 ${fmt(base)} \u2013 ${fmt(end)}`,
          quantity: m,
          unit_price: unitPrice,
          period_end: end.toISOString(),
        }],
        status: 'paid',
        notes: overrideNote,
        stripe_payment_intent_id: paymentIntentId || null,
        issued_at: now.toISOString(),
      }, 'id, invoice_number')
    } catch (e) {
      console.error('[complete-team-sale] membership recorded but the invoice failed', { membershipId, paymentIntentId }, e)
    }

    return NextResponse.json({
      membership_id: membershipId,
      invoice_id: invoice?.id ?? null,
      invoice_number: invoice?.invoice_number ?? null,
      invoice_failed: !invoice,
      expires_at: end.toISOString(),
    })
  } catch (e) {
    console.error('complete-team-sale error:', e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
