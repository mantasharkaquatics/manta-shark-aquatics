export type Plan = {
  name: string
  amount: number
  sessions: number
  courseSlug: string
  validityMonths: number
}

export const PLANS: Record<string, Plan> = {
  '1on1-10': { name: '1-on-1 Private · 10 Sessions',      amount: 65000,  sessions: 10, courseSlug: '1on1', validityMonths: 4 },
  '1on1-20': { name: '1-on-1 Private · 20 Sessions',      amount: 126000, sessions: 20, courseSlug: '1on1', validityMonths: 8 },
  '1on1-30': { name: '1-on-1 Private · 30 Sessions',      amount: 185000, sessions: 30, courseSlug: '1on1', validityMonths: 12 },
  '1on1-50': { name: '1-on-1 Private · 50 Sessions',      amount: 300000, sessions: 50, courseSlug: '1on1', validityMonths: 18 },
  '1on2-10': { name: '1-on-2 Semi-Private · 10 Sessions', amount: 105000, sessions: 10, courseSlug: '1on2', validityMonths: 4 },
  '1on2-20': { name: '1-on-2 Semi-Private · 20 Sessions', amount: 200000, sessions: 20, courseSlug: '1on2', validityMonths: 8 },
  '1on2-30': { name: '1-on-2 Semi-Private · 30 Sessions', amount: 285000, sessions: 30, courseSlug: '1on2', validityMonths: 12 },
  '1on2-50': { name: '1-on-2 Semi-Private · 50 Sessions', amount: 450000, sessions: 50, courseSlug: '1on2', validityMonths: 18 },
  '1on4-10': { name: '1-on-4 Group · 10 Sessions',         amount: 40000,  sessions: 10, courseSlug: '1on4', validityMonths: 4 },
  '1on4-20': { name: '1-on-4 Group · 20 Sessions',         amount: 76000,  sessions: 20, courseSlug: '1on4', validityMonths: 8 },
  'team':    { name: 'Swim Team · Monthly',                amount: 18000,  sessions: 8,  courseSlug: 'team', validityMonths: 1 },
}

export const PLAN_GROUPS = [
  { label: '1-on-1 Private',      keys: ['1on1-10', '1on1-20', '1on1-30', '1on1-50'] },
  { label: '1-on-2 Semi-Private', keys: ['1on2-10', '1on2-20', '1on2-30', '1on2-50'] },
  { label: '1-on-4 Group',        keys: ['1on4-10', '1on4-20'] },
  { label: 'Swim Team',           keys: ['team'] },
]

// Swim Assessment: one per student, 1-on-1, 30 min
export const TRIAL_PRICE_CENTS = 8500
