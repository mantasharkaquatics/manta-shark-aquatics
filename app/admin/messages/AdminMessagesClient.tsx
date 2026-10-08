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

export default function AdminMessagesClient({ adminId, adminName }: { adminId: string; adminName: string }) {
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

  async function loadThreads() {
    const { data } = await supabase
      .from('chat_threads')
      .select('*, parents(first_name, last_name, email)')
      .order('last_message_at', { ascending: false, nullsFirst: false })
    setThreads(data || [])
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
    setHasOlder(false)
    setSendError(null)
    setMobileView('chat')
    await loadMessages(thread.id)
    // Open thread → mark as read
    await markRead(thread.id)
  }

  async function markRead(threadId: string) {
    await supabase.from('chat_threads').update({ unread_by_admin: false }).eq('id', threadId)
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

  async function sendMessage() {
    if (!input.trim() || !selectedThread || sending) return
    setSending(true)
    setSendError(null)
    const body = input.trim()
    setInput('')
    // Checked (found 2026-10-08): a refused or dropped insert used to lose the
    // typed reply with no word, while the thread's preview and mode were
    // updated as if it had gone. Now the text comes back and nothing else moves.
    const { error } = await supabase.from('chat_messages').insert({ thread_id: selectedThread.id, sender_type: 'admin', body, sender_admin_id: adminId })
    if (error) {
      setInput(prev => prev ? prev : body)
      setSendError(t('admin.messages.sendFailed'))
      setSending(false)
      return
    }
    await supabase.from('chat_threads').update({ last_message_at: new Date().toISOString(), last_message_preview: body, unread_by_admin: false }).eq('id', selectedThread.id)
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
                  {thread.parents ? `${thread.parents.first_name} ${thread.parents.last_name || ''}` : t('admin.messages.guest')}
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
                  <div style={{ fontWeight: 700, color: '#fff', fontSize: '15px' }}>{selectedThread.parents ? `${selectedThread.parents.first_name} ${selectedThread.parents.last_name || ''}` : t('admin.messages.guest')}</div>
                  <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)' }}>{selectedThread.parents ? selectedThread.parents.email : t('admin.messages.guestHint')}</div>
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
                          await supabase.from('chat_threads').update({ escalation_summary: null }).eq('id', selectedThread.id)
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
                {messages.map(msg => (
                  <div key={msg.id} style={{ display: 'flex', justifyContent: msg.sender_type === 'parent' ? 'flex-start' : 'flex-end' }}>
                    <div style={{
                      maxWidth: '70%', padding: '10px 14px',
                      borderRadius: msg.sender_type === 'parent' ? '16px 16px 16px 4px' : '16px 16px 4px 16px',
                      background: msg.sender_type === 'admin' ? GOLD : msg.sender_type === 'ai' ? 'rgba(201,168,76,0.15)' : 'rgba(255,255,255,0.08)',
                      color: msg.sender_type === 'admin' ? NAVY : '#fff',
                      fontSize: '13px', lineHeight: 1.5,
                      border: msg.sender_type === 'ai' ? '1px solid rgba(201,168,76,0.35)' : 'none',
                    }}>
                      {msg.sender_type === 'ai' && (
                        <div style={{ fontSize: '10px', fontWeight: 700, color: GOLD, marginBottom: '4px', letterSpacing: '0.5px' }}>{t('chat.fromAi')}</div>
                      )}
                      {msg.body}
                      <div style={{ fontSize: '10px', opacity: 0.5, marginTop: '4px', textAlign: 'right' }}>
                        {new Date(msg.created_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                      </div>
                    </div>
                  </div>
                ))}
                <div ref={bottomRef} />
              </div>

              {sendError && (
                <div role="alert" style={{ padding: '8px 24px', background: 'rgba(239,68,68,0.15)', color: '#fca5a5', fontSize: '12px', flexShrink: 0 }}>{sendError}</div>
              )}
              <div style={{ padding: '16px 24px', borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', gap: '10px', background: NAVY, flexShrink: 0 }}>
                <input
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}
                  onClick={e => e.stopPropagation()}
                  placeholder={t('admin.messages.replyPlaceholder')}
                  style={{
                    flex: 1, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '10px', padding: '10px 14px', color: '#fff', fontSize: '13px', outline: 'none',
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
