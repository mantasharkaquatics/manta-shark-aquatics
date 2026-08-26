'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE,
  LOCALE_EXPLICIT_COOKIE,
  getT,
  isLocale,
  matchLocaleTags,
  type Locale,
  type TFunction,
} from './index';

type LocaleContextValue = {
  locale: Locale;
  t: TFunction;
  setLocale: (next: Locale) => void;
};

const LocaleContext = createContext<LocaleContextValue>({
  locale: DEFAULT_LOCALE,
  t: getT(DEFAULT_LOCALE),
  setLocale: () => {},
});

function readLocaleCookie(): Locale | null {
  const match = document.cookie.match(new RegExp('(?:^|; )' + LOCALE_COOKIE + '=([^;]*)'));
  const value = match ? decodeURIComponent(match[1]) : null;
  return isLocale(value) ? value : null;
}

export function rememberLocale(locale: Locale) {
  const oneYear = 60 * 60 * 24 * 365;
  document.cookie = LOCALE_COOKIE + '=' + locale + '; path=/; max-age=' + oneYear + '; samesite=lax';
}

// A short-lived flag meaning "the visitor picked this themselves just now".
// Only the language switcher sets it; seeding the locale from the database never
// does. On sign-in a deliberate choice therefore wins over the stored preference
// exactly once, and is then written to the account and cleared -- so a stale
// cookie on one device can never keep undoing a change made on another.
export function rememberExplicitLocale(locale: Locale) {
  const oneDay = 60 * 60 * 24;
  document.cookie = LOCALE_EXPLICIT_COOKIE + '=' + locale + '; path=/; max-age=' + oneDay + '; samesite=lax';
}

export function readExplicitLocale(): Locale | null {
  const match = document.cookie.match(new RegExp('(?:^|; )' + LOCALE_EXPLICIT_COOKIE + '=([^;]*)'));
  const value = match ? decodeURIComponent(match[1]) : null;
  return isLocale(value) ? value : null;
}

export function clearExplicitLocale() {
  document.cookie = LOCALE_EXPLICIT_COOKIE + '=; path=/; max-age=0; samesite=lax';
}

export function LocaleProvider({ locale, children }: { locale?: Locale; children: ReactNode }) {
  const [detected, setDetected] = useState<Locale>(locale ?? DEFAULT_LOCALE);
  const pathname = usePathname();

  // The provider in the root layout survives every client navigation, so
  // reading the cookie once on mount is not enough: leaving /zh-Hant/... for a
  // bare English path unmounts the inner provider and hands rendering back to
  // this one, still holding whatever it detected on first paint. Re-reading on
  // each path change is what makes the language switcher's English direction
  // actually change the words on the page.
  useEffect(() => {
    if (locale) return;
    const browserTags = navigator.languages?.length ? navigator.languages : [navigator.language];
    setDetected(readLocaleCookie() ?? matchLocaleTags(browserTags) ?? DEFAULT_LOCALE);
  }, [locale, pathname]);

  const active = locale ?? detected;

  useEffect(() => {
    document.documentElement.lang = active;
  }, [active]);

  // A visitor who arrives on /zh-Hant/... has never touched the switcher, so the
  // cookie is unset. Persist the URL's locale, otherwise the first click onto a
  // page with no localised route (legal pages, /login, /booking, the dashboard)
  // silently drops them back to English.
  useEffect(() => {
    if (locale) rememberLocale(locale);
  }, [locale]);

  const setLocale = useCallback((next: Locale) => {
    rememberLocale(next);
    setDetected(next);
  }, []);

  const value = useMemo(
    () => ({ locale: active, t: getT(active), setLocale }),
    [active, setLocale]
  );
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale(): Locale {
  return useContext(LocaleContext).locale;
}

export function useT(): TFunction {
  return useContext(LocaleContext).t;
}

export function useSetLocale(): (next: Locale) => void {
  return useContext(LocaleContext).setLocale;
}
