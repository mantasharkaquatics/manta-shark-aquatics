import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { tierFor, TEAM_SQUAD_CAP } from '@/lib/team-tiers'

// POS prepaid team membership sale: buy N months upfront (cash or terminal one-off).
// Rules (owner 2026-07-22): one track per student (block if active subscription);
// renewal extends from current expiry, never resets; one invoice per purchase with coverage dates.
export async function POST(req: NextRequest) {
  try {
    const { parentId, studentId, tierId, months, paymentMethod, paymentIntentId, override } = await req.json()
    const m = parseInt(String(months), 10)
    if (!parentId || !studentId || !tierId || !m || m < 1 || m > 12) {
      return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
    }
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

    const { data: tier } = await supabase
      .from('team_tiers').select('id, name, monthly_price_cents').eq('id', tierId).single()
    if (!tier) return NextResponse.json({ error: 'Invalid tier' }, { status: 400 })

    const { data: student } = await supabase
      .from('students').select('id, full_name, current_level, current_stage').eq('id', studentId).single()
    if (!student) return NextResponse.json({ error: 'Student not found' }, { status: 400 })

    // The online route never lets a parent pick a squad: it derives the squad
    // from the swimmer's level and stage, refuses an unassessed swimmer, and
    // stops at the cap. The counter picks the squad by hand and used to check
    // none of that, so the two doors into the same squad disagreed.
    //
    // The counter keeps the last word -- a swimmer promoted this morning whose
    // record is not updated yet is a real thing that happens at a desk -- but it
    // is no longer silent: an out-of-band sale has to be confirmed, and what was
    // overridden, and by whom, is written onto the invoice.
    const { data: allTiers } = await supabase
      .from('team_tiers').select('id, name, level_min, level_max, min_stage, max_stage')
      .eq('active', true).order('level_min').order('min_stage')
    const recommended = tierFor(allTiers || [], student.current_level, student.current_stage)

    // A renewal for a swimmer already in this squad is not a new seat, so it is
    // counted out of the total rather than counted against it.
    const { count: others } = await supabase
      .from('team_memberships').select('id', { count: 'exact', head: true })
      .eq('team_tier_id', tierId).in('status', ['active', 'past_due']).neq('student_id', studentId)

    const reasons: string[] = []
    if (student.current_level == null) reasons.push(`${student.full_name} has no swim assessment on file`)
    else if (!recommended) reasons.push(`Level ${student.current_level} is below the team minimum of Level 4`)
    else if (recommended.id !== tierId) reasons.push(`this swimmer's level places them in ${recommended.name}`)
    if ((others || 0) >= TEAM_SQUAD_CAP) reasons.push(`${tier.name} is already at ${others} of ${TEAM_SQUAD_CAP}`)

    if (reasons.length > 0 && !override) {
      return NextResponse.json({
        error: `Sold as ${tier.name}, but ${reasons.join('; ')}.`,
        needs_override: true, reasons,
        recommended: recommended ? { id: recommended.id, name: recommended.name } : null,
      }, { status: 409 })
    }
    const overrideNote = reasons.length > 0
      ? `Level override: sold as ${tier.name} — ${reasons.join('; ')}. Approved at the counter by ${[admin.first_name, admin.last_name].filter(Boolean).join(' ') || 'an admin'}.`
      : null

    // One track only: block if the student has a live subscription membership
    const { data: subRows } = await supabase
      .from('team_memberships').select('id')
      .eq('student_id', studentId)
      .not('stripe_subscription_id', 'is', null)
      .in('status', ['active', 'past_due'])
    if ((subRows || []).length > 0) {
      return NextResponse.json({ error: 'Student already has an active subscription membership' }, { status: 409 })
    }

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
    const { data: seqNum } = await supabase.rpc('get_next_invoice_seq')
    const invoice_number = `MSA-${now.getFullYear()}-${String(seqNum || 1).padStart(4, '0')}`
    const { data: invoice, error: invErr } = await supabase
      .from('invoices')
      .insert({
        invoice_number,
        parent_id: parentId,
        student_id: studentId,
        team_membership_id: membershipId,
        amount,
        payment_method: paymentMethod,
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
      })
      .select('id, invoice_number').single()
    if (invErr || !invoice) {
      console.error('Prepaid invoice insert error:', invErr)
      return NextResponse.json({ error: 'Membership created but invoice failed' }, { status: 500 })
    }

    return NextResponse.json({ membership_id: membershipId, invoice_id: invoice.id, invoice_number: invoice.invoice_number, expires_at: end.toISOString() })
  } catch (e) {
    console.error('complete-team-sale error:', e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
