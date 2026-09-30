'use client'

import { LEVEL_NAMES, LEVEL_NUMBERS } from '@/lib/levels'

export type AssessmentRec = { course?: string; frequency?: string; note: string }

const COURSES: { value: string; label: string }[] = [
  { value: '1on1', label: '1-on-1' },
  { value: '1on2', label: '1-on-2' },
  { value: '1on4', label: 'Group 1-on-4' },
  { value: 'team', label: 'Swim Team' },
]
const FREQUENCIES: { value: string; label: string }[] = [
  { value: '1', label: '1× / week' },
  { value: '1-2', label: '1–2× / week' },
  { value: '2', label: '2× / week' },
  { value: '2-3', label: '2–3× / week' },
  { value: '3', label: '3× / week' },
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
  const placed = String(level || recommendedLevel)
  const chip = (on: boolean) => `px-2.5 py-1 rounded-lg border text-xs font-medium transition-all ${on
    ? 'border-[#c9a84c] bg-[#c9a84c]/20 text-[#c9a84c]'
    : 'border-[#1e3a6e] text-gray-500 hover:border-[#c9a84c]/40'}`
  return (
    <div className="mb-4 rounded-lg border border-[#c9a84c]/40 bg-[#c9a84c]/5 p-3">
      <p className="text-[#c9a84c] text-xs font-semibold uppercase tracking-wider mb-1">
        Swim Assessment · Coach recommends L{recommendedLevel} · {LEVEL_NAMES[String(recommendedLevel)]}
      </p>
      <p className="text-gray-500 text-xs mb-2">The level, the note and the skills below publish together. Skills were scored against L{recommendedLevel}.</p>
      {level && level !== String(recommendedLevel) && (
        <p className="text-amber-400 text-xs mb-2">Placing them in L{level} instead: the family will see L{level}&apos;s skills at 0 until their next lesson is scored.</p>
      )}
      <div className="flex flex-wrap gap-1.5">
        {LEVEL_NUMBERS.map(n => (
          <button key={n} onClick={() => onLevel(String(n))} className={chip(placed === String(n))}>L{n}</button>
        ))}
      </div>

      <div className="mt-4 pt-3 border-t border-[#c9a84c]/20">
        <p className="text-[#c9a84c] text-xs font-semibold uppercase tracking-wider mb-1">Recommend to the family</p>
        <p className="text-gray-500 text-xs mb-2">Shown on their Assessment report. Both are required.</p>
        <div className="flex flex-wrap gap-1.5 mb-2">
          {COURSES.map(c => (
            <button key={c.value} onClick={() => onRec({ ...rec, course: c.value })} className={chip(rec.course === c.value)}>{c.label}</button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5 mb-2">
          {FREQUENCIES.map(f => (
            <button key={f.value} onClick={() => onRec({ ...rec, frequency: f.value })} className={chip(rec.frequency === f.value)}>{f.label}</button>
          ))}
        </div>
        <textarea
          value={rec.note}
          onChange={e => onRec({ ...rec, note: e.target.value.slice(0, RECOMMENDATION_NOTE_MAX) })}
          rows={2}
          placeholder="Why, in one line (optional). Any language; the family reads it in theirs."
          className="w-full rounded-lg bg-[#0a1428] border border-[#1e3a6e] text-gray-200 text-sm px-3 py-2 placeholder:text-gray-600 focus:outline-none focus:border-[#c9a84c]/60"
        />
      </div>
    </div>
  )
}
