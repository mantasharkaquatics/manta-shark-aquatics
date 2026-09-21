-- ============================================================
-- Manta Shark Aquatics — skills.name 只留英文
--
-- 規矩本來就是：skills.name 放英文，中文一律走 lib/i18n/locales/db-strings.json。
-- 但有 30 個技能的 name 後面被接上了中文（例如
-- 'Freestyle 500 yd 自由式 500 碼'），畫面上看不出來（db-strings 會蓋過去），
-- 資料本身是髒的。
--
-- 這份把全部 84 個在用的技能的 name 直接寫成 db-strings.json 裡的英文，
-- 不是用正則去砍尾巴 —— 這樣跑完之後 DB 和 db-strings 一定是一致的，
-- 而且重跑幾次結果都一樣。
--
-- 跑之前已經確認過：84 個技能都有三語翻譯，英文和中文名字都沒有重複。
-- 整份是一個 transaction。可重跑。
-- ============================================================
BEGIN;

SET LOCAL lock_timeout = '5s';

UPDATE public.skills SET name = 'Pool Safety Awareness' WHERE id = '3aa56665-8ce2-4524-819d-efcf30057a02';  -- L1 辨識泳池環境
UPDATE public.skills SET name = 'Safe Entry and Exit' WHERE id = 'f0b828a0-63a5-4aea-8000-13e1b05b1682';  -- L1 安全進出泳池
UPDATE public.skills SET name = 'Wall Traverse' WHERE id = 'a5ec094e-4338-4259-9e43-4b913cd02ca3';  -- L1 沿壁移動
UPDATE public.skills SET name = 'Flutter Kick on Deck' WHERE id = '2eb2c769-054f-4e44-9769-779c7972318b';  -- L1 岸上打水
UPDATE public.skills SET name = 'Mouth Bubbles at the Surface' WHERE id = '0d151d1b-8492-49bc-824e-c4e26a657046';  -- L1 水面嘴巴吐泡泡
UPDATE public.skills SET name = 'Water Walking' WHERE id = '58842492-eacd-4c4d-9506-a18e562c64b5';  -- L1 水中行走
UPDATE public.skills SET name = 'Assisted Back Float' WHERE id = '84716c30-a569-4905-9970-855a998068e1';  -- L1 輔助仰面漂浮
UPDATE public.skills SET name = 'Face in Water' WHERE id = '49f02c5d-009c-459c-8ef0-de2dad48c25d';  -- L1 面部入水
UPDATE public.skills SET name = 'Nose Bubbles' WHERE id = 'cdf91a82-3f78-4c32-9f11-7f73b5d3754a';  -- L1 水中鼻子吐泡泡
UPDATE public.skills SET name = 'Assisted Front Float' WHERE id = '92751613-6a3c-465f-bcdb-251754df1dff';  -- L1 面部入水漂浮
UPDATE public.skills SET name = 'Superman Glide' WHERE id = 'd6915327-5d9d-4907-be40-b59ad3536c8d';  -- L1 超人滑行
UPDATE public.skills SET name = 'Push-Off Float' WHERE id = 'b46c9773-7e09-4da4-8beb-d79050075710';  -- L2 蹬牆漂浮
UPDATE public.skills SET name = 'Breath Holding 5 sec' WHERE id = '084fe3dd-cbe3-485c-82d6-dcdd2cd56ae7';  -- L2 憋氣 5 秒
UPDATE public.skills SET name = 'Starfish Float 10 sec' WHERE id = '1b90e0d5-e21d-4991-9d97-a16394d3913b';  -- L2 海星漂 10 秒
UPDATE public.skills SET name = 'Freestyle Kick 10 yd (Board)' WHERE id = '4fd1fce7-9293-475e-a142-5a8d2ecf954d';  -- L2 自由式打水 10 碼（浮板）
UPDATE public.skills SET name = 'Jellyfish Float' WHERE id = '268cc43e-0038-4fa9-9f28-18fff4aedcca';  -- L2 水母漂
UPDATE public.skills SET name = 'Bubble Jumps (Chest Deep)' WHERE id = '35250d84-1461-4c39-85fc-7686d9576753';  -- L2 吐泡跳（胸深）
UPDATE public.skills SET name = 'Backstroke Kick 10 yd' WHERE id = '77dcafb5-fee7-4fde-8020-9691b99f5064';  -- L2 仰式打水 10 碼
UPDATE public.skills SET name = 'Sculling 5 yd' WHERE id = 'b1a0c2d4-5e6f-4a71-8b92-0c1d2e3f4a51';  -- L2 划手前進 5 碼
UPDATE public.skills SET name = 'Object Retrieval' WHERE id = 'ed0e69e4-3edb-4668-84d8-a39064fe2425';  -- L2 水中撿物
UPDATE public.skills SET name = 'Bubble Jumps (Over Head)' WHERE id = 'c7022acb-3075-471f-8c45-4d5330139369';  -- L2 吐泡跳（過頭深）
UPDATE public.skills SET name = 'Jump into Deep Water' WHERE id = '63f1fc23-f60a-4417-86e1-2d4dd2d191c3';  -- L2 跳入深水
UPDATE public.skills SET name = 'Freestyle Kick 25 yd' WHERE id = 'e8fd87dc-4e41-4ea5-adda-d8038881f573';  -- L3 自由式打水 25 碼
UPDATE public.skills SET name = 'Backstroke Kick 25 yd' WHERE id = '4a0a72ff-a39f-404c-a40f-49b83b5ea4ff';  -- L3 仰式打水 25 碼
UPDATE public.skills SET name = 'Streamline Push-Off' WHERE id = '89ca69a6-6f96-4c1d-a52d-6ba16edab33b';  -- L3 流線蹬牆
UPDATE public.skills SET name = 'Freestyle Kick 10 yd, No Board' WHERE id = '9ac7c46d-2f0f-495b-a0cc-95a13e6684fc';  -- L3 自由式打水 10 碼（無浮板抬頭換氣）
UPDATE public.skills SET name = 'Side Kick' WHERE id = '6d8d921a-e413-4bf9-81d6-a1930dab3404';  -- L3 側邊打水
UPDATE public.skills SET name = 'Dolphin Kick 10 yd' WHERE id = '5aa1716e-8d05-41b0-a660-7fce60b69390';  -- L3 海豚腿 10 碼
UPDATE public.skills SET name = 'Starfish Float 30 sec' WHERE id = '806e2b61-f66e-460b-b31b-264097fee097';  -- L3 海星漂 30 秒
UPDATE public.skills SET name = 'In-Water Turn' WHERE id = '7a62a560-01cd-4199-b464-68a78a8ee98a';  -- L3 水中轉身
UPDATE public.skills SET name = 'Roll-and-Breathe Swim 15 yd' WHERE id = '580a979a-e3f7-458f-b0f8-c39c7c20d686';  -- L3 側轉換氣游 15 碼
UPDATE public.skills SET name = 'BBQ Kick' WHERE id = 'ed4c463b-6c65-497b-b370-18e9bd945468';  -- L3 BBQ打水
UPDATE public.skills SET name = 'Deep Water Object Retrieval' WHERE id = '9194c9af-7e03-4d13-969b-4284d49b3a84';  -- L3 深水撿物
UPDATE public.skills SET name = 'Water Safety Test' WHERE id = '997642b0-c290-48cf-a53f-ccb46d52d539';  -- L3 水域安全測驗
UPDATE public.skills SET name = 'Freestyle 15 yd' WHERE id = 'dff814b2-90df-4043-aeb3-dd4e4df64fbe';  -- L4 自由式 15 碼
UPDATE public.skills SET name = 'Streamline Freestyle Kicking' WHERE id = '818b6b3b-63b9-4e13-9a52-f3f466f57cc7';  -- L4 流線自由式打水
UPDATE public.skills SET name = 'Backstroke Single-Arm Drill' WHERE id = '96c47b53-df33-4b4a-9a8e-a84eed10c7b8';  -- L4 仰式分解游
UPDATE public.skills SET name = 'Breaststroke Kick Drill' WHERE id = 'c820d2cd-86af-4412-a6bb-06f70a23ac22';  -- L4 蛙腿分解練習
UPDATE public.skills SET name = 'Freestyle 25 yd' WHERE id = '91e61121-5528-456b-9e7d-b97953ed0c39';  -- L4 自由式 25 碼
UPDATE public.skills SET name = 'Underwater Freestyle Kicking' WHERE id = '9722f505-b208-43dc-868d-495ba0f3c10e';  -- L4 水下自由式打水
UPDATE public.skills SET name = 'Backstroke 15 yd' WHERE id = 'c1a0c2d4-5e6f-4a81-8b92-0c1d2e3f4a61';  -- L4 仰式 15 碼
UPDATE public.skills SET name = 'Breaststroke Kick 10 yd' WHERE id = 'b02f51e3-1e69-487e-86b1-18e21ddb6812';  -- L4 蛙腿 10 碼
UPDATE public.skills SET name = 'Freestyle Drill: Two Right, Two Left' WHERE id = 'ecbcc8c6-dedd-4ebf-8e48-b6eb53e17aeb';  -- L4 自由式技術游（右二左二）
UPDATE public.skills SET name = 'Freestyle Drill: Single-Arm with Rotation' WHERE id = '6b94b35a-4890-4ffb-ad7e-f8b630415c8b';  -- L4 自由式技術游（單手轉肩游）
UPDATE public.skills SET name = 'Freestyle Sprint 25 yd' WHERE id = 'de640a60-96c1-4616-bcd2-f29f1aa61ed8';  -- L4 自由式衝刺 25 碼
UPDATE public.skills SET name = 'Backstroke 25 yd' WHERE id = '6bf527f0-5e39-48bb-b975-6e29829b5d7c';  -- L4 仰式 25 碼
UPDATE public.skills SET name = 'Butterfly Kick 25 yd' WHERE id = '327265d2-e212-4917-90d9-21daa2a5520e';  -- L4 蝶式打水 25 碼
UPDATE public.skills SET name = 'Freestyle 50 yd' WHERE id = 'be760433-09d7-4cac-9863-fa758abc9009';  -- L5 自由式 50 碼
UPDATE public.skills SET name = 'Freestyle Arms, Dolphin Kick' WHERE id = '8aadc967-9b3f-430b-b161-273001ffa21a';  -- L5 自手蝶腳
UPDATE public.skills SET name = 'Backstroke 50 yd' WHERE id = '97804fbb-13d4-4367-ab9d-0276b25591d6';  -- L5 仰式 50 碼
UPDATE public.skills SET name = 'Breaststroke Kick 25 yd' WHERE id = 'e858562b-a3aa-4875-84ef-e1f6875770e5';  -- L5 蛙腿 25 碼
UPDATE public.skills SET name = 'Freestyle 100 yd' WHERE id = '18a6462c-4c67-4e93-8838-8bc03717b463';  -- L5 自由式 100 碼
UPDATE public.skills SET name = 'Single-Arm Butterfly' WHERE id = '6d6b06d9-7b44-4980-a1a6-a4ab887d5ede';  -- L5 單手蝶式
UPDATE public.skills SET name = 'Backstroke Dolphin Kick' WHERE id = '2cd9fcb7-cb6d-4853-95c0-97f3acc443d7';  -- L5 仰式蝶腳
UPDATE public.skills SET name = 'Breaststroke 10 yd' WHERE id = 'ee7b11f4-bb68-4868-95c9-62270c9ae576';  -- L5 蛙式 10 碼
UPDATE public.skills SET name = 'Freestyle Flip Turn' WHERE id = '22e00423-edc5-4626-8e7f-8bc4e846203f';  -- L5 自由式翻滾轉身
UPDATE public.skills SET name = 'Single-Arm Backstroke' WHERE id = '4093e9eb-c077-4efa-9dc7-2a8378163b2b';  -- L5 單手仰式
UPDATE public.skills SET name = 'Double-Arm Backstroke' WHERE id = '59628c84-eead-4393-9e2e-5774670383ca';  -- L5 雙手仰式
UPDATE public.skills SET name = 'Backstroke Six-Kick Switch' WHERE id = 'd6b2ba7b-5a81-4247-8532-d9eb078f71bd';  -- L5 側身六踢轉換
UPDATE public.skills SET name = 'Open Turn' WHERE id = '0ff7355f-2cef-42b9-afa2-0749603d6c33';  -- L5 開放式轉身
UPDATE public.skills SET name = 'Underwater Dolphin Kick' WHERE id = '61765b4c-fd81-458d-acb9-1f4c19201994';  -- L6 水下海豚腿
UPDATE public.skills SET name = 'Butterfly 10 yd' WHERE id = '31dc4fc7-ef0b-4e4c-a80c-419ceebc7360';  -- L6 蝶式 10 碼
UPDATE public.skills SET name = 'Backstroke 100 yd' WHERE id = 'fe6b4f6e-cfa9-4cfe-979a-6cd3cf6d5af9';  -- L6 仰式 100 碼
UPDATE public.skills SET name = 'Breaststroke 15 yd' WHERE id = '9f37e0f9-68d5-4bae-8349-c9d2d99d8225';  -- L6 蛙式 15 碼
UPDATE public.skills SET name = 'Freestyle 200 yd' WHERE id = '456f3041-33b2-4583-9f0a-4543ca2464c0';  -- L6 自由式 200 碼
UPDATE public.skills SET name = 'Butterfly 25 yd' WHERE id = 'eb420091-b357-41af-892a-73a1059ecfda';  -- L6 蝶式 25 碼
UPDATE public.skills SET name = 'Backstroke Flip Turn' WHERE id = '3e66c970-61b6-4189-9fa8-353809086556';  -- L6 仰式翻滾轉身
UPDATE public.skills SET name = 'Breaststroke 25 yd' WHERE id = '1b7d1a52-bac5-44a5-9bc4-18a7ab70903f';  -- L6 蛙式 25 碼
UPDATE public.skills SET name = 'Individual Medley Kicking' WHERE id = 'b7525cfb-5d9b-43b2-9868-393578adf991';  -- L6 個人混合式打水
UPDATE public.skills SET name = 'Breaststroke Drill: One Pull, Two Kicks' WHERE id = 'f23977ee-2739-493a-b1f1-2547e29b5011';  -- L6 蛙式技術游（一手兩腳）
UPDATE public.skills SET name = 'Breaststroke Drill: Breast and Dolphin Kick' WHERE id = '01b6ee5e-44fc-40f5-a4ac-ebdc0cd6df36';  -- L6 蛙式技術游（一蛙腳一蝶腳）
UPDATE public.skills SET name = 'Freestyle 50 yd (B Standard)' WHERE id = 'c4b854b3-f337-4799-9631-33c6459951c6';  -- L7 自由式 50 碼（B 標）
UPDATE public.skills SET name = 'Backstroke 50 yd (B Standard)' WHERE id = '73baf35a-1541-4d95-ade3-85cacd6dbf34';  -- L7 仰式 50 碼（B 標）
UPDATE public.skills SET name = 'Breaststroke 50 yd (B Standard)' WHERE id = 'de916eb5-53b3-4ab3-b451-53f793a1666f';  -- L7 蛙式 50 碼（B 標）
UPDATE public.skills SET name = 'Butterfly 50 yd (B Standard)' WHERE id = 'c9047d9f-1b91-4902-a4ce-33e303b4674b';  -- L7 蝶式 50 碼（B 標）
UPDATE public.skills SET name = 'Freestyle 100 yd (B Standard)' WHERE id = 'c6c39234-8af8-47bb-b1d2-b33537efcf2b';  -- L7 自由式 100 碼（B 標）
UPDATE public.skills SET name = 'Backstroke 100 yd (B Standard)' WHERE id = 'caf1da5f-3ff5-4d73-b479-6f0336dfdc36';  -- L7 仰式 100 碼（B 標）
UPDATE public.skills SET name = 'Breaststroke 100 yd (B Standard)' WHERE id = '7665ebd2-eb5b-4b00-8ef2-d0ec1039be51';  -- L7 蛙式 100 碼（B 標）
UPDATE public.skills SET name = 'Butterfly 100 yd (B Standard)' WHERE id = '5e7e292d-e1b7-48de-a32d-24f698dcaae5';  -- L7 蝶式 100 碼（B 標）
UPDATE public.skills SET name = 'Stroke Transitions and Turns' WHERE id = '58b20bb7-23a5-4ee2-affb-5f16284a7563';  -- L7 泳式轉換與轉身
UPDATE public.skills SET name = 'Freestyle 500 yd' WHERE id = 'a8d00e21-01af-4ad5-a90d-a7e8bd59e6a8';  -- L7 自由式 500 碼
UPDATE public.skills SET name = 'Backstroke 200 yd' WHERE id = '840dbdc7-1774-46ce-95ca-fe2f87d23475';  -- L7 仰式 200 碼
UPDATE public.skills SET name = 'Breaststroke Underwater Pullout' WHERE id = 'fb34523b-58c7-4e1f-9cef-a56ebea37757';  -- L7 蛙式水下划手
UPDATE public.skills SET name = 'Individual Medley 100 yd' WHERE id = 'e9f7b834-3e50-446f-a775-33d547ba776b';  -- L7 個人混合式 100 碼

COMMIT;

-- ----------- 跑完的驗證 -----------
-- 這句應該 0 列（name 裡不該再有任何非 ASCII 字元）：
-- select l.level_number, s.name
--   from skills s join levels l on l.id = s.level_id
--  where s.is_active and s.name ~ '[^\x00-\x7F]'
--  order by l.level_number, s.stage, s.sort_order;

