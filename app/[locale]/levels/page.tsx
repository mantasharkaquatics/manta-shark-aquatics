import { marketingMetadata } from '@/lib/marketing-metadata'
import type { Locale } from '@/lib/i18n'
import LevelsContent from '@/app/(public)/levels/LevelsContent'

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  return marketingMetadata('levels', '/levels', locale as Locale)
}

export default function Page() {
  return <LevelsContent />
}
