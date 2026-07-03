import { sendEmail } from '@/lib/email'
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

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

    const { data: student } = await supabase
      .from('students').select('id, full_name, trial_used_at').eq('id', studentId).single()
    if (!student) return NextResponse.json({ error: 'Student not found' }, { status: 404 })
    if (student.trial_used_at) return NextResponse.json({ error: '此學生已使用過體驗課' }, { status: 400 })

    const { data: activeTrial } = await supabase
      .from('bookings').select('id').eq('student_id', studentId)
      .eq('is_trial', true).neq('status', 'cancelled').maybeSingle()
    if (activeTrial) return NextResponse.json({ error: '此學生已有進行中的體驗課預約' }, { status: 400 })

    await supabase.from('students').update({ trial_used_at: new Date().toISOString() }).eq('id', studentId)

    const insertData: Record<string, unknown> = {
      parent_id: parentId,
      lesson_package_id: null,
      amount_cents: 8500,
      status: 'paid',
      paid_at: new Date().toISOString(),
      payment_method: paymentMethod,
      recorded_by: user.id,
    }
    if (paymentIntentId) insertData.stripe_payment_intent_id = paymentIntentId

    const { data: purchase } = await supabase.from('purchases').insert(insertData).select().single()

    // 建立 invoice
    try {
      const year = new Date().getFullYear()
      const { data: seqNum } = await supabase.rpc('get_next_invoice_seq')
      const seq = seqNum || 1
      const invoice_number = `MSA-${year}-${String(seq).padStart(4, '0')}`
      const { data: parentData } = await supabase.from('parents').select('first_name, last_name, email').eq('id', parentId).single()
      const { data: studentData } = await supabase.from('students').select('full_name').eq('id', studentId).single()
      const { data: inv } = await supabase.from('invoices').insert({
        invoice_number,
        parent_id: parentId,
        amount: 85,
        payment_method: paymentMethod === 'stripe_terminal' ? 'Credit Card (Terminal)' : paymentMethod,
        items: [{ name: `Trial Lesson - ${studentData?.full_name || ''}`, quantity: 1, unit_price: 85 }],
        status: 'sent',
        stripe_payment_intent_id: paymentIntentId || null,
        issued_at: new Date().toISOString(),
      }).select().single()
      if (parentData && inv) {
        await sendEmail({
            type: 'invoice',
            to: parentData.email,
            parentName: parentData.first_name,
            invoiceNumber: invoice_number,
            invoiceUrl: `${process.env.NEXT_PUBLIC_APP_URL}/api/invoices/${inv.id}/pdf`,
            amount: '85.00',
            items: [{ name: `Trial Lesson - ${studentData?.full_name || ''}`, quantity: 1, unit_price: 85 }],
            paymentMethod: paymentMethod === 'stripe_terminal' ? 'Credit Card (Terminal)' : paymentMethod,
          })
      }
    } catch (e) { console.error('Trial invoice/email error:', e) }

    console.log(`✅ POS trial purchase: student=${studentId} parent=${parentId} method=${paymentMethod}`)
    return NextResponse.json({ success: true, purchaseId: purchase?.id })
  } catch (err: any) {
    console.error('POS complete-trial-sale error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
