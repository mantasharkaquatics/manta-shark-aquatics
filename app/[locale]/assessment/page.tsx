import { marketingMetadata } from '@/lib/marketing-metadata'
import type { Locale } from '@/lib/i18n'
import AssessmentContent from '@/app/(public)/assessment/AssessmentContent'

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  return marketingMetadata('assessment', '/assessment', locale as Locale)
}

export default function Page() {
  return <AssessmentContent />
}
