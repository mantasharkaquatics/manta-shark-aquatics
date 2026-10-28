'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useLocale, useT } from '@/lib/i18n/provider'
import { dateTag } from '@/lib/i18n'
import ChatWidget, { type ChatEvent } from '@/components/ChatWidget'
import { closureText, type Closure } from '@/components/ClosureBanner'
import { myParentId } from '@/lib/my-parent'
import { isNativeApp } from '@/lib/native-app'
import { BRAND, FONT_BODY } from '@/lib/brand'

/* 訊息, the phone app's message screen (owner, 2026-10-28; the quiet school-colour style): two
   tabs -- 通知 first, then 客服, which is where the screen opens (owner,
   2026-10-28, who swapped them and dropped a third, 學校公告).
   通知 holds, top down: active pool closures, the desk's announcements
   (lib/announcements.ts, pinned first) and what the school told this
   person (90 days, push_log). 客服 is the chat with the AI and the desk
   (components/ChatWidget variant 'page'). A red dot on 通知 when something
   there is newer than the last look, and on 客服 when a reply is unread
   (owner, 2026-10-28). ?tab=notices (or the old ?tab=news,
   which a pushed announcement opens) opens on 通知.

   Fills the screen: the app's own top bar and tabs step aside on this page
   (components/AppShell). */

type Tab = 'chat' | 'notices'
type Announcement = { id: string; title: string; body: string; pinned: boolean; created_at: string }
type Inbox = { announcements: Announcement[]; closures: Closure[]; notices: ChatEvent[]; seen: { announcements: string | null; notices: string | null }; chat?: number }

const NEWS_ASKED = 'msa_news_push_asked'

const css = `
.ib { position: fixed; inset: 0; z-index: 70; display: flex; flex-direction: column; background: ${BRAND.paper}; font-family: ${FONT_BODY}; }
.ib-hd { display: flex; align-items: center; gap: 8px; padding: 6px 12px 4px; background: ${BRAND.navy}; color: #fff; }
.ib-hd h1 { flex: 1; margin: 0; font-size: 18px; font-weight: 800; }
.ib-back { width: 42px; height: 42px; min-height: 0; border: 0; background: none; color: #fff; display: grid; place-items: center; cursor: pointer; border-radius: 10px; margin-left: -6px; }
.ib-tabs { display: flex; gap: 4px; padding: 4px 12px 10px; background: ${BRAND.navy}; }
.ib-tabs button { flex: 1; position: relative; min-height: 0; padding: 7px 0; font: inherit; font-weight: 700; font-size: 14px; cursor: pointer;
  border-radius: 8px; border: 0; background: transparent; color: #9fb3d6; }
.ib-tabs button[aria-selected="true"] { background: #fff; color: ${BRAND.navy}; }
.ib-tabs .lb { position: relative; display: inline-block; }
/* At the word's top right corner (owner, 2026-10-28). */
.ib-tabs .dot { position: absolute; top: -3px; right: -11px; width: 8px; height: 8px; border-radius: 50%; background: #e5484d; }
/* The X closes the messages the same way the arrow does (owner, 2026-10-28,
   who asked for both). */
.ib-back.ib-x { margin-left: 0; margin-right: -6px; }
.ib-back:focus-visible, .ib-tabs button:focus-visible { outline: 2px solid ${BRAND.yellow}; outline-offset: -2px; }
.ib-body { flex: 1; min-height: 0; display: flex; flex-direction: column; background: ${BRAND.paper}; }
.ib-list { flex: 1; overflow-y: auto; padding: 14px 12px 24px; display: flex; flex-direction: column; gap: 10px; }
.ib-empty { margin: 48px auto 0; text-align: center; color: ${BRAND.mute}; font-size: 15px; }
.ib-card { background: #fff; border: 1px solid ${BRAND.line}; border-radius: 12px; padding: 12px 14px; box-shadow: 0 1px 2px rgba(18,37,74,.05); color: ${BRAND.ink}; text-decoration: none; display: block; }
.ib-card.new { border-left: 3px solid ${BRAND.amber}; }
.ib-card.closure { border-left: 3px solid #b4321f; }
.ib-card h2 { margin: 0; font-size: 15.5px; font-weight: 800; color: ${BRAND.navy}; display: flex; gap: 8px; align-items: baseline; }
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
.ib-n .ico { font-size: 20px; line-height: 1.3; }
`
const ICON: Record<string, string> = {
  report: '📝', stage_up: '🏅', level_up: '🏆', reminder_24h: '⏰', waitlist_offer: '🎟️', test: '🔔',
  block_cancellation_notice: '⚠️', team_practice_cancelled: '⚠️',
  booking_confirmed: '📅', booking_series_confirmed: '📅', booking_rescheduled: '📅', booking_cancelled: '📅',
}

export default function ChatPage() {
  const t = useT()
  const locale = useLocale()
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const [tab, setTab] = useState<Tab>('chat')
  const [parentId, setParentId] = useState<string | null | undefined>(undefined)
  const [inbox, setInbox] = useState<Inbox | null>(null)
  // When each tab was last looked at, as the dots were worked out on arrival:
  // what was new stays marked while the family reads it.
  const [seenAtOpen, setSeenAtOpen] = useState<{ announcements: string | null; notices: string | null } | null>(null)
  const [askNews, setAskNews] = useState(false)
  // Once 客服 has been on screen its replies are read; no dot on it after.
  const [chatSeen, setChatSeen] = useState(false)
  // (Opened with ?tab=notices, the first moment on 客服, before 通知 shows,
  // is not a look at it.)
  const beenOnNotices = useRef(false)
  useEffect(() => {
    if (tab === 'notices') { beenOnNotices.current = true; return }
    const want = new URLSearchParams(window.location.search).get('tab')
    if ((want === 'news' || want === 'notices') && !beenOnNotices.current) return
    queueMicrotask(() => setChatSeen(true))
  }, [tab])

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

  // Which tab is on screen, for the inbox answer that lands after it opened.
  const tabRef = useRef<Tab>('chat')
  useEffect(() => { tabRef.current = tab }, [tab])
  const loadInbox = useCallback(() => {
    fetch('/api/app/inbox', { cache: 'no-store' }).then(r => (r.ok ? r.json() : null)).then((got: Inbox | null) => {
      if (!got) return
      setSeenAtOpen(s => s ?? got.seen)
      // 通知 already open (?tab=notices) when the answer came: it is being
      // looked at, so no dot for it.
      const now = new Date().toISOString()
      setInbox(tabRef.current === 'notices' ? { ...got, seen: { announcements: now, notices: now } } : got)
    }).catch(() => {})
  }, [])
  useEffect(() => { loadInbox() }, [loadInbox])

  // Looking at 通知 marks both what it shows read on the server (the dot
  // goes next time): the announcements and the notices.
  const openTab = useCallback((k: Tab) => {
    setTab(k)
    if (k === 'chat') return
    const now = new Date().toISOString()
    for (const mark of ['announcements', 'notices']) {
      fetch('/api/app/inbox', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mark }) }).catch(() => {})
    }
    setInbox(i => (i ? { ...i, seen: { announcements: now, notices: now } } : i))
  }, [])
  useEffect(() => {
    const want = new URLSearchParams(window.location.search).get('tab')
    if (want === 'news' || want === 'notices') queueMicrotask(() => openTab('notices'))
  }, [openTab])

  /* 通知 opened for the first time inside the app: ask once whether to be
     told of new announcements (Apple 4.5.4 wants that yes from the family). */
  useEffect(() => {
    if (tab !== 'notices' || !isNativeApp()) return
    let asked = false
    try { asked = localStorage.getItem(NEWS_ASKED) === '1' } catch { /* private */ }
    if (asked) return
    fetch('/api/push/settings', { cache: 'no-store' }).then(r => (r.ok ? r.json() : null)).then(d => { if (d && d.news === false) setAskNews(true) }).catch(() => {})
  }, [tab])
  const answerNews = (yes: boolean) => {
    setAskNews(false)
    try { localStorage.setItem(NEWS_ASKED, '1') } catch { /* private */ }
    if (yes) fetch('/api/push/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ news: true }) }).catch(() => {})
  }

  const newer = (at: string, seen: string | null | undefined) => !seen || at > seen
  const noticesDot = !!inbox && tab !== 'notices' && (
    inbox.notices.some(n => newer(n.created_at, inbox.seen.notices))
    || inbox.announcements.some(a => newer(a.created_at, inbox.seen.announcements))
    || (inbox.closures.length > 0 && !inbox.seen.announcements))
  const when = (iso: string) => new Date(iso).toLocaleString(dateTag(locale), { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/Los_Angeles' })

  const back = () => {
    if (window.history.length > 1) router.back()
    else router.push('/dashboard')
  }

  const tabs: { k: Tab; label: string; dot: boolean }[] = [
    { k: 'notices', label: t('inbox.tab.notices'), dot: noticesDot },
    { k: 'chat', label: t('inbox.tab.chat'), dot: tab !== 'chat' && !chatSeen && (inbox?.chat ?? 0) > 0 },
  ]

  return (
    <div className="ib">
      <style>{css}</style>
      <header className="ib-hd">
        <button type="button" className="ib-back" onClick={back} aria-label={t('app.back')}>
          <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>
        </button>
        <h1>{t('app.tab.chat')}</h1>
        <button type="button" className="ib-back ib-x" onClick={back} aria-label={t('common.close')}>
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
      </header>
      <div className="ib-tabs" role="tablist" aria-label={t('app.tab.chat')}>
        {tabs.map(x => (
          <button key={x.k} type="button" role="tab" aria-selected={tab === x.k} className="tap-auto" onClick={() => openTab(x.k)}>
            <span className="lb">{x.label}{x.dot && <i className="dot" aria-label={t('inbox.new')} />}</span>
          </button>
        ))}
      </div>
      <div className="ib-body" role="tabpanel">
        {tab === 'chat' && (parentId === undefined
          ? <div className="ib-empty">{t('common.loading')}</div>
          : <ChatWidget key={parentId ?? 'none'} parentId={parentId} variant="page" events={inbox?.notices || []} />)}

        {tab === 'notices' && (
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
                {inbox.closures.map(c => (
                  <div key={c.id} className="ib-card closure">
                    <h2><span aria-hidden="true">⚠️</span>{t('inbox.closure')}</h2>
                    <p>{closureText(t, locale, c)}</p>
                  </div>
                ))}
                {inbox.announcements.map(a => (
                  <article key={a.id} className={'ib-card' + (newer(a.created_at, seenAtOpen?.announcements) ? ' new' : '')}>
                    <h2>{a.pinned && <span className="ib-pin">{t('inbox.pinned')}</span>}{a.title}</h2>
                    {a.body && <p>{a.body}</p>}
                    <small>{when(a.created_at)}</small>
                  </article>
                ))}
                {inbox.notices.map(n => {
                  const inner = (
                    <div className="ib-n">
                      <span className="ico" aria-hidden="true">{ICON[n.kind] || '🔔'}</span>
                      <div style={{ minWidth: 0 }}>
                        <h2>{n.title}</h2>
                        {n.body && <p>{n.body}</p>}
                        <small>{when(n.created_at)}</small>
                      </div>
                    </div>
                  )
                  const cls = 'ib-card' + (newer(n.created_at, seenAtOpen?.notices) ? ' new' : '')
                  return n.url && n.url.startsWith('/') && !n.url.startsWith('//')
                    ? <a key={n.id} href={n.url} className={cls} onClick={e => { e.preventDefault(); router.push(n.url!) }}>{inner}</a>
                    : <div key={n.id} className={cls}>{inner}</div>
                })}
                {inbox.closures.length === 0 && inbox.announcements.length === 0 && inbox.notices.length === 0
                  && <div className="ib-empty">{t('inbox.notices.empty')}</div>}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
