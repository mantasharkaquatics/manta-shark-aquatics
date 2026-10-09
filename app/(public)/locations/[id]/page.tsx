import { notFound } from 'next/navigation'
import { marketingMetadata } from '@/lib/marketing-metadata'
import { locationIds, locationPageData } from '@/lib/public-locations'
import LocationContent from './LocationContent'

// Rebuilt at most every five minutes, so a pool turned on or off in
// Admin > Locations shows here without a deploy (lib/public-locations.ts).
// While only one pool is open every id is a 404: no location pages at all.
export const revalidate = 300

export async function generateStaticParams() {
  return (await locationIds()).map(id => ({ id }))
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const data = await locationPageData(id)
  if (!data) return {}
  return marketingMetadata('location', '/locations/' + id, 'en', { name: data.location.name })
}

export default async function LocationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const data = await locationPageData(id)
  if (!data) notFound()
  return <LocationContent {...data} />
}
