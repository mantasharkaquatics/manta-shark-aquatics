/*
 * The school's mascot as a small helper (owner, 2026-10-26: the "mascot
 * helper" idea): it floats beside an empty list, swims across while
 * something loads, and holds a tip in a speech bubble. Purely decorative:
 * the words beside it carry the meaning, so the picture is hidden from
 * screen readers. Still with reduced motion.
 */
import type { ReactNode } from 'react'

const CSS = `
.msa-mh { display: flex; flex-direction: column; align-items: center; text-align: center; gap: 8px; padding: 18px 12px }
.msa-mh img { width: 96px; height: auto; animation: msaMhBob 3s ease-in-out infinite }
.msa-mh.sm img { width: 72px }
.msa-mh p { margin: 0; font-size: 15px; color: #56647d; line-height: 1.6 }
.msa-mh b { font-size: 17px; color: #12254a }
@keyframes msaMhBob { 0%, 100% { transform: translateY(0) rotate(-3deg) } 50% { transform: translateY(-7px) rotate(3deg) } }
.msa-mh-pool { position: relative; width: min(260px, 100%); height: 56px; border-radius: 14px; overflow: hidden; background: linear-gradient(180deg, #cfe7f8, #9fd0ef) }
.msa-mh-pool img { position: absolute; top: 8px; width: 52px; animation: msaMhSwim 2.6s linear infinite }
@keyframes msaMhSwim { from { left: -60px } to { left: 100% } }
.msa-mh-tip { display: flex; gap: 10px; align-items: flex-end; text-align: left }
.msa-mh-tip img { width: 52px; flex: none; animation: msaMhBob 3.4s ease-in-out infinite }
.msa-mh-tip div { background: #e8f1fb; border-radius: 16px 16px 16px 4px; padding: 10px 13px; font-size: 14.5px; line-height: 1.55; color: #12254a }
@media (prefers-reduced-motion: reduce) { .msa-mh img, .msa-mh-tip img, .msa-mh-pool img { animation: none } .msa-mh-pool img { left: 40% } }
`

export function MascotEmpty({ title, text, children, small }: { title?: string; text?: string; children?: ReactNode; small?: boolean }) {
  return (
    <div className={'msa-mh' + (small ? ' sm' : '')}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/mascot.png" alt="" aria-hidden="true" />
      {title && <b>{title}</b>}
      {text && <p>{text}</p>}
      {children}
    </div>
  )
}

export function MascotLoading({ text }: { text: string }) {
  return (
    <div className="msa-mh" role="status">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="msa-mh-pool" aria-hidden="true">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/mascot.png" alt="" />
      </div>
      <p>{text}</p>
    </div>
  )
}

export function MascotTip({ children }: { children: ReactNode }) {
  return (
    <div className="msa-mh-tip">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/mascot.png" alt="" aria-hidden="true" />
      <div>{children}</div>
    </div>
  )
}
