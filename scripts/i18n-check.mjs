import { readFileSync, existsSync } from 'node:fs';

const LOCALES = ['en', 'zh-Hant', 'zh-Hans'];
const BASE = 'en';
const DIR = 'lib/i18n/locales';

const TABLES = {
  skills: { table: 'skills', column: 'name' },
  course_types: { table: 'course_types', column: 'name' },
  team_tiers: { table: 'team_tiers', column: 'name' },
};

const load = (name) => JSON.parse(readFileSync(DIR + '/' + name + '.json', 'utf8'));

let failed = false;
const dicts = Object.fromEntries(LOCALES.map((l) => [l, load(l)]));
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
