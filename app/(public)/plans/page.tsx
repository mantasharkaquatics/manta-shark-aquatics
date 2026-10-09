import { liveMarketingMetadata } from '@/lib/marketing-metadata'
import PlansContent from './PlansContent'

// {place} in the title follows the pools open to families (lib/marketing-metadata.ts).
export const revalidate = 300

export async function generateMetadata() {
  return liveMarketingMetadata('plans', '/plans')
}

export default function PlansPage() {
  return <PlansContent />
}
