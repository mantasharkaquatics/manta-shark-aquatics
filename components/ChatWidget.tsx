'use client'
import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'

const NAVY = '#1a2744'
const DARK = '#111d38'
const GOLD = '#c9a84c'

function renderBody(text: string) {
  const parts = String(text).split(/(https?:\/\/[^\s]+)/g)
  return parts.map((p, i) =>
    /^https?:\/\//.test(p)
      ? <a key={i} href={p} target={p.includes('stripe.com') ? '_blank' : '_self'} rel="noreferrer" style={{ color: 'inherit', textDecoration: 'underline', fontWeight: 700, wordBreak: 'break-all' }}>{p.length > 60 ? 'Open link →' : p}</a>
      : p
  )
}

export default function ChatWidget({ parentId }: { parentId: string }) {
  const supabase = createClient()
  const [open, setOpen] = useState(false)
  const [threadId, setThreadId] = useState<string | null>(null)
  const [messages, setMessages] = useState<any[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [unread, setUnread] = useState(0)
  const [awaitingAi, setAwaitingAi] = useState(false)
  const awaitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
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
        if ((payload.new as any)?.sender_type !== 'parent') {
          setAwaitingAi(false)
          if (awaitTimerRef.current) { clearTimeout(awaitTimerRef.current); awaitTimerRef.current = null }
        }
        if (!open) setUnread(u => u + 1)
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [threadId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, awaitingAi])

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

  async function sendMessage(text?: string) {
    const body = (text ?? input).trim()
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
    } catch {
      setAwaitingAi(false)
      if (awaitTimerRef.current) { clearTimeout(awaitTimerRef.current); awaitTimerRef.current = null }
      await supabase.from('chat_threads').update({ unread_by_admin: true }).eq('id', threadId)
    }
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
      <style>{`
        @keyframes msaTypingBlink { 0%, 80%, 100% { opacity: 0.25; transform: translateY(0); } 40% { opacity: 1; transform: translateY(-3px); } }
      `}</style>
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
              <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)' }}>AI assistant · a team member follows up when needed</div>
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
            {messages.map(msg => msg.sender_type === 'system' ? (
              <div key={msg.id} style={{ textAlign: 'center', fontSize: '11px', color: 'rgba(255,255,255,0.35)', padding: '2px 0' }}>
                AI assistant has resumed this conversation
              </div>
            ) : (
              <div key={msg.id} style={{ display: 'flex', justifyContent: msg.sender_type === 'parent' ? 'flex-end' : 'flex-start' }}>
                <div style={{
                  maxWidth: '75%', padding: '10px 14px', borderRadius: msg.sender_type === 'parent' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                  background: msg.sender_type === 'parent' ? GOLD : 'rgba(255,255,255,0.08)',
                  color: msg.sender_type === 'parent' ? NAVY : '#fff',
                  whiteSpace: 'pre-wrap', fontSize: '13px', lineHeight: 1.5, fontWeight: msg.sender_type === 'parent' ? 600 : 400,
                }}>
                  {msg.sender_type === 'ai' && (
                    <div style={{ fontSize: '10px', fontWeight: 700, color: GOLD, marginBottom: '4px', letterSpacing: '0.5px' }}>AI ASSISTANT</div>
                  )}
                  {msg.sender_type === 'admin' && (
                    <div style={{ fontSize: '10px', fontWeight: 700, color: '#4ade80', marginBottom: '4px', letterSpacing: '0.5px' }}>FRONT DESK</div>
                  )}
                  {renderBody(msg.body)}
                  {msg.sender_type === 'ai' && msg.id === messages[messages.length - 1]?.id && Array.isArray(msg.metadata?.options) && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '8px' }}>
                      {msg.metadata.options.map((opt: any, i: number) =>
                        opt.type === 'link' ? (
                          <a key={i} href={opt.url} style={{ background: GOLD, color: NAVY, borderRadius: '8px', padding: '6px 12px', fontSize: '12px', fontWeight: 700, textDecoration: 'none' }}>{opt.label}</a>
                        ) : (
                          <button key={i} onClick={() => sendMessage(opt.label)} disabled={sending} style={{ background: 'rgba(255,255,255,0.12)', color: '#fff', border: '1px solid rgba(201,168,76,0.6)', borderRadius: '8px', padding: '6px 12px', fontSize: '12px', fontWeight: 600, cursor: sending ? 'not-allowed' : 'pointer' }}>{opt.label}</button>
                        )
                      )}
                    </div>
                  )}
                  <div style={{ fontSize: '10px', opacity: 0.5, marginTop: '4px', textAlign: 'right' }}>
                    {new Date(msg.created_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                  </div>
                </div>
              </div>
            ))}
            {awaitingAi && (
              <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                <div style={{ padding: '12px 16px', borderRadius: '16px 16px 16px 4px', background: 'rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', gap: '5px' }}>
                  {[0, 1, 2].map(i => (
                    <span key={i} style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'rgba(255,255,255,0.7)', display: 'inline-block', animation: 'msaTypingBlink 1.2s infinite', animationDelay: `${i * 0.2}s` }} />
                  ))}
                </div>
              </div>
            )}
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
            <button onClick={() => sendMessage()} disabled={!input.trim() || sending} style={{
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
