/*
 * The "passed a stage" card a family can save and share (owner, 2026-10-26:
 * the celebration + share card idea). Drawn on a canvas in the browser, so
 * nothing is uploaded or stored: the picture exists only on the family's
 * phone until they choose to save it.
 *
 * 1080 x 1350 (4:5), the shape Instagram and LINE show without cropping.
 * Used by the celebration that plays after a stage is earned and by the
 * badge wall in the learning map.
 */
import { stageColor, mixHex } from '@/lib/ribbons'

export type ShareCardText = {
  /** "通過 階段 1" */
  passed: string
  /** "CC 好棒！" */
  bravo: string
  /** "等級 1 認識水 · 安全進出水池" */
  what: string
}

const fontOf = (cssVar: string, fallback: string) => {
  const v = typeof document !== 'undefined'
    ? getComputedStyle(document.body).getPropertyValue(cssVar).trim() : ''
  return `${v ? v + ', ' : ''}${fallback}`
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath()
  g.moveTo(x + r, y)
  g.arcTo(x + w, y, x + w, y + h, r)
  g.arcTo(x + w, y + h, x, y + h, r)
  g.arcTo(x, y + h, x, y, r)
  g.arcTo(x, y, x + w, y, r)
  g.closePath()
}

/** Shrinks the font until the line fits the card. */
function fitText(g: CanvasRenderingContext2D, text: string, weight: number, size: number, family: string, max: number) {
  let s = size
  do { g.font = `${weight} ${s}px ${family}`; s -= 2 } while (g.measureText(text).width > max && s > 20)
}

export async function makeShareCard(level: number, stage: number, text: ShareCardText): Promise<string> {
  const W = 1080, H = 1350
  const c = document.createElement('canvas')
  c.width = W; c.height = H
  const g = c.getContext('2d')!
  const display = fontOf('--font-display', '"PingFang TC", "Noto Sans TC", serif')
  const body = fontOf('--font-body', '"PingFang TC", "Noto Sans TC", sans-serif')
  try { await document.fonts?.ready } catch { /* draw with what there is */ }

  // Ground: the school's blue, with water along the bottom.
  const bg = g.createLinearGradient(0, 0, 0, H)
  bg.addColorStop(0, '#2a5aa8'); bg.addColorStop(1, '#12254a')
  g.fillStyle = bg; g.fillRect(0, 0, W, H)
  g.fillStyle = 'rgba(255,255,255,.06)'
  for (let k = 0; k < 4; k++) {
    g.beginPath(); g.moveTo(0, 1050 + k * 70)
    for (let x = 0; x <= W; x += 20) g.lineTo(x, 1050 + k * 70 + Math.sin(x / 90 + k) * 18)
    g.lineTo(W, H); g.lineTo(0, H); g.fill()
  }

  g.fillStyle = '#ffffff'; roundRect(g, 80, 150, W - 160, 900, 56); g.fill()

  // The stage's own rosette colour, as on the ribbons everywhere else.
  const col = stageColor(level, stage)
  const dark = mixHex(col, '#000000', 0.3)
  const cx = W / 2, cy = 360
  g.fillStyle = dark
  g.beginPath(); g.moveTo(cx - 60, cy + 70); g.lineTo(cx - 100, cy + 230); g.lineTo(cx - 50, cy + 200); g.lineTo(cx - 20, cy + 250); g.lineTo(cx, cy + 90); g.fill()
  g.fillStyle = mixHex(col, '#000000', 0.15)
  g.beginPath(); g.moveTo(cx + 60, cy + 70); g.lineTo(cx + 100, cy + 230); g.lineTo(cx + 50, cy + 200); g.lineTo(cx + 20, cy + 250); g.lineTo(cx, cy + 90); g.fill()
  g.fillStyle = '#ffd27a'; g.beginPath(); g.arc(cx, cy, 120, 0, Math.PI * 2); g.fill()
  g.fillStyle = col; g.beginPath(); g.arc(cx, cy, 100, 0, Math.PI * 2); g.fill()
  g.fillStyle = '#ffffff'; g.textAlign = 'center'; g.textBaseline = 'middle'
  g.font = `900 110px ${display}`; g.fillText(String(level), cx, cy + 6)

  g.fillStyle = '#a86800'; fitText(g, text.passed, 800, 44, body, W - 260); g.fillText(text.passed, cx, 660)
  g.fillStyle = '#12254a'; fitText(g, text.bravo, 900, 96, display, W - 260); g.fillText(text.bravo, cx, 760)
  g.fillStyle = '#4c5b75'; fitText(g, text.what, 700, 44, body, W - 260); g.fillText(text.what, cx, 860)

  const img = new Image()
  img.src = '/mascot.png'
  try { await img.decode(); g.drawImage(img, cx - 130, 1075, 260, 236) } catch { /* card without the mascot */ }
  g.fillStyle = '#ffffff'; g.textBaseline = 'middle'
  g.font = `900 44px ${display}`; g.textAlign = 'left'; g.fillText('Manta Shark', 90, 1215)
  g.font = `700 32px ${body}`; g.textAlign = 'right'; g.fillText('Aquatics', W - 90, 1215)
  return c.toDataURL('image/png')
}
