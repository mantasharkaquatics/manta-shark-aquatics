import { liveMarketingMetadata } from '@/lib/marketing-metadata'
import type { Locale } from '@/lib/i18n'
import AssessmentContent from '@/app/(public)/assessment/AssessmentContent'

// {place} in the title follows the pools open to families (lib/marketing-metadata.ts).
export const revalidate = 300

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  return liveMarketingMetadata('assessment', '/assessment', locale as Locale)
}

export default function Page() {
  return <AssessmentContent />
}
