'use client'

import { useState } from 'react'
import { LocaleProvider } from '@/lib/i18n/provider'
import SkillTree from '@/app/(public)/dashboard/SkillTree'
import { MAX_LEVEL } from '@/lib/levels'

/* A stable empty map: percentBySkillId sits in the tree's effect dependencies,
   so an inline {} would be a new object on every render and refetch forever. */
const NO_RECORDS: Record<string, number> = {}

export type SkillNotes = Record<string, {
  teach: Record<string, string>
  err: Record<string, string>
}>

/** Every skill shown as passed: this is the programme, not a person.
 *  The map asks the database for the skill list itself (allPassed), so this
 *  page no longer keeps a second copy of it. It used to, and the two drifted:
 *  a skill added after the page had loaded was missing from this page's list
 *  and came back unpassed on a page where everything is meant to be passed. */
export default function CurriculumMapClient({ notes }: { notes: SkillNotes }) {
  const [loc, setLoc] = useState<'zh-Hant' | 'en'>('zh-Hant')
  const [open, setOpen] = useState(false)

  return (
    <div className="p-6 max-w-3xl">
      <h1 className="text-2xl font-bold text-white">Curriculum Map</h1>
      <p className="mt-2 text-sm text-white/60 leading-relaxed">
        每一個級別、每一個技能、以及誰要等誰。這裡的每一格都畫成「已通過」，
        因為這頁講的是課程本身，不是任何一個學生的進度——這裡不會讀到、也不會
        改到任何人的成績。點一個技能會看到通過標準、前置技能、教學重點和最常
        見的錯誤。
      </p>

      <div className="mt-5 flex items-center gap-3">
        <button
          onClick={() => setOpen(true)}
          className="rounded-lg bg-[#c9a84c] px-4 py-2.5 text-sm font-semibold text-[#0b1428]"
        >
          {`打開課程地圖（${MAX_LEVEL} 個級別）`}
        </button>
        <div className="flex overflow-hidden rounded-lg border border-[#1e3a6e]">
          {(['zh-Hant', 'en'] as const).map(l => (
            <button key={l} onClick={() => setLoc(l)}
              className={'px-3 py-2 text-xs font-semibold ' +
                (loc === l ? 'bg-[#1e3a6e] text-white' : 'text-white/50')}>
              {l === 'zh-Hant' ? '中文' : 'EN'}
            </button>
          ))}
        </div>
      </div>

      {open && (
        <LocaleProvider locale={loc} persist={false}>
          <SkillTree
            studentName={loc === 'en' ? 'The whole programme' : '全部課程'}
            currentLevel={MAX_LEVEL}
            currentStage={3}
            percentBySkillId={NO_RECORDS}
            allPassed
            notes={notes}
            forCoach
            onClose={() => setOpen(false)}
          />
        </LocaleProvider>
      )}
    </div>
  )
}
