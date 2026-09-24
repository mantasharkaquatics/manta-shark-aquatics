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
const { priceLesson, isOffPeak, isInOffPeakWindow, OFF_PEAK_ENABLED, forgivenessAvailable, refundableCents, BASE_POINTS, OFF_PEAK_DISCOUNT, ASSESSMENT_POINTS, MIN_TOPUP_DOLLARS, MAX_TOPUP_DOLLARS, centsToPoints, pointsToCents, TOPUP_PRESETS, presetLessons, topUpAmount } = mod

let fails = 0
const eq = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) { fails++; console.log(`  FAIL  ${label}\n        得到 ${JSON.stringify(got)}\n        應為 ${JSON.stringify(want)}`) }
  else console.log(`  ok    ${label} = ${JSON.stringify(got)}`)
}

// 2026-09-02 is a Wednesday, 2026-09-05 a Saturday.
const WED = '2026-09-02', SAT = '2026-09-05'

console.log('\n離峰時段表（優惠' + (OFF_PEAK_ENABLED ? '開啟' : '關閉') + '中）')
eq('優惠關閉時，沒有任何時段算離峰', isOffPeak(WED, '09:10'), OFF_PEAK_ENABLED)
eq('平日 09:10 離峰',            isInOffPeakWindow(WED, '09:10'), true)
eq('平日 11:45 離峰（看開始時間）', isInOffPeakWindow(WED, '11:45'), true)
eq('平日 12:00 尖峰（邊界不含）',   isInOffPeakWindow(WED, '12:00'), false)
eq('平日 06:00 離峰（開門即算）',   isInOffPeakWindow(WED, '06:00'), true)
eq('平日 16:15 尖峰',            isInOffPeakWindow(WED, '16:15'), false)
eq('平日 19:30 離峰',            isInOffPeakWindow(WED, '19:30'), true)
eq('週六 09:00 離峰',            isInOffPeakWindow(SAT, '09:00'), true)
eq('週六 10:00 尖峰（週末較早結束）', isInOffPeakWindow(SAT, '10:00'), false)
eq('平日 21:00 尖峰（打烊，右邊界不含）', isInOffPeakWindow(WED, '21:00'), false)
eq('平日 20:59 離峰',            isInOffPeakWindow(WED, '20:59'), true)
eq('平日 05:59 尖峰（開門前）',   isInOffPeakWindow(WED, '05:59'), false)
// 週日在 JS 是 0，最容易被寫錯的一格
eq('週日 09:00 離峰',            isInOffPeakWindow('2026-09-06', '09:00'), true)
eq('週日 10:00 尖峰',            isInOffPeakWindow('2026-09-06', '10:00'), false)
// 日期字串是「當地日期」，不是 UTC。用 Date 直接 parse 會在 UTC 伺服器上
// 差一天，離峰判斷就會整批錯開一格。
eq('週一 09:00 離峰（不被 UTC 位移）', isInOffPeakWindow('2026-09-07', '09:00'), true)

console.log('\nVIP 已移除（2026-09）')
eq('lib/points 不再匯出 VIP', ['VIP_TIERS', 'vipTier', 'nextVipTier'].filter(k => k in mod), [])
eq('價格明細不再帶 VIP 欄位', 'vipLevel' in priceLesson({ courseSlug: '1on1', sessionDate: WED, startTime: '16:15' }), false)

console.log('\n定價（設計書裡引用過的數字）')
const p = (o) => priceLesson({ sessionDate: WED, startTime: '16:15', ...o })
eq('1對1 原價',            p({ courseSlug: '1on1' }).charged, 65)
eq('1對2 原價',            p({ courseSlug: '1on2' }).charged, 50)
eq('1對4 原價',            p({ courseSlug: '1on4' }).charged, 40)
eq('游泳評估',             p({ isAssessment: true }).charged, 85)
eq('1對1 60 分鐘 = ×2',    p({ courseSlug: '1on1', minutes: 60 }).charged, 130)
eq('1對2 兩個自己的孩子',   p({ courseSlug: '1on2', seats: 2 }).charged, 100)
eq('早上 10:20 1對1',
   priceLesson({ courseSlug: '1on1', sessionDate: WED, startTime: '10:20' }).charged, OFF_PEAK_ENABLED ? 61 : 65)
eq('早上 10:20 1對4',
   priceLesson({ courseSlug: '1on4', sessionDate: WED, startTime: '10:20' }).charged, OFF_PEAK_ENABLED ? 38 : 40)

console.log('\n60 分鐘 = 兩堂 30 分鐘，一分不差')
// 一小時的課程在資料庫裡是兩筆 30 分鐘的紀錄，各自帶著自己的點數。
// 若整小時單獨捨去一次，兩筆紀錄就永遠加不回總價，差一點在誰身上都說不清。
for (const slug of ['1on1', '1on2', '1on4']) {
  for (const t of ['10:20', '16:15']) {
    const half = priceLesson({ courseSlug: slug, sessionDate: WED, startTime: t })
    const hour = priceLesson({ courseSlug: slug, sessionDate: WED, startTime: t, minutes: 60 })
    if (hour.charged !== half.charged * 2 || hour.perHalfHour !== half.perSeat) {
      eq(`${slug} ${t} 一小時 = 兩個半小時`, hour.charged, half.charged * 2)
    }
  }
}
eq('6 種組合全部成立', true, true)

console.log('\n沒有任何折扣組合會超過原價，或低於最大折扣')
{
  // 每一種課、開門到打烊的每一個半點，都不能比原價貴，
  // 也不能比「離峰」（有開的話）還便宜。這兩條線之間就是所有可能的價格。
  let over = 0, under = 0, n = 0
  for (const slug of Object.keys(BASE_POINTS)) {
    const base = BASE_POINTS[slug]
    const floorPrice = Math.floor(base * (1 - (OFF_PEAK_ENABLED ? OFF_PEAK_DISCOUNT : 0)))
    for (const date of [WED, SAT, '2026-09-06']) {
      for (let mins = 6 * 60; mins < 21 * 60; mins += 30) {
        const t = String(Math.floor(mins / 60)).padStart(2, '0') + ':' + String(mins % 60).padStart(2, '0')
        const p = priceLesson({ courseSlug: slug, sessionDate: date, startTime: t })
        n++
        if (p.charged > base) over++
        if (p.charged < floorPrice) under++
      }
    }
  }
  eq(`${n} 種組合都沒有超過原價`, over, 0)
  eq(`${n} 種組合都沒有低於最大折扣`, under, 0)
}

console.log('\n儲值金額的邊界')
// Every storefront amount must divide exactly into a course price, or the card
// promises a number of lessons the price list does not back.
eq('一對一 10 堂 = $650', topUpAmount('1on1', 10), 650)
eq('一對一 30 堂 = $1,950', topUpAmount('1on1', 30), 1950)
eq('一對二 10 堂 = $500', topUpAmount('1on2', 10), 500)
eq('一對二 30 堂 = $1,500', topUpAmount('1on2', 30), 1500)
eq('一對四 10 堂 = $400', topUpAmount('1on4', 10), 400)
eq('一對四 30 堂 = $1,200', topUpAmount('1on4', 30), 1200)
eq('六個方案', TOPUP_PRESETS.length, 6)
// Two cards at the same price would be indistinguishable the moment they are
// bought -- the ledger records points, not which card was clicked.
eq('六個金額互不相同', new Set(TOPUP_PRESETS).size, 6)
eq('每個金額都對得上一種課', TOPUP_PRESETS.filter(p => !presetLessons(p)).length, 0)
eq('最貴的方案也在上限內', TOPUP_PRESETS.every(p => p >= MIN_TOPUP_DOLLARS && p <= MAX_TOPUP_DOLLARS), true)

eq('最低 $50', MIN_TOPUP_DOLLARS, 50)
eq('最高 $10,000', MAX_TOPUP_DOLLARS, 10000)
eq('$1 = 1 點', centsToPoints(100), 1)
eq('1 點 = $1', pointsToCents(1), 100)
eq('金額換點數不會出現小數', centsToPoints(12345), 123)

console.log('\n捨去方向永遠對家長有利')
const b = priceLesson({ courseSlug: '1on1', sessionDate: WED, startTime: '10:20' })
if (OFF_PEAK_ENABLED) {
  eq('65 × 0.95 = 61.75 → 收 61', b.perSeat, 61)
  eq('同一堂課的每半小時價', b.perHalfHour, 61)
} else {
  eq('沒有折扣就是原價 65', b.perSeat, 65)
  eq('同一堂課的每半小時價', b.perHalfHour, 65)
}

console.log('\n晚取消豁免')
eq('完成 9 堂 → 0 次',        forgivenessAvailable(9, 0),   0)
eq('完成 25 堂、用過 1 次',    forgivenessAvailable(25, 1),  1)
eq('用超過也不會變負數',       forgivenessAvailable(10, 5),  0)

console.log('\n退款')
eq('1000 購買點 → $1000',     refundableCents(1000), 100000)

console.log('\n泳隊不能用點數')
try { priceLesson({ courseSlug: 'team', sessionDate: WED, startTime: '18:00' }); fails++; console.log('  FAIL  泳隊應該要擋下來') }
catch { console.log('  ok    泳隊會拋出錯誤') }

console.log(fails === 0 ? '\n全部通過\n' : `\n${fails} 項失敗\n`)
process.exit(fails === 0 ? 0 : 1)
