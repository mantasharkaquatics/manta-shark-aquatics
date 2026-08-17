import { marketingMetadata } from '@/lib/marketing-metadata'
import type { Locale } from '@/lib/i18n'
import HomeContent from '@/app/(public)/HomeContent'

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  return marketingMetadata('home', '', locale as Locale)
}

export default function Page() {
  return <HomeContent />
}
