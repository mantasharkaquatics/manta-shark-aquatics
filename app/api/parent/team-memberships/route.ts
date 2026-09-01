import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

// Parent-facing team memberships. Same service-role pattern as /api/parent/wallet.
export async function GET(req: Request) {
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
    .select('id, student_id, status, started_at, cancels_at, stripe_subscription_id, expires_at, team_tier_id, team_tiers(name, monthly_price_cents)')
    .in('student_id', ids)
    .neq('status', 'cancelled')

  const nameById: Record<string, string> = {}
  for (const s of students || []) nameById[s.id] = s.full_name

  const memberships = await Promise.all((tms || []).map(async (m: any) => {
    let invoices: { date: string; period_end: string | null; url: string | null }[] = []
    const { data: invRows } = await svc
      .from('invoices')
      .select('id, issued_at, items')
      .eq('team_membership_id', m.id)
      .eq('status', 'paid')
      .order('issued_at', { ascending: false })
    invoices = (invRows || []).map((r: any) => ({
      date: r.issued_at,
      period_end: r.items?.[0]?.period_end || null,
      url: `/api/invoices/${r.id}/pdf`,
    }))
    return {
      id: m.id,
      team_tier_id: m.team_tier_id || null,
      student_name: nameById[m.student_id] || '',
      tier_name: Array.isArray(m.team_tiers) ? m.team_tiers[0]?.name : m.team_tiers?.name,
      monthly_price_cents: Array.isArray(m.team_tiers) ? m.team_tiers[0]?.monthly_price_cents : m.team_tiers?.monthly_price_cents,
      status: m.status,
      started_at: m.started_at,
      cancels_at: m.cancels_at || null,
      expires_at: m.expires_at || null,
      is_prepaid: !m.stripe_subscription_id,
      invoices,
    }
  }))

  // Practice schedule: read live from team zones (never stored) so tier time
  // changes and three-tier separation are always correct. ?month=YYYY-MM adds
  // per-day resolution (date overrides replace the day, closed skips, time_off excludes).
  const tierIds = [...new Set((tms || []).map((m: any) => m.team_tier_id).filter(Boolean))]
  const scheduleByTier: Record<string, { weekly_slots: any[]; practice_days: any[] }> = {}
  if (tierIds.length > 0) {
    const [{ data: zoneRows }, { data: coachRows }] = await Promise.all([
      svc.from('coach_availability_zones')
        .select('coach_id, zone_type, kind, weekday, override_date, start_time, end_time, team_tier_id'),
      svc.from('coaches').select('id, first_name').eq('is_active', true),
    ])
    const coachName: Record<string, string> = {}
    for (const c of coachRows || []) coachName[c.id] = c.first_name
    const byCoach: Record<string, any[]> = {}
    for (const r of zoneRows || []) (byCoach[r.coach_id] ||= []).push(r)

    for (const tid of tierIds) {
      const weekly: any[] = []
      for (const cid of Object.keys(byCoach)) {
        for (const r of byCoach[cid]) {
          if (r.kind === 'weekly' && r.zone_type === 'team' && r.team_tier_id === tid)
            weekly.push({ weekday: r.weekday, start_time: String(r.start_time).slice(0, 5), end_time: String(r.end_time).slice(0, 5), coach_name: coachName[cid] || '' })
        }
      }
      weekly.sort((a, b) => a.weekday - b.weekday || a.start_time.localeCompare(b.start_time))
      scheduleByTier[tid] = { weekly_slots: weekly, practice_days: [] }
    }

    const month = new URL(req.url).searchParams.get('month')
    if (month && /^\d{4}-\d{2}$/.test(month)) {
      const [yy, mo] = month.split('-').map(Number)
      const last = new Date(yy, mo, 0).getDate()
      const { data: offRows } = await svc.from('coach_time_off')
        .select('coach_id, date, start_time, end_time')
        .gte('date', `${month}-01`).lte('date', `${month}-${String(last).padStart(2, '0')}`)
      const offByKey: Record<string, any[]> = {}
      for (const b of offRows || []) (offByKey[b.coach_id + '|' + b.date] ||= []).push(b)
      const toM = (t: string) => { const [h, m2] = t.split(':').map(Number); return h * 60 + m2 }
      for (let d = 1; d <= last; d++) {
        const ds = `${month}-${String(d).padStart(2, '0')}`
        const dow = new Date(ds + 'T00:00:00').getDay()
        for (const cid of Object.keys(byCoach)) {
          const rows = byCoach[cid]
          const dateRows = rows.filter((r: any) => r.kind === 'date' && r.override_date === ds)
          const picked = dateRows.length > 0 ? dateRows : rows.filter((r: any) => r.kind === 'weekly' && r.weekday === dow)
          if (picked.some((r: any) => r.zone_type === 'closed')) continue
          for (const r of picked) {
            if (r.zone_type !== 'team' || !r.team_tier_id || !scheduleByTier[r.team_tier_id]) continue
            const st = String(r.start_time).slice(0, 5), en = String(r.end_time).slice(0, 5)
            const blocks = offByKey[cid + '|' + ds] || []
            const blocked = blocks.some((b: any) => b.start_time == null || b.end_time == null || (toM(st) < toM(String(b.end_time).slice(0, 5)) && toM(en) > toM(String(b.start_time).slice(0, 5))))
            if (blocked) continue
            scheduleByTier[r.team_tier_id].practice_days.push({ date: ds, start_time: st, end_time: en, coach_name: coachName[cid] || '' })
          }
        }
      }
      for (const tid of Object.keys(scheduleByTier)) scheduleByTier[tid].practice_days.sort((a: any, b: any) => a.date.localeCompare(b.date) || a.start_time.localeCompare(b.start_time))
    }
  }
  for (const mem of memberships as any[]) {
    const s = mem.team_tier_id ? scheduleByTier[mem.team_tier_id] : null
    mem.weekly_slots = s?.weekly_slots || []
    mem.practice_days = s?.practice_days || []
  }

  return NextResponse.json({ memberships })
}
