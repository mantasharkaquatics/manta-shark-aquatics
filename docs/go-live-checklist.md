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
- [ ] 勾選這 8 個事件 —— 少一個就有一段程式永遠不會被觸發：

  | 事件 | 沒勾會怎樣 |
  |---|---|
  | `checkout.session.completed` | 家長付了錢但點數不會進錢包 |
  | `checkout.session.expired` | 未付款的評估課會一直佔住時段 |
  | `customer.subscription.updated` | 泳隊取消預約日期不會顯示 |
  | `customer.subscription.deleted` | 泳隊退訂後仍算有效會員 |
  | `invoice.paid` | 泳隊每月收據不會產生 |
  | `invoice.payment_failed` | 泳隊欠費不會標記 past_due |
  | `payment_intent.payment_failed` | **銀行扣款失敗，點數收不回來** |
  | `charge.dispute.created` | **家長申訴成功，點數收不回來** |

- [ ] 把該 endpoint 的 signing secret 設成 Vercel production 的
      `STRIPE_WEBHOOK_SECRET`
- [ ] Vercel production 的 `STRIPE_SECRET_KEY` 換成正式金鑰（`sk_live_…`）
- [ ] 上線後用一筆真實小額交易走完整流程，確認點數真的進錢包

## 2. 資料庫

- [x] `point_ledger` 的 `stripe_session_id` 唯一索引（防重複入點）
- [x] `docs/migration-ach-reversal.sql`（沖銷理由、負餘額、purchases 沖銷欄位）
- [x] `docs/migration-cash-refund.sql`（退款失敗理由、purchases.refunded_cents）
- [x] `docs/migration-stripe-fees.sql`（purchases 的手續費欄位）+ 歷史資料已補抓
- [ ] `docs/migration-invoice-seq-lockdown.sql`（收回 `get_next_invoice_seq`
      的 authenticated 執行權，避免任何登入者空燒發票號碼）
- [ ] `docs/reset-test-data.sql` —— 清掉所有測試資料。**這是不可逆的，
      務必先在 Database → Backups 備份**

## 3. 排程

- [ ] 把補抓手續費排進 cron-job.org（每天一次即可）：
      `POST /api/admin/finance/sync-fees`，帶 header `x-internal-key: <CRON_SECRET>`。
      ACH 收款要結算後才有手續費，webhook 當下抓不到，靠這個補。
      也可以不排，改成需要時到 Finance 頁按按鈕。

## 4. 讓 Google 找得到

兩個地方要同時改，只改一個沒有用：

- [ ] `app/robots.ts` 第 8 行 `SEARCH_ENGINES_ALLOWED = false` → `true`
- [ ] `app/layout.tsx` 第 25–26 行的 `robots: { index: false, … }` 整塊刪掉

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

完整清單見稽核報告（已標上現況）。剩下三項，都判斷過不擋上線：

- 第 8 項的後半：跨帳戶一對二與 60 分鐘課改期只動一半。沒有金錢損失，
  但會留下對不起來的行事曆。
- 第 12 項：批次訂課失敗留下 `enrolled_count: 0` 的空課。上線後真的
  看到堆積再補排程。
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
