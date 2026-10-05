import { readFileSync, existsSync } from 'node:fs';

const LOCALES = ['en', 'zh-Hant', 'zh-Hans'];
const BASE = 'en';
const DIR = 'lib/i18n/locales';

const TABLES = {
  skills: { table: 'skills', column: 'name' },
  skill_criteria: { table: 'skills', column: 'pass_criteria' },
  course_types: { table: 'course_types', column: 'name' },
  team_tiers: { table: 'team_tiers', column: 'name' },
};

const load = (name) => JSON.parse(readFileSync(DIR + '/' + name + '.json', 'utf8'));

// Each language is two files (2026-10-05). locales/<lang>.json holds what the
// public site and the parent pages read; locales/staff/<lang>.json holds the
// admin back office and the coach portal. The browser downloads the staff file
// only inside those portals, so a parent page no longer carries ~70KB of
// back-office text per language. Which file a key belongs in is decided by
// isStaffKey below -- keep it the same as STAFF in lib/i18n/index.ts.
const isStaffKey = (k) =>
  k.startsWith('admin.') || (k.startsWith('coach.') && !k.startsWith('coach.login.') && k !== 'coach.portal');

let failed = false;
const misplaced = [];
const dicts = Object.fromEntries(LOCALES.map((l) => {
  const site = load(l);
  const staff = load('staff/' + l);
  for (const k of Object.keys(site)) if (isStaffKey(k)) misplaced.push(l + '.json has staff key ' + k + ' (move it to staff/' + l + '.json)');
  for (const k of Object.keys(staff)) {
    if (!isStaffKey(k)) misplaced.push('staff/' + l + '.json has site key ' + k + ' (move it to ' + l + '.json)');
    if (k in site) misplaced.push(k + ' is in both ' + l + '.json and staff/' + l + '.json');
  }
  return [l, { ...site, ...staff }];
}));
if (misplaced.length) {
  console.log('misplaced keys: ' + misplaced.length);
  for (const m of misplaced) console.log('  PLACE    ' + m);
  console.log('');
  failed = true;
}
const baseKeys = Object.keys(dicts[BASE]);

console.log('base locale ' + BASE + ': ' + baseKeys.length + ' keys');

for (const locale of LOCALES.filter((l) => l !== BASE)) {
  const keys = new Set(Object.keys(dicts[locale]));
  const missing = baseKeys.filter((k) => !keys.has(k));
  const orphan = [...keys].filter((k) => !dicts[BASE][k]);
  console.log('');
  console.log(locale + ': missing ' + missing.length + ', orphan ' + orphan.length);
  for (const k of missing) console.log('  MISSING  ' + k);
  for (const k of orphan) console.log('  ORPHAN   ' + k);
  if (missing.length || orphan.length) failed = true;
}

const empties = [];
for (const locale of LOCALES) {
  for (const [k, v] of Object.entries(dicts[locale])) {
    if (typeof v !== 'string' || v.trim() === '') empties.push(locale + ' :: ' + k);
  }
}
if (empties.length) {
  console.log('');
  console.log('empty values: ' + empties.length);
  for (const e of empties) console.log('  EMPTY    ' + e);
  failed = true;
}

if (process.argv.includes('--db')) {
  const envPath = '.env.local';
  const env = {};
  if (existsSync(envPath)) {
    for (const line of readFileSync(envPath, 'utf8').split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    }
  }
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY;
  if (!url || !key) {
    console.log('');
    console.log('db check skipped: no url or service role key in .env.local');
  } else {
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(url, key);
    const dbJson = load('db-strings');
    for (const [ns, cfg] of Object.entries(TABLES)) {
      const { data, error } = await supabase.from(cfg.table).select('id, ' + cfg.column);
      console.log('');
      if (error) {
        console.log(ns + ': skipped (' + error.message + ')');
        continue;
      }
      const have = dbJson[ns] || {};
      const missing = data.filter((row) => {
        const entry = have[String(row.id)];
        return !entry || LOCALES.some((l) => !entry[l] || String(entry[l]).trim() === '');
      });
      console.log(ns + ': ' + data.length + ' rows, ' + missing.length + ' untranslated');
      for (const row of missing) console.log('  DB       ' + row.id + '  ' + row[cfg.column]);
      if (missing.length) failed = true;
    }
  }
}

console.log('');
console.log(failed ? 'FAIL' : 'OK');
process.exit(failed ? 1 : 0);
