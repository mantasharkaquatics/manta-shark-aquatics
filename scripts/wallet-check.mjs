// Checks lib/points-wallet.ts — the only code that moves money — against a
// fake Supabase client that behaves the way the real one does, including the
// parts that only misbehave under contention.
//
//   node scripts/wallet-check.mjs
//
// Why a fake and not a database: the properties worth proving here are about
// ORDER and FAILURE, not about SQL. That the balance and the ledger can never
// disagree; that a spend takes granted points before purchased ones; that a
// request which cannot pay changes nothing; that two requests racing for the
// same wallet cannot both succeed from the same starting figure. A fake lets
// the ledger insert fail on demand, which is exactly the case a real database
// will not reproduce for us.

import { readFileSync } from 'node:fs'
import ts from 'typescript'

// --- load the two modules under test, with their @/ imports resolved --------
async function load(rel, subs = []) {
  let src = readFileSync(new URL(rel, import.meta.url), 'utf8')
  for (const [from, to] of subs) src = src.replace(from, to)
  const js = ts.transpileModule(src, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText
  return import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'))
}

const points = await load('../lib/points.ts', [
  [/import \{ getTodayLA \} from '@\/lib\/date'/, 'const getTodayLA = () => ""'],
  [/export const todayLA = getTodayLA/, ''],
])
const pointsUrl = 'data:text/javascript;base64,' + Buffer.from(
  ts.transpileModule(
    readFileSync(new URL('../lib/points.ts', import.meta.url), 'utf8')
      .replace(/import \{ getTodayLA \} from '@\/lib\/date'/, 'const getTodayLA = () => ""')
      .replace(/export const todayLA = getTodayLA/, ''),
    { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } },
  ).outputText,
).toString('base64')

const wallet = await load('../lib/points-wallet.ts', [
  [/from '@\/lib\/points'/, `from '${pointsUrl}'`],
])
const { applyPoints, InsufficientPoints, totalBalance } = wallet

let fails = 0
const eq = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) { fails++; console.log(`  FAIL  ${label}\n        得到 ${JSON.stringify(got)}\n        應為 ${JSON.stringify(want)}`) }
  else console.log(`  ok    ${label} = ${JSON.stringify(got)}`)
}

// --- the fake -------------------------------------------------------------
// Mimics the real client closely enough to be worth trusting: the guarded
// UPDATE really does check the values it was given, and returns nothing when
// they no longer match.
function makeSvc(opts = {}) {
  const state = {
    wallet: {
      id: 'w1', parent_id: 'p1',
      balance_purchased: opts.purchased ?? 0,
      balance_granted: opts.granted ?? 0,
      total_paid_cents: 0, total_refunded_cents: 0,
      forgiveness_used: opts.forgivenessUsed ?? 0,
    },
    ledger: [],
    // Called before each guarded update. Lets a test move the wallet
    // underneath the code, the way a concurrent request would.
    beforeUpdate: opts.beforeUpdate || null,
    failLedgerInsert: opts.failLedgerInsert || false,
    updates: 0,
  }

  const from = (table) => {
    if (table === 'point_wallets') {
      return {
        select() { return this },
        eq(col, val) { (this._eq ||= []).push([col, val]); return this },
        maybeSingle: async () => ({ data: { ...state.wallet } }),
        single: async () => ({ data: { ...state.wallet } }),
        upsert() { return this },
        update(patch) {
          const conds = []
          const api = {
            eq(col, val) { conds.push([col, val]); return api },
            select() { return api },
            async maybeSingle() {
              state.updates++
              if (state.beforeUpdate) state.beforeUpdate(state)
              const ok = conds.every(([c, v]) => c === 'id' ? state.wallet.id === v : state.wallet[c] === v)
              if (!ok) return { data: null }
              Object.assign(state.wallet, patch)
              return { data: { ...state.wallet } }
            },
            // the rollback path calls .eq('id', …) with no .select()
            then(res) { return api.maybeSingle().then(res) },
          }
          return api
        },
      }
    }
    if (table === 'point_ledger') {
      return {
        insert(row) {
          return {
            select: () => ({
              single: async () => state.failLedgerInsert
                ? { data: null, error: { message: 'ledger is down' } }
                : (state.ledger.push(row), { data: { id: 'l' + state.ledger.length }, error: null }),
            }),
          }
        },
        select() { return this },
        eq() { return this },
        limit: async () => ({ data: [] }),
      }
    }
    throw new Error('unexpected table ' + table)
  }

  return { state, svc: { from, rpc: async () => ({ data: 0 }) } }
}

// --- 1. spending order -----------------------------------------------------
console.log('\n扣款先扣贈點')
{
  const { state, svc } = makeSvc({ purchased: 100, granted: 30 })
  await applyPoints(svc, { parentId: 'p1', reason: 'booking', points: -50, actor: 'parent' })
  eq('贈點 30 全數用掉', state.wallet.balance_granted, 0)
  eq('購買點只被動到差額 20', state.wallet.balance_purchased, 80)
  eq('帳本記下兩邊的變動', [state.ledger[0].delta_granted, state.ledger[0].delta_purchased], [-30, -20])
}

// --- 2. never overdrawn ----------------------------------------------------
console.log('\n餘額不足時什麼都不動')
{
  const { state, svc } = makeSvc({ purchased: 40, granted: 5 })
  let caught = null
  try {
    await applyPoints(svc, { parentId: 'p1', reason: 'booking', points: -50, actor: 'parent' })
  } catch (e) { caught = e }
  eq('丟出 InsufficientPoints', caught instanceof InsufficientPoints, true)
  eq('需要 50、只有 45', [caught?.needed, caught?.available], [50, 45])
  eq('餘額原封不動', [state.wallet.balance_purchased, state.wallet.balance_granted], [40, 5])
  eq('沒有寫任何帳本', state.ledger.length, 0)
}

// --- 3. the ledger and the balance can never disagree ----------------------
console.log('\n帳本寫不進去就把餘額退回去')
{
  const { state, svc } = makeSvc({ purchased: 100, failLedgerInsert: true })
  let threw = false
  try {
    await applyPoints(svc, { parentId: 'p1', reason: 'booking', points: -25, actor: 'parent' })
  } catch { threw = true }
  eq('拋出錯誤，不會靜靜成功', threw, true)
  eq('餘額退回原值', state.wallet.balance_purchased, 100)
  eq('帳本仍然是空的', state.ledger.length, 0)
}

// --- 4. the guard: a concurrent write makes us retry, not overwrite --------
console.log('\n有人搶先改了錢包就重讀重算')
{
  let interfered = false
  const { state, svc } = makeSvc({
    purchased: 100,
    beforeUpdate(st) {
      // Exactly once, before the first update lands, someone else spends 40.
      if (interfered) return
      interfered = true
      st.wallet.balance_purchased -= 40
    },
  })
  const res = await applyPoints(svc, { parentId: 'p1', reason: 'booking', points: -10, actor: 'parent' })
  eq('重試過一次', state.updates >= 2, true)
  eq('從對方寫入後的餘額再扣', state.wallet.balance_purchased, 50)
  eq('回報的餘額就是實際餘額', res.balance, 50)
  eq('只寫一筆帳本', state.ledger.length, 1)
}

// --- 5. a purchase is money in, and is recorded as such -------------------
console.log('\n儲值')
{
  const { state, svc } = makeSvc({ purchased: 0 })
  await applyPoints(svc, {
    parentId: 'p1', reason: 'purchase', points: 1000,
    amountCents: 100000, stripeSessionId: 'cs_1', actor: 'system',
  })
  eq('1000 點進到「購買的」那一邊', state.wallet.balance_purchased, 1000)
  eq('贈點沒有被碰到', state.wallet.balance_granted, 0)
  eq('累計實付金額有記', state.wallet.total_paid_cents, 100000)
}

// --- 6. a grant is spendable but never becomes cash ------------------------
console.log('\n贈點進到不可退的那一邊')
{
  const { state, svc } = makeSvc({ purchased: 500 })
  await applyPoints(svc, {
    parentId: 'p1', reason: 'admin_grant', points: 100, toGranted: true,
    note: '促銷：買 500 送 100', actor: 'admin:a1',
  })
  eq('贈點 100', state.wallet.balance_granted, 100)
  eq('可退現金的部分沒有變多', state.wallet.balance_purchased, 500)
  eq('可退金額還是 $500', points.refundableCents(state.wallet.balance_purchased), 50000)
}

// --- 7. a manual adjustment without a reason is refused --------------------
console.log('\n手動調整一定要有理由')
{
  const { state, svc } = makeSvc({ purchased: 100 })
  let threw = false
  try {
    await applyPoints(svc, { parentId: 'p1', reason: 'admin_grant', points: 50, toGranted: true, actor: 'admin:a1' })
  } catch { threw = true }
  eq('沒填理由就拒絕', threw, true)
  eq('餘額沒有變', state.wallet.balance_purchased, 100)
  eq('帳本沒有新增', state.ledger.length, 0)
}

// --- 8. forgiveness burns exactly one allowance ---------------------------
console.log('\n用一次豁免，只扣一次')
{
  const { state, svc } = makeSvc({ purchased: 0, granted: 0, forgivenessUsed: 2 })
  await applyPoints(svc, {
    parentId: 'p1', reason: 'forgiveness', points: 58,
    bookingId: 'b1', actor: 'parent', consumeForgiveness: true,
  })
  eq('點數退回', state.wallet.balance_purchased, 58)
  eq('用掉的豁免次數 +1', state.wallet.forgiveness_used, 3)
}

// --- 9. zero and fractional movements are refused -------------------------
console.log('\n不接受 0 點與小數')
{
  const { svc } = makeSvc({ purchased: 100 })
  for (const [label, n] of [['0 點', 0], ['小數', -2.5]]) {
    let threw = false
    try { await applyPoints(svc, { parentId: 'p1', reason: 'booking', points: n, actor: 'parent' }) } catch { threw = true }
    eq(label + '被拒絕', threw, true)
  }
}

console.log(fails === 0 ? '\n全部通過\n' : `\n${fails} 項失敗\n`)
process.exit(fails === 0 ? 0 : 1)
