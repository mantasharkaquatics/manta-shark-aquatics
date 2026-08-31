import { marketingMetadata } from '@/lib/marketing-metadata'
import { faqJsonLd } from '@/lib/faq-jsonld'
import FaqContent from './FaqContent'

export const metadata = marketingMetadata('faq', '/faq')

export default function FaqPage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd('en')) }} />
      <FaqContent />
    </>
  )
}
