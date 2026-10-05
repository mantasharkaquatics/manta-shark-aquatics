import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { insertInvoice } from '@/lib/invoices/create'
import { checkTeamSale, invoicePaymentLabel } from '@/lib/pos/sale-checks'

// POS prepaid team membership sale: buy N months upfront (cash or terminal one-off).
// Rules (owner 2026-07-22): one track per student (block if active subscription);
// renewal extends from current expiry, never resets; one invoice per purchase with coverage dates.
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
    const sale = await checkTeamSale(supabase, { parentId, studentId, tierId, months, override })
    if (!sale.ok) return NextResponse.json({ error: sale.error, ...(sale.extra || {}) }, { status: sale.status })
    const { tier, student, reasons, months: m } = sale
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
        return NextResponse.json({ error: 'Failed to update membership' }, { status: 500 })
      }
      membershipId = upd.id
    } else {
      const { data: ins, error: insErr } = await supabase
        .from('team_memberships')
        .insert({ student_id: studentId, team_tier_id: tierId, status: 'active', started_at: now.toISOString(), expires_at: end.toISOString() })
        .select('id').single()
      if (insErr || !ins) {
        console.error('Prepaid membership insert error:', insErr)
        return NextResponse.json({ error: 'Failed to create membership' }, { status: 500 })
      }
      membershipId = ins.id
    }

    const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    const unitPrice = tier.monthly_price_cents / 100
    const amount = unitPrice * m
    const invoice = await insertInvoice(supabase, {
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

    return NextResponse.json({ membership_id: membershipId, invoice_id: invoice.id, invoice_number: invoice.invoice_number, expires_at: end.toISOString() })
  } catch (e) {
    console.error('complete-team-sale error:', e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
