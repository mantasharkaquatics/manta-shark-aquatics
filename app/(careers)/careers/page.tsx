import type { Metadata } from 'next'
import { SITE_URL, HIRING } from '@/lib/site-config'
import CareersContent from './CareersContent'

// This page is deliberately EXEMPT from the pre-launch noindex in app/layout.tsx.
// Hiring has a long lead time, so /careers is the one page allowed into search
// results before the site launches. app/robots.ts allows this path too.
export const metadata: Metadata = {
  title: 'Swim Instructor Jobs in California | Manta Shark Aquatics',
  description: HIRING.open
    ? 'Now hiring swim coaches, lifeguards and front desk staff in California. No certification required to start, we train you. $20-55/hr, part-time to 30+ hours.'
    : 'Swim coach, lifeguard and front desk roles at Manta Shark Aquatics in California. No openings right now — tell us about yourself and we will get in touch when one comes up.',
  alternates: { canonical: SITE_URL + '/careers' },
  robots: { index: true, follow: true },
}

// Both dates and the on/off switch live in lib/site-config.ts, with the other
// claims about the business that only a human can update.
const DATE_POSTED = HIRING.datePosted
const VALID_THROUGH = HIRING.validThrough

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
      {/* Structured data only while the role is really open. A JobPosting for a
          job nobody can be hired into is the exact thing Google penalises, and
          the page still ranks on its own content without it. */}
      {HIRING.open && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jobPosting) }}
        />
      )}
      <CareersContent open={HIRING.open} />
    </>
  )
}
