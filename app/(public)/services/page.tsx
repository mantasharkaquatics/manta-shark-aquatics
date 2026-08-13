import type { Metadata } from 'next'
import ServicesContent from './ServicesContent'

export const metadata: Metadata = {
  title: 'Lessons & Pricing | Manta Shark Aquatics',
  description: 'Private, semi-private and group swim lesson packages in Brea, California.',
}

export default function ServicesPage() {
  return <ServicesContent />
}
