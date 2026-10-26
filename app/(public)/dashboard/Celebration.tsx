'use client'

/*
 * The moment a swimmer passes a stage (owner, 2026-10-26: the celebration +
 * share card idea). Plays once, the next time the family opens the
 * dashboard after the stage is earned: ribbons fall, the mascot swims
 * across, the stage's rosette pops in. The family can turn it into a card
 * to save and share (lib/share-card.ts), or close it.
 *
 * Loaded only when there is something to celebrate (next/dynamic).
 */
import { useEffect, useRef, useState } from 'react'
import { useT } from '@/lib/i18n/provider'
import { levelNameKey, stageNameKey } from '@/lib/levels'
import StageRibbon from '@/components/StageRibbon'
import { makeShareCard } from '@/lib/share-card'
import { useDialogFocus } from '@/lib/use-dialog-focus'

type Props = { name: string; level: number; stage: number; onClose: () => void }

export default function Celebration({ name, level, stage, onClose }: Props) {
  const t = useT()
  const fx = useRef<HTMLCanvasElement | null>(null)
  const box = useDialogFocus(true)
  const [card, setCard] = useState<string | null>(null)
  const what = `${t('levels.levelN', { n: level })} ${t(levelNameKey(level))} · ${t(stageNameKey(level, stage))}`

  useEffect(() => {
    const html = document.documentElement, was = html.style.overflow
    html.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => { html.style.overflow = was; window.removeEventListener('keydown', onKey) }
  }, [onClose])

  // Falling ribbons, for six seconds; none with reduced motion.
  useEffect(() => {
    const c = fx.current
    if (!c || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const g = c.getContext('2d')!
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const W = window.innerWidth, H = window.innerHeight
    c.width = W * dpr; c.height = H * dpr; g.scale(dpr, dpr)
    const cols = ['#ffd27a', '#f09800', '#e05a4a', '#4caf72', '#4a90c4', '#ffffff', '#7b5ea7']
    const P = Array.from({ length: 130 }, () => ({
      x: Math.random() * W, y: -20 - Math.random() * H * 0.8, w: 6 + Math.random() * 6, h: 10 + Math.random() * 10,
      vy: 1.6 + Math.random() * 2.4, vx: -1 + Math.random() * 2, r: Math.random() * 6, vr: -0.15 + Math.random() * 0.3,
      c: cols[(Math.random() * cols.length) | 0],
    }))
    let raf = 0
    const t0 = performance.now()
    const tick = (now: number) => {
      g.clearRect(0, 0, W, H)
      for (const p of P) {
        p.y += p.vy; p.x += p.vx + Math.sin((now + p.r * 100) / 400) * 0.6; p.r += p.vr
        g.save(); g.translate(p.x, p.y); g.rotate(p.r); g.fillStyle = p.c
        g.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.r))); g.restore()
      }
      if (now - t0 < 6000) raf = requestAnimationFrame(tick)
      else g.clearRect(0, 0, W, H)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  return (
    <div className="msa-cele" role="dialog" aria-modal="true" aria-label={t('share.passed', { n: stage })} ref={box}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <canvas className="fx" ref={fx} aria-hidden="true" />
      <button type="button" className="tap-auto x" onClick={onClose} aria-label={t('common.close')}>✕</button>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="swim" src="/mascot.png" alt="" aria-hidden="true" />
      <div className="in">
        {card ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="card" src={card} alt={`${t('share.bravo', { name })} ${what}`} />
            <div className="btns">
              <a className="amb" href={card} download={`${name}-L${level}-${stage}.png`}>{t('share.save')}</a>
              <button type="button" className="tap-auto ghost" onClick={onClose}>{t('common.close')}</button>
            </div>
          </>
        ) : (
          <>
            <div className="rib"><StageRibbon level={level} stage={stage} size={104} label="" /></div>
            <div className="t1">{t('share.passed', { n: stage })}</div>
            <div className="t2">{t('share.bravo', { name })}</div>
            <div className="t3">{what}</div>
            <div className="btns">
              <button type="button" className="tap-auto amb" onClick={async () => setCard(await makeShareCard(level, stage, {
                passed: t('share.passed', { n: stage }), bravo: t('share.bravo', { name }), what,
              }))}>{t('share.make')}</button>
              <button type="button" className="tap-auto ghost" onClick={onClose}>{t('celebrate.later')}</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

const CSS = `
.msa-cele { position: fixed; inset: 0; z-index: 2000; display: flex; align-items: center; justify-content: center; padding: 20px;
  background: radial-gradient(120% 80% at 50% 30%, #2a5aa8 0%, #12254a 70%); overflow: hidden }
.msa-cele .fx { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none }
.msa-cele .x { position: absolute; top: max(14px, env(safe-area-inset-top)); right: 14px; z-index: 4; width: 44px; height: 44px; min-height: 0; border: 0; border-radius: 50%;
  background: rgba(255,255,255,.16); color: #fff; font-size: 20px; cursor: pointer }
.msa-cele .swim { position: absolute; top: 12%; left: -40%; width: 120px; z-index: 3; filter: drop-shadow(0 8px 14px rgba(0,0,0,.25));
  animation: msaSwim 2.4s cubic-bezier(.4,.1,.3,1) .2s forwards }
@keyframes msaSwim { 0% { left: -40%; transform: rotate(-8deg) } 50% { transform: rotate(6deg) } 100% { left: 120%; transform: rotate(-4deg) } }
.msa-cele .in { position: relative; z-index: 2; width: 100%; max-width: 380px; text-align: center; color: #fff }
.msa-cele .rib { display: flex; justify-content: center; opacity: 0; transform: scale(.4); animation: msaPop .7s cubic-bezier(.2,1.6,.4,1) .9s forwards }
@keyframes msaPop { to { opacity: 1; transform: none } }
.msa-cele .t1 { font-size: 16px; font-weight: 800; color: #ffd27a; letter-spacing: .06em; margin-top: 14px }
.msa-cele .t2 { font-family: var(--font-display), 'PingFang TC', serif; font-size: 34px; font-weight: 900; line-height: 1.15; margin: 6px 0 }
.msa-cele .t3 { font-size: 17px; color: #d8e3f5; line-height: 1.5 }
.msa-cele .t1, .msa-cele .t2, .msa-cele .t3, .msa-cele .btns { opacity: 0; animation: msaUp .6s ease-out forwards }
.msa-cele .t1 { animation-delay: 1.3s } .msa-cele .t2 { animation-delay: 1.45s } .msa-cele .t3 { animation-delay: 1.6s } .msa-cele .btns { animation-delay: 2s }
@keyframes msaUp { from { opacity: 0; transform: translateY(10px) } to { opacity: 1; transform: none } }
.msa-cele .btns { display: flex; flex-direction: column; gap: 10px; margin-top: 24px }
.msa-cele .btns .amb, .msa-cele .btns .ghost { display: block; border-radius: 14px; padding: 14px; font-family: inherit; font-size: 16px; font-weight: 800;
  text-decoration: none; cursor: pointer; min-height: 50px; box-sizing: border-box }
.msa-cele .btns .amb { border: 0; background: linear-gradient(180deg, #ffbe3d, #f09800); color: #3a2600 }
.msa-cele .btns .ghost { border: 1px solid rgba(255,255,255,.3); background: rgba(255,255,255,.12); color: #fff }
.msa-cele .card { width: 100%; max-width: 320px; border-radius: 16px; box-shadow: 0 16px 40px rgba(0,0,0,.35) }
.msa-cele .card + .btns { opacity: 1; animation: none }
@media (prefers-reduced-motion: reduce) {
  .msa-cele .swim { display: none }
  .msa-cele .rib, .msa-cele .t1, .msa-cele .t2, .msa-cele .t3, .msa-cele .btns { animation: none; opacity: 1; transform: none }
}
`
