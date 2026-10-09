import { notFound } from 'next/navigation'
import { marketingMetadata } from '@/lib/marketing-metadata'
import { locationIds, locationPageData } from '@/lib/public-locations'
import type { Locale } from '@/lib/i18n'
import LocationContent from '@/app/(public)/locations/[id]/LocationContent'

// Same page as app/(public)/locations/[id], in Chinese. The [locale] layout's
// dynamicParams = false means only ids listed at build are served here, which
// is why locationIds() lists hidden pools too (their pages 404 until the pool
// is turned on, then ISR picks it up within five minutes).
export const revalidate = 300

export async function generateStaticParams() {
  return (await locationIds()).map(id => ({ id }))
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params
  const data = await locationPageData(id)
  if (!data) return {}
  return marketingMetadata('location', '/locations/' + id, locale as Locale, { name: data.location.name })
}

export default async function Page({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { id } = await params
  const data = await locationPageData(id)
  if (!data) notFound()
  return <LocationContent {...data} />
}
