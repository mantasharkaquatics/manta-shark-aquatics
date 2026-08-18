import type { Metadata } from 'next'
import { SITE_URL } from '@/lib/site-config'
import CareersContent from './CareersContent'

// This page is deliberately EXEMPT from the pre-launch noindex in app/layout.tsx.
// Hiring has a long lead time, so /careers is the one page allowed into search
// results before the site launches. app/robots.ts allows this path too.
export const metadata: Metadata = {
  title: 'Swim Instructor Jobs in California | Manta Shark Aquatics',
  description: 'Now hiring swim coaches, lifeguards and front desk staff in California. No certification required to start, we train you. $20-55/hr, part-time to 30+ hours.',
  alternates: { canonical: SITE_URL + '/careers' },
  robots: { index: true, follow: true },
}

// UPDATE THIS DATE when the posting is refreshed. Google downranks stale
// job postings, and a hard-coded date in a static page will not move itself.
const DATE_POSTED = '2026-08-18'
const VALID_THROUGH = '2027-02-18'

const jobPosting = {
  '@context': 'https://schema.org',
  '@type': 'JobPosting',
  title: 'Swim Instructor',
  description: 'Manta Shark Aquatics is hiring swim coaches, lifeguards and front desk staff. No teaching or lifeguard certification is required to start, training is provided and paid for. Part-time schedules up to 30+ hours a week.',
  datePosted: DATE_POSTED,
  validThrough: VALID_THROUGH,
  employmentType: ['PART_TIME'],
  hiringOrganization: {
    '@type': 'Organization',
    name: 'Manta Shark Aquatics',
    sameAs: SITE_URL,
  },
  jobLocation: {
    '@type': 'Place',
    address: {
      '@type': 'PostalAddress',
      addressLocality: 'Brea',
      addressRegion: 'CA',
      addressCountry: 'US',
    },
  },
  baseSalary: {
    '@type': 'MonetaryAmount',
    currency: 'USD',
    value: {
      '@type': 'QuantitativeValue',
      minValue: 20,
      maxValue: 55,
      unitText: 'HOUR',
    },
  },
}

export default function CareersPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jobPosting) }}
      />
      <CareersContent />
    </>
  )
}
