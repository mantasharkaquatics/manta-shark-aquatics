'use client'

import Link from 'next/link'
import { useT, useLocale } from '@/lib/i18n/provider'
import { localePath } from '@/lib/i18n/paths'
import BrandRoot from '@/components/brand/BrandRoot'

/* The body of the 404 page, without the site chrome. app/not-found.tsx wraps
   it in Navbar and Footer for addresses that match no route at all. A page
   that calls notFound() inside (public) or [locale] already sits in a layout
   with its own Navbar and Footer, so its not-found.tsx renders only this --
   rendering the root page there drew the footer twice (found 2026-10-09 on
   /locations/<a pool that is not open>). */
export default function NotFoundBody() {
  const t = useT()
  const locale = useLocale()
  return (
    <BrandRoot>
      <header className="b-hero">
        <div className="b-wrap">
          <p className="b-eyebrow">{t('notFound.eyebrow')}</p>
          <h1>{t('notFound.title')}</h1>
          <p className="b-lead">{t('notFound.body')}</p>
          <div className="b-ctas">
            <Link href={localePath('/', locale)} className="b-btn gold">{t('notFound.home')}</Link>
            <Link href={localePath('/programs', locale)} className="b-btn ghost">{t('notFound.programs')}</Link>
            <Link href={localePath('/assessment', locale)} className="b-btn ghost">{t('notFound.assessment')}</Link>
          </div>
        </div>
      </header>
    </BrandRoot>
  )
}
