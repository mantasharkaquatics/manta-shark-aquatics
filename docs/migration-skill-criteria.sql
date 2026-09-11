-- ===========================================================================
--  技能：可量測的名稱 + 通過標準
--  2026-09-09
--
--  問題不是分級的形狀，是「一個技能只有一個名字」。教練點 0/20/40/60/80/100
--  的時候，沒有任何地方定義 60% 是什麼意思，所以 A 教練的 60% 和 B 教練的
--  60% 不是同一件事 —— 家長看到的百分比因此不可比較。
--
--  兩件事一起解決：
--
--  1. 改名。自由式原本有十個技能叫 Basic / Advanced / Mastery / Proficiency /
--     Endurance / Advanced Endurance / Long Distance…，教練分不出哪個是哪個。
--     全部改成距離或時間，名字本身就是標準。順帶修掉 Mastery 排在
--     Proficiency 前面這個次序顛倒。
--
--  2. 加 pass_criteria 欄位，一句話寫清楚 100% 是什麼，顯示在教練評分的按鈕
--     旁邊 —— 寫在別的地方不會有人看。
--
--  技能 id 一個都沒動，所以每一筆 student_skill_progress 與家長看得到的歷史
--  紀錄全部原封不動保留。
--
--  只改名稱與新增欄位，不新增也不刪除任何技能。可重複執行。
--  跑之前：Supabase → Database → Backups 先備份。
-- ===========================================================================

BEGIN;

ALTER TABLE public.skills
  ADD COLUMN IF NOT EXISTS pass_criteria text;

COMMENT ON COLUMN public.skills.pass_criteria IS
  '這個技能算「100%」的條件，一句話。顯示在教練評分介面的按鈕旁邊。
   全校統一的六格階梯（0/20/40/60/80/100）定義見 docs/coaching-handbook.md。';

-- ---------- Level 1 — Water Discovery 認識水 ----------
UPDATE public.skills SET name = 'Safe Entry and Recognition', pass_criteria = 'Walks to the edge, waits for the coach, enters feet-first without being asked twice. 走到池邊會等教練，聽指令雙腳先入水，不用講第二次。'
  WHERE id = '3aa56665-8ce2-4524-819d-efcf30057a02';  -- L1S1.1 was: Safe Entry and Recognition
UPDATE public.skills SET name = 'Safe Exit', pass_criteria = 'Climbs out unaided using the ladder or the wall, on their own. 自己用扶梯或撐池邊上岸，全程不需要人扶。'
  WHERE id = 'f0b828a0-63a5-4aea-8000-13e1b05b1682';  -- L1S1.2 was: Safe Exit
UPDATE public.skills SET name = 'Wall Grasping', pass_criteria = 'Holds the wall unaided and moves along it 5 yd hand-over-hand. 自己抓牢池邊，沿著池壁換手移動 5 碼。'
  WHERE id = 'a5ec094e-4338-4259-9e43-4b913cd02ca3';  -- L1S1.3 was: Wall Grasping
UPDATE public.skills SET name = 'Water Walking', pass_criteria = 'Walks 10 yd in chest-deep water, upright, without holding anything. 胸深水中站直走 10 碼，全程不扶任何東西。'
  WHERE id = '58842492-eacd-4c4d-9506-a18e562c64b5';  -- L1S2.1 was: Water Walking
UPDATE public.skills SET name = 'Underwater Bubble Blowing', pass_criteria = 'Face in the water, blows bubbles from the mouth for 5 seconds without lifting the head. 臉入水用嘴吐泡泡 5 秒，中途不抬頭。'
  WHERE id = '0d151d1b-8492-49bc-824e-c4e26a657046';  -- L1S2.2 was: Underwater Bubble Blowing
UPDATE public.skills SET name = 'Flutter Kick on Deck 岸上打水', pass_criteria = 'Sitting on the edge, kicks from the hip with straight legs and pointed toes for 20 seconds. 坐池邊直腿繃腳尖、由髖部發力打水 20 秒。'
  WHERE id = '2eb2c769-054f-4e44-9769-779c7972318b';  -- L1S2.3 was: Kicking on Land
UPDATE public.skills SET name = 'Assisted Floating', pass_criteria = 'Floats on the back for 5 seconds with the coach supporting one hand only. 教練只用單手托著，仰漂 5 秒。'
  WHERE id = '92751613-6a3c-465f-bcdb-251754df1dff';  -- L1S3.1 was: Assisted Floating
UPDATE public.skills SET name = 'Float-to-Stand Transition', pass_criteria = 'From a front or back float, gets both feet under the body and stands up unaided. 從俯漂或仰漂自己把腳收到身體下方站起來，不需協助。'
  WHERE id = '52ad780b-a73d-418d-988f-f49651cbc088';  -- L1S3.2 was: Float-to-Stand Transition
UPDATE public.skills SET name = 'Superman Glide', pass_criteria = 'Pushes off the wall and glides face-down 5 yd, arms extended, no kicking. 蹬牆俯身滑行 5 碼，雙手伸直，不打水。'
  WHERE id = 'd6915327-5d9d-4907-be40-b59ad3536c8d';  -- L1S3.3 was: Superman Glide

-- ---------- Level 2 — Water Confidence 水中自在 ----------
UPDATE public.skills SET name = 'Freestyle Kick 10 yd (Board) 自由式打水 10 碼（浮板）', pass_criteria = 'Kicks 10 yd on a board, face in the water, legs long and from the hip. 扶浮板臉入水打水 10 碼，腿伸直、由髖部發力。'
  WHERE id = '4fd1fce7-9293-475e-a142-5a8d2ecf954d';  -- L2S1.1 was: Freestyle Kicking (Basic)
UPDATE public.skills SET name = 'Backstroke Kick 10 yd 仰式打水 10 碼', pass_criteria = 'Kicks 10 yd on the back, ears in the water, hips at the surface. 仰躺打水 10 碼，耳朵入水，臀部貼近水面。'
  WHERE id = '77dcafb5-fee7-4fde-8020-9691b99f5064';  -- L2S1.2 was: Backstroke Kicking (Basic)
UPDATE public.skills SET name = 'Push-Off Float', pass_criteria = 'Pushes off the wall into a front float and holds it 5 seconds before standing. 蹬牆進入俯漂，撐住 5 秒後才站起來。'
  WHERE id = 'b46c9773-7e09-4da4-8beb-d79050075710';  -- L2S1.3 was: Push-Off Float
UPDATE public.skills SET name = 'BBQ Roll (Body Rotation)', pass_criteria = 'While kicking, rolls from front to side to back and back again without stopping. 打水中由俯臥轉側身轉仰臥再轉回，中途不停。'
  WHERE id = 'ed4c463b-6c65-497b-b370-18e9bd945468';  -- L2S2.1 was: BBQ Roll (Body Rotation)
UPDATE public.skills SET name = 'Bubble Jumps (Chest Deep) 吐泡跳（胸深）', pass_criteria = 'Ten jumps in chest-deep water: submerge, blow out, surface, repeat rhythmically. 胸深水中連續十次：下沉、吐氣、浮起，有節奏不中斷。'
  WHERE id = '35250d84-1461-4c39-85fc-7686d9576753';  -- L2S2.2 was: Bubble Jumps (Basic)
UPDATE public.skills SET name = 'Breath Holding 5 sec 憋氣 5 秒', pass_criteria = 'Fully submerged, eyes open, holds 5 seconds and surfaces calmly. 全身入水睜眼憋 5 秒，起來時不慌張。'
  WHERE id = '084fe3dd-cbe3-485c-82d6-dcdd2cd56ae7';  -- L2S2.3 was: Underwater Breath Holding
UPDATE public.skills SET name = 'Object Retrieval', pass_criteria = 'Retrieves an object from the bottom in chest-deep water, first try. 胸深水中一次就把池底的物品撿起來。'
  WHERE id = 'ed0e69e4-3edb-4668-84d8-a39064fe2425';  -- L2S3.1 was: Object Retrieval
UPDATE public.skills SET name = 'Starfish Float 10 sec 大字漂 10 秒', pass_criteria = 'Back float, arms and legs spread, 10 seconds unaided and unmoving. 仰躺手腳張開漂 10 秒，無人協助、身體不掙扎。'
  WHERE id = '1b90e0d5-e21d-4991-9d97-a16394d3913b';  -- L2S3.2 was: Starfish Float (Basic)
UPDATE public.skills SET name = 'Bubble Jumps (Over Head) 吐泡跳（過頭深）', pass_criteria = 'Same as chest-deep but in water over their head, ten times, holding the wall. 同上，但在過頭深的水中扶牆連續十次。'
  WHERE id = 'c7022acb-3075-471f-8c45-4d5330139369';  -- L2S3.3 was: Bubble Jumps (Advanced)
UPDATE public.skills SET name = 'Sculling 5 yd 划手前進 5 碼', pass_criteria = 'Sculls the hands figure-of-eight and travels 5 yd on the back without kicking. 仰躺以八字划手前進 5 碼，完全不打水。'
  WHERE id = 'b1a0c2d4-5e6f-4a71-8b92-0c1d2e3f4a51';  -- L2S3.4 was: Sculling (Basic)

-- ---------- Level 3 — Independent Movement 獨立前進 ----------
UPDATE public.skills SET name = 'Freestyle Kick 25 yd 自由式打水 25 碼', pass_criteria = 'Kicks 25 yd on a board with side breathing, no standing up. 扶板打水 25 碼並側轉換氣，中途不站起來。'
  WHERE id = 'e8fd87dc-4e41-4ea5-adda-d8038881f573';  -- L3S1.1 was: Freestyle Kicking (Advanced)
UPDATE public.skills SET name = 'Backstroke Kick 25 yd 仰式打水 25 碼', pass_criteria = 'Kicks 25 yd on the back, arms at the sides, staying in a straight line. 仰躺打水 25 碼，雙手貼身，能維持直線。'
  WHERE id = '4a0a72ff-a39f-404c-a40f-49b83b5ea4ff';  -- L3S1.2 was: Backstroke Kicking (Advanced)
UPDATE public.skills SET name = 'Streamline Push-Off', pass_criteria = 'Push-off in a tight streamline and glides 7 yd before the first kick. 蹬牆做出緊實的流線型，滑行 7 碼才開始打水。'
  WHERE id = '89ca69a6-6f96-4c1d-a52d-6ba16edab33b';  -- L3S1.3 was: Streamline Push-Off
UPDATE public.skills SET name = 'Treading Water 30 sec 踩水 30 秒', pass_criteria = 'Treads water 30 seconds in deep water, chin clear, without touching the wall. 深水踩水 30 秒，下巴離開水面，不碰池壁。'
  WHERE id = '4dd3928b-8433-40c4-8057-29b454ce5a03';  -- L3S2.1 was: Treading Water (Basic)
UPDATE public.skills SET name = 'Deep Water Object Retrieval', pass_criteria = 'Retrieves an object from the bottom of deep water and returns to the wall. 從深水池底撿起物品並游回池邊。'
  WHERE id = '9194c9af-7e03-4d13-969b-4284d49b3a84';  -- L3S2.2 was: Deep Water Object Retrieval
UPDATE public.skills SET name = 'Water Safety Test', pass_criteria = 'Jump in, turn around, swim 5 yd back to the wall and climb out unaided. 跳入水中轉身，游 5 碼回到池邊並自行上岸。'
  WHERE id = '997642b0-c290-48cf-a53f-ccb46d52d539';  -- Water Safety Test (moved to stage 3 below)
UPDATE public.skills SET name = 'Survival Float', pass_criteria = 'Survival float face-down for 1 minute, lifting the head only to breathe. 俯漂求生 1 分鐘，只在換氣時抬頭。'
  WHERE id = 'b2a0c2d4-5e6f-4a72-8b92-0c1d2e3f4a52';  -- Survival Float (renumbered below)
UPDATE public.skills SET name = 'Roll-and-Breathe Swim 15 yd 側轉換氣游 15 碼', pass_criteria = 'Swims 15 yd rolling front-to-side to breathe, without stopping. 游 15 碼，用俯臥轉側身的方式換氣，中途不停。'
  WHERE id = '580a979a-e3f7-458f-b0f8-c39c7c20d686';  -- L3S3.1 was: BBQ Swim Technique
UPDATE public.skills SET name = 'In-Water Turn', pass_criteria = 'Swims to the wall, turns without standing, and pushes off the other way. 游到池邊不站起來直接轉身，蹬牆往回。'
  WHERE id = '7a62a560-01cd-4199-b464-68a78a8ee98a';  -- L3S3.2 was: In-Water Turn
UPDATE public.skills SET name = 'Dolphin Kick 10 yd 海豚腿 10 碼', pass_criteria = 'Dolphin kicks 10 yd on the front, the wave starting at the chest not the knees. 俯身海豚腿 10 碼，波浪從胸口帶動而不是折膝。'
  WHERE id = '5aa1716e-8d05-41b0-a660-7fce60b69390';  -- L3S3.3 was: Butterfly Kicking (Basic)

-- ---------- Level 4 — Stroke Foundations 泳姿基礎 ----------
UPDATE public.skills SET name = 'Freestyle 15 yd 自由式 15 碼', pass_criteria = 'Swims 15 yd freestyle, side breathing, arms recovering over the water. 自由式 15 碼，側轉換氣，手臂從水面上方回復。'
  WHERE id = 'dff814b2-90df-4043-aeb3-dd4e4df64fbe';  -- L4S1.1 was: Freestyle (Basic)
UPDATE public.skills SET sort_order = 1 WHERE id = 'dff814b2-90df-4043-aeb3-dd4e4df64fbe';  -- was tied at 2 with Freestyle 25 yd
UPDATE public.skills SET name = 'Freestyle 25 yd 自由式 25 碼', pass_criteria = 'Swims 25 yd freestyle without stopping, breathing to one side every 2-3 strokes. 自由式 25 碼不停，每 2–3 划固定單邊換氣。'
  WHERE id = '91e61121-5528-456b-9e7d-b97953ed0c39';  -- L4S1.2 was: Freestyle (Advanced)
UPDATE public.skills SET name = 'Seated and Kneeling Dive', pass_criteria = 'Enters head-first from sitting and then from kneeling, hands leading, without belly-flopping. 坐姿與跪姿入水，雙手先入、頭跟著進，不拍肚子。'
  WHERE id = 'b3a0c2d4-5e6f-4a73-8b92-0c1d2e3f4a53';  -- L4S1.3 was: Seated and Kneeling Dive
UPDATE public.skills SET name = 'Backstroke 15 yd 仰式 15 碼', pass_criteria = 'Swims 15 yd backstroke, hips up, arms straight past the ear. 仰式 15 碼，臀部不下沉，手臂伸直貼耳過頭。'
  WHERE id = '96c47b53-df33-4b4a-9a8e-a84eed10c7b8';  -- L4S2.1 was: Backstroke (Basic)
UPDATE public.skills SET name = 'Streamline Freestyle Kicking', pass_criteria = 'Kicks 25 yd in a tight streamline, both arms overhead, face down. 流線型雙手過頭夾緊，臉朝下打水 25 碼。'
  WHERE id = '818b6b3b-63b9-4e13-9a52-f3f466f57cc7';  -- L4S2.2 was: Streamline Freestyle Kicking
UPDATE public.skills SET name = 'Underwater Freestyle Kicking', pass_criteria = 'Kicks 10 yd fully underwater in streamline on one breath. 一口氣在水面下以流線型打水 10 碼。'
  WHERE id = '9722f505-b208-43dc-868d-495ba0f3c10e';  -- L4S2.3 was: Underwater Freestyle Kicking
UPDATE public.skills SET name = 'Starfish Float 30 sec 大字漂 30 秒', pass_criteria = 'Back float 30 seconds in deep water, relaxed, without sculling. 深水仰躺大字漂 30 秒，放鬆、不靠划手。'
  WHERE id = '806e2b61-f66e-460b-b31b-264097fee097';  -- L4S3.1 was: Starfish Float (Advanced)
UPDATE public.skills SET name = 'Treading Water 1 min 踩水 1 分鐘', pass_criteria = 'Treads water 1 minute in deep water with hands out of the water for the last 10 seconds. 深水踩水 1 分鐘，最後 10 秒雙手離開水面。'
  WHERE id = 'b4e9ff8e-535c-4e5e-bc9a-8ceb9c252113';  -- L4S3.2 was: Treading Water (Advanced)
UPDATE public.skills SET name = 'No-Goggles Swim', pass_criteria = 'Swims 25 yd freestyle with no goggles, eyes open, without panicking. 不戴蛙鏡睜眼游自由式 25 碼，過程不慌張。'
  WHERE id = '95bf3bc3-79b3-48a4-9a90-cf53103ca965';  -- L4S3.3 was: No-Goggles Swim
UPDATE public.skills SET name = 'Clothed Swim (7 yd)', pass_criteria = 'Swims 7 yd in a T-shirt and shorts, then removes the shirt in deep water. 穿 T 恤與短褲游 7 碼，接著在深水中脫掉上衣。'
  WHERE id = '81568486-d273-49b0-a824-d53569fefc37';  -- L4S3.4 was: Clothed Swim (7 yd)

-- ---------- Level 5 — Stroke Development 泳姿發展 ----------
UPDATE public.skills SET name = 'Freestyle 50 yd 自由式 50 碼', pass_criteria = 'Swims 50 yd freestyle with one wall turn, stroke holding together throughout. 自由式 50 碼含一次轉身，全程動作不散。'
  WHERE id = 'be760433-09d7-4cac-9863-fa758abc9009';  -- L5S1.1 was: Freestyle (Mastery)
UPDATE public.skills SET name = 'Freestyle 100 yd 自由式 100 碼', pass_criteria = 'Swims 100 yd freestyle continuous, bilateral breathing available if asked. 連續自由式 100 碼，教練要求時能做兩側換氣。'
  WHERE id = '18a6462c-4c67-4e93-8838-8bc03717b463';  -- L5S1.2 was: Freestyle (Proficiency)
UPDATE public.skills SET name = 'Backstroke 25 yd 仰式 25 碼', pass_criteria = 'Swims 25 yd backstroke without stopping, shoulders rolling, head still. 仰式 25 碼不停，肩膀有轉動、頭部穩定。'
  WHERE id = 'daefdc4c-aa3f-4df6-b001-4e95569c4d78';  -- L5S2.1 was: Backstroke (Advanced)
UPDATE public.skills SET name = 'Backstroke 50 yd 仰式 50 碼', pass_criteria = 'Swims 50 yd backstroke with one turn, staying in the lane. 仰式 50 碼含一次轉身，能維持在水道內。'
  WHERE id = '97804fbb-13d4-4367-ab9d-0276b25591d6';  -- L5S2.2 was: Backstroke (Mastery)
UPDATE public.skills SET name = 'Freestyle Flip Turn', pass_criteria = 'Approaches the wall, somersaults, plants both feet and pushes off on the back into streamline. 接近池壁前滾翻，雙腳踏牆，以仰姿流線型蹬出。'
  WHERE id = '22e00423-edc5-4626-8e7f-8bc4e846203f';  -- L5S2.3 was: Freestyle Flip Turn
UPDATE public.skills SET name = 'Surface Dive', pass_criteria = 'Surface dives head-first to the bottom of deep water and returns with an object. 頭下腳上潛入深水池底，帶物品回到水面。'
  WHERE id = 'b4a0c2d4-5e6f-4a74-8b92-0c1d2e3f4a54';  -- L5S2.4 was: Surface Dive
UPDATE public.skills SET name = 'Breaststroke Kick 10 yd 蛙腿 10 碼', pass_criteria = 'Kicks 10 yd on a board: heels to seat, feet turned out, whip together. 扶板蛙腿 10 碼：收腿到臀、翻腳掌、夾水併攏。'
  WHERE id = 'b02f51e3-1e69-487e-86b1-18e21ddb6812';  -- L5S3.1 was: Breaststroke Kick (Basic)
UPDATE public.skills SET name = 'Breaststroke Kick 25 yd 蛙腿 25 碼', pass_criteria = 'Kicks 25 yd breaststroke with a glide after every kick, no scissor kick. 蛙腿 25 碼，每一蹬後有滑行，沒有剪刀腳。'
  WHERE id = 'e858562b-a3aa-4875-84ef-e1f6875770e5';  -- L5S3.2 was: Breaststroke Kick (Advanced)
UPDATE public.skills SET name = 'Dolphin Kick 25 yd 海豚腿 25 碼', pass_criteria = 'Dolphin kicks 25 yd on the front with a board, wave from the chest. 扶板俯身海豚腿 25 碼，波浪由胸口帶動。'
  WHERE id = '327265d2-e212-4917-90d9-21daa2a5520e';  -- L5S3.3 was: Butterfly Kicking (Advanced)
UPDATE public.skills SET name = 'Breath Holding 15 sec 憋氣 15 秒', pass_criteria = 'Holds 15 seconds submerged, calm, and surfaces under control. 水下憋氣 15 秒，全程平靜，起身有控制。'
  WHERE id = '0b50339e-3764-40f3-8d12-fa53502831ec';  -- L5S3.4 was: Underwater Breath Holding (Advanced)
UPDATE public.skills SET name = 'Reach and Throw Rescue', pass_criteria = 'Reaches with a pole and throws a ring to a person 5 yd away, staying out of the water. 用長桿伸給對方、把浮圈丟到 5 碼外，自己不下水。'
  WHERE id = 'b5a0c2d4-5e6f-4a75-8b92-0c1d2e3f4a55';  -- L5S3.5 was: Reach and Throw Rescue

-- ---------- Level 6 — Four Strokes 四式完成 ----------
UPDATE public.skills SET name = 'Butterfly 10 yd 蝶式 10 碼', pass_criteria = 'Swims 10 yd butterfly, two kicks per arm cycle, chin leading the breath. 蝶式 10 碼，一划兩踢，換氣時下巴先出水。'
  WHERE id = '31dc4fc7-ef0b-4e4c-a80c-419ceebc7360';  -- L6S1.1 was: Butterfly (Basic)
UPDATE public.skills SET name = 'Breaststroke 15 yd 蛙式 15 碼', pass_criteria = 'Swims 15 yd breaststroke in pull-breathe-kick-glide order. 蛙式 15 碼，保持「划、吸、蹬、滑」的順序。'
  WHERE id = '9f37e0f9-68d5-4bae-8349-c9d2d99d8225';  -- L6S1.2 was: Breaststroke (Basic)
UPDATE public.skills SET name = 'Individual Medley Kicking', pass_criteria = 'Kicks 25 yd of each stroke in IM order without a break between them. 依混合式順序各打水 25 碼，四式之間不休息。'
  WHERE id = 'b7525cfb-5d9b-43b2-9868-393578adf991';  -- L6S1.3 was: Individual Medley Kicking
UPDATE public.skills SET name = 'Treading Water 2 min 踩水 2 分鐘', pass_criteria = 'Treads water 2 minutes in deep water, last 30 seconds hands out of the water. 深水踩水 2 分鐘，最後 30 秒雙手離開水面。'
  WHERE id = '3c01a30f-147d-4880-9738-75c245fc3325';  -- L6S1.4 was: Treading Water (Proficient)
UPDATE public.skills SET name = 'Freestyle 200 yd 自由式 200 碼', pass_criteria = 'Swims 200 yd freestyle continuous with even pacing, turns included. 連續自由式 200 碼含轉身，配速平均不前快後崩。'
  WHERE id = '456f3041-33b2-4583-9f0a-4543ca2464c0';  -- L6S2.1 was: Freestyle (Endurance)
UPDATE public.skills SET name = 'Backstroke 100 yd 仰式 100 碼', pass_criteria = 'Swims 100 yd backstroke continuous, straight, with turns. 連續仰式 100 碼含轉身，能維持直線。'
  WHERE id = 'fe6b4f6e-cfa9-4cfe-979a-6cd3cf6d5af9';  -- L6S2.2 was: Backstroke (Proficiency)
UPDATE public.skills SET name = 'Backstroke Flip Turn', pass_criteria = 'Rolls to the front, somersaults and pushes off on the back, all within the legal one stroke. 轉為俯臥後前滾翻，以仰姿蹬牆，動作在規則允許的一划內完成。'
  WHERE id = '3e66c970-61b6-4189-9fa8-353809086556';  -- L6S2.3 was: Backstroke Flip Turn
UPDATE public.skills SET name = 'Standing Dive', pass_criteria = 'Standing dive from the edge: enters through one hole, hands first, no belly-flop. 站姿跳水：雙手先入，身體從同一個入水點進去，不拍肚子。'
  WHERE id = 'b6a0c2d4-5e6f-4a76-8b92-0c1d2e3f4a56';  -- L6S2.4 was: Standing Dive
UPDATE public.skills SET name = 'Butterfly 25 yd 蝶式 25 碼', pass_criteria = 'Swims 25 yd butterfly without stopping, rhythm holding to the wall. 蝶式 25 碼不停，節奏維持到觸壁。'
  WHERE id = 'eb420091-b357-41af-892a-73a1059ecfda';  -- L6S3.1 was: Butterfly (Advanced)
UPDATE public.skills SET name = 'Breaststroke 25 yd 蛙式 25 碼', pass_criteria = 'Swims 25 yd breaststroke with a visible glide every stroke. 蛙式 25 碼，每一循環都看得到滑行。'
  WHERE id = '1b7d1a52-bac5-44a5-9bc4-18a7ab70903f';  -- L6S3.2 was: Breaststroke (Advanced)
UPDATE public.skills SET name = 'Underwater Dolphin Kick', pass_criteria = 'Dolphin kicks 15 yd underwater off the wall on one breath. 蹬牆後一口氣在水面下海豚腿 15 碼。'
  WHERE id = '61765b4c-fd81-458d-acb9-1f4c19201994';  -- L6S3.3 was: Underwater Dolphin Kick
UPDATE public.skills SET name = 'Open Turn', pass_criteria = 'Two-hand touch, open turn and push-off for breaststroke and butterfly. 蛙式與蝶式的雙手觸壁、平轉身並蹬牆。'
  WHERE id = '0ff7355f-2cef-42b9-afa2-0749603d6c33';  -- L6S3.4 was: Open Turn
UPDATE public.skills SET name = 'Clothed Swim (25 yd)', pass_criteria = 'Swims 25 yd clothed without goggles, then treads 1 minute still clothed. 著衣不戴蛙鏡游 25 碼，接著著衣踩水 1 分鐘。'
  WHERE id = 'e9374f19-259b-4c49-85c2-a6faebae05e9';  -- L6S3.5 was: Clothed Swim (25 yd)

-- ---------- Level 7 — Competitive Swimming 競技規格 ----------
UPDATE public.skills SET name = 'Freestyle 50 yd Timed 自由式 50 碼計時', pass_criteria = 'Swims 50 yd freestyle on the clock and improves the time over three attempts. 自由式 50 碼計時，三次測驗內成績有進步。'
  WHERE id = 'c4b854b3-f337-4799-9631-33c6459951c6';  -- L7S1.1 was: Freestyle (Timed)
UPDATE public.skills SET name = 'Freestyle 25 yd Sprint 自由式 25 碼衝刺', pass_criteria = 'All-out 25 yd freestyle with no breath in the last 5 yd. 自由式 25 碼全力衝刺，最後 5 碼不換氣。'
  WHERE id = '0280911e-9a79-4eed-8916-883e64dee3de';  -- L7S1.2 was: Freestyle (Sprint)
UPDATE public.skills SET name = 'Freestyle 400 yd 自由式 400 碼', pass_criteria = 'Swims 400 yd freestyle continuous, pace held within 5 seconds per 50. 連續自由式 400 碼，每 50 碼配速差距在 5 秒內。'
  WHERE id = 'eaa47012-b0e4-4e77-ba05-f87b6acc80db';  -- L7S1.3 was: Freestyle (Advanced Endurance)
UPDATE public.skills SET name = 'Backstroke 200 yd 仰式 200 碼', pass_criteria = 'Swims 200 yd backstroke continuous with legal turns. 連續仰式 200 碼，轉身合乎規則。'
  WHERE id = '840dbdc7-1774-46ce-95ca-fe2f87d23475';  -- L7S1.4 was: Backstroke (Endurance)
UPDATE public.skills SET name = 'Clothed Swim (50 yd)', pass_criteria = 'Swims 50 yd clothed without goggles, then removes clothing while treading. 著衣不戴蛙鏡游 50 碼，接著在踩水中脫掉衣物。'
  WHERE id = '91adaea7-aefa-432c-8b9a-44ca43976bdb';  -- L7S1.5 was: Clothed Swim (50 yd)
UPDATE public.skills SET name = 'Breaststroke Underwater Pullout', pass_criteria = 'One pull-down: full pull to the thighs, one dolphin kick, recovery, break out. 一次水下划手：長划到大腿、一次海豚腿、收手、破水。'
  WHERE id = 'fb34523b-58c7-4e1f-9cef-a56ebea37757';  -- L7S2.1 was: Breaststroke Underwater Pullout
UPDATE public.skills SET name = 'Breaststroke 50 yd 蛙式 50 碼', pass_criteria = 'Swims 50 yd breaststroke with a legal turn and a legal finish. 蛙式 50 碼，轉身與終點觸壁都合乎規則。'
  WHERE id = 'de916eb5-53b3-4ab3-b451-53f793a1666f';  -- L7S2.2 was: Breaststroke (Mastery)
UPDATE public.skills SET name = 'Butterfly 50 yd 蝶式 50 碼', pass_criteria = 'Swims 50 yd butterfly with a legal turn, rhythm intact on the second length. 蝶式 50 碼含合規轉身，第二趟節奏沒有垮掉。'
  WHERE id = 'c9047d9f-1b91-4902-a4ce-33e303b4674b';  -- L7S2.3 was: Butterfly (Mastery)
UPDATE public.skills SET name = 'Freestyle 500 yd 自由式 500 碼', pass_criteria = 'Swims 500 yd freestyle continuous, counting their own laps. 連續自由式 500 碼，能自己數趟數。'
  WHERE id = 'a8d00e21-01af-4ad5-a90d-a7e8bd59e6a8';  -- L7S2.4 was: Freestyle (Long Distance)
UPDATE public.skills SET name = 'Racing Start and Backstroke Start', pass_criteria = 'Legal racing start from the block and a legal backstroke start from the wall. 出發台合規出發，以及池壁的合規仰式出發。'
  WHERE id = 'b7a0c2d4-5e6f-4a77-8b92-0c1d2e3f4a57';  -- L7S2.5 was: Racing Start and Backstroke Start
UPDATE public.skills SET name = 'Stroke Transitions and Turns', pass_criteria = 'Legal transitions between all four strokes plus every turn in an IM. 四式之間的合規銜接，以及混合式中的每一種轉身。'
  WHERE id = '58b20bb7-23a5-4ee2-affb-5f16284a7563';  -- L7S3.1 was: Stroke Transitions and Turns
UPDATE public.skills SET name = 'Individual Medley 100 yd 個人混合式 100 碼', pass_criteria = 'Swims 100 yd IM in stroke order with legal transitions throughout. 依序完成混合式 100 碼，每一次銜接都合規。'
  WHERE id = 'e9f7b834-3e50-446f-a775-33d547ba776b';  -- L7S3.2 was: Individual Medley
UPDATE public.skills SET name = 'Freestyle (Race Legal) 自由式（合規）', pass_criteria = 'Freestyle that would not be disqualified: legal turn, legal finish, no walking. 自由式的動作、轉身與終點都不會被判失格。'
  WHERE id = '6d6b6afb-ed92-47b1-b557-52904c7931ab';  -- L7S3.3 was: Freestyle (Competitive)
UPDATE public.skills SET name = 'Backstroke (Race Legal) 仰式（合規）', pass_criteria = 'Backstroke that would not be disqualified: stays on the back, legal turn and finish. 仰式全程保持仰姿，轉身與終點合規、不會失格。'
  WHERE id = '11f3d107-8ea1-43f9-9301-3875cd71dad0';  -- L7S3.4 was: Backstroke (Competitive)
UPDATE public.skills SET name = 'Breaststroke (Race Legal) 蛙式（合規）', pass_criteria = 'Breaststroke that would not be disqualified: symmetric, one pull one kick, two-hand touch. 蛙式左右對稱、一划一蹬、雙手同時觸壁，不會失格。'
  WHERE id = '1ed417e9-431d-46db-837b-adabbdde74f3';  -- L7S3.5 was: Breaststroke (Competitive)
UPDATE public.skills SET name = 'Butterfly (Race Legal) 蝶式（合規）', pass_criteria = 'Butterfly that would not be disqualified: simultaneous arms, no flutter kick, two-hand touch. 蝶式雙臂同時、無自由式打水、雙手同時觸壁，不會失格。'
  WHERE id = 'b617a73c-8da4-4526-9420-58ed4c682a94';  -- L7S3.6 was: Butterfly (Competitive)

-- ---------- Level 3 順序調整 ----------
--  Water Safety Test 是 Level 3 的綜合驗收，不是一個練習項目：跳入水中、
--  轉身、游回池邊、自行上岸，一次做完。它原本排在階段 2 的中間，等於要求
--  學員在還沒學會「不站起來轉身」（階段 3）之前就做完整的落水演練。
--
--  移到階段 3 的最後一個，讓 Level 3 的形狀變成：
--    階段 1  打水與流線型 —— 把身體練成能前進的形狀
--    階段 2  踩水、深水撿物、求生漂 —— 深水的三項基本能力
--    階段 3  側轉換氣游、水中轉身、海豚腿，最後綜合驗收
--
--  注意：階段 2 從四個技能變成三個，所以那一階段的百分比分母跟著變。
--  已經在 Level 3 的學員，進度會重算 —— 分數本身一個都沒有動。
UPDATE public.skills SET stage = 3, sort_order = 4 WHERE id = '997642b0-c290-48cf-a53f-ccb46d52d539';  -- Water Safety Test
UPDATE public.skills SET stage = 2, sort_order = 3 WHERE id = 'b2a0c2d4-5e6f-4a72-8b92-0c1d2e3f4a52';  -- Survival Float

-- 順序改了之後，把 Level 3 學員停留的階段重新對齊到「第一個還沒完成的階段」。
-- 沒有任何技能分數被更動，只是重新指出他們現在該在哪一格。
UPDATE public.students s SET current_stage = COALESCE((
    SELECT MIN(sk.stage) FROM public.skills sk
    JOIN public.levels l ON l.id = sk.level_id
    WHERE l.level_number = 3 AND sk.is_active
      AND NOT EXISTS (SELECT 1 FROM public.student_skill_progress ssp
                      WHERE ssp.student_id = s.id AND ssp.skill_id = sk.id
                        AND ssp.progress_percent = 100)
  ), 3)
  WHERE s.current_level = 3;

-- ---------- L4–L7 對照三套美國系統後的調整 ----------
--  參考：American Red Cross Learn-to-Swim（L4–L6）、YMCA Swim Lessons
--  （Stage 3–6）、SwimAmerica 的 station 精熟制，以及紅十字會的
--  「水中自保五項」全美基準。
--
--  三件事：
--
--  1. 平轉身移到翻滾轉身之前。原本 Open Turn 在 L6 階段 3，Freestyle Flip
--     Turn 卻在 L5 階段 2 —— 先教了進階的，一年後才補通用的。Red Cross 與
--     YMCA 都是先 open 後 flip。平轉身四式都用得到，也是翻滾失敗時的退路。
--
--     連帶後果：原本那個技能的標準寫的是「蛙式與蝶式的雙手觸壁」，而那兩種
--     泳姿要 L6 才教。移到 L5 就必須改寫成自由式與仰式的平轉身，否則蛙蝶的
--     雙手觸壁規則會憑空消失 —— 所以在 L6 補回一個專講雙手觸壁的技能。
--
--  2. 補上省力泳姿。整套課程沒有任何低耗能、臉朝上的泳姿，但 L7 要求 400
--     與 500 碼自由式 —— 學員累的時候無泳姿可換。Red Cross 從 L4 就教初級
--     仰泳，其 L6 出關標準是「任選三式 500 碼，每式至少 50 碼」：多樣性本身
--     就是耐力。位置與 Red Cross L4 一致。
--
--  3. 補上 25 碼的水中自保驗收。L3 的版本是 5 碼；紅十字會的全美基準是深水
--     25 碼。那個距離才是家長聽得懂的那句話 ——「已達紅十字會水中自保標準」。
--     放在 L4 階段 3 最後，當作該級的綜合驗收。
--
--  刻意沒有跟進的一項：側泳。Red Cross 有，但 YMCA 已將它移出核心階段，
--  競技游泳也不使用。加了只是多一個技能。

-- 1a. 平轉身移到 L5，範圍改成自由式與仰式
UPDATE public.skills SET
  stage = 2, sort_order = 3,
  level_id = '83479c5f-2ca6-45db-a09b-d2aaa919162b',
  name = 'Open Turn (Free & Back) 平轉身（自由式與仰式）',
  pass_criteria = 'Swims into the wall, touches, turns and pushes off without stopping, in both freestyle and backstroke. 自由式與仰式都能游到池邊觸壁、轉身、蹬牆，中途不停。'
  WHERE id = '0ff7355f-2cef-42b9-afa2-0749603d6c33';
-- Surface Dive 遞補到 L5 階段 2 的第五個（原本第四）
UPDATE public.skills SET sort_order = 5 WHERE id = 'b4a0c2d4-5e6f-4a74-8b92-0c1d2e3f4a54';
-- Freestyle Flip Turn 排在平轉身之後
UPDATE public.skills SET sort_order = 4 WHERE id = '22e00423-edc5-4626-8e7f-8bc4e846203f';

-- 1b. L6 補回蛙蝶的雙手觸壁
INSERT INTO public.skills (id, level_id, name, stage, sort_order, is_active, pass_criteria) VALUES
  ('c3a0c2d4-5e6f-4a83-8b92-0c1d2e3f4a63', '627c3128-814c-481c-9925-7b435a2a6dc4', 'Two-Hand Touch Turn 雙手觸壁轉身', 3, 4, true,
   'Turns at the wall in breaststroke and butterfly with both hands touching at the same time. 蛙式與蝶式在池邊轉身時雙手同時觸壁。')
  ON CONFLICT (id) DO UPDATE SET level_id = EXCLUDED.level_id, name = EXCLUDED.name,
    stage = EXCLUDED.stage, sort_order = EXCLUDED.sort_order, is_active = true,
    pass_criteria = EXCLUDED.pass_criteria;

-- 2. 初級仰泳 —— L4 階段 2，緊接在仰式 15 碼之後
INSERT INTO public.skills (id, level_id, name, stage, sort_order, is_active, pass_criteria) VALUES
  ('c1a0c2d4-5e6f-4a81-8b92-0c1d2e3f4a61', 'ed7884c1-bf10-4725-830a-981ee8b52246', 'Elementary Backstroke 25 yd 初級仰泳 25 碼', 2, 2, true,
   'Swims 25 yd on the back with a symmetric arm pull and whip kick, gliding after each stroke. 仰躺 25 碼，雙臂對稱划手配合蛙腿，每一循環後有滑行。')
  ON CONFLICT (id) DO UPDATE SET level_id = EXCLUDED.level_id, name = EXCLUDED.name,
    stage = EXCLUDED.stage, sort_order = EXCLUDED.sort_order, is_active = true,
    pass_criteria = EXCLUDED.pass_criteria;
-- L4 階段 2 原本第 2、3 順位往後移
UPDATE public.skills SET sort_order = 3 WHERE id = '818b6b3b-63b9-4e13-9a52-f3f466f57cc7';
UPDATE public.skills SET sort_order = 4 WHERE id = '9722f505-b208-43dc-868d-495ba0f3c10e';

-- 3. 25 碼水中自保驗收 —— L4 階段 3 最後一個
INSERT INTO public.skills (id, level_id, name, stage, sort_order, is_active, pass_criteria) VALUES
  ('c2a0c2d4-5e6f-4a82-8b92-0c1d2e3f4a62', 'ed7884c1-bf10-4725-830a-981ee8b52246', 'Water Competency 25 yd 水中自保驗收 25 碼', 3, 5, true,
   'In deep water: jump in, surface and float or tread 1 min, turn a full circle to find the exit, swim 25 yd without stopping, climb out without the ladder. 深水中：跳入、回到水面漂或踩水 1 分鐘、原地轉一圈找到出口、不停游 25 碼、不靠扶梯上岸。')
  ON CONFLICT (id) DO UPDATE SET level_id = EXCLUDED.level_id, name = EXCLUDED.name,
    stage = EXCLUDED.stage, sort_order = EXCLUDED.sort_order, is_active = true,
    pass_criteria = EXCLUDED.pass_criteria;

COMMIT;

-- ---------------------------------------------------------------------------
--  驗證（COMMIT 之後單獨跑）
-- ---------------------------------------------------------------------------
-- 每一個啟用中的技能都要有通過標準 —— 這一句應該回 0 列。
-- SELECT l.level_number, s.stage, s.name
--   FROM public.skills s JOIN public.levels l ON l.id = s.level_id
--  WHERE s.is_active AND (s.pass_criteria IS NULL OR btrim(s.pass_criteria) = '')
--  ORDER BY l.level_number, s.stage, s.sort_order;
--
-- 全部看一遍（跑完應該是 82 列：原本 79 個 + 新增 3 個）：
-- SELECT l.level_number AS lv, s.stage, s.sort_order, s.name, s.pass_criteria
--   FROM public.skills s JOIN public.levels l ON l.id = s.level_id
--  WHERE s.is_active ORDER BY l.level_number, s.stage, s.sort_order;
