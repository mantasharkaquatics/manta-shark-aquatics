import type { Metadata } from "next";
import { Geist, Geist_Mono, Figtree } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";
import { LocaleProvider } from "@/lib/i18n/provider";

const figtree = Figtree({subsets:['latin'],variable:'--font-sans'});

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Manta Shark Aquatics — Swim Lessons in Brea, CA",
  description: "Professional swim lessons in Brea, California. 1-on-1, semi-private, group classes, and swim team — structured, progression-based coaching for all ages.",
  // PRE-LAUNCH: keep the site out of search results while it is still being
  // built and translated. Anyone with the URL can still browse it normally.
  // TO GO LIVE: delete this block AND flip SEARCH_ENGINES_ALLOWED in app/robots.ts.
  robots: { index: false, follow: false, nocache: true,
    googleBot: { index: false, follow: false } },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={cn("h-full", "antialiased", geistSans.variable, geistMono.variable, "font-sans", figtree.variable)}
    >
      <body className="min-h-full flex flex-col">
        <LocaleProvider>{children}</LocaleProvider>
      </body>
    </html>
  );
}
