import type { TFunction, Locale } from '@/lib/i18n'
import { dateTag } from '@/lib/i18n'
import { formatTime12h } from '@/lib/date'
import { bandRange } from '@/lib/zone-colors'

/**
 * What the desk is told after a level change (found 2026-10-15, F194 / F25):
 * the swimmer's booked 1-on-4 lessons in a class for another level band --
 * kept, not moved, until the term ends (owner, 2026-10-15) -- and what
 * happened to their Swim Team squad. Both the Levels page (assign-level) and
 * the Reviews card (review-level) read the same fields from the route
 * (setStudentLevel in lib/level-change.ts). Client-safe: no server imports.
 * Returns '' when there is nothing to tell.
 */
export function levelChangeNotes(
  t: TFunction,
  locale: Locale,
  data: { out_of_band?: { date: string; start_time: string; level_min: number; level_max: number }[] | null; squad?: { status: string; from?: string | null; to?: string } | null } | null,
): string {
  const parts: string[] = []
  const lessons = data?.out_of_band || []
  if (lessons.length > 0) {
    const list = lessons.map(l => {
      const day = new Date(l.date + 'T12:00:00').toLocaleDateString(dateTag(locale, 'en-US'), { month: 'short', day: 'numeric' })
      return `${day} ${formatTime12h(l.start_time)} (L${bandRange(l.level_min, l.level_max)})`
    }).join(', ')
    parts.push(t('admin.levels.after.outOfBand', { n: lessons.length, list }))
  }
  const sq = data?.squad
  const was = sq?.from || '—'
  if (sq?.status === 'moved') parts.push(t('admin.levels.after.squadMoved', { from: was, to: sq.to || '' }))
  else if (sq?.status === 'no_squad') parts.push(t('admin.levels.after.squadNoSquad', { from: was }))
  else if (sq?.status === 'failed') parts.push(t('admin.levels.after.squadFailed', { from: was, to: sq.to || '' }))
  return parts.join(' ')
}
