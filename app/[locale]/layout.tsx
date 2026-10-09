import { LOCALES, type Locale } from '@/lib/i18n'
import { LocaleProvider } from '@/lib/i18n/provider'
import { messagesFor } from '@/lib/i18n/all'
import Navbar from '@/components/Navbar'
import Footer from '@/components/Footer'
import ActivityPing from '@/components/ActivityPing'
import GlobalChat from '@/components/GlobalChat'
import BrandStyles from '@/components/brand/BrandStyles'
import { FONT_BODY } from '@/lib/brand'
import { shownLocations } from '@/lib/public-locations'

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
  // The footer's pool links, as in (public)/layout.tsx.
  const pools = (await shownLocations()).map(l => ({ id: l.id, name: l.name }))
  return (
    // The language's text rides along with the page, so the first render is
    // already in Chinese (lib/i18n/index.ts).
    <LocaleProvider locale={locale as Locale} messages={messagesFor(locale as Locale)}>
      {/* Same shell as (public)/layout.tsx: the brand stylesheet and reading face.
          lang= here because the server HTML's <html lang> is the root layout's
          "en", and LocaleProvider only corrects it after hydration (found
          2026-10-08): until then screen readers read the Chinese text with an
          English voice and the browser picks CJK glyphs without knowing the
          language. Everything on the page sits inside this element, so the
          nearest lang is right from the first byte.
          Not a second root layout with its own <html lang>: Next reloads the
          whole page when a link crosses root layouts, which would be every
          click from these pages to /booking, /login or /register (all under
          the shared root), and the app-wide 404 would then need the
          experimental global-not-found. */}
      <div lang={locale} style={{ display: 'contents', fontFamily: FONT_BODY }}>
        <BrandStyles />
        <Navbar />
        <ActivityPing />
        {children}
        <Footer locations={pools} />
        <GlobalChat />
      </div>
    </LocaleProvider>
  )
}
