/** A talent-tree view of the curriculum: tiles on a grid, arrows from the real
 *  prerequisites, one level at a time. Generated from the JSON so the picture
 *  and the data cannot disagree. */
import fs from 'node:fs'

const draft = JSON.parse(fs.readFileSync('docs/skill-prerequisites.json', 'utf8'))
delete draft._note
const cc = JSON.parse(fs.readFileSync('docs/coaching-content.json', 'utf8')).skills
const dbAll = JSON.parse(fs.readFileSync('lib/i18n/locales/db-strings.json', 'utf8'))
const db = dbAll.skills, crit = dbAll.skill_criteria || {}
const LEVEL_ZH = { 1:'認識水', 2:'水中自在', 3:'獨立前進', 4:'泳姿基礎', 5:'泳姿發展', 6:'四式', 7:'競技游泳' }

const meta = new Map(), critOf = new Map()
for (const [id, v] of Object.entries(cc)) {
  const zh = (db[id] || {})['zh-Hant'] || '??'
  meta.set(zh, { lvl: v.level, st: v.stage, so: v.sort })
  critOf.set(zh, (crit[id] || {})['zh-Hant'] || '')
}
const need = {}
for (const l of Object.keys(draft)) Object.assign(need, draft[l])

/* Example state, plainly marked as such on the page: the first row at "on their
   own", so the lit path and the tiles it opens are both visible at rest. */
const DEMO = { '安全入水與辨識': 2, '安全出水': 2, '抓握池壁': 2, '岸上打水': 3 }
const BAND = ['沒教過', '帶著做', '自己做', '穩定做']

const rowOf = {}
const R = n => rowOf[n] ?? (rowOf[n] = (() => {
  const same = (need[n] || []).filter(p => meta.get(p)?.lvl === meta.get(n)?.lvl)
  return same.length ? 1 + Math.max(...same.map(R)) : 1
})())
for (const n of Object.keys(need)) R(n)

const reached = n => (DEMO[n] ?? 0) >= 2
const stateOf = n => {
  const b = DEMO[n] ?? 0
  if (b >= 3) return 'done'
  if (b >= 1) return 'active'
  return (need[n] || []).every(reached) ? 'open' : 'locked'
}
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]))
const MARK = { done: '✦', active: '◆', open: '○', locked: '🔒' }

/* Geometry lives in CSS custom properties so the phone can shrink the whole
   board by changing two numbers instead of re-laying it out. */
let boards = '', tabs = '', data = {}
for (let lv = 1; lv <= 7; lv++) {
  const inLv = Object.keys(need).filter(n => meta.get(n)?.lvl === lv)
  if (!inLv.length) continue
  const maxRow = Math.max(...inLv.map(n => rowOf[n]))

  /* Columns: a skill sits under its first same-level prerequisite when that
     column is free, so a chain reads as one line straight down. */
  const col = {}, taken = {}
  for (let r = 1; r <= maxRow; r++) {
    taken[r] = new Set()
    for (const n of inLv.filter(x => rowOf[x] === r)
      .sort((a, b) => meta.get(a).st - meta.get(b).st || meta.get(a).so - meta.get(b).so)) {
      const par = (need[n] || []).filter(p => meta.get(p)?.lvl === lv)[0]
      let c = par && col[par] != null && !taken[r].has(col[par]) ? col[par] : 0
      while (taken[r].has(c)) c++
      taken[r].add(c); col[n] = c
    }
  }
  const cols = Math.max(...inLv.map(n => col[n])) + 1
  const done = inLv.filter(n => (DEMO[n] ?? 0) >= 3).length

  let wires = '', tiles = ''
  for (const n of inLv) {
    for (const p of (need[n] || [])) {
      if (meta.get(p)?.lvl !== lv) continue
      wires += `<path class="w${reached(p) ? ' lit' : ''}" data-from="${col[p]},${rowOf[p]}" data-to="${col[n]},${rowOf[n]}"/>`
    }
    const st = stateOf(n), b = DEMO[n] ?? 0
    tiles += `<button class="tile ${st}" style="--c:${col[n]};--r:${rowOf[n]}" data-k="${esc(n)}"
      aria-label="${esc(n)}"><span class="mk" data-m="${st}">${MARK[st]}</span>${b > 0 ? `<i class="rk">${b}</i>` : ''}
      <span class="nm">${esc(n)}</span></button>`
    data[n] = { lvl: lv, st: meta.get(n).st, band: b, state: st, crit: critOf.get(n) || '',
                pre: (need[n] || []).map(p => ({ n: p, lvl: meta.get(p).lvl, ok: reached(p) })) }
  }
  tabs += `<button class="tab" data-lv="${lv}"><b>L${lv}</b><span>${esc(LEVEL_ZH[lv])}</span></button>`
  boards += `<section class="lv" data-lv="${lv}" hidden>
    <p class="meta">${inLv.length} 個技能 · ${maxRow} 個階段 · 已通過 ${done}</p>
    <div class="scroll"><div class="board" style="--cols:${cols};--rows:${maxRow}">
      <svg class="wires" preserveAspectRatio="none">${wires}</svg>${tiles}
    </div></div></section>`
}

const html = `<title>游泳技能樹</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&family=Playfair+Display:wght@700&display=swap">
<style>
:root{
  --deep:#0a1220; --panel:#101c33; --tile:#16233f; --line:#1d3054; --wire:#25395f;
  --ink:#e9f0fb; --soft:#93a6c6; --faint:#5d7098;
  --gold:#c9a84c; --done:#4caf72; --open:#6d8cc0;
  --cw:112px; --rh:116px; --sz:52px;
}
*{box-sizing:border-box}
body{margin:0;background:var(--deep);color:var(--ink);
  font:15px/1.6 'DM Sans',system-ui,"PingFang TC","Noto Sans TC",sans-serif;
  -webkit-font-smoothing:antialiased}
.wrap{max-width:1120px;margin:0 auto;padding-block:28px 60px;padding-left:16px;padding-right:16px}
h1{font-family:'Playfair Display',Georgia,serif;font-size:28px;margin:0;text-wrap:balance}
.sub{color:var(--soft);font-size:13.5px;margin:6px 0 0;max-width:62ch}
.note{font-size:12px;color:var(--faint);margin:6px 0 0}

/* level tabs -- the three columns of a talent panel, but seven and scrollable */
.tabs{display:flex;gap:6px;margin-top:20px;overflow-x:auto;padding-bottom:4px;
  scrollbar-width:thin}
.tab{flex:0 0 auto;display:flex;flex-direction:column;align-items:flex-start;gap:1px;
  background:var(--panel);border:1px solid var(--line);border-radius:10px;
  padding:7px 13px;cursor:pointer;color:var(--soft);font:inherit;min-height:48px;
  transition:border-color .12s,background .12s}
.tab b{font-size:11px;letter-spacing:.09em;color:var(--faint);font-weight:700}
.tab span{font-size:13px;font-weight:500;white-space:nowrap}
.tab:hover{border-color:#2d4570}
.tab[aria-selected=true]{background:rgba(201,168,76,.11);border-color:var(--gold);color:var(--ink)}
.tab[aria-selected=true] b{color:var(--gold)}
.tab:focus-visible{outline:2px solid var(--gold);outline-offset:2px}

.lv{margin-top:14px}
.meta{font-size:11.5px;color:var(--faint);margin:0 0 8px}
.scroll{overflow-x:auto;background:var(--panel);border:1px solid var(--line);
  border-radius:13px;padding:16px 14px 12px}
.board{position:relative;
  width:calc(var(--cols) * var(--cw));
  height:calc((var(--rows) - 1) * var(--rh) + var(--sz) + 40px);
  margin:0 auto}
.wires{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;overflow:visible}
.w{fill:none;stroke:var(--wire);stroke-width:2;marker-end:url(#ar)}
.w.lit{stroke:rgba(201,168,76,.8);marker-end:url(#arl)}

.tile{position:absolute;width:var(--sz);height:var(--sz);border-radius:10px;
  background:var(--tile);border:1px solid var(--line);display:grid;place-items:center;
  padding:0;cursor:pointer;color:var(--faint);
  left:calc(var(--c) * var(--cw) + (var(--cw) - var(--sz)) / 2);
  top:calc((var(--r) - 1) * var(--rh));
  transition:transform .1s,box-shadow .12s}
.tile{font-size:17px;line-height:1}
.mk{display:block;line-height:1}
.mk[data-m=done]{transform:translateY(1.4px)}
.mk[data-m=active],.mk[data-m=open]{transform:translateY(-.5px)}
.mk[data-m=locked]{transform:translateY(.4px)}
.tile .rk{position:absolute;right:-6px;bottom:-6px;min-width:18px;height:18px;
  border-radius:6px;background:var(--deep);border:1px solid currentColor;
  font-size:10.5px;font-weight:700;font-style:normal;display:grid;place-items:center;
  padding:0 3px;line-height:1}
.tile .nm{position:absolute;top:calc(var(--sz) + 6px);width:var(--cw);
  left:calc((var(--sz) - var(--cw)) / 2);font-size:10.5px;line-height:1.3;
  text-align:center;color:var(--faint);font-weight:500}
.tile:hover{transform:translateY(-1px)}
.tile:focus-visible{outline:2px solid var(--gold);outline-offset:3px}
.tile.open{border-color:#31497a;background:#1a2a4a;color:var(--open)}
.tile.open .nm{color:var(--soft)}
.tile.active{border-color:var(--gold);background:#262112;color:var(--gold);
  box-shadow:0 0 15px rgba(201,168,76,.32)}
.tile.active .nm{color:var(--gold);font-weight:700}
.tile.done{border-color:var(--done);background:#112d1e;color:var(--done);
  box-shadow:0 0 15px rgba(76,175,114,.28)}
.tile.done .nm{color:var(--done);font-weight:700}
.tile.locked{opacity:.58}
.tile[aria-current=true]{box-shadow:0 0 0 2px var(--ink)}

.key{display:flex;flex-wrap:wrap;gap:8px 16px;font-size:11.5px;color:var(--faint);
  margin-top:12px}
.key span{display:inline-flex;align-items:center;gap:6px}
.key i{width:8px;height:8px;border-radius:50%;background:currentColor;flex:none}

/* detail: a panel on a wide screen, a sheet pinned to the bottom on a phone */
.detail{margin-top:14px;background:var(--panel);border:1px solid var(--line);
  border-radius:13px;padding:14px 16px}
.detail h3{margin:0;font-size:15.5px}
.detail .dm{font-size:11.5px;color:var(--faint);margin:3px 0 0}
.detail .band{display:inline-block;margin-top:9px;font-size:11.5px;font-weight:700;
  border-radius:6px;padding:2px 9px;border:1px solid currentColor}
.detail dl{margin:11px 0 0;display:grid;gap:5px}
.detail dt{font-size:10.5px;letter-spacing:.08em;color:var(--faint)}
.detail dd{margin:0;font-size:12.5px;color:var(--soft);line-height:1.65}
.pre{display:flex;flex-wrap:wrap;gap:5px;margin-top:3px}
.pre span{font-size:11.5px;border-radius:6px;padding:2px 8px;
  background:#16233f;color:var(--soft)}
.pre span.ok{background:#112d1e;color:var(--done)}
.pre span b{font-weight:700;opacity:.65;margin-left:4px;font-size:10px}
.empty{color:var(--faint);font-size:12.5px}

@media (max-width:640px){
  :root{ --cw:88px; --rh:108px; --sz:44px }
  h1{font-size:23px}
  .scroll{padding:14px 10px 10px;border-radius:11px}
  .tile .nm{font-size:9.5px}
  .detail{position:sticky;bottom:0}
}
@media (prefers-reduced-motion:reduce){ .tile{transition:none} }
</style>
<div class="wrap">
<h1>游泳技能樹</h1>
<p class="sub">每一格是一個技能，箭頭是真正的前置關係 —— 上面那個做到「自己做」，下面才會亮。
點任何一格看它需要什麼、怎樣算通過。</p>
<p class="note">畫面上是示範狀態，不是真實學生的資料。</p>

<div class="tabs" role="tablist">${tabs}</div>
${boards}
<div class="key">
  <span><i style="color:var(--done)"></i>穩定做</span>
  <span><i style="color:var(--gold)"></i>進行中（角標是等級）</span>
  <span><i style="color:var(--open)"></i>可以開始</span>
  <span><i style="opacity:.45"></i>前置還沒到</span>
  <span>金色的線 ＝ 已經打通的路</span>
</div>
<div class="detail" id="detail"><p class="empty">點一格看它需要什麼。</p></div>
</div>

<svg width="0" height="0" style="position:absolute"><defs>
<marker id="ar" markerWidth="7" markerHeight="7" refX="6" refY="3" orient="auto">
  <path d="M0 0 L6 3 L0 6 z" fill="#25395f"/></marker>
<marker id="arl" markerWidth="7" markerHeight="7" refX="6" refY="3" orient="auto">
  <path d="M0 0 L6 3 L0 6 z" fill="rgba(201,168,76,.8)"/></marker>
</defs></svg>

<script>
const DATA = ${JSON.stringify(data)};
const BAND = ${JSON.stringify(BAND)};
const LVZH = ${JSON.stringify(LEVEL_ZH)};
const COLOR = { done:'var(--done)', active:'var(--gold)', open:'var(--open)', locked:'var(--faint)' };

/* The wires are drawn from the tiles' measured positions rather than from
   numbers baked in at build time, so one set of paths serves both the desktop
   and the phone geometry -- the CSS changes --cw and --sz, and this redraws. */
function drawWires(board){
  const svg = board.querySelector('.wires');
  const cw = parseFloat(getComputedStyle(board).getPropertyValue('--cw'));
  const rh = parseFloat(getComputedStyle(board).getPropertyValue('--rh'));
  const sz = parseFloat(getComputedStyle(board).getPropertyValue('--sz'));
  svg.setAttribute('viewBox', '0 0 ' + board.clientWidth + ' ' + board.clientHeight);
  const px = (c) => c * cw + cw / 2;
  const py = (r) => (r - 1) * rh + sz / 2;
  for (const w of svg.querySelectorAll('.w')){
    const [c1, r1] = w.dataset.from.split(',').map(Number);
    const [c2, r2] = w.dataset.to.split(',').map(Number);
    const x1 = px(c1), y1 = py(r1) + sz / 2 + 2;
    const x2 = px(c2), y2 = py(r2) - sz / 2 - 4;
    const mid = py(r2) - sz / 2 - 20;   // in the channel, below the names above
    w.setAttribute('d', Math.abs(x1 - x2) < 2
      ? 'M' + x1 + ' ' + y1 + ' L' + x2 + ' ' + y2
      : 'M' + x1 + ' ' + y1 + ' L' + x1 + ' ' + mid + ' L' + x2 + ' ' + mid + ' L' + x2 + ' ' + y2);
  }
}

function show(lv){
  for (const t of document.querySelectorAll('.tab'))
    t.setAttribute('aria-selected', String(+t.dataset.lv === lv));
  for (const s of document.querySelectorAll('.lv')) s.hidden = +s.dataset.lv !== lv;
  const b = document.querySelector('.lv[data-lv="' + lv + '"] .board');
  if (b) drawWires(b);
}

function pick(name, el){
  const d = DATA[name];
  if (!d) return;
  for (const t of document.querySelectorAll('.tile')) t.removeAttribute('aria-current');
  if (el) el.setAttribute('aria-current', 'true');
  const pre = d.pre.length
    ? '<div class="pre">' + d.pre.map(p =>
        '<span class="' + (p.ok ? 'ok' : '') + '">' + p.n +
        (p.lvl !== d.lvl ? '<b>L' + p.lvl + '</b>' : '') + '</span>').join('') + '</div>'
    : '<dd>不用前置，第一天就能開始。</dd>';
  document.getElementById('detail').innerHTML =
    '<h3>' + name + '</h3>' +
    '<p class="dm">等級 ' + d.lvl + ' · ' + LVZH[d.lvl] + ' · 原階段 ' + d.st + '</p>' +
    '<span class="band" style="color:' + COLOR[d.state] + '">' + BAND[d.band] + '</span>' +
    '<dl><dt>需要先完成</dt>' + (d.pre.length ? '<dd>' + pre + '</dd>' : pre) +
    (d.crit ? '<dt style="margin-top:6px">怎樣算「穩定做」</dt><dd>' + d.crit + '</dd>' : '') +
    '</dl>';
}

document.querySelector('.tabs').addEventListener('click', e => {
  const t = e.target.closest('.tab'); if (t) show(+t.dataset.lv);
});
document.addEventListener('click', e => {
  const t = e.target.closest('.tile'); if (t) pick(t.dataset.k, t);
});
addEventListener('resize', () => {
  const b = document.querySelector('.lv:not([hidden]) .board'); if (b) drawWires(b);
});
show(1);
</script>`
fs.writeFileSync('docs/skill-tree-preview.html', html)
console.log('docs/skill-tree-preview.html')
