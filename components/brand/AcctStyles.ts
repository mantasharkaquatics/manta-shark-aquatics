import { BRAND, FONT_BODY, FONT_DISPLAY } from '@/lib/brand'

/* The pages a parent reaches from the account menu (我的帳戶, 共同預約).
   Palette B, matched to the parent home page: a light page that starts under
   the floating nav, white cards, blue labels and links, amber for the one
   button that does the thing. Shared so the two pages cannot drift apart. */
export const ACCT_CSS = `
.ac-root { font-family: ${FONT_BODY}; min-height: 100vh; color: ${BRAND.ink};
  background: linear-gradient(180deg, #f4f7fb 0, #e9eff7 640px);
  margin-top: calc(-1 * var(--nav-space, 0px)); padding-top: var(--nav-space, 0px); }
.ac-loading { display: grid; place-items: center; font-size: 14px; color: ${BRAND.mute}; }
.ac-wrap { max-width: 680px; margin: 0 auto; padding: clamp(28px,4vw,44px) clamp(20px,5vw,40px) 72px; }
.ac-back { display: inline-flex; align-items: center; gap: 6px; font-size: 13.5px; font-weight: 700; color: ${BRAND.blue}; text-decoration: none; }
.ac-back:hover { text-decoration: underline; }
.ac-h1 { font-family: ${FONT_DISPLAY}; font-size: clamp(28px,3vw,36px); font-weight: 900; color: ${BRAND.navy}; margin: 14px 0 6px; line-height: 1.15; }
.ac-sub { font-size: 15px; color: ${BRAND.mute}; margin: 0; line-height: 1.6; }
.ac-head { margin-bottom: 28px; }
.ac-stack { display: flex; flex-direction: column; gap: 14px; }
.ac-card { background: #fff; border: 1px solid ${BRAND.line}; border-radius: 16px; padding: 22px;
  box-shadow: 0 6px 18px rgba(18,37,74,0.06); }
.ac-label { font-size: 12px; font-weight: 800; letter-spacing: 1.5px; text-transform: uppercase; color: ${BRAND.blue}; margin: 0 0 6px; }
.ac-desc { font-size: 14px; color: ${BRAND.mute}; margin: 0 0 16px; line-height: 1.55; }
.ac-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 16px; margin-top: 12px; }
.ac-k { font-size: 11.5px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; color: #5f6b80; margin-bottom: 4px; }
.ac-v { font-size: 15px; font-weight: 600; color: ${BRAND.ink}; overflow-wrap: anywhere; }
.ac-row { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
.ac-row b { display: block; font-size: 15.5px; color: ${BRAND.navy}; margin-bottom: 3px; }
.ac-row small { font-size: 13.5px; color: ${BRAND.mute}; }
.ac-item { display: flex; align-items: center; justify-content: space-between; gap: 12px; background: ${BRAND.paper};
  border: 1px solid ${BRAND.line}; border-radius: 12px; padding: 13px 15px; }
.ac-item b { display: block; font-size: 15px; color: ${BRAND.navy}; }
.ac-item small { font-size: 13px; color: ${BRAND.mute}; }
.ac-kid { padding: 9px 12px; gap: 10px; }
.ac-kid .nm { min-width: 0; display: flex; flex-wrap: wrap; align-items: baseline; gap: 2px 8px; }
.ac-kid .nm b { margin: 0; font-size: 15px; }
.ac-kid .nm small { font-size: 12.5px; }
.ac-kid .nm .ac-tag { margin: 0; }
.ac-kid .hl { flex: none; max-width: 55%; overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; text-align: right; font-size: 12px; font-weight: 700;
  border-radius: 999px; padding: 3px 9px; background: #e8f5ef; color: #1f7a57; }
.ac-kid .hl.bad { background: #fdecea; color: #b4321f; }
.ac-kid .hl.note { background: #fff6e5; color: #8a5300; }
.ac-kid .hls { flex: none; max-width: 55%; display: flex; flex-direction: column; align-items: flex-end; gap: 4px; }
.ac-kid .hls .hl { max-width: 100%; }
.ac-kid .hl.sup { background: #ece8fb; color: #4b3a9a; }
/* Inside the app (owner, 2026-11-04): the account pages start right under
   the top bar, with a smaller heading, and do not bounce. */
html.msa-app .ac-wrap { padding: 10px 16px 16px; }
html.msa-app .ac-head { margin-bottom: 12px; }
html.msa-app .ac-h1 { font-size: 24px; margin: 4px 0 2px; }
html.msa-app .ac-sub { font-size: 13.5px; }
html.msa-app .ac-card { padding: 16px; }
html.msa-app:has(.ac-root), html.msa-app:has(.ac-root) body { overscroll-behavior: none; }
html.msa-app .ac-stack { gap: 10px; }
html.msa-app .ac-desc { font-size: 13px; margin-bottom: 10px; }
html.msa-app .ac-empty { display: grid; grid-template-columns: auto 1fr; column-gap: 12px; row-gap: 2px; align-items: center; text-align: left; padding: 12px 14px; }
html.msa-app .ac-empty .ac-icon { grid-row: span 2; margin: 0 !important; }
html.msa-app .ac-empty .ac-sub { font-size: 13px !important; }
@media (max-height: 720px) {
  html.msa-app .ac-wrap { padding-top: 6px; }
  html.msa-app .ac-card { padding: 12px 14px; }
  html.msa-app .ac-head { margin-bottom: 8px; }
}
.ac-tag { font-size: 12px; font-weight: 700; color: ${BRAND.blue}; margin-top: 2px; }
.ac-muted { font-size: 12.5px; color: #5f6b80; }
.ac-note { font-size: 13px; color: ${BRAND.mute}; margin: 14px 0; }
.ac-input { width: 100%; box-sizing: border-box; background: #fff; border: 1px solid #d5e0ef; border-radius: 10px; padding: 11px 14px;
  font-family: inherit; font-size: 15px; color: ${BRAND.ink}; outline: none; transition: border-color .15s, box-shadow .15s; }
.ac-input:focus { border-color: ${BRAND.blue}; box-shadow: 0 0 0 3px rgba(32,80,160,0.15); }
.ac-input::placeholder { color: #9aa6ba; }
.ac-flabel { display: block; font-size: 13px; font-weight: 700; color: ${BRAND.ink}; margin-bottom: 6px; }
.ac-btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px; border-radius: 10px; padding: 11px 18px;
  font-family: inherit; font-size: 14px; font-weight: 800; cursor: pointer; border: 1px solid transparent; transition: background .15s, border-color .15s; }
.ac-btn:disabled { opacity: .5; cursor: not-allowed; }
.ac-btn.gold { background: ${BRAND.amber}; color: ${BRAND.navy}; }
.ac-btn.gold:hover:not(:disabled) { background: ${BRAND.amberHover}; }
.ac-btn.line { background: #fff; color: ${BRAND.ink}; border-color: #d5e0ef; }
.ac-btn.line:hover:not(:disabled) { border-color: #b7c7de; }
.ac-btn.ok { background: #2e9d6a; color: #fff; }
.ac-btn.danger { background: #fff; color: #c0392b; border-color: #f5c2bd; }
.ac-btn.danger:hover { background: #fdf1ef; }
.ac-btn.dangerFill { background: #c0392b; color: #fff; }
.ac-btn.block { width: 100%; }
.ac-add { width: 100%; border: 1.5px dashed #a9bfdc; background: transparent; color: ${BRAND.blue}; border-radius: 12px; padding: 13px;
  font-family: inherit; font-size: 14px; font-weight: 800; cursor: pointer; }
.ac-add:hover:not(:disabled) { border-color: ${BRAND.blue}; background: rgba(32,80,160,0.04); }
.ac-add:disabled { opacity: .45; cursor: not-allowed; }
.ac-err { font-size: 13px; color: #b3261e; background: #fdecea; border: 1px solid #f5c2bd; border-radius: 10px; padding: 9px 12px; margin-top: 10px; }
.ac-okmsg { font-size: 14.5px; font-weight: 700; color: #1f7a57; }
.ac-toggle { width: 46px; height: 26px; border-radius: 13px; border: none; cursor: pointer; position: relative; flex-shrink: 0;
  background: #cfd8e6; transition: background .2s; }
.ac-toggle[aria-checked="true"] { background: #2e9d6a; }
.ac-toggle span { position: absolute; top: 3px; left: 3px; width: 20px; height: 20px; border-radius: 50%; background: #fff;
  box-shadow: 0 1px 3px rgba(0,0,0,0.2); transition: left .2s; }
.ac-toggle[aria-checked="true"] span { left: 23px; }
/* A 44px finger target around the small switch, the look unchanged (50-role test, 2026-11-05). */
.ac-toggle::after { content: ''; position: absolute; inset: -9px -2px; }
/* A small text button with a 44px finger target. */
.ac-hit { position: relative; } .ac-hit::after { content: ''; position: absolute; inset: -12px -10px; }
.ac-empty { text-align: center; border-style: dashed; padding: 30px 22px; }
.ac-empty b { display: block; font-size: 16px; color: ${BRAND.navy}; margin: 8px 0 4px; }
.ac-icon { width: 46px; height: 46px; border-radius: 50%; background: #eef4fc; display: grid; place-items: center; font-size: 21px; flex-shrink: 0; color: #2050a0; }
.ac-code { flex: 1; background: #eef4fc; border: 1px solid #c9d8ee; border-radius: 10px; padding: 12px 16px; text-align: center;
  font-size: 19px; font-weight: 800; letter-spacing: .2em; color: ${BRAND.navy}; font-variant-numeric: tabular-nums; }
.ac-back-drop { position: fixed; inset: 0; z-index: 1000; background: rgba(14,29,59,0.55); display: flex; align-items: center;
  justify-content: center; padding: 20px; }
.ac-modal { background: #fff; border-radius: 18px; width: 100%; max-width: 400px; padding: 26px; box-shadow: 0 30px 60px rgba(14,29,59,0.3); }
.ac-modal h2 { font-family: ${FONT_DISPLAY}; font-size: 21px; font-weight: 900; color: ${BRAND.navy}; margin: 0 0 10px; }
.ac-modal p { font-size: 14px; color: ${BRAND.mute}; line-height: 1.6; margin: 0 0 22px; }
.ac-modal p strong { color: ${BRAND.ink}; }
.ac-modal .eyebrow { font-size: 11.5px; font-weight: 800; letter-spacing: 2px; text-transform: uppercase; color: #c0392b; margin-bottom: 8px; }
.ac-pair { display: flex; gap: 10px; }
.ac-pair > * { flex: 1; }
.ac-btn:focus-visible, .ac-add:focus-visible, .ac-toggle:focus-visible, .ac-back:focus-visible { outline: 2px solid ${BRAND.blue}; outline-offset: 2px; }
@media (max-width: 520px) {
  .ac-card { padding: 18px; }
  .ac-codeRow { flex-direction: column; align-items: stretch !important; }
  .ac-joinRow { flex-direction: column; align-items: stretch !important; }
  .ac-item-actions { flex-direction: column; align-items: stretch !important; }
}
`
