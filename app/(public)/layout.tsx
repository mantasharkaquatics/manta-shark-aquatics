import Navbar from '@/components/Navbar'
import Footer from '@/components/Footer'
import ActivityPing from '@/components/ActivityPing'
import GlobalChat from '@/components/GlobalChat'
import { FONT_BODY } from '@/lib/brand'
import BrandStyles from '@/components/brand/BrandStyles'
import { shownLocations } from '@/lib/public-locations'

export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  // The footer names each pool once there is more than one (components/Footer.tsx).
  // A cached read, refreshed every five minutes (lib/public-locations.ts).
  const pools = (await shownLocations()).map(l => ({ id: l.id, name: l.name }))
  return (
    // display: contents -- the wrapper sets the reading face for every public
    // page without adding a box to the layout.
    <div style={{ display: 'contents', fontFamily: FONT_BODY }}>
      <BrandStyles />
      <Navbar />
      <ActivityPing />
      {children}
      <Footer locations={pools} />
      <GlobalChat />
    </div>
  )
}
