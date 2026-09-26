'use client'
import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useIsMobile } from '@/lib/use-is-mobile'
import { useT } from '@/lib/i18n/provider'
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

// seedInput/seedKey let a page hand the widget a question the visitor already
// typed elsewhere -- the FAQ search box. It opens and fills the box but does
// NOT send: putting words in a parent's mouth and firing them off is not ours
// to do. seedKey changes on every request so the same text can be seeded twice.
// lift: extra px above the bottom edge, for pages whose own sticky action bar
// would otherwise sit under the button (the booking page on a phone).
export default function ChatWidget({ parentId, seedInput, seedKey, lift = 0 }: { parentId: string; seedInput?: string; seedKey?: number; lift?: number }) {
  const t = useT()
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
  const [awaitingAi, setAwaitingAi] = useState(false)

  useEffect(() => {
    if (seedKey === undefined) return
    setOpen(true)
    if (seedInput) setInput(seedInput)
  }, [seedKey])
  const awaitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const isMobile = useIsMobile()

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
      const d = await res.json().catch(() => ({} as any))
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
        }} aria-label={t('chat.title')}>
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1.2-4.6A8 8 0 1 1 21 12z" />
          </svg>
          {unread > 0 && (
            <div style={{
              position: 'absolute', top: '-4px', right: '-4px',
              background: '#c0392b', color: '#fff', borderRadius: '50%',
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
            <img src="/logo.png" alt="Manta Shark Aquatics" width={36} height={36}
              style={{ display: 'block', borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 800, color: '#fff', fontSize: '16px' }}>{t('chat.title')}</div>
              <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.7)' }}>{t('chat.subtitle')}</div>
            </div>
            <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.75)', fontSize: '20px', cursor: 'pointer', padding: '4px' }} aria-label="Close">✕</button>
          </div>

          {/* Messages */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {messages.length === 0 && (
              <div style={{ textAlign: 'center', color: '#56647d', fontSize: '14px', marginTop: '40px' }}>
                <div style={{ fontSize: '32px', marginBottom: '8px' }}>👋</div>
                {t('chat.empty')}
              </div>
            )}
            {messages.map(msg => msg.sender_type === 'system' ? (
              <div key={msg.id} style={{ textAlign: 'center', fontSize: '11.5px', color: '#8a97ad', padding: '2px 0' }}>
                {msg.body}
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
                    {new Date(msg.created_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                  </div>
                </div>
              </div>
            ))}
            {awaitingAi && (
              <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                <div style={{ padding: '12px 16px', borderRadius: '16px 16px 16px 4px', background: '#fff', border: '1px solid #e3ebf6', display: 'flex', alignItems: 'center', gap: '5px' }}>
                  {[0, 1, 2].map(i => (
                    <span key={i} style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#8a97ad', display: 'inline-block', animation: 'msaTypingBlink 1.2s infinite', animationDelay: `${i * 0.2}s` }} />
                  ))}
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div style={{ padding: '12px 16px', borderTop: '1px solid #e3ebf6', display: 'flex', gap: '8px', background: '#fff' }}>
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}
              placeholder={t('chat.placeholder')}
              style={{
                // 16px: anything smaller and iOS zooms the page when the field is tapped.
                flex: 1, background: '#fff', border: '1px solid #d5e0ef',
                borderRadius: '10px', padding: '10px 14px', color: BRAND.ink, fontSize: '16px', outline: 'none', fontFamily: 'inherit',
              }}
            />
            <button onClick={() => sendMessage()} disabled={!input.trim() || sending} style={{
              background: input.trim() ? AMBER : '#eef2f8',
              border: 'none', borderRadius: '10px', width: '40px',
              cursor: input.trim() ? 'pointer' : 'not-allowed',
              fontSize: '16px', color: input.trim() ? NAVY : '#9aa6ba',
            }}>➤</button>
          </div>
        </div>
      )}
    </>
  )
}
