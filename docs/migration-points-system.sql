-- ===========================================================================
--  POINTS SYSTEM — SCHEMA MIGRATION
--  2026-09-01 · 設計書第 8 節「回頭路」的實作
--
--  這份遷移只「加」，不「改」，也不「刪」。
--
--  lesson_credits 和 token_packages 原地保留，一個欄位都不動。它們會變成
--  沒有程式在讀的空表 —— 那是刻意的：切回舊制時只需要換程式碼，不需要再
--  做一次資料遷移。真的要清掉是幾個月之後、你完全確定不回頭了，才單獨做
--  的一件事。
--
--  跑之前：Supabase → Database → Backups 先備份。
--  跑的地方：Supabase → SQL Editor，整份貼上執行。
--  重複執行安全（全部都是 IF NOT EXISTS / CREATE OR REPLACE）。
-- ===========================================================================

BEGIN;

-- ---------------------------------------------------------------------------
--  1. 錢包：一個家庭一個
--
--  分成「購買的」和「贈送的」兩種餘額。原因是退款：購買的點數 $1 退 $1，
--  主管手動贈送的點數不能換現金 —— 不分開的話，送出去的招待點會變成可以
--  提領的現金。
--
--  扣款一律「先扣贈點」。對家長最有利（先用掉不能退的那一份），對你也最
--  安全（退款時只會碰到他真的付過錢的部分）。
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.point_wallets (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id            uuid NOT NULL UNIQUE REFERENCES public.parents(id) ON DELETE CASCADE,

  balance_purchased    integer NOT NULL DEFAULT 0 CHECK (balance_purchased >= 0),
  balance_granted      integer NOT NULL DEFAULT 0 CHECK (balance_granted   >= 0),

  -- 累計實付金額，只做對帳與遞延收入報表用，不參與任何扣款計算
  total_paid_cents     bigint  NOT NULL DEFAULT 0 CHECK (total_paid_cents >= 0),
  total_refunded_cents bigint  NOT NULL DEFAULT 0 CHECK (total_refunded_cents >= 0),

  -- 已用掉的「晚取消豁免」次數。可用次數 = floor(完成堂數 / 10) - 這個數字
  forgiveness_used     integer NOT NULL DEFAULT 0 CHECK (forgiveness_used >= 0),

  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE  public.point_wallets IS '家庭的點數錢包。1 點 = US$1，永不過期。';
COMMENT ON COLUMN public.point_wallets.balance_granted IS '主管手動贈送，不可換現金，扣款時優先使用。';

-- ---------------------------------------------------------------------------
--  2. 帳本：每一次點數變動都留一列，永不修改、永不刪除
--
--  pricing 欄位記下「這筆扣款當時是怎麼算出來的」。VIP 級距或離峰時段
--  之後如果調整，半年前那筆扣款還是解釋得出來 —— 沒有它，客訴就只能靠猜。
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.point_ledger (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id                uuid NOT NULL REFERENCES public.point_wallets(id) ON DELETE CASCADE,
  parent_id                uuid NOT NULL REFERENCES public.parents(id)       ON DELETE CASCADE,

  -- 一次事件通常只動一種餘額，跨桶的扣款兩個欄位都會有值
  delta_purchased          integer NOT NULL DEFAULT 0,
  delta_granted            integer NOT NULL DEFAULT 0,
  balance_purchased_after  integer NOT NULL,
  balance_granted_after    integer NOT NULL,

  reason                   text NOT NULL CHECK (reason IN (
                             'purchase',        -- 家長買點數
                             'booking',         -- 訂課扣點
                             'booking_failed',  -- 訂課途中失敗，把扣掉的點還回去
                             'cancel_refund',   -- 24 小時前取消，退點
                             'forgiveness',     -- 24 小時內取消，用掉一次豁免退點
                             'school_cancel',   -- 校方取消，退點
                             'admin_grant',     -- 主管贈點
                             'admin_deduct',    -- 主管扣點
                             'cash_refund'      -- 退現金，點數扣掉
                           )),

  booking_id               uuid REFERENCES public.bookings(id) ON DELETE SET NULL,
  amount_cents             integer,   -- purchase / cash_refund 時的金額
  stripe_session_id        text,
  pricing                  jsonb,     -- { base, seats, vip_level, vip_pct, off_peak, charged }
  note                     text,      -- admin_* 必填，見下方觸發器
  actor                    text NOT NULL,  -- 'parent' | 'admin:<uuid>' | 'system'
  created_at               timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS point_ledger_wallet_idx  ON public.point_ledger (wallet_id, created_at DESC);
CREATE INDEX IF NOT EXISTS point_ledger_parent_idx  ON public.point_ledger (parent_id, created_at DESC);
CREATE INDEX IF NOT EXISTS point_ledger_booking_idx ON public.point_ledger (booking_id) WHERE booking_id IS NOT NULL;

-- 主管的手動調整一定要有理由。沒有理由的調整，三個月後沒有人記得為什麼。
CREATE OR REPLACE FUNCTION public.point_ledger_require_note() RETURNS trigger AS $$
BEGIN
  IF NEW.reason IN ('admin_grant','admin_deduct')
     AND (NEW.note IS NULL OR btrim(NEW.note) = '') THEN
    RAISE EXCEPTION '手動調整點數必須填寫理由';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS point_ledger_require_note_trg ON public.point_ledger;
CREATE TRIGGER point_ledger_require_note_trg
  BEFORE INSERT ON public.point_ledger
  FOR EACH ROW EXECUTE FUNCTION public.point_ledger_require_note();

-- ---------------------------------------------------------------------------
--  3. 訂單上的點數欄位
--
--  bookings 加兩個欄位，不動既有的 lesson_credit_id / token_package_id ——
--  舊資料照樣讀得懂，切回舊制時也不需要改回來。
-- ---------------------------------------------------------------------------
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS points_charged  integer,
  ADD COLUMN IF NOT EXISTS points_refunded integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.bookings.points_charged IS
  '這筆預約扣掉的點數。NULL 表示不是用點數付的（舊制的堂數／token）。';

-- 「完成堂數」的定義就寫在這個索引服務的查詢裡：扣過點、還沒退點、
-- 而且課已經上過了。
CREATE INDEX IF NOT EXISTS bookings_points_charged_idx
  ON public.bookings (parent_id)
  WHERE points_charged IS NOT NULL;

-- ---------------------------------------------------------------------------
--  4. 完成堂數 —— 用算的，不用存的
--
--  存一個計數器就會有跟事實不一致的一天。這個查詢很便宜，而且永遠對。
--  規則：扣過點、退點金額小於扣點金額（沒有被全額退掉）、課程日期已過。
--  未到場（no-show）算完成，24 小時前取消退點的不算。
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.points_lessons_completed(p_parent_id uuid)
RETURNS integer
LANGUAGE sql STABLE AS $$
  SELECT count(*)::integer
  FROM public.bookings b
  JOIN public.class_sessions cs ON cs.id = b.class_session_id
  WHERE b.parent_id = p_parent_id
    AND b.points_charged IS NOT NULL
    AND b.points_refunded < b.points_charged
    AND b.status <> 'cancelled'
    AND cs.session_date < (now() AT TIME ZONE 'America/Los_Angeles')::date
$$;

COMMENT ON FUNCTION public.points_lessons_completed(uuid) IS
  'VIP 等級與晚取消豁免次數的唯一依據。刻意用算的而不是存計數器。';

-- ---------------------------------------------------------------------------
--  5. RLS —— 家長只讀得到自己的，寫入一律走 service role
-- ---------------------------------------------------------------------------
ALTER TABLE public.point_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.point_ledger  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS point_wallets_own_read ON public.point_wallets;
CREATE POLICY point_wallets_own_read ON public.point_wallets
  FOR SELECT USING (
    parent_id IN (SELECT id FROM public.parents WHERE auth_user_id = auth.uid())
  );

DROP POLICY IF EXISTS point_ledger_own_read ON public.point_ledger;
CREATE POLICY point_ledger_own_read ON public.point_ledger
  FOR SELECT USING (
    parent_id IN (SELECT id FROM public.parents WHERE auth_user_id = auth.uid())
  );

-- 沒有 INSERT / UPDATE / DELETE 政策 = 只有 service role 動得了。
-- 點數是錢，不能讓瀏覽器直接寫。

COMMIT;


-- ===========================================================================
--  跑完之後檢查（唯讀）
-- ===========================================================================
-- SELECT table_name FROM information_schema.tables
--  WHERE table_schema='public' AND table_name IN ('point_wallets','point_ledger');
--
-- SELECT column_name FROM information_schema.columns
--  WHERE table_schema='public' AND table_name='bookings'
--    AND column_name IN ('points_charged','points_refunded');
--
-- 舊表應該還在，而且一個欄位都沒少：
-- SELECT count(*) FROM public.lesson_credits;
-- SELECT count(*) FROM public.token_packages;
