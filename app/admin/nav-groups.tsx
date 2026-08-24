import type { ReactNode } from 'react'

export type NavItem = { href: string; label: string; desc: string; icon: ReactNode }
export type NavGroup = { title: string; items: NavItem[] }

const S = { width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }

export const NAV_GROUPS: NavGroup[] = [
  {
    title: 'Overview',
    items: [
      { href: '/admin', label: 'Dashboard', desc: 'Today at a glance', icon: <svg {...S}><rect x="3" y="3" width="7" height="9" rx="1" /><rect x="14" y="3" width="7" height="5" rx="1" /><rect x="14" y="12" width="7" height="9" rx="1" /><rect x="3" y="16" width="7" height="5" rx="1" /></svg> },
    ],
  },
  {
    title: 'Students',
    items: [
      { href: '/admin/members', label: 'Members', desc: 'Parents and students', icon: <svg {...S}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg> },
      { href: '/admin/progress-history', label: 'Progress', desc: 'Lesson notes and history', icon: <svg {...S}><path d="M3 3v18h18" /><path d="m19 9-5 5-4-4-3 3" /></svg> },
      { href: '/admin/reviews', label: 'Reviews', desc: 'Waiting on you', icon: <svg {...S}><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></svg> },
      { href: '/admin/upgrades', label: 'Levels', desc: 'Assign levels and skills', icon: <svg {...S}><path d="M12 19V5" /><path d="m5 12 7-7 7 7" /></svg> },
    ],
  },
  {
    title: 'Scheduling',
    items: [
      { href: '/admin/booking', label: 'Booking', desc: 'Book and move lessons', icon: <svg {...S}><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></svg> },
      { href: '/admin/schedule', label: 'Schedule', desc: 'Weekly class calendar', icon: <svg {...S}><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></svg> },
      { href: '/admin/zones', label: 'Zones', desc: 'Coach time slots', icon: <svg {...S}><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></svg> },
      { href: '/admin/time-off', label: 'Time Off', desc: 'Coach absences', icon: <svg {...S}><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18M9 16h6" /></svg> },
    ],
  },
  {
    title: 'Front desk',
    items: [
      { href: '/admin/checkin', label: 'Check-in', desc: 'Today\u2019s arrivals', icon: <svg {...S}><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></svg> },
      { href: '/admin/sales', label: 'Sales', desc: 'Payments and invoices', icon: <svg {...S}><path d="M12 1v22" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg> },
      { href: '/admin/pos', label: 'POS', desc: 'Sell at the desk', icon: <svg {...S}><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20" /></svg> },
      { href: '/admin/messages', label: 'Messages', desc: 'Parent conversations', icon: <svg {...S}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg> },
    ],
  },
  {
    title: 'Staff',
    items: [
      { href: '/admin/coaches', label: 'Coaches', desc: 'Coach accounts', icon: <svg {...S}><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg> },
      { href: '/admin/applications', label: 'Applications', desc: 'Job applicants', icon: <svg {...S}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /><path d="M9 15h6M9 11h3" /></svg> },
    ],
  },
]
