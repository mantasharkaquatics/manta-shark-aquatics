import { LOCALES, type Locale } from '@/lib/i18n'
import { LocaleProvider } from '@/lib/i18n/provider'
import Navbar from '@/components/Navbar'
import Footer from '@/components/Footer'
import ActivityPing from '@/components/ActivityPing'

// Only the two Chinese locales get a URL segment. English keeps the bare paths
// (/plans, /levels, ...) so every existing link stays valid.
//
// This tree deliberately does NOT sit inside (public): its layout has to wrap
// Navbar and Footer in the locale-aware provider, and (public)/layout.tsx has
// no access to the route param.
//
// dynamicParams = false makes any other first segment a 404 rather than
// silently rendering the home page, and keeps all of these prerendered.
export const dynamicParams = false

export function generateStaticParams() {
  return LOCALES.filter(l => l !== 'en').map(locale => ({ locale }))
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  return (
    <LocaleProvider locale={locale as Locale}>
      <Navbar />
      <ActivityPing />
      {children}
      <Footer />
    </LocaleProvider>
  )
}
