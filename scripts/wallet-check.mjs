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
const { applyPoints, arrears, DuplicateLedgerEntry, InsufficientPoints, reversePurchase, totalBalance, WalletInArrears } = wallet

const walletUrl = 'data:text/javascript;base64,' + Buffer.from(
  ts.transpileModule(
    readFileSync(new URL('../lib/points-wallet.ts', import.meta.url), 'utf8')
      .replace(/from '@\/lib\/points'/, `from '${pointsUrl}'`),
    { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } },
  ).outputText,
).toString('base64')

const refunds = await load('../lib/refunds.ts', [
  [/import Stripe from 'stripe'\n/, ''],
  [/: Stripe,/, ': any,'],
  [/from '@\/lib\/points-wallet'/, `from '${walletUrl}'`],
  [/from '@\/lib\/points'/, `from '${pointsUrl}'`],
])
const { planRefund, executeRefund, RefundNotPossible } = refunds

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
    purchases: opts.purchases || [],
    failLedgerInsert: opts.failLedgerInsert || false,
    // '23505' makes the fake reject the insert the way the unique index on
    // point_ledger does when the same movement arrives twice.
    ledgerErrorCode: opts.ledgerErrorCode || null,
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
              single: async () => (state.failLedgerInsert || state.ledgerErrorCode)
                ? { data: null, error: { message: state.ledgerErrorCode === '23505' ? 'duplicate key value' : 'ledger is down', code: state.ledgerErrorCode || undefined } }
                : (state.ledger.push(row), { data: { id: 'l' + state.ledger.length }, error: null }),
            }),
          }
        },
        select() { return this },
        eq() { return this },
        limit: async () => ({ data: [] }),
      }
    }
    if (table === 'purchases') {
      const q = { _eq: [], _is: [] }
      const api = {
        select() { return api },
        eq(col, val) { q._eq.push([col, val]); return api },
        is(col, val) { q._is.push([col, val]); return api },
        order(col, o) {
          q._order = [col, o?.ascending !== false]
          return Promise.resolve({ data: rowsFor(q) })
        },
        update(patch) {
          const conds = []
          const u = {
            eq(col, val) { conds.push([col, val]); return u },
            select() { return u },
            then(res) {
              const row = state.purchases.find(r => conds.every(([c, v]) => r[c] === v))
              if (!row) return Promise.resolve({ data: [] }).then(res)
              Object.assign(row, patch)
              return Promise.resolve({ data: [{ id: row.id }] }).then(res)
            },
          }
          return u
        },
      }
      const rowsFor = (qq) => {
        let rows = state.purchases.filter(r =>
          qq._eq.every(([c, v]) => r[c] === v) && qq._is.every(([c, v]) => (r[c] ?? null) === v))
        if (qq._order) {
          const [col, asc] = qq._order
          rows = [...rows].sort((a, b) => String(a[col]).localeCompare(String(b[col])) * (asc ? 1 : -1))
        }
        return rows.map(r => ({ ...r }))
      }
      return api
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

// --- 10. a reversal takes the points back, even below zero ----------------
// The whole reason ACH is offered at all: points go out the moment checkout
// completes, and 2-4 days later the bank may say the money never moved.
console.log('\n銀行退款：點數收回，可以變成負的')
{
  const { state, svc } = makeSvc({ purchased: 0 })
  await applyPoints(svc, {
    parentId: 'p1', reason: 'purchase', points: 650,
    amountCents: 65000, stripeSessionId: 'cs_ach', actor: 'system',
  })
  // Two lessons swum before the return arrives.
  await applyPoints(svc, { parentId: 'p1', reason: 'booking', points: -130, actor: 'parent' })
  eq('上了兩堂之後剩 520', state.wallet.balance_purchased, 520)

  await reversePurchase(svc, {
    parentId: 'p1', amountCents: 65000, stripeSessionId: 'cs_ach',
    reason: 'payment_failed', note: 'Bank returned payment pi_x',
  })
  eq('沖銷後變成負的', state.wallet.balance_purchased, -130)
  eq('欠款 130 點', arrears(state.wallet), 130)
  eq('累計實付金額扣回去', state.wallet.total_paid_cents, 0)
  eq('帳本記下 -650', state.ledger.at(-1).delta_purchased, -650)
  eq('沖銷理由入帳', state.ledger.at(-1).reason, 'payment_failed')
}

// --- 11. a reversal never eats someone else's gift ------------------------
console.log('\n沖銷不會動到贈點')
{
  const { state, svc } = makeSvc({ purchased: 200, granted: 90 })
  await reversePurchase(svc, {
    parentId: 'p1', amountCents: 30000, stripeSessionId: 'cs_g',
    reason: 'chargeback', note: 'disputed',
  })
  eq('只從購買的那一邊扣', state.wallet.balance_purchased, -100)
  eq('贈點原封不動', state.wallet.balance_granted, 90)
}

// --- 12. a wallet in arrears cannot book ----------------------------------
// Even with granted points sitting there: owing us money stops the booking,
// which is the leverage that actually gets a failed payment settled.
console.log('\n欠款時不能訂課')
{
  const { state, svc } = makeSvc({ purchased: -130, granted: 500 })
  let caught = null
  try {
    await applyPoints(svc, { parentId: 'p1', reason: 'booking', points: -65, actor: 'parent' })
  } catch (e) { caught = e }
  eq('丟出 WalletInArrears，不是「點數不足」', caught instanceof WalletInArrears, true)
  eq('訊息說得出欠多少', caught?.owed, 130)
  eq('餘額沒有被動過', [state.wallet.balance_purchased, state.wallet.balance_granted], [-130, 500])
  eq('沒有寫任何帳本', state.ledger.length, 0)
}

// --- 13. a duplicate ledger row is 'already done', not 'failed' -----------
// Two webhook deliveries of one payment can both find an empty ledger and both
// reach the wallet. The unique index decides; the loser must undo everything
// it wrote -- the running total included -- and say so in a way the webhook
// can answer 200 to.
console.log('\n重複入帳：撤回自己寫的每一個欄位')
{
  const { state, svc } = makeSvc({ purchased: 650, ledgerErrorCode: '23505' })
  state.wallet.total_paid_cents = 65000
  let caught = null
  try {
    await applyPoints(svc, {
      parentId: 'p1', reason: 'purchase', points: 650,
      amountCents: 65000, stripeSessionId: 'cs_dup', actor: 'system',
    })
  } catch (e) { caught = e }
  eq('丟出 DuplicateLedgerEntry', caught instanceof DuplicateLedgerEntry, true)
  eq('餘額退回', state.wallet.balance_purchased, 650)
  eq('累計實付金額也退回', state.wallet.total_paid_cents, 65000)
  eq('帳本沒有新增', state.ledger.length, 0)
}

// --- 14. what a refund is actually made of --------------------------------
// Stripe only ever refunds to the original payment method, so a refund is not
// an amount -- it is a set of charges being unwound, newest first.
console.log('\n退款：從最新的收款往回拆')
{
  const { svc } = makeSvc({
    purchased: 1150,
    purchases: [
      { id: 'p1', parent_id: 'p1p', amount_cents: 65000, refunded_cents: 0, paid_at: '2026-03-01', status: 'paid', reversed_at: null, payment_method: 'stripe', stripe_payment_intent_id: 'pi_march' },
      { id: 'p2', parent_id: 'p1p', amount_cents: 50000, refunded_cents: 0, paid_at: '2026-06-01', status: 'paid', reversed_at: null, payment_method: 'cash', stripe_payment_intent_id: null },
    ],
  })
  const plan = await planRefund(svc, 'p1p', 60000)
  eq('先動最新的那筆（六月的現金）', plan.legs[0].purchaseId, 'p2')
  eq('不夠的部分往前找三月那筆', plan.legs[1].purchaseId, 'p1')
  eq('六月退滿 $500', plan.legs[0].cents, 50000)
  eq('三月補 $100', plan.legs[1].cents, 10000)
  eq('$100 走 Stripe', plan.stripeCents, 10000)
  eq('$500 要當面給', plan.manualCents, 50000)
}

// --- 15. the wallet caps the refund, not the charges ----------------------
// A family who bought 1150 points and swam most of them can only get back what
// is still in the wallet, however much they once paid.
console.log('\n上過的課退不回來')
{
  const { svc } = makeSvc({
    purchased: 150,
    purchases: [{ id: 'p1', parent_id: 'p1p', amount_cents: 115000, refunded_cents: 0, paid_at: '2026-03-01', status: 'paid', reversed_at: null, payment_method: 'stripe', stripe_payment_intent_id: 'pi_a' }],
  })
  const plan = await planRefund(svc, 'p1p', null)
  eq('收款那邊還有 $1,150', plan.chargesRefundableCents, 115000)
  eq('但錢包只剩 $150', plan.walletRefundableCents, 15000)
  eq('可退金額取小的', plan.maxRefundCents, 15000)

  let caught = null
  try { await planRefund(svc, 'p1p', 20000) } catch (e) { caught = e }
  eq('要多了就拒絕', caught?.code, 'ABOVE_REFUNDABLE')
}

// --- 16. arrears block a refund ------------------------------------------
console.log('\n欠款時不能退款')
{
  const { svc } = makeSvc({ purchased: -130, granted: 500, purchases: [] })
  let caught = null
  try { await planRefund(svc, 'p1p', null) } catch (e) { caught = e }
  eq('丟出 RefundNotPossible', caught instanceof RefundNotPossible, true)
  eq('理由是欠款', caught?.code, 'WALLET_IN_ARREARS')
}

// --- 17. granted points are ours, and never become cash -------------------
console.log('\n贈點換不到現金')
{
  const { svc } = makeSvc({
    purchased: 0, granted: 200,
    purchases: [{ id: 'p1', parent_id: 'p1p', amount_cents: 20000, refunded_cents: 0, paid_at: '2026-03-01', status: 'paid', reversed_at: null, payment_method: 'stripe', stripe_payment_intent_id: 'pi_a' }],
  })
  let caught = null
  try { await planRefund(svc, 'p1p', 20000) } catch (e) { caught = e }
  eq('付過 $200 也退不到贈點', caught?.code, 'ABOVE_REFUNDABLE')
  let caught2 = null
  try { await planRefund(svc, 'p1p', null) } catch (e) { caught2 = e }
  eq('全額退款也退不出東西', caught2 instanceof RefundNotPossible, true)
}

// --- 18. money out, points out, both by the same amount -------------------
console.log('\n退款成功：點數與金額一起走')
{
  const { state, svc } = makeSvc({
    purchased: 650,
    purchases: [{ id: 'p1', parent_id: 'p1p', amount_cents: 65000, refunded_cents: 0, paid_at: '2026-03-01', status: 'paid', reversed_at: null, payment_method: 'stripe', stripe_payment_intent_id: 'pi_a' }],
  })
  state.wallet.total_paid_cents = 65000
  const stripe = { refunds: { create: async () => ({ id: 're_1' }) } }
  const res = await executeRefund(svc, stripe, { parentId: 'p1p', amountCents: 30000, actor: 'admin:a1', note: '家長要求' })
  eq('送出 $300', res.deliveredCents, 30000)
  eq('沒有失敗的部分', res.failedCents, 0)
  eq('錢包扣掉 300 點', state.wallet.balance_purchased, 350)
  eq('累計退款記到 $300', state.wallet.total_refunded_cents, 30000)
  eq('這筆收款記下退了 $300', state.purchases[0].refunded_cents, 30000)
  eq('帳本理由是 cash_refund', state.ledger.at(-1).reason, 'cash_refund')
}

// --- 19. a refund Stripe refuses puts its own points back -----------------
// An expired card two years on is the ordinary case, not the exotic one. The
// leg that failed must not leave the family short of both the money and the
// points -- and the charge behind it has to stay refundable.
console.log('\n退款被拒：只把失敗那份還回去')
{
  const { state, svc } = makeSvc({
    purchased: 900,
    purchases: [
      { id: 'old', parent_id: 'p1p', amount_cents: 40000, refunded_cents: 0, paid_at: '2024-01-01', status: 'paid', reversed_at: null, payment_method: 'stripe', stripe_payment_intent_id: 'pi_dead' },
      { id: 'new', parent_id: 'p1p', amount_cents: 50000, refunded_cents: 0, paid_at: '2026-06-01', status: 'paid', reversed_at: null, payment_method: 'stripe', stripe_payment_intent_id: 'pi_live' },
    ],
  })
  state.wallet.total_paid_cents = 90000
  const stripe = {
    refunds: {
      create: async (args) => {
        if (args.payment_intent === 'pi_dead') throw new Error('expired_or_canceled_card')
        return { id: 're_ok' }
      },
    },
  }
  const res = await executeRefund(svc, stripe, { parentId: 'p1p', amountCents: 90000, actor: 'admin:a1', note: '結清退款' })
  eq('只有 $500 送出去', res.deliveredCents, 50000)
  eq('$400 送不出去', res.failedCents, 40000)
  eq('送不出去的 400 點回到錢包', state.wallet.balance_purchased, 400)
  eq('累計退款只算真的退掉的 $500', state.wallet.total_refunded_cents, 50000)
  eq('活著的那筆記下已退', state.purchases.find(p => p.id === 'new').refunded_cents, 50000)
  eq('失敗那筆維持可退', state.purchases.find(p => p.id === 'old').refunded_cents, 0)
  eq('最後一筆帳本是 refund_failed', state.ledger.at(-1).reason, 'refund_failed')
}

// --- 20. cents that are not whole dollars are refused ---------------------
// A point is a dollar. Half a point is not a thing the wallet can express.
console.log('\n退款金額必須是整數美元')
{
  const { svc } = makeSvc({
    purchased: 650,
    purchases: [{ id: 'p1', parent_id: 'p1p', amount_cents: 65000, refunded_cents: 0, paid_at: '2026-03-01', status: 'paid', reversed_at: null, payment_method: 'stripe', stripe_payment_intent_id: 'pi_a' }],
  })
  let caught = null
  try { await planRefund(svc, 'p1p', 12345) } catch (e) { caught = e }
  eq('$123.45 被拒絕', caught?.code, 'INVALID_AMOUNT')
}

console.log(fails === 0 ? '\n全部通過\n' : `\n${fails} 項失敗\n`)
process.exit(fails === 0 ? 0 : 1)
