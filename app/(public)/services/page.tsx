import { marketingMetadata } from '@/lib/marketing-metadata'
import ServicesContent from './ServicesContent'

export const metadata = marketingMetadata('services', '/services')

export default function ServicesPage() {
  return <ServicesContent />
}
