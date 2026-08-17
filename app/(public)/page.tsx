import type { Metadata } from 'next'
import HomeContent from './HomeContent'

export const metadata: Metadata = {
  title: 'Manta Shark Aquatics — Swim Lessons in Brea, CA',
  description: 'Professional swim lessons in Brea, California — 1-on-1, semi-private, group classes, and swim team.',
}

export default function HomePage() {
  return <HomeContent />
}
