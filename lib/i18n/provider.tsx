'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE,
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

export function LocaleProvider({ locale, children }: { locale?: Locale; children: ReactNode }) {
  const [detected, setDetected] = useState<Locale>(locale ?? DEFAULT_LOCALE);

  useEffect(() => {
    if (locale) return;
    const browserTags = navigator.languages?.length ? navigator.languages : [navigator.language];
    setDetected(readLocaleCookie() ?? matchLocaleTags(browserTags) ?? DEFAULT_LOCALE);
  }, [locale]);

  const active = locale ?? detected;

  useEffect(() => {
    document.documentElement.lang = active;
  }, [active]);

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
