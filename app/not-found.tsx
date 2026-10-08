'use client'

import Link from 'next/link'
import { useSyncExternalStore } from 'react'
import { LocaleProvider, useT, useLocale } from '@/lib/i18n/provider'
import { isLocale, type Locale } from '@/lib/i18n'
import { localePath } from '@/lib/i18n/paths'
import { FONT_BODY } from '@/lib/brand'
import Navbar from '@/components/Navbar'
import Footer from '@/components/Footer'
import BrandStyles from '@/components/brand/BrandStyles'
import BrandRoot from '@/components/brand/BrandRoot'

/* Every address the site does not have lands here (found 2026-10-08: it was
   Next's bare English "404 | This page could not be found", with no way back):
   an old /services link, a mistyped URL, or /zh-Hant/booking -- only the
   marketing pages have a Chinese address, and app/[locale] sets
   dynamicParams = false, so anything else under /zh-Hant/ is a 404 too.

   The root layout's provider guesses the language from the cookie and the
   browser. An address that names its language says it outright, so a
   /zh-Hant/... miss reads in Traditional Chinese even on a first visit. */
const noSubscribe = () => () => {}

export default function NotFound() {
  // Read after mount: this page is prerendered once for every missing
  // address, so the server HTML cannot know which one was asked for. Until
  // then (and for any address that names no language) the inner provider
  // detects the language just as the root one does.
  const first = useSyncExternalStore(noSubscribe, () => window.location.pathname.split('/')[1], () => '')
  const named: Locale | undefined = isLocale(first) && first !== 'en' ? first : undefined
  return (
    <LocaleProvider locale={named}>
      <div style={{ display: 'contents', fontFamily: FONT_BODY }}>
        <BrandStyles />
        <Navbar />
        <NotFoundBody />
        <Footer />
      </div>
    </LocaleProvider>
  )
}

function NotFoundBody() {
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
