'use client'
import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'

const NAVY = '#1a2744'
const DARKER = '#0d1529'
const GOLD = '#c9a84c'
const RED = '#ef4444'

export default function AdminMessagesClient({ adminId, adminName }: { adminId: string; adminName: string }) {
  const supabase = createClient()
  const [threads, setThreads] = useState<any[]>([])
  const [selectedThread, setSelectedThread] = useState<any>(null)
  const [messages, setMessages] = useState<any[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [switchingMode, setSwitchingMode] = useState(false)

  async function setThreadMode(mode: 'ai' | 'human') {
    if (!selectedThread || switchingMode) return
    setSwitchingMode(true)
    try {
      const res = await fetch('/api/admin/chat-handoff', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ thread_id: selectedThread.id, mode }) })
      if (res.ok) {
        setSelectedThread((prev: any) => prev ? { ...prev, mode, ...(mode === 'ai' ? { escalation_summary: null } : {}) } : prev)
        setThreads(prev => prev.map(t => t.id === selectedThread.id ? { ...t, mode } : t))
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

  useEffect(() => {
    const channel = supabase
      .channel('admin:chat:all')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages' }, (payload) => {
        const msg = payload.new as any
        const current = selectedThreadRef.current
        if (current && msg.thread_id === current.id) {
          setMessages(prev => [...prev, msg])
          // 收到新訊息，標記為未讀（不管是否在此對話）
          setThreads(prev => prev.map(t => t.id === current.id ? { ...t, unread_by_admin: msg.sender_type === 'parent' ? true : t.unread_by_admin, last_message_preview: msg.body } : t))
        } else {
          loadThreads()
        }
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [])

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  async function loadThreads() {
    const { data } = await supabase
      .from('chat_threads')
      .select('*, parents(first_name, last_name, email)')
      .order('last_message_at', { ascending: false, nullsFirst: false })
    setThreads(data || [])
  }

  async function loadMessages(threadId: string) {
    const { data } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('thread_id', threadId)
      .order('created_at', { ascending: true })
    setMessages(data || [])
  }

  async function selectThread(thread: any) {
    setSelectedThread(thread)
    setMobileView('chat')
    await loadMessages(thread.id)
    // 點開對話 → 標記已讀
    await markRead(thread.id)
  }

  async function markRead(threadId: string) {
    await supabase.from('chat_threads').update({ unread_by_admin: false }).eq('id', threadId)
    setThreads(prev => prev.map(t => t.id === threadId ? { ...t, unread_by_admin: false } : t))
  }

  async function handleChatClick() {
    const current = selectedThreadRef.current
    if (!current) return
    const thread = threads.find(t => t.id === current.id)
    if (thread?.unread_by_admin) {
      await markRead(current.id)
    }
  }

  async function sendMessage() {
    if (!input.trim() || !selectedThread || sending) return
    setSending(true)
    const body = input.trim()
    setInput('')
    await supabase.from('chat_messages').insert({ thread_id: selectedThread.id, sender_type: 'admin', body, sender_admin_id: adminId })
    await supabase.from('chat_threads').update({ last_message_at: new Date().toISOString(), last_message_preview: body, unread_by_admin: false }).eq('id', selectedThread.id)
    if (selectedThread.mode !== 'human') await setThreadMode('human')
    setSending(false)
    loadThreads()
  }

  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768
  const unreadCount = threads.filter(t => t.unread_by_admin).length

  return (
    <div style={{
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
      <div style={{ padding: '20px 32px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0 }}>
        <h1 style={{ fontFamily: "'Playfair Display', serif", color: '#fff', fontSize: '24px', fontWeight: 900, margin: 0 }}>Messages</h1>
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
            <div style={{ padding: '40px', textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: '14px' }}>No messages yet</div>
          )}
          {threads.map(thread => (
            <div key={thread.id} onClick={() => selectThread(thread)} style={{
              padding: '16px 20px', cursor: 'pointer', borderBottom: '1px solid rgba(255,255,255,0.05)',
              background: selectedThread?.id === thread.id ? 'rgba(201,168,76,0.08)' : 'transparent',
              borderLeft: selectedThread?.id === thread.id ? `3px solid ${GOLD}` : '3px solid transparent',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, color: '#fff', fontSize: '14px' }}>
                  {thread.parents?.first_name} {thread.parents?.last_name}
                  {thread.unread_by_admin && (
                    <span style={{ background: RED, borderRadius: '50%', width: '8px', height: '8px', display: 'inline-block', flexShrink: 0 }} />
                  )}
                </div>
                <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)' }}>
                  {thread.last_message_at ? new Date(thread.last_message_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''}
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
              Select a conversation
            </div>
          ) : (
            <>
              <div style={{ padding: '16px 24px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0 }}>
                {isMobile && (
                  <button onClick={(e) => { e.stopPropagation(); setMobileView('list') }} style={{ background: 'none', border: 'none', color: GOLD, fontSize: '20px', cursor: 'pointer' }}>←</button>
                )}
                <div>
                  <div style={{ fontWeight: 700, color: '#fff', fontSize: '15px' }}>{selectedThread.parents?.first_name} {selectedThread.parents?.last_name}</div>
                  <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)' }}>{selectedThread.parents?.email}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '6px' }}>
                    {selectedThread.mode === 'human' ? (
                      <>
                        <span style={{ fontSize: '11px', fontWeight: 700, color: '#4ade80', background: 'rgba(74,222,128,0.12)', borderRadius: '999px', padding: '2px 10px' }}>👤 真人服務中</span>
                        <button onClick={() => setThreadMode('ai')} disabled={switchingMode}
                          style={{ fontSize: '11px', fontWeight: 700, color: GOLD, background: 'transparent', border: `1px solid ${GOLD}66`, borderRadius: '8px', padding: '3px 10px', cursor: 'pointer' }}>
                          {switchingMode ? '...' : '交還 AI'}
                        </button>
                      </>
                    ) : (
                      <>
                        <span style={{ fontSize: '11px', fontWeight: 700, color: GOLD, background: 'rgba(201,168,76,0.12)', borderRadius: '999px', padding: '2px 10px' }}>🤖 AI 回應中</span>
                        <button onClick={() => setThreadMode('human')} disabled={switchingMode}
                          style={{ fontSize: '11px', fontWeight: 700, color: '#fff', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '8px', padding: '3px 10px', cursor: 'pointer' }}>
                          {switchingMode ? '...' : '接管對話'}
                        </button>
                      </>
                    )}
                  </div>
                  {selectedThread.escalation_summary && (
                    <div style={{ marginTop: '8px', background: 'rgba(201,168,76,0.08)', border: `1px solid ${GOLD}55`, borderRadius: '10px', padding: '10px 12px' }}>
                      <div style={{ fontSize: '10px', fontWeight: 700, color: GOLD, letterSpacing: '1px', marginBottom: '4px' }}>AI 轉接摘要</div>
                      <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.85)', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{selectedThread.escalation_summary}</div>
                    </div>
                  )}
                </div>
              </div>

              <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
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
                        <div style={{ fontSize: '10px', fontWeight: 700, color: GOLD, marginBottom: '4px', letterSpacing: '0.5px' }}>AI ASSISTANT</div>
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

              <div style={{ padding: '16px 24px', borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', gap: '10px', background: NAVY, flexShrink: 0 }}>
                <input
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}
                  onClick={e => e.stopPropagation()}
                  placeholder="Reply..."
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
                }}>Send</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
