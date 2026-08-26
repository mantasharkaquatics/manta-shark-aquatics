import { STAGES } from './levels'

/**
 * A squad's band runs from one point in the curriculum to another, and a point
 * is a level AND a stage — Intermediate ends partway through Level 7, where
 * Elite picks up. Comparing levels alone cannot express that, which is why the
 * band carries stages and why this test exists in one place rather than as a
 * query filter in each caller.
 */
/** How many swimmers a squad holds. Was written as a bare 24 in three files. */
export const TEAM_SQUAD_CAP = 24

export type TierBand = {
  level_min: number
  level_max: number
  min_stage?: number | null
  max_stage?: number | null
}

/** Curriculum position as one comparable number: L7 stage 2 -> 72. */
export function curriculumRank(level: number | string | null | undefined, stage?: number | string | null): number {
  const l = Number(level)
  if (!Number.isFinite(l) || l < 1) return 0
  const s = Number(stage)
  const st = STAGES.includes(s as 1 | 2 | 3) ? s : 1
  return l * 10 + st
}

export function tierCovers(tier: TierBand, level: number | string | null | undefined, stage?: number | string | null): boolean {
  const r = curriculumRank(level, stage)
  if (r === 0) return false
  return r >= curriculumRank(tier.level_min, tier.min_stage ?? 1)
    && r <= curriculumRank(tier.level_max, tier.max_stage ?? 3)
}

/** The one squad a swimmer belongs to, or null when no band reaches them. */
export function tierFor<T extends TierBand>(tiers: T[], level: number | string | null | undefined, stage?: number | string | null): T | null {
  return tiers.find(t => tierCovers(t, level, stage)) ?? null
}

/** "L4–L5", "L6 – L7 Stage 1", "L7 Stage 2–3" — what a family reads on the plans page. */
export function tierBandLabel(tier: TierBand, stageWord = 'Stage'): string {
  const lo = Number(tier.level_min), hi = Number(tier.level_max)
  const loS = Number(tier.min_stage ?? 1), hiS = Number(tier.max_stage ?? 3)
  const wholeLo = loS === 1, wholeHi = hiS === 3
  if (lo === hi) {
    if (wholeLo && wholeHi) return `L${lo}`
    if (loS === hiS) return `L${lo} ${stageWord} ${loS}`
    return `L${lo} ${stageWord} ${loS}–${hiS}`
  }
  const left = wholeLo ? `L${lo}` : `L${lo} ${stageWord} ${loS}`
  const right = wholeHi ? `L${hi}` : `L${hi} ${stageWord} ${hiS}`
  return `${left} – ${right}`
}
