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
