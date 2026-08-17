import type { Metadata } from 'next'
import AboutContent from './AboutContent'

export const metadata: Metadata = {
  title: 'About Us | Manta Shark Aquatics',
  description: 'Coaching rooted in education, psychology, sports science and child development.',
}

export default function AboutPage() {
  return <AboutContent />
}
