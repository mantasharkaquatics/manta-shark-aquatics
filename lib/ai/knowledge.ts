import { TRIAL_PRICE_CENTS } from '@/lib/plans'
import {
  ASSESSMENT_POINTS, BASE_POINTS, LESSONS_PER_FORGIVENESS, MIN_TOPUP_DOLLARS,
  MAX_TOPUP_DOLLARS, OFF_PEAK_DISCOUNT, VIP_TIERS,
} from '@/lib/points'
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
  // Pricing comes from lib/points.ts, the same module that charges the wallet,
  // so the assistant cannot quote a price the booking page will not honour.
  const priceLines = [
    'Lessons are paid for out of a points wallet. 1 point = US$1, fixed. Points never expire and unused points can be refunded at any time for what was paid.',
    `Top up any amount from $${MIN_TOPUP_DOLLARS} to $${MAX_TOPUP_DOLLARS.toLocaleString('en-US')}. There is no volume discount on the purchase — see the two discounts below, which are applied when a lesson is booked.`,
    `Swim Assessment (one per swimmer, 30 min, 1-on-1): $${(TRIAL_PRICE_CENTS / 100).toFixed(0)} paid by card, not from the wallet. It is required before any lesson can be booked, because the booking calendar needs the swimmer's level. (Internally it is worth ${ASSESSMENT_POINTS} points.)`,
    'Base price per swimmer per 30 minutes, before discounts:',
    ...Object.entries(BASE_POINTS).map(([slug, pts]) => `  ${slug}: ${pts} points ($${pts})`),
    'A 60-minute lesson costs exactly twice a 30-minute one. A 1-on-2 with two children from the same family pays for two swimmers.',
    'Swim Team is a monthly membership billed to a card and is never paid for with points.',
    `VIP discount, off every lesson, by lessons completed on the account (this is retroactive — it applies to points already in the wallet): ${
      VIP_TIERS.filter(t => t.level > 0).sort((a, b) => a.level - b.level)
        .map(t => `VIP ${t.level} at ${t.lessons} lessons = ${Math.round(t.discount * 100)}% off`).join('; ')
    }.`,
    `Off-peak discount: ${Math.round(OFF_PEAK_DISCOUNT * 100)}% off, judged on the time the lesson starts. Mon-Fri 6:00-12:00 and 19:30-21:00; Sat-Sun 6:00-10:00 and 19:30-21:00. The booking calendar marks these slots.`,
    'Discounts multiply and the result is rounded down, so the remainder always favours the family.',
    `Cancelling more than 24 hours ahead returns the points in full. Within 24 hours the points are not returned, unless the family spends a late-cancellation allowance — they earn one for every ${LESSONS_PER_FORGIVENESS} lessons completed, and they choose whether to use it.`,
  ]

  return [
    '=== SWIM LEVELS & SKILLS ===',
    ...levelLines,
    '',
    '=== LESSON TYPES ===',
    ...courseLines,
    '',
    '=== PRICING (points) ===',
    ...priceLines,
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
