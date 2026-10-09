import { liveMarketingMetadata } from '@/lib/marketing-metadata'
import ProgramsContent from './ProgramsContent'

// {place} in the title follows the pools open to families (lib/marketing-metadata.ts).
export const revalidate = 300

export async function generateMetadata() {
  return liveMarketingMetadata('programs', '/programs')
}

export default function ProgramsPage() {
  return <ProgramsContent />
}
