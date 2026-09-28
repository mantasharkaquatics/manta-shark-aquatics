import { marketingMetadata } from '@/lib/marketing-metadata'
import type { Locale } from '@/lib/i18n'
import ProgramDetail from '@/app/(public)/programs/ProgramDetail'

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  return marketingMetadata('programsGroup', '/programs/group', locale as Locale)
}

export default function Page() {
  return <ProgramDetail kind="group" />
}
