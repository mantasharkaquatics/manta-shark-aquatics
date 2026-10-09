import { liveMarketingMetadata } from '@/lib/marketing-metadata'
import { publicLocations } from '@/lib/public-locations'
import type { Locale } from '@/lib/i18n'
import HomeContent from '@/app/(public)/HomeContent'

// See app/(public)/page.tsx.
export const revalidate = 300

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  return liveMarketingMetadata('home', '', locale as Locale)
}

export default async function Page() {
  return <HomeContent locations={await publicLocations()} />
}
