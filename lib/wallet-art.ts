'use client'

import { NEUTRAL_LOOK, type SwimmerLook } from '@/lib/swimmer-look'

/* The Apple Wallet card's picture (owner, 2026-11-17, 樣式 4「我的游泳小人」):
   the swimmer the family dressed in the app, standing in its little pool on
   the home card's sky, drawn on this phone with the same 3D model
   (components/swimmer/engine.ts portrait) and sent with the request for the
   card (app/api/parent/wallet-pass). iOS 27's poster cards show it across the
   whole card; older iPhones show the small square (thumb) beside the name.

   Sizes are the server's to check (lib/wallet-pass.ts ART / THUMB). */

export const ART_W = 716, ART_H = 896, THUMB = 180

const toB64 = (c: HTMLCanvasElement) => c.toDataURL('image/png').replace(/^data:image\/png;base64,/, '')

export async function makeWalletArt(look: SwimmerLook | null): Promise<{ art: string; thumb: string } | null> {
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
    const thumb = document.createElement('canvas'); thumb.width = THUMB; thumb.height = THUMB
    const tx = thumb.getContext('2d')!
    const tsky = tx.createLinearGradient(0, 0, 0, THUMB); tsky.addColorStop(0, '#d9eefc'); tsky.addColorStop(1, '#a9d8f5')
    tx.fillStyle = tsky; tx.fillRect(0, 0, THUMB, THUMB)
    // The swimmer's head and body: the middle of the picture.
    tx.drawImage(shot, 200, 70, 360, 360, 0, 0, THUMB, THUMB)
    return { art: toB64(art), thumb: toB64(thumb) }
  } finally { engine.dispose() }
}
