import { liveMarketingMetadata } from '@/lib/marketing-metadata'
import type { Locale } from '@/lib/i18n'
import AdaptiveContent from '@/app/(public)/adaptive-swim/AdaptiveContent'

// {place} in the title follows the pools open to families (lib/marketing-metadata.ts).
export const revalidate = 300

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  return liveMarketingMetadata('adaptive', '/adaptive-swim', locale as Locale)
}

export default function Page() {
  return <AdaptiveContent />
}
