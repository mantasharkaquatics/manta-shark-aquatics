# 教練時段分區規格 v0.9(草案,待業主裁示)

## 目標
主管可設定每位教練哪些時段開放哪種課,取代現行「教練全時段全課種開放」。

## 三種分區
| zone_type | 可訂課種 | 格長 | 容量 |
|---|---|---|---|
| private | 1-on-1 或 1-on-2(共用同一格,先訂先得) | 30 分 | 每格 1 組 |
| group | 1-on-4 | 30 分 | 每格 4 席,逐一遞減 |
| team | Swim Team 專屬,排他 | 90 分 | 24 人 |

- 分區之間同一教練同一時間**不得重疊**(admin 編輯器驗證擋下)
- team 區時段對其他課種完全不可訂(排他由「不重疊 + 課種只認自己的區」自然達成)
- 未劃區的時段 = 該教練該時段**不開放任何課**

## 資料模型(單表)
`coach_availability_zones`
- id uuid pk
- coach_id uuid
- zone_type text CHECK in ('private','group','team')
- kind text CHECK in ('weekly','date') — weekly=每週模板列,date=特定日期覆蓋列
- weekday int 0–6(kind=weekly 時必填)
- override_date date(kind=date 時必填)
- start_time / end_time time
- created_at / updated_at
- RLS enable、零 client policy,全 service role(同 token_packages 慣例)

## 解析規則(某教練某日的有效分區)
1. 該日期有任何 kind=date 列 → **整日以 date 列為準**,weekly 模板該日完全不生效(含「date 列為空集」= 主管整天關閉:插入一列 zone_type='closed'?→ 見待裁 Q2)
2. 否則套用 weekly 模板該 weekday 的列
3. time-off / admin block 照現制**再往下扣**:分區決定「可開什麼」,block 決定「哪些時間不上班」,兩層獨立疊加

## 訂課端行為
- slot 生成:家長選定課種+教練+日期後,格子只從對應 zone_type 的區間內生成;30 分 lead time、24h 標記、token 窗等現有規則全部照舊往上疊
- create API 後端同步驗證(格子必須落在有效分區內),防繞過前端
- admin 代訂同一套判定
- Swim Team:team 區存在才可加入;24 人上限;是否開放線上報名 → 待裁 Q4

## 過渡策略
- migration 上線時所有教練**零分區 = 照現制全開**(feature flag 式軟啟動:有劃區的教練走新制、沒劃的走舊制),全部教練劃完區後再拔舊制
- 這讓上線不需要一次排完所有教練的表

## Admin UI
- 每教練一張週模板:7 天 × 30 分格,滑選塗區(private 金 / group 綠 / team 紅),存檔寫 weekly 列
- 日期覆蓋:挑日期 → 複製當週模板為底稿 → 改完存成 date 列
- 編輯不影響**既有 bookings**(已訂的課不因改區被砍;僅影響之後的新訂單)→ 衝突提示:改區時若該時段已有未來 booking,列出警示但允許存檔

## 排除項(v1 不做)
- 教練自助編輯自己的區(僅 admin/主管)
- 分區生效日排程(「下月起改新表」)——先手動在生效日改
- AI chatbot 教學(照 token 慣例,穩定後入 policies.ts)

## 待業主裁示
- Q1 週模板是否允許同一天同 zone_type 多段(如上午 private + 下午 private)?(建議:允許,多列即可)
- Q2 「特定日期整天關閉」怎麼表達?(建議:date 列 zone_type 加第四值 'closed',一列蓋全日)
- Q3 改區碰到既有 booking:僅警示不阻擋(建議),或強制先處理完 booking 才能存?
- Q4 Swim Team 線上報名這期做不做?(目前 Plans 頁有訂閱入口,訂課頁排除 team)
