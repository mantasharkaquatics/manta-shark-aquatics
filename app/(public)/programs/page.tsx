import { marketingMetadata } from '@/lib/marketing-metadata'
import ProgramsContent from './ProgramsContent'

export const metadata = marketingMetadata('programs', '/programs')

export default function ProgramsPage() {
  return <ProgramsContent />
}
