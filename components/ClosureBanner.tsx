'use client'

import { useEffect, useRef, useState } from 'react'
import { useT, useLocale } from '@/lib/i18n/provider'
import { dateTag } from '@/lib/i18n'

/* The pool-closed banner (owner, 2026-10-23: "全站最上方，所有人都看得到").
   Sits just under the floating nav bar on every public and family page,
   from the moment the desk closes the pool until the closure ends or the
   desk takes it down (/admin/closures; lib/closures.ts). A visitor can hide
   it for this visit. While it shows it adds its height to --closure-h, which
   the nav bar's spacer adds to --nav-space, so it covers nothing. */

type Closure = {
  id: string
  pool: string | null
  start_date: string
  end_date: string
  start_time: string | null
  end_time: string | null
  reason_key: string
  reason_text: string | null
}

const HIDDEN_KEY = 'msa-closure-hidden'

function clock(t: string) {
  const [h, m] = t.split(':').map(Number)
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`
}

export default function ClosureBanner() {
  const t = useT()
  const locale = useLocale()
  const [list, setList] = useState<Closure[]>([])
  // Hidden by this visitor in this visit (sessionStorage; none on the server).
  const [hidden, setHidden] = useState<string[]>(() => {
    try { return JSON.parse(sessionStorage.getItem(HIDDEN_KEY) || '[]') } catch { return [] }
  })
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetch('/api/closures').then(r => (r.ok ? r.json() : { closures: [] })).then(d => setList(d.closures || [])).catch(() => {})
  }, [])

  const shown = list.filter(c => !hidden.includes(c.id))

  // Make room for it under the nav bar, and give the room back when it goes.
  useEffect(() => {
    const root = document.documentElement
    const el = ref.current
    if (!el || shown.length === 0) { root.style.setProperty('--closure-h', '0px'); return }
    const set = () => root.style.setProperty('--closure-h', `${Math.ceil(el.getBoundingClientRect().height) + 8}px`)
    set()
    const ro = new ResizeObserver(set)
    ro.observe(el)
    return () => { ro.disconnect(); root.style.setProperty('--closure-h', '0px') }
  }, [shown.length])

  if (shown.length === 0) return null

  const day = (d: string, withWeekday: boolean) => new Date(d + 'T12:00:00Z').toLocaleDateString(dateTag(locale),
    withWeekday ? { month: 'long', day: 'numeric', weekday: 'short', timeZone: 'UTC' } : { month: 'long', day: 'numeric', timeZone: 'UTC' })
  const when = (c: Closure) => c.start_date !== c.end_date
    ? `${day(c.start_date, false)} – ${day(c.end_date, false)}`
    : c.start_time && c.end_time
      ? `${day(c.start_date, true)} ${clock(c.start_time)} – ${clock(c.end_time)}`
      : day(c.start_date, true)
  const reason = (c: Closure) => c.reason_key === 'other' ? (c.reason_text || '') : t('closure.reason.' + c.reason_key)

  const hide = (id: string) => {
    const next = [...hidden, id]
    setHidden(next)
    try { sessionStorage.setItem(HIDDEN_KEY, JSON.stringify(next)) } catch {}
  }

  return (
    <div ref={ref} role="status" style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
      {shown.map(c => (
        <div key={c.id} style={{
          display: 'flex', alignItems: 'flex-start', gap: 10, background: '#b4321f', color: '#fff',
          borderRadius: 10, padding: '10px 12px 10px 16px', boxShadow: '0 6px 24px rgba(10,22,48,.16)',
          fontSize: 14, lineHeight: 1.5, fontWeight: 600,
        }}>
          <span aria-hidden="true" style={{ flexShrink: 0 }}>⚠️</span>
          <span style={{ flex: 1, minWidth: 0 }}>
            {t(c.pool ? 'closure.banner.textPool' : 'closure.banner.text', { when: when(c), pool: c.pool || '', reason: reason(c) })}
          </span>
          <button type="button" onClick={() => hide(c.id)} aria-label={t('closure.banner.hide')} className="tap-auto"
            style={{ flexShrink: 0, background: 'transparent', border: 'none', color: '#fff', fontSize: 18, lineHeight: 1, cursor: 'pointer', padding: '2px 4px' }}>
            ×
          </button>
        </div>
      ))}
    </div>
  )
}
