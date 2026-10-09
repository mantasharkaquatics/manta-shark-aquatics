import { liveMarketingMetadata } from '@/lib/marketing-metadata'
import AssessmentContent from './AssessmentContent'

// {place} in the title follows the pools open to families (lib/marketing-metadata.ts).
export const revalidate = 300

export async function generateMetadata() {
  return liveMarketingMetadata('assessment', '/assessment')
}

export default function AssessmentPage() {
  return <AssessmentContent />
}
