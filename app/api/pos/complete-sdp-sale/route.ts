import { sendEmail } from '@/lib/email'
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

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
      .from('course_types').select('id, name').eq('id', courseTypeId).single()
    if (!courseType) return NextResponse.json({ error: 'Invalid course type' }, { status: 400 })

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

    const expiresAt = new Date()
    expiresAt.setFullYear(expiresAt.getFullYear() + 1)

    const { data: lessonCredit, error: creditErr } = await supabase.from('lesson_credits').insert({
      student_id: studentId,
      parent_id: parentId,
      purchase_id: purchase.id,
      course_type_id: courseType.id,
      total_credits: qty,
      used_credits: 0,
      expires_at: expiresAt.toISOString(),
    }).select().single()
    if (creditErr) {
      console.error('SDP credit error:', creditErr)
      return NextResponse.json({ error: 'Credit creation failed' }, { status: 500 })
    }

    const { data: parent } = await supabase
      .from('parents').select('first_name, last_name, email').eq('id', parentId).single()

    const year = new Date().getFullYear()
    const { data: seqNum } = await supabase.rpc('get_next_invoice_seq')
    const seq = seqNum || 1
    const invoice_number = `MSA-${year}-${String(seq).padStart(4, '0')}`

    const { data: invoice, error: invErr } = await supabase.from('invoices').insert({
      invoice_number,
      parent_id: parentId,
      student_id: studentId,
      lesson_credit_id: lessonCredit?.id ?? null,
      amount: amountCents / 100,
      payment_method: paymentMethod === 'stripe_terminal' ? 'card' : paymentMethod,
      items: [{ name: courseType.name, quantity: qty, unit_price: unit / 100 }],
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
          planName: `${courseType.name} (${qty} sessions)`,
          invoiceUrl: `${appUrl}/api/invoices/${invoice.id}/pdf`,
        })
      } catch (e) {
        console.error('SDP invoice email error:', e)
      }
    }

    console.log(`✅ SDP sale: "${courseType.name}" x${qty} student=${studentId} method=${paymentMethod} invoice=${invoice?.invoice_number}`)
    return NextResponse.json({ success: true, purchaseId: purchase.id, invoiceId: invoice?.id })
  } catch (err: any) {
    console.error('SDP complete-sale error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
