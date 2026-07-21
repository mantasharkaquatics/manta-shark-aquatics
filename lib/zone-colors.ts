// Single source of truth for zone / band / tier colors.
// Used by: Zones editor, admin booking Day view, parent booking page.
export const ZONE_COLORS: Record<string, string> = { private: '#c9a84c', group: '#4caf72', team: '#e05a4a' }
export const BAND_COLORS: Record<string, string> = { '1-2': '#38bdf8', '3-4': '#2dd4bf', '5-6': '#818cf8', '7-9': '#fb923c' }
export const TEAM_TIER_COLORS = ['#ef4444', '#ec4899', '#9f1239']

export function bandKey(min?: number | null, max?: number | null): string | null {
  return min != null && max != null ? `${min}-${max}` : null
}

// Calendar fill for a zone row. Private returns null (base background stays).
export function zoneFill(
  z: { zone_type: string; group_level_min?: number | null; group_level_max?: number | null; team_tier_id?: string | null },
  tierOrder: string[],
): string | null {
  if (z.zone_type === 'group') {
    const k = bandKey(z.group_level_min, z.group_level_max)
    return (k && BAND_COLORS[k]) || ZONE_COLORS.group
  }
  if (z.zone_type === 'team') {
    const i = z.team_tier_id ? tierOrder.indexOf(z.team_tier_id) : -1
    return i >= 0 ? TEAM_TIER_COLORS[i % TEAM_TIER_COLORS.length] : ZONE_COLORS.team
  }
  return null
}
