import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { TEAM_SQUAD_CAP } from '@/lib/team-tiers'

// Public tier list with remaining spots (aggregate counts only — not sensitive).
export async function GET() {
  const svc = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  const { data: tiers } = await svc
    .from('team_tiers')
    .select('id, name, level_min, level_max, min_stage, max_stage, monthly_price_cents')
    .eq('active', true)
    .order('level_min')
  const { data: members } = await svc
    .from('team_memberships')
    .select('team_tier_id')
    .in('status', ['active', 'past_due'])
    .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
  const countByTier: Record<string, number> = {}
  for (const m of members || []) countByTier[m.team_tier_id] = (countByTier[m.team_tier_id] || 0) + 1
  return NextResponse.json({
    tiers: (tiers || []).map(t => ({
      id: t.id, name: t.name, level_min: t.level_min, level_max: t.level_max,
      min_stage: t.min_stage ?? 1, max_stage: t.max_stage ?? 3, monthly_price_cents: t.monthly_price_cents,
      spots_left: Math.max(0, TEAM_SQUAD_CAP - (countByTier[t.id] || 0)),
    })),
  })
}
