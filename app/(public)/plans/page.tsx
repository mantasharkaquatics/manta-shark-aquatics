import { marketingMetadata } from '@/lib/marketing-metadata'
import PlansContent from './PlansContent'

export const metadata = marketingMetadata('plans', '/plans')

export default function PlansPage() {
  return <PlansContent />
}
