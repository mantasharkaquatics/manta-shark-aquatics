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
  '3': '#d4a825',
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

export function levelName(level: number | string | null | undefined): string {
  if (level == null || level === '') return ''
  return LEVEL_NAMES[String(level)] || ''
}

export function levelColor(level: number | string | null | undefined, fallback = '#374151'): string {
  if (level == null || level === '') return fallback
  return LEVEL_COLORS[String(level)] || fallback
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
    const total = values.reduce((a, b) => a + b, 0)
    return {
      stage,
      percent: Math.round(total / inStage.length),
      complete: values.every(v => v >= 100),
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
