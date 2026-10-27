import Navbar from '@/components/Navbar'
import Footer from '@/components/Footer'
import ActivityPing from '@/components/ActivityPing'
import GlobalChat from '@/components/GlobalChat'
import AppShell from '@/components/AppShell'
import { FONT_BODY } from '@/lib/brand'
import BrandStyles from '@/components/brand/BrandStyles'
import { footerLocations } from '@/lib/public-locations'

export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  // The footer names each pool once there is more than one (components/Footer.tsx).
  // A cached read, refreshed every five minutes (lib/public-locations.ts).
  const pools = (await footerLocations()).map(l => ({ id: l.id, name: l.name }))
  return (
    // display: contents -- the wrapper sets the reading face for every public
    // page without adding a box to the layout.
    <div style={{ display: 'contents', fontFamily: FONT_BODY }}>
      <BrandStyles />
      <Navbar />
      <ActivityPing />
      {/* The page's own landmark, and where the nav bar's skip link lands
          (found 2026-10-15: no parent page had a <main>). A flex column, as
          the body is, so each page's top element lays out exactly as it did
          when it sat in the body directly. */}
      <main id="main-content" tabIndex={-1} style={{ display: 'flex', flexDirection: 'column' }}>
        {children}
      </main>
      {/* Not in the phone app (app/globals.css .msa-web-only). */}
      <div className="msa-web-only"><Footer locations={pools} /></div>
      <GlobalChat />
      <AppShell />
    </div>
  )
}
