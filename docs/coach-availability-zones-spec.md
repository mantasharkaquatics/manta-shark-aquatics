# 教練時段分區規格 v1.0(凍結 2026-07-20)

## 目標
主管可設定每位教練哪些時段開放哪種課,取代現行「教練全時段全課種開放」。

## 分區類型
| zone_type | 可訂課種 | 格長 | 容量 |
|---|---|---|---|
| private | 1-on-1 或 1-on-2(共用同一格,先訂先得) | 30 分 | 每格 1 組 |
| group | 1-on-4 | 30 分 | 每格 4 席,逐一遞減 |
| team | Swim Team 專屬,排他 | 90 分 | 24 人(訂閱制,見 Team 節) |
| closed | 全日關閉標記(僅 kind=date 使用) | — | — |

- 同一教練同一時間分區**不得重疊**(admin 編輯器 + API 雙重驗證)
- 同一天允許同 zone_type 多段(Q1 裁:可,多列即可)
- 未劃區時段 = 該教練該時段不開放任何課

## 資料模型(單表)
`coach_availability_zones`
- id uuid pk / coach_id uuid
- zone_type text CHECK in ('private','group','team','closed')
- kind text CHECK in ('weekly','date')
- weekday int 0–6(kind=weekly 必填)/ override_date date(kind=date 必填)
- start_time / end_time time('closed' 列可存 00:00–23:59)
- created_at / updated_at
- RLS enable、零 client policy,全 service role

## 解析規則(某教練某日的有效分區)
1. 該日有任何 kind=date 列 → 整日以 date 列為準(weekly 不生效);zone_type='closed' 一列 = 整天關閉(Q2 裁)
2. 否則套 weekly 模板該 weekday
3. time-off / admin block 照現制再往下扣:分區管「開什麼」,block 管「不上班」,兩層獨立疊加

## 訂課端行為(1on1/1on2/1on4)
- slot 生成:格子只從對應 zone_type 區間內生成;30 分 lead、24h 標記、token 窗等現有規則照舊往上疊
- create API 後端同步驗證格子落在有效分區內,防繞過;admin 代訂同一套判定

## Swim Team 線上報名(Q4 裁:入列)
- **模型:訂閱制,不逐堂訂課**。名額 = 有效 team 訂閱數;上限 24
- 報名入口:Plans 頁既有 "Join the Team" 訂閱流程,結帳前檢查 `active team subscriptions < 24`,滿員顯示「名額已滿,請聯絡我們」並擋結帳
- team 區定義上課時段;家長端顯示課表(從 team 區解析,非寫死 Mon/Wed);check-in 照現制
- 退訂即釋出名額(Stripe subscription 狀態為準)
- v1 不做候補名單(滿員請聯絡我們)

## 過渡策略
- 上線時零分區教練 = 照現制全開;有劃區者走新制;全員劃完後拔舊制
- migration 前全量 pg_dump(規矩)

## Admin UI
- 每教練週模板:7 天 × 30 分格滑選塗區(private 金 / group 綠 / team 紅)
- 日期覆蓋:挑日期 → 以當週模板為底稿 → 存成 date 列;「整天關閉」一鍵寫 closed 列
- 改區撞既有 booking:警示但放行,既有 bookings 不受影響(Q3 裁)

## 排除項(v1 不做)
- 教練自助編輯、生效日排程、team 候補名單、AI chatbot 教學(穩定後入 policies.ts)

## Changelog
- v1.0(2026-07-20):凍結。Q1 允許多段 / Q2 closed 型 / Q3 警示放行 / Q4 Team 訂閱制報名入列(24 名額於結帳前檢查)
- v0.9(2026-07-20):初稿
