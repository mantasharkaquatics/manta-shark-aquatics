import en from './locales/en.json';
import zhHant from './locales/zh-Hant.json';
import zhHans from './locales/zh-Hans.json';
import dbStrings from './locales/db-strings.json';

export const LOCALES = ['en', 'zh-Hant', 'zh-Hans'] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'en';
export const LOCALE_COOKIE = 'msa_locale';
export const LOCALE_EXPLICIT_COOKIE = 'msa_locale_explicit';

type Dict = Record<string, string>;

const DICTS: Record<Locale, Dict> = {
  en: en as Dict,
  'zh-Hant': zhHant as Dict,
  'zh-Hans': zhHans as Dict,
};

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
  const hit = DICTS[locale]?.[key] ?? DICTS[DEFAULT_LOCALE][key];
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
