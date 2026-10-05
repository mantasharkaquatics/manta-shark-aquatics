import { UNLOCK_VALUE } from './mastery'
// The curriculum shape, in one place.
//
// Seven levels, three stages each. A level is a body of work; a stage is the
// checkpoint a family actually sees move. Assessment decides the level -- every
// swimmer then starts that level at stage 1, and clearing stage 3 is what
// carries them to the next level.
//
// These names were duplicated in four clients before this file existed. Import
// from here; do not paste another copy.

export const MAX_LEVEL = 7
/** 1..MAX_LEVEL, for every level picker. Pickers used to hard-code 1..9 and
 *  kept offering L8 and L9 after the curriculum shrank to seven. */
export const LEVEL_NUMBERS: number[] = Array.from({ length: MAX_LEVEL }, (_, i) => i + 1)
/** A level a swimmer can actually be placed in. Accepts "3" as well as 3. */
export function isLevelNumber(v: unknown): boolean {
  const n = Number(v)
  return Number.isInteger(n) && n >= 1 && n <= MAX_LEVEL
}
export const STAGES = [1, 2, 3] as const
export type Stage = 1 | 2 | 3

export const LEVEL_NAMES: Record<string, string> = {
  '1': 'Water Discovery',
  '2': 'Water Confidence',
  '3': 'Independent Movement',
  '4': 'Stroke Foundations',
  '5': 'Stroke Development',
  '6': 'Four Strokes',
  '7': 'Competitive Swimming',
}

export const LEVEL_COLORS: Record<string, string> = {
  '1': '#e05a4a',
  '2': '#e8883a',
  '3': '#f0c419',   // was #d4a825 -- one notch from L7's gold, and the two ribbons came out identical
  '4': '#4caf72',
  '5': '#4a90c4',
  '6': '#7b5ea7',
  '7': '#c9a84c',
}

// Tailwind classes, for the admin tables that use them instead of hex.
export const LEVEL_BADGE_CLASSES: Record<string, string> = {
  '1': 'bg-red-900/40 text-red-300',
  '2': 'bg-orange-900/40 text-orange-300',
  '3': 'bg-yellow-900/40 text-yellow-300',
  '4': 'bg-green-900/40 text-green-300',
  '5': 'bg-blue-900/40 text-blue-300',
  '6': 'bg-purple-900/40 text-purple-300',
  '7': 'bg-amber-900/40 text-amber-300',
}

/** i18n key for a level's display name, e.g. t(levelNameKey(3)). */
export function levelNameKey(level: number | string): string {
  return 'level.' + level + '.name'
}

/** i18n key for a stage's display name, e.g. t(stageNameKey(3, 2)). */
export function stageNameKey(level: number | string, stage: number | string): string {
  return 'stage.' + level + '.' + stage + '.name'
}

export type StageProgress = {
  stage: Stage
  /** 0-100, the mean of the stage's skills. */
  percent: number
  /** Every skill in the stage is signed off. */
  complete: boolean
  skillCount: number
}

/**
 * A stage is complete only when every skill in it reads 100 -- the same rule the
 * database trigger promotes on, so the bar a parent sees and the promotion that
 * follows it can never disagree.
 */
export function stageProgress(
  skills: { id: string; stage: number }[],
  percentBySkillId: Record<string, number>
): StageProgress[] {
  return STAGES.map(stage => {
    const inStage = skills.filter(s => Number(s.stage || 1) === stage)
    if (inStage.length === 0) {
      return { stage, percent: 0, complete: false, skillCount: 0 }
    }
    const values = inStage.map(s => Math.max(0, Math.min(100, percentBySkillId[s.id] ?? 0)))
    /* The bar measures one thing: how close this stage is to handing the swimmer
       to the next one. That happens when every skill reaches "on their own", so
       the bar counts the skills that have, rather than averaging the raw numbers.
       Averaging put back exactly the false precision the four bands removed --
       and it disagreed with the database, which stopped requiring 100 when the
       stage gate moved to "on their own". "Solid" is still the goal for each
       skill; the learning map is where that shows, skill by skill. */
    const reached = values.filter(v => v >= UNLOCK_VALUE).length
    return {
      stage,
      percent: Math.round(100 * reached / inStage.length),
      complete: reached === inStage.length,
      skillCount: inStage.length,
    }
  })
}

/**
 * Where the swimmer actually is: the stored stage when there is one, otherwise
 * the first stage that is not yet finished. A student whose level is complete
 * sits on stage 3 until an admin moves them up.
 */
export function resolveStage(
  stored: number | null | undefined,
  progress: StageProgress[]
): Stage {
  const n = Number(stored)
  if (n === 1 || n === 2 || n === 3) return n
  const next = progress.find(p => !p.complete)
  return (next ? next.stage : 3) as Stage
}
