/* One of the 21 stage ribbons, drawn rather than typed.
 *
 * A rosette: a scalloped medallion with the level number in the middle, three
 * pips on the bar underneath for the stage, and two tails. The number sits on
 * the medallion's true centre (dominant-baseline), and the pips live on their
 * own bar below it -- an earlier version put the pips inside the medallion and
 * the number had to shift up to make room, which read as crooked at every size.
 *
 * Scales down to 28px and still reads. Not earned: greyed and faded, name and
 * shape still there, because a parent should see what is still missing. */
import { stageColor, mixHex, isMetalLevel } from '@/lib/ribbons'

type Props = {
  level: number | string
  stage: number | string
  size?: number
  earned?: boolean
  /** Screen-reader label; pass the stage's own name where there is one. */
  label?: string
}

export default function StageRibbon({ level, stage, size = 44, earned = true, label }: Props) {
  const st = Math.min(3, Math.max(1, Number(stage) || 1))
  const c = stageColor(level, st)
  const dark = mixHex(c, '#000000', 0.34)
  const light = mixHex(c, '#ffffff', 0.46)
  const ink = mixHex(c, '#000000', 0.62)
  const metal = isMetalLevel(level)
  const uid = `rb${level}-${st}-${size}`

  const petals = Array.from({ length: 16 }, (_, i) => {
    const a = (i * Math.PI) / 8 + Math.PI / 16
    return (
      <circle key={i} cx={(32 + 18.5 * Math.cos(a)).toFixed(2)}
        cy={(30 + 18.5 * Math.sin(a)).toFixed(2)} r="5.2"
        fill={metal ? `url(#${uid})` : c} />
    )
  })

  return (
    <svg width={size} height={Math.round((size * 92) / 64)} viewBox="0 0 64 92"
      role="img" aria-label={label || `Level ${level} stage ${st}`}
      style={earned ? undefined : { filter: 'grayscale(1)', opacity: 0.3 }}>
      {metal && (
        <defs>
          <linearGradient id={uid} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor={mixHex(c, '#fff6d0', 0.55)} />
            <stop offset=".45" stopColor={c} />
            <stop offset="1" stopColor={mixHex(c, '#000000', 0.3)} />
          </linearGradient>
        </defs>
      )}
      <path d="M21 50 L11 89 L23 82 L32 88 L29 56 Z" fill={dark} />
      <path d="M43 50 L53 89 L41 82 L32 88 L35 56 Z" fill={mixHex(c, '#000000', 0.18)} />
      <rect x="18.5" y="44" width="27" height="19" rx="7" fill={dark} />
      {[0, 1, 2].map(i => (
        <circle key={i} cx={25.5 + 6.5 * i} cy="57" r="2.3"
          fill={i < st ? light : 'rgba(255,255,255,.28)'} />
      ))}
      {petals}
      <circle cx="32" cy="30" r="19.5" fill={metal ? `url(#${uid})` : c} />
      {metal && (
        <circle cx="32" cy="30" r="19.5" fill="none"
          stroke={mixHex(c, '#4a3708', 0.55)} strokeWidth="1" />
      )}
      <circle cx="32" cy="30" r="15" fill={light} />
      <circle cx="32" cy="30" r="15" fill="none" stroke={dark} strokeWidth="1.3" opacity=".5" />
      <text x="32" y="30" textAnchor="middle" dominantBaseline="central" fontSize="20"
        fontWeight="700" fill={ink} fontFamily="system-ui,-apple-system,sans-serif">
        {level}
      </text>
    </svg>
  )
}
