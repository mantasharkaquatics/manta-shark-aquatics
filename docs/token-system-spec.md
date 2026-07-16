# Token 系統規格 v1.1(凍結 2026-07-16)

來源:v37 凍結 + 2026-07-16 全日裁決(七題 + A~J + 配額制)。取代 v1(39675f1)。
背景事實:舊 code 本就允許訂當天(僅擋已開始時段);7:30 PM 隔天 cutoff 本版廢除。

## Token 三種來源(token_packages.source)
- expiry:credit 過期,cron 每日 1:1 轉換剩餘堂數(不耗配額)
- cancellation:credit 課距開課 <24h 取消,退成 token(耗配額)
- manual:admin 手動調整(不耗配額)
所有來源效期一律 = 產生日 + 60 天。

## 課種規則
token 存「原課種」,cron/取消不改寫;可訂資格由共用 eligibility 函式判定:
- 1-on-1 token → 僅 1-on-1;1-on-2 token → 1-on-2 或 1-on-4(跨用);1-on-4 token → 僅 1-on-4
- Swim Team 不轉;trial/assessment 不適用
- 同課種多 token:純 FIFO 按 expires_at,不做限制優先排序

## 時間窗(統一規則,LA 時區 lib/date.ts,7:30 條款廢除)
- credit 可訂:開始時間 ≥ 現在 + 30 分鐘,至 60 天上限(現行上限不變)
- token 可訂:開始時間 ≥ 現在 + 30 分鐘,且限當天或隔天
- token 窗 ⊂ credit 窗;同一支時間窗函式,兩組參數

## 取消/改期
- token 課:不可取消、不可改期(一次定生死)
- credit 課,距開課 ≥ 24h 取消:退回原 credit(現行不變)
- credit 課,距開課 < 24h 取消:退成 token(取代舊硬鎖;耗 1 次配額;配額罄→硬鎖「請聯絡我們」)
- 改期:距開課 < 24h 一律擋(現行不變)
- 教練端取消(block/time-off notify-first):credit 課退原 credit;token 課退原 token package 效期不變

## 取消轉換配額(全動態推導,零計數欄位)
- 總額度 = floor(累計購買堂數 ÷ 10) × 2;購買堂數 = lesson_credits 加總 total_credits,排除 is_trial 與 Swim Team
- 已用 = count(token_packages where source='cancellation');剩餘 = 總額度 − 已用,取消當下即時算
- 終身累計制,不重置、不隨過期回收;cron 過期轉換與 admin 代客取消皆不耗

## 扣款順序
- 家長端與 admin 代訂一致:該時段 token 可用(課種資格 + 時間窗 + 未過期有餘額)→ 自動先扣 token,不給選;token 不可用 → 走 credit
- token 間 / credit 間各自 FIFO 按 expires_at

## 資料模型(實名依 backup-2026-07-14.sql)
- 新表 token_packages:id uuid pk / parent_id uuid / course_type_id uuid(原課種)/ total_tokens int / used_tokens int default 0 / expires_at timestamptz / source text CHECK in ('expiry','cancellation','manual') / source_credit_id uuid null(expiry 來源)/ source_booking_id uuid null(cancellation 來源)/ note text / created_at / updated_at。RLS enable、零 client policy,全 service role
- lesson_credits 加 converted_to_token_at timestamptz;cron 掃「expires_at < now + 未轉 + total_credits - used_credits > 0」
- bookings 加 token_package_id uuid null;CHECK:lesson_credit_id 與 token_package_id 不得同時非 NULL
- RPC(仿現行 credit 版,sql SECURITY DEFINER):increment_used_tokens / decrement_used_tokens
- makeup_credits 舊表不碰

## Cron
- /api/cron/token-convert,每日一次,cron-job.org + Bearer CRON_SECRET(不用 vercel.json)
- 轉換成功 → email 通知(lib/email sendEmail)

## UI
- 家長 dashboard 獨立卡片:橘色系/每包倒數/最後 7 天紅/無有效 token 整卡不顯示
- credit 訂當天/隔天課:確認時提示不可改期、取消將轉為 token(限當天隔天使用)且 token 課不可再取消改期
- 取消確認彈窗:顯示 "You have X late-cancellation conversions remaining";額度罄顯示硬鎖訊息
- admin:手動調整 token(建包/調量),寫 audit log

## v1 排除
1-on-2 partner 流程、trial/assessment、購物車不進 token;AI chatbot 不教(穩定後入 policies.ts + 補 eval)
