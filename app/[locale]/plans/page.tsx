import { marketingMetadata } from '@/lib/marketing-metadata'
import type { Locale } from '@/lib/i18n'
import PlansContent from '@/app/(public)/plans/PlansContent'

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  return marketingMetadata('plans', '/plans', locale as Locale)
}

export default function Page() {
  return <PlansContent />
}
