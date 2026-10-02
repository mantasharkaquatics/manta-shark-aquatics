import type { ReactNode } from 'react'

// labelKey / titleKey are dictionary keys (admin.nav.*), translated where the
// sidebar renders them. desc is a note for whoever reads this file; nothing shows it.
export type NavItem = { href: string; labelKey: string; desc: string; icon: ReactNode }
export type NavGroup = { titleKey: string; items: NavItem[] }

const S = { width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }

export const NAV_GROUPS: NavGroup[] = [
  {
    titleKey: 'admin.nav.group.overview',
    items: [
      { href: '/admin', labelKey: 'admin.nav.dashboard', desc: 'Today at a glance', icon: <svg {...S}><rect x="3" y="3" width="7" height="9" rx="1" /><rect x="14" y="3" width="7" height="5" rx="1" /><rect x="14" y="12" width="7" height="9" rx="1" /><rect x="3" y="16" width="7" height="5" rx="1" /></svg> },
    ],
  },
  {
    titleKey: 'admin.nav.group.students',
    items: [
      { href: '/admin/members', labelKey: 'admin.nav.members', desc: 'Parents and students', icon: <svg {...S}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg> },
      { href: '/admin/progress-history', labelKey: 'admin.nav.progress', desc: 'Lesson notes and history', icon: <svg {...S}><path d="M3 3v18h18" /><path d="m19 9-5 5-4-4-3 3" /></svg> },
      { href: '/admin/reviews', labelKey: 'admin.nav.reviews', desc: 'Waiting on you', icon: <svg {...S}><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></svg> },
      { href: '/admin/monthly-reports', labelKey: 'admin.nav.monthlyReports', desc: 'Approve before they go out', icon: <svg {...S}><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 15v-3M12 15V9M16 15v-5" /><path d="M8 18h8" /></svg> },
      { href: '/admin/curriculum', labelKey: 'admin.nav.curriculum', desc: 'Every level, skill and prerequisite', icon: <svg {...S}><circle cx="12" cy="5" r="2.5" /><circle cx="6" cy="19" r="2.5" /><circle cx="18" cy="19" r="2.5" /><path d="M12 7.5v4M12 11.5H6.5a.5.5 0 0 0-.5.5v4.5M12 11.5h5.5a.5.5 0 0 1 .5.5v4.5" /></svg> },
      { href: '/admin/upgrades', labelKey: 'admin.nav.levels', desc: 'Assign levels and skills', icon: <svg {...S}><path d="M12 19V5" /><path d="m5 12 7-7 7 7" /></svg> },
    ],
  },
  {
    titleKey: 'admin.nav.group.scheduling',
    items: [
      { href: '/admin/booking', labelKey: 'admin.nav.booking', desc: 'Book and move lessons', icon: <svg {...S}><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></svg> },
      { href: '/admin/schedule', labelKey: 'admin.nav.schedule', desc: 'Weekly class calendar', icon: <svg {...S}><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></svg> },
      { href: '/admin/zones', labelKey: 'admin.nav.zones', desc: 'Coach time slots', icon: <svg {...S}><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></svg> },
      { href: '/admin/time-off', labelKey: 'admin.nav.timeOff', desc: 'Coach absences', icon: <svg {...S}><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18M9 16h6" /></svg> },
    ],
  },
  {
    titleKey: 'admin.nav.group.frontDesk',
    items: [
      { href: '/admin/checkin', labelKey: 'admin.nav.checkin', desc: 'Today\u2019s arrivals', icon: <svg {...S}><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></svg> },
      { href: '/admin/sales', labelKey: 'admin.nav.sales', desc: 'Payments and invoices', icon: <svg {...S}><path d="M12 1v22" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg> },
      { href: '/admin/finance', labelKey: 'admin.nav.finance', desc: 'What you owe in lessons', icon: <svg {...S}><path d="M3 3v18h18" /><rect x="7" y="12" width="3" height="6" /><rect x="12" y="8" width="3" height="10" /><rect x="17" y="5" width="3" height="13" /></svg> },
      { href: '/admin/pos', labelKey: 'admin.nav.pos', desc: 'Sell at the desk', icon: <svg {...S}><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20" /></svg> },
      { href: '/admin/messages', labelKey: 'admin.nav.messages', desc: 'Parent conversations', icon: <svg {...S}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg> },
      { href: '/admin/suggestions', labelKey: 'admin.nav.suggestions', desc: 'From the suggestion box', icon: <svg {...S}><path d="M4 4h16v12H8l-4 4z" /><path d="M9 9h6M9 12h4" /></svg> },
      { href: '/admin/fixed-classes', labelKey: 'admin.nav.fixedClasses', desc: 'Weekly classes, end one', icon: <svg {...S}><rect x="3" y="4" width="18" height="17" rx="2" /><path d="M3 9h18M8 2v4M16 2v4" /><path d="M8 14h3" /></svg> },
      { href: '/admin/vouchers', labelKey: 'admin.nav.vouchers', desc: 'Issue, void, expiring', icon: <svg {...S}><path d="M3 8a2 2 0 0 0 2-2h14a2 2 0 0 0 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 0-2 2H5a2 2 0 0 0-2-2v-2a2 2 0 0 0 0-4z" /><path d="M10 6v12" strokeDasharray="2 2" /></svg> },
    ],
  },
  {
    titleKey: 'admin.nav.group.staff',
    items: [
      { href: '/admin/coaches', labelKey: 'admin.nav.coaches', desc: 'Coach accounts', icon: <svg {...S}><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg> },
      { href: '/admin/applications', labelKey: 'admin.nav.applications', desc: 'Job applicants', icon: <svg {...S}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /><path d="M9 15h6M9 11h3" /></svg> },
    ],
  },
]
