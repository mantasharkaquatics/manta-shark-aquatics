/** Renders docs/skill-prerequisites.json as rows: row 1 needs nothing from this
 *  level, row 2 needs row 1, and so on. Generated from the JSON so the picture
 *  and the data can never disagree. */
import fs from 'node:fs'

const draft = JSON.parse(fs.readFileSync('docs/skill-prerequisites.json', 'utf8'))
delete draft._note
const cc = JSON.parse(fs.readFileSync('docs/coaching-content.json', 'utf8')).skills
const db = JSON.parse(fs.readFileSync('lib/i18n/locales/db-strings.json', 'utf8')).skills
const LEVEL_ZH = { 1:'認識水', 2:'水中自在', 3:'獨立前進', 4:'泳姿基礎', 5:'泳姿發展', 6:'四式', 7:'競技游泳' }

const lvlOf = new Map(Object.entries(cc).map(([id, v]) => [(db[id] || {})['zh-Hant'] || '??', v.level]))
const flat = {}
for (const l of Object.keys(draft)) Object.assign(flat, draft[l])

/* A skill's row is one past the deepest thing it needs FROM THE SAME LEVEL.
   Prerequisites from earlier levels do not push it down: by the time a swimmer
   is working this level those are behind them, so row 1 means "nothing here
   has to come first", not "nothing at all". */
const row = {}
const R = n => row[n] ?? (row[n] = (() => {
  const same = (flat[n] || []).filter(p => lvlOf.get(p) === lvlOf.get(n))
  return same.length ? 1 + Math.max(...same.map(R)) : 1
})())
for (const n of Object.keys(flat)) R(n)

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]))
const totalEdges = Object.values(flat).flat().length
const day1 = Object.entries(flat).filter(([, p]) => !p.length).length

let body = ''
const rowCounts = []
for (let lv = 1; lv <= 7; lv++) {
  const inLv = Object.keys(flat).filter(n => lvlOf.get(n) === lv)
  if (!inLv.length) continue
  const max = Math.max(...inLv.map(n => row[n]))
  rowCounts.push([lv, max, inLv.length])
  body += `<section class="lvl"><h2><span class="num">${lv}</span>${esc(LEVEL_ZH[lv])}
    <span class="cnt">${inLv.length} 個技能 · ${max} 層</span></h2>`
  for (let r = 1; r <= max; r++) {
    const here = inLv.filter(n => row[n] === r)
    body += `<div class="band"><p class="bn">第 ${r} 行</p><div class="cards">`
    for (const n of here) {
      const pres = flat[n] || []
      const same = pres.filter(p => lvlOf.get(p) === lv)
      const outer = pres.filter(p => lvlOf.get(p) !== lv)
      const need = r === 1 && !outer.length
        ? '<span class="need day1">不用前置</span>'
        : [...same.map(p => `<span class="need">${esc(p)}</span>`),
           ...outer.map(p => `<span class="need out">${esc(p)}<b>L${lvlOf.get(p)}</b></span>`)].join('')
      body += `<div class="card${r === 1 && !outer.length ? ' first' : ''}">
        <p class="t">${esc(n)}</p><div class="needs">${need}</div></div>`
    }
    body += '</div></div>'
  }
  body += '</section>'
}

const html = `<title>游泳技能先後順序</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&family=Playfair+Display:wght@700&display=swap">
<style>
:root{
  --ground:#f4f6fa; --panel:#ffffff; --ink:#111d38; --soft:#5a6b8c; --faint:#8b9ab5;
  --line:#dde3ee; --gold:#a8873a; --goldbg:#faf3e0; --open:#2f8f5b; --openbg:#eaf6ef;
  --openline:#b7dfc7; --needbg:#eef2fa; --needink:#33507f;
}
@media (prefers-color-scheme: dark){ :root:not([data-theme="light"]){
  --ground:#0b1220; --panel:#131f38; --ink:#e9f0fb; --soft:#93a6c6; --faint:#6478a0;
  --line:#1e3358; --gold:#c9a84c; --goldbg:#2a2415; --open:#5cc98a; --openbg:#122b1f;
  --openline:#1f5a3c; --needbg:#17264a; --needink:#9dbaf0;
}}
:root[data-theme="dark"]{
  --ground:#0b1220; --panel:#131f38; --ink:#e9f0fb; --soft:#93a6c6; --faint:#6478a0;
  --line:#1e3358; --gold:#c9a84c; --goldbg:#2a2415; --open:#5cc98a; --openbg:#122b1f;
  --openline:#1f5a3c; --needbg:#17264a; --needink:#9dbaf0;
}
*{box-sizing:border-box}
body{margin:0;background:var(--ground);color:var(--ink);
  font:15px/1.6 'DM Sans',system-ui,"PingFang TC","Noto Sans TC",sans-serif}
.wrap{max-width:1080px;margin:0 auto;padding-block:32px 72px;padding-left:18px;padding-right:18px}
h1{font-family:'Playfair Display',Georgia,serif;font-size:30px;margin:0;text-wrap:balance}
.sub{color:var(--soft);font-size:14px;margin:6px 0 0;max-width:64ch}
.tally{display:flex;flex-wrap:wrap;gap:8px;margin:22px 0 4px}
.tally div{background:var(--panel);border:1px solid var(--line);border-radius:9px;
  padding:8px 12px;font-size:12px;color:var(--soft)}
.tally b{color:var(--ink);font-variant-numeric:tabular-nums}
.tally .hot{border-color:var(--gold);color:var(--gold)}
.lvl{margin-top:36px}
h2{font-size:15px;margin:0 0 10px;display:flex;align-items:center;gap:9px;font-weight:700}
h2 .num{display:grid;place-items:center;width:23px;height:23px;border-radius:7px;
  background:var(--goldbg);color:var(--gold);font-size:12px;font-weight:700}
h2 .cnt{margin-left:auto;font-size:11px;color:var(--faint);font-weight:500}
.band{display:grid;grid-template-columns:52px 1fr;gap:12px;align-items:start;
  padding:11px 0;border-top:1px solid var(--line)}
.bn{margin:0;font-size:10.5px;color:var(--faint);letter-spacing:.06em;padding-top:8px}
.cards{display:flex;flex-wrap:wrap;gap:8px}
.card{background:var(--panel);border:1px solid var(--line);border-radius:10px;
  padding:9px 12px;min-width:150px;max-width:100%;flex:0 1 auto}
.card.first{background:var(--openbg);border-color:var(--openline)}
.t{margin:0;font-size:13.5px;font-weight:500}
.card.first .t{color:var(--open);font-weight:700}
.needs{display:flex;flex-wrap:wrap;gap:4px;margin-top:6px}
.need{font-size:10.5px;background:var(--needbg);color:var(--needink);
  border-radius:5px;padding:2px 6px}
.need b{font-weight:700;margin-left:4px;opacity:.7;font-size:9.5px}
.need.out{opacity:.72}
.need.day1{background:transparent;color:var(--open);font-weight:700;padding-left:0}
@media(max-width:560px){ .band{grid-template-columns:1fr;gap:4px} .bn{padding-top:0} }
</style>
<div class="wrap">
<h1>游泳技能先後順序</h1>
<p class="sub">每一級裡，第 1 行不需要同一級的任何東西 —— 一進這一級就能開始。
第 2 行要等第 1 行，以此類推。卡片下面的小字是它實際需要的技能，標了 L 的來自別的級別。</p>
<div class="tally">
  <div><b>82</b> 個技能</div>
  <div><b>${totalEdges}</b> 條前置</div>
  <div><b>${day1}</b> 個第一天就能開始</div>
  ${rowCounts.map(([lv, r, n]) =>
    `<div class="${r >= 5 ? 'hot' : ''}">L${lv} <b>${r}</b> 層 / ${n} 個</div>`).join('')}
</div>
${body}
</div>`
fs.writeFileSync('docs/skill-prerequisites.html', html)
console.log('docs/skill-prerequisites.html — 分層版')
