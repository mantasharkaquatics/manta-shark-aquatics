import type { CSSProperties } from 'react'

export const GOLD = '#c9a84c'
export const NAVY = '#1a2744'
export const DARK = '#111d38'

export const PAGE: CSSProperties = {
  background: DARK,
  color: '#fff',
  minHeight: '100vh',
  padding: '48px 24px 64px',
}

export const CARD: CSSProperties = {
  maxWidth: '460px',
  margin: '0 auto',
  background: NAVY,
  borderRadius: '14px',
  padding: '32px',
  border: '1px solid rgba(255,255,255,0.08)',
}

export const H1: CSSProperties = {
  fontSize: '24px',
  fontWeight: 700,
  margin: '0 0 8px',
}

export const SUB: CSSProperties = {
  fontSize: '15px',
  lineHeight: 1.7,
  color: 'rgba(255,255,255,0.72)',
  margin: '0 0 24px',
}

export const LABEL: CSSProperties = {
  display: 'block',
  fontSize: '13px',
  fontWeight: 600,
  color: 'rgba(255,255,255,0.82)',
  margin: '0 0 6px',
}

export const INPUT: CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  background: DARK,
  color: '#fff',
  border: '1px solid rgba(255,255,255,0.18)',
  borderRadius: '8px',
  padding: '11px 13px',
  fontSize: '16px',
  outline: 'none',
}

export const FIELD: CSSProperties = { margin: '0 0 16px' }

export const BUTTON: CSSProperties = {
  width: '100%',
  background: GOLD,
  color: NAVY,
  border: 'none',
  borderRadius: '8px',
  padding: '13px',
  fontSize: '16px',
  fontWeight: 700,
  cursor: 'pointer',
}

export const BUTTON_DISABLED: CSSProperties = {
  ...BUTTON,
  background: 'rgba(201,168,76,0.45)',
  color: 'rgba(26,39,68,0.6)',
  cursor: 'not-allowed',
}

export const ERROR: CSSProperties = {
  background: 'rgba(220,60,60,0.14)',
  border: '1px solid rgba(220,60,60,0.4)',
  color: '#ffb4b4',
  borderRadius: '8px',
  padding: '11px 13px',
  fontSize: '14px',
  lineHeight: 1.6,
  margin: '0 0 16px',
}

export const LINK: CSSProperties = {
  color: GOLD,
  textDecoration: 'none',
  fontWeight: 600,
}

export const FOOT: CSSProperties = {
  fontSize: '14px',
  color: 'rgba(255,255,255,0.6)',
  textAlign: 'center',
  margin: '20px 0 0',
}
