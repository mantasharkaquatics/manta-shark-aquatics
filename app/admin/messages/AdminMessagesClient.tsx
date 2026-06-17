'use client'
import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'

const NAVY = '#1a2744'
const DARK = '#111d38'
const DARKER = '#0d1529'
const GOLD = '#c9a84c'

export default function AdminMessagesClient() {
  const supabase = createClient()
  const [threads, setThreads] = useState<any[]>([])
  const [selectedThread, setSelectedThread] = useState<any>(null)
  const [messages, setMessages] = useState<any[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [mobileView, setMobileView] = useState<'list' | 'chat'>('list')
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => { loadThreads() }, [])

  useEffect(() => {
    if (!selectedThread) return
    loadMessages(selectedThread.id)
    const channel = supabase
      .channel(`admin:chat:${selectedThread.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `thread_id=eq.${selectedThread.id}` }, (payload) => {
        setMessages(prev => [...prev, payload.new])
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [selectedThread])

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
    await supabase.from('chat_threads').update({ unread_by_admin: false }).eq('id', threadId)
  }

  async function selectThread(thread: any) {
    setSelectedThread(thread)
    setMobileView('chat')
  }

  async function sendMessage() {
    if (!input.trim() || !selectedThread || sending) return
    setSending(true)
    const body = input.trim()
    setInput('')
    await supabase.from('chat_messages').insert({ thread_id: selectedThread.id, sender_type: 'admin', body })
    await supabase.from('chat_threads').update({ last_message_at: new Date().toISOString(), last_message_preview: body, unread_by_admin: false }).eq('id', selectedThread.id)
    setSending(false)
    loadThreads()
  }

  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768

  return (
    <div style={{ fontFamily: "'DM Sans', sans-serif", background: DARKER, minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '24px 32px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <h1 style={{ fontFamily: "'Playfair Display', serif", color: '#fff', fontSize: '24px', fontWeight: 900, margin: 0 }}>Messages</h1>
      </div>

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Thread List */}
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
                <div style={{ fontWeight: 700, color: '#fff', fontSize: '14px' }}>
                  {thread.parents?.first_name} {thread.parents?.last_name}
                  {thread.unread_by_admin && <span style={{ marginLeft: '8px', background: GOLD, borderRadius: '50%', width: '8px', height: '8px', display: 'inline-block' }} />}
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

        {/* Chat Area */}
        <div style={{
          flex: 1,
          display: isMobile && mobileView === 'list' ? 'none' : 'flex',
          flexDirection: 'column',
        }}>
          {!selectedThread ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.2)', fontSize: '14px' }}>
              Select a conversation
            </div>
          ) : (
            <>
              {/* Chat Header */}
              <div style={{ padding: '16px 24px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', gap: '12px' }}>
                {isMobile && (
                  <button onClick={() => setMobileView('list')} style={{ background: 'none', border: 'none', color: GOLD, fontSize: '20px', cursor: 'pointer' }}>←</button>
                )}
                <div>
                  <div style={{ fontWeight: 700, color: '#fff', fontSize: '15px' }}>{selectedThread.parents?.first_name} {selectedThread.parents?.last_name}</div>
                  <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)' }}>{selectedThread.parents?.email}</div>
                </div>
              </div>

              {/* Messages */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {messages.map(msg => (
                  <div key={msg.id} style={{ display: 'flex', justifyContent: msg.sender_type === 'admin' ? 'flex-end' : 'flex-start' }}>
                    <div style={{
                      maxWidth: '70%', padding: '10px 14px',
                      borderRadius: msg.sender_type === 'admin' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                      background: msg.sender_type === 'admin' ? GOLD : 'rgba(255,255,255,0.08)',
                      color: msg.sender_type === 'admin' ? NAVY : '#fff',
                      fontSize: '13px', lineHeight: 1.5,
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
              <div style={{ padding: '16px 24px', borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', gap: '10px', background: NAVY }}>
                <input
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}
                  placeholder="Reply..."
                  style={{
                    flex: 1, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '10px', padding: '10px 14px', color: '#fff', fontSize: '13px', outline: 'none',
                  }}
                />
                <button onClick={sendMessage} disabled={!input.trim() || sending} style={{
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
