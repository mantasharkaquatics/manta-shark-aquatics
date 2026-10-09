import type { Metadata } from "next";
import { Geist_Mono, Figtree, Fraunces, Nunito_Sans } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";
import { LocaleProvider } from "@/lib/i18n/provider";
import ScrollRestoration from "@/components/ScrollRestoration";
import { SITE_OG_IMAGE } from "@/lib/og";
import { placeName } from "@/lib/location-place";
import { publicLocations } from "@/lib/public-locations";
import { translate } from "@/lib/i18n/all";

const figtree = Figtree({subsets:['latin'],variable:'--font-sans'});

// The parent-facing site's faces (lib/brand.ts): Fraunces for headings -- soft,
// rounded serifs close to the logo's lettering -- and Nunito Sans for reading.
const fraunces = Fraunces({ subsets: ['latin'], variable: '--font-display', weight: ['700', '800', '900'], style: ['normal', 'italic'] });
const nunitoSans = Nunito_Sans({ subsets: ['latin'], variable: '--font-body', weight: ['400', '500', '600', '700', '800'] });

// Tailwind's font-mono (globals.css --font-mono): figures on admin and coach
// screens and the referral code on the register page. Not preloaded -- every
// public page would otherwise download it before first paint, for nothing.
// (Geist Sans was removed 2026-10-08: --font-geist-sans was used nowhere.)
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
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
    <html
      lang="en"
      className={cn("h-full", "antialiased", geistMono.variable, "font-sans", figtree.variable, fraunces.variable, nunitoSans.variable)}
    >
      <body className="min-h-full flex flex-col">
        <ScrollRestoration />
        <LocaleProvider>{children}</LocaleProvider>
      </body>
    </html>
  );
}
