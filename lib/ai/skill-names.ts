import { tDb, type Locale } from '@/lib/i18n'

// The curriculum's skill names, as fixed vocabulary for the note polish and the
// note translation. A coach says "岸上打水" or "kick on the side"; the family
// should read the skill's official name in their language -- 岸上打水 /
// Flutter Kick on Deck -- never a paraphrase or a half-English mix.

export type SkillRef = { id: string; name: string }

/** Active skills of a level (by level number), or of the swimmer's current level. */
export async function levelSkills(svc: any, opts: { level?: string | number | null; studentId?: string }): Promise<SkillRef[]> {
  let level = opts.level
  if (level == null && opts.studentId) {
    const { data: st } = await svc.from('students').select('current_level').eq('id', opts.studentId).maybeSingle()
    level = st?.current_level ?? null
  }
  if (level == null) return []
  const { data: lvl } = await svc.from('levels').select('id').eq('level_number', level).maybeSingle()
  if (!lvl) return []
  const { data } = await svc.from('skills').select('id, name').eq('level_id', lvl.id).eq('is_active', true)
  return (data || []) as SkillRef[]
}

const nameIn = (lang: string, s: SkillRef) => tDb(lang as Locale, 'skills', s.id, s.name)

/** Lines for the polish prompt: each skill's name in the note's language, with the other names a coach may use for it. */
export function skillLinesFor(lang: string, skills: SkillRef[]): string {
  return skills.map(s => {
    const official = nameIn(lang, s)
    const others = [...new Set(['en', 'zh-Hant', 'zh-Hans'].map(l => nameIn(l, s)))].filter(n => n !== official)
    return `- ${official}${others.length ? ` (may be said as: ${others.join(' / ')})` : ''}`
  }).join('\n')
}

/** Lines for the translation prompt: source-language name -> target-language name. */
export function skillPairsFor(from: string, to: string, skills: SkillRef[]): string {
  return skills.map(s => `- ${nameIn(from, s)} -> ${nameIn(to, s)}`).join('\n')
}
