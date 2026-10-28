'use client'
import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useIsMobile } from '@/lib/use-is-mobile'
import { useT, useLocale } from '@/lib/i18n/provider'
import { dateTag } from '@/lib/i18n'

const NAVY = '#1a2744'
const DARKER = '#0d1529'
const GOLD = '#c9a84c'
const RED = '#ef4444'
// The newest messages of a conversation, oldest first, as the family's chat
// widget reads them; "Load earlier" fetches the page before.
const HISTORY_LIMIT = 200
// Conversations per page of the list (found 2026-10-15): the list read every
// thread at once, so past the API's 1,000 rows the quietest ones -- older
// visitor chats, families who had not written in a while -- could not be
// opened at all. "Load more" reads the next page.
const THREAD_PAGE = 100
// A desk or AI reply can be recalled for this long (owner, 2026-10-23).
const RECALL_WINDOW_MS = 24 * 60 * 60 * 1000
const clock = (iso: string) => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })

// adminId is no longer read here: the desk's reply is stamped with the
// signed-in admin by app/api/admin/chat-message (2026-10-15).
export default function AdminMessagesClient({ adminName, adminNames = {} }: { adminId: string; adminName: string; adminNames?: Record<string, string> }) {
  const t = useT()
  const locale = useLocale()
  const supabase = createClient()
  const [threads, setThreads] = useState<any[]>([])
  const [selectedThread, setSelectedThread] = useState<any>(null)
  const [messages, setMessages] = useState<any[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [switchingMode, setSwitchingMode] = useState(false)
  const [hasOlder, setHasOlder] = useState(false)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  const [hasMoreThreads, setHasMoreThreads] = useState(false)
  const [loadingThreads, setLoadingThreads] = useState(false)
  /* Recall (owner, 2026-10-23; /api/admin/chat-recall): a desk or AI reply up
     to 24 hours old. Here it stays, folded under "Recalled"; the family sees
     nothing. confirmRecall is the message asking "recall this?", openRecalled
     the folded ones opened to read. */
  const [confirmRecall, setConfirmRecall] = useState<string | null>(null)
  const [recalling, setRecalling] = useState<string | null>(null)
  const [openRecalled, setOpenRecalled] = useState<Set<string>>(new Set())
  const [notice, setNotice] = useState<string | null>(null)
  // "Recall" disappears once a message passes 24 hours; checked each minute.
  const [nowMs, setNowMs] = useState(() => Date.now())
  // Who wrote each desk reply -- shown here only; families see 櫃台 (owner, 2026-10-28).
  const [staffNames, setStaffNames] = useState<Record<string, string>>({})
  useEffect(() => {
    let live = true
    fetch('/api/admin/staff-names').then(r => (r.ok ? r.json() : null)).then(d => { if (live && d?.names) setStaffNames(d.names) }).catch(() => {})
    return () => { live = false }
  }, [])
  useEffect(() => { const id = setInterval(() => setNowMs(Date.now()), 60000); return () => clearInterval(id) }, [])

  async function setThreadMode(mode: 'ai' | 'human') {
    if (!selectedThread || switchingMode) return
    setSwitchingMode(true)
    try {
      const res = await fetch('/api/admin/chat-handoff', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ thread_id: selectedThread.id, mode }) })
      if (res.ok) {
        setSelectedThread((prev: any) => prev ? { ...prev, mode, ...(mode === 'ai' ? { escalation_summary: null } : {}) } : prev)
        setThreads(prev => prev.map(th => th.id === selectedThread.id ? { ...th, mode } : th))
      }
    } finally { setSwitchingMode(false) }
  }
  const [mobileView, setMobileView] = useState<'list' | 'chat'>('list')
  const bottomRef = useRef<HTMLDivElement>(null)
  const replyRef = useRef<HTMLTextAreaElement>(null)
  const selectedThreadRef = useRef<any>(null)

  useEffect(() => { loadThreads() }, [])

  useEffect(() => {
    selectedThreadRef.current = selectedThread
  }, [selectedThread])

  /* A message in any other conversation used to re-read every thread (up to
     1,000, select *), so a busy evening of visitor and AI chats kept the page
     re-fetching (found 2026-10-08). Now only the row it belongs to is read
     again -- its preview, its flags (unread, mode, the AI's escalation note)
     -- and a thread not on the list yet, a new visitor, is added. */
  const fetchThreadRow = async (id: string) => {
    const { data } = await supabase.from('chat_threads').select('*, parents(first_name, last_name, email)').eq('id', id).maybeSingle()
    if (!data) return
    setThreads(prev => prev.some(th => th.id === id)
      ? prev.map(th => th.id === id ? data : th)
      : [data, ...prev])
    setSelectedThread((prev: any) => prev && prev.id === id ? { ...prev, ...data } : prev)
  }
  // The thread row is written just after its message (the AI's handoff flag,
  // the preview), so it is read a moment later, once per burst.
  const refetchTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>())
  const refetchThreadSoon = (id: string) => {
    const timers = refetchTimers.current
    const old = timers.get(id)
    if (old) clearTimeout(old)
    timers.set(id, setTimeout(() => { timers.delete(id); fetchThreadRow(id) }, 1500))
  }
  useEffect(() => {
    const timers = refetchTimers.current
    const channel = supabase
      .channel('admin:chat:all')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages' }, (payload) => {
        const msg = payload.new as any
        const current = selectedThreadRef.current
        if (current && msg.thread_id === current.id) {
          setMessages(prev => prev.some(m => m.id === msg.id) ? prev : [...prev, msg])
        }
        // Shown at once on the list (moved to the top), then the row is read.
        setThreads(prev => {
          const i = prev.findIndex(th => th.id === msg.thread_id)
          if (i < 0) return prev
          const th = {
            ...prev[i],
            last_message_preview: msg.body,
            last_message_at: msg.created_at,
            unread_by_admin: msg.sender_type === 'parent' && current?.id === msg.thread_id ? true : prev[i].unread_by_admin,
          }
          return [th, ...prev.slice(0, i), ...prev.slice(i + 1)]
        })
        refetchThreadSoon(msg.thread_id)
      })
      // Another admin recalled a message: fold it here too.
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'chat_messages' }, (payload) => {
        const msg = payload.new as any
        if (!msg?.recalled_at) return
        if (selectedThreadRef.current?.id === msg.thread_id) {
          setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, recalled_at: msg.recalled_at, recalled_by: msg.recalled_by } : m))
        }
        refetchThreadSoon(msg.thread_id)
      })
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
      for (const id of timers.values()) clearTimeout(id)
      timers.clear()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Follow the conversation down when a message arrives, not when earlier
  // ones are put in above.
  const lastIdRef = useRef<string | null>(null)
  useEffect(() => {
    const last = messages[messages.length - 1]?.id ?? null
    if (last !== lastIdRef.current) bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    lastIdRef.current = last
  }, [messages])

  const threadPage = (from: number) => supabase
    .from('chat_threads')
    .select('*, parents(first_name, last_name, email)')
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .order('id')
    .range(from, from + THREAD_PAGE - 1)

  async function loadThreads() {
    const { data } = await threadPage(0)
    setThreads(data || [])
    setHasMoreThreads((data || []).length === THREAD_PAGE)
  }

  // The next page after what is on the list. A thread that moved up since
  // (a new message) can come back again from the page below: kept once.
  async function loadMoreThreads() {
    if (loadingThreads) return
    setLoadingThreads(true)
    // Overlapping the page before: a thread deleted since (a guest chat merged
    // into a family's) shifted every offset by one, and the thread at the
    // page edge was skipped (found 2026-10-15 in review). Repeats are dropped.
    const { data, error } = await threadPage(Math.max(0, threads.length - 10))
    setLoadingThreads(false)
    if (error) return
    setThreads(prev => {
      const have = new Set(prev.map(th => th.id))
      return [...prev, ...(data || []).filter(th => !have.has(th.id))]
    })
    setHasMoreThreads((data || []).length === THREAD_PAGE)
  }

  // The newest HISTORY_LIMIT, shown oldest first (found 2026-10-08). Read
  // oldest-first with no limit, a family past 1,000 messages showed its
  // first 1,000 -- and not the newest question, the AI's handoff included.
  async function loadMessages(threadId: string) {
    const { data } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('thread_id', threadId)
      .order('created_at', { ascending: false })
      .limit(HISTORY_LIMIT)
    if (selectedThreadRef.current?.id !== threadId) return
    setMessages((data || []).reverse())
    setHasOlder((data || []).length === HISTORY_LIMIT)
  }

  async function loadOlder() {
    const current = selectedThreadRef.current
    const oldest = messages[0]
    if (!current || !oldest || loadingOlder) return
    setLoadingOlder(true)
    const { data } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('thread_id', current.id)
      .lt('created_at', oldest.created_at)
      .order('created_at', { ascending: false })
      .limit(HISTORY_LIMIT)
    setLoadingOlder(false)
    if (selectedThreadRef.current?.id !== current.id) return
    const older = (data || []).reverse()
    setMessages(prev => [...older, ...prev])
    setHasOlder(older.length === HISTORY_LIMIT)
  }

  async function selectThread(thread: any) {
    selectedThreadRef.current = thread
    setSelectedThread(thread)
    setMessages([])
    setConfirmRecall(null)
    setNotice(null)
    setHasOlder(false)
    setSendError(null)
    setMobileView('chat')
    await loadMessages(thread.id)
    // Open thread → mark as read
    await markRead(thread.id)
  }

  // Every write to the chat tables goes through a server route (audit F39,
  // 2026-10-15): app/api/admin/chat-message and chat-thread.
  async function threadAction(threadId: string, action: 'read' | 'clear_summary') {
    try {
      const r = await fetch('/api/admin/chat-thread', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ thread_id: threadId, action }) })
      return r.ok
    } catch { return false }
  }

  async function markRead(threadId: string) {
    await threadAction(threadId, 'read')
    setThreads(prev => prev.map(th => th.id === threadId ? { ...th, unread_by_admin: false } : th))
  }

  async function handleChatClick() {
    const current = selectedThreadRef.current
    if (!current) return
    const thread = threads.find(th => th.id === current.id)
    if (thread?.unread_by_admin) {
      await markRead(current.id)
    }
  }

  async function recallMessage(id: string) {
    setRecalling(id)
    setSendError(null)
    setNotice(null)
    try {
      const r = await fetch('/api/admin/chat-recall', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message_id: id }) })
      const d = await r.json().catch(() => ({} as any))
      if (!r.ok && d.code !== 'already') {
        setSendError(t(d.code === 'too_old' ? 'admin.messages.recallTooOld' : 'admin.messages.recallFailed'))
        return
      }
      if (d.recalled_at) setMessages(prev => prev.map(m => m.id === id ? { ...m, recalled_at: d.recalled_at, recalled_by: d.recalled_by } : m))
      if (d.email === 'sent') setNotice(t('admin.messages.recallEmailSent'))
      setConfirmRecall(null)
      const current = selectedThreadRef.current
      if (current) fetchThreadRow(current.id)
    } catch {
      setSendError(t('admin.messages.recallFailed'))
    } finally {
      setRecalling(null)
    }
  }

  async function sendMessage() {
    if (!input.trim() || !selectedThread || sending) return
    setSending(true)
    setSendError(null)
    const body = input.trim()
    setInput('')
    if (replyRef.current) replyRef.current.style.height = 'auto'
    // Checked (found 2026-10-08): a refused or dropped insert used to lose the
    // typed reply with no word, while the thread's preview and mode were
    // updated as if it had gone. Now the text comes back and nothing else moves.
    // The server writes the message and the thread's preview together, with
    // this admin as the sender (app/api/admin/chat-message).
    let sent: { id: string; thread_id: string } | null = null
    try {
      const r = await fetch('/api/admin/chat-message', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ thread_id: selectedThread.id, body }) })
      if (r.ok) sent = (await r.json().catch(() => null))?.message ?? null
    } catch {}
    if (!sent) {
      setInput(prev => prev ? prev : body)
      setSendError(t('admin.messages.sendFailed'))
      setSending(false)
      return
    }
    const row = sent
    if (selectedThreadRef.current?.id === row.thread_id) setMessages(prev => prev.some(m => m.id === row.id) ? prev : [...prev, row])
    if (selectedThread.mode !== 'human') await setThreadMode('human')
    setSending(false)
  }

  const isMobile = useIsMobile()
  const unreadCount = threads.filter(th => th.unread_by_admin).length

  return (
    // Fixed so the thread list and the conversation each scroll on their own.
    // left:0 put it over the admin sidebar, and with the sidebar covered there
    // was no way off this page but the browser's back button. From lg up the
    // sidebar is w-52 (13rem), so the panel starts there.
    <div className="admin-msg-shell" style={{
      fontFamily: "'DM Sans', sans-serif",
      background: DARKER,
      position: 'fixed',
      top: 73,
      left: 0,
      right: 0,
      bottom: 0,
      display: 'flex',
      flexDirection: 'column',
    }}>
      <style>{`@media (min-width: 1024px) { .admin-msg-shell { left: 13rem !important; } }`}</style>
      <div style={{ padding: '20px 32px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0 }}>
        <h1 style={{ fontFamily: "'Playfair Display', serif", color: '#fff', fontSize: '24px', fontWeight: 900, margin: 0 }}>{t('admin.nav.messages')}</h1>
        {unreadCount > 0 && (
          <span style={{ background: RED, color: '#fff', borderRadius: '999px', fontSize: '12px', fontWeight: 700, padding: '2px 8px' }}>{unreadCount}</span>
        )}
      </div>

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <div style={{
          width: isMobile ? '100%' : '320px',
          display: isMobile && mobileView === 'chat' ? 'none' : 'flex',
          flexDirection: 'column',
          borderRight: '1px solid rgba(255,255,255,0.06)',
          overflowY: 'auto',
        }}>
          {threads.length === 0 && (
            <div style={{ padding: '40px', textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: '14px' }}>{t('admin.messages.empty')}</div>
          )}
          {threads.map(thread => (
            <div key={thread.id} onClick={() => selectThread(thread)} style={{
              padding: '16px 20px', cursor: 'pointer', borderBottom: '1px solid rgba(255,255,255,0.05)',
              background: selectedThread?.id === thread.id ? 'rgba(201,168,76,0.08)' : 'transparent',
              borderLeft: selectedThread?.id === thread.id ? `3px solid ${GOLD}` : '3px solid transparent',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, color: '#fff', fontSize: '14px' }}>
                  {thread.parents ? `${thread.parents.first_name} ${thread.parents.last_name || ''}` : thread.guest_name ? t('admin.messages.guestNamed', { name: thread.guest_name }) : t('admin.messages.guest')}
                  {thread.unread_by_admin && (
                    <span style={{ background: RED, borderRadius: '50%', width: '8px', height: '8px', display: 'inline-block', flexShrink: 0 }} />
                  )}
                </div>
                <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)' }}>
                  {thread.last_message_at ? new Date(thread.last_message_at).toLocaleDateString(dateTag(locale, 'en-US'), { month: 'short', day: 'numeric' }) : ''}
                </div>
              </div>
              <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {thread.last_message_preview || thread.parents?.email}
              </div>
            </div>
          ))}
          {hasMoreThreads && (
            <button type="button" onClick={loadMoreThreads} disabled={loadingThreads}
              style={{ margin: '12px auto 20px', fontSize: '12px', fontWeight: 700, color: GOLD, background: 'transparent', border: `1px solid ${GOLD}66`, borderRadius: '8px', padding: '6px 14px', cursor: 'pointer', flexShrink: 0 }}>
              {loadingThreads ? '...' : t('admin.messages.loadMoreThreads')}
            </button>
          )}
        </div>

        <div
          onClick={handleChatClick}
          style={{ flex: 1, display: isMobile && mobileView === 'list' ? 'none' : 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {!selectedThread ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.2)', fontSize: '14px' }}>
              {t('admin.messages.selectConversation')}
            </div>
          ) : (
            <>
              <div style={{ padding: '16px 24px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0 }}>
                {isMobile && (
                  <button onClick={(e) => { e.stopPropagation(); setMobileView('list') }} style={{ background: 'none', border: 'none', color: GOLD, fontSize: '20px', cursor: 'pointer' }}>←</button>
                )}
                <div>
                  <div style={{ fontWeight: 700, color: '#fff', fontSize: '15px' }}>{selectedThread.parents ? `${selectedThread.parents.first_name} ${selectedThread.parents.last_name || ''}` : selectedThread.guest_name ? t('admin.messages.guestNamed', { name: selectedThread.guest_name }) : t('admin.messages.guest')}</div>
                  <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)' }}>{selectedThread.parents ? selectedThread.parents.email
                    // A visitor who asked for a person left a way to reach them
                    // (tier 3); every reply is also emailed to them.
                    : selectedThread.guest_email ? t('admin.messages.guestContact', { email: selectedThread.guest_email, phone: selectedThread.guest_phone || '—' })
                    : t('admin.messages.guestHint')}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '6px' }}>
                    {selectedThread.mode === 'human' ? (
                      <>
                        <span style={{ fontSize: '11px', fontWeight: 700, color: '#4ade80', background: 'rgba(74,222,128,0.12)', borderRadius: '999px', padding: '2px 10px' }}>{t('admin.messages.humanActive')}</span>
                        <button onClick={() => setThreadMode('ai')} disabled={switchingMode}
                          style={{ fontSize: '11px', fontWeight: 700, color: GOLD, background: 'transparent', border: `1px solid ${GOLD}66`, borderRadius: '8px', padding: '3px 10px', cursor: 'pointer' }}>
                          {switchingMode ? '...' : t('admin.messages.handBack')}
                        </button>
                      </>
                    ) : (
                      <>
                        <span style={{ fontSize: '11px', fontWeight: 700, color: GOLD, background: 'rgba(201,168,76,0.12)', borderRadius: '999px', padding: '2px 10px' }}>{t('admin.messages.aiResponding')}</span>
                        <button onClick={() => setThreadMode('human')} disabled={switchingMode}
                          style={{ fontSize: '11px', fontWeight: 700, color: '#fff', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '8px', padding: '3px 10px', cursor: 'pointer' }}>
                          {switchingMode ? '...' : t('admin.messages.takeOver')}
                        </button>
                      </>
                    )}
                  </div>
                  {selectedThread.escalation_summary && (
                    <div style={{ marginTop: '8px', background: 'rgba(201,168,76,0.08)', border: `1px solid ${GOLD}55`, borderRadius: '10px', padding: '10px 12px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                        <div style={{ fontSize: '10px', fontWeight: 700, color: GOLD, letterSpacing: '1px' }}>{t('admin.messages.escalations')}</div>
                        <button onClick={async () => {
                          if (!(await threadAction(selectedThread.id, 'clear_summary'))) return
                          setSelectedThread((prev: any) => prev ? { ...prev, escalation_summary: null } : prev)
                        }} style={{ fontSize: '10px', color: 'rgba(255,255,255,0.5)', background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '6px', padding: '2px 8px', cursor: 'pointer' }}>{t('admin.messages.resolvedClear')}</button>
                      </div>
                      <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.85)', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{selectedThread.escalation_summary}</div>
                    </div>
                  )}
                </div>
              </div>

              <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {hasOlder && (
                  <button onClick={(e) => { e.stopPropagation(); loadOlder() }} disabled={loadingOlder}
                    style={{ alignSelf: 'center', fontSize: '12px', fontWeight: 700, color: GOLD, background: 'transparent', border: `1px solid ${GOLD}66`, borderRadius: '8px', padding: '4px 12px', cursor: 'pointer' }}>
                    {loadingOlder ? '...' : t('admin.messages.loadEarlier')}
                  </button>
                )}
                {messages.map(msg => {
                  const recalled = !!msg.recalled_at
                  const opened = openRecalled.has(msg.id)
                  const recalledLine = recalled && t(adminNames[msg.recalled_by] ? 'admin.messages.recalledBy' : 'admin.messages.recalled', { name: adminNames[msg.recalled_by] || '', time: clock(msg.recalled_at) })
                  const toggleOpen = () => setOpenRecalled(prev => { const n = new Set(prev); if (n.has(msg.id)) n.delete(msg.id); else n.add(msg.id); return n })
                  // Folded: one quiet line where the message was.
                  if (recalled && !opened) return (
                    <div key={msg.id} style={{ display: 'flex', justifyContent: 'flex-end' }}>
                      <button type="button" onClick={(e) => { e.stopPropagation(); toggleOpen() }} style={{
                        background: 'transparent', border: '1px dashed rgba(255,255,255,0.2)', borderRadius: '12px',
                        padding: '6px 12px', color: 'rgba(255,255,255,0.55)', fontSize: '12px', cursor: 'pointer',
                      }}>
                        ↩ {recalledLine} · {t('admin.messages.recallShow')}
                      </button>
                    </div>
                  )
                  const canRecall = (msg.sender_type === 'admin' || msg.sender_type === 'ai') && !recalled && !msg._local
                    && nowMs - Date.parse(msg.created_at) < RECALL_WINDOW_MS
                  const asking = confirmRecall === msg.id
                  return (
                  <div key={msg.id} style={{ display: 'flex', flexDirection: 'column', alignItems: msg.sender_type === 'parent' ? 'flex-start' : 'flex-end', gap: '4px' }}>
                    <div style={{
                      maxWidth: '70%', padding: '10px 14px',
                      borderRadius: msg.sender_type === 'parent' ? '16px 16px 16px 4px' : '16px 16px 4px 16px',
                      background: msg.sender_type === 'admin' ? GOLD : msg.sender_type === 'ai' ? 'rgba(201,168,76,0.15)' : 'rgba(255,255,255,0.08)',
                      color: msg.sender_type === 'admin' ? NAVY : '#fff',
                      fontSize: '13px', lineHeight: 1.5, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere',
                      border: recalled ? '1px dashed rgba(255,255,255,0.35)' : msg.sender_type === 'ai' ? '1px solid rgba(201,168,76,0.35)' : 'none',
                      opacity: recalled ? 0.5 : 1,
                    }}>
                      {msg.sender_type === 'ai' && (
                        <div style={{ fontSize: '10px', fontWeight: 700, color: GOLD, marginBottom: '4px', letterSpacing: '0.5px' }}>{t('chat.fromAi')}</div>
                      )}
                      {msg.sender_type === 'admin' && msg.sender_admin_id && staffNames[msg.sender_admin_id] && (
                        <div style={{ fontSize: '10px', fontWeight: 700, color: NAVY, opacity: 0.7, marginBottom: '4px', letterSpacing: '0.5px' }}>{staffNames[msg.sender_admin_id]}</div>
                      )}
                      {/* A photo the family sent from the app (app/api/chat/photo). */}
                      {msg.metadata?.photo && !msg._local ? (
                        <a href={`/api/chat/photo?id=${msg.id}`} target="_blank" rel="noreferrer" style={{ display: 'block' }}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={`/api/chat/photo?id=${msg.id}`} alt={t('chat.photo.alt')} loading="lazy"
                            style={{ display: 'block', maxWidth: '240px', maxHeight: '320px', borderRadius: '10px' }} />
                        </a>
                      ) : msg.body}
                      <div style={{ fontSize: '10px', opacity: 0.5, marginTop: '4px', textAlign: 'right' }}>
                        {clock(msg.created_at)}
                      </div>
                    </div>
                    {recalled && (
                      <button type="button" onClick={(e) => { e.stopPropagation(); toggleOpen() }} style={{ background: 'transparent', border: 'none', padding: '2px 4px', color: 'rgba(255,255,255,0.55)', fontSize: '11px', cursor: 'pointer' }}>
                        ↩ {recalledLine} · {t('admin.messages.recallHide')}
                      </button>
                    )}
                    {canRecall && !asking && (
                      <button type="button" onClick={(e) => { e.stopPropagation(); setConfirmRecall(msg.id) }} style={{ background: 'transparent', border: 'none', padding: '2px 4px', color: 'rgba(255,255,255,0.45)', fontSize: '11px', cursor: 'pointer' }}>
                        {t('admin.messages.recall')}
                      </button>
                    )}
                    {canRecall && asking && (
                      <div onClick={e => e.stopPropagation()} style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', justifyContent: 'flex-end', maxWidth: '70%' }}>
                        <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.8)' }}>{t('admin.messages.recallConfirm')}</span>
                        <button type="button" disabled={recalling === msg.id} onClick={() => setConfirmRecall(null)} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '8px', padding: '4px 10px', color: '#fff', fontSize: '12px', cursor: 'pointer' }}>
                          {t('admin.messages.recallKeep')}
                        </button>
                        <button type="button" disabled={recalling === msg.id} onClick={() => recallMessage(msg.id)} style={{ background: RED, border: 'none', borderRadius: '8px', padding: '4px 12px', color: '#fff', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}>
                          {recalling === msg.id ? '…' : t('admin.messages.recall')}
                        </button>
                      </div>
                    )}
                  </div>
                  )
                })}
                <div ref={bottomRef} />
              </div>

              {sendError && (
                <div role="alert" style={{ padding: '8px 24px', background: 'rgba(239,68,68,0.15)', color: '#fca5a5', fontSize: '12px', flexShrink: 0 }}>{sendError}</div>
              )}
              {notice && (
                <div role="status" style={{ padding: '8px 24px', background: 'rgba(201,168,76,0.15)', color: GOLD, fontSize: '12px', flexShrink: 0 }}>{notice}</div>
              )}
              <div style={{ padding: '16px 24px', borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', gap: '10px', background: NAVY, flexShrink: 0 }}>
                {/* Enter adds a line; only the Send button sends (owner,
                    2026-10-23: a reply went out half-typed on Enter). */}
                <textarea
                  ref={replyRef}
                  value={input}
                  rows={1}
                  onChange={e => {
                    setInput(e.target.value)
                    e.target.style.height = 'auto'
                    e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`
                  }}
                  onClick={e => e.stopPropagation()}
                  placeholder={t('admin.messages.replyPlaceholder')}
                  style={{
                    flex: 1, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '10px', padding: '10px 14px', color: '#fff', fontSize: '13px', outline: 'none',
                    resize: 'none', lineHeight: 1.5, fontFamily: 'inherit', maxHeight: '160px', overflowY: 'auto',
                  }}
                />
                <button onClick={(e) => { e.stopPropagation(); sendMessage() }} disabled={!input.trim() || sending} style={{
                  background: input.trim() ? GOLD : 'rgba(255,255,255,0.1)',
                  border: 'none', borderRadius: '10px', padding: '0 20px',
                  cursor: input.trim() ? 'pointer' : 'not-allowed',
                  color: input.trim() ? NAVY : 'rgba(255,255,255,0.3)',
                  fontWeight: 700, fontSize: '13px',
                }}>{t('admin.messages.send')}</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
