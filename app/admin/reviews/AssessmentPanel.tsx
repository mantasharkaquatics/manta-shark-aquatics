'use client'

import { LEVEL_NAMES, LEVEL_NUMBERS } from '@/lib/levels'
import { useT } from '@/lib/i18n/provider'

export type AssessmentRec = { course?: string; frequency?: string; note: string }

const COURSES: { value: string; labelKey: string }[] = [
  { value: '1on1', labelKey: 'assess.course.1on1' },
  { value: '1on2', labelKey: 'assess.course.1on2' },
  { value: '1on4', labelKey: 'admin.reviews.course.group' },
  { value: 'team', labelKey: 'assess.course.team' },
]
const FREQUENCIES: { value: string; labelKey: string }[] = [
  { value: '1', labelKey: 'admin.reviews.freq.1' },
  { value: '1-2', labelKey: 'admin.reviews.freq.1-2' },
  { value: '2', labelKey: 'admin.reviews.freq.2' },
  { value: '2-3', labelKey: 'admin.reviews.freq.2-3' },
  { value: '3', labelKey: 'admin.reviews.freq.3' },
]
export const RECOMMENDATION_NOTE_MAX = 300

/**
 * The assessment half of a Reviews card: the level the swimmer is placed in,
 * and what the school recommends to the family -- which course and how often,
 * with an optional line on why. The family reads all of it in their
 * Assessment report (lib/assessments), translated into their language.
 */
export default function AssessmentPanel({ recommendedLevel, level, onLevel, rec, onRec }: {
  recommendedLevel: number
  level: string | undefined
  onLevel: (n: string) => void
  rec: AssessmentRec
  onRec: (next: AssessmentRec) => void
}) {
  const t = useT()
  const placed = String(level || recommendedLevel)
  const chip = (on: boolean) => `px-2.5 py-1 rounded-lg border text-xs font-medium transition-all ${on
    ? 'border-[#c9a84c] bg-[#c9a84c]/20 text-[#c9a84c]'
    : 'border-[#1e3a6e] text-gray-500 hover:border-[#c9a84c]/40'}`
  return (
    <div className="mb-4 rounded-lg border border-[#c9a84c]/40 bg-[#c9a84c]/5 p-3">
      <p className="text-[#c9a84c] text-xs font-semibold uppercase tracking-wider mb-1">
        {t('admin.reviews.assess.heading', { n: recommendedLevel, name: LEVEL_NAMES[String(recommendedLevel)] ? t(`level.${recommendedLevel}.name`) : '' })}
      </p>
      <p className="text-gray-500 text-xs mb-2">{t('admin.reviews.assess.publishTogether', { n: recommendedLevel })}</p>
      {level && level !== String(recommendedLevel) && (
        <p className="text-amber-400 text-xs mb-2">{t('admin.reviews.assess.placingInstead', { n: level })}</p>
      )}
      <div className="flex flex-wrap gap-1.5">
        {LEVEL_NUMBERS.map(n => (
          <button key={n} onClick={() => onLevel(String(n))} className={chip(placed === String(n))}>L{n}</button>
        ))}
      </div>

      <div className="mt-4 pt-3 border-t border-[#c9a84c]/20">
        <p className="text-[#c9a84c] text-xs font-semibold uppercase tracking-wider mb-1">{t('admin.reviews.assess.recommendHeading')}</p>
        <p className="text-gray-500 text-xs mb-2">{t('admin.reviews.assess.recommendHint')}</p>
        <div className="flex flex-wrap gap-1.5 mb-2">
          {COURSES.map(c => (
            <button key={c.value} onClick={() => onRec({ ...rec, course: c.value })} className={chip(rec.course === c.value)}>{t(c.labelKey)}</button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5 mb-2">
          {FREQUENCIES.map(f => (
            <button key={f.value} onClick={() => onRec({ ...rec, frequency: f.value })} className={chip(rec.frequency === f.value)}>{t(f.labelKey)}</button>
          ))}
        </div>
        <textarea
          value={rec.note}
          onChange={e => onRec({ ...rec, note: e.target.value.slice(0, RECOMMENDATION_NOTE_MAX) })}
          rows={2}
          placeholder={t('admin.reviews.assess.notePlaceholder')}
          className="w-full rounded-lg bg-[#0a1428] border border-[#1e3a6e] text-gray-200 text-sm px-3 py-2 placeholder:text-gray-600 focus:outline-none focus:border-[#c9a84c]/60"
        />
      </div>
    </div>
  )
}
