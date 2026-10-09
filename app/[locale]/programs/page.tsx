import { liveMarketingMetadata } from '@/lib/marketing-metadata'
import type { Locale } from '@/lib/i18n'
import ProgramsContent from '@/app/(public)/programs/ProgramsContent'

// {place} in the title follows the pools open to families (lib/marketing-metadata.ts).
export const revalidate = 300

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  return liveMarketingMetadata('programs', '/programs', locale as Locale)
}

export default function Page() {
  return <ProgramsContent />
}
