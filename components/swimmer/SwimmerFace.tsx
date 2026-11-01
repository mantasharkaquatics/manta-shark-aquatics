/* A swimmer's face as a small flat drawing, from the same look as the 3D
   swimmer on the app's home (lib/swimmer-look.ts): skin, hair or cap,
   goggles. Used where a 3D view would be too much -- the booking page's
   "who is this lesson for?" (owner, 2026-11-01, version 2). No look yet:
   a swim cap, as the 3D swimmer wears while the family has not chosen. */

import type { SwimmerLook } from '@/lib/swimmer-look'

const CAPPED: Pick<SwimmerLook, 'skin' | 'cap' | 'capColor' | 'goggles' | 'goggleColor' | 'hair' | 'hairColor'> = {
  skin: '#f3c9a8', cap: true, capColor: '#2050a0', goggles: 'forehead', goggleColor: '#f09800', hair: 'short', hairColor: '#2b1d16',
}

export default function SwimmerFace({ look, size = 48 }: { look: SwimmerLook | null; size?: number }) {
  const l = look ?? CAPPED
  const top = l.cap ? l.capColor : l.hairColor
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true" style={{ flexShrink: 0, display: 'block' }}>
      <circle cx="24" cy="24" r="24" fill="#dcecf8" />
      {/* Hair that shows below a cap-less head: a ponytail or two buns. */}
      {!l.cap && l.hair === 'ponytail' && <ellipse cx="38" cy="22" rx="5" ry="8" fill={top} />}
      {!l.cap && l.hair === 'buns' && <><circle cx="11" cy="11" r="5" fill={top} /><circle cx="37" cy="11" r="5" fill={top} /></>}
      <circle cx="24" cy="27" r="14" fill={l.skin} />
      {/* The top of the head: a dome for a cap, hair otherwise (a fringe for a bob). */}
      {l.cap
        ? <path d="M9.6 25 A14.4 14.4 0 0 1 38.4 25 Z" fill={top} />
        : l.hair === 'spiky'
        ? <path d="M10 24 L12 13 L16 18 L19 9 L23 16 L26 8 L29 16 L33 10 L34 18 L38 14 L38 24 C33 19 15 19 10 24 Z" fill={top} />
        : <path d={l.hair === 'bob' ? 'M9.5 30 C8 15 15 12 24 12 C33 12 40 15 38.5 30 L36 30 C35 22 30 20 24 20 C18 20 13 22 12 30 Z' : 'M10 24 C10 15 16 12.5 24 12.5 C32 12.5 38 15 38 24 C33 19.5 15 19.5 10 24 Z'} fill={top} />}
      {/* Goggles on the eyes, or pushed up onto the forehead. */}
      {l.goggles === 'eyes' ? (
        <g fill="#cfe9f7" stroke={l.goggleColor} strokeWidth="2.2">
          <path d="M10 28 H38" fill="none" />
          <circle cx="19" cy="28" r="4" /><circle cx="29" cy="28" r="4" />
        </g>
      ) : (
        <>
          <circle cx="19" cy="28.5" r="1.8" fill="#1d2a44" /><circle cx="29" cy="28.5" r="1.8" fill="#1d2a44" />
          {l.goggles === 'forehead' && (
            <g fill="#cfe9f7" stroke={l.goggleColor} strokeWidth="2">
              <path d="M10 21 H38" fill="none" />
              <circle cx="19" cy="21" r="3.2" /><circle cx="29" cy="21" r="3.2" />
            </g>
          )}
        </>
      )}
      <circle cx="15" cy="32.5" r="2" fill="#f2a3a3" opacity=".55" /><circle cx="33" cy="32.5" r="2" fill="#f2a3a3" opacity=".55" />
      <path d="M21.5 34 Q24 36.4 26.5 34" fill="none" stroke="#8a3b2e" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}
