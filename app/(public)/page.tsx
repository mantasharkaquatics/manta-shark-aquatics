import { marketingMetadata } from '@/lib/marketing-metadata'
import HomeContent from './HomeContent'

export const metadata = marketingMetadata('home', '')

export default function HomePage() {
  return <HomeContent />
}
