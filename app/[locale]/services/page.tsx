import { marketingMetadata } from '@/lib/marketing-metadata'
import type { Locale } from '@/lib/i18n'
import ServicesContent from '@/app/(public)/services/ServicesContent'

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  return marketingMetadata('services', '/services', locale as Locale)
}

export default function Page() {
  return <ServicesContent />
}
