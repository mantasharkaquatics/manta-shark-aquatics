/**
 * The four bands a coach grades a skill in.
 *
 * This replaces a 0-100 percentage that was never really a percentage: the
 * recorder only ever offered six fixed chips, and no coach can honestly tell
 * 60 from 70. Four named bands say what the coach actually observed, and they
 * give the curriculum a bar it did not have -- "self" is the moment the next
 * skill may begin, "solid" is the moment this one is finished.
 *
 * Storage stays in student_skill_progress.progress_percent so that no row, no
 * history snapshot and no report has to be rewritten. The numbers below are
 * the canonical values written from now on; masteryOf() also reads the legacy
 * 20/40/60/80 values correctly, so old rows need no migration to be understood.
 */
export type Mastery = 0 | 1 | 2 | 3

export const MASTERY_LEVELS: Mastery[] = [0, 1, 2, 3]

/** what gets stored for each band */
export const MASTERY_VALUE: Record<Mastery, number> = { 0: 0, 1: 40, 2: 70, 3: 100 }

/** reaching this lets the NEXT skill start -- it does not finish this one */
export const UNLOCK_LEVEL: Mastery = 2
/** reaching this passes the skill */
export const PASS_LEVEL: Mastery = 3

/** the stored value that opens the next stage; the DB trigger uses the same number */
export const UNLOCK_VALUE = MASTERY_VALUE[UNLOCK_LEVEL]

export function masteryOf(pct: number | null | undefined): Mastery {
  const v = Number(pct) || 0
  if (v >= 100) return 3
  if (v >= 60) return 2   // 60 and 80 on the old scale both meant "can do it alone"
  if (v >= 1) return 1
  return 0
}

export const masteryKey = (b: Mastery) => `mastery.${b}`

/** bar width / ring fill, so the visuals stay even across the four bands */
export const MASTERY_FILL: Record<Mastery, number> = { 0: 0, 1: 33, 2: 67, 3: 100 }

export const MASTERY_COLOR: Record<Mastery, string> = {
  0: '#68789a',   // not taught
  1: '#e8a33a',   // with help
  2: '#5b9bd5',   // on their own
  3: '#4caf72',   // solid
}

/** a skill counts toward a stage being finished once it is at UNLOCK_LEVEL */
export const isUnlocking = (pct: number | null | undefined) => masteryOf(pct) >= UNLOCK_LEVEL
export const isPassed    = (pct: number | null | undefined) => masteryOf(pct) >= PASS_LEVEL

/** The admin screens are English-only and carry no i18n provider, so they take
 *  these directly. The coach and parent screens go through t(masteryKey(b)). */
export const MASTERY_LABEL: Record<Mastery, string> = {
  0: 'Not taught',
  1: 'With help',
  2: 'On their own',
  3: 'Solid',
}
