import { liveMarketingMetadata } from '@/lib/marketing-metadata'
import { publicLocations } from '@/lib/public-locations'
import HomeContent from './HomeContent'

// The pool list is read here, on the server, so the "Our locations" section
// and the hero's place are in the prerendered HTML. Refreshed every five
// minutes (lib/public-locations.ts); with one pool the page is as it was.
export const revalidate = 300

export async function generateMetadata() {
  return liveMarketingMetadata('home', '')
}

export default async function HomePage() {
  return <HomeContent locations={await publicLocations()} />
}
