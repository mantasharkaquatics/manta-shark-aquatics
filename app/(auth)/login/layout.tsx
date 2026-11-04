import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { translate, isLocale, DEFAULT_LOCALE } from '@/lib/i18n/all'
import { LOCALE_COOKIE } from '@/lib/i18n'

// The tab's title names this page, in the visitor's language (2026-11-04:
// every sign-in page was titled with the English home-page line).
export async function generateMetadata(): Promise<Metadata> {
  const c = (await cookies()).get(LOCALE_COOKIE)?.value
  const locale = c && isLocale(c) ? c : DEFAULT_LOCALE
  return { title: translate(locale, 'nav.signIn') + ' · Manta Shark Aquatics' }
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
