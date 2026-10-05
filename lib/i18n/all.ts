/* Every dictionary, for code that runs on the server.

   lib/i18n/index.ts keeps only English site text built in, so the browser
   does not download every language on every page (2026-10-05). Server code
   -- route handlers, server components, emails, metadata -- may translate into
   any language at any time, so it imports getT / translate from HERE, which
   registers everything first. Importing this from a 'use client' file would
   put every language back into the browser bundle: don't. */
import en from './locales/en.json'
import zhHant from './locales/zh-Hant.json'
import zhHans from './locales/zh-Hans.json'
import enStaff from './locales/staff/en.json'
import zhHantStaff from './locales/staff/zh-Hant.json'
import zhHansStaff from './locales/staff/zh-Hans.json'
import { registerDict, type Dict, type Locale } from './index'

const SITE: Record<Locale, Dict> = { en: en as Dict, 'zh-Hant': zhHant as Dict, 'zh-Hans': zhHans as Dict }
const STAFF: Record<Locale, Dict> = { en: enStaff as Dict, 'zh-Hant': zhHantStaff as Dict, 'zh-Hans': zhHansStaff as Dict }
for (const l of Object.keys(SITE) as Locale[]) registerDict(l, { ...SITE[l], ...STAFF[l] }, ['site', 'staff'])

/** Text a layout hands to <LocaleProvider messages>: the site half, plus the
 *  staff half for the back office and the coach portal. English site text is
 *  already in the browser, so it is left out. */
export function messagesFor(locale: Locale, staff = false): Dict {
  return { ...(locale === 'en' ? {} : SITE[locale]), ...(staff ? STAFF[locale] : {}) }
}

export { getT, translate, tDb, dateTag, toLocale, LOCALES, DEFAULT_LOCALE, isLocale, type Locale } from './index'
