import { cookies, headers } from 'next/headers';
import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale, matchLocaleTags, type Locale } from './index';

export function pickFromAcceptLanguage(header: string | null): Locale | null {
  if (!header) return null;
  return matchLocaleTags(header.split(',').map((part) => part.split(';')[0]));
}

export async function resolveLocale(preferred?: string | null): Promise<Locale> {
  if (isLocale(preferred)) return preferred;
  const cookieStore = await cookies();
  const fromCookie = cookieStore.get(LOCALE_COOKIE)?.value;
  if (isLocale(fromCookie)) return fromCookie;
  const headerList = await headers();
  return pickFromAcceptLanguage(headerList.get('accept-language')) ?? DEFAULT_LOCALE;
}
