import { marketingMetadata } from '@/lib/marketing-metadata'
import type { Locale } from '@/lib/i18n'
import AboutContent from '@/app/(public)/about/AboutContent'

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  return marketingMetadata('about', '/about', locale as Locale)
}

export default function Page() {
  return <AboutContent />
}
