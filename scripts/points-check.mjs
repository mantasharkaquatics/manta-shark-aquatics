// Checks the points pricing rules against worked examples from the design book.
// Deliberately a plain script with no test framework: it runs anywhere, and a
// failure prints the actual arithmetic rather than a diff of objects.
//
//   node scripts/points-check.mjs
//
// The numbers here are the ones quoted to the owner and written into the design
// book. If one of them changes, the change was a pricing decision, not a
// refactor -- update the book and the User Agreement in the same commit.

import { readFileSync } from 'node:fs'
import ts from 'typescript'
import { createRequire } from 'node:module'

const src = readFileSync(new URL('../lib/points.ts', import.meta.url), 'utf8')
  .replace(/import \{ getTodayLA \} from '@\/lib\/date'/, 'const getTodayLA = () => ""')
  .replace(/export const todayLA = getTodayLA/, '')
const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
const mod = await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'))
const { priceLesson, vipTier, nextVipTier, isOffPeak, forgivenessAvailable, refundableCents } = mod

let fails = 0
const eq = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) { fails++; console.log(`  FAIL  ${label}\n        得到 ${JSON.stringify(got)}\n        應為 ${JSON.stringify(want)}`) }
  else console.log(`  ok    ${label} = ${JSON.stringify(got)}`)
}

// 2026-09-02 is a Wednesday, 2026-09-05 a Saturday.
const WED = '2026-09-02', SAT = '2026-09-05'

console.log('\n離峰時段')
eq('平日 09:10 離峰',            isOffPeak(WED, '09:10'), true)
eq('平日 11:45 離峰（看開始時間）', isOffPeak(WED, '11:45'), true)
eq('平日 12:00 尖峰（邊界不含）',   isOffPeak(WED, '12:00'), false)
eq('平日 06:00 離峰（開門即算）',   isOffPeak(WED, '06:00'), true)
eq('平日 16:15 尖峰',            isOffPeak(WED, '16:15'), false)
eq('平日 19:30 離峰',            isOffPeak(WED, '19:30'), true)
eq('週六 09:00 離峰',            isOffPeak(SAT, '09:00'), true)
eq('週六 10:00 尖峰（週末較早結束）', isOffPeak(SAT, '10:00'), false)

console.log('\nVIP 級距')
eq('9 堂 → 一般',   vipTier(9).level,   0)
eq('10 堂 → VIP1',  vipTier(10).level,  1)
eq('79 堂 → VIP4',  vipTier(79).level,  4)
eq('80 堂 → VIP5',  vipTier(80).level,  5)
eq('999 堂 → VIP5', vipTier(999).level, 5)
eq('24 堂距下一級', nextVipTier(24).lessonsToGo, 6)
eq('VIP5 沒有下一級', nextVipTier(100), null)

console.log('\n定價（設計書裡引用過的數字）')
const p = (o) => priceLesson({ sessionDate: WED, startTime: '16:15', lessonsCompleted: 0, ...o })
eq('1對1 原價',            p({ courseSlug: '1on1' }).charged, 65)
eq('1對2 原價',            p({ courseSlug: '1on2' }).charged, 50)
eq('1對4 原價',            p({ courseSlug: '1on4' }).charged, 40)
eq('游泳評估',             p({ isAssessment: true }).charged, 85)
eq('1對1 60 分鐘 = ×2',    p({ courseSlug: '1on1', minutes: 60 }).charged, 130)
eq('1對2 兩個自己的孩子',   p({ courseSlug: '1on2', seats: 2 }).charged, 100)
eq('VIP2 尖峰 1對1',       p({ courseSlug: '1on1', lessonsCompleted: 20 }).charged, 61)
eq('VIP2 離峰 1對1',
   priceLesson({ courseSlug: '1on1', sessionDate: WED, startTime: '10:20', lessonsCompleted: 20 }).charged, 58)
eq('最大折扣：VIP5 離峰 1對1',
   priceLesson({ courseSlug: '1on1', sessionDate: WED, startTime: '10:20', lessonsCompleted: 80 }).charged, 54)
eq('最大折扣：VIP5 離峰 1對4',
   priceLesson({ courseSlug: '1on4', sessionDate: WED, startTime: '10:20', lessonsCompleted: 80 }).charged, 33)

console.log('\n捨去方向永遠對家長有利')
const b = priceLesson({ courseSlug: '1on1', sessionDate: WED, startTime: '10:20', lessonsCompleted: 20 })
eq('65 × 0.95 × 0.95 = 58.66 → 收 58', b.perSeat, 58)

console.log('\n晚取消豁免')
eq('完成 9 堂 → 0 次',        forgivenessAvailable(9, 0),   0)
eq('完成 25 堂、用過 1 次',    forgivenessAvailable(25, 1),  1)
eq('用超過也不會變負數',       forgivenessAvailable(10, 5),  0)

console.log('\n退款')
eq('1000 購買點 → $1000',     refundableCents(1000), 100000)

console.log('\n泳隊不能用點數')
try { priceLesson({ courseSlug: 'team', sessionDate: WED, startTime: '18:00', lessonsCompleted: 0 }); fails++; console.log('  FAIL  泳隊應該要擋下來') }
catch { console.log('  ok    泳隊會拋出錯誤') }

console.log(fails === 0 ? '\n全部通過\n' : `\n${fails} 項失敗\n`)
process.exit(fails === 0 ? 0 : 1)
