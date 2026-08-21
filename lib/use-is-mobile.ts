'use client'

import { useEffect, useState } from 'react'

/**
 * Whether the viewport is narrower than `breakpoint` (768px by default, matching
 * Tailwind's `md`).
 *
 * Reading `window.innerWidth` straight into a render looks simpler and is what
 * this app did in two places, but it breaks twice over. The server has no window,
 * so it renders the desktop branch; the client's first render on a phone picks the
 * mobile branch; React reports a hydration mismatch and says outright that it will
 * NOT patch the difference up -- so the page can be left holding the server's
 * styles on a phone. And because nothing re-reads the value, rotating the device
 * leaves the old answer in place until some other state change forces a render.
 *
 * Starting at false and correcting in an effect keeps the first client render
 * identical to the server's, then flips on the frame after mount. The matchMedia
 * listener handles rotation and resize.
 */
export function useIsMobile(breakpoint = 768): boolean {
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint - 1}px)`)
    const sync = () => setIsMobile(mq.matches)
    sync()
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [breakpoint])

  return isMobile
}
