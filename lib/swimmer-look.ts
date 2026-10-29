/* The app's 3D swimmer (owner, 2026-10-29): what each child's character wears.
 *
 * Stored per swimmer in students.avatar_look (docs/migration-swimmer-look.sql),
 * written only by POST /api/parent/swimmer-look, which anyone in the family may
 * call -- view-only members too (owner: changing clothes costs nothing).
 * A swimmer with no saved look gets one from students.gender, with colours
 * picked from the swimmer's id so two children in one family differ. Families
 * are not asked a gender (owner, 2026-10-29), so a swimmer with neither asks
 * on the card which look to start from -- saved as the look, never as the
 * gender.
 *
 * Every value is from a fixed list; cleanLook() refuses anything else, so the
 * column can never hold more than these few words and colours. */

export type Gender = 'male' | 'female'
export const isGender = (v: unknown): v is Gender => v === 'male' || v === 'female'

export const SKINS = ['#f6d7bf', '#f3c9a8', '#dca27c', '#a8714d', '#7a4e33'] as const
export const HAIR_COLORS = ['#2b1d16', '#5a3825', '#a86b3c', '#e0b467', '#1d2a44'] as const
export const SUIT_COLORS = ['#2050a0', '#12254a', '#e5484d', '#f09800', '#16a37a', '#8a4fd8', '#ff7aa8', '#21b5d6'] as const
export const GEAR_COLORS = ['#f09800', '#2050a0', '#e5484d', '#16a37a', '#ff7aa8', '#ffffff', '#12254a', '#21b5d6'] as const

export const HAIRS = ['short', 'spiky', 'bob', 'ponytail', 'buns'] as const
export const SUITS = ['brief', 'jammer', 'onepiece'] as const
export const GOGGLES = ['none', 'eyes', 'forehead'] as const

export interface SwimmerLook {
  gender: 'boy' | 'girl'
  skin: string
  hair: typeof HAIRS[number]
  hairColor: string
  suit: typeof SUITS[number]
  suitColor: string
  goggles: typeof GOGGLES[number]
  goggleColor: string
  cap: boolean
  capColor: string
  fins: boolean
  finColor: string
}

/** A small, stable number from a swimmer's id. */
function seed(id: string) {
  let h = 2166136261
  for (let i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 16777619) }
  return h >>> 0
}

/** The look a swimmer starts with, or null when there is no gender to start from. */
export function defaultLook(id: string, gender: string | null | undefined): SwimmerLook | null {
  if (!isGender(gender)) return null
  const s = seed(id)
  const pick = <T,>(list: readonly T[], k: number) => list[(s >>> k) % list.length]
  const boy = gender === 'male'
  return {
    gender: boy ? 'boy' : 'girl',
    skin: SKINS[1],
    hair: boy ? 'short' : 'ponytail',
    hairColor: HAIR_COLORS[0],
    suit: boy ? 'jammer' : 'onepiece',
    suitColor: pick(SUIT_COLORS, 3),
    goggles: 'forehead',
    goggleColor: pick(GEAR_COLORS, 7),
    cap: false,
    capColor: GEAR_COLORS[1],
    fins: false,
    finColor: GEAR_COLORS[3],
  }
}

/** A look from the browser or the database, or null if any part is not ours. */
export function cleanLook(v: unknown): SwimmerLook | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null
  const o = v as Record<string, unknown>
  const one = <T extends string>(list: readonly T[], x: unknown): x is T => typeof x === 'string' && (list as readonly string[]).includes(x)
  if (!one(['boy', 'girl'] as const, o.gender)) return null
  if (!one(SKINS, o.skin) || !one(HAIRS, o.hair) || !one(HAIR_COLORS, o.hairColor)) return null
  if (!one(SUITS, o.suit) || !one(SUIT_COLORS, o.suitColor)) return null
  if (!one(GOGGLES, o.goggles) || !one(GEAR_COLORS, o.goggleColor)) return null
  if (typeof o.cap !== 'boolean' || !one(GEAR_COLORS, o.capColor)) return null
  if (typeof o.fins !== 'boolean' || !one(GEAR_COLORS, o.finColor)) return null
  return {
    gender: o.gender, skin: o.skin, hair: o.hair, hairColor: o.hairColor, suit: o.suit, suitColor: o.suitColor,
    goggles: o.goggles, goggleColor: o.goggleColor, cap: o.cap, capColor: o.capColor, fins: o.fins, finColor: o.finColor,
  }
}

/** What a swimmer's card shows: the saved look, else the default, else null (ask boy or girl). */
export function lookOf(s: { id: string; gender?: string | null; avatar_look?: unknown }): SwimmerLook | null {
  return cleanLook(s.avatar_look) ?? defaultLook(s.id, s.gender)
}
