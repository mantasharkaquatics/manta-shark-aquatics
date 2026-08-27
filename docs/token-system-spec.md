# Token 系統規格 v1.2(凍結 2026-07-17)

來源:v37 凍結 + 2026-07-16 全日裁決(七題 + A~J + 配額制)。取代 v1(39675f1)。
背景事實:舊 code 本就允許訂當天(僅擋已開始時段);7:30 PM 隔天 cutoff 本版廢除。

## Token 四種來源(token_packages.source)
- expiry:credit 過期,cron 每日 1:1 轉換剩餘堂數(不耗配額)
- cancellation:credit 課距開課 <24h 取消,退成 token(耗配額)
- manual:admin 手動調整(不耗配額)
- school_cancellation:校方取消 token 課的補發(不耗配額;刻意不用 'cancellation',因配額已用 = count(source='cancellation'),混用會錯扣家長配額)
所有來源效期一律 = 產生日 + 60 天。

## 課種規則
token 存「原課種」,cron/取消不改寫;可訂資格由共用 eligibility 函式判定:
- 課種完全不互通:1-on-1 token → 僅 1-on-1;1-on-2 token → 僅 1-on-2;1-on-4 token → 僅 1-on-4
  - 2026-08-27 修訂:原本 1-on-2 token 可跨用 1-on-4,經負責人裁決取消跨用(兩種課單價不同)
  - 已知後果:1-on-2 訂課在 v1 仍是 credit-only,所以 1-on-2 token 目前在家長端無處可花
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
- 校方取消(admin cancel-session 與 coach time-off notify-first 兩路同規則):原本是什麼就退什麼
  - credit 課 → decrement_used_credits 退原 credit
  - token 課 → insert 新 token_packages(source='school_cancellation'、source_booking_id 溯源、效期重算 60 天)。不用 decrement 回原包,因原包剩餘天數可能將盡且無法重設效期
- 跨家庭 1對2 被對方取消:被連帶取消的那一方適用同一條(credit 退原 credit;token 發新的 school_cancellation token)。不是自己取消的,不該連效期一起賠進去

## 取消轉換配額(全動態推導,零計數欄位)
- 總額度 = floor(累計購買堂數 ÷ 10) × 2;購買堂數 = lesson_credits 加總 total_credits,排除 is_trial 與 Swim Team
- 已用 = count(token_packages where source='cancellation');剩餘 = 總額度 − 已用,取消當下即時算
- 終身累計制,不重置、不隨過期回收;cron 過期轉換與 admin 代客取消皆不耗

## 扣款順序(2026-08-27 修訂:改為家長自選)
- 家長在預約最後一步選 token 或 credit,**預設 token**(不用會過期),但 token 課不可取消不可改期,所以選項旁邊直接寫出這個後果
- 伺服器不信任前端:`pay_with` 只是請求,伺服器重新驗課種資格、時間窗、張數。不足以支付整筆 → 一律退回 credit(credit 是保留彈性的那一邊)
- **全有全無**:同一個家庭在同一筆預約要付的所有座位,只能同一種付法
  - 理由:一筆預約一列紀錄只能記 credit 或 token 其中一種,而 token 課是最終的、credit 課不是。半 token 半 credit 的課沒有乾淨的取消路徑,而且「只剩一個學員的 1對2」本來就不成立
  - 座位數:自己兩個小孩的 1對2 = 2;跨家庭 1對2 每邊各 1;一小時課再乘 2
- 跨家庭 1對2 在對方確認時才結算,所以邀請方的選擇存在 `bookings.pay_with_token`,confirm 當下再驗一次
- 改期沿用原本那筆的付法(token 課本來就不能改期);週期性批次一律 credit
- token 間 / credit 間各自 FIFO 按 expires_at

## 資料模型(實名依 backup-2026-07-14.sql)
- 新表 token_packages:id uuid pk / parent_id uuid / course_type_id uuid(原課種)/ total_tokens int / used_tokens int default 0 / expires_at timestamptz / source text CHECK in ('expiry','cancellation','manual','school_cancellation') / source_credit_id uuid null(expiry 來源)/ source_booking_id uuid null(cancellation / school_cancellation 來源)/ note text / created_at / updated_at。RLS enable、零 client policy,全 service role
- lesson_credits 加 converted_to_token_at timestamptz;cron 掃「expires_at < now + 未轉 + total_credits - used_credits > 0」
- bookings 加 token_package_id uuid null;CHECK:lesson_credit_id 與 token_package_id 不得同時非 NULL
- RPC(仿現行 credit 版,sql SECURITY DEFINER):increment_used_tokens。decrement_used_tokens 已 DROP(2026-07-17,零 call site;校方退 token 走 insert 新包,不走 decrement)
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

## Changelog
- v1.2(2026-07-17):新增 source='school_cancellation' + CHECK 第四值(0337780);校方取消規則改為「insert 新包重算 60 天」取代 v1.1「退原包效期不變」,並套用至 coach time-off(8c0b6d1);decrement_used_tokens DROP;取消/退款 email 與 admin UI 文案分 credit/token/token_conversion/mixed/none 五態(b2d53dd);dashboard fetchAll 併入 loadTokens 即時刷新(bc0e843)
- v1.1(2026-07-16):凍結版,取代 v1(39675f1)
