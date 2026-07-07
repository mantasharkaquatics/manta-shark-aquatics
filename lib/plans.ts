export type Plan = {
  name: string
  amount: number
  sessions: number
  courseSlug: string
}

export const PLANS: Record<string, Plan> = {
  '1on1-10': { name: '1-on-1 Private · 10 Sessions',      amount: 65000,  sessions: 10, courseSlug: '1on1' },
  '1on1-20': { name: '1-on-1 Private · 20 Sessions',      amount: 126000, sessions: 20, courseSlug: '1on1' },
  '1on1-30': { name: '1-on-1 Private · 30 Sessions',      amount: 185000, sessions: 30, courseSlug: '1on1' },
  '1on1-50': { name: '1-on-1 Private · 50 Sessions',      amount: 300000, sessions: 50, courseSlug: '1on1' },
  '1on2-10': { name: '1-on-2 Semi-Private · 10 Sessions', amount: 105000, sessions: 10, courseSlug: '1on2' },
  '1on2-20': { name: '1-on-2 Semi-Private · 20 Sessions', amount: 200000, sessions: 20, courseSlug: '1on2' },
  '1on2-30': { name: '1-on-2 Semi-Private · 30 Sessions', amount: 285000, sessions: 30, courseSlug: '1on2' },
  '1on2-50': { name: '1-on-2 Semi-Private · 50 Sessions', amount: 450000, sessions: 50, courseSlug: '1on2' },
  '1on4-4':  { name: '1-on-4 Group · 4 Sessions/month',   amount: 16000,  sessions: 4,  courseSlug: '1on4' },
  '1on4-8':  { name: '1-on-4 Group · 8 Sessions/month',   amount: 30000,  sessions: 8,  courseSlug: '1on4' },
  'team':    { name: 'Swim Team · Monthly',                amount: 18000,  sessions: 8,  courseSlug: 'team' },
}

export const PLAN_GROUPS = [
  { label: '1-on-1 Private',      keys: ['1on1-10', '1on1-20', '1on1-30', '1on1-50'] },
  { label: '1-on-2 Semi-Private', keys: ['1on2-10', '1on2-20', '1on2-30', '1on2-50'] },
  { label: '1-on-4 Group',        keys: ['1on4-4', '1on4-8'] },
  { label: 'Swim Team',           keys: ['team'] },
]

// Swim Assessment: one per student, 1-on-1, 30 min
export const TRIAL_PRICE_CENTS = 8500
