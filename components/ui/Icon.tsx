/* The app's line icons (owner, 2026-11-05, 決定 10 選項 A): one set, drawn
   like the tab bar's (24-unit box, 1.9 stroke, round ends, currentColor),
   instead of emoji, which every phone draws its own way. Something to stand
   out sits on a brand-colour round (`.msa-ic-round` in the page's CSS), not
   on a coloured emoji. Add a shape here rather than an emoji in a page. */

const P: Record<string, React.ReactNode> = {
  card: <><rect x="3" y="6" width="18" height="13" rx="2.5" /><path d="M3 10h18M7 15h3" /></>,
  gift: <><rect x="4" y="10" width="16" height="10" rx="1.5" /><path d="M3 7h18v3H3zM12 7v13M12 7c-2-3.5-6-3-5-.5S12 7 12 7zM12 7c2-3.5 6-3 5-.5S12 7 12 7z" /></>,
  people: <><circle cx="9" cy="8" r="3.2" /><path d="M3.5 19c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5" /><circle cx="16.5" cy="9" r="2.6" /><path d="M15.5 14.2c2.6-.3 4.5 1.4 5 4.8" /></>,
  group: <><circle cx="12" cy="7.5" r="2.6" /><circle cx="5.5" cy="10" r="2.2" /><circle cx="18.5" cy="10" r="2.2" /><path d="M7.5 19c.5-3 2.3-4.6 4.5-4.6s4 1.6 4.5 4.6M2 19c.3-2.3 1.6-3.6 3.5-3.6M22 19c-.3-2.3-1.6-3.6-3.5-3.6" /></>,
  user: <><circle cx="12" cy="8" r="3.6" /><path d="M5 20c.8-4 3.6-6 7-6s6.2 2 7 6" /></>,
  bell: <><path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z" /><path d="M10 20.5a2.2 2.2 0 0 0 4 0" /></>,
  school: <path d="M3 10l9-5 9 5M5 10v9h14v-9M10 19v-5h4v5" />,
  chat: <path d="M4 5h16v11H9l-5 4z" />,
  map: <><path d="M9 4 3 6.5v13L9 17l6 2.5 6-2.5v-13L15 6.5 9 4z" /><path d="M9 4v13M15 6.5v13" /></>,
  clipboard: <><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 3h6v3H9zM8.5 11h7M8.5 15h5" /></>,
  note: <><path d="M5 4h10l4 4v12H5z" /><path d="M15 4v4h4M8.5 12h7M8.5 16h5" /></>,
  medal: <><circle cx="12" cy="15" r="5" /><path d="M8.5 11 6 3h4l2 5 2-5h4l-2.5 8" /></>,
  trophy: <><path d="M7 4h10v5a5 5 0 0 1-10 0z" /><path d="M7 6H4v1.5A3.5 3.5 0 0 0 7.5 11M17 6h3v1.5A3.5 3.5 0 0 1 16.5 11M12 14v3M8.5 20h7M9.5 17h5v3h-5z" /></>,
  calendar: <><rect x="3.5" y="5" width="17" height="15" rx="2.5" /><path d="M3.5 10h17M8 3v4M16 3v4" /></>,
  pin: <><path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z" /><circle cx="12" cy="9.5" r="2.5" /></>,
  lifebuoy: <><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="3.5" /><path d="M5.9 5.9l3.6 3.6M14.5 14.5l3.6 3.6M18.1 5.9l-3.6 3.6M9.5 14.5l-3.6 3.6" /></>,
  eye: <><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" /><circle cx="12" cy="12" r="3" /></>,
  ticket: <><path d="M3 8a2 2 0 0 0 2-2h14a2 2 0 0 0 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 0-2 2H5a2 2 0 0 0-2-2v-2a2 2 0 0 0 0-4z" /><path d="M14 6v12" strokeDasharray="2 2" /></>,
  bookmark: <path d="M7 3.5h10v17l-5-3.5-5 3.5z" />,
  pool: <><path d="M3 16c1.5 1.3 3 1.3 4.5 0s3-1.3 4.5 0 3 1.3 4.5 0 3-1.3 4.5 0M3 20c1.5 1.3 3 1.3 4.5 0s3-1.3 4.5 0 3 1.3 4.5 0 3-1.3 4.5 0" /><path d="M8 13V5.5a2 2 0 0 1 4 0M16 13V5.5a2 2 0 0 0-4 0M8 9h8" /></>,
  ladder: <path d="M7 3v18M17 3v18M7 7h10M7 12h10M7 17h10" />,
  tag: <><path d="M3.5 12.5V4.5a1 1 0 0 1 1-1h8l8 8-9 9z" /><circle cx="8.5" cy="8.5" r="1.6" /></>,
  question: <><circle cx="12" cy="12" r="9" /><path d="M9.5 9.5a2.6 2.6 0 0 1 5 .9c0 1.8-2.5 2.2-2.5 4M12 17.5v.01" /></>,
  fin: <><path d="M4 17c2-1 3.5-6 7.5-10.5 1 4 3.5 8 8.5 10.5" /><path d="M2.5 20.5c1.6 1.2 3.2 1.2 4.8 0s3.2-1.2 4.8 0 3.2 1.2 4.8 0 3.2-1.2 4.8 0" /></>,
  doc: <><path d="M6 3.5h8.5L19 8v12.5H6z" /><path d="M14.5 3.5V8H19" /></>,
  link: <><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1.2 1.2" /><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1.2-1.2" /></>,
  receipt: <><path d="M6 3h12v18l-2-1.5-2 1.5-2-1.5-2 1.5-2-1.5L6 21z" /><path d="M9 8h6M9 12h6M9 16h3" /></>,
  cart: <><path d="M3 4h2.5l2.2 11h10.6l2-8H6.5" /><circle cx="9.5" cy="19" r="1.4" /><circle cx="17" cy="19" r="1.4" /></>,
  mail: <><rect x="3" y="5.5" width="18" height="13" rx="2" /><path d="M3.5 7l8.5 6 8.5-6" /></>,
  check: <><circle cx="12" cy="12" r="9" /><path d="M8 12.5l2.8 2.8L16.5 9.5" /></>,
  warn: <><path d="M12 3.5 2.5 20h19z" /><path d="M12 10v4.5M12 17.5v.01" /></>,
  megaphone: <><path d="M4 10v4h3l8 4V6L7 10z" /><path d="M18 9.5a3.5 3.5 0 0 1 0 5M7 14l1 5h2.5l-1-5" /></>,
  clock: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>,
  star: <path d="M12 3.5l2.6 5.3 5.8.8-4.2 4.1 1 5.8L12 16.8l-5.2 2.7 1-5.8-4.2-4.1 5.8-.8z" />,
  rotate: <><path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3" /><path d="M19.5 4v4h-4" /></>,
  back: <path d="M15 5l-7 7 7 7" />,
  flag: <path d="M5 21V4M5 4h11l-2 4 2 4H5" />,
  lock: <><rect x="5" y="10.5" width="14" height="10" rx="2" /><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" /></>,
  heart: <path d="M12 20s-7.5-4.5-7.5-10A4.3 4.3 0 0 1 12 7.5 4.3 4.3 0 0 1 19.5 10c0 5.5-7.5 10-7.5 10z" />,
}

export type IconName = keyof typeof P

export default function Icon({ name, size, style, className }: { name: IconName | string; size?: number | string; style?: React.CSSProperties; className?: string }) {
  const d = P[name]
  if (!d) return null
  // No size: 1em, sitting on the text line like the emoji it replaced.
  const s = size ?? '1.15em'
  return (
    <svg viewBox="0 0 24 24" width={s} height={s} fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true" focusable="false" className={className}
      style={{ display: 'inline-block', verticalAlign: size == null ? '-0.2em' : 'middle', flex: 'none', ...style }}>
      {d}
    </svg>
  )
}
