'use client'

import { NEUTRAL_LOOK, type SwimmerLook } from '@/lib/swimmer-look'

/* The Apple Wallet card's picture (owner, 2026-11-17, 樣式 4「我的游泳小人」):
   the swimmer the family dressed in the app, standing in its little pool on
   the home card's sky, drawn on this phone with the same 3D model
   (components/swimmer/engine.ts portrait) and sent with the request for the
   card (app/api/parent/wallet-pass). iOS 27's poster cards show it across the
   whole card; older iPhones show the wide strip under the card's top line.

   Sizes are the server's to check (lib/wallet-pass.ts ART / THUMB). */

export const ART_W = 716, ART_H = 896, STRIP_W = 750, STRIP_H = 288

const toB64 = (c: HTMLCanvasElement) => c.toDataURL('image/png').replace(/^data:image\/png;base64,/, '')

/** The part of the big picture that holds the swimmer and its pool (art
 *  pixels), laid on the right of the strip; the server's default strip is
 *  cut the same way (lib/wallet-pass-images.ts). */
export const STRIP_FROM = { x: 0, y: 140, w: 716, h: 570 }

export async function makeWalletArt(look: SwimmerLook | null): Promise<{ art: string; strip: string } | null> {
  if (typeof window === 'undefined') return null
  const { createEngine } = await import('@/components/swimmer/engine')
  const engine = await createEngine().catch(() => null)
  if (!engine) return null
  try {
    // The swimmer a little larger than the card is wide; the bottom third
    // sits under Wallet's frosted strip with the QR.
    const shot = engine.portrait(look ?? NEUTRAL_LOOK, 760, 760)
    if (!shot) return null
    const art = document.createElement('canvas'); art.width = ART_W; art.height = ART_H
    const x = art.getContext('2d')!
    const sky = x.createLinearGradient(0, 0, 0, ART_H)
    sky.addColorStop(0, '#d9eefc'); sky.addColorStop(0.62, '#a9d8f5'); sky.addColorStop(1, '#6fbbe9')
    x.fillStyle = sky; x.fillRect(0, 0, ART_W, ART_H)
    // Two soft clouds, as on the home card's sky.
    x.fillStyle = 'rgba(255,255,255,.65)'
    for (const [cx, cy, rx, ry] of [[118, 210, 82, 22], [600, 300, 70, 19]]) { x.beginPath(); x.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); x.fill() }
    x.drawImage(shot, (ART_W - 760) / 2, 90)
    /* The older iPhones' card (a store card) has a wide picture under its
       top line: the same swimmer on the right, sky on the left for the name. */
    const strip = document.createElement('canvas'); strip.width = STRIP_W; strip.height = STRIP_H
    const sx = strip.getContext('2d')!
    const k = STRIP_H / STRIP_FROM.h, w = Math.round(STRIP_FROM.w * k)
    // The sky behind: the picture's own left edge stretched across, so the
    // swimmer's part sits in it with no seam.
    sx.drawImage(art, 2, STRIP_FROM.y, 1, STRIP_FROM.h, 0, 0, STRIP_W, STRIP_H)
    sx.drawImage(art, STRIP_FROM.x, STRIP_FROM.y, STRIP_FROM.w, STRIP_FROM.h, STRIP_W - w - 10, 0, w, STRIP_H)
    return { art: toB64(art), strip: toB64(strip) }
  } finally { engine.dispose() }
}
