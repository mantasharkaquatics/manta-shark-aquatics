import { marketingMetadata } from '@/lib/marketing-metadata'
import LevelsContent from './LevelsContent'

export const metadata = marketingMetadata('levels', '/levels')

export default function LevelsPage() {
  return <LevelsContent />
}
