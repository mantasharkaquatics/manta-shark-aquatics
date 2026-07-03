import { sendEmail } from '@/lib/email'
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { PLANS } from '@/lib/plans'

export async function POST(req: NextRequest) {
  try {
    const { parentId, planId, paymentMethod, paymentIntentId } = await req.json()

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

    const plan = PLANS[planId]
    if (!plan) return NextResponse.json({ error: 'Invalid plan' }, { status: 400 })

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const { data: courseType } = await supabase
      .from('course_types').select('id').eq('slug', plan.courseSlug).single()

    const insertData: Record<string, unknown> = {
      parent_id: parentId,
      lesson_package_id: null,
      amount_cents: plan.amount,
      status: 'paid',
      paid_at: new Date().toISOString(),
      payment_method: paymentMethod,
      recorded_by: user.id,
    }
    if (paymentIntentId) insertData.stripe_payment_intent_id = paymentIntentId

    const { data: purchase, error: purchaseErr } = await supabase
      .from('purchases')
      .insert(insertData)
      .select()
      .single()

    if (purchaseErr || !purchase) {
      console.error('POS purchase error:', purchaseErr)
      return NextResponse.json({ error: 'Purchase failed' }, { status: 500 })
    }

    const expiresAt = new Date()
    expiresAt.setFullYear(expiresAt.getFullYear() + 1)

    const { data: lessonCredit, error: creditErr } = await supabase.from('lesson_credits').insert({
      student_id: null,
      parent_id: parentId,
      purchase_id: purchase.id,
      course_type_id: courseType?.id ?? null,
      total_credits: plan.sessions,
      used_credits: 0,
      expires_at: expiresAt.toISOString(),
    }).select().single()

    if (creditErr) {
      console.error('POS credit error:', creditErr)
      return NextResponse.json({ error: 'Credit creation failed' }, { status: 500 })
    }

    // 建立發票
    const { data: parent } = await supabase
      .from('parents').select('first_name, last_name, email').eq('id', parentId).single()

    const year = new Date().getFullYear()
    const { data: seqNum } = await supabase.rpc('get_next_invoice_seq')
    const seq = seqNum || 1
    const invoice_number = `MSA-${year}-${String(seq).padStart(4, '0')}`

    const { data: invoice } = await supabase.from('invoices').insert({
      invoice_number,
      parent_id: parentId,
      lesson_credit_id: lessonCredit?.id ?? null,
      amount: plan.amount / 100,
      payment_method: paymentMethod === 'stripe_terminal' ? 'Credit Card (Terminal)' : paymentMethod,
      items: [{ name: plan.name, quantity: 1, unit_price: plan.amount / 100 }],
      status: 'sent',
      stripe_payment_intent_id: paymentIntentId || null,
    }).select().single()

    // 寄發票 email
    if (invoice && parent) {
      try {
        const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://www.mantasharkaquatics.net'
        await sendEmail({
            type: 'invoice',
            to: parent.email,
            parentName: parent.first_name,
            invoiceNumber: invoice.invoice_number,
            amount: plan.amount / 100,
            planName: plan.name,
            invoiceUrl: `${appUrl}/api/invoices/${invoice.id}/pdf`,
          })
      } catch (e) {
        console.error('Invoice email error:', e)
      }
    }

    console.log(`✅ POS sale: ${plan.name} parent=${parentId} method=${paymentMethod} invoice=${invoice?.invoice_number}`)
    return NextResponse.json({ success: true, purchaseId: purchase.id, invoiceId: invoice?.id })
  } catch (err: any) {
    console.error('POS complete-sale error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
