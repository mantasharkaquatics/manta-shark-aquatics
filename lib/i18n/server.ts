import { cookies, headers } from 'next/headers';
import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale, type Locale } from './index';

export function pickFromAcceptLanguage(header: string | null): Locale | null {
  if (!header) return null;
  const tags = header
    .split(',')
    .map((part) => part.split(';')[0].trim().toLowerCase())
    .filter(Boolean);
  for (const tag of tags) {
    if (tag === 'en' || tag.startsWith('en-')) return 'en';
    if (tag.includes('hant') || tag === 'zh-tw' || tag === 'zh-hk' || tag === 'zh-mo') return 'zh-Hant';
    if (tag.includes('hans') || tag === 'zh-cn' || tag === 'zh-sg') return 'zh-Hans';
    if (tag === 'zh') return 'zh-Hant';
  }
  return null;
}

export async function resolveLocale(preferred?: string | null): Promise<Locale> {
  if (isLocale(preferred)) return preferred;
  const cookieStore = await cookies();
  const fromCookie = cookieStore.get(LOCALE_COOKIE)?.value;
  if (isLocale(fromCookie)) return fromCookie;
  const headerList = await headers();
  return pickFromAcceptLanguage(headerList.get('accept-language')) ?? DEFAULT_LOCALE;
}
