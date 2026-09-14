/**
 * Checks docs/skill-prerequisites.json against the real curriculum.
 *
 * Run it after editing that file. It catches the four ways a hand-edited
 * prerequisite list goes wrong: a name that matches no skill, a skill left out
 * altogether, a prerequisite that sits LATER in the curriculum than the thing
 * it is supposed to gate, and a cycle -- any of which would leave a swimmer
 * looking at a skill that can never unlock.
 */
import fs from 'node:fs'

const draft = JSON.parse(fs.readFileSync('docs/skill-prerequisites.json', 'utf8'))
delete draft._note
const cc = JSON.parse(fs.readFileSync('docs/coaching-content.json', 'utf8')).skills
const db = JSON.parse(fs.readFileSync('lib/i18n/locales/db-strings.json', 'utf8')).skills

const curr = Object.entries(cc).map(([id, v]) => ({
  id, lvl: v.level, st: v.stage, so: v.sort, zh: (db[id] || {})['zh-Hant'] || '??',
}))
const byName = new Map(curr.map(r => [r.zh, r]))

const flat = {}
for (const lvl of Object.keys(draft)) Object.assign(flat, draft[lvl])

let bad = 0
const fail = m => { console.log('  ✗', m); bad++ }

for (const [skill, pres] of Object.entries(flat)) {
  if (!byName.has(skill)) fail(`不存在的技能：${skill}`)
  for (const p of pres) if (!byName.has(p)) fail(`${skill} 的前置不存在：${p}`)
  if (pres.includes(skill)) fail(`${skill} 把自己列為前置`)
  if (new Set(pres).size !== pres.length) fail(`${skill} 有重複的前置`)
}
for (const r of curr) if (!(r.zh in flat)) fail(`漏掉：${r.zh}（L${r.lvl}S${r.st}）`)

const ord = r => r.lvl * 100 + r.st * 10 + r.so
for (const [skill, pres] of Object.entries(flat)) {
  const s = byName.get(skill)
  if (!s) continue
  for (const p of pres) {
    const q = byName.get(p)
    if (q && ord(q) >= ord(s)) {
      fail(`前置排在後面：${skill}(L${s.lvl}S${s.st}) 需要 ${p}(L${q.lvl}S${q.st})`)
    }
  }
}

const seen = {}
const walk = (n, path) => {
  if (seen[n] === 2) return
  if (seen[n] === 1) return fail(`循環：${[...path, n].join(' → ')}`)
  seen[n] = 1
  for (const p of flat[n] || []) walk(p, [...path, n])
  seen[n] = 2
}
for (const n of Object.keys(flat)) walk(n, [])

const open = Object.entries(flat).filter(([, p]) => !p.length).map(([k]) => k)
const depth = {}
const d = n => depth[n] ?? (depth[n] = (flat[n] || []).length ? 1 + Math.max(...flat[n].map(d)) : 1)
const ranked = Object.keys(flat).map(n => [n, d(n)]).sort((a, b) => b[1] - a[1])

console.log(`技能 ${Object.keys(flat).length}，前置 ${Object.values(flat).flat().length} 條`)
console.log(`第一天就能開始：${open.join('、')}`)
console.log(`最長的一條鏈：${ranked[0][1]} 層（${ranked[0][0]}）`)
console.log(bad ? `\n${bad} 個問題` : '\n全部通過')
process.exit(bad ? 1 : 0)
