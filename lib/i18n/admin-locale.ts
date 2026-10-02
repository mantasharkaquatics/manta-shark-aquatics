import { cache } from 'react'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { DEFAULT_LOCALE, isLocale, type Locale } from './index'

/**
 * The signed-in admin's back-office language, from admins.ui_language.
 *
 * Wrapped in React's cache() so the layout and the page it wraps share one
 * lookup per request. Read on its own and tolerantly -- exactly like the coach
 * portal -- so the back office stays usable in English if this deploys before
 * the ui_language column exists. Losing the language for one deploy is a
 * preference; failing the admin lookup would lock the owner out.
 */
export const getAdminLocale = cache(async (): Promise<Locale> => {
  try {
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } }
    )
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return DEFAULT_LOCALE
    const { data } = await supabase.from('admins').select('ui_language')
      .eq('auth_user_id', user.id).maybeSingle()
    const stored = (data as { ui_language?: string } | null)?.ui_language
    return isLocale(stored) ? stored : DEFAULT_LOCALE
  } catch {
    return DEFAULT_LOCALE
  }
})
