// The questions families ask, in one place.
//
// The text lives in the locale dictionaries like everything else a customer
// reads; this file holds only the shape -- which questions exist and how they
// group. Two surfaces render from it: the /faq page, and the knowledge block
// the AI assistant is given. That is the point of the file. When the page and
// the assistant answer the same question from two different sources they
// eventually answer it two different ways, and the parent has no way to tell
// which one is true.
//
// Adding a question: add its id here, then faq.q.<id> and faq.a.<id> to all
// three locale files. scripts/i18n-check.mjs will tell you if you missed one.

import { CASH_REFUND_ENABLED } from '@/lib/points'

export type FaqCategory = { id: string; items: readonly string[] }

export const FAQ: readonly FaqCategory[] = [
  {
    id: 'first',
    items: ['start', 'age', 'adaptive', 'bring', 'diaper', 'pool', 'changing', 'parking', 'watch', 'supervision', 'coachSafety', 'lifeguard', 'crying'],
  },
  {
    id: 'lessons',
    items: ['levelHow', 'duration', 'pairing', 'progress'],
  },
  {
    id: 'booking',
    items: ['fixedWhat', 'single14', 'cancel', 'late', 'sick', 'voucher', 'renew', 'moveSlot', 'pair24', 'pairOther', 'assessCancel', 'weather'],
  },
  {
    id: 'money',
    // The refund question waits for the cash-refund switch (owner,
    // 2026-11-06, run-2 J56: written now, shown once the lawyer has read the
    // Terms and CASH_REFUND_ENABLED is on). Until then the site does not
    // bring refunds up (owner, 2026-09-28); the Terms have the rule and the
    // assistant answers when asked (lib/ai/policies.ts, REFUNDS).
    items: ['buy', 'assessCredit', 'referral', 'expiry', ...(CASH_REFUND_ENABLED ? ['refund'] : []), 'shared', 'teamBilling'],
  },
  {
    id: 'team',
    items: ['teamWho', 'teamWhat'],
  },
] as const

export const FAQ_IDS: readonly string[] = FAQ.flatMap(c => c.items)
