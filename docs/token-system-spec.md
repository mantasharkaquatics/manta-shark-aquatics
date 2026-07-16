# Token 系統規格 v1(凍結 2026-07-16)

來源:v37 交接凍結 + 2026-07-16 七題裁決(HEAD 2955835 時拍板)

## 核心規則
1. 轉換:credit package 過期時,剩餘堂數 1:1 轉為 token package,cron 每日執行
2. 效期:轉換日 + 60 天
3. 課種規則(token 存「原課種」,cron 不改寫課種;可訂資格由共用 eligibility 函式判定):
   - 1-on-1 token → 僅可訂 1-on-1
   - 1-on-2 token → 可訂 1-on-2 或 1-on-4(跨用,業主裁決 2026-07-16)
   - 1-on-4 token → 僅可訂 1-on-4
   - Swim Team → 不轉;trial/assessment → 不適用
   - 同課多 token 可用時仍純 FIFO 按 expires_at,不做限制優先排序
4. 可訂範圍:僅當天/隔天(LA 時區,lib/date.ts)——補位券,填教練空檔
5. token 訂課不可取消、不可改期(一次定生死)
6. 教練端取消(block/time-off notify-first):token 退回原 package,效期不變(退回時已過期亦不延長——已拍板)
7. 扣款順序:admin 代訂當天/隔天 → token 優先,不給選;非當天/隔天 → token 不適用,走 credit。家長端當天/隔天本就只有 token(credit 有 24h 鎖)
8. token 間 FIFO 按 expires_at(比照 credit)
9. v1 排除:1-on-2 partner 流程、trial/assessment、購物車
10. AI chatbot v1 不教 token;上線穩定後入 policies.ts + 補 eval 題

## 資料模型(草案,實名以 DB 為準)
- token_packages:id/parent_id/course_type_id(原課種,eligibility 在 code)/quantity/used_quantity/expires_at/source_credit_package_id(nullable,admin 手動=NULL)/note/created_at
- credit 表加 converted_to_token_at;cron 掃「已過期 + 未轉 + 剩餘>0」(防重轉)
- bookings 加 token_package_id(nullable,與 lesson_credit_id 互斥)
- RLS 零 client policy,全 service role;扣退走 atomic RPC:increment_used_tokens / decrement_used_tokens

## Cron
- /api/cron/token-convert,每日,cron-job.org + Bearer CRON_SECRET(Hobby 方案教訓,不用 vercel.json)
- 轉換成功 → email 通知(lib/email sendEmail)

## 家長 UI
- dashboard 獨立卡片:橘色系/每包倒數計時/最後 7 天紅/無有效 token 整卡不顯示
- 訂課 flow:當天/隔天顯示可用 token

## Admin
- 手動調整:建手動 package / 調 quantity,寫 audit log

## 前置驗證(schema 動工前)
- [ ] 確認現行「新訂課」路徑真有擋 credit 訂當天/隔天(24h 鎖);沒擋=既有洞,隨 token 一起補
