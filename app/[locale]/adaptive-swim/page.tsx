import { marketingMetadata } from '@/lib/marketing-metadata'
import type { Locale } from '@/lib/i18n'
import AdaptiveContent from '@/app/(public)/adaptive-swim/AdaptiveContent'

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  return marketingMetadata('adaptive', '/adaptive-swim', locale as Locale)
}

export default function Page() {
  return <AdaptiveContent />
}
