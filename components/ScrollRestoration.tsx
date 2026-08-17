'use client'
import { useEffect } from 'react'

// Chrome restores the previous scroll offset on reload, which after a language
// switch lands the page at the very bottom. Opting out makes every reload start
// at the top. Client-side navigation is unaffected -- the App Router does its
// own scroll handling there.
export default function ScrollRestoration() {
  useEffect(() => {
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual'
  }, [])
  return null
}
