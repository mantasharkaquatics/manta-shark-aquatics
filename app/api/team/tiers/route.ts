import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Public tier list with remaining spots (aggregate counts only — not sensitive).
export async function GET() {
  const svc = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  const { data: tiers } = await svc
    .from('team_tiers')
    .select('id, name, level_min, level_max')
    .eq('active', true)
    .order('level_min')
  const { data: members } = await svc
    .from('team_memberships')
    .select('team_tier_id')
    .in('status', ['active', 'past_due'])
  const countByTier: Record<string, number> = {}
  for (const m of members || []) countByTier[m.team_tier_id] = (countByTier[m.team_tier_id] || 0) + 1
  return NextResponse.json({
    tiers: (tiers || []).map(t => ({
      id: t.id, name: t.name, level_min: t.level_min, level_max: t.level_max,
      spots_left: Math.max(0, 24 - (countByTier[t.id] || 0)),
    })),
  })
}
