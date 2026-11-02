'use client'

import { useState } from 'react'
import { useT } from '@/lib/i18n/provider'
import { useDialogFocus } from '@/lib/use-dialog-focus'
import { appPlatform, calendarAddPlugin } from '@/lib/native-app'

/* "Add to calendar" on a lesson (owner, 2026-11-02: two choices, Google or
   the iPhone's own). It used to be a link to the lesson's .ics file, which
   the phone app cannot open -- its web view gave up and showed the "no
   internet" page.

   - Google Calendar: Google's own "add event" page, filled in
     (/api/parent/calendar?format=json gives the link). Outside the site, so
     the app hands it to Safari or the Google Calendar app.
   - iPhone Calendar: in the app, iPhone's own "New Event" screen
     (mobile/ios/App/App/CalendarAdd.swift); in a browser on an iPhone, the
     .ics file, which Safari opens as "Add to Calendar".
   - Elsewhere in a browser the file is offered as "other calendar"
     (Outlook, Apple Calendar on a Mac). The Android app, and iPhone builds
     made before CalendarAdd, offer Google only. */

type Ev = { title: string; location: string; description: string; start: number; end: number; google: string }

const iosBrowser = () => typeof navigator !== 'undefined' &&
  (/iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1))

export default function AddToCalendar({ bookingId, style }: { bookingId: string; style?: React.CSSProperties }) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const [ev, setEv] = useState<Ev | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const close = () => { setOpen(false); setMsg(null) }
  const box = useDialogFocus(open, close)
  const icsUrl = `/api/parent/calendar?booking=${encodeURIComponent(bookingId)}`

  const platform = appPlatform()
  const native = calendarAddPlugin()
  // The second choice: the iPhone's own screen, the .ics file, or none.
  const second: 'native' | 'ics' | null = platform === 'ios' ? (native ? 'native' : null) : platform === 'android' ? null : 'ics'
  const secondLabel = second === 'native' || iosBrowser() ? t('dash.cal.iphone') : t('dash.cal.other')

  function show() {
    setOpen(true); setMsg(null)
    if (ev) return
    fetch(`${icsUrl}&format=json`, { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : null)).then(j => { if (j?.google) setEv(j); else setMsg(t('dash.cal.failed')) })
      .catch(() => setMsg(t('dash.cal.failed')))
  }

  async function addNative() {
    if (!native || !ev) return
    setBusy(true)
    try {
      const r = await native.add({ title: ev.title, location: ev.location, notes: ev.description, start: ev.start, end: ev.end })
      if (r.denied) setMsg(t('dash.cal.denied'))
      else if (r.added) { setMsg(t('dash.cal.added')) }
      else close()
    } catch { setMsg(t('dash.cal.failed')) }
    setBusy(false)
  }

  const choice: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', width: '100%', boxSizing: 'border-box',
    padding: '13px', borderRadius: '12px', border: '1px solid #cfdcef', background: '#fff', color: '#16294a', fontSize: '15px', fontWeight: 700,
    textDecoration: 'none', cursor: 'pointer', fontFamily: 'inherit' }

  return (
    <>
      <button type="button" onClick={show} style={style}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18M12 14v4M10 16h4" /></svg>
        {t('dash.addToCalendar')}
      </button>
      {open && (
        <div onClick={e => { e.stopPropagation(); close() }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(14,29,59,0.55)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div ref={box} role="dialog" aria-modal="true" aria-label={t('dash.addToCalendar')} onClick={e => e.stopPropagation()}
            style={{ background: '#fff', borderRadius: '18px', padding: '22px 20px 16px', width: '100%', maxWidth: '340px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <h3 style={{ margin: '0 0 6px', fontSize: '17px', fontWeight: 800, color: '#16294a', textAlign: 'center' }}>{t('dash.addToCalendar')}</h3>
            {msg ? (
              <p role="status" style={{ margin: '4px 0 8px', fontSize: '14px', color: '#3c4b66', textAlign: 'center', lineHeight: 1.6 }}>{msg}</p>
            ) : (
              <>
                <a href={ev?.google || undefined} target="_blank" rel="noopener noreferrer" aria-disabled={!ev || undefined}
                  onClick={e => { if (!ev) { e.preventDefault(); return } setTimeout(close, 300) }}
                  style={{ ...choice, opacity: ev ? 1 : 0.55 }}>
                  <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true"><path fill="#4285F4" d="M45.1 24.5c0-1.6-.1-3.1-.4-4.5H24v8.5h11.8c-.5 2.8-2.1 5.1-4.4 6.7v5.5h7.1c4.2-3.8 6.6-9.5 6.6-16.2z" /><path fill="#34A853" d="M24 46c5.9 0 10.9-2 14.5-5.3l-7.1-5.5c-2 1.3-4.5 2.1-7.4 2.1-5.7 0-10.6-3.8-12.3-9H4.4v5.7C8 41.1 15.4 46 24 46z" /><path fill="#FBBC05" d="M11.7 28.3c-.4-1.3-.7-2.8-.7-4.3s.3-3 .7-4.3V14H4.4C2.9 17 2 20.4 2 24s.9 7 2.4 10l7.3-5.7z" /><path fill="#EA4335" d="M24 10.7c3.2 0 6.1 1.1 8.4 3.3l6.3-6.3C34.9 4.2 29.9 2 24 2 15.4 2 8 6.9 4.4 14l7.3 5.7c1.7-5.2 6.6-9 12.3-9z" /></svg>
                  {t('dash.cal.google')}
                </a>
                {second === 'native' && (
                  <button type="button" disabled={!ev || busy} onClick={addNative} style={{ ...choice, opacity: ev && !busy ? 1 : 0.55 }}>
                    <CalIcon />{secondLabel}
                  </button>
                )}
                {second === 'ics' && (
                  <a href={icsUrl} onClick={() => setTimeout(close, 300)} style={choice}><CalIcon />{secondLabel}</a>
                )}
              </>
            )}
            <button type="button" onClick={close}
              style={{ marginTop: '2px', padding: '10px', border: 'none', background: 'transparent', color: '#56647d', fontSize: '14px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
              {msg ? t('common.close') : t('common.cancel')}
            </button>
          </div>
        </div>
      )}
    </>
  )
}

function CalIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#d93825" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="4" width="18" height="18" rx="3" /><path d="M16 2v4M8 2v4M3 10h18" />
    </svg>
  )
}
