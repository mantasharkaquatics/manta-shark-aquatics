// Checks the chat assistant's "claims a cancellation" guard against worked
// replies (lib/ai/reply-guards.ts). Plain script, no test framework, like
// scripts/points-check.mjs:
//
//   node scripts/chat-guard-check.mjs
//
// Owner's rule (2026-10-08): the guard stops a reply that says a specific
// lesson WAS cancelled or refunded when no cancellation succeeded that turn.
// A policy explanation -- in English or Chinese -- must pass untouched. Each
// PASS line below is a reply the assistant really gives to "what is your
// cancellation policy?", "can I get my points refunded?" or "what if the
// school cancels?"; the guard once replaced every one of them with "I was not
// able to complete that cancellation".

import { readFileSync } from 'node:fs'
import ts from 'typescript'

const src = readFileSync(new URL('../lib/ai/reply-guards.ts', import.meta.url), 'utf8')
const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
const { claimsCompletedCancellation } = await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'))

// Policy answers: must NOT be treated as a claim.
const PASS = [
  // English
  'A single lesson cancelled more than 24 hours before it starts gets its points back in full. Inside 24 hours the points are not refunded, but each child has one monthly grace that turns the lesson into a make-up voucher.',
  'Unused points that you paid for can be refunded in cash at $1 per point, at any time, with no fee. Points already spent on lessons, and bonus points, cannot be refunded.',
  'If the school cancels a lesson (for example because of extreme weather), your points are returned in full automatically and the monthly grace is not used.',
  'If a lesson has been cancelled by the school, the points go back to your balance automatically.',
  'Points for a lesson that has been cancelled more than 24 hours ahead are refunded in full.',
  'Lessons that were cancelled inside 24 hours are not refunded.',
  'Nothing has been cancelled yet. Would you like me to cancel Kayden\'s 9:00 AM lesson on Oct 12?',
  'I have not cancelled anything. Please confirm which lesson you would like to cancel.',
  'Once a 1-on-2 shared with another family is cancelled more than 24 hours ahead, both families get their points back.',
  'A make-up cancelled more than 24 hours ahead returns the voucher; inside 24 hours the voucher is used.',
  'The Swim Assessment fee is not refundable once the assessment has taken place, but after 8 lessons within 60 days you get 85 bonus points back.',
  'I was not able to cancel that lesson online. A team member has been notified.',
  // Traditional Chinese
  '單堂課在開課前超過 24 小時取消，點數會全額退回；24 小時內取消，點數不會退回，但每個孩子每月有一次寬限，可以換成補課券。',
  '您付費購買、尚未使用的點數，隨時可以按 1 點 1 美元退款，沒有手續費。',
  '如果學校取消了課程，點數會自動全額退回，也不會用掉當月的寬限。',
  '如果課程已經取消，點數會在幾分鐘內退回您的帳戶。',
  '已取消的課程不會計入評估折抵的 8 堂課。',
  '目前還沒有取消任何課程。請問您要取消 10/12 早上 9:00（Kayden）那堂嗎？',
  '這堂課尚未取消。',
  // Simplified Chinese
  '单节课在开课前超过 24 小时取消，点数会全额退回；24 小时内取消，点数不会退回。',
  '如果学校取消了课程，点数会自动全额退回。',
  '您购买但未使用的点数可以随时按 1 点 1 美元退款。',
]

// Claims of a completed cancellation/refund: MUST be caught.
const CATCH = [
  'Done! Kayden\'s 9:00 AM lesson on Oct 12 has been cancelled and 65 points have been refunded to your balance.',
  'I\'ve cancelled the lesson for you.',
  'I have successfully cancelled Andy\'s Thursday lesson.',
  'Your lesson is now cancelled.',
  'Kayden\'s lesson was cancelled successfully.',
  'The cancellation is complete. You will receive an email shortly.',
  '65 points have been returned to your account.',
  'I went ahead and cancelled it.',
  '已為您取消 Kayden 10/12 早上 9:00 的課，65 點已退回您的帳戶。',
  '好的，我幫您取消了這堂課。',
  '這堂課已經取消了。',
  '取消成功！',
  '已为您取消这节课，点数已退回。',
  '好的，我帮您取消了。',
  // A claim with a condition AFTER it is still a claim.
  'Your lesson has been cancelled; if you want to rebook, use the booking page.',
  '已為您取消，如果需要重新預約請到預約頁面。',
]

let fails = 0
for (const t of PASS) {
  const got = claimsCompletedCancellation(t)
  if (got) { fails++; console.log(`  FAIL  policy text flagged as a claim:\n        ${t}`) }
  else console.log(`  ok    pass   ${t.slice(0, 70)}`)
}
for (const t of CATCH) {
  const got = claimsCompletedCancellation(t)
  if (!got) { fails++; console.log(`  FAIL  claim not caught:\n        ${t}`) }
  else console.log(`  ok    catch  ${t.slice(0, 70)}`)
}
console.log(fails ? `\n${fails} FAILED` : `\nOK (${PASS.length} pass, ${CATCH.length} caught)`)
process.exit(fails ? 1 : 0)
