# 上線清單

正式上線 = 把 `points-system` 合併進 `main`。Vercel 的 production branch 是 `main`，
所以**合併的那一刻就是上線**，沒有中間狀態。下面每一項都要在合併之前完成。

狀態：`[ ]` 未做 · `[x]` 已完成

---

## 1. Stripe（正式模式）

目前只有測試／沙盒環境有設定。正式模式的 webhook endpoint **還沒建立**，
這是擋住合併的第一項。

- [ ] 在 **正式模式**（不是沙盒、不是測試模式）建立 webhook endpoint，指向
      `https://www.mantasharkaquatics.net/api/stripe/webhook`
- [ ] 勾選這 12 個事件 —— 少一個就有一段程式永遠不會被觸發
      （清單以 `app/api/stripe/webhook/route.ts` 處理的事件為準，2026-10-05 核對）：

  | 事件 | 沒勾會怎樣 |
  |---|---|
  | `checkout.session.completed` | 家長付了錢但點數不會進錢包 |
  | `checkout.session.expired` | 未付款的評估課會一直佔住時段 |
  | `checkout.session.async_payment_succeeded` | 用銀行轉帳付的評估課要等清理排程才確認，不會即時確認 |
  | `checkout.session.async_payment_failed` | 銀行轉帳沒扣成的評估課要等清理排程才釋出時段 |
  | `customer.subscription.updated` | 泳隊取消預約日期不會顯示 |
  | `customer.subscription.deleted` | 泳隊退訂後仍算有效會員 |
  | `invoice.paid` | 泳隊每月收據不會產生 |
  | `invoice.payment_failed` | 泳隊欠費不會標記 past_due |
  | `payment_intent.payment_failed` | **銀行扣款失敗，點數收不回來** |
  | `charge.dispute.created` | **家長申訴成功，點數收不回來** |
  | `charge.dispute.funds_withdrawn` | **銀行詢問（inquiry）升級成正式申訴、錢被扣走時，點數收不回來**——詢問階段在 `.created` 不會收點數，只靠這個事件 |
  | `charge.dispute.closed` | 申訴打贏時不會在 log 留下「要手動補回點數」的提醒 |

- [ ] **如果正式 endpoint 已經照舊的 8 個事件建好**：到 Stripe → Developers →
      Webhooks → 該 endpoint → Update details，補勾
      `checkout.session.async_payment_succeeded`、`checkout.session.async_payment_failed`、
      `charge.dispute.funds_withdrawn`、`charge.dispute.closed`
- [ ] 把該 endpoint 的 signing secret 設成 Vercel production 的
      `STRIPE_WEBHOOK_SECRET`
- [ ] Vercel production 的 `STRIPE_SECRET_KEY` 換成正式金鑰（`sk_live_…`）
- [ ] 上線後用一筆真實小額交易走完整流程，確認點數真的進錢包

## 2. 資料庫

- [x] `point_ledger` 的 `stripe_session_id` 唯一索引（防重複入點）
- [x] `docs/migration-ach-reversal.sql`（沖銷理由、負餘額、purchases 沖銷欄位）
- [x] `docs/migration-cash-refund.sql`（退款失敗理由、purchases.refunded_cents）
- [x] `docs/migration-stripe-fees.sql`（purchases 的手續費欄位）+ 歷史資料已補抓
- [x] `docs/migration-invoice-seq-lockdown.sql`（收回 `get_next_invoice_seq`
      的 authenticated 執行權，避免任何登入者空燒發票號碼）
- [ ] `docs/migration-pos-credit-retry.sql`（櫃檯「補入點數」按鈕的唯一索引，
      兩個人同時按也不會重複入點）
- [ ] `docs/migration-skill-criteria.sql`（技能改成可量測的名稱 + 加上
      通過標準）。技能 id 不變，家長的歷史進度全部保留。
      跑完到教練 app 的「進度」頁確認標準有顯示在百分比按鈕上方。
- [ ] `docs/reset-test-data.sql` —— 清掉所有測試資料。**這是不可逆的，
      務必先在 Database → Backups 備份**

## 3. 排程

網站本身不會自己跑任何排程（Vercel Hobby 的 cron 不可靠，已全部搬到 cron-job.org）。
下面每一個工作都只有 cron-job.org 去打它時才會做；沒排上就是**安靜地不做**，
網站和 email 不會有任何錯誤訊息。

共同設定：網址都是 `https://www.mantasharkaquatics.net` 開頭；時區選
`America/Los_Angeles`；開啟 save responses；`<CRON_SECRET>` 是 Vercel production
環境變數 `CRON_SECRET` 的值。**Vercel 上一定要有 `CRON_SECRET`**：沒設的話
這些路由一律回 401（2026-10-08 起，`lib/cron-auth.ts`），工作就全部停擺。

| 工作 | 方法與網址 | 時間 | Header | 不排會怎樣 |
|---|---|---|---|---|
| cleanup-pending | `GET /api/cron/cleanup-pending-bookings` | 每 15 分鐘（`*/15 * * * *`） | `Authorization: Bearer <CRON_SECRET>` | 沒付款的評估課、一對二邀請、購物車會一直佔住時段 |
| sms-reminder | `GET /api/cron/sms-reminder` | 每 30 分鐘（`*/30 * * * *`） | `Authorization: Bearer <CRON_SECRET>` | 上課前一天的簡訊提醒不會寄 |
| monthly-reports | `GET /api/cron/monthly-reports` | 每小時第 5 分（`5 * * * *`） | `Authorization: Bearer <CRON_SECRET>` | AI 月報不會產生，也不會寄給家長 |
| daily-points | `GET /api/cron/daily-points` | 每天一次，清晨，例如 3:10（`10 3 * * *`） | `Authorization: Bearer <CRON_SECRET>` | 見下方 |
| sync-fees | `POST /api/admin/finance/sync-fees` | 每天一次即可 | `x-internal-key: <CRON_SECRET>`（注意：不是 Authorization） | ACH 收款的 Stripe 手續費不會補進 Finance 頁（也可以不排，需要時到 Finance 頁按按鈕） |

- [x] cleanup-pending（cron-job.org 名稱「MSA cleanup-pending every 15min」）
- [x] sms-reminder（「MSA sms-reminder 25h window / 30min」）
- [ ] monthly-reports —— 2026-09-30 正在新增，建好後確認有一次 200
- [ ] **daily-points —— 還沒排上 cron-job.org（2026-10-08 確認清單裡沒有）。**
      這支一次做五件事，全站只有它會做：贈點滿一年到期、轉介紹雙方各 40 點、
      評估後 60 天內上滿 8 堂發 85 點折抵、補課券到期前一週提醒並把過期的券
      標成過期、固定班最後一堂前三週寄續報信。沒排的話這些全部不會發生，
      可是網站和 email 都跟家長說會有。建好後手動 Run 一次，回應裡應看到
      `referralsAwarded`、`assessmentCreditsAwarded`、`renewalsSent` 等欄位。
- [ ] sync-fees（選擇性）
- [ ] 刪掉 cron-job.org 上的「token-convert」：它打的路由已隨舊代幣制度移除，
      每晚都失敗。

## 4. 讓 Google 找得到

兩個地方要同時改，只改一個沒有用：

- [ ] `app/robots.ts` 第 8 行 `SEARCH_ENGINES_ALLOWED = false` → `true`
- [ ] `app/layout.tsx` metadata 裡標著 `PRE-LAUNCH` 的 `robots: { index: false, … }` 整塊刪掉

## 5. 法務

- [ ] 服務條款與退款政策給律師看過
- [ ] 確認加州儲值卡法規（Civil Code 1749.5）對點數制度的適用範圍
- [ ] 現金退款：程式已完成並測過，等條款定稿後把
      `lib/points.ts` 的 `CASH_REFUND_ENABLED` 改成 `true`，
      再到 Members 頁加按鈕

## 6. 內容與設定

- [ ] `/about` 兩個照片位還是空的
- [ ] Google Places API 金鑰加上 HTTP referrer 限制（現在任何網站都能盜用）

## 7. 稽核未修項目

完整清單見稽核報告（已標上現況）。剩下兩項，都判斷過不擋上線：

- 第 12 項：批次訂課失敗留下 `enrolled_count: 0` 的空課。只有資料髒，
  上線後真的看到堆積再補排程。
- 第 13 項：條款寫「不退款」、程式做的是「不讓你取消」。要改的是條款
  文字，等律師一起處理。

---

## 已完成

- [x] 教練 PIN 登入速率限制
- [x] 重複 webhook 不會重複發點（唯一索引 + `DuplicateLedgerEntry`）
- [x] 銀行扣款失敗／爭議會沖銷點數、釋放未上的課、通知家長
- [x] 退點失敗不再被誤標為已退款
- [x] 遞延收入報表（`/admin/finance`）
- [x] 現金退款的邏輯與 API（`lib/refunds.ts`，旗標關閉中）
- [x] Stripe 手續費抓進網站，Finance 頁看得到每月手續費與淨收現金
- [x] 改期不再憑空生出點數，也不再把一對二的另一位學生留在舊時段
- [x] 60 分鐘課取消只扣一次晚取消豁免（原本兩個半小時各扣一次）
- [x] AI 客服取消一小時課會整堂取消（原本只取消半堂卻回報成功）
- [x] 確認改期失敗會把兩家的原預約復原，不再取消完就回報成功
- [x] 發票號碼不再有 `|| 1` 的假退路，碰撞會換號重試（六處收斂成一個函式）
- [x] 櫃檯現金重複結帳有防護（原本只有刷卡有）
- [x] 改期擋掉它搬不動的兩種課（跨帳戶一對二、60 分鐘課），不再有
      繞過專用路由把另一半留在舊時段的路
- [x] 60 分鐘課改期不會只搬一半：第二半失敗會把第一半搬回去
