import { marketingMetadata } from '@/lib/marketing-metadata'
import AdaptiveContent from './AdaptiveContent'

export const metadata = marketingMetadata('adaptive', '/adaptive-swim')

export default function AdaptiveSwimPage() {
  return <AdaptiveContent />
}
