/**
 * The six steps a coach grades a skill in.
 *
 * The recorder always offered six fixed chips -- 0, 20, 40, 60, 80, 100 -- and
 * that granularity was never the problem. The problem was that the numbers
 * meant nothing: no coach can say what separates 60 from 70, so two coaches
 * grading the same swimmer landed in different places. Each step now names an
 * observation the coach can actually make, and the boundaries are the questions
 * they ask themselves: is somebody helping, and does it work every time.
 *
 * 60 -- "on their own" -- is the bar the rest of the system hangs off. A stage
 * advances there, and a skill's dependants unlock there. Waiting for 100 meant
 * a swimmer who could already do something was held back from the thing it
 * leads to; "on their own" is the moment the next skill becomes teachable.
 *
 * Storage stays in student_skill_progress.progress_percent, so no history
 * snapshot, report or published record has to be rewritten, and masteryOf()
 * reads any legacy value correctly.
 */
export type Mastery = 0 | 1 | 2 | 3 | 4 | 5

export const MASTERY_LEVELS: Mastery[] = [0, 1, 2, 3, 4, 5]

/** what gets stored for each step */
export const MASTERY_VALUE: Record<Mastery, number> = {
  0: 0, 1: 20, 2: 40, 3: 60, 4: 80, 5: 100,
}

/** reaching this lets the NEXT skill start -- it does not finish this one */
export const UNLOCK_LEVEL: Mastery = 3
/** reaching this passes the skill */
export const PASS_LEVEL: Mastery = 5

/** the stored value that opens the next skill; the DB trigger uses the same number */
export const UNLOCK_VALUE = MASTERY_VALUE[UNLOCK_LEVEL]

export function masteryOf(pct: number | null | undefined): Mastery {
  const v = Number(pct) || 0
  if (v >= 100) return 5
  if (v >= 80) return 4
  if (v >= 60) return 3   // 70 on the old four-step scale also meant "on their own"
  if (v >= 40) return 2
  if (v >= 1) return 1
  return 0
}

export const masteryKey = (m: Mastery) => `mastery.${m}`

/** bar width / ring fill -- the stored value doubles as the fill percentage */
export const MASTERY_FILL: Record<Mastery, number> = MASTERY_VALUE

/* A single ramp from "not taught" to "mastered", with the school's gold on the
   step that matters: 60 is where the next skill opens, so it is the one a coach
   should be able to find without counting. */
export const MASTERY_COLOR: Record<Mastery, string> = {
  0: '#68789a',   // not taught
  1: '#d97b4a',   // trying it
  2: '#e8a33a',   // needs help
  3: '#c9a84c',   // on their own  <- the bar everything else hangs off
  4: '#7cc48a',   // getting solid
  5: '#4caf72',   // mastered
}

/** The admin screens are English-only and carry no i18n provider, so they take
 *  these directly. The coach and parent screens go through t(masteryKey(m)). */
export const MASTERY_LABEL: Record<Mastery, string> = {
  0: 'Not taught',
  1: 'Trying it',
  2: 'Needs help',
  3: 'On their own',
  4: 'Getting solid',
  5: 'Mastered',
}

export const isUnlocking = (pct: number | null | undefined) => masteryOf(pct) >= UNLOCK_LEVEL
export const isPassed    = (pct: number | null | undefined) => masteryOf(pct) >= PASS_LEVEL
