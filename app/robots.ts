import type { MetadataRoute } from 'next'

// PRE-LAUNCH SWITCH. While false, every crawler is asked to stay away and the
// root layout also sends <meta name="robots" content="noindex, nofollow">.
// Flip to true at go-live and remove the `robots` block in app/layout.tsx —
// both have to change, or the meta tag will keep the site out of results.
const SEARCH_ENGINES_ALLOWED = false

export default function robots(): MetadataRoute.Robots {
  if (!SEARCH_ENGINES_ALLOWED) {
    return { rules: [{ userAgent: '*', disallow: '/' }] }
  }
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: ['/admin', '/coach', '/api', '/dashboard'] }],
  }
}
