// The 21 ribbons: one per level per stage.
//
// A stage is what a family actually watches move, so finishing one earns
// something you can look at. Seven levels give seven colours -- the same
// LEVEL_COLORS the rest of the site already uses -- and the three stages
// inside a level are the light, plain and dark shade of that colour, so a
// ribbon says which level AND which stage without a word on it.
//
// Two notes on the colours, both learned by putting all 21 side by side:
//
//  - The dark shade is mixed toward pure black, not toward a warm near-black.
//    A warm dark turns every yellow into brown, and L3 and L7 (yellow and
//    gold) became the same ribbon.
//  - L3 was #d4a825 and sat one notch from L7's #c9a84c, which is also the
//    site's brand gold. L3 moved to a clean bright yellow and L7 keeps the
//    gold but is drawn with a metal gradient, so the last level reads as a
//    real medal instead of a second yellow.
import { LEVEL_COLORS } from './levels'

const hex2rgb = (h: string) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16))
const rgb2hex = (r: number[]) =>
  '#' + r.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')

/** Blend `hex` toward `target` by `amount` (0..1). */
export function mixHex(hex: string, target: string, amount: number): string {
  const a = hex2rgb(hex), b = hex2rgb(target)
  return rgb2hex(a.map((v, i) => v + (b[i] - v) * amount))
}

/** Relative luminance, WCAG. */
function luminance(hex: string): number {
  const c = hex2rgb(hex).map(v => v / 255)
    .map(v => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)))
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
}

/** Text colour to put ON a level colour. White on the yellows scored 1.7:1 --
 *  unreadable -- so the choice is made by luminance rather than by habit. */
export function onColor(hex: string, dark = '#20160a', light = '#ffffff'): string {
  const l = luminance(hex)
  const cDark = (l + 0.05) / (luminance(dark) + 0.05)
  const cLight = (luminance(light) + 0.05) / (l + 0.05)
  return cDark >= cLight ? dark : light
}

/** The ribbon colour for one level and stage: 1 light, 2 plain, 3 dark. */
export function stageColor(level: number | string, stage: number | string): string {
  const base = LEVEL_COLORS[String(level)] || '#7a88a0'
  const st = Number(stage)
  if (st <= 1) return mixHex(base, '#ffffff', 0.34)
  if (st >= 3) return mixHex(base, '#000000', 0.28)
  return base
}

/** Only the last level is drawn as metal. */
export function isMetalLevel(level: number | string): boolean {
  return Number(level) === 7
}

/** A stage is earned when every skill in it is at 100. */
export function stageEarned(percents: number[]): boolean {
  return percents.length > 0 && percents.every(p => p >= 100)
}
