import Navbar from '@/components/Navbar'
import Footer from '@/components/Footer'
import ActivityPing from '@/components/ActivityPing'
import { FONT_BODY } from '@/lib/brand'

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    // display: contents -- the wrapper sets the reading face for every public
    // page without adding a box to the layout.
    <div style={{ display: 'contents', fontFamily: FONT_BODY }}>
      <Navbar />
      <ActivityPing />
      {children}
      <Footer />
    </div>
  )
}
