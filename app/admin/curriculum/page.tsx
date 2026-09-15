/*
 * The whole curriculum, as the map, for whoever runs the school.
 *
 * Not a student's map with the colours turned off: every skill is shown as
 * passed on purpose, because this page answers "what does the programme
 * contain and what waits on what", not "how is anyone doing". Nothing here
 * reads or writes a student record.
 *
 * The teaching notes come from docs/coaching-content.json -- the same file the
 * coaching handbook is built from -- so the map and the handbook cannot drift.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import CurriculumMapClient, { type SkillNotes } from './CurriculumMapClient'

export const metadata = { title: 'Curriculum Map' }

export default function AdminCurriculumPage() {
  const raw = JSON.parse(
    readFileSync(join(process.cwd(), 'docs/coaching-content.json'), 'utf8'),
  ) as { skills: Record<string, { teach?: Record<string, string>; err?: Record<string, string> }> }

  const notes: SkillNotes = {}
  for (const [id, v] of Object.entries(raw.skills || {})) {
    notes[id] = {
      teach: { 'zh-Hant': v.teach?.['zh-Hant'] || '', en: v.teach?.en || '' },
      err: { 'zh-Hant': v.err?.['zh-Hant'] || '', en: v.err?.en || '' },
    }
  }
  return <CurriculumMapClient notes={notes} />
}
