import { readFileSync, writeFileSync } from 'node:fs';

/**
 * The coaching handbook, one file per language.
 *
 * The old handbook carried its own copy of every skill name and pass standard,
 * so when the curriculum was renamed the handbook quietly kept the old words
 * and coaches had two vocabularies in front of them. Names and standards are
 * read from db-strings here -- the same file the app renders from -- so that
 * cannot happen again. docs/coaching-content.json holds only what is unique to
 * the handbook: the teaching points, the common errors, and the planning prose.
 *
 *   node scripts/build-handbook.mjs
 */

const DB = JSON.parse(readFileSync('lib/i18n/locales/db-strings.json', 'utf8'));
const C = JSON.parse(readFileSync('docs/coaching-content.json', 'utf8'));
const SHELL = readFileSync('docs/handbook-shell.html', 'utf8');

const LOCALES = [
  { locale: 'zh-Hant', out: 'docs/coaching-handbook-zh.html' },
  { locale: 'en', out: 'docs/coaching-handbook-en.html' },
];

const UI = {
  'zh-Hant': {
    title: 'Manta Shark 教練進度手冊', h1: '教練進度手冊',
    version: '版本', skillCount: '技能數', span: '零基礎到 Level 7', unit: '單位', unitVal: '碼（yd）',
    pass: '通過標準', teach: '教學重點', err: '常見錯誤',
    stage: n => `階段 ${n}`, skillsN: n => `${n} 個技能`,
    planCap: h => `整級約 <b>${h}</b> 堂 30 分鐘課`,
    thStage: '階段', thLessons: '預估堂數', thWhat: '這個階段在做什麼',
  },
  en: {
    title: 'Manta Shark Coaching Handbook', h1: 'Coaching Handbook',
    version: 'Version', skillCount: 'Skills', span: 'Beginner to Level 7', unit: 'Units', unitVal: 'yards',
    pass: 'Pass standard', teach: 'How to teach it', err: 'Where they get stuck',
    stage: n => `Stage ${n}`, skillsN: n => `${n} skill${n === 1 ? '' : 's'}`,
    planCap: h => `About <b>${h}</b> thirty-minute lessons for the level`,
    thStage: 'Stage', thLessons: 'Lessons', thWhat: 'What this stage is for',
  },
};

const esc = s => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** A field falls back to Traditional Chinese when the English is not written yet. */
const pick = (field, locale) => field?.[locale] ?? field?.['zh-Hant'] ?? '';

function build(locale) {
  const u = UI[locale];
  const ids = Object.keys(C.skills);
  const total = ids.length;

  const nav = Object.entries(C.levels).map(([lv, L]) =>
    `<a href="#L${lv}" style="--lc:var(--lv${lv})"><b>L${lv}</b>` +
    `<span>${esc(locale === 'en' ? L.en_name : L.zh_name)}</span></a>`).join('\n');

  const sections = C.intro_sections.map((s, i) =>
    `<section>\n${pick(s, locale)}${i === 2 ? `\n  <nav class="nav">${nav}</nav>\n` : ''}</section>`
  ).join('\n\n');

  const levels = Object.entries(C.levels).map(([lv, L]) => {
    const rows = L.plan.map(r =>
      `<tr><td>${u.stage(r.stage)}</td><td class="num">${esc(r.lessons)}</td>` +
      `<td>${esc(pick(r.what, locale))}</td></tr>`).join('');

    const stages = [1, 2, 3].map(st => {
      const inStage = ids
        .filter(id => C.skills[id].level === +lv && C.skills[id].stage === st)
        .sort((a, b) => C.skills[a].sort - C.skills[b].sort);
      if (inStage.length === 0) return '';
      const arts = inStage.map(id => {
        const name = DB.skills[id]?.[locale] ?? DB.skills[id]?.en ?? id;
        const crit = DB.skill_criteria[id]?.[locale] ?? DB.skill_criteria[id]?.en ?? '';
        const s = C.skills[id];
        return `<article class="skill"><h4>${esc(name)}</h4><dl>` +
          `<div class="f pass"><dt>${u.pass}</dt><dd>${esc(crit)}</dd></div>` +
          `<div class="f"><dt>${u.teach}</dt><dd>${esc(pick(s.teach, locale))}</dd></div>` +
          `<div class="f err"><dt>${u.err}</dt><dd>${esc(pick(s.err, locale))}</dd></div>` +
          `</dl></article>`;
      }).join('\n');
      return `<div class="stage"><div class="stage-h"><span class="sn">${u.stage(st)}</span>` +
        `<span class="sc">${u.skillsN(inStage.length)}</span></div>\n` +
        `<div class="skills">\n${arts}\n</div></div>`;
    }).filter(Boolean).join('\n');

    return `<section class="lv" id="L${lv}" style="--lc:var(--lv${lv})">
  <header class="lv-h">
    <div class="lv-num">Level ${lv}</div>
    <h2>${esc(L.en_name)}${locale === 'en' ? '' : `<span class="zh">${esc(L.zh_name)}</span>`}</h2>
    <p class="lv-intro">${pick(L.intro, locale)}</p>
  </header>
  <div class="plan">
    <table>
      <caption>${u.planCap(L.hours)}</caption>
      <thead><tr><th>${u.thStage}</th><th class="num">${u.thLessons}</th><th>${u.thWhat}</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>
${stages}
</section>`;
  }).join('\n\n');

  const head = `<div class="wrap">
<header>
  <span class="eyebrow">Manta Shark Aquatics</span>
  <h1>${esc(u.h1)}</h1>
  <p class="stand">${pick(C.head.standing, locale)}</p>
  <div class="meta">
    <span><b>${u.version}</b> ${new Date().toISOString().slice(0, 10)}</span>
    <span><b>${u.skillCount}</b> ${total}</span>
    <span><b>${u.span}</b> ${esc(C.head.span_lessons ?? '133–162')}</span>
    <span><b>${u.unit}</b> ${u.unitVal}</span>
  </div>
</header>`;

  const closing = C.closing ? `<section>\n${pick(C.closing, locale)}</section>` : '';

  return `<title>${esc(u.title)}</title>\n${SHELL}\n${head}\n\n${sections}\n\n${levels}\n\n${closing}\n</div>\n`;
}

let missing = 0;
for (const id of Object.keys(C.skills)) {
  if (!DB.skills[id]) { console.log('  NO NAME in db-strings: ' + id); missing++; }
  if (!DB.skill_criteria[id]) { console.log('  NO STANDARD in db-strings: ' + id); missing++; }
}
if (missing) { console.log('FAIL: ' + missing + ' skill(s) not covered by db-strings'); process.exit(1); }

for (const { locale, out } of LOCALES) {
  const html = build(locale);
  writeFileSync(out, html);
  const untranslated = Object.values(C.skills)
    .filter(s => !s.teach?.[locale] || !s.err?.[locale]).length;
  console.log(`${out}  ${html.length} bytes` +
    (locale !== 'zh-Hant' && untranslated
      ? `  (${untranslated} skill(s) still falling back to Chinese)` : ''));
}
