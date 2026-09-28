import { marketingMetadata } from '@/lib/marketing-metadata'
import type { Locale } from '@/lib/i18n'
import ProgramsContent from '@/app/(public)/programs/ProgramsContent'

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  return marketingMetadata('programs', '/programs', locale as Locale)
}

export default function Page() {
  return <ProgramsContent />
}
