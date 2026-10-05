import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { sanitizeNext } from '@/lib/safe-next'

/* Found 2026-10-05: these redirects used to drop the page that was asked for,
   so an emailed link (/dashboard/fixed-class/{id}?renew=1, /dashboard?vouchers=1)
   landed on the plain dashboard after signing in. The login page reads ?next=
   (through safeNext) and goes there once the family is in. */
function toLogin(request: NextRequest) {
  const url = new URL('/login', request.url)
  const next = sanitizeNext(request.nextUrl.pathname + request.nextUrl.search)
  if (next) url.searchParams.set('next', next)
  return NextResponse.redirect(url)
}

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // getClaims, not getUser (2026-10-05). getUser asks Supabase's auth server
  // on every request from a signed-in browser -- a network round trip before
  // any page could start. getClaims checks the token's signature here, with
  // keys it fetches once and caches, and still refreshes an expired session
  // (which is the other job of this file). On a project still on the old
  // shared-secret tokens it falls back to getUser by itself, so nothing gets
  // slower. A session revoked elsewhere stays readable here until its token
  // expires (at most an hour); this file only routes, and every API route
  // checks the user again before doing anything.
  const { data: claimsData } = await supabase.auth.getClaims()
  const userId = typeof claimsData?.claims?.sub === 'string' ? claimsData.claims.sub : null
  const user = userId ? { id: userId } : null

  if (!user && request.nextUrl.pathname.startsWith('/dashboard')) {
    return toLogin(request)
  }
  if (!user && request.nextUrl.pathname.startsWith('/booking')) {
    return toLogin(request)
  }

  const p = request.nextUrl.pathname
  if (p === '/coach' || p.startsWith('/coach/')) {
    if (!user) return toLogin(request)
    const { data: coach } = await supabase.from('coaches').select('id').eq('auth_user_id', user.id).single()
    if (!coach) return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  if (request.nextUrl.pathname.startsWith('/admin')) {
    if (!user) return toLogin(request)
    const { data: admin } = await supabase.from('admins').select('id').eq('auth_user_id', user.id).single()
    if (!admin) return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  return supabaseResponse
}

export const config = {
  // Files served as they are -- images, fonts, video -- need neither a session
  // nor a redirect, and were each paying for an auth check (2026-10-05).
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpe?g|gif|webp|avif|svg|ico|woff2?|ttf|otf|mp4|webm|mp3|pdf|txt|xml)$).*)'],
}
