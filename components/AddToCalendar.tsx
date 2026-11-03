'use client'

import { useEffect, useState, useSyncExternalStore } from 'react'
import { useT } from '@/lib/i18n/provider'
import { appPlatform, calendarAddPlugin } from '@/lib/native-app'

/* 把課表加進行事曆 at the top of the schedule (owner, 2026-11-02: all the
   family's lessons at once, kept up to date, never twice, a cancelled lesson
   goes away). The family subscribes its calendar to its own lesson feed
   (lib/calendar-feed.ts) once; after that the calendar reads it by itself.
   This replaced a per-lesson "add to calendar" button the same day.

   - Google 日曆: Google's "add this calendar" page.
   - iPhone 行事曆: the webcal:// link -- iOS asks "Subscribe?". Inside the iOS
     app it goes through the CalendarAdd plugin (the web view cannot open it
     and showed its "no internet" page). On a computer the same link reads
     "Apple／Outlook 行事曆". Google 日曆 is on a computer only (below).
   - 複製連結 for any other calendar.
   - With "sign in with Google" set up (lib/google-calendar, env), Google
     日曆 on every phone and computer signs in with Google instead and our
     server writes the lessons into that account; once connected the card
     says so, with 停止同步 (deletes the calendar we made).

   The full card shows once (owner, 2026-11-02: "it takes too much room --
   show it the first time, then fold it"): the first time this phone or
   computer opens the schedule, with a ✕ to fold it at once. After that, or
   once a calendar reads the feed, it is one line (version C of three) that
   opens the card again. "Seen" is kept in this browser (localStorage), so
   another phone shows the card once too. */

const SEEN_KEY = 'msa_cal_card_seen'
const wasSeen = () => { try { return localStorage.getItem(SEEN_KEY) === '1' } catch { return true } }
const markSeen = () => { try { localStorage.setItem(SEEN_KEY, '1') } catch { /* private mode */ } }

type Feed = { webcal: string; https: string; google: string; synced: boolean; googleOn?: boolean; googleLinked?: boolean }

const iosBrowser = () => typeof navigator !== 'undefined' &&
  (/iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1))
const androidBrowser = () => typeof navigator !== 'undefined' && /Android/.test(navigator.userAgent)

export default function AddToCalendar() {
  const t = useT()
  const [feed, setFeed] = useState<Feed | null>(null)
  const [failed, setFailed] = useState(false)
  // null until the feed is in: nothing shows, so the card never jumps.
  const [full, setFull] = useState<boolean | null>(null)
  const [copied, setCopied] = useState(false)
  // Which second button this phone or computer gets -- only known in the
  // browser, so nothing until after hydration.
  const client = useSyncExternalStore(() => () => {}, () => true, () => false)
  const p = client ? appPlatform() : null
  const where: { apple: 'native' | 'link' | null; label: string } = !client ? { apple: null, label: '' }
    : p === 'ios' ? { apple: calendarAddPlugin() ? 'native' : null, label: 'iphone' }
    : p === 'android' || androidBrowser() ? { apple: null, label: '' }
    : { apple: 'link', label: iosBrowser() ? 'iphone' : 'apple' }
  // Google only on a computer (owner, 2026-11-02). Google Calendar's phone
  // app cannot subscribe to a link -- on the owner's iPhone it opened a
  // Google sales page -- and mailing the link to open on a computer was
  // tried and dropped the same day as too fiddly. On a phone Google comes
  // back as "sign in with Google" once Google approves that (planned).
  // With "sign in with Google" set up (feed.googleOn, lib/google-calendar),
  // Google is on every phone and computer and connects the account instead.
  const connect = !!feed?.googleOn
  const google = client && (connect || !(p !== null || iosBrowser() || androidBrowser()))
  const [going, setGoing] = useState(false)
  const [stopAsk, setStopAsk] = useState(false)
  const [stopping, setStopping] = useState(false)

  useEffect(() => {
    let live = true
    const load = (firstLoad: boolean) => fetch('/api/parent/calendar-feed', { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : null))
      .then(j => {
        if (!live) return
        if (!j?.webcal) { if (firstLoad) setFailed(true); return }
        setFeed(j)
        if (!firstLoad) return
        const first = !j.synced && !wasSeen()
        if (first) markSeen()
        setFull(first)
      })
      .catch(() => { if (live && firstLoad) setFailed(true) })
    load(true)
    // Back from Google's page (in the app that was Safari): read it again.
    const again = () => { if (document.visibilityState === 'visible') { setGoing(false); load(false) } }
    document.addEventListener('visibilitychange', again)
    return () => { live = false; document.removeEventListener('visibilitychange', again) }
  }, [])

  // Nothing this phone can use (Android, or an iPhone app built before the
  // calendar plugin): no card at all.
  if (failed || full === null || (client && !google && !where.apple && !feed?.googleLinked)) return null

  const subscribeApple = async () => {
    const plugin = calendarAddPlugin()
    if (plugin && feed) { try { await plugin.subscribe({ url: feed.webcal }) } catch { /* the family can try Google */ } }
  }
  // Off to Google's sign-in. Inside the app the web view hands Google's page
  // to Safari (Google will not sign in inside an app).
  const connectGoogle = async () => {
    setGoing(true)
    try {
      const r = await fetch(`/api/calendar/google/start${p ? '?app=1' : ''}`, { cache: 'no-store' })
      const j = await r.json().catch(() => ({}))
      if (j.url) { window.location.href = j.url; return }
    } catch { /* fall through */ }
    setGoing(false)
  }
  const stopGoogle = async () => {
    setStopping(true)
    try { await fetch('/api/calendar/google/disconnect', { method: 'POST' }) } catch { /* shown below as still linked */ }
    try { const r = await fetch('/api/parent/calendar-feed', { cache: 'no-store' }); if (r.ok) setFeed(await r.json()) } catch { /* keep */ }
    setStopping(false); setStopAsk(false)
  }
  const copy = async () => {
    if (!feed) return
    try { await navigator.clipboard.writeText(feed.https); setCopied(true); setTimeout(() => setCopied(false), 2000) } catch { /* no clipboard */ }
  }

  const btn: React.CSSProperties = { flex: '1 1 0', minWidth: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '11px 10px',
    borderRadius: '10px', border: '1px solid #cfdcef', background: '#fff', color: '#16294a', fontSize: '14px', fontWeight: 700, textDecoration: 'none',
    cursor: 'pointer', fontFamily: 'inherit', opacity: feed ? 1 : 0.55, whiteSpace: 'nowrap' }

  // The one line: tap to open the card.
  if (!full) return (
    <button type="button" className="msa-cal-sync tap-auto" aria-expanded={false} onClick={() => setFull(true)}
      style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%', boxSizing: 'border-box', marginBottom: '14px', padding: '10px 14px',
        background: '#fff', border: '1px solid #dbe6f4', borderRadius: '12px', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
        fontSize: '14px', fontWeight: 700, color: feed?.synced ? '#1d6b45' : '#2050a0' }}>
      {feed?.synced ? <span aria-hidden="true" style={{ width: '18px', textAlign: 'center' }}>✓</span> : <CalIcon size={18} />}
      <span style={{ minWidth: 0, flex: 1 }}>{feed?.synced ? t('dash.sync.on') : t('dash.sync.title')}</span>
      <span aria-hidden="true" style={{ color: '#9aa6ba', fontSize: '18px', lineHeight: 1 }}>›</span>
    </button>
  )

  return (
    <div className="msa-cal-sync" style={{ position: 'relative', background: '#f4f8fd', border: '1px solid #dbe6f4', borderRadius: '14px', padding: '14px', marginBottom: '16px' }}>
      <button type="button" className="tap-auto" aria-label={t('common.close')} onClick={() => setFull(false)}
        style={{ position: 'absolute', top: '6px', right: '6px', width: '32px', height: '32px', border: 'none', background: 'none', color: '#8a96aa',
          fontSize: '17px', cursor: 'pointer', fontFamily: 'inherit', lineHeight: 1 }}>✕</button>
      <>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', marginBottom: '12px', paddingRight: '24px' }}>
            <CalIcon />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: '15px', fontWeight: 800, color: '#16294a' }}>{t('dash.sync.title')}</div>
              <div style={{ fontSize: '13px', color: '#56647d', lineHeight: 1.5, marginTop: '2px' }}>{t('dash.sync.desc')}</div>
            </div>
          </div>
          {connect && feed?.googleLinked && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '10px', padding: '10px 12px', borderRadius: '10px', background: '#fff', border: '1px solid #cfe6d8' }}>
              <GoogleG />
              <span style={{ flex: 1, minWidth: 0, fontSize: '14px', fontWeight: 700, color: '#1d6b45' }}>✓ {t('dash.sync.gLinked')}</span>
              {!stopAsk ? (
                <button type="button" className="tap-auto" onClick={() => setStopAsk(true)}
                  style={{ border: 'none', background: 'none', padding: '4px 0', color: '#c0392b', fontSize: '13px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                  {t('dash.sync.gStop')}
                </button>
              ) : (
                <span style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '10px', marginTop: '4px' }}>
                  <span style={{ flex: 1, fontSize: '12.5px', color: '#56647d', lineHeight: 1.5 }}>{t('dash.sync.gStopAsk')}</span>
                  <button type="button" className="tap-auto" disabled={stopping} onClick={stopGoogle}
                    style={{ border: 'none', borderRadius: '8px', background: '#d93825', color: '#fff', padding: '7px 12px', fontSize: '13px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                    {t('dash.sync.gStopYes')}
                  </button>
                  <button type="button" className="tap-auto" onClick={() => setStopAsk(false)}
                    style={{ border: 'none', background: 'none', color: '#56647d', fontSize: '13px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                    {t('common.cancel')}
                  </button>
                </span>
              )}
            </div>
          )}
          <div style={{ display: 'flex', gap: '8px' }}>
            {google && connect && !feed?.googleLinked && (
              <button type="button" disabled={!feed || going} onClick={connectGoogle} style={{ ...btn, opacity: going ? 0.6 : 1 }}>
                <GoogleG />{going ? t('dash.sync.gWait') : t('dash.sync.google')}
              </button>
            )}
            {google && !connect && (
              <a href={feed?.google || undefined} target="_blank" rel="noopener noreferrer" aria-disabled={!feed || undefined}
                onClick={e => { if (!feed) e.preventDefault() }} style={btn}>
                <GoogleG />{t('dash.sync.google')}
              </a>
            )}
            {where.apple === 'native' && (
              <button type="button" disabled={!feed} onClick={subscribeApple} style={btn}>
                <AppleCal />{t('dash.sync.iphone')}
              </button>
            )}
            {where.apple === 'link' && (
              <a href={feed?.webcal || undefined} aria-disabled={!feed || undefined} onClick={e => { if (!feed) e.preventDefault() }} style={btn}>
                <AppleCal />{where.label === 'iphone' ? t('dash.sync.iphone') : t('dash.sync.apple')}
              </a>
            )}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', marginTop: '10px' }}>
            <span style={{ fontSize: '12px', color: '#7a879c' }}>{google && !connect ? t('dash.sync.slow') : ''}</span>
            <button type="button" className="tap-auto" onClick={copy} disabled={!feed}
              style={{ border: 'none', background: 'none', padding: '4px 0', color: '#2050a0', fontSize: '12.5px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
              {copied ? t('dash.sync.copied') : t('dash.sync.copy')}
            </button>
          </div>
      </>
    </div>
  )
}

function CalIcon({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#2050a0" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0, marginTop: '1px' }}>
      <rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01" />
    </svg>
  )
}

function GoogleG() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true" style={{ flexShrink: 0 }}><path fill="#4285F4" d="M45.1 24.5c0-1.6-.1-3.1-.4-4.5H24v8.5h11.8c-.5 2.8-2.1 5.1-4.4 6.7v5.5h7.1c4.2-3.8 6.6-9.5 6.6-16.2z" /><path fill="#34A853" d="M24 46c5.9 0 10.9-2 14.5-5.3l-7.1-5.5c-2 1.3-4.5 2.1-7.4 2.1-5.7 0-10.6-3.8-12.3-9H4.4v5.7C8 41.1 15.4 46 24 46z" /><path fill="#FBBC05" d="M11.7 28.3c-.4-1.3-.7-2.8-.7-4.3s.3-3 .7-4.3V14H4.4C2.9 17 2 20.4 2 24s.9 7 2.4 10l7.3-5.7z" /><path fill="#EA4335" d="M24 10.7c3.2 0 6.1 1.1 8.4 3.3l6.3-6.3C34.9 4.2 29.9 2 24 2 15.4 2 8 6.9 4.4 14l7.3 5.7c1.7-5.2 6.6-9 12.3-9z" /></svg>
  )
}

function AppleCal() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#d93825" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
      <rect x="3" y="4" width="18" height="18" rx="3" /><path d="M16 2v4M8 2v4M3 10h18" />
    </svg>
  )
}
