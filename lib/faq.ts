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

export type FaqCategory = { id: string; items: readonly string[] }

export const FAQ: readonly FaqCategory[] = [
  {
    id: 'first',
    items: ['start', 'age', 'bring', 'diaper', 'pool', 'watch', 'crying'],
  },
  {
    id: 'lessons',
    items: ['levelHow', 'duration', 'pairing', 'progress'],
  },
  {
    id: 'booking',
    items: ['cancel', 'late', 'token', 'pair24', 'assessCancel', 'weather'],
  },
  {
    id: 'money',
    items: ['buy', 'validity', 'shared', 'refund', 'teamBilling'],
  },
  {
    id: 'team',
    items: ['teamWho', 'teamWhat'],
  },
] as const

export const FAQ_IDS: readonly string[] = FAQ.flatMap(c => c.items)
