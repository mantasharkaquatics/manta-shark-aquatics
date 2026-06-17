'use client'
import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'

const NAVY = '#1a2744'
const DARK = '#111d38'
const GOLD = '#c9a84c'

export default function ChatWidget({ parentId }: { parentId: string }) {
  const supabase = createClient()
  const [open, setOpen] = useState(false)
  const [threadId, setThreadId] = useState<string | null>(null)
  const [messages, setMessages] = useState<any[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [unread, setUnread] = useState(0)
  const bottomRef = useRef<HTMLDivElement>(null)
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768

  useEffect(() => {
    if (!open) return
    initThread()
  }, [open])

  useEffect(() => {
    if (!threadId) return
    loadMessages()
    const channel = supabase
      .channel(`chat:${threadId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `thread_id=eq.${threadId}` }, (payload) => {
        setMessages(prev => [...prev, payload.new])
        if (!open) setUnread(u => u + 1)
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [threadId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    if (open) setUnread(0)
  }, [open])

  async function initThread() {
    const { data } = await supabase
      .from('chat_threads')
      .select('id')
      .eq('parent_id', parentId)
      .single()
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

  async function loadMessages() {
    const { data } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('thread_id', threadId)
      .order('created_at', { ascending: true })
    setMessages(data || [])
  }

  async function sendMessage() {
    if (!input.trim() || !threadId || sending) return
    setSending(true)
    const body = input.trim()
    setInput('')
    await supabase.from('chat_messages').insert({ thread_id: threadId, sender_type: 'parent', body })
    await supabase.from('chat_threads').update({ last_message_at: new Date().toISOString(), last_message_preview: body, unread_by_admin: true }).eq('id', threadId)
    setSending(false)
  }

  const windowStyle: React.CSSProperties = isMobile ? {
    position: 'fixed', inset: 0, zIndex: 1000,
    display: 'flex', flexDirection: 'column',
    background: DARK,
  } : {
    position: 'fixed', bottom: '80px', right: '20px', zIndex: 1000,
    width: '360px', height: '500px',
    borderRadius: '16px', overflow: 'hidden',
    display: 'flex', flexDirection: 'column',
    background: DARK, border: '1px solid rgba(255,255,255,0.1)',
    boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
  }

  return (
    <>
      {/* FAB Button */}
      {!open && (
        <button data-chat-toggle onClick={() => setOpen(true)} style={{
          position: 'fixed', bottom: '20px', right: '20px', zIndex: 999,
          width: '56px', height: '56px', borderRadius: '50%',
          background: GOLD, border: 'none', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 4px 20px rgba(201,168,76,0.4)',
        }}>
          <span style={{ fontSize: '24px' }}>💬</span>
          {unread > 0 && (
            <div style={{
              position: 'absolute', top: '-4px', right: '-4px',
              background: '#e05a4a', color: '#fff', borderRadius: '50%',
              width: '20px', height: '20px', fontSize: '11px', fontWeight: 700,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>{unread}</div>
          )}
        </button>
      )}

      {/* Chat Window */}
      {open && (
        <div style={windowStyle}>
          {/* Header */}
          <div style={{ background: NAVY, padding: '16px 20px', display: 'flex', alignItems: 'center', gap: '12px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
            <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: GOLD, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px' }}>🦈</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: "'Playfair Display', serif", fontWeight: 700, color: '#fff', fontSize: '15px' }}>Manta Shark Support</div>
              <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)' }}>We typically reply within a few hours</div>
            </div>
            <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', fontSize: '20px', cursor: 'pointer', padding: '4px' }}>✕</button>
          </div>

          {/* Messages */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {messages.length === 0 && (
              <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: '13px', marginTop: '40px' }}>
                <div style={{ fontSize: '32px', marginBottom: '8px' }}>👋</div>
                Hi! How can we help you today?
              </div>
            )}
            {messages.map(msg => (
              <div key={msg.id} style={{ display: 'flex', justifyContent: msg.sender_type === 'parent' ? 'flex-end' : 'flex-start' }}>
                <div style={{
                  maxWidth: '75%', padding: '10px 14px', borderRadius: msg.sender_type === 'parent' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                  background: msg.sender_type === 'parent' ? GOLD : 'rgba(255,255,255,0.08)',
                  color: msg.sender_type === 'parent' ? NAVY : '#fff',
                  fontSize: '13px', lineHeight: 1.5, fontWeight: msg.sender_type === 'parent' ? 600 : 400,
                }}>
                  {msg.body}
                  <div style={{ fontSize: '10px', opacity: 0.5, marginTop: '4px', textAlign: 'right' }}>
                    {new Date(msg.created_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                  </div>
                </div>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div style={{ padding: '12px 16px', borderTop: '1px solid rgba(255,255,255,0.08)', display: 'flex', gap: '8px', background: NAVY }}>
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}
              placeholder="Type a message..."
              style={{
                flex: 1, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '10px', padding: '10px 14px', color: '#fff', fontSize: '13px', outline: 'none',
              }}
            />
            <button onClick={sendMessage} disabled={!input.trim() || sending} style={{
              background: input.trim() ? GOLD : 'rgba(255,255,255,0.1)',
              border: 'none', borderRadius: '10px', width: '40px',
              cursor: input.trim() ? 'pointer' : 'not-allowed',
              fontSize: '16px', color: input.trim() ? NAVY : 'rgba(255,255,255,0.3)',
            }}>➤</button>
          </div>
        </div>
      )}
    </>
  )
}
