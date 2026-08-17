import { marketingMetadata } from '@/lib/marketing-metadata'
import AboutContent from './AboutContent'

export const metadata = marketingMetadata('about', '/about')

export default function AboutPage() {
  return <AboutContent />
}
