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
//
// The other side matters as much: a family told "it's cancelled" when it is
// not skips a lesson that is still booked. Each CATCH line is a claim the
// guard must stop; the first narrow version let "Your lesson is cancelled",
// "Cancelled!", "points are back", 幫您把…取消了 and 課取消了 through. Add a line
// here whenever a new phrasing turns up, on either side.

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
  // Found 2026-10-08 (audit): rules and refund answers the narrow guard still blocked.
  'Refunds go back to the original payment method. A cash refund is processed at the front desk.',
  'After a lesson has been cancelled more than 24 hours ahead, your points go back in full.',
  'As soon as a lesson is cancelled, the points are back in your balance.',
  'Before a lesson is cancelled, please make sure you have checked the date.',
  'By the time a lesson is cancelled, the points have already been returned to the balance.',
  'Any time a lesson is cancelled by the school, the points come back automatically.',
  'Lessons cancelled more than 24 hours ahead are refunded in full.',
  'A lesson that is cancelled more than 24 hours ahead is refunded in full.',
  'Any lesson cancelled by the school is refunded automatically.',
  'Lessons are cancelled automatically when the pool closes, and your points are returned in full.',
  'Cancellations made more than 24 hours ahead are refunded in full.',
  'Points are returned automatically when the school cancels a lesson.',
  'If the school cancels a lesson, the points are back in your balance right away.',
  'Should a lesson be cancelled by the school, your points are returned in full.',
  'Cancel more than 24 hours ahead and your points are refunded in full.',
  'Cancelled lessons do not count toward the 8 lessons for the assessment credit.',
  // The confirmation step, before anything is done.
  'Would you like me to cancel it? Once Kayden\'s lesson is cancelled, the 65 points will go back to your balance.',
  'Once it is cancelled, the points are back in your balance within a minute.',
  'Kayden\'s 9:00 AM lesson on Oct 12 is more than 24 hours away, so if you cancel it the 65 points will be refunded in full. Shall I go ahead?',
  'Once I have cancelled it, you will get a confirmation email.',
  'Your lesson will be cancelled once you confirm.',
  'Your lesson would have been refunded if it had been cancelled earlier.',
  'Nothing was cancelled.',
  'No lessons were cancelled.',
  'Your lesson is still booked; it has not been cancelled.',
  'Is your lesson cancelled? Let me check.',
  'I can check whether the lesson has been cancelled for you.',
  'The lesson can be cancelled online up to 24 hours before it starts.',
  'Refunds are processed within 5 business days.',
  'Your refund will be processed at the front desk.',
  'When a 1-on-2 is cancelled by one family, the other family\'s lesson becomes a 1-on-1.',
  'Is there anything else now that the lesson is cancelled?',
  // Traditional Chinese
  '取消了以後，點數會在幾分鐘內退回。',
  '課程取消後，點數會全額退回。',
  '提前超過 24 小時取消了，點數就全額退回了。',
  '確認後我就幫您取消了喔。',
  '請問要把 10/12 Kayden 的課取消了嗎？',
  '要我幫您把這堂課取消嗎？',
  '這堂課不能取消了。',
  '我現在就幫您取消。',
  '點數會全額退回。',
  '一旦課程取消了，點數會自動退回。',
  '當課程被取消時，點數會自動退回您的帳戶。',
  '學校取消課程的話，點數會全額退回。',
  '取消成功後，您會收到確認信。',
  '我沒有幫您取消任何課程。',
  '在課程取消之前，請先確認日期。',
  '已取消或已完成的課程不能再取消。',
  // Simplified Chinese
  '课程取消了以后，点数会自动退回。',
  '如果课程被取消了，点数会全额退回到您的账户。',
  '只要提前超过 24 小时取消，点数就会全额退回了。',
  '要我帮您把这节课取消吗？',
  '这节课还没有取消。',
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
  // Found 2026-10-08 (audit): natural claims the narrow guard let through.
  'Your lesson is cancelled.',
  'All set — Kayden\'s lesson on Oct 12 is cancelled.',
  'Good news: Kayden\'s lesson is cancelled and 65 points are back in your balance.',
  'Cancelled! 65 points are back in your balance.',
  'Done, cancelled.',
  'It\'s cancelled.',
  'That lesson is canceled now.',
  'Your 9:00 AM lesson on Thursday is all cancelled.',
  'Both lessons are cancelled.',
  'Your points are back.',
  '65 points went back to your balance.',
  'I\'ve added the 65 points back to your balance.',
  'We\'ve cancelled Kayden\'s lesson.',
  'I got that cancelled for you.',
  'Okay, I cancelled the Thursday lesson.',
  'After checking the schedule, I\'ve cancelled Kayden\'s Oct 12 lesson.',
  'Kayden\'s lesson has been successfully cancelled.',
  'Your refund has been issued.',
  'The refund was processed.',
  'Your cancellation is confirmed.',
  'Your refund is on its way.',
  'Kayden\'s lesson is cancelled due to the weather.',
  'Your lesson is cancelled. If you need anything else, just let me know.',
  'Kayden\'s Oct 12 lesson has been cancelled — anything else I can help with?',
  'If you need anything else, Kayden\'s Oct 12 lesson has been cancelled and the points are back.',
  'You\'ve been refunded 65 points.',
  'Thank you! Everything is cancelled as requested.',
  'No problem, it\'s done: the lesson is cancelled.',
  'I\'m sorry, the lesson has been cancelled.',
  'Okay! Cancelled.',
  // Traditional Chinese
  '我已經幫您把 10/12 Kayden 的課取消了。',
  'Kayden 10/12 的課取消了，65 點已經回到帳戶。',
  '取消好了！',
  '取消完成，點數已退回。',
  '點數退回了。',
  '搞定！Kayden 週四的課取消囉。',
  '好的沒問題，已經幫您取消了。',
  '不好意思久等了，課已經取消了。',
  '我幫您取消了喔，還有其他需要嗎？',
  '這堂課已被取消。',
  '退款已完成。',
  '65 點已加回您的帳戶。',
  '點數都回來了。',
  '沒問題！已經取消了。',
  '不過這堂課已經取消了。',
  // Simplified Chinese
  '好的，已经帮您把这节课取消了。',
  '这节课取消了，点数也退回了。',
  '65 点已退回到您的账户。',
  '已经帮您取消掉了。',
  '取消成功，点数已经回到账户了。',
  '好的，Kayden 周四的课我已经取消好了。',
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
