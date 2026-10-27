/* The app icon and opening screens (owner, 2026-10-27: icon B, deep blue;
   opening screen 1, deep blue). Run from this folder:
     npm pack @fontsource/nunito-sans@5.2.5 && tar xzf fontsource-nunito-sans-5.2.5.tgz
     node make-icons.js
   Writes out/ios/... and out/android/...; copy them over the files of the same
   names in ios/App/App/Assets.xcassets and android/app/src/main/res.
   Needs Playwright (Chromium). mascot.svg comes from trace-mascot.py. */
const { chromium } = require('playwright'); const fs = require('fs');
const svg = fs.readFileSync('mascot.svg', 'utf8');
const FONT = fs.readFileSync('package/files/nunito-sans-latin-800-normal.woff2').toString('base64');
const inner = svg.slice(svg.indexOf('>') + 1, svg.lastIndexOf('</svg>'));
const noHalo = inner.replace(/<g id="halo">[\s\S]*?<\/g>/, '');
const whiteArt = inner.replace(/<g id="halo">[\s\S]*?<\/g>/, '').replace(/<g id="body">[\s\S]*?<\/g>/, '').replace(/fill="#2351a3"/g, 'fill="#fff"').replace(/fill="#f39800"/g, 'fill="#fff"');
const VB = '5 26 502 459';
const m = (w, body = inner) => `<svg viewBox="${VB}" style="width:${w}px;height:auto;display:block">${body}</svg>`;
const NAVY = 'linear-gradient(160deg,#12254a 0%,#1d3f7c 100%)';
const word = (fs, color) => `<div style="font:800 ${fs}px 'Nunito Sans',sans-serif;letter-spacing:.34em;padding-left:.34em;color:${color};white-space:nowrap">MANTA SHARK</div>`;
const jobs = [];
const job = (path, w, h, html, transparent = false) => jobs.push({ path, w, h, html, transparent });
const center = (inner, bg = 'transparent', extra = '') => `<div style="width:100%;height:100%;background:${bg};display:flex;flex-direction:column;align-items:center;justify-content:center;${extra}">${inner}</div>`;
// iOS
job('ios/AppIcon-512@2x.png', 1024, 1024, center(m(800), NAVY));
job('ios/splash-2732x2732.png', 2732, 2732, center(m(620) + `<div style="height:70px"></div>` + word(64, '#fff'), NAVY));
// Android
const D = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
for (const [d, s] of Object.entries(D)) {
  const L = 48 * s;
  job(`android/mipmap-${d}/ic_launcher.png`, L, L, center(m(L * 0.74), NAVY, 'border-radius:18%'), true);
  job(`android/mipmap-${d}/ic_launcher_round.png`, L, L, center(m(L * 0.68), NAVY, 'border-radius:50%'), true);
  const F = 108 * s;
  job(`android/mipmap-${d}/ic_launcher_foreground.png`, F, F, center(m(F * 0.56)), true);
  const SI = 288 * s;
  job(`android/drawable-${d}/splash_icon.png`, SI, SI, center(m(SI * 0.52)), true);
  job(`android/drawable-${d}/splash_brand.png`, 200 * s, 80 * s, center(word(15 * s, '#fff')), true);
  const N = 24 * s;
  job(`android/drawable-${d}/ic_stat_notify.png`, N, N, center(m(N * 0.92, whiteArt)), true);
}
// Opening screen before Android 12: one picture per screen shape, stretched
// to the screen by Android, so each keeps the shape it is drawn for.
const SPLASH = { 'drawable': [480, 320], 'drawable-land-mdpi': [480, 320], 'drawable-land-hdpi': [800, 480], 'drawable-land-xhdpi': [1280, 720],
  'drawable-land-xxhdpi': [1600, 960], 'drawable-land-xxxhdpi': [1920, 1280], 'drawable-port-mdpi': [320, 480], 'drawable-port-hdpi': [480, 800],
  'drawable-port-xhdpi': [720, 1280], 'drawable-port-xxhdpi': [960, 1600], 'drawable-port-xxxhdpi': [1280, 1920] };
for (const [dir, [w, h]] of Object.entries(SPLASH)) {
  const u = Math.min(w, h);
  job(`android/${dir}/splash.png`, w, h, center(m(u * 0.42) + `<div style="height:${u * 0.045}px"></div>` + word(u * 0.04, '#fff'), NAVY));
}
(async () => {
  const b = await chromium.launch();
  for (const j of jobs) {
    const p = await b.newPage({ viewport: { width: Math.round(j.w), height: Math.round(j.h) } });
    await p.setContent(`<html><head><style>@font-face{font-family:'Nunito Sans';font-weight:800;src:url(data:font/woff2;base64,${FONT}) format('woff2')}</style></head><body style="margin:0;width:${j.w}px;height:${j.h}px;background:transparent">${j.html}</body></html>`, { waitUntil: 'networkidle' });
    await p.evaluate(async () => { await document.fonts.load("800 20px 'Nunito Sans'"); await document.fonts.ready });
    const ok = await p.evaluate(() => [...document.fonts].some(f => f.status === 'loaded'));
    if (!ok && j.html.includes('MANTA')) console.log('FONT MISSING', j.path);
    fs.mkdirSync('out/' + j.path.split('/').slice(0, -1).join('/'), { recursive: true });
    await p.screenshot({ path: 'out/' + j.path, omitBackground: j.transparent });
    await p.close();
  }
  await b.close(); console.log(jobs.length, 'done');
})();
