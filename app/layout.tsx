import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { cn } from "@/lib/utils";
import { LocaleProvider } from "@/lib/i18n/provider";
import ScrollRestoration from "@/components/ScrollRestoration";
import ClientErrorReporter from "@/components/ClientErrorReporter";
import { APP_DETECT_SCRIPT } from '@/lib/native-app'
import AppBridge from "@/components/AppBridge";
import { SITE_OG_IMAGE } from "@/lib/og";
import { placeName } from "@/lib/location-place";
import { publicLocations } from "@/lib/public-locations";
import { translate } from "@/lib/i18n/all";

/* The fonts live in the project (app/fonts, the Latin variable files from
   Google Fonts via Fontsource, SIL Open Font License) rather than being
   fetched from Google at build time: that fetch failed now and then on
   Vercel and turned deployments red with nothing wrong in the code
   (owner, 2026-10-31). Same faces, same weights, same CSS variables. */
const figtree = localFont({ src: './fonts/figtree-latin-wght-normal.woff2', weight: '300 900', variable: '--font-sans' });

// The parent-facing site's faces (lib/brand.ts): Fraunces for headings -- soft,
// rounded serifs close to the logo's lettering -- and Nunito Sans for reading.
const fraunces = localFont({
  src: [
    { path: './fonts/fraunces-latin-wght-normal.woff2', weight: '700 900', style: 'normal' },
    { path: './fonts/fraunces-latin-wght-italic.woff2', weight: '700 900', style: 'italic' },
  ],
  variable: '--font-display',
  adjustFontFallback: 'Times New Roman',
});
const nunitoSans = localFont({ src: './fonts/nunito-sans-latin-wght-normal.woff2', weight: '400 800', variable: '--font-body' });

// Tailwind's font-mono (globals.css --font-mono): figures on admin and coach
// screens and the referral code on the register page. Not preloaded -- every
// public page would otherwise download it before first paint, for nothing.
// (Geist Sans was removed 2026-10-08: --font-geist-sans was used nowhere.)
const geistMono = localFont({
  src: './fonts/geist-mono-latin-wght-normal.woff2',
  weight: '100 900',
  variable: "--font-geist-mono",
  preload: false,
});

// The fallback for pages without their own title (sign-in, booking, the
// dashboard). {place} is "Brea" while one pool is open -- these read exactly as
// they always did -- and every pool's name once there are more
// (lib/location-place.ts; a cached read, lib/public-locations.ts).
const SITE_TITLE = (place: string) => `Manta Shark Aquatics — Swim Lessons in ${place}, CA`
const SITE_DESCRIPTION = (place: string) => `Professional swim lessons in ${place}, California. 1-on-1, semi-private, group classes, and swim team — structured, progression-based coaching for ages 3 and up.`

export async function generateMetadata(): Promise<Metadata> {
  const place = placeName(await publicLocations(), (k, v) => translate("en", k, v))
  return {
    // Link previews need absolute image URLs; app/(auth)/register/page.tsx
    // swaps in the referral picture for ?ref= links.
    metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || 'https://www.mantasharkaquatics.net'),
    title: SITE_TITLE(place),
    description: SITE_DESCRIPTION(place),
    // Only what every page shares (found 2026-10-05). The home page's title and
    // description used to sit here too, and every page that did not override
    // openGraph -- all of them but the referral link -- previewed as the home
    // page. Marketing pages now get their own from lib/marketing-metadata; any
    // other page leaves og:title out, and link previews then fall back to that
    // page's own <title> and description.
    openGraph: {
      type: 'website', siteName: 'Manta Shark Aquatics', images: [SITE_OG_IMAGE],
    },
    twitter: { card: 'summary_large_image', images: [SITE_OG_IMAGE.url] },
    // PRE-LAUNCH: keep the site out of search results while it is still being
    // built and translated. Anyone with the URL can still browse it normally.
    // TO GO LIVE: delete this block AND flip SEARCH_ENGINES_ALLOWED in app/robots.ts.
    robots: { index: false, follow: false, nocache: true,
      googleBot: { index: false, follow: false } },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // suppressHydrationWarning: the script below adds the app's class to
    // <html> before React sees it (lib/native-app.ts).
    <html
      lang="en"
      className={cn("h-full", "antialiased", geistMono.variable, "font-sans", figtree.variable, fraunces.variable, nunitoSans.variable)}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: APP_DETECT_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col">
        <ScrollRestoration />
        <ClientErrorReporter />
        <LocaleProvider><AppBridge />{children}</LocaleProvider>
      </body>
    </html>
  );
}
