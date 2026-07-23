import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import Stripe from 'stripe'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2026-05-27.dahlia' as any })

// Parent-facing team memberships. Same service-role pattern as /api/parent/tokens.
export async function GET() {
  const cookieStore = await cookies()
  const supabaseAuth = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } }
  )
  const { data: { user } } = await supabaseAuth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const svc = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: parent } = await svc
    .from('parents').select('id').eq('auth_user_id', user.id).single()
  if (!parent) return NextResponse.json({ error: 'Parent not found' }, { status: 403 })

  const { data: students } = await svc
    .from('students').select('id, full_name').eq('parent_id', parent.id)
  const ids = (students || []).map(s => s.id)
  if (ids.length === 0) return NextResponse.json({ memberships: [] })

  const { data: tms } = await svc
    .from('team_memberships')
    .select('id, student_id, status, started_at, cancels_at, stripe_subscription_id, team_tiers(name)')
    .in('student_id', ids)
    .neq('status', 'cancelled')

  const nameById: Record<string, string> = {}
  for (const s of students || []) nameById[s.id] = s.full_name

  const memberships = await Promise.all((tms || []).map(async (m: any) => {
    let invoices: { date: string; period_end: string | null; url: string | null }[] = []
    if (m.stripe_subscription_id) {
      try {
        const list = await stripe.invoices.list({ subscription: m.stripe_subscription_id, status: 'paid', limit: 24 })
        invoices = list.data
          .map((iv: any) => ({
            date: new Date((iv.status_transitions?.paid_at || iv.created) * 1000).toISOString(),
            period_end: iv.lines?.data?.[0]?.period?.end ? new Date(iv.lines.data[0].period.end * 1000).toISOString() : null,
            url: iv.hosted_invoice_url || null,
          }))
          .sort((a: { date: string }, b: { date: string }) => (a.date < b.date ? 1 : -1))
      } catch (e) {
        console.error('team-memberships invoice list failed', m.id, e)
      }
    }
    return {
      id: m.id,
      student_name: nameById[m.student_id] || '',
      tier_name: Array.isArray(m.team_tiers) ? m.team_tiers[0]?.name : m.team_tiers?.name,
      status: m.status,
      started_at: m.started_at,
      cancels_at: m.cancels_at || null,
      invoices,
    }
  }))

  return NextResponse.json({ memberships })
}
