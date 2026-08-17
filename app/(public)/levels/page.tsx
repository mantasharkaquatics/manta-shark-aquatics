import type { Metadata } from 'next'
import LevelsContent from './LevelsContent'

export const metadata: Metadata = {
  title: 'Swim Levels | Manta Shark Aquatics',
  description: 'The nine MantaShark levels, from first splash to competitive technique.',
}

export default function LevelsPage() {
  return <LevelsContent />
}
