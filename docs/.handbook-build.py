# -*- coding: utf-8 -*-
import json, html, sys
sys.path.insert(0,'/tmp')
crit = json.load(open('/tmp/crit.json', encoding='utf-8'))
rows = json.load(open('/tmp/skills.json', encoding='utf-8'))
exec(open('/tmp/teach1.py', encoding='utf-8').read())
exec(open('/tmp/teach2.py', encoding='utf-8').read())
TEACH_ALL = {**TEACH, **TEACH2}
e = html.escape

LEVELS = [
 (1,'Water Discovery','認識水','#c2412f','#e05a4a',
  '完全不會水的孩子，從「靠近水邊有規矩」到「臉敢進水、身體能漂」。這一級教的是安全與信任，不是游泳。',
  [('3–4','建立池邊規矩與自行上岸'),('4–5','敢把臉放進水裡吐氣'),('4–5','能漂、能自己站起來')],'11–14'),
 (2,'Water Confidence','水中自在','#b96a1c','#e8883a',
  '有了漂浮之後開始移動。打水、翻轉、深水過渡。這一級的關鍵字是「放鬆」——越用力越沉。',
  [('4','俯臥與仰躺都能打水前進'),('4–5','身體能翻轉、有換氣節奏'),('5–6','深水不慌、能漂能划')],'13–15'),
 (3,'Independent Movement','獨立前進','#9c7a12','#d4a825',
  '第一次「自己一個人游得動」。加入換氣、踩水與落水求生。這一級結束時，孩子掉進深水能自己回到池邊。',
  [('4–5','25 碼打水加換氣'),('6–7','踩水與深水安全測驗'),('5–6','側轉換氣游、不站起來轉身')],'15–18'),
 (4,'Stroke Foundations','泳姿基礎','#2f7d4e','#4caf72',
  '正式泳姿從這裡開始。自由式與仰式各自成形，同時加入入水與深水求生。第一個「看得出來在游泳」的階段。',
  [('6–7','自由式 15→25 碼'),('5–6','仰式與流線型打水'),('6–7','深水漂、踩水、著衣求生')],'17–20'),
 (5,'Stroke Development','泳姿發展','#2f6f9c','#4a90c4',
  '距離拉長、轉身出現、蛙腿與海豚腿開始鋪路。這一級最長也最容易卡住——蛙腿是四式裡最難教的動作。',
  [('5–6','自由式 50→100 碼'),('7–8','仰式加長、翻滾轉身、水面下潛'),('8–10','蛙腿與海豚腿、救援與憋氣')],'20–24'),
 (6,'Four Strokes','四式完成','#634790','#7b5ea7',
  '蝶式與蛙式加入，四式到齊。這一級同時教兩種新泳姿，負擔最重，不要趕。耐力與轉身也在這裡成形。',
  [('8–10','蝶式與蛙式起步、混合式打水'),('7–8','耐力 200 碼、仰式轉身、站姿跳水'),('9–11','蝶蛙加長、水下海豚腿、平轉身')],'24–29'),
 (7,'Competitive Swimming','競技規格','#9a7d24','#c9a84c',
  '從「會游」到「不會被判失格」。配速、出發、轉身規則、個人混合式。這一級沒有真正的終點——最後一個階段有六個技能並排，會走很久，那是正常的。',
  [('8–10','計時、衝刺、400 碼配速'),('9–11','蛙蝶加長、水下划手、出發'),('12–15','四式合規、個人混合式')],'29–36'),
]

def skill_rows(lv):
    out=[]
    for st in (1,2,3):
        items=[r for r in rows if r['level']==lv and r['stage']==st]
        items.sort(key=lambda r:r['sort'])
        out.append(f'<div class="stage"><div class="stage-h"><span class="sn">階段 {st}</span>'
                   f'<span class="sc">{len(items)} 個技能</span></div>')
        out.append('<div class="skills">')
        for r in items:
            k=f"L{r['level']}S{r['stage']}.{r['sort']}"
            c=crit[k]; t,err=TEACH_ALL[k]
            out.append(
              '<article class="skill">'
              f'<h4>{e(c["name"])}</h4>'
              f'<dl>'
              f'<div class="f pass"><dt>通過標準</dt><dd>{e(c["crit"])}</dd></div>'
              f'<div class="f"><dt>教學重點</dt><dd>{e(t)}</dd></div>'
              f'<div class="f err"><dt>常見錯誤</dt><dd>{e(err)}</dd></div>'
              f'</dl></article>')
        out.append('</div></div>')
    return "\n".join(out)

LADDER = [
 ('0','未教或未評估','這堂課沒有練到這個技能，就讓它留在原地。'),
 ('20','示範過了，學員做不出來','看得懂要做什麼，身體還做不到。'),
 ('40','做得出來，需要大量協助','教練的手還在他身上，或全程靠浮具。'),
 ('60','做得出來，需要少量協助或提示','偶爾扶一下，或需要口頭提醒才做對。'),
 ('80','能獨立完成，但不穩定或未達標準','今天做到了，明天不一定；或做對了但距離、時間還不夠。'),
 ('100','獨立、穩定，並達到該技能的通過標準','不需要提示、上一堂也做到，而且符合通過標準寫的條件。'),
]

nav = "\n".join(
  f'<a href="#L{n}" style="--lc:var(--lv{n})"><b>L{n}</b><span>{zh}</span></a>'
  for n,en,zh,*_ in LEVELS)

levels_html=[]
for n,en,zh,lc,ld,intro,stages,total in LEVELS:
    st_rows="".join(
      f'<tr><td>階段 {i+1}</td><td class="num">{cnt}</td><td>{e(d)}</td></tr>'
      for i,(cnt,d) in enumerate(stages))
    levels_html.append(f"""
<section class="lv" id="L{n}" style="--lc:var(--lv{n})">
  <header class="lv-h">
    <div class="lv-num">Level {n}</div>
    <h2>{e(en)}<span class="zh">{e(zh)}</span></h2>
    <p class="lv-intro">{e(intro)}</p>
  </header>
  <div class="plan">
    <table>
      <caption>整級約 <b>{total}</b> 堂 30 分鐘課</caption>
      <thead><tr><th>階段</th><th class="num">預估堂數</th><th>這個階段在做什麼</th></tr></thead>
      <tbody>{st_rows}</tbody>
    </table>
  </div>
  {skill_rows(n)}
</section>""")

ladder_html="".join(
  f'<div class="rung" data-v="{v}"><div class="rv">{v}</div>'
  f'<div class="rt"><b>{e(t)}</b><span>{e(d)}</span></div></div>'
  for v,t,d in LADDER)

open('handbook.html','w',encoding='utf-8').write(f"""<title>Manta Shark 教練進度手冊</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;900&family=DM+Sans:wght@400;500;700&family=IBM+Plex+Mono:wght@400;600&display=swap">
<style>
:root{{
  --ground:#f2f5fa; --surface:#fff; --raised:#e9eef6; --line:#cfd8e8; --hair:#e3e9f2;
  --ink:#141d33; --soft:#48546f; --faint:#78849c;
  --gold:#8f7420; --gold-bg:#f5efdc;
  --pass:#1f7a4d; --pass-bg:#e6f4ec; --err:#b5432f; --err-bg:#fbeae6;
  --lv1:#c2412f; --lv2:#b96a1c; --lv3:#9c7a12; --lv4:#2f7d4e; --lv5:#2f6f9c; --lv6:#634790; --lv7:#9a7d24;
  --shadow:0 1px 2px rgba(20,29,51,.05),0 6px 20px rgba(20,29,51,.05);
}}
@media (prefers-color-scheme:dark){{:root:not([data-theme="light"]){{
  --ground:#0c1424; --surface:#101c33; --raised:#18253f; --line:#243352; --hair:#1c2a45;
  --ink:#e8eef9; --soft:#a6b3cb; --faint:#6f7d99;
  --gold:#c9a84c; --gold-bg:#282211;
  --pass:#7fd8a0; --pass-bg:#112c1d; --err:#f0917f; --err-bg:#331817;
  --lv1:#e05a4a; --lv2:#e8883a; --lv3:#d4a825; --lv4:#4caf72; --lv5:#4a90c4; --lv6:#9d7fd0; --lv7:#c9a84c;
  --shadow:0 1px 2px rgba(0,0,0,.3),0 8px 26px rgba(0,0,0,.25);
}}}}
:root[data-theme="dark"]{{
  --ground:#0c1424; --surface:#101c33; --raised:#18253f; --line:#243352; --hair:#1c2a45;
  --ink:#e8eef9; --soft:#a6b3cb; --faint:#6f7d99;
  --gold:#c9a84c; --gold-bg:#282211;
  --pass:#7fd8a0; --pass-bg:#112c1d; --err:#f0917f; --err-bg:#331817;
  --lv1:#e05a4a; --lv2:#e8883a; --lv3:#d4a825; --lv4:#4caf72; --lv5:#4a90c4; --lv6:#9d7fd0; --lv7:#c9a84c;
  --shadow:0 1px 2px rgba(0,0,0,.3),0 8px 26px rgba(0,0,0,.25);
}}
*{{box-sizing:border-box}}
body{{margin:0;background:var(--ground);color:var(--ink);
  font-family:'DM Sans',system-ui,-apple-system,"PingFang TC","Noto Sans TC",sans-serif;
  font-size:16px;line-height:1.75;-webkit-font-smoothing:antialiased}}
.wrap{{max-width:1000px;margin:0 auto;padding:44px 20px 90px}}
h1,h2,h3{{text-wrap:balance}}
h1{{font-family:'Playfair Display',Georgia,serif;font-weight:900;
  font-size:clamp(28px,5vw,42px);line-height:1.1;margin:8px 0 12px}}
.eyebrow{{font-family:'IBM Plex Mono',monospace;font-size:11.5px;letter-spacing:.18em;
  text-transform:uppercase;color:var(--gold)}}
.stand{{font-size:17px;color:var(--soft);max-width:60ch;margin:0}}
.meta{{margin-top:20px;padding-top:16px;border-top:1px solid var(--line);display:flex;
  flex-wrap:wrap;gap:6px 24px;font-family:'IBM Plex Mono',monospace;font-size:12.5px;color:var(--faint)}}
.meta b{{color:var(--soft);font-weight:600}}
h2{{font-family:'Playfair Display',Georgia,serif;font-weight:700;font-size:26px;
  line-height:1.25;margin:0}}
h2 .zh{{font-family:'DM Sans',sans-serif;font-size:16px;font-weight:500;color:var(--soft);margin-left:12px}}
h3{{font-size:13px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;
  color:var(--faint);margin:0 0 14px}}
p{{margin:0 0 14px;max-width:66ch}}
code{{font-family:'IBM Plex Mono',monospace;font-size:.875em;background:var(--raised);
  padding:1px 5px;border-radius:4px;border:1px solid var(--hair)}}
section{{margin-top:56px}}

/* ---- the scoring ladder: the page's thesis ---- */
.ladder{{display:grid;gap:1px;background:var(--line);border:1px solid var(--line);
  border-radius:12px;overflow:hidden;box-shadow:var(--shadow)}}
.rung{{display:grid;grid-template-columns:76px 1fr;gap:18px;align-items:baseline;
  background:var(--surface);padding:14px 18px}}
.rv{{font-family:'IBM Plex Mono',monospace;font-weight:600;font-size:19px;
  font-variant-numeric:tabular-nums;text-align:right;color:var(--faint)}}
.rung[data-v="100"] .rv{{color:var(--pass)}}
.rung[data-v="100"]{{background:var(--pass-bg)}}
.rt b{{display:block;font-size:15.5px}}
.rt span{{display:block;font-size:13.5px;color:var(--soft);line-height:1.6}}

/* ---- rules ---- */
.rules{{list-style:none;padding:0;margin:0;display:grid;gap:0}}
.rules li{{padding:13px 0 13px 26px;border-bottom:1px solid var(--hair);position:relative;
  color:var(--soft);font-size:14.5px;line-height:1.7}}
.rules li:last-child{{border-bottom:none}}
.rules li::before{{content:"→";position:absolute;left:0;top:13px;color:var(--gold);font-weight:700}}
.rules b{{color:var(--ink)}}

/* ---- level nav ---- */
.nav{{display:grid;grid-template-columns:repeat(auto-fit,minmax(112px,1fr));gap:8px;margin-top:26px}}
.nav a{{display:flex;flex-direction:column;gap:2px;padding:10px 12px;border-radius:9px;
  text-decoration:none;background:var(--surface);border:1px solid var(--line);
  border-left:3px solid var(--lc)}}
.nav a b{{font-family:'IBM Plex Mono',monospace;font-size:12px;color:var(--lc);letter-spacing:.06em}}
.nav a span{{font-size:13.5px;color:var(--ink)}}
.nav a:hover{{background:var(--raised)}}

/* ---- level block ---- */
.lv-h{{border-left:4px solid var(--lc);padding-left:16px}}
.lv-num{{font-family:'IBM Plex Mono',monospace;font-size:11.5px;letter-spacing:.16em;
  text-transform:uppercase;color:var(--lc);font-weight:600}}
.lv-intro{{margin:8px 0 0;color:var(--soft);font-size:14.5px}}
.plan{{margin:20px 0 8px;overflow-x:auto}}
.plan table{{border-collapse:collapse;width:100%;min-width:440px;font-size:14.5px}}
.plan th,.plan td{{text-align:left;padding:9px 12px;border-bottom:1px solid var(--hair)}}
.plan thead th{{font-size:11.5px;letter-spacing:.09em;text-transform:uppercase;
  color:var(--faint);border-bottom:1px solid var(--line)}}
.plan .num{{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}}
.plan tbody tr:last-child td{{border-bottom:none}}
.plan caption{{caption-side:bottom;text-align:left;padding-top:9px;font-size:12.5px;color:var(--faint)}}
.plan caption b{{color:var(--lc)}}

.stage{{margin-top:22px}}
.stage-h{{display:flex;align-items:baseline;gap:10px;margin-bottom:10px}}
.sn{{font-family:'IBM Plex Mono',monospace;font-size:11px;font-weight:600;letter-spacing:.1em;
  text-transform:uppercase;padding:3px 9px;border-radius:20px;color:var(--lc);
  border:1px solid var(--lc)}}
.sc{{font-size:12.5px;color:var(--faint)}}
.skills{{display:grid;gap:10px}}
.skill{{background:var(--surface);border:1px solid var(--hair);border-left:3px solid var(--lc);
  border-radius:0 10px 10px 0;padding:14px 18px}}
.skill h4{{margin:0 0 10px;font-size:15.5px;font-weight:700;line-height:1.4}}
.skill dl{{margin:0;display:grid;gap:7px}}
.f{{display:grid;grid-template-columns:74px 1fr;gap:4px 14px;align-items:baseline}}
.f dt{{font-size:11px;font-weight:700;letter-spacing:.08em;color:var(--faint);white-space:nowrap}}
.f dd{{margin:0;font-size:14px;color:var(--soft);line-height:1.7}}
.f.pass dt{{color:var(--pass)}}
.f.pass dd{{color:var(--ink)}}
.f.err dt{{color:var(--err)}}
@media(max-width:560px){{.f{{grid-template-columns:1fr}}.rung{{grid-template-columns:52px 1fr;gap:12px}}}}

.note{{border:1px solid var(--line);border-left:3px solid var(--gold);background:var(--surface);
  border-radius:0 10px 10px 0;padding:16px 20px;margin-top:22px}}
.note p:last-child{{margin-bottom:0}}
a{{color:var(--gold)}}
:focus-visible{{outline:2px solid var(--gold);outline-offset:2px;border-radius:3px}}
</style>

<div class="wrap">
<header>
  <span class="eyebrow">Manta Shark Aquatics</span>
  <h1>教練進度手冊</h1>
  <p class="stand">七個級別、三個階段、79 個技能，從完全不會水到四式合規。每個技能寫清楚三件事：怎樣算過、這堂課要教什麼、學員最常卡在哪。</p>
  <div class="meta">
    <span><b>版本</b> 2026-09-09</span>
    <span><b>技能數</b> 79</span>
    <span><b>零基礎到 Level 7</b> 約 129–156 堂</span>
    <span><b>單位</b> 碼（yd）</span>
  </div>
</header>

<section>
  <h3>先讀這一段</h3>
  <h2 style="margin-bottom:14px">0 到 100 是什麼意思</h2>
  <p>這是整本手冊最重要的一頁。教練在 app 上點的六個格子，全校用<strong>同一套定義</strong>——不然 A 教練的 60% 和 B 教練的 60% 不是同一件事，家長看到的百分比就沒有意義。</p>
  <div class="ladder">{ladder_html}</div>
  <div class="note">
    <p><strong>百分比是怎麼算出來的。</strong>一個階段的百分比 = 該階段所有技能的平均。所以把一個技能從 0 拉到 100，和把五個技能各拉 20，家長看到的進度條移動一樣多——但前者是真的學會了一件事，後者只是每樣都碰過。<strong>寧可把一個技能做到 100，不要五個技能都停在 40。</strong></p>
    <p style="margin-bottom:0">一個階段要<strong>每一個技能都 100</strong> 才算完成，三個階段都完成才能升級。升級是管理者按的，不是自動的。</p>
  </div>
</section>

<section>
  <h3>每一堂課</h3>
  <h2 style="margin-bottom:14px">怎麼上、怎麼記</h2>
  <ul class="rules">
    <li><b>只動今天真的練到的技能。</b>沒練到的就讓它留在原地。手癢把整個階段都往上調一格，是把紀錄變成廢紙最快的方法。</li>
    <li><b>一次只前進一格。</b>從 40 直接跳到 100，代表中間那兩堂課沒有被記錄下來，家長也看不到孩子是怎麼進步的。</li>
    <li><b>100 分要看兩堂。</b>今天不用提示就做到，而且<strong>上一堂也做到</strong>，才給 100。只做到一次是 80。</li>
    <li><b>一堂課練 2–3 個技能就好。</b>30 分鐘的課，練五個技能等於五個都沒練到。</li>
    <li><b>照著階段的順序教。</b>階段 1 沒完成，app 不會讓你填階段 2——那是刻意的，不是壞掉。</li>
    <li><b>學員卡住時往回退。</b>蛙腿卡住就回去練海豚腿的髖部發力；換氣卡住就回去練吐泡泡。往回退一級不是退步，硬撐才是。</li>
    <li><b>通過標準寫在按鈕旁邊。</b>不確定該給幾分的時候，看那一行字，不要憑印象。</li>
  </ul>
</section>

<section>
  <h3>七個級別</h3>
  <h2>從不會水到四式合規</h2>
  <p style="margin-top:12px">堂數是<strong>估計值，不是承諾</strong>。同一個級別，每週上兩堂的孩子會比每週一堂的快超過兩倍——因為間隔短，忘掉的比較少。跟家長講的時候用區間，不要給單一數字。</p>
  <nav class="nav">{nav}</nav>
</section>

{"".join(levels_html)}

<section>
  <div class="note">
    <p><strong>這份手冊和 app 是同一份資料。</strong>每個技能的通過標準也寫進了資料庫，教練在評分介面點百分比的時候，那一行字就顯示在按鈕上方。手冊改了，app 也要改——兩邊講的必須是同一件事。</p>
    <p style="margin-bottom:0"><strong>還沒解決的一件事：</strong>Level 7 的階段 3 有六個技能並排，要全部 100 才算完成整個課程。學員在那裡會停留很久，進度條幾乎不動。這是刻意保留的——競技規格本來就慢——但跟家長溝通時要先講清楚，不要讓他們以為孩子卡住了。</p>
  </div>
</section>
</div>
""")
print('handbook.html written')
