import { PLANS, PLAN_GROUPS } from '@/lib/plans'
import { FAQ_IDS } from '@/lib/faq'
import { translate } from '@/lib/i18n'

// Retrieves live data for the AI assistant.
// Two-step queries only (no nested joins) per project convention.
export async function buildKnowledgeBlock(svc: any): Promise<string> {
  const [levelsRes, skillsRes, courseRes] = await Promise.all([
    svc.from('levels').select('id, level_number, name').order('sort_order'),
    svc.from('skills').select('id, name, sort_order, level_id, stage').order('stage').order('sort_order'),
    svc.from('course_types').select('name, slug, duration_minutes, max_students').eq('is_active', true).order('sort_order'),
  ])
  const levels = levelsRes.data || []
  const skills = skillsRes.data || []
  const courseTypes = courseRes.data || []

  // Grouped by stage, because "which stage is my child on" is the question
  // families actually ask -- a flat list of names cannot answer it.
  const skillsByLevel = new Map<string, Map<number, string[]>>()
  for (const s of skills) {
    const byStage = skillsByLevel.get(s.level_id) || new Map<number, string[]>()
    const stage = Number(s.stage) || 1
    const arr = byStage.get(stage) || []
    arr.push(s.name)
    byStage.set(stage, arr)
    skillsByLevel.set(s.level_id, byStage)
  }

  const levelLines = levels.map((l: any) => {
    const byStage = skillsByLevel.get(l.id)
    if (!byStage) return `Level ${l.level_number} - ${l.name}`
    const stages = [...byStage.entries()].sort((a, b) => a[0] - b[0])
      .map(([stage, names]) => `Stage ${stage}: ${names.join(', ')}`)
    return `Level ${l.level_number} - ${l.name} (taught in 3 stages; a swimmer starts every level at Stage 1) | ${stages.join(' | ')}`
  })
  const courseLines = courseTypes.map((c: any) =>
    `${c.name}: ${c.duration_minutes} minutes per lesson, up to ${c.max_students} student(s) per coach`
  )
  const planLines = PLAN_GROUPS.flatMap(g =>
    g.keys.map(k => {
      const p = PLANS[k]
      return `${p.name}: $${(p.amount / 100).toLocaleString('en-US')} (${p.sessions} sessions)`
    })
  )

  return [
    '=== SWIM LEVELS & SKILLS ===',
    ...levelLines,
    '',
    '=== LESSON TYPES ===',
    ...courseLines,
    '',
    '=== PRICING ===',
    ...planLines,
    '',
    // The same answers the /faq page shows, from the same dictionary keys. If a
    // parent reads an answer on the site and then asks the assistant the same
    // thing, they get one answer, not two. English only: the rest of this block
    // and the system prompt are English, and the assistant replies in the
    // family's language from there.
    '=== COMMON QUESTIONS (answer in the family\'s language; these are the wordings we publish) ===',
    ...FAQ_IDS.map(id => `Q: ${translate('en', 'faq.q.' + id)}\nA: ${translate('en', 'faq.a.' + id)}`),
  ].join('\n')
}
