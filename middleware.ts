import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  // 保護 /dashboard 路由（家長）
  if (!user && request.nextUrl.pathname.startsWith('/dashboard')) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // 保護 /booking 路由
  if (!user && request.nextUrl.pathname.startsWith('/booking')) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // 保護 /coach 路由
  if (request.nextUrl.pathname.startsWith('/coach')) {
    if (!user) {
      return NextResponse.redirect(new URL('/login', request.url))
    }
    // 確認是教練
    const { data: coach } = await supabase
      .from('coaches')
      .select('id')
      .eq('auth_user_id', user.id)
      .single()

    if (!coach) {
      return NextResponse.redirect(new URL('/dashboard', request.url))
    }
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
