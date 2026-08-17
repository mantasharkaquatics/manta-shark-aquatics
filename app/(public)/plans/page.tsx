import type { Metadata } from 'next'
import PlansContent from './PlansContent'

export const metadata: Metadata = {
  title: 'Plans & Pricing | Manta Shark Aquatics',
  description: 'Lesson packages and swim team membership for every level, in Brea, California.',
}

export default function PlansPage() {
  return <PlansContent />
}
