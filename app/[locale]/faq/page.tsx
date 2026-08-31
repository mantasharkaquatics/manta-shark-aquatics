import { marketingMetadata } from '@/lib/marketing-metadata'
import { faqJsonLd } from '@/lib/faq-jsonld'
import type { Locale } from '@/lib/i18n'
import FaqContent from '@/app/(public)/faq/FaqContent'

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  return marketingMetadata('faq', '/faq', locale as Locale)
}

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd(locale as Locale)) }} />
      <FaqContent />
    </>
  )
}
