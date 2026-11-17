'use client'
import { useTabPanel } from '@/lib/tab-panel'

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useLocale, useT } from '@/lib/i18n/provider'
import { dateTag } from '@/lib/i18n'
import ChatWidget, { type ChatEvent } from '@/components/ChatWidget'
import { closureText, type Closure } from '@/components/ClosureBanner'
import { myParentId } from '@/lib/my-parent'
import { isNativeApp } from '@/lib/native-app'
import { BRAND, FONT_BODY } from '@/lib/brand'
import { fmtDate } from '@/lib/fmt-date'
import Icon from '@/components/ui/Icon'
import Sheet from '@/components/ui/Sheet'
import { INBOX_OPEN_EVENT, INBOX_SEEN_EVENT } from '@/lib/chat-open'

/* 訊息, the phone app's message screen (owner, 2026-11-17, 樣本 B): one
   conversation with the AI and the desk (components/ChatWidget variant
   'page'), with the school's notices -- reports, stage ups, closures,
   changes to lessons -- in it by time. A bell holds the school's news and
   every notice: active pool closures, the desk's announcements
   (lib/announcements.ts, pinned first) and what the school told this person
   (90 days, push_log). In the app the bell is in the top bar
   (components/AppShell, a red number while some are new); on the website it
   is in the navy header. Opening the list marks it all read. ?tab=notices
   (or the old ?tab=news, which a pushed announcement opens) opens the list.
   (Before: two tabs, 通知｜客服, owner 2026-10-28.)

   On the website it fills the screen with a navy header; in the app it
   sits between the app's bars (css below). */

type Announcement = { id: string; title: string; body: string; pinned: boolean; created_at: string }
type Inbox = { announcements: Announcement[]; closures: Closure[]; notices: ChatEvent[]; seen: { announcements: string | null; notices: string | null }; chat?: number }

const NEWS_ASKED = 'msa_news_push_asked'

const css = `
.ib { position: fixed; inset: 0; z-index: 70; display: flex; flex-direction: column; background: ${BRAND.paper}; font-family: ${FONT_BODY}; }
.ib-hd { display: flex; align-items: center; gap: 8px; padding: 6px 12px 8px; background: ${BRAND.navy}; color: #fff; }
.ib-hd h1 { flex: 1; margin: 0; font-size: 18px; font-weight: 800; }
.ib-back { width: 42px; height: 42px; min-height: 0; border: 0; background: none; color: #fff; display: grid; place-items: center; cursor: pointer; border-radius: 10px; margin-left: -6px; }
.ib-bell { position: relative; margin-left: 0; margin-right: -4px; }
.ib-bell i { position: absolute; top: 2px; right: 0; min-width: 18px; height: 18px; padding: 0 5px; border-radius: 9px; background: #e5484d; color: #fff;
  font-style: normal; font-size: 11px; font-weight: 800; line-height: 18px; text-align: center; box-shadow: 0 0 0 2px ${BRAND.navy}; }
.ib-back:focus-visible { outline: 2px solid ${BRAND.yellow}; outline-offset: -2px; }
.ib-body { flex: 1; min-height: 0; display: flex; flex-direction: column; background: ${BRAND.paper}; }
.ib-list { display: flex; flex-direction: column; gap: 10px; overflow-y: auto; min-height: 0; padding: 2px 2px 8px; }
.ib-sec { margin: 6px 2px -2px; font-size: 12.5px; font-weight: 800; color: ${BRAND.mute}; letter-spacing: .04em; }
.ib-empty { margin: 32px auto; text-align: center; color: ${BRAND.mute}; font-size: 15px; }
.ib-card { background: #fff; border: 1px solid ${BRAND.line}; border-radius: 12px; padding: 12px 14px; box-shadow: 0 1px 2px rgba(18,37,74,.05); color: ${BRAND.ink}; text-decoration: none; display: block; }
.ib-card.new { border-left: 3px solid ${BRAND.amber}; }
.ib-card.closure { border-left: 3px solid #b4321f; }
.ib-card h3 { margin: 0; font-size: 15.5px; font-weight: 800; color: ${BRAND.navy}; display: flex; gap: 8px; align-items: baseline; }
.ib-card p { margin: 6px 0 0; font-size: 14.5px; line-height: 1.6; white-space: pre-wrap; overflow-wrap: anywhere; }
.ib-card small { display: block; margin-top: 6px; font-size: 12px; color: #6a7891; }
.ib-pin { font-size: 11px; font-weight: 800; padding: 1px 7px; border-radius: 6px; background: #fff4dc; color: #8a5300; flex-shrink: 0; }
.ib-ask { background: #fff; border: 1px solid ${BRAND.line}; border-left: 3px solid ${BRAND.amber}; border-radius: 12px; padding: 14px; }
.ib-ask b { display: block; font-size: 15.5px; color: ${BRAND.navy}; }
.ib-ask p { margin: 6px 0 10px; font-size: 13.5px; line-height: 1.55; color: ${BRAND.mute}; }
.ib-ask div { display: flex; gap: 8px; }
.ib-ask button { flex: 1; min-height: 0; padding: 10px; border-radius: 999px; font: inherit; font-weight: 800; font-size: 14.5px; cursor: pointer; }
.ib-ask .yes { background: ${BRAND.amber}; color: ${BRAND.navy}; border: 0; }
.ib-ask .no { background: #fff; color: ${BRAND.navy}; border: 1px solid #d6e0ee; }
.ib-n { display: flex; gap: 10px; align-items: flex-start; }
.ib-n .ico { font-size: 20px; line-height: 1.3; color: #2050a0; }
.msa-sheet.ib-sheet { display: flex; flex-direction: column; font-family: ${FONT_BODY}; }
/* In the app 訊息 is a tab like the others (owner, 2026-11-12, 版本 1): the
   app's top bar and tabs stay and the page sits between them; the navy
   header goes (the bell is in the app's top bar). The keyboard takes the
   tabs away (html.msa-kb: --app-tab-h 0), so the box then sits on the
   keyboard. */
html.msa-app .ib { top: 0; padding-top: calc(var(--nav-space) + 6px); bottom: var(--app-tab-h); z-index: 1; background: #e9eff7; }
html.msa-app .ib-hd { display: none; }
html.msa-app .ib-body { border-top: 1px solid #dde6f2; }
html.msa-app .pc-inp { padding-bottom: 11px; }
`

// Line icons by name (components/ui/Icon, 決定 10).
const ICON: Record<string, string> = {
  report: 'note', stage_up: 'medal', level_up: 'trophy', reminder_24h: 'clock', reminder_1h: 'clock', reminder_30m: 'clock', waitlist_offer: 'ticket', test: 'bell',
  block_cancellation_notice: 'warn', team_practice_cancelled: 'warn',
  booking_confirmed: 'calendar', booking_series_confirmed: 'calendar', booking_rescheduled: 'calendar', booking_cancelled: 'calendar',
}

export default function ChatPage() {
  const t = useT()
  const locale = useLocale()
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const [parentId, setParentId] = useState<string | null | undefined>(undefined)
  const [inbox, setInbox] = useState<Inbox | null>(null)
  // The bell's list, and when it was last looked at as it opened: what was
  // new stays marked while the family reads it.
  const [listOpen, setListOpen] = useState(false)
  const [seenAtOpen, setSeenAtOpen] = useState<{ announcements: string | null; notices: string | null } | null>(null)
  const [askNews, setAskNews] = useState(false)
  const inApp = useSyncExternalStore(() => () => {}, () => document.documentElement.classList.contains('msa-app'), () => false)

  useEffect(() => {
    let live = true
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/login?next=/dashboard/chat'); return }
      const pid = await myParentId(supabase, user.id)
      if (live) setParentId(pid)
    })().catch(() => { if (live) setParentId(null) })
    return () => { live = false }
  }, [supabase, router])

  const openRef = useRef(false)
  useEffect(() => { openRef.current = listOpen }, [listOpen])
  const loadInbox = useCallback(() => {
    fetch('/api/app/inbox', { cache: 'no-store' }).then(r => (r.ok ? r.json() : null)).then((got: Inbox | null) => {
      if (!got) return
      // The list already open (?tab=notices) when the answer came: it is
      // being looked at, so nothing in it counts as new after.
      const now = new Date().toISOString()
      setInbox(openRef.current ? { ...got, seen: { announcements: now, notices: now } } : got)
    }).catch(() => {})
  }, [])
  useEffect(() => { loadInbox() }, [loadInbox])
  // Loaded in the background in the app's pager: read again when it comes
  // on screen.
  const panel = useTabPanel()
  const wasActive = useRef(panel?.active ?? true)
  useEffect(() => {
    const now = panel?.active ?? true
    if (now && !wasActive.current) loadInbox()
    wasActive.current = now
  }, [panel?.active, loadInbox])

  // Opening the list marks what it shows read on the server: the
  // announcements and the notices; the app's top bar drops its number.
  const openList = useCallback(() => {
    setListOpen(true)
    setInbox(i => {
      if (i) setSeenAtOpen(i.seen)
      const now = new Date().toISOString()
      return i ? { ...i, seen: { announcements: now, notices: now } } : i
    })
    for (const mark of ['announcements', 'notices']) {
      fetch('/api/app/inbox', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mark }) }).catch(() => {})
    }
    window.dispatchEvent(new Event(INBOX_SEEN_EVENT))
  }, [])
  // The bell in the app's top bar (components/AppShell); only the 訊息
  // screen on screen answers it.
  const activeRef = useRef(panel?.active ?? true)
  useEffect(() => { activeRef.current = panel?.active ?? true }, [panel?.active])
  useEffect(() => {
    const on = () => { if (activeRef.current) openList() }
    window.addEventListener(INBOX_OPEN_EVENT, on)
    return () => window.removeEventListener(INBOX_OPEN_EVENT, on)
  }, [openList])
  useEffect(() => {
    const want = new URLSearchParams(window.location.search).get('tab')
    if (want === 'news' || want === 'notices') queueMicrotask(openList)
  }, [openList])

  /* The list opened for the first time inside the app: ask once whether to
     be told of new announcements (Apple 4.5.4 wants that yes from the family). */
  useEffect(() => {
    if (!listOpen || !isNativeApp()) return
    let asked = false
    try { asked = localStorage.getItem(NEWS_ASKED) === '1' } catch { /* private */ }
    if (asked) return
    fetch('/api/push/settings', { cache: 'no-store' }).then(r => (r.ok ? r.json() : null)).then(d => { if (d && d.news === false) setAskNews(true) }).catch(() => {})
  }, [listOpen])
  const answerNews = (yes: boolean) => {
    setAskNews(false)
    try { localStorage.setItem(NEWS_ASKED, '1') } catch { /* private */ }
    if (yes) fetch('/api/push/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ news: true }) }).catch(() => {})
  }

  const newer = (at: string, seen: string | null | undefined) => !seen || at > seen
  // The website's bell has its own number (the app's is in its top bar).
  const fresh = !inbox ? 0
    : inbox.notices.filter(n => newer(n.created_at, inbox.seen.notices)).length
      + inbox.announcements.filter(a => newer(a.created_at, inbox.seen.announcements)).length
      + (inbox.seen.announcements ? 0 : inbox.closures.length)
  // The date in the family's language, the clock as everywhere else in the app: 3:35 PM.
  const when = (iso: string) => fmtDate(new Date(iso), dateTag(locale), { month: 'short', day: 'numeric', timeZone: 'America/Los_Angeles' })
    + ' ' + new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Los_Angeles' })

  // In the app's pager (components/TabPager) the tabs are not pages in the
  // history: back is 首頁.
  const back = () => {
    if (!panel && window.history.length > 1) router.back()
    else router.push('/dashboard')
  }
  const go = (url: string) => { setListOpen(false); router.push(url) }

  const list = listOpen && (
    <Sheet title={t('inbox.bell')} onClose={() => setListOpen(false)} className="ib-sheet">
      <div className="ib-list">
        {askNews && (
          <div className="ib-ask" role="note">
            <b>{t('inbox.ask.title')}</b>
            <p>{t('inbox.ask.body')}</p>
            <div>
              <button type="button" className="yes tap-auto" onClick={() => answerNews(true)}>{t('inbox.ask.yes')}</button>
              <button type="button" className="no tap-auto" onClick={() => answerNews(false)}>{t('inbox.ask.no')}</button>
            </div>
          </div>
        )}
        {!inbox ? <div className="ib-empty">{t('common.loading')}</div> : (
          <>
            {(inbox.closures.length > 0 || inbox.announcements.length > 0) && <div className="ib-sec">{t('inbox.sec.news')}</div>}
            {inbox.closures.map(c => (
              <div key={c.id} className="ib-card closure">
                <h3><span aria-hidden="true"><Icon name="warn" /></span>{t('inbox.closure')}</h3>
                <p>{closureText(t, locale, c)}</p>
              </div>
            ))}
            {inbox.announcements.map(a => (
              <article key={a.id} className={'ib-card' + (newer(a.created_at, seenAtOpen?.announcements) ? ' new' : '')}>
                <h3><span aria-hidden="true"><Icon name="megaphone" /></span>{a.pinned && <span className="ib-pin">{t('inbox.pinned')}</span>}{a.title}</h3>
                {a.body && <p>{a.body}</p>}
                <small>{when(a.created_at)}</small>
              </article>
            ))}
            {inbox.notices.length > 0 && <div className="ib-sec">{t('inbox.sec.recent')}</div>}
            {inbox.notices.map(n => {
              const inner = (
                <div className="ib-n">
                  <span className="ico" aria-hidden="true"><Icon name={ICON[n.kind] || 'bell'} /></span>
                  <div style={{ minWidth: 0 }}>
                    <h3>{String(n.title || '').replace(/^\p{Extended_Pictographic}️?\s*/u, '')}</h3>
                    {n.body && <p>{n.body}</p>}
                    <small>{when(n.created_at)}</small>
                  </div>
                </div>
              )
              const cls = 'ib-card' + (newer(n.created_at, seenAtOpen?.notices) ? ' new' : '')
              return n.url && n.url.startsWith('/') && !n.url.startsWith('//')
                ? <a key={n.id} href={n.url} className={cls} onClick={e => { e.preventDefault(); go(n.url!) }}>{inner}</a>
                : <div key={n.id} className={cls}>{inner}</div>
            })}
            {inbox.closures.length === 0 && inbox.announcements.length === 0 && inbox.notices.length === 0
              && <div className="ib-empty">{t('inbox.notices.empty')}</div>}
          </>
        )}
      </div>
    </Sheet>
  )

  return (
    <div className="ib">
      <style>{css}</style>
      <header className="ib-hd">
        <button type="button" className="ib-back" onClick={back} aria-label={t('app.back')}>
          <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>
        </button>
        <h1>{t('app.tab.chat')}</h1>
        {!inApp && (
          <button type="button" className="ib-back ib-bell tap-auto" onClick={openList} aria-label={fresh > 0 ? t('inbox.bell.n', { n: fresh }) : t('inbox.bell')}>
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></svg>
            {fresh > 0 && <i aria-hidden="true">{fresh > 9 ? '9+' : fresh}</i>}
          </button>
        )}
      </header>
      <div className="ib-body">
        {parentId === undefined
          ? <div className="ib-empty">{t('common.loading')}</div>
          : <ChatWidget key={parentId ?? 'none'} parentId={parentId} variant="page" events={inbox?.notices || []} />}
      </div>
      {/* Out of the screen's own layer, so it covers the app's bars too. */}
      {list && createPortal(list, document.body)}
    </div>
  )
}
