import NotFoundBody from '@/components/NotFoundBody'

// A pool that does not exist or is not open to families. The layout around
// this already draws the Navbar and Footer (components/NotFoundBody.tsx).
export default function LocationNotFound() {
  return <NotFoundBody />
}
