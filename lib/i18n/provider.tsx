'use client';

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { DEFAULT_LOCALE, LOCALE_COOKIE, getT, type Locale, type TFunction } from './index';

type LocaleContextValue = { locale: Locale; t: TFunction };

const LocaleContext = createContext<LocaleContextValue>({
  locale: DEFAULT_LOCALE,
  t: getT(DEFAULT_LOCALE),
});

export function LocaleProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  const value = useMemo(() => ({ locale, t: getT(locale) }), [locale]);
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale(): Locale {
  return useContext(LocaleContext).locale;
}

export function useT(): TFunction {
  return useContext(LocaleContext).t;
}

export function rememberLocale(locale: Locale) {
  const oneYear = 60 * 60 * 24 * 365;
  document.cookie = LOCALE_COOKIE + '=' + locale + '; path=/; max-age=' + oneYear + '; samesite=lax';
}
