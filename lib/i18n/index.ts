import en from './locales/en.json';
import dbStrings from './locales/db-strings.json';

export const LOCALES = ['en', 'zh-Hant', 'zh-Hans'] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'en';
export const LOCALE_COOKIE = 'msa_locale';
export const LOCALE_EXPLICIT_COOKIE = 'msa_locale_explicit';

export type Dict = Record<string, string>;

/* Which dictionaries are in memory (2026-10-05).

   This module used to import all three languages, admin and coach text
   included, so every page in the browser downloaded ~566KB (175KB gzipped)
   of words it would mostly never show. Now only English site text is built
   in -- the server renders English first on pages that are not under
   /zh-Hant or /zh-Hans, so the first client render must have it at hand.
   Everything else is added when it is needed:

     - on the server, lib/i18n/all.ts registers every dictionary; server code
       that translates imports getT / translate from there, not from here;
     - a layout that knows its language (/[locale], /admin, /coach) hands the
       provider that language's text as a prop, which registers it;
     - otherwise lib/i18n/load.ts fetches the language as its own file.

   Staff text (admin.*, coach.* other than the coach login page) is a separate
   file per language, loaded only in the back office and the coach portal.
   isStaffKey here and in scripts/i18n-check.mjs must stay the same. */
export const isStaffKey = (k: string) =>
  k.startsWith('admin.') || (k.startsWith('coach.') && !k.startsWith('coach.login.') && k !== 'coach.portal');

type Part = 'site' | 'staff';
const DICTS: Partial<Record<Locale, Dict>> = { en: { ...(en as Dict) } };
const LOADED: Record<Part, Set<Locale>> = { site: new Set<Locale>(['en']), staff: new Set<Locale>() };

/** Add text for a language. `parts` says which halves the text completes. */
export function registerDict(locale: Locale, dict: Dict, parts: readonly Part[]): void {
  const have = DICTS[locale];
  DICTS[locale] = have ? Object.assign(have, dict) : { ...dict };
  for (const p of parts) LOADED[p].add(locale);
}

export function isDictLoaded(locale: Locale, staff = false): boolean {
  return LOADED.site.has(locale) && (!staff || LOADED.staff.has(locale));
}

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

export function toLocale(value: unknown): Locale {
  return isLocale(value) ? value : DEFAULT_LOCALE;
}

export function matchLocaleTags(tags: readonly string[]): Locale | null {
  for (const raw of tags) {
    const tag = raw.trim().toLowerCase();
    if (!tag) continue;
    if (tag === 'en' || tag.startsWith('en-')) return 'en';
    if (tag.includes('hant') || tag === 'zh-tw' || tag === 'zh-hk' || tag === 'zh-mo') return 'zh-Hant';
    if (tag.includes('hans') || tag === 'zh-cn' || tag === 'zh-sg') return 'zh-Hans';
    if (tag === 'zh') return 'zh-Hant';
  }
  return null;
}

function interpolate(text: string, vars?: Record<string, string | number>): string {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (match, name) =>
    Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : match
  );
}

export function translate(
  locale: Locale,
  key: string,
  vars?: Record<string, string | number>
): string {
  const hit = DICTS[locale]?.[key] ?? DICTS[DEFAULT_LOCALE]?.[key];
  if (hit === undefined) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[i18n] missing key: ' + key);
    }
    return key;
  }
  return interpolate(hit, vars);
}

export type TFunction = (key: string, vars?: Record<string, string | number>) => string;

export function getT(locale: Locale): TFunction {
  return (key, vars) => translate(locale, key, vars);
}

type DbTable = keyof typeof dbStrings;
type DbMap = Record<string, Record<string, Partial<Record<Locale, string>>>>;

export function tDb(locale: Locale, table: DbTable, id: string, fallback: string): string {
  const entry = (dbStrings as DbMap)[table]?.[id];
  return entry?.[locale] ?? entry?.[DEFAULT_LOCALE] ?? fallback;
}

/**
 * The BCP 47 tag to hand toLocaleDateString for a DATE in this locale. Dates
 * follow the reader's language (zh-TW gives 10月2日 週五); clock TIMES never
 * go through this -- they stay 12-hour `3:35 PM` in every language, matching
 * SMS and the coach schedule. `en` lets a caller keep the English shape it
 * already had (en-GB, en-US).
 */
export function dateTag(locale: Locale, en = 'en-US'): string {
  if (locale === 'zh-Hant') return 'zh-TW';
  if (locale === 'zh-Hans') return 'zh-CN';
  return en;
}
