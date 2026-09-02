// One-off audit of the `purchases` table.
//
//   node scripts/purchases-audit.mjs                  # report only
//   node scripts/purchases-audit.mjs --delete <id>…   # delete those exact rows
//
// Why this exists: while the points conversion was being tested locally, the
// DEPLOYED site's Stripe webhook was still registered in test mode against the
// same Supabase project, so it consumed several `checkout.session.completed`
// events and wrote `purchases` rows using the old build's code. Those rows have
// no matching `point_ledger` entry, because the wallet was never credited — the
// money is recorded, the points are not. They are misleading, not dangerous,
// and they should go.
//
// Deleting takes explicit ids, never a predicate. A purchase row for the Swim
// Assessment legitimately has no ledger entry (an assessment is charged to the
// card, not to points), so "no ledger row" is NOT a safe definition of orphan.
// Read the report, then name the ids.

import { readFileSync } from 'node:fs'

const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split('\n')
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => {
      const i = l.indexOf('=')
      return [l.slice(0, i), l.slice(i + 1).replace(/^["']|["']$/g, '')]
    }),
)

const URL_ = env.NEXT_PUBLIC_SUPABASE_URL
const KEY = env.SUPABASE_SERVICE_ROLE_KEY
if (!URL_ || !KEY) { console.error('缺少 NEXT_PUBLIC_SUPABASE_URL 或 SUPABASE_SERVICE_ROLE_KEY'); process.exit(1) }

const rest = async (path, init = {}) => {
  const res = await fetch(`${URL_}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', ...(init.headers || {}) },
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`${res.status} ${path}\n${text}`)
  return text ? JSON.parse(text) : null
}

const args = process.argv.slice(2)
const delIdx = args.indexOf('--delete')

const purchases = await rest('purchases?select=*&order=created_at.asc')
const ledger = await rest('point_ledger?select=id,stripe_session_id,reason,delta_purchased,delta_granted&stripe_session_id=not.is.null')
const bySession = new Map()
for (const l of ledger) bySession.set(l.stripe_session_id, l)

// A trial/assessment purchase is one that a trial booking points back to.
const trialBookings = await rest('bookings?select=id,parent_id,is_trial&is_trial=is.true')
const trialParents = new Set(trialBookings.map((b) => b.parent_id))

console.log(`\npurchases: ${purchases.length} 筆\n`)
for (const p of purchases) {
  const l = bySession.get(p.stripe_session_id)
  const cols = Object.entries(p)
    .filter(([k]) => !['id', 'stripe_session_id'].includes(k))
    .filter(([, v]) => v !== null && v !== '')
    .map(([k, v]) => `${k}=${v}`)
    .join('  ')
  console.log(`${l ? '有帳本' : '❌無帳本'}  ${p.id}`)
  console.log(`         session=${p.stripe_session_id}`)
  console.log(`         ${cols}`)
  if (l) console.log(`         ledger: ${l.reason} +${l.delta_purchased}/${l.delta_granted}`)
  else if (trialParents.has(p.parent_id)) console.log(`         （這位家長有評估課預約 — 可能是評估費，不要刪）`)
  console.log()
}

// Same session, more than one purchase row. `purchases` has a UNIQUE on
// stripe_payment_intent_id, which the points webhook does not set -- it writes
// stripe_session_id, which has no constraint at all. So a second delivery of
// the same event writes a second row, and the invoice that follows it is
// written a second time too.
const dupes = [...rowsPerSessionOf(purchases)].filter(([, n]) => n > 1)
if (dupes.length) {
  console.log('⚠️  同一個 session 有多筆 purchases：')
  for (const [s, n] of dupes) console.log(`    ${n} 筆  ${s}`)
  console.log()
}

// The invoice is the part the family actually sees.
try {
  const parents = [...new Set(purchases.map((p) => p.parent_id))]
  const invoices = await rest(`invoices?select=id,invoice_number,parent_id,amount,created_at&parent_id=in.(${parents.join(',')})&order=created_at.asc`)
  console.log(`invoices: ${invoices.length} 筆`)
  for (const i of invoices) console.log(`    ${i.created_at}  ${i.invoice_number}  $${i.amount}`)
  console.log()
} catch (e) {
  console.log('（讀不到 invoices：' + e.message.split('\n')[0] + '）\n')
}

function rowsPerSessionOf(rows) {
  const m = new Map()
  for (const r of rows) m.set(r.stripe_session_id, (m.get(r.stripe_session_id) || 0) + 1)
  return m
}

if (delIdx === -1) {
  console.log('唯讀模式。要刪除請加： --delete <id> <id> …\n')
  process.exit(0)
}

const ids = args.slice(delIdx + 1).filter((a) => !a.startsWith('--'))
if (ids.length === 0) { console.error('--delete 後面要接 id'); process.exit(1) }

const known = new Set(purchases.map((p) => p.id))
const unknown = ids.filter((i) => !known.has(i))
if (unknown.length) { console.error('這些 id 不在 purchases 裡：\n  ' + unknown.join('\n  ')); process.exit(1) }

// The guard is about the SESSION keeping a record, not about the row. Where a
// session was credited and has two purchase rows, one of them is a duplicate
// and deleting it loses nothing. What must never happen is deleting the last
// remaining row for a session whose points were credited: the ledger would then
// show points arriving with no purchase behind them.
const willRemain = rowsPerSessionOf(purchases)
for (const i of ids) {
  const s = purchases.find((p) => p.id === i).stripe_session_id
  willRemain.set(s, willRemain.get(s) - 1)
}
const guarded = ids.filter((i) => {
  const s = purchases.find((p) => p.id === i).stripe_session_id
  return bySession.get(s) && willRemain.get(s) < 1
})
if (guarded.length) {
  console.error('拒絕刪除：這些 session 的點數已經入帳，刪掉最後一筆會讓帳本上的點數沒有對應的付款紀錄\n  ' + guarded.join('\n  '))
  process.exit(1)
}

for (const id of ids) {
  await rest(`purchases?id=eq.${id}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } })
  console.log('已刪除', id)
}

const after = await rest('purchases?select=id')
console.log(`\n完成。purchases 剩 ${after.length} 筆。\n`)
