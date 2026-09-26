// The parent-facing palette ("B", chosen by the owner 2026-09-25): the LOGO's
// own blue and amber on a deep navy, with light content areas. The logo's red
// stays in the logo -- on a swim school's buttons it reads as danger.
//
// Rules that go with it:
//   - AMBER is for the one action that matters on a screen (Book, Create
//     account). Text on amber is NAVY, never white: white on amber is 2.3:1.
//   - YELLOW is for small labels and emphasis on dark grounds only.
//   - Dark grounds are for the top of a page; long reading sits on PAPER/white.
export const BRAND = {
  navy: '#12254a',      // page tops, nav, dark cards
  navyDeep: '#0e1d3b',  // footer, deepest dark
  navyMid: '#1d3f7c',   // end of the hero gradient
  blue: '#2050a0',      // LOGO blue: links, labels and accents on light grounds
  amber: '#f09800',     // LOGO amber: the primary button
  amberHover: '#d98900',
  yellow: '#f7b733',    // eyebrows and emphasis on dark grounds
  ink: '#16294a',       // body text on light grounds
  mute: '#56647d',      // secondary text on light grounds
  line: '#e3ebf6',      // borders on light grounds
  paper: '#f6f9fd',     // light section background
  white: '#ffffff',
} as const

export const HERO_GRADIENT = `linear-gradient(160deg, ${BRAND.navy} 0%, ${BRAND.navyMid} 100%)`

/** Font stacks. The Latin faces come from next/font in the root layout; Chinese
 *  falls through to the system's own (PingFang on Apple, JhengHei on Windows). */
export const FONT_DISPLAY = "var(--font-display), 'PingFang TC', 'Noto Sans TC', 'Microsoft JhengHei', serif"
export const FONT_BODY = "var(--font-body), 'PingFang TC', 'Noto Sans TC', 'Microsoft JhengHei', sans-serif"

/* The two marks of the site (owner, 2026-09-26, "A + B"):
 *
 *  WAKE -- the bottom edge of every dark page top is cut into a wide arrow, as
 *  if a swimmer had just gone through, with two faint ripple lines under it.
 *  It is drawn as the hero's top background layer: a strip filled with the
 *  colour of the section that follows, so the navy above looks cut. `fill`
 *  must be that colour.
 *
 *  CHEVRON -- a small "›" used after the name in the nav and in front of every
 *  eyebrow label, in the colour of the text it sits with. */
const WAKE_SVG = (fill: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1440 130" preserveAspectRatio="none">` +
  `<path d="M0 40 L1037 100 L1440 28 L1440 130 L0 130 Z" fill="${fill}"/>` +
  `<path d="M0 54 L1037 114 L1440 42" fill="none" stroke="#2050a0" stroke-opacity=".32" stroke-width="1.6" vector-effect="non-scaling-stroke"/>` +
  `<path d="M0 68 L1037 128 L1440 56" fill="none" stroke="#2050a0" stroke-opacity=".16" stroke-width="1.2" vector-effect="non-scaling-stroke"/>` +
  `</svg>`
export const wakeImage = (fill: string) => `url("data:image/svg+xml,${encodeURIComponent(WAKE_SVG(fill))}")`

export const CHEVRON_MASK = `url("data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 12 14"><path d="M2.5 1.5 L9 7 L2.5 12.5" fill="none" stroke="#000" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/></svg>'
)}")`
