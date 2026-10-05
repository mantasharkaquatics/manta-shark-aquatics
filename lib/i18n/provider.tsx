'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE,
  LOCALE_EXPLICIT_COOKIE,
  getT,
  isDictLoaded,
  isLocale,
  matchLocaleTags,
  registerDict,
  type Dict,
  type Locale,
  type TFunction,
} from './index';
import { loadDict } from './load';

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

let langOwners = 0;

// Start fetching the visitor's language the moment this module runs, in
// parallel with hydration, rather than after the first effect: pages outside
// /zh-Hant and /zh-Hans render English first and switch once the text is in.
if (typeof window !== 'undefined') {
  try {
    const early = readLocaleCookie()
      ?? matchLocaleTags(navigator.languages?.length ? navigator.languages : [navigator.language]);
    // Under /zh-Hant or /zh-Hans the layout hands the text over itself.
    const ownPath = /^\/zh-Han[st](\/|$)/.test(window.location.pathname);
    if (early && early !== DEFAULT_LOCALE && !ownPath) loadDict(early).catch(() => {});
  } catch { /* cookies blocked: the provider's effect still runs */ }
}

/**
 * messages: this language's text, handed down by a server layout so the first
 * render already has it (see lib/i18n/all.ts messagesFor). staff: this surface
 * is the back office or the coach portal and needs admin/coach text too.
 */
export function LocaleProvider(
  { locale, persist = true, messages, staff = false, children }:
  { locale?: Locale; persist?: boolean; messages?: Dict; staff?: boolean; children: ReactNode }
) {
  // Registered during render, before any child asks for a word. Idempotent.
  if (messages && locale) registerDict(locale, messages, staff ? ['site', 'staff'] : ['site']);

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

  /* A surface that is handed its language by the server -- the coach portal --
     still has to let the person in front of it change that language NOW. The
     prop used to win outright, so the switcher wrote the coach's choice to the
     database and changed nothing on screen until the next full load. The
     override is what the switcher sets; it steps aside as soon as the server
     comes back with a locale of its own, which by then is the same choice. */
  const [override, setOverride] = useState<Locale | null>(null);
  useEffect(() => { setOverride(null); }, [locale]);

  const wanted = override ?? locale ?? detected;

  // Show a language only once its text is in memory. Until then keep showing
  // the last one that was (English at first), and fetch the wanted one.
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  const [shown, setShown] = useState<Locale>(() => (isDictLoaded(wanted, staff) ? wanted : DEFAULT_LOCALE));
  const ready = isDictLoaded(wanted, staff);
  useEffect(() => {
    if (ready) { setShown(wanted); return; }
    let live = true;
    loadDict(wanted, staff).then(() => { if (live) rerender(); }).catch(() => {});
    return () => { live = false; };
  }, [wanted, staff, ready]);
  const active = ready ? wanted : shown;

  // <html lang> belongs to the innermost provider. The root one wraps the
  // coach portal, the back office and /zh-Hant pages too, and its effect runs
  // after theirs, so it used to stamp its own language over the page's (the
  // coach portal in Chinese reported lang="en"). A provider handed a locale
  // claims the attribute while mounted; the root one writes it only when no
  // one has, and again on each navigation, once an inner one has gone.
  useEffect(() => {
    if (!locale) return;
    langOwners++;
    document.documentElement.lang = active;
    return () => { langOwners--; };
  }, [locale, active]);
  useEffect(() => {
    if (!locale && langOwners === 0) document.documentElement.lang = active;
  }, [locale, active, pathname]);

  // A visitor who arrives on /zh-Hant/... has never touched the switcher, so the
  // cookie is unset. Persist the URL's locale, otherwise the first click onto a
  // page with no localised route (legal pages, /login, /booking, the dashboard)
  // silently drops them back to English.
  //
  // persist={false} is for a surface that carries its own language rather than
  // the site's -- the coach portal, whose locale comes from the coach's account.
  // Writing the site cookie there would switch the public site under a coach who
  // is also a parent, which is not what choosing a portal language means.
  useEffect(() => {
    if (locale && persist) rememberLocale(locale);
  }, [locale, persist]);

  const setLocale = useCallback((next: Locale) => {
    if (persist) rememberLocale(next);
    setOverride(next);
    setDetected(next);
  }, [persist]);

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

/**
 * A translator for a language other than the page's -- an admin previewing a
 * family's view, a report shown in another language. Falls back to English
 * word by word until that language has been fetched, then re-renders.
 */
export function useTFor(locale: Locale, staff = false): TFunction {
  // Starts as English on the server and in the first browser render alike, so
  // hydration matches whatever the server happened to have loaded; switches
  // once this browser has the language.
  const [ok, setOk] = useState<Locale | null>(null);
  useEffect(() => {
    let live = true;
    if (isDictLoaded(locale, staff)) setOk(locale);
    else loadDict(locale, staff).then(() => { if (live) setOk(locale); }).catch(() => {});
    return () => { live = false; };
  }, [locale, staff]);
  return useMemo(() => getT(ok === locale ? locale : DEFAULT_LOCALE), [ok, locale]);
}
