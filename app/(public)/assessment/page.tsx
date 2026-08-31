import { marketingMetadata } from '@/lib/marketing-metadata'
import AssessmentContent from './AssessmentContent'

export const metadata = marketingMetadata('assessment', '/assessment')

export default function AssessmentPage() {
  return <AssessmentContent />
}
