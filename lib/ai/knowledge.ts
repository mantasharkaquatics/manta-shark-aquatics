import { PLANS, PLAN_GROUPS } from '@/lib/plans'

// Retrieves live data for the AI assistant.
// Two-step queries only (no nested joins) per project convention.
export async function buildKnowledgeBlock(svc: any): Promise<string> {
  const [levelsRes, skillsRes, courseRes] = await Promise.all([
    svc.from('levels').select('id, level_number, name').order('sort_order'),
    svc.from('skills').select('id, name, sort_order, level_id').order('sort_order'),
    svc.from('course_types').select('name, slug, duration_minutes, max_students').eq('is_active', true).order('sort_order'),
  ])
  const levels = levelsRes.data || []
  const skills = skillsRes.data || []
  const courseTypes = courseRes.data || []

  const skillsByLevel = new Map<string, string[]>()
  for (const s of skills) {
    const arr = skillsByLevel.get(s.level_id) || []
    arr.push(s.name)
    skillsByLevel.set(s.level_id, arr)
  }

  const levelLines = levels.map((l: any) =>
    `Level ${l.level_number} - ${l.name}: ${(skillsByLevel.get(l.id) || []).join(', ')}`
  )
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
  ].join('\n')
}
