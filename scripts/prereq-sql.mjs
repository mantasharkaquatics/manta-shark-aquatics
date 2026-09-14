/** Turns docs/skill-prerequisites.json into a migration.
 *  Names live in the JSON because a person has to read and correct them; the
 *  database gets ids. Run prereq-check.mjs first -- this script trusts it. */
import fs from 'node:fs'

const draft = JSON.parse(fs.readFileSync('docs/skill-prerequisites.json', 'utf8'))
delete draft._note
const cc = JSON.parse(fs.readFileSync('docs/coaching-content.json', 'utf8')).skills
const db = JSON.parse(fs.readFileSync('lib/i18n/locales/db-strings.json', 'utf8')).skills

const idOf = new Map(Object.keys(cc).map(id => [(db[id] || {})['zh-Hant'] || '??', id]))
const flat = {}
for (const l of Object.keys(draft)) Object.assign(flat, draft[l])

const rows = []
for (const [skill, pres] of Object.entries(flat)) {
  const sid = idOf.get(skill)
  if (!sid) throw new Error(`no id for ${skill}`)
  for (const p of pres) {
    const pid = idOf.get(p)
    if (!pid) throw new Error(`no id for prerequisite ${p}`)
    rows.push(`  ('${sid}', '${pid}'),   -- ${skill} ← ${p}`)
  }
}

const sql = `-- ============================================================
-- Manta Shark Aquatics — 技能前置關係
--
-- 產生自 docs/skill-prerequisites.json，不要手改這個檔。
-- 要改前置關係就改那份 JSON，然後：
--     node scripts/prereq-check.mjs
--     node scripts/prereq-sql.mjs
--
-- 前置要做到「自己做」(progress_percent >= 70) 下一個才解鎖，
-- 跟階段前進共用同一個門檻（lib/mastery.ts 的 UNLOCK_VALUE）。
--
-- 整份是一個 transaction。重跑安全：先清空再重建。
-- ============================================================
BEGIN;

-- 卡住就早點失敗，不要無限等下去。沒有這行的話，dev server 正在讀這張表時
-- 重跑會變成死結（deadlock），而不是一個看得懂的錯誤。
SET LOCAL lock_timeout = '5s';

/* 結構只在第一次建。
   重跑時不碰結構是有原因的：ALTER TABLE ... ENABLE ROW LEVEL SECURITY 和
   DROP/CREATE POLICY 就算設定已經一模一樣，還是要拿 AccessExclusiveLock。
   應用程式那邊只要有人正在讀這張表（dev server 開著就會），兩邊就互卡成死結。
   包在條件裡之後，重跑只剩 DELETE + INSERT，那只要 row lock，不會擋到任何人。 */
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class
     WHERE relname = 'skill_prerequisites'
       AND relnamespace = 'public'::regnamespace
  ) THEN
    CREATE TABLE public.skill_prerequisites (
      skill_id    uuid NOT NULL REFERENCES public.skills(id) ON DELETE CASCADE,
      requires_id uuid NOT NULL REFERENCES public.skills(id) ON DELETE CASCADE,
      created_at  timestamptz DEFAULT now(),
      PRIMARY KEY (skill_id, requires_id),
      -- 一個技能不能是自己的前置；真正的循環由 scripts/prereq-check.mjs 擋，
      -- 資料庫擋得住的只有這一種。
      CONSTRAINT skill_prereq_not_self CHECK (skill_id <> requires_id)
    );
    CREATE INDEX skill_prereq_skill ON public.skill_prerequisites(skill_id);
    ALTER TABLE public.skill_prerequisites ENABLE ROW LEVEL SECURITY;
    -- 課程結構不是個人資料，登入的人都讀得到（家長要看學習地圖）。
    -- 寫入只走 service role，跟 skills 一致。
    CREATE POLICY skill_prereq_read ON public.skill_prerequisites
      FOR SELECT TO authenticated USING (true);
  END IF;
END $$;

DELETE FROM public.skill_prerequisites;

INSERT INTO public.skill_prerequisites (skill_id, requires_id) VALUES
${rows.join('\n').replace(/,(\s+--[^\n]*)$/, ';$1')}

COMMIT;

-- ---------- 跑完的驗證 ----------
-- 應該是 ${rows.length} 列：
-- select count(*) from skill_prerequisites;
--
-- 第一天就能開始的技能（沒有任何前置）：
-- select s.name from skills s
--  where s.is_active
--    and not exists (select 1 from skill_prerequisites p where p.skill_id = s.id)
--  order by s.name;
`
fs.writeFileSync('docs/migration-skill-prerequisites.sql', sql)
console.log(`docs/migration-skill-prerequisites.sql — ${rows.length} 條前置`)
