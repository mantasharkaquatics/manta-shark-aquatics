/* 成績: a swimmer's timed swims (owner, 2026-11-17). Two sources, one page:
   - 課堂測驗: seconds a coach adds to a lesson report
     (app/coach/progress/SwimTimesInput, /api/coach/lesson-note). They wait
     with the report (swim_times.status 'pending') and go live when an admin
     confirms it (review-progress / review-assessment).
   - 比賽: the school's meets (meet_*), once an admin links a meet swimmer
     to a student and publishes the meet (Admin > 成績).
   docs/migration-swim-times.sql. Server only (RLS on, no policies); the
   family reads through /api/parent/swim-times. Shared by the coach portal,
   the admin and the parent page: no server imports here. */

export const STROKES = ['free', 'back', 'breast', 'fly', 'im', 'free_kick'] as const
export type Stroke = (typeof STROKES)[number]
export type Unit = 'yd' | 'm'

/** The events a coach picks from; the school's pool is in yards. */
export const COACH_EVENTS: { distance: number; stroke: Stroke }[] = [
  { distance: 25, stroke: 'free' }, { distance: 25, stroke: 'back' }, { distance: 25, stroke: 'breast' }, { distance: 25, stroke: 'fly' },
  { distance: 25, stroke: 'free_kick' },
  { distance: 50, stroke: 'free' }, { distance: 50, stroke: 'back' }, { distance: 50, stroke: 'breast' }, { distance: 50, stroke: 'fly' },
  { distance: 50, stroke: 'free_kick' },
  { distance: 100, stroke: 'free' }, { distance: 100, stroke: 'im' },
]

export type SwimTime = {
  id: string
  source: 'lesson' | 'meet'
  distance: number
  unit: Unit
  stroke: Stroke
  cs: number
  on: string // YYYY-MM-DD
  meet?: string // the meet's title
}

/** How many times this phone has seen on a swimmer's 成績 page, for the
 *  tile's dot: localStorage, + the student id. */
export const TIMES_SEEN_KEY = 'msa_times_seen:'

export const eventKey = (e: { distance: number; unit: Unit; stroke: Stroke }) => `${e.distance}-${e.unit}-${e.stroke}`

type T = (key: string, vars?: Record<string, string | number>) => string
/** "25 碼 自由式" / "25 yd freestyle". */
export const eventLabel = (t: T, e: { distance: number; unit: Unit; stroke: Stroke }) =>
  t('swim.event', { distance: e.distance, unit: t('swim.unit.' + e.unit), stroke: t('swim.stroke.' + e.stroke) })

/** 2456 -> "24.56"; 6305 -> "1:03.05". */
export function fmtTime(cs: number): string {
  const m = Math.floor(cs / 6000)
  const s = Math.floor((cs % 6000) / 100)
  const c = cs % 100
  const tail = `${String(c).padStart(2, '0')}`
  return m ? `${m}:${String(s).padStart(2, '0')}.${tail}` : `${s}.${tail}`
}

/** "24.56", "24.5", "24", "1:03.05" -> hundredths, or null. */
export function parseTime(text: string): number | null {
  const v = String(text || '').trim().replace(/：/g, ':').replace(/[．。]/g, '.').replace(/\s+/g, '')
  const x = v.match(/^(?:(\d{1,2}):)?(\d{1,3})(?:\.(\d{1,2}))?$/)
  if (!x) return null
  const m = x[1] ? Number(x[1]) : 0
  const sec = Number(x[2])
  if (x[1] && sec >= 60) return null
  const cs = (m * 60 + sec) * 100 + (x[3] ? Number(x[3].padEnd(2, '0')) : 0)
  return cs >= 100 && cs <= 99999 ? cs : null
}

/** Best (fastest) time per event, with how much it improved on the first. */
export function bestByEvent(list: SwimTime[]): { key: string; best: SwimTime; first: SwimTime; count: number }[] {
  const by = new Map<string, SwimTime[]>()
  for (const x of list) { const k = eventKey(x); by.set(k, [...(by.get(k) || []), x]) }
  return [...by.entries()].map(([key, xs]) => {
    const sorted = [...xs].sort((a, b) => (a.on < b.on ? -1 : a.on > b.on ? 1 : 0))
    const best = xs.reduce((a, b) => (b.cs < a.cs ? b : a))
    return { key, best, first: sorted[0], count: xs.length }
  }).sort((a, b) => b.count - a.count || a.best.distance - b.best.distance)
}
