import { sendEmail } from '@/lib/email'
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { BASE_POINTS, centsToPoints } from '@/lib/points'
import { applyPoints } from '@/lib/points-wallet'

// A negotiated programme sale: a set number of lessons for one named swimmer at
// a price agreed off the price list (school districts, scholarships, a family
// paying in a lump for a season).
//
// Under points this stays one sale but becomes two movements. The dollars paid
// become purchased points -- one per dollar, refundable at that rate, exactly
// like any other purchase. The gap between what was paid and what those lessons
// cost at list price becomes granted points: they spend the same way and they
// cannot be cashed out, so a discounted rate can never be turned back into more
// money than the family handed over.
//
// The points land in the FAMILY's wallet, not the swimmer's -- there is one
// wallet per family and no per-child balances. The swimmer is recorded on the
// invoice, which is where the agreement is actually documented.

export async function POST(req: NextRequest) {
  try {
    const { parentId, studentId, courseTypeId, description, sessions, unitPriceCents, paymentMethod, paymentIntentId } = await req.json()

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

    const qty = Math.round(Number(sessions))
    const unit = Math.round(Number(unitPriceCents))
    if (!parentId || !studentId) return NextResponse.json({ error: 'parentId and studentId required' }, { status: 400 })
    if (!Number.isFinite(qty) || qty < 1 || qty > 200) return NextResponse.json({ error: 'Invalid sessions' }, { status: 400 })
    if (!Number.isFinite(unit) || unit < 50 || unit > 100000) return NextResponse.json({ error: 'Invalid unit price' }, { status: 400 })
    if (unit % 100 !== 0) return NextResponse.json({ error: 'Unit price must be a whole number of dollars' }, { status: 400 })
    if (!courseTypeId) return NextResponse.json({ error: 'courseTypeId required' }, { status: 400 })
    const amountCents = qty * unit
    const noteText = String(description || '').trim()

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const { data: student } = await supabase
      .from('students').select('id, full_name, parent_id, uci_number')
      .eq('id', studentId).single()
    if (!student || student.parent_id !== parentId) {
      return NextResponse.json({ error: 'Student does not belong to this parent' }, { status: 400 })
    }

    const { data: courseType } = await supabase
      .from('course_types').select('id, name, slug').eq('id', courseTypeId).single()
    if (!courseType) return NextResponse.json({ error: 'Invalid course type' }, { status: 400 })

    const listPerLesson = BASE_POINTS[courseType.slug]
    if (listPerLesson === undefined)
      return NextResponse.json({ error: `${courseType.name} is not paid for with points.` }, { status: 400 })

    if (paymentIntentId) {
      const { data: seen } = await supabase
        .from('point_ledger').select('id')
        .eq('stripe_session_id', paymentIntentId).eq('reason', 'purchase').limit(1)
      if (seen && seen.length)
        return NextResponse.json({ error: 'This payment has already been recorded.' }, { status: 409 })
    }

    const insertData: Record<string, unknown> = {
      parent_id: parentId,
      lesson_package_id: null,
      amount_cents: amountCents,
      status: 'paid',
      paid_at: new Date().toISOString(),
      payment_method: paymentMethod,
      recorded_by: user.id,
    }
    if (paymentIntentId) insertData.stripe_payment_intent_id = paymentIntentId

    const { data: purchase, error: purchaseErr } = await supabase
      .from('purchases').insert(insertData).select().single()
    if (purchaseErr || !purchase) {
      console.error('SDP purchase error:', purchaseErr)
      return NextResponse.json({ error: 'Purchase failed' }, { status: 500 })
    }

    const paidPoints = centsToPoints(amountCents)
    const listPoints = listPerLesson * qty
    const bonusPoints = Math.max(0, listPoints - paidPoints)

    let balance = 0
    try {
      const res = await applyPoints(supabase, {
        parentId, reason: 'purchase', points: paidPoints,
        amountCents,
        stripeSessionId: paymentIntentId || null,
        actor: `admin:${admin.id}`,
        note: `${qty} × ${courseType.name} for ${student.full_name}${noteText ? ` — ${noteText}` : ''}`,
      })
      balance = res.balance
      if (bonusPoints > 0) {
        const res2 = await applyPoints(supabase, {
          parentId, reason: 'admin_grant', points: bonusPoints, toGranted: true,
          actor: `admin:${admin.id}`,
          note: `Programme rate for ${student.full_name}: ${qty} × ${courseType.name} at $${unit / 100} against a list price of ${listPerLesson}`,
        })
        balance = res2.balance
      }
    } catch (e: any) {
      console.error('SDP points credit failed:', e)
      return NextResponse.json({
        error: 'The payment was recorded but the points did not go in. Do not take payment again — add the points by hand from the parent\'s page.',
      }, { status: 500 })
    }

    const { data: parent } = await supabase
      .from('parents').select('first_name, last_name, email').eq('id', parentId).single()

    const year = new Date().getFullYear()
    const { data: seqNum } = await supabase.rpc('get_next_invoice_seq')
    const invoice_number = `MSA-${year}-${String(seqNum || 1).padStart(4, '0')}`

    const { data: invoice, error: invErr } = await supabase.from('invoices').insert({
      invoice_number,
      parent_id: parentId,
      student_id: studentId,
      amount: amountCents / 100,
      payment_method: paymentMethod === 'stripe_terminal' ? 'card' : paymentMethod,
      items: [
        { name: `${courseType.name} — ${student.full_name}`, quantity: qty, unit_price: unit / 100 },
        ...(bonusPoints > 0
          ? [{ name: `${bonusPoints.toLocaleString('en-US')} programme-rate points`, quantity: bonusPoints, unit_price: 0 }]
          : []),
      ],
      status: 'sent',
      stripe_payment_intent_id: paymentIntentId || null,
      notes: noteText || null,
    }).select().single()
    if (invErr) console.error('SDP invoice error:', invErr)

    if (invoice && parent) {
      try {
        const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://www.mantasharkaquatics.net'
        await sendEmail({
          type: 'invoice',
          to: parent.email,
          parentName: parent.first_name,
          invoiceNumber: invoice.invoice_number,
          amount: amountCents / 100,
          planName: `${courseType.name} (${qty} lessons)`,
          invoiceUrl: `${appUrl}/api/invoices/${invoice.id}/pdf`,
        })
      } catch (e) {
        console.error('SDP invoice email error:', e)
      }
    }

    console.log(`✅ SDP sale: "${courseType.name}" x${qty} student=${studentId} points=${paidPoints}+${bonusPoints} invoice=${invoice?.invoice_number}`)
    return NextResponse.json({
      success: true, purchaseId: purchase.id, invoiceId: invoice?.id,
      points: paidPoints, bonus: bonusPoints, balance,
    })
  } catch (err: any) {
    console.error('SDP complete-sale error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
