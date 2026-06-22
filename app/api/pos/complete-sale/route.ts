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

    const { error: creditErr } = await supabase.from('lesson_credits').insert({
      student_id: null,
      parent_id: parentId,
      purchase_id: purchase.id,
      course_type_id: courseType?.id ?? null,
      total_credits: plan.sessions,
      used_credits: 0,
      expires_at: expiresAt.toISOString(),
    })

    if (creditErr) {
      console.error('POS credit error:', creditErr)
      return NextResponse.json({ error: 'Credit creation failed' }, { status: 500 })
    }

    console.log(`✅ POS sale: ${plan.name} parent=${parentId} method=${paymentMethod}`)
    return NextResponse.json({ success: true, purchaseId: purchase.id })
  } catch (err: any) {
    console.error('POS complete-sale error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
