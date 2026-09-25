import { BRAND, HERO_GRADIENT, FONT_DISPLAY, FONT_BODY } from '@/lib/brand'

// The shared look of every parent-facing page (palette B, 2026-09): a dark
// navy top, light content below, amber for the one action that matters,
// yellow only on dark, the LOGO blue for labels and links on light.
//
// Rendered once by the public layout, so each page only picks class names:
//
//   <BrandRoot>                         -> .b-root (+ .zh for Chinese)
//     <header className="b-hero">       -> dark top
//     <section className="b-sec">       -> white; add b-paper for the pale blue
//     <section className="b-final">     -> dark closing band
//
// Page-specific bits stay in the page, prefixed with its own letter.
const css = `
.b-root { font-family: ${FONT_BODY}; color: ${BRAND.ink}; background: #fff; }
.b-root h1, .b-root h2 { font-family: ${FONT_DISPLAY}; margin: 0; text-wrap: balance; }
.b-root h3, .b-root h4 { margin: 0; font-weight: 700; }
/* Chinese has no true italic -- the browser would only slant the glyphs. */
.b-root.zh h1 em, .b-root.zh h2 em { font-style: normal; }
.b-wrap { max-width: 1120px; margin: 0 auto; padding: 0 24px; }
.b-eyebrow { font-size: 11px; font-weight: 800; letter-spacing: 2.5px; text-transform: uppercase; color: ${BRAND.blue}; margin: 0; }

.b-hero { background: ${HERO_GRADIENT}; color: #fff; position: relative; overflow: hidden; min-height: 460px; }
/* Every page's dark top is the same height, and the logo and the glow are
   pinned to the top edge in pixels -- not centred on the section -- so
   moving between pages nothing in the background jumps or changes size.
   (Owner, 2026-09-25.) A page whose text runs longer only grows downward. */
.b-hero::before { content: ''; position: absolute; pointer-events: none;
  width: 1000px; height: 1000px; left: 50%; top: 230px; transform: translate(-50%, -50%);
  background: url('/logo.png') center / contain no-repeat;
  filter: brightness(0) invert(1); opacity: 0.022; }
.b-hero::after { content: ''; position: absolute; right: -10%; top: -140px; width: 60%; height: 740px; pointer-events: none;
  background: radial-gradient(closest-side, rgba(32,80,160,0.35), transparent); }
.b-hero .b-wrap { position: relative; z-index: 1; padding-top: 72px; padding-bottom: 76px; }
.b-hero .b-eyebrow { color: ${BRAND.yellow}; }
.b-hero h1 { font-size: 48px; line-height: 1.1; font-weight: 900; margin: 14px 0 16px; max-width: 20ch; }
.b-hero h1 em { color: ${BRAND.yellow}; }
.b-lead { font-size: 18px; line-height: 1.65; color: rgba(255,255,255,0.82); max-width: 580px; margin: 0; }
.b-chips { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 22px; }
.b-chips span { font-size: 13px; font-weight: 700; color: #fff; background: rgba(255,255,255,0.08);
  border: 1px solid rgba(255,255,255,0.16); border-radius: 999px; padding: 6px 12px; }
.b-chips span.hi { color: ${BRAND.navy}; background: ${BRAND.yellow}; border-color: ${BRAND.yellow}; }
.b-ctas { display: flex; gap: 12px; flex-wrap: wrap; margin-top: 28px; }

.b-btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; border-radius: 10px;
  font-weight: 700; font-size: 15px; padding: 15px 26px; border: 1.5px solid transparent; cursor: pointer;
  text-decoration: none; font-family: inherit; line-height: 1.2; }
.b-btn:disabled { opacity: 0.6; cursor: wait; }
.b-btn.gold { background: ${BRAND.amber}; color: ${BRAND.navy}; }
.b-btn.gold:hover { background: ${BRAND.amberHover}; }
.b-btn.ghost { border-color: rgba(255,255,255,0.45); color: #fff; background: transparent; }
.b-btn.ghost:hover { background: rgba(255,255,255,0.08); }
.b-btn.line { border-color: ${BRAND.line}; color: ${BRAND.ink}; background: #fff; }
.b-btn.line:hover { border-color: ${BRAND.blue}; color: ${BRAND.blue}; }
.b-btn:focus-visible, .b-link:focus-visible { outline: 3px solid ${BRAND.yellow}; outline-offset: 2px; }

.b-sec { padding: 84px 0; }
.b-paper { background: ${BRAND.paper}; }
.b-head { max-width: 660px; margin-bottom: 36px; }
.b-head h2, .b-h2 { font-size: 36px; line-height: 1.16; margin-top: 10px; font-weight: 800; }
.b-head p:not(.b-eyebrow), .b-body { color: ${BRAND.mute}; font-size: 16px; line-height: 1.75; max-width: 62ch; margin: 14px 0 0; }
.b-card { background: #fff; border: 1px solid ${BRAND.line}; border-radius: 16px; padding: 24px; }
.b-card h3 { font-size: 17px; line-height: 1.35; }
.b-card p { color: ${BRAND.mute}; font-size: 14px; line-height: 1.65; margin: 8px 0 0; }
.b-link { color: ${BRAND.blue}; font-weight: 700; text-decoration: none; border-bottom: 1.5px solid ${BRAND.amber}; }
.b-link:hover { color: ${BRAND.navy}; }

.b-final { background: ${HERO_GRADIENT}; color: #fff; text-align: center; padding: 84px 0; }
.b-final h2 { font-size: 40px; line-height: 1.14; font-weight: 900; }
.b-final h2 em { color: ${BRAND.yellow}; }
.b-final p { color: rgba(255,255,255,0.8); margin: 14px auto 0; max-width: 520px; line-height: 1.65; }
.b-final .b-ctas { justify-content: center; }
.b-final .b-small { font-size: 13px; color: rgba(255,255,255,0.55); margin-top: 26px; }
.b-final .b-small a { color: ${BRAND.yellow}; font-weight: 700; text-decoration: none; }

@media (max-width: 900px) {
  .b-hero .b-wrap { padding-top: 48px; padding-bottom: 56px; }
  .b-hero h1 { font-size: 34px; }
  .b-hero { min-height: 0; }
  .b-hero::before { width: 480px; height: 480px; top: 200px; }
  .b-lead { font-size: 16.5px; }
  .b-sec, .b-final { padding: 60px 0; }
  .b-head h2, .b-h2 { font-size: 28px; }
  .b-final h2 { font-size: 30px; }
}
@media (max-width: 520px) {
  .b-ctas .b-btn { flex: 1; }
}
@media (prefers-reduced-motion: reduce) {
  .b-root * { transition: none !important; }
}
`

export default function BrandStyles() {
  return <style dangerouslySetInnerHTML={{ __html: css }} />
}
