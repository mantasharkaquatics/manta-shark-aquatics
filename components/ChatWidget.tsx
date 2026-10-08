'use client'
import { Fragment, useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useIsMobile } from '@/lib/use-is-mobile'
import { useT, useLocale } from '@/lib/i18n/provider'
import Link from 'next/link'
import { CHAT_OPEN_EVENT, CHAT_HANDBACK_EN, CHAT_HANDBACK_KEY, ACCOUNT_CHANGED_EVENT, takePendingChatOpen } from '@/lib/chat-open'
import { BRAND, FONT_BODY, FONT_DISPLAY } from '@/lib/brand'

// Palette B (2026-09): a navy header on a white window, the family's own
// messages in the LOGO blue, the school's in white. The launcher is blue so it
// reads on both the navy page tops and the light content below them.
const NAVY = BRAND.navy
const BLUE = BRAND.blue
const AMBER = BRAND.amber
const PAPER = '#f4f7fb'

// A long URL is unreadable inline, so it becomes a label -- which has to be
// translated, and this helper sits outside the component, so it is handed in.
function renderBody(text: string, linkLabel: string) {
  const parts = String(text).split(/(https?:\/\/[^\s]+)/g)
  return parts.map((p, i) =>
    /^https?:\/\//.test(p)
      ? <a key={i} href={p} target={p.includes('stripe.com') ? '_blank' : '_self'} rel="noreferrer" style={{ color: 'inherit', textDecoration: 'underline', fontWeight: 700, wordBreak: 'break-all' }}>{p.length > 60 ? linkLabel : p}</a>
      : p
  )
}

// One widget for every page, mounted by the page layouts (components/GlobalChat).
// Signed in, it is the family's own thread, read and written through Supabase
// with realtime updates, as before. Signed out (parentId null), it is a guest
// conversation held by /api/chat/guest: public answers only, with a nudge to
// create a free account for anything that needs one (owner, 2026-09-28). The
// guest key lives in this browser; as soon as the visitor is signed in,
// GlobalChat hands it to /api/chat/guest/claim so the conversation moves into
// the account.
//
// A page asks the widget to open -- optionally with text in the box, never
// sent -- through openChat() in lib/chat-open.
// lift: extra px above the bottom edge, for pages whose own sticky action bar
// would otherwise sit under the button (the booking page on a phone).
const GUEST_KEY = 'msa_guest_chat_key'
const HISTORY_LIMIT = 200
const readGuestKey = () => { try { return localStorage.getItem(GUEST_KEY) } catch { return null } }

/** Hand this browser's guest conversation to the signed-in account (see
 *  /api/chat/guest/claim). Forgets the key once the server has taken it. */
export async function claimGuestChat() {
  const k = readGuestKey()
  if (!k) return
  try {
    const r = await fetch('/api/chat/guest/claim', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: k }) })
    if (r.ok) { try { localStorage.removeItem(GUEST_KEY) } catch {} }
  } catch {}
}

export default function ChatWidget({ parentId, lift = 0 }: { parentId: string | null; lift?: number }) {
  const t = useT()
  const locale = useLocale()
  const guest = !parentId
  const [guestKey, setGuestKey] = useState<string | null>(null)
  const [limited, setLimited] = useState(false)
  const supabase = createClient()
  const [open, setOpen] = useState(false)
  // Auto-restore the open chat after navigating away (e.g. to payment) and back
  useEffect(() => {
    try { if (sessionStorage.getItem('msa_chat_open') === '1') setOpen(true) } catch {}
  }, [])
  useEffect(() => {
    try { sessionStorage.setItem('msa_chat_open', open ? '1' : '0') } catch {}
  }, [open])
  const [threadId, setThreadId] = useState<string | null>(null)
  const [messages, setMessages] = useState<any[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [unread, setUnread] = useState(0)
  // The realtime callback below is created once per thread, and the thread is
  // now found on page load with the panel shut, so it reads `open` from this
  // ref rather than the value it was created with (found 2026-10-05).
  const openRef = useRef(open)
  useEffect(() => { openRef.current = open }, [open])
  const [awaitingAi, setAwaitingAi] = useState(false)

  useEffect(() => {
    const onOpen = (e: Event) => {
      takePendingChatOpen()
      setOpen(true)
      const text = (e as CustomEvent).detail?.text
      if (text) setInput(text)
    }
    window.addEventListener(CHAT_OPEN_EVENT, onOpen)
    // A request made before this widget was mounted (lib/chat-open), handled
    // just after mount like an event would be.
    const timer = setTimeout(() => {
      const pending = takePendingChatOpen()
      if (!pending) return
      setOpen(true)
      if (pending.text) setInput(pending.text)
    }, 0)
    return () => { clearTimeout(timer); window.removeEventListener(CHAT_OPEN_EVENT, onOpen) }
  }, [])
  const awaitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isMobile = useIsMobile()

  useEffect(() => {
    if (!open) return
    initThread()
  }, [open])

  /* The family's thread is found as soon as the page loads, not when the
     panel opens (found 2026-10-08). A desk reply to an AI handoff used to
     reach nobody: nothing was read, and nothing listened, until the family
     happened to open the chat again. Now the button shows what the school
     (the desk or the AI) has written since the family last had the chat
     open -- chat_threads.parent_last_read_at, docs/migration-fix5-A.sql --
     and the channel below is live on every page. A reply left unread for 10
     minutes is also emailed (app/api/cron/chat-reply-email). Found, never
     created: a thread is only made when the family opens the chat. */
  useEffect(() => {
    if (guest) return
    let alive = true
    ;(async () => {
      const th = await findThread()
      if (!alive || !th) return
      setThreadId(prev => prev ?? th.id)
      // Before the migration there is no read mark to count from: no dot.
      if (!th.readKnown) return
      let q = supabase.from('chat_messages').select('id', { count: 'exact', head: true })
        .eq('thread_id', th.id).in('sender_type', ['admin', 'ai'])
      if (th.lastRead) q = q.gt('created_at', th.lastRead)
      const { count, error } = await q
      if (alive && !error && !openRef.current) setUnread(count || 0)
    })()
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!threadId) return
    const channel = supabase
      .channel(`chat:${threadId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `thread_id=eq.${threadId}` }, (payload) => {
        setMessages(prev => prev.some(m => m.id === (payload.new as any)?.id) ? prev : [...prev, payload.new])
        if ((payload.new as any)?.sender_type !== 'parent') {
          setAwaitingAi(false)
          if (awaitTimerRef.current) { clearTimeout(awaitTimerRef.current); awaitTimerRef.current = null }
        }
        // Only the school's replies are "unread"; the family's own message
        // (sent from another tab or phone) is not news to them, and neither
        // is the desk's "session ended" notice.
        const from = (payload.new as any)?.sender_type
        if (!openRef.current && (from === 'admin' || from === 'ai')) setUnread(u => u + 1)
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [threadId])

  // Read with the panel open; the history itself is only fetched then.
  useEffect(() => {
    if (open && threadId && !guest) loadMessages()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, threadId])

  /* What the family has seen: the newest message on screen while the panel
     is open. Its own created_at, not this device's clock, so a phone whose
     clock is off cannot mark a later reply read (or an earlier one unread).
     Ignored before the migration (the column is not there yet). */
  const markedRef = useRef<string | null>(null)
  useEffect(() => {
    if (!open || !threadId || guest) return
    const newest = messages.reduce<string | null>((a, m) => (!m._local && m.created_at && (!a || m.created_at > a) ? m.created_at : a), null)
    if (!newest || (markedRef.current && newest <= markedRef.current)) return
    markedRef.current = newest
    supabase.from('chat_threads').update({ parent_last_read_at: newest }).eq('id', threadId).then(() => {}, () => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, threadId, messages])

  // Scroll the message list itself, never the page: scrollIntoView also moves
  // every scrolling ancestor, the window included.
  const listRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = listRef.current
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }, [messages, awaitingAi])

  // Opening the panel shows the newest message. The thread is usually loaded
  // before the panel opens, so the effect above has nothing new to react to,
  // and the freshly mounted list used to sit at the oldest message.
  useEffect(() => {
    if (!open) return
    const id = requestAnimationFrame(() => {
      const el = listRef.current
      if (el) el.scrollTop = el.scrollHeight
    })
    return () => cancelAnimationFrame(id)
  }, [open])

  useEffect(() => {
    if (open) setUnread(0)
  }, [open])

  async function initThread() {
    if (guest) {
      const k = readGuestKey()
      setGuestKey(k)
      if (k) await loadGuest(k)
      return
    }
    // Normally already done by GlobalChat at sign-in; harmless if not.
    await claimGuestChat()
    if (threadId) return
    const data = await findThread()
    if (data) {
      setThreadId(data.id)
    } else {
      const { data: newThread } = await supabase
        .from('chat_threads')
        .insert({ parent_id: parentId })
        .select('id')
        .single()
      if (newThread) setThreadId(newThread.id)
    }
  }

  /** The family's thread (the oldest, as the payment notices pick it), and
   *  when they last had it open. readKnown is false before
   *  docs/migration-fix5-A.sql has added that column. */
  async function findThread(): Promise<{ id: string; lastRead: string | null; readKnown: boolean } | null> {
    const withRead = await supabase.from('chat_threads').select('id, parent_last_read_at')
      .eq('parent_id', parentId).order('created_at', { ascending: true }).limit(1).maybeSingle()
    if (!withRead.error) return withRead.data ? { id: withRead.data.id, lastRead: (withRead.data as any).parent_last_read_at ?? null, readKnown: true } : null
    const plain = await supabase.from('chat_threads').select('id')
      .eq('parent_id', parentId).order('created_at', { ascending: true }).limit(1).maybeSingle()
    return plain.data ? { id: plain.data.id, lastRead: null, readKnown: false } : null
  }

  async function loadGuest(k: string) {
    try {
      const r = await fetch('/api/chat/guest?key=' + encodeURIComponent(k))
      const d = await r.json()
      if (d.gone) { try { localStorage.removeItem(GUEST_KEY) } catch {}; setGuestKey(null); setMessages([]); return }
      // Keep a message still on its way (shown before the server has it).
      if (Array.isArray(d.messages)) setMessages(prev => [...d.messages, ...prev.filter(m => m._local)])
    } catch {}
  }

  // A guest has no realtime channel, so a reply from the team is picked up by
  // asking again every 15 seconds while the window is open.
  useEffect(() => {
    if (!guest || !open || !guestKey) return
    const id = setInterval(() => loadGuest(guestKey), 15000)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guest, open, guestKey])

  async function sendGuest(body: string) {
    const now = new Date().toISOString()
    setMessages(prev => [...prev, { id: 'local-' + now, _local: true, sender_type: 'parent', body, created_at: now }])
    setAwaitingAi(true)
    try {
      const r = await fetch('/api/chat/guest', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: guestKey, text: body, locale }),
      })
      const d = await r.json().catch(() => ({} as any))
      if (r.status === 429) { setLimited(true); setMessages(prev => prev.filter(m => !m._local)); return }
      if (r.status === 409) { try { localStorage.removeItem(GUEST_KEY) } catch {}; setGuestKey(null); return }
      if (d.key) { setGuestKey(d.key); try { localStorage.setItem(GUEST_KEY, d.key) } catch {} }
      if (Array.isArray(d.messages)) setMessages(d.messages)
    } catch {
      setMessages(prev => prev.filter(m => !m._local))
    } finally {
      setAwaitingAi(false)
    }
  }

  // The newest HISTORY_LIMIT messages, shown oldest first (found 2026-10-08).
  // A family has one thread for life; read oldest-first with no limit, the
  // 1,000-row cap cut off the NEWEST messages once a thread grew past it, so
  // the desk's latest reply was not on screen.
  async function loadMessages() {
    const { data } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('thread_id', threadId)
      .order('created_at', { ascending: false })
      .limit(HISTORY_LIMIT)
    setMessages((data || []).reverse())
  }

  async function sendMessage(text?: string) {
    const body = (text ?? input).trim()
    if (guest) {
      if (!body || sending || limited) return
      setSending(true)
      if (!text) setInput('')
      await sendGuest(body)
      setSending(false)
      return
    }
    if (!body || !threadId || sending) return
    setSending(true)
    if (!text) setInput('')
    await supabase.from('chat_messages').insert({ thread_id: threadId, sender_type: 'parent', body })
    await supabase.from('chat_threads').update({ last_message_at: new Date().toISOString(), last_message_preview: body }).eq('id', threadId)
    setSending(false)
    setAwaitingAi(true)
    if (awaitTimerRef.current) clearTimeout(awaitTimerRef.current)
    awaitTimerRef.current = setTimeout(() => setAwaitingAi(false), 60000)
    try {
      const res = await fetch('/api/chat/ai-reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ thread_id: threadId }),
      })
      if (!res.ok) throw new Error('ai-reply failed')
      const d = await res.json().catch(() => ({} as any))
      // The assistant cancelled a lesson or held an assessment: the page
      // behind the chat (the dashboard) reads the account again.
      if (d?.changed) { try { window.dispatchEvent(new Event(ACCOUNT_CHANGED_EVENT)) } catch {} }
      if (d?.skipped) {
        // Human service mode: AI stays silent, hide typing animation, notify admin of the new message
        setAwaitingAi(false)
        if (awaitTimerRef.current) { clearTimeout(awaitTimerRef.current); awaitTimerRef.current = null }
        await supabase.from('chat_threads').update({ unread_by_admin: true }).eq('id', threadId)
      }
    } catch {
      setAwaitingAi(false)
      if (awaitTimerRef.current) { clearTimeout(awaitTimerRef.current); awaitTimerRef.current = null }
      await supabase.from('chat_threads').update({ unread_by_admin: true }).eq('id', threadId)
    }
  }

  const windowStyle: React.CSSProperties = isMobile ? {
    position: 'fixed', inset: 0, zIndex: 1000,
    display: 'flex', flexDirection: 'column',
    background: PAPER, fontFamily: FONT_BODY,
  } : {
    position: 'fixed', bottom: '80px', right: '20px', zIndex: 1000,
    width: '360px', height: '500px',
    borderRadius: '16px', overflow: 'hidden',
    display: 'flex', flexDirection: 'column',
    background: PAPER, border: '1px solid #d3deec', fontFamily: FONT_BODY,
    boxShadow: '0 20px 60px rgba(14,29,59,0.28)',
  }

  return (
    <>
      <style>{`
        @keyframes msaTypingBlink { 0%, 80%, 100% { opacity: 0.25; transform: translateY(0); } 40% { opacity: 1; transform: translateY(-3px); } }
      `}</style>
      {/* FAB Button */}
      {!open && (
        <button data-chat-toggle onClick={() => setOpen(true)} style={{
          position: 'fixed', bottom: `${20 + lift}px`, right: '20px', zIndex: 999,
          width: '56px', height: '56px', borderRadius: '50%',
          background: BLUE, border: '2px solid #fff', cursor: 'pointer', color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 6px 20px rgba(14,29,59,0.3)',
        }} aria-label={unread > 0 ? `${t('chat.title')} · ${t('chat.unread', { n: unread })}` : t('chat.title')}>
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1.2-4.6A8 8 0 1 1 21 12z" />
          </svg>
          {unread > 0 && (
            <div style={{
              position: 'absolute', top: '-4px', right: '-4px',
              background: '#c0392b', color: '#fff', borderRadius: '50%',
              width: '20px', height: '20px', fontSize: '11px', fontWeight: 700,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }} aria-hidden="true">{unread > 9 ? '9+' : unread}</div>
          )}
        </button>
      )}

      {/* Chat Window */}
      {open && (
        <div style={windowStyle}>
          {/* Header */}
          <div style={{ background: NAVY, padding: '16px 20px', display: 'flex', alignItems: 'center', gap: '12px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
            <img src="/logo.png" alt="Manta Shark Aquatics" width={36} height={36}
              style={{ display: 'block', borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 800, color: '#fff', fontSize: '16px' }}>{t('chat.title')}</div>
              <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.7)' }}>{t('chat.subtitle')}</div>
            </div>
            <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.75)', fontSize: '20px', cursor: 'pointer', padding: '4px' }} aria-label={t('common.close')}>✕</button>
          </div>

          {/* Signed out: what an account adds, and the way to get one. */}
          {guest && (
            <div style={{ background: '#fff7e6', borderBottom: '1px solid #f3dfb4', padding: '9px 16px', fontSize: '12.5px', color: BRAND.ink, lineHeight: 1.5 }}>
              {t('chat.guest.banner')}{' '}
              <Link href="/register" onClick={() => setOpen(false)} style={{ color: BLUE, fontWeight: 800 }}>{t('chat.guest.signUp')}</Link>
              {' · '}
              <Link href="/login" onClick={() => setOpen(false)} style={{ color: BLUE, fontWeight: 700 }}>{t('chat.guest.signIn')}</Link>
            </div>
          )}

          {/* Messages */}
          <div ref={listRef} style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {messages.length === 0 && (
              <div style={{ textAlign: 'center', color: '#56647d', fontSize: '14px', marginTop: '40px' }}>
                <div style={{ fontSize: '32px', marginBottom: '8px' }}>👋</div>
                {t(guest ? 'chat.guest.empty' : 'chat.empty')}
              </div>
            )}
            {messages.map((msg, idx) => {
              // Messages from different days ran together with only a time on
              // each, so yesterday's 4:30 PM sat above today's 10:43 AM with
              // nothing to say a day had passed.
              const dayOf = (x: any) => new Date(x.created_at).toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' })
              const newDay = idx === 0 || dayOf(messages[idx - 1]) !== dayOf(msg)
              return (
              <Fragment key={msg.id}>
              {newDay && (
                <div style={{ textAlign: 'center', fontSize: '11px', color: '#8a97ad', margin: '4px 0' }}>
                  {new Date(msg.created_at).toLocaleDateString(locale === 'en' ? 'en-US' : locale, { month: 'short', day: 'numeric', weekday: 'short', timeZone: 'America/Los_Angeles' })}
                </div>
              )}
              {msg.sender_type === 'system' ? (
              <div key={msg.id} style={{ textAlign: 'center', fontSize: '11.5px', color: '#8a97ad', padding: '2px 0' }}>
                {/* The desk handing the chat back: a fixed line, so it is
                    shown in the family's language (rows from before the key
                    carry only the English body). */}
                {msg.metadata?.key === CHAT_HANDBACK_KEY || msg.body === CHAT_HANDBACK_EN ? t('chat.handback') : msg.body}
              </div>
            ) : (
              <div key={msg.id} style={{ display: 'flex', justifyContent: msg.sender_type === 'parent' ? 'flex-end' : 'flex-start' }}>
                <div style={{
                  maxWidth: '75%', padding: '10px 14px', borderRadius: msg.sender_type === 'parent' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                  background: msg.sender_type === 'parent' ? BLUE : '#fff',
                  color: msg.sender_type === 'parent' ? '#fff' : BRAND.ink,
                  border: msg.sender_type === 'parent' ? 'none' : '1px solid #e3ebf6',
                  whiteSpace: 'pre-wrap', fontSize: '14px', lineHeight: 1.55, fontWeight: msg.sender_type === 'parent' ? 600 : 400,
                }}>
                  {msg.sender_type === 'ai' && (
                    <div style={{ fontSize: '11px', fontWeight: 800, color: BLUE, marginBottom: '4px', letterSpacing: '0.5px' }}>{t('chat.fromAi')}</div>
                  )}
                  {msg.sender_type === 'admin' && (
                    <div style={{ fontSize: '11px', fontWeight: 800, color: '#1f7a57', marginBottom: '4px', letterSpacing: '0.5px' }}>{t('chat.fromDesk')}</div>
                  )}
                  {renderBody(msg.body, t('chat.openLink'))}
                  {msg.sender_type === 'ai' && msg.id === messages[messages.length - 1]?.id && Array.isArray(msg.metadata?.options) && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '8px' }}>
                      {msg.metadata.options.map((opt: any, i: number) =>
                        opt.type === 'link' ? (
                          <a key={i} href={opt.url} style={{ background: AMBER, color: NAVY, borderRadius: '8px', padding: '7px 12px', fontSize: '13px', fontWeight: 800, textDecoration: 'none' }}>{opt.label}</a>
                        ) : (
                          <button key={i} onClick={() => sendMessage(opt.label)} disabled={sending} style={{ background: '#eef4fc', color: BLUE, border: '1px solid #c9d8ee', borderRadius: '8px', padding: '7px 12px', fontSize: '13px', fontWeight: 700, cursor: sending ? 'not-allowed' : 'pointer' }}>{opt.label}</button>
                        )
                      )}
                    </div>
                  )}
                  <div style={{ fontSize: '10px', opacity: 0.5, marginTop: '4px', textAlign: 'right' }}>
                    {/* The school's clock, like the day line above (found 2026-10-05:
                        this used the phone's zone, so a family travelling saw
                        times that disagreed with the dates). */}
                    {new Date(msg.created_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Los_Angeles' })}
                  </div>
                </div>
              </div>
            )}
              </Fragment>
              )
            })}
            {awaitingAi && (
              <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                <div style={{ padding: '12px 16px', borderRadius: '16px 16px 16px 4px', background: '#fff', border: '1px solid #e3ebf6', display: 'flex', alignItems: 'center', gap: '5px' }}>
                  {[0, 1, 2].map(i => (
                    <span key={i} style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#8a97ad', display: 'inline-block', animation: 'msaTypingBlink 1.2s infinite', animationDelay: `${i * 0.2}s` }} />
                  ))}
                </div>
              </div>
            )}
            {limited && (
              <div style={{ textAlign: 'center', fontSize: '12.5px', color: '#8a5a00', background: '#fff7e6', borderRadius: '10px', padding: '10px 12px' }}>
                {t('chat.guest.limit')}{' '}
                <Link href="/register" onClick={() => setOpen(false)} style={{ color: BLUE, fontWeight: 800 }}>{t('chat.guest.signUp')}</Link>
              </div>
            )}
          </div>

          {/* Input */}
          <div style={{ padding: '12px 16px', borderTop: '1px solid #e3ebf6', display: 'flex', gap: '8px', background: '#fff' }}>
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              // Enter while a Chinese/Japanese IME is composing picks the
              // candidate; it must not also send the half-typed message.
              // keyCode 229 covers Safari, which reports isComposing late.
              onKeyDown={e => {
                if (e.key !== 'Enter' || e.shiftKey) return
                if (e.nativeEvent.isComposing || e.keyCode === 229) return
                sendMessage()
              }}
              placeholder={t('chat.placeholder')}
              maxLength={800}
              style={{
                // 16px: anything smaller and iOS zooms the page when the field is tapped.
                flex: 1, background: '#fff', border: '1px solid #d5e0ef',
                borderRadius: '10px', padding: '10px 14px', color: BRAND.ink, fontSize: '16px', outline: 'none', fontFamily: 'inherit',
              }}
            />
            <button onClick={() => sendMessage()} disabled={!input.trim() || sending} aria-label={t('chat.send')} style={{
              background: input.trim() ? AMBER : '#eef2f8',
              border: 'none', borderRadius: '10px', width: '40px',
              cursor: input.trim() ? 'pointer' : 'not-allowed',
              fontSize: '16px', color: input.trim() ? NAVY : '#9aa6ba',
            }}><span aria-hidden="true">➤</span></button>
          </div>
        </div>
      )}
    </>
  )
}
