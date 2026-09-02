// Does .env.local hold the same webhook signing secret that `stripe listen`
// is currently using?
//
//   node scripts/check-webhook-secret.mjs
//
// Why this exists: `stripe listen` mints a signing secret, and a later run can
// mint a different one. When that happens the dev server rejects every event as
// an invalid signature, the wallet is never credited, and the symptom a person
// actually notices is "I topped up and the points didn't arrive" — which looks
// nothing like a signature problem. This is the first thing to check when that
// happens, before reading any code.
//
// Neither secret is printed in full.

import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'

const mask = (s) => (s ? `${s.slice(0, 11)}…${s.slice(-4)} (${s.length} 字)` : '(空的)')

let envSecret = null
try {
  const line = readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split('\n')
    .find((l) => l.startsWith('STRIPE_WEBHOOK_SECRET='))
  if (line) envSecret = line.slice('STRIPE_WEBHOOK_SECRET='.length).trim().replace(/^["']|["']$/g, '')
} catch {
  console.error('讀不到 .env.local'); process.exit(1)
}

let cliSecret = null
try {
  cliSecret = execFileSync('stripe', ['listen', '--print-secret'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
} catch {
  console.log('\n跑不動 `stripe listen --print-secret`。')
  console.log('要嘛 stripe CLI 沒裝，要嘛還沒 `stripe login`（記得選沙盒／測試模式，不是正式帳戶）。\n')
  process.exit(1)
}

console.log(`\n.env.local   ${mask(envSecret)}`)
console.log(`stripe CLI   ${mask(cliSecret)}\n`)

if (!envSecret) {
  console.log('❌ .env.local 裡沒有 STRIPE_WEBHOOK_SECRET。\n')
  process.exit(1)
}
if (envSecret === cliSecret) {
  console.log('✅ 一致。webhook 簽章驗得過，儲值沒入帳的原因不在這裡。\n')
  process.exit(0)
}

console.log('❌ 不一致 — dev server 會把每個事件都當成偽造的擋掉。')
console.log('   修法：把 .env.local 的 STRIPE_WEBHOOK_SECRET 換成 CLI 這一把，然後重啟 dev server。')
console.log('   一行搞定（在專案根目錄）：')
console.log("     sed -i '' \"s|^STRIPE_WEBHOOK_SECRET=.*|STRIPE_WEBHOOK_SECRET=$(stripe listen --print-secret)|\" .env.local\n")
process.exit(1)
