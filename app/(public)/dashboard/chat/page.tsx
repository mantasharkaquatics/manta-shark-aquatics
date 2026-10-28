'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useLocale, useT } from '@/lib/i18n/provider'
import { dateTag } from '@/lib/i18n'
import ChatWidget, { type ChatEvent } from '@/components/ChatWidget'
import { closureText, type Closure } from '@/components/ClosureBanner'
import { myParentId } from '@/lib/my-parent'
import { isNativeApp } from '@/lib/native-app'
import { BRAND, FONT_BODY } from '@/lib/brand'

/* 訊息, the phone app's message screen (owner, 2026-10-28; sample B): three
   tabs -- 客服 (the chat with the AI and the desk, components/ChatWidget
   variant 'page'), 學校公告 (pool closures and the desk's announcements,
   lib/announcements.ts) and 通知 (what the school told this person, 90 days,
   push_log). A red dot on a tab with something newer than the last look.
   ?tab=news / ?tab=notices open on those (a pushed announcement opens here).

   Fills the screen: the app's own top bar and tabs step aside on this page
   (components/AppShell). */

type Tab = 'chat' | 'news' | 'notices'
type Announcement = { id: string; title: string; body: string; pinned: boolean; created_at: string }
type Inbox = { announcements: Announcement[]; closures: Closure[]; notices: ChatEvent[]; seen: { announcements: string | null; notices: string | null } }

const NEWS_ASKED = 'msa_news_push_asked'

const css = `
.ib { position: fixed; inset: 0; z-index: 70; display: flex; flex-direction: column; background: ${BRAND.navyDeep}; font-family: ${FONT_BODY}; }
.ib-hd { display: flex; align-items: center; gap: 8px; padding: 8px 12px; background: linear-gradient(180deg, ${BRAND.navyMid}, ${BRAND.navy}); color: #fff; }
.ib-hd h1 { flex: 1; margin: 0; font-size: 20px; font-weight: 900; }
.ib-back { width: 42px; height: 42px; min-height: 0; border: 0; background: none; color: #fff; display: grid; place-items: center; cursor: pointer; border-radius: 10px; margin-left: -6px; }
.ib-tabs { display: flex; gap: 6px; padding: 4px 10px 0; background: ${BRAND.navy}; }
.ib-tabs button { flex: 1; position: relative; min-height: 0; padding: 10px 0 9px; font: inherit; font-weight: 800; font-size: 15px; cursor: pointer;
  border-radius: 12px 12px 0 0; border: 2px solid #3b64a8; border-bottom: 0; background: ${BRAND.navyMid}; color: #c8d6f0; }
.ib-tabs button[aria-selected="true"] { background: #eef5ff; color: ${BRAND.navy}; border-color: ${BRAND.yellow}; }
.ib-tabs .dot { position: absolute; top: 7px; right: 12px; width: 9px; height: 9px; border-radius: 50%; background: #e5484d; }
.ib-back:focus-visible, .ib-tabs button:focus-visible { outline: 2px solid ${BRAND.yellow}; outline-offset: -3px; }
.ib-body { flex: 1; min-height: 0; display: flex; flex-direction: column; background: #eef5ff; }
.ib-list { flex: 1; overflow-y: auto; padding: 14px 12px 24px; display: flex; flex-direction: column; gap: 10px; }
.ib-empty { margin: 48px auto 0; text-align: center; color: #36507e; font-size: 15px; }
.ib-card { background: #fff; border: 2.5px solid ${BRAND.blue}; border-radius: 14px; padding: 12px 14px; box-shadow: 0 2px 0 #9fb8e6; color: ${BRAND.ink}; text-decoration: none; display: block; }
.ib-card.new { border-color: ${BRAND.amber}; box-shadow: 0 2px 0 #f3c97a; }
.ib-card.closure { border-color: #b4321f; box-shadow: 0 2px 0 #e9a99c; }
.ib-card h2 { margin: 0; font-size: 16px; font-weight: 900; color: ${BRAND.navy}; display: flex; gap: 8px; align-items: baseline; }
.ib-card p { margin: 6px 0 0; font-size: 14.5px; line-height: 1.6; white-space: pre-wrap; overflow-wrap: anywhere; }
.ib-card small { display: block; margin-top: 6px; font-size: 12px; color: #6a7891; }
.ib-pin { font-size: 11px; font-weight: 900; padding: 1px 7px; border-radius: 6px; background: ${BRAND.navy}; color: ${BRAND.yellow}; flex-shrink: 0; }
.ib-ask { background: ${BRAND.navy}; color: #fff; border-radius: 14px; padding: 14px; border: 2px solid ${BRAND.yellow}; }
.ib-ask b { display: block; font-size: 15.5px; }
.ib-ask p { margin: 6px 0 10px; font-size: 13.5px; line-height: 1.55; color: #d6e2f7; }
.ib-ask div { display: flex; gap: 8px; }
.ib-ask button { flex: 1; min-height: 0; padding: 10px; border-radius: 10px; font: inherit; font-weight: 800; font-size: 14.5px; cursor: pointer; }
.ib-ask .yes { background: ${BRAND.amber}; color: ${BRAND.navy}; border: 2px solid #c97f00; }
.ib-ask .no { background: transparent; color: #fff; border: 2px solid #3b64a8; }
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
  const [myName, setMyName] = useState('')
  const [inbox, setInbox] = useState<Inbox | null>(null)
  // When each tab was last looked at, as the dots were worked out on arrival:
  // what was new stays marked while the family reads it.
  const [seenAtOpen, setSeenAtOpen] = useState<{ announcements: string | null; notices: string | null } | null>(null)
  const [askNews, setAskNews] = useState(false)


  useEffect(() => {
    let live = true
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/login?next=/dashboard/chat'); return }
      const pid = await myParentId(supabase, user.id)
      let name = ''
      if (pid) {
        const { data } = await supabase.from('parents').select('first_name').eq('id', pid).maybeSingle()
        name = String(data?.first_name || '')
      }
      if (live) { setParentId(pid); setMyName(name) }
    })().catch(() => { if (live) setParentId(null) })
    return () => { live = false }
  }, [supabase, router])

  const loadInbox = useCallback(() => {
    fetch('/api/app/inbox', { cache: 'no-store' }).then(r => (r.ok ? r.json() : null)).then((d: Inbox | null) => {
      if (!d) return
      setInbox(d)
      setSeenAtOpen(s => s ?? d.seen)
    }).catch(() => {})
  }, [])
  useEffect(() => { loadInbox() }, [loadInbox])

  // Looking at a tab marks it read on the server (the dot goes next time).
  const openTab = useCallback((k: Tab) => {
    setTab(k)
    if (k === 'chat') return
    const mark = k === 'news' ? 'announcements' : 'notices'
    fetch('/api/app/inbox', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mark }) }).catch(() => {})
    setInbox(i => (i ? { ...i, seen: { ...i.seen, [mark]: new Date().toISOString() } } : i))
  }, [])
  useEffect(() => {
    const want = new URLSearchParams(window.location.search).get('tab')
    if (want === 'news' || want === 'notices') queueMicrotask(() => openTab(want))
  }, [openTab])

  /* 學校公告 opened for the first time inside the app: ask once whether to be
     told of new ones (Apple 4.5.4 wants that yes from the family). */
  useEffect(() => {
    if (tab !== 'news' || !isNativeApp()) return
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
  const newsDot = !!inbox && tab !== 'news' && (inbox.announcements.some(a => newer(a.created_at, inbox.seen.announcements)) || inbox.closures.length > 0 && !inbox.seen.announcements)
  const noticesDot = !!inbox && tab !== 'notices' && inbox.notices.some(n => newer(n.created_at, inbox.seen.notices))
  const when = (iso: string) => new Date(iso).toLocaleString(dateTag(locale), { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/Los_Angeles' })

  const back = () => {
    if (window.history.length > 1) router.back()
    else router.push('/dashboard')
  }

  const tabs: { k: Tab; label: string; dot: boolean }[] = [
    { k: 'chat', label: t('inbox.tab.chat'), dot: false },
    { k: 'news', label: t('inbox.tab.news'), dot: newsDot },
    { k: 'notices', label: t('inbox.tab.notices'), dot: noticesDot },
  ]

  return (
    <div className="ib">
      <style>{css}</style>
      <header className="ib-hd">
        <button type="button" className="ib-back" onClick={back} aria-label={t('app.back')}>
          <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>
        </button>
        <h1>{t('app.tab.chat')}</h1>
      </header>
      <div className="ib-tabs" role="tablist" aria-label={t('app.tab.chat')}>
        {tabs.map(x => (
          <button key={x.k} type="button" role="tab" aria-selected={tab === x.k} className="tap-auto" onClick={() => openTab(x.k)}>
            {x.label}{x.dot && <i className="dot" aria-label={t('inbox.new')} />}
          </button>
        ))}
      </div>
      <div className="ib-body" role="tabpanel">
        {tab === 'chat' && (parentId === undefined
          ? <div className="ib-empty">{t('common.loading')}</div>
          : <ChatWidget key={parentId ?? 'none'} parentId={parentId} variant="page" events={inbox?.notices || []} myName={myName} />)}

        {tab === 'news' && (
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
                {inbox.closures.length === 0 && inbox.announcements.length === 0 && <div className="ib-empty">{t('inbox.news.empty')}</div>}
              </>
            )}
          </div>
        )}

        {tab === 'notices' && (
          <div className="ib-list">
            {!inbox ? <div className="ib-empty">{t('common.loading')}</div>
              : inbox.notices.length === 0 ? <div className="ib-empty">{t('inbox.notices.empty')}</div>
              : inbox.notices.map(n => {
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
          </div>
        )}
      </div>
    </div>
  )
}
