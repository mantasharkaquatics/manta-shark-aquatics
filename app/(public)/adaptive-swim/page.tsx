import { liveMarketingMetadata } from '@/lib/marketing-metadata'
import AdaptiveContent from './AdaptiveContent'

// {place} in the title follows the pools open to families (lib/marketing-metadata.ts).
export const revalidate = 300

export async function generateMetadata() {
  return liveMarketingMetadata('adaptive', '/adaptive-swim')
}

export default function AdaptiveSwimPage() {
  return <AdaptiveContent />
}
