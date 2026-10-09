import { liveMarketingMetadata } from '@/lib/marketing-metadata'
import type { Locale } from '@/lib/i18n'
import ProgramDetail from '@/app/(public)/programs/ProgramDetail'

// {place} in the title follows the pools open to families (lib/marketing-metadata.ts).
export const revalidate = 300

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  return liveMarketingMetadata('programsPrivate', '/programs/private', locale as Locale)
}

export default function Page() {
  return <ProgramDetail kind="private" />
}
