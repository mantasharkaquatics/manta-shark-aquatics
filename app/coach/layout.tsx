import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import Image from 'next/image'
import CoachTabs from './CoachTabs'
import CoachLangSwitch from './CoachLangSwitch'
import CoachChrome from './CoachChrome'
import { LocaleProvider } from '@/lib/i18n/provider'
import { isLocale, DEFAULT_LOCALE, type Locale } from '@/lib/i18n'

export default async function CoachLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } }
  )
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  // Same off-boarding gate as the API routes: an inactive coach is sent away
  // from the portal, not just refused by the endpoints behind it.
  const { data: coach } = await supabase.from('coaches').select('id, first_name, last_name')
    .eq('auth_user_id', user.id).eq('is_active', true).single()
  if (!coach) redirect('/dashboard')

  // The portal carries its own language, taken from the coach's account, and
  // persist={false} keeps it there: a coach who reads Chinese at the pool should
  // not find the public site switched under them when they are a parent too.
  //
  // Read separately and tolerantly, so the portal keeps working in English if
  // this deploys before the ui_language migration is run. Losing the language
  // for one deploy is a preference; losing the coach lookup would lock every
  // coach out of the portal mid-lesson.
  const { data: pref } = await supabase.from('coaches').select('ui_language')
    .eq('id', coach.id).maybeSingle()
  const stored = (pref as { ui_language?: string } | null)?.ui_language
  const locale: Locale = isLocale(stored) ? stored : DEFAULT_LOCALE

  return (
    <LocaleProvider locale={locale} persist={false}>
    <div className="min-h-screen bg-[#0d1529]">
      {/* Two rows: who you are plus the way out, then where you can go. Every
          destination stays visible -- no hamburger to open with wet hands -- and
          the tab row fills the width rather than hugging the left edge, which is
          what left Sign Out looking stranded in the opposite corner. */}
      <header className="bg-[#111d38] px-4 sm:px-6 pt-3 sm:pt-4">
        {/* Sign Out used to sit at the end of the same row as the four navigation
            links, where it is one slip away from a coach who meant to tap Progress
            -- and the cost of that slip is being thrown out of the portal mid-lesson.
            It lives in the top-right corner now, on the identity row, separated from
            anything you would tap on purpose and given a border so it reads as a
            different kind of control rather than a fifth link. */}
        <div className="max-w-7xl mx-auto flex flex-col gap-5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 sm:gap-4 min-w-0">
              <Image src="/logo.png" alt="Manta Shark" width={64} height={64} className="w-10 h-10 sm:w-16 sm:h-16 shrink-0" />
              <div className="min-w-0">
                <CoachChrome.PortalLabel />
                <p className="text-white font-semibold truncate">{coach.first_name} {coach.last_name}</p>
              </div>
            </div>
            {/* SignOutButton is w-full for the admin sidebar it was written for. */}
            <div className="shrink-0 flex items-center gap-2">
              <CoachLangSwitch />
              <div className="[&_button]:w-auto [&_button]:min-h-11 [&_button]:rounded-lg [&_button]:border [&_button]:border-[#1e3a6e]">
                <CoachChrome.SignOut />
              </div>
            </div>
          </div>
          <CoachTabs />
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {children}
      </main>
    </div>
    </LocaleProvider>
  )
}
