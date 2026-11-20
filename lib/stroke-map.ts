/*
 * The parent learning map's skeleton (owner, 2026-11-20, after research into
 * how the Red Cross, YMCA, Swim England, Lifesaving Society, USA Swimming and
 * the coaching books order things): families know the four strokes and
 * "how far", not "level 3 stage 2". So every stroke walks the same 8 steps --
 * body position, kick, arms + breathing, swims a short way, 25, 50, 100 yd,
 * the timed standard -- and water safety walks its own 5 (the Red Cross
 * water-competency order). The strokes start at different levels (freestyle
 * and backstroke in L1, butterfly L3, breaststroke L4) and run side by side.
 *
 * Every active skill belongs to exactly one track and one step. Each step has
 * one or more KEY skills: the step is done when every key reads 100 (學會了 --
 * the same bar as a stage, owner 2026-11-20, so the table and the promotions
 * cannot disagree). The other skills of a step are what the detail page lists.
 * A new skill must be added here, or the parent map will not show it.
 * The three medley skills belong to no single stroke and are left out.
 */
import { masteryOf, PASS_LEVEL } from '@/lib/mastery'

export type TrackId = 'sf' | 'fr' | 'bk' | 'br' | 'fl'
export const STROKES: TrackId[] = ['fr', 'bk', 'br', 'fl']
export const TRACK_COLOR: Record<TrackId, string> = { sf: '#e2577a', fr: '#2f6fdb', bk: '#14a394', br: '#ef7d22', fl: '#8a55e6' }
export const TRACK_ICON: Record<TrackId, string> = { sf: 'shield', fr: 'swim-fr', bk: 'swim-bk', br: 'swim-br', fl: 'swim-fl' }

type Step = { keys: string[]; skills: string[] }
const s = (keys: string[], skills: string[]): Step => ({ keys, skills })

/* Skill ids, with the Traditional Chinese name beside each. */
export const TRACKS: Record<TrackId, Step[]> = {
  sf: [
    s(['f0b828a0-63a5-4aea-8000-13e1b05b1682'], [ // 進出水池
      '3aa56665-8ce2-4524-819d-efcf30057a02',   // 辨識泳池環境
      'f0b828a0-63a5-4aea-8000-13e1b05b1682',   // 安全進出泳池 ★
      'a5ec094e-4338-4259-9e43-4b913cd02ca3']), // 沿壁移動
    s(['49f02c5d-009c-459c-8ef0-de2dad48c25d'], [ // 臉入水、吐氣
      '0d151d1b-8492-49bc-824e-c4e26a657046',   // 水面嘴巴吐泡泡
      '58842492-eacd-4c4d-9506-a18e562c64b5',   // 水中行走
      '49f02c5d-009c-459c-8ef0-de2dad48c25d',   // 面部入水 ★
      'cdf91a82-3f78-4c32-9f11-7f73b5d3754a',   // 水中鼻子吐泡泡
      '084fe3dd-cbe3-485c-82d6-dcdd2cd56ae7',   // 憋氣 5 秒
      '268cc43e-0038-4fa9-9f28-18fff4aedcca',   // 水母漂
      '35250d84-1461-4c39-85fc-7686d9576753']), // 吐泡跳（胸深）
    s(['63f1fc23-f60a-4417-86e1-2d4dd2d191c3'], [ // 深水
      'ed0e69e4-3edb-4668-84d8-a39064fe2425',   // 水中撿物
      'c7022acb-3075-471f-8c45-4d5330139369',   // 吐泡跳（過頭深）
      '63f1fc23-f60a-4417-86e1-2d4dd2d191c3',   // 跳入深水 ★
      '806e2b61-f66e-460b-b31b-264097fee097',   // 海星漂 30 秒
      '9194c9af-7e03-4d13-969b-4284d49b3a84']), // 深水撿物
    s(['4dd3928b-8433-40c4-8057-29b454ce5a03'], [ // 踩水
      '4dd3928b-8433-40c4-8057-29b454ce5a03',   // 踩水 30 秒 ★
      'b4e9ff8e-535c-4e5e-bc9a-8ceb9c252113',   // 踩水 1 分鐘
      '3c01a30f-147d-4880-9738-75c245fc3325']), // 踩水 2 分鐘
    s(['997642b0-c290-48cf-a53f-ccb46d52d539'], [ // 水中自保測驗
      '7a62a560-01cd-4199-b464-68a78a8ee98a',   // 水中轉身
      '997642b0-c290-48cf-a53f-ccb46d52d539']), // 水域安全測驗 ★
  ],
  fr: [
    s(['d6915327-5d9d-4907-be40-b59ad3536c8d'], [ // 姿勢
      '92751613-6a3c-465f-bcdb-251754df1dff',   // 面部入水漂浮
      'd6915327-5d9d-4907-be40-b59ad3536c8d',   // 超人滑行 ★
      'b46c9773-7e09-4da4-8beb-d79050075710',   // 蹬牆漂浮
      '89ca69a6-6f96-4c1d-a52d-6ba16edab33b']), // 流線蹬牆
    s(['e8fd87dc-4e41-4ea5-adda-d8038881f573'], [ // 打水
      '2eb2c769-054f-4e44-9769-779c7972318b',   // 岸上打水
      '4fd1fce7-9293-475e-a142-5a8d2ecf954d',   // 自由式打水 10 碼（浮板）
      'e8fd87dc-4e41-4ea5-adda-d8038881f573',   // 自由式打水 25 碼 ★
      '9ac7c46d-2f0f-495b-a0cc-95a13e6684fc',   // 自由式打水 10 碼（無浮板側換氣）
      '818b6b3b-63b9-4e13-9a52-f3f466f57cc7',   // 流線自由式打水
      '9722f505-b208-43dc-868d-495ba0f3c10e']), // 水下自由式打水
    s(['580a979a-e3f7-458f-b0f8-c39c7c20d686'], [ // 划手、換氣
      'b1a0c2d4-5e6f-4a71-8b92-0c1d2e3f4a51',   // 划手前進 5 碼
      'a35fa45c-35d8-4a9c-a5bf-bbba46bc1357',   // 扶牆側轉換氣 10 次
      '6d8d921a-e413-4bf9-81d6-a1930dab3404',   // 側邊打水
      'ed4c463b-6c65-497b-b370-18e9bd945468',   // 翻滾打水（BBQ）
      '580a979a-e3f7-458f-b0f8-c39c7c20d686']), // 側轉換氣游 15 碼 ★
    s(['dff814b2-90df-4043-aeb3-dd4e4df64fbe'], ['dff814b2-90df-4043-aeb3-dd4e4df64fbe']), // 自由式 15 碼 ★
    s(['91e61121-5528-456b-9e7d-b97953ed0c39'], [ // 25 碼
      '91e61121-5528-456b-9e7d-b97953ed0c39',   // 自由式 25 碼 ★
      'ecbcc8c6-dedd-4ebf-8e48-b6eb53e17aeb',   // 自由式技術游（右二左二）
      '6b94b35a-4890-4ffb-ad7e-f8b630415c8b',   // 自由式技術游（單手轉肩游）
      'de640a60-96c1-4616-bcd2-f29f1aa61ed8']), // 自由式衝刺 25 碼
    s(['be760433-09d7-4cac-9863-fa758abc9009'], ['be760433-09d7-4cac-9863-fa758abc9009']), // 自由式 50 碼 ★
    s(['18a6462c-4c67-4e93-8838-8bc03717b463'], [ // 100 碼
      '18a6462c-4c67-4e93-8838-8bc03717b463',   // 自由式 100 碼 ★
      '22e00423-edc5-4626-8e7f-8bc4e846203f',   // 自由式翻滾轉身
      '456f3041-33b2-4583-9f0a-4543ca2464c0']), // 自由式 200 碼
    s(['c4b854b3-f337-4799-9631-33c6459951c6', 'c6c39234-8af8-47bb-b1d2-b33537efcf2b'], [ // 達標
      'c4b854b3-f337-4799-9631-33c6459951c6',   // 自由式 50 碼（計時） ★
      'c6c39234-8af8-47bb-b1d2-b33537efcf2b',   // 自由式 100 碼（計時） ★
      'a8d00e21-01af-4ad5-a90d-a7e8bd59e6a8']), // 自由式 500 碼
  ],
  bk: [
    s(['1b90e0d5-e21d-4991-9d97-a16394d3913b'], [ // 姿勢
      '84716c30-a569-4905-9970-855a998068e1',   // 輔助仰面漂浮
      '1b90e0d5-e21d-4991-9d97-a16394d3913b']), // 海星漂 10 秒 ★
    s(['4a0a72ff-a39f-404c-a40f-49b83b5ea4ff'], [ // 打水
      '77dcafb5-fee7-4fde-8020-9691b99f5064',   // 仰式打水 10 碼
      '4a0a72ff-a39f-404c-a40f-49b83b5ea4ff']), // 仰式打水 25 碼 ★
    s(['96c47b53-df33-4b4a-9a8e-a84eed10c7b8'], [ // 划手
      '96c47b53-df33-4b4a-9a8e-a84eed10c7b8',   // 仰式分解游 ★
      'd6b2ba7b-5a81-4247-8532-d9eb078f71bd',   // 側身六踢轉換
      '4093e9eb-c077-4efa-9dc7-2a8378163b2b']), // 單手仰式
    s(['c1a0c2d4-5e6f-4a81-8b92-0c1d2e3f4a61'], ['c1a0c2d4-5e6f-4a81-8b92-0c1d2e3f4a61']), // 仰式 15 碼 ★
    s(['6bf527f0-5e39-48bb-b975-6e29829b5d7c'], ['6bf527f0-5e39-48bb-b975-6e29829b5d7c']), // 仰式 25 碼 ★
    s(['97804fbb-13d4-4367-ab9d-0276b25591d6'], [ // 50 碼
      '97804fbb-13d4-4367-ab9d-0276b25591d6',   // 仰式 50 碼 ★
      '59628c84-eead-4393-9e2e-5774670383ca']), // 雙手仰式
    s(['fe6b4f6e-cfa9-4cfe-979a-6cd3cf6d5af9'], [ // 100 碼
      'fe6b4f6e-cfa9-4cfe-979a-6cd3cf6d5af9',   // 仰式 100 碼 ★
      '3e66c970-61b6-4189-9fa8-353809086556']), // 仰式翻滾轉身
    s(['73baf35a-1541-4d95-ade3-85cacd6dbf34', 'caf1da5f-3ff5-4d73-b479-6f0336dfdc36'], [ // 達標
      '73baf35a-1541-4d95-ade3-85cacd6dbf34',   // 仰式 50 碼（計時） ★
      'caf1da5f-3ff5-4d73-b479-6f0336dfdc36']), // 仰式 100 碼（計時） ★
  ],
  br: [
    // The glide is freestyle's streamline push-off: shared, so breaststroke
    // starts with this one already in hand.
    s(['89ca69a6-6f96-4c1d-a52d-6ba16edab33b'], []),
    s(['b02f51e3-1e69-487e-86b1-18e21ddb6812'], [ // 打水（蛙腿）
      'c820d2cd-86af-4412-a6bb-06f70a23ac22',   // 蛙腿分解練習
      'b02f51e3-1e69-487e-86b1-18e21ddb6812',   // 蛙腿 10 碼 ★
      'e858562b-a3aa-4875-84ef-e1f6875770e5']), // 蛙腿 25 碼
    s(['c69275d3-d60d-45a4-b3ef-6577d1c97eb2'], ['c69275d3-d60d-45a4-b3ef-6577d1c97eb2']), // 蛙式划手配呼吸 ★
    s(['ee7b11f4-bb68-4868-95c9-62270c9ae576'], [ // 會游
      'ee7b11f4-bb68-4868-95c9-62270c9ae576',   // 蛙式 10 碼 ★
      '0ff7355f-2cef-42b9-afa2-0749603d6c33',   // 開放式轉身
      '9f37e0f9-68d5-4bae-8349-c9d2d99d8225']), // 蛙式 15 碼
    s(['1b7d1a52-bac5-44a5-9bc4-18a7ab70903f'], ['1b7d1a52-bac5-44a5-9bc4-18a7ab70903f']), // 蛙式 25 碼 ★
    s(['8a650e1c-278e-4ddb-8069-f7495a620dde'], [ // 50 碼
      '8a650e1c-278e-4ddb-8069-f7495a620dde',   // 蛙式 50 碼 ★
      'f23977ee-2739-493a-b1f1-2547e29b5011',   // 蛙式技術游（一手兩腳）
      '01b6ee5e-44fc-40f5-a4ac-ebdc0cd6df36']), // 蛙式技術游（一蛙腳一蝶腳）
    s(['7665ebd2-eb5b-4b00-8ef2-d0ec1039be51'], ['7665ebd2-eb5b-4b00-8ef2-d0ec1039be51']), // 蛙式 100 碼（計時） ★
    s(['de916eb5-53b3-4ab3-b451-53f793a1666f', '7665ebd2-eb5b-4b00-8ef2-d0ec1039be51'], [ // 達標
      'de916eb5-53b3-4ab3-b451-53f793a1666f',   // 蛙式 50 碼（計時） ★
      'fb34523b-58c7-4e1f-9cef-a56ebea37757']), // 蛙式水下划手
  ],
  fl: [
    s(['5aa1716e-8d05-41b0-a660-7fce60b69390'], ['5aa1716e-8d05-41b0-a660-7fce60b69390']), // 海豚腿 10 碼（身體波浪） ★
    s(['327265d2-e212-4917-90d9-21daa2a5520e'], [ // 打水
      '327265d2-e212-4917-90d9-21daa2a5520e',   // 蝶式打水 25 碼 ★
      '2cd9fcb7-cb6d-4853-95c0-97f3acc443d7',   // 仰式蝶腳
      '61765b4c-fd81-458d-acb9-1f4c19201994']), // 水下海豚腿
    s(['6d6b06d9-7b44-4980-a1a6-a4ab887d5ede'], [ // 划手、換氣
      '8aadc967-9b3f-430b-b161-273001ffa21a',   // 自由式手＋蝶式打水
      '6d6b06d9-7b44-4980-a1a6-a4ab887d5ede']), // 單手蝶式 ★
    s(['31dc4fc7-ef0b-4e4c-a80c-419ceebc7360'], ['31dc4fc7-ef0b-4e4c-a80c-419ceebc7360']), // 蝶式 10 碼 ★
    s(['eb420091-b357-41af-892a-73a1059ecfda'], ['eb420091-b357-41af-892a-73a1059ecfda']), // 蝶式 25 碼 ★
    s(['e1283362-5c0d-475b-a9ae-9ea777f9ddba'], ['e1283362-5c0d-475b-a9ae-9ea777f9ddba']), // 蝶式 50 碼 ★
    s(['5e7e292d-e1b7-48de-a32d-24f698dcaae5'], ['5e7e292d-e1b7-48de-a32d-24f698dcaae5']), // 蝶式 100 碼（計時） ★
    s(['c9047d9f-1b91-4902-a4ce-33e303b4674b', '5e7e292d-e1b7-48de-a32d-24f698dcaae5'], [ // 達標
      'c9047d9f-1b91-4902-a4ce-33e303b4674b']), // 蝶式 50 碼（計時） ★
  ],
}

/** The medley skills: in no stroke's row. */
export const MEDLEY = ['b7525cfb-5d9b-43b2-9868-393578adf991', '58b20bb7-23a5-4ee2-affb-5f16284a7563', 'e9f7b834-3e50-446f-a775-33d547ba776b']

export type Cell = 'done' | 'now' | 'todo'
export type TrackRow = {
  id: TrackId
  cells: Cell[]
  /** Highest step done, -1 for none. */
  best: number
  /** The step being practised, -1 for none. */
  now: number
  /** Not reached yet: the level the track begins in. */
  waitLevel: number | null
}

/**
 * Where a swimmer is on each track. `levelOf` is every active skill's level;
 * a skill in a level below the swimmer's with nothing on file counts as passed
 * (they were placed or promoted past it -- the same rule as the skill tree).
 */
export function trackRows(levelOf: Record<string, number>, percent: Record<string, number>, currentLevel: number): Record<TrackId, TrackRow> {
  const pct = (id: string) => {
    const rec = percent[id]
    if (rec != null) return rec
    const lv = levelOf[id]
    return lv != null && lv < currentLevel ? 100 : 0
  }
  const out = {} as Record<TrackId, TrackRow>
  for (const id of Object.keys(TRACKS) as TrackId[]) {
    const steps = TRACKS[id]
    const own = steps.flatMap(st => st.skills).filter(k => levelOf[k] != null)
    const start = own.length ? Math.min(...own.map(k => levelOf[k])) : 1
    const touched = own.some(k => masteryOf(percent[k]) > 0)
    const done = steps.map(st => {
      const keys = st.keys.filter(k => levelOf[k] != null)
      return keys.length ? keys.every(k => masteryOf(pct(k)) >= PASS_LEVEL) : null
    })
    // A step whose key is not in the curriculum (yet) follows the step after it.
    for (let i = done.length - 1; i >= 0; i--) if (done[i] === null) done[i] = i + 1 < done.length ? !!done[i + 1] : false
    const eligible = (st: Step) => [...st.skills, ...st.keys].some(k =>
      (levelOf[k] != null && levelOf[k] <= currentLevel) || masteryOf(percent[k]) > 0)
    let now = -1
    if (touched || currentLevel >= start) now = steps.findIndex((st, i) => !done[i] && eligible(st))
    const cells: Cell[] = steps.map((_, i) => done[i] ? 'done' : i === now ? 'now' : 'todo')
    out[id] = {
      id, cells, now,
      best: done.lastIndexOf(true),
      waitLevel: !touched && currentLevel < start ? start : null,
    }
  }
  return out
}

/** Every skill of a track, step by step, for the detail page. */
export function trackSteps(id: TrackId) { return TRACKS[id] }
