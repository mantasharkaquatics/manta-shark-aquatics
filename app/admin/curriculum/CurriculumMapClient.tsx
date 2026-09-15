'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { LocaleProvider } from '@/lib/i18n/provider'
import SkillTree from '@/app/(public)/dashboard/SkillTree'
import { MAX_LEVEL } from '@/lib/levels'

export type SkillNotes = Record<string, {
  teach: Record<string, string>
  err: Record<string, string>
}>

/** Every skill shown as passed: this is the programme, not a person. */
export default function CurriculumMapClient({ notes }: { notes: SkillNotes }) {
  const supabase = useMemo(() => createClient(), [])
  const [ids, setIds] = useState<string[] | null>(null)
  const [loc, setLoc] = useState<'zh-Hant' | 'en'>('zh-Hant')
  const [open, setOpen] = useState(false)

  useEffect(() => {
    let alive = true
    ;(async () => {
      const { data } = await supabase.from('skills').select('id').eq('is_active', true)
      if (alive) setIds((data || []).map(r => String(r.id)))
    })()
    return () => { alive = false }
  }, [supabase])

  const percents = useMemo(() => {
    const out: Record<string, number> = {}
    for (const id of ids || []) out[id] = 100
    return out
  }, [ids])

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
          disabled={!ids}
          className="rounded-lg bg-[#c9a84c] px-4 py-2.5 text-sm font-semibold text-[#0b1428] disabled:opacity-50"
        >
          {ids ? `打開課程地圖（${ids.length} 個技能 · ${MAX_LEVEL} 個級別）` : '載入中…'}
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

      {open && ids && (
        <LocaleProvider locale={loc} persist={false}>
          <SkillTree
            studentName={loc === 'en' ? 'The whole programme' : '全部課程'}
            currentLevel={MAX_LEVEL}
            currentStage={3}
            percentBySkillId={percents}
            notes={notes}
            forCoach
            onClose={() => setOpen(false)}
          />
        </LocaleProvider>
      )}
    </div>
  )
}
