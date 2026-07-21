# 教練時段分區規格 v1.1(凍結 2026-07-20)

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

## Swim Team(v1.1 重定義:訂閱制 + 分級隊)
- **收費**:每隊每月 $399,Stripe 真訂閱(mode=subscription,自動續扣),**綁學生**——一學生一訂閱,兩孩兩份
- **出席**:吃到飽,不限次數、不逐堂訂課;去該隊的任何 team 時段 check-in 即可
- **分級**:新表 `team_tiers`(id / name / level_min / level_max / active)——隊由 swim level 範圍定義;學生只能加入涵蓋其當前 level 的隊,只能出席該隊時段;隊的名稱與範圍由業主定(**待業主提供**)
- **名額**:每隊上限 24 = 該隊 active memberships 數;結帳前檢查,滿員擋結帳顯示「請聯絡我們」
- **資料**:新表 `team_memberships`(student_id / team_tier_id / stripe_subscription_id / status / started_at / cancelled_at);webhook 接 invoice.paid(續期)與 customer.subscription.deleted(退隊釋名額)
- **zones**:team 列加 `team_tier_id`(zone_type='team' 必填)——標該時段是哪隊練習
- **check-in 驗級**:學生所屬隊 ≠ 時段的隊 → 擋
- 舊 'team' 一次性 $180/8-credit 方案自 PLANS 移除;Plans 頁 team 卡改分隊呈現(各隊 Enroll / 滿員態),不實「自動續訂」文案隨改版一併矯正
- v1 排除:學生升級跨隊的自動轉隊(admin 手動處理)、候補名單

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
- v1.1(2026-07-20):Team 重定義——$399/月真訂閱、吃到飽、分級隊(team_tiers 以 swim level 範圍定義)、每隊 24 名額、訂閱綁學生;zones team 列加 team_tier_id;舊 8-credit 方案廢止
- v1.0(2026-07-20):凍結。Q1 允許多段 / Q2 closed 型 / Q3 警示放行 / Q4 Team 訂閱制報名入列(24 名額於結帳前檢查)
- v0.9(2026-07-20):初稿
