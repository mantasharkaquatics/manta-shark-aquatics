'use client'
import { Fragment, useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useIsMobile } from '@/lib/use-is-mobile'
import { useT, useLocale } from '@/lib/i18n/provider'
import Link from 'next/link'
import { CHAT_OPEN_EVENT, CHAT_HANDBACK_EN, CHAT_HANDBACK_KEY, CHAT_HANDBACK_AUTO_KEY, ACCOUNT_CHANGED_EVENT, takePendingChatOpen, reportChatOpen, reportChatUnread } from '@/lib/chat-open'
import { BRAND, FONT_BODY, FONT_DISPLAY } from '@/lib/brand'
import { useRouter } from 'next/navigation'
import { appLook } from '@/lib/native-app'

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
// Signed in, it is the family's own thread, read through Supabase with
// realtime updates and written through /api/chat/send and /api/chat/thread
// (2026-10-15: never from the browser, which could write any field). Signed
// out (parentId null), it is a guest conversation held by /api/chat/guest: public answers only, with a nudge to
// create a free account for anything that needs one (owner, 2026-09-28). The
// guest key lives in this browser; as soon as the visitor is signed in,
// GlobalChat hands it to /api/chat/guest/claim so the conversation moves into
// the account.
//
// A page asks the widget to open -- optionally with text in the box, never
// sent -- through openChat() in lib/chat-open.
// lift: extra px above the bottom edge, for pages whose own sticky action bar
// would otherwise sit under the button (the booking page on a phone).
/* The app's chat page, school colours (owner, 2026-10-28, sample B): navy
   and gold frames on a light sea, the school's words in white bubbles with a
   blue rim, the family's in warm cream with an amber rim. */
const PAGE_CSS = `
.pc { flex: 1; min-height: 0; display: flex; flex-direction: column; outline: none; font-family: ${FONT_BODY};
  background: radial-gradient(ellipse at 50% 20%, #eef6ff 0, #d6e7fb 55%, #b7d3f4 100%); }
.pc-mode { text-align: center; font-size: 12px; font-weight: 700; color: #36507e; padding: 6px 12px 0; }
.pc-feed { flex: 1; min-height: 0; overflow-y: auto; padding: 10px 12px 14px; display: flex; flex-direction: column; gap: 10px; }
.pc-empty { margin: 40px auto 0; text-align: center; color: #36507e; font-size: 15px; display: flex; flex-direction: column; gap: 8px; }
.pc-empty span { font-size: 34px; }
.pc-pill { align-self: center; font-size: 11.5px; font-weight: 800; padding: 3px 14px; border-radius: 999px; background: ${BRAND.navy}; color: ${BRAND.yellow}; }
.pc-note { align-self: center; max-width: 90%; text-align: center; font-size: 12px; color: #36507e; background: rgba(255,255,255,.6); border-radius: 10px; padding: 4px 10px; }
.pc-strip { margin: 2px -12px; padding: 9px 14px; font-size: 13px; text-align: center; line-height: 1.45; text-decoration: none;
  background: rgba(18,37,74,.9); color: #fff; border-top: 1px solid ${BRAND.yellow}; border-bottom: 1px solid ${BRAND.yellow}; display: block; }
.pc-strip b { color: ${BRAND.yellow}; font-weight: 800; }
.pc-strip u { text-decoration: none; color: #fff; font-weight: 800; white-space: nowrap; }
.pc-row { display: flex; gap: 8px; align-items: flex-start; }
.pc-row.me { justify-content: flex-end; }
.pc-av { position: relative; flex-shrink: 0; width: 44px; height: 44px; border-radius: 11px; display: grid; place-items: center; font-weight: 900; font-size: 18px;
  border: 3px solid ${BRAND.amber}; box-shadow: inset 0 0 0 2px #fff; }
.pc-av img { width: 32px; height: auto; display: block; }
.pc-av i { position: absolute; top: -7px; right: -9px; font-style: normal; font-size: 9.5px; font-weight: 900; padding: 1px 5px; border-radius: 6px;
  background: ${BRAND.amber}; color: ${BRAND.navy}; border: 1px solid #fff; white-space: nowrap; }
.pc-av-ai { background: #fff; }
.pc-av-desk { background: ${BRAND.blue}; color: #fff; font-size: 20px; }
.pc-av-me { background: ${BRAND.navy}; color: #fff; }
.pc-col { max-width: calc(100% - 64px); display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.pc-row.me .pc-col { align-items: flex-end; }
.pc-nm { font-size: 11.5px; font-weight: 800; }
.pc-nm b { font-size: 10.5px; padding: 1px 7px; border-radius: 5px; }
.pc-tag-ai { background: ${BRAND.navy}; color: ${BRAND.yellow}; }
.pc-tag-desk { background: ${BRAND.blue}; color: #fff; }
.pc-bub { font-size: 15px; line-height: 1.55; padding: 9px 13px; border-radius: 14px; white-space: pre-wrap; overflow-wrap: anywhere;
  background: #fff; border: 2.5px solid ${BRAND.blue}; color: ${BRAND.ink}; box-shadow: 0 2px 0 #9fb8e6; }
.pc-bub.mine { background: #fff4dc; border-color: ${BRAND.amber}; color: #4a3000; box-shadow: 0 2px 0 #f3c97a; }
.pc-bub.ph { padding: 4px; }
.pc-photo { display: block; position: relative; padding: 0; border: 0; background: none; cursor: zoom-in; }
.pc-photo img { display: block; max-width: 220px; max-height: 280px; border-radius: 10px; }
.pc-photo-wait { position: absolute; inset: auto 6px 6px auto; font-size: 11px; font-weight: 800; color: #fff; background: rgba(0,0,0,.55); padding: 2px 8px; border-radius: 8px; }
.pc-acts { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 9px; }
.pc-acts button, .pc-acts a { font: inherit; font-size: 13.5px; font-weight: 800; padding: 7px 12px; border-radius: 10px; cursor: pointer; text-decoration: none; min-height: 0; }
.pc-a1 { background: ${BRAND.amber}; color: ${BRAND.navy}; border: 2px solid #c97f00; }
.pc-a2 { background: #fff; color: ${BRAND.blue}; border: 2px solid #9fb8e6; }
.pc-acts button:disabled { opacity: .6; cursor: not-allowed; }
.pc-dots { display: flex; gap: 5px; align-items: center; padding: 13px 14px; }
.pc-dots span { width: 7px; height: 7px; border-radius: 50%; background: #8a97ad; animation: msaTypingBlink 1.2s infinite; }
.pc-err { font-size: 13px; color: #9b1c1c; background: #fdecec; border-top: 1px solid #f5c2c2; padding: 8px 14px; }
.pc-inp { display: flex; gap: 8px; align-items: center; padding: 10px 10px 12px; background: ${BRAND.navy}; }
.pc-inp input:not([type=file]) { flex: 1; min-width: 0; font: inherit; font-size: 16px; padding: 11px 13px; border-radius: 12px; border: 2px solid #3b64a8; background: #fff; color: ${BRAND.ink}; outline: none; }
.pc-cam { width: 46px; height: 46px; min-height: 0; flex-shrink: 0; border-radius: 12px; border: 2px solid #3b64a8; background: #fff; font-size: 20px; cursor: pointer; }
.pc-send { height: 46px; min-height: 0; flex-shrink: 0; padding: 0 18px; border-radius: 12px; border: 2px solid #c97f00; font: inherit; font-weight: 900; font-size: 16px;
  background: linear-gradient(180deg, #ffb733, ${BRAND.amber}); color: ${BRAND.navy}; cursor: pointer; }
.pc-send:disabled, .pc-cam:disabled { opacity: .55; cursor: not-allowed; }
.pc-cam:focus-visible, .pc-send:focus-visible, .pc-strip:focus-visible, .pc-acts button:focus-visible { outline: 2px solid ${BRAND.yellow}; outline-offset: 2px; }
.pc-view { position: fixed; inset: 0; z-index: 1100; background: rgba(5,12,26,.92); display: grid; place-items: center; padding: 16px; }
.pc-view img { max-width: 100%; max-height: 100%; border-radius: 8px; }
.pc-view button { position: absolute; top: 12px; right: 12px; width: 44px; height: 44px; border-radius: 50%; border: 0; background: rgba(255,255,255,.15); color: #fff; font-size: 20px; }
@keyframes msaTypingBlink { 0%, 80%, 100% { opacity: 0.25; transform: translateY(0); } 40% { opacity: 1; transform: translateY(-3px); } }
@media (prefers-reduced-motion: reduce) { .pc-dots span { animation: none; } }
`

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

/** Something the school told the family, shown as a strip across the app's
 *  chat (push_log via /api/app/inbox; owner, 2026-10-28). */
export type ChatEvent = { id: string; kind: string; title: string; body: string; url: string | null; created_at: string }
const EVENT_ICON: Record<string, string> = {
  report: '📝', stage_up: '🏅', level_up: '🏆',
  block_cancellation_notice: '⚠️', team_practice_cancelled: '⚠️',
  booking_confirmed: '📅', booking_series_confirmed: '📅', booking_rescheduled: '📅', booking_cancelled: '📅',
}
export const CHAT_EVENT_KINDS = new Set(Object.keys(EVENT_ICON))

/** A phone photo made small enough to send: at most 1600px on the long side,
 *  as JPEG. A picture the browser cannot draw goes as it is. */
async function shrinkPhoto(file: File): Promise<Blob> {
  try {
    const url = URL.createObjectURL(file)
    try {
      const img = await new Promise<HTMLImageElement>((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = url })
      const k = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight))
      const c = document.createElement('canvas')
      c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k)
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height)
      const blob = await new Promise<Blob | null>(ok => c.toBlob(ok, 'image/jpeg', 0.85))
      return blob || file
    } finally { URL.revokeObjectURL(url) }
  } catch { return file }
}

/* variant 'page' (owner, 2026-10-28): the phone app's 客服 tab
   (app/(public)/dashboard/chat) -- the same conversation, always open,
   filling the screen, drawn after a game's chat: framed pictures, time
   pills, the school's notices as strips across it, a photo button and a big
   send button. In the app the floating widget never opens; asking it to
   (openChat, ?chat=1) goes to that page instead. */
export default function ChatWidget({ parentId, lift = 0, variant = 'float', events = [], myName = '' }: {
  parentId: string | null; lift?: number; variant?: 'float' | 'page'; events?: ChatEvent[]; myName?: string
}) {
  const t = useT()
  const locale = useLocale()
  const router = useRouter()
  const page = variant === 'page'
  const guest = !parentId
  const [guestKey, setGuestKey] = useState<string | null>(null)
  const [limited, setLimited] = useState(false)
  const supabase = createClient()
  const [open, setOpen] = useState(page)
  // Auto-restore the open chat after navigating away (e.g. to payment) and back
  const restoring = useRef(false)
  useEffect(() => {
    if (page || appLook()) return
    try { if (sessionStorage.getItem('msa_chat_open') === '1') { restoring.current = true; setOpen(true) } } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => {
    if (!page) try { sessionStorage.setItem('msa_chat_open', open ? '1' : '0') } catch {}
    // Told to the page (lib/chat-open), so the dashboard holds its low-balance
    // notice while the panel is open (found 2026-10-15). Not the "closed" of
    // the first pass of a restore: the panel is about to open.
    if (!open && restoring.current) return
    restoring.current = false
    reportChatOpen(open)
  }, [open])
  useEffect(() => () => reportChatOpen(false), [])
  const [threadId, setThreadId] = useState<string | null>(null)
  const [messages, setMessages] = useState<any[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  // The i18n key of the "not sent" line, or null (the guest chat has its own).
  const [sendFailed, setSendFailed] = useState<string | null>(null)
  const [unread, setUnread] = useState(0)
  // Told to the app's 訊息 tab too (lib/chat-open).
  useEffect(() => { reportChatUnread(unread) }, [unread])
  // The realtime callback below is created once per thread, and the thread is
  // now found on page load with the panel shut, so it reads `open` from this
  // ref rather than the value it was created with (found 2026-10-05).
  const openRef = useRef(open)
  useEffect(() => { openRef.current = open }, [open])
  /* Whether this browser tab is the one on screen (2026-10-12). The panel
     stays open in a tab the family has switched away from, and a desk reply
     arriving there was marked read at once: no dot, and the reply email
     (app/api/cron/chat-reply-email) never went out. A message counts as seen
     only with the panel open AND the tab visible. */
  const [visible, setVisible] = useState(true)
  const visibleRef = useRef(true)
  useEffect(() => {
    const sync = () => {
      const v = document.visibilityState === 'visible'
      visibleRef.current = v
      setVisible(v)
    }
    sync()
    document.addEventListener('visibilitychange', sync)
    return () => document.removeEventListener('visibilitychange', sync)
  }, [])
  const [awaitingAi, setAwaitingAi] = useState(false)
  /* Who answers this thread now: the AI, or the desk after it has taken over
     (chat_threads.mode, set by Admin > Messages). The header used to say "AI
     assistant" all the time, so a family whose message went to the desk --
     and got no AI reply, by design -- read the silence as being ignored
     (found 2026-10-08). Kept current from what arrives in the chat: a desk
     reply means the desk has it, the desk's hand-back notice means the AI is
     back, and a message the AI skipped means the desk has it. */
  const [mode, setMode] = useState<'ai' | 'human'>('ai')
  /* A visitor asking for a person (owner, 2026-10-22, tier 3): a short form
     for a name and an email (phone optional). The desk is alerted and its
     replies are emailed to them (/api/chat/guest/contact). */
  const [contactOpen, setContactOpen] = useState(false)
  const [contact, setContact] = useState({ name: '', email: '', phone: '', text: '' })
  const [contactBusy, setContactBusy] = useState(false)
  const [contactErr, setContactErr] = useState<string | null>(null)
  async function sendContact() {
    setContactBusy(true); setContactErr(null)
    try {
      const r = await fetch('/api/chat/guest/contact', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: guestKey, ...contact, locale }),
      })
      const d = await r.json().catch(() => ({})) as { code?: string; key?: string; messages?: unknown[] }
      if (r.status === 429) { setContactErr('chat.contact.err.limited'); return }
      if (!r.ok) { setContactErr(d.code === 'bad_email' ? 'chat.contact.err.email' : d.code === 'missing' ? 'chat.contact.err.missing' : 'chat.contact.err.generic'); return }
      if (d.key) { setGuestKey(d.key); try { localStorage.setItem(GUEST_KEY, d.key) } catch {} }
      if (Array.isArray(d.messages)) setMessages(d.messages)
      setContactOpen(false)
      setContact({ name: '', email: '', phone: '', text: '' })
    } catch { setContactErr('chat.contact.err.generic') } finally { setContactBusy(false) }
  }
  // A desk reply email links back with ?chat=1: open the chat on arrival.
  useEffect(() => {
    if (!guest) return
    let wanted = false
    try { wanted = new URLSearchParams(window.location.search).get('chat') === '1' } catch {}
    if (!wanted) return
    const timer = setTimeout(() => setOpen(true), 0)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    // In the app the chat is a page of its own: go there, and leave the
    // request (and its text) for the page to take when it mounts.
    const toPage = () => !page && appLook()
    const onOpen = (e: Event) => {
      if (toPage()) { router.push('/dashboard/chat'); return }
      takePendingChatOpen()
      focusOnOpenRef.current = true
      setOpen(true)
      const text = (e as CustomEvent).detail?.text
      if (text) setInput(text)
    }
    window.addEventListener(CHAT_OPEN_EVENT, onOpen)
    // A request made before this widget was mounted (lib/chat-open), handled
    // just after mount like an event would be.
    const timer = setTimeout(() => {
      if (toPage()) return
      const pending = takePendingChatOpen()
      if (!pending) return
      focusOnOpenRef.current = true
      setOpen(true)
      if (pending.text) setInput(pending.text)
    }, 0)
    return () => { clearTimeout(timer); window.removeEventListener(CHAT_OPEN_EVENT, onOpen) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const awaitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isMobile = useIsMobile()

  /* Keyboard and screen-reader use (found 2026-10-15). The launcher unmounts
     when the panel opens and the panel is last in the page, so focus fell to
     the body and a keyboard parent had to Tab through the whole page to reach
     the box; closing did the same in reverse. Opening by hand (the button, or
     a page's openChat()) now moves focus in -- to the box on a computer, to
     the panel itself on a phone, where focusing the box would throw the
     keyboard up over the conversation. The panel reopened by itself after a
     page change takes nothing. Closing with focus inside hands it back to the
     launcher. */
  const panelRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const launcherRef = useRef<HTMLButtonElement>(null)
  const focusOnOpenRef = useRef(false)
  const focusLauncherRef = useRef(false)
  useEffect(() => {
    if (open && focusOnOpenRef.current) {
      focusOnOpenRef.current = false
      // The page: never the box, which would throw the keyboard up.
      ;(isMobile || page ? panelRef.current : inputRef.current)?.focus()
    } else if (!open && focusLauncherRef.current) {
      focusLauncherRef.current = false
      launcherRef.current?.focus()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])
  function openPanel() {
    focusOnOpenRef.current = true
    setOpen(true)
  }
  function closePanel() {
    const a = document.activeElement
    focusLauncherRef.current = !!panelRef.current && (!a || a === document.body || panelRef.current.contains(a))
    setOpen(false)
  }

  /* Replies are read out. The list itself is not a live region: opening the
     panel loads the whole history into it, and every old message would be
     read. Instead the newest message from the school (the AI or the desk)
     that was not already on screen is written into a hidden polite region.
     What a history load brings is marked as heard first (loadMessages and
     the guest's first load), and so is anything that arrives while the panel
     is shut -- the launcher's unread count covers that. Written straight to
     the node so no extra render is needed. */
  const heardRef = useRef<Set<string>>(new Set())
  const liveRef = useRef<HTMLDivElement>(null)
  const spokenRef = useRef<string | null>(null)
  useEffect(() => {
    // The desk recalled the reply last read out (owner, 2026-10-23): its text
    // leaves the hidden region too, so no trace of it stays on the page.
    if (spokenRef.current && liveRef.current && !messages.some(m => m.id === spokenRef.current)) {
      liveRef.current.textContent = ''
      spokenRef.current = null
    }
    const school = messages.filter(m => (m.sender_type === 'ai' || m.sender_type === 'admin') && m.id && !heardRef.current.has(m.id))
    if (!school.length) return
    school.forEach(m => heardRef.current.add(m.id))
    const m = school[school.length - 1]
    if (open && liveRef.current) {
      liveRef.current.textContent = `${t(m.sender_type === 'ai' ? 'chat.fromAi' : 'chat.fromDesk')}: ${m.body}`
      spokenRef.current = m.id
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, open])

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
  // The dot: what the school has written since the family last read.
  // Before the migration there is no read mark to count from: no dot.
  async function countUnread(th: { id: string; lastRead: string | null; readKnown: boolean }, alive: () => boolean = () => true) {
    if (!th.readKnown) return
    let q = supabase.from('chat_messages').select('id', { count: 'exact', head: true })
      .eq('thread_id', th.id).in('sender_type', ['admin', 'ai'])
    if (th.lastRead) q = q.gt('created_at', th.lastRead)
    const { count, error } = await q
    if (alive() && !error && !(openRef.current && visibleRef.current)) setUnread(count || 0)
  }
  async function recountUnread() {
    const th = await findThread()
    if (th) await countUnread(th)
  }

  useEffect(() => {
    if (guest) return
    let alive = true
    ;(async () => {
      const th = await findThread()
      if (!alive || !th) return
      setThreadId(prev => prev ?? th.id)
      setMode(th.mode)
      await countUnread(th, () => alive)
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
        if (from === 'admin') setMode('human')
        else if (from === 'system') setMode('ai')
        if (!(openRef.current && visibleRef.current) && (from === 'admin' || from === 'ai')) setUnread(u => u + 1)
      })
      // The desk recalled a reply (owner, 2026-10-23; /api/admin/chat-recall):
      // it leaves the screen without a trace. Read back from the database the
      // row is already hidden from this family.
      .on('broadcast', { event: 'recall' }, ({ payload }) => {
        const id = (payload as { id?: string } | null)?.id
        if (!id) return
        setMessages(prev => prev.filter(m => m.id !== id))
        // It may have been counted in the dot: count again.
        if (!(openRef.current && visibleRef.current)) recountUnread()
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
     is open and the tab is visible -- coming back to the tab re-runs this.
     Its own created_at, not this device's clock, so a phone whose clock is
     off cannot mark a later reply read (or an earlier one unread). Ignored
     before the migration (the column is not there yet). */
  const markedRef = useRef<string | null>(null)
  useEffect(() => {
    if (!open || !visible || !threadId || guest) return
    const newest = messages.reduce<string | null>((a, m) => (!m._local && m.created_at && (!a || m.created_at > a) ? m.created_at : a), null)
    if (!newest || (markedRef.current && newest <= markedRef.current)) return
    markedRef.current = newest
    // Through the server, like every write this widget makes to the chat
    // tables (audit F39, 2026-10-15; see app/api/chat/send).
    threadAction({ action: 'read', thread_id: threadId, at: newest })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, visible, threadId, messages])

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
    if (open && visible) setUnread(0)
  }, [open, visible])

  async function initThread() {
    if (guest) {
      const k = readGuestKey()
      setGuestKey(k)
      if (k) await loadGuest(k, true)
      return
    }
    // Normally already done by GlobalChat at sign-in; harmless if not.
    await claimGuestChat()
    if (threadId) return
    const data = await findThread()
    if (data) {
      setThreadId(data.id)
      setMode(data.mode)
    } else {
      // Made by the server (app/api/chat/thread), which also settles two tabs
      // opening the chat at once on one thread.
      const made = await threadAction({ action: 'open' })
      if (made?.id) {
        setThreadId(made.id)
        setMode(made.mode === 'human' ? 'human' : 'ai')
      }
    }
  }

  /** A write to the family's own thread row (app/api/chat/thread). null on any failure. */
  async function threadAction(payload: Record<string, unknown>): Promise<{ id?: string; mode?: string } | null> {
    try {
      const r = await fetch('/api/chat/thread', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      return r.ok ? await r.json().catch(() => null) : null
    } catch { return null }
  }

  /** The family's thread (the oldest, as the payment notices pick it), and
   *  when they last had it open. readKnown is false before
   *  docs/migration-fix5-A.sql has added that column. */
  async function findThread(): Promise<{ id: string; lastRead: string | null; readKnown: boolean; mode: 'ai' | 'human' } | null> {
    const modeOf = (r: any): 'ai' | 'human' => (r?.mode === 'human' ? 'human' : 'ai')
    const withRead = await supabase.from('chat_threads').select('id, mode, parent_last_read_at')
      .eq('parent_id', parentId).order('created_at', { ascending: true }).limit(1).maybeSingle()
    if (!withRead.error) return withRead.data ? { id: withRead.data.id, lastRead: (withRead.data as any).parent_last_read_at ?? null, readKnown: true, mode: modeOf(withRead.data) } : null
    const plain = await supabase.from('chat_threads').select('id, mode')
      .eq('parent_id', parentId).order('created_at', { ascending: true }).limit(1).maybeSingle()
    return plain.data ? { id: plain.data.id, lastRead: null, readKnown: false, mode: modeOf(plain.data) } : null
  }

  async function loadGuest(k: string, initial = false) {
    try {
      const r = await fetch('/api/chat/guest?key=' + encodeURIComponent(k))
      const d = await r.json()
      if (d.gone) { try { localStorage.removeItem(GUEST_KEY) } catch {}; setGuestKey(null); setMessages([]); return }
      // The history on opening is not read out; a reply the 15-second poll
      // picks up later is (see heardRef).
      if (initial && Array.isArray(d.messages)) d.messages.forEach((m: { id?: string } | null) => { if (m?.id) heardRef.current.add(m.id) })
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

  // typed: the text came from the box (not a quick-reply button), so a send
  // that fails puts it back there.
  async function sendGuest(body: string, typed: boolean) {
    const now = new Date().toISOString()
    setMessages(prev => [...prev, { id: 'local-' + now, _local: true, sender_type: 'parent', body, created_at: now }])
    setAwaitingAi(true)
    // Not sent: the bubble goes, the text goes back in the box, and a line
    // says so. Any status but the two handled ones used to leave the bubble
    // looking delivered, with no reply ever coming and the text gone from the
    // box -- a 503 when the rate counter or the new thread could not be
    // written, or a crash or timeout (found 2026-10-15).
    const notSent = (key: string) => {
      setMessages(prev => prev.filter(m => !m._local))
      if (typed) setInput(prev => prev ? prev : body)
      setSendFailed(key)
    }
    try {
      const r = await fetch('/api/chat/guest', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: guestKey, text: body, locale }),
      })
      const d = await r.json().catch(() => ({} as any))
      if (r.status === 429) { setLimited(true); setMessages(prev => prev.filter(m => !m._local)); return }
      // The conversation went to an account (signed in elsewhere): forget
      // it, and the next send starts a new one.
      if (r.status === 409) { try { localStorage.removeItem(GUEST_KEY) } catch {}; setGuestKey(null); notSent('chat.guest.sendFailed'); return }
      if (!r.ok) { notSent('chat.guest.sendFailed'); return }
      if (d.key) { setGuestKey(d.key); try { localStorage.setItem(GUEST_KEY, d.key) } catch {} }
      if (Array.isArray(d.messages)) setMessages(d.messages)
    } catch {
      notSent('chat.sendFailed')
    } finally {
      setAwaitingAi(false)
    }
  }

  // The newest HISTORY_LIMIT messages, shown oldest first (found 2026-10-08).
  // A family has one thread for life; read oldest-first with no limit, the
  // 1,000-row cap cut off the NEWEST messages once a thread grew past it, so
  // the desk's latest reply was not on screen.
  async function loadMessages() {
    const [{ data }, { data: th }] = await Promise.all([
      supabase
        .from('chat_messages')
        .select('*')
        .eq('thread_id', threadId)
        .order('created_at', { ascending: false })
        .limit(HISTORY_LIMIT),
      // Opening the panel also re-reads who answers now: the desk can take
      // over (or hand back) while the panel was shut.
      supabase.from('chat_threads').select('mode').eq('id', threadId).maybeSingle(),
    ])
    // The history is on screen, not news: not read out (see heardRef).
    ;(data || []).forEach((m: { id?: string } | null) => { if (m?.id) heardRef.current.add(m.id) })
    setMessages((data || []).reverse())
    if (th) setMode((th as any).mode === 'human' ? 'human' : 'ai')
  }

  async function sendMessage(text?: string) {
    const body = (text ?? input).trim()
    if (guest) {
      if (!body || sending || limited) return
      setSending(true)
      setSendFailed(null)
      if (!text) setInput('')
      await sendGuest(body, !text)
      setSending(false)
      return
    }
    if (!body || !threadId || sending) return
    setSending(true)
    setSendFailed(null)
    if (!text) setInput('')
    // Checked (found 2026-10-15), as the desk's send has been since
    // 2026-10-08: supabase-js returns a refused or dropped insert as { error }
    // rather than throwing, so a flaky connection or an expired session lost
    // the typed message with no word -- while the thread preview showed it and
    // ai-reply ran against an older message. Now the text goes back in the box,
    // a line says it was not sent, and nothing else moves.
    // Written by the server since 2026-10-15 (audit F39): from the browser the
    // family could write any sender_type, and any field of the thread row.
    let sent: { id: string } | null = null
    try {
      const r = await fetch('/api/chat/send', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ thread_id: threadId, body }),
      })
      if (r.ok) sent = (await r.json().catch(() => null))?.message ?? null
    } catch {}
    if (!sent) {
      if (!text) setInput(prev => prev ? prev : body)
      setSendFailed('chat.sendFailed')
      setSending(false)
      return
    }
    // Shown at once; the realtime INSERT that follows is the same id.
    const row = sent
    setMessages(prev => prev.some(m => m.id === row.id) ? prev : [...prev, row])
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
        // Human service mode: AI stays silent, hide typing animation. The
        // desk's unread flag is set by ai-reply itself now.
        if (d.skipped === 'human_mode') setMode('human')
        setAwaitingAi(false)
        if (awaitTimerRef.current) { clearTimeout(awaitTimerRef.current); awaitTimerRef.current = null }
      }
    } catch {
      setAwaitingAi(false)
      if (awaitTimerRef.current) { clearTimeout(awaitTimerRef.current); awaitTimerRef.current = null }
      // ai-reply never answered: the desk is told (app/api/chat/thread).
      await threadAction({ action: 'flag', thread_id: threadId })
    }
  }

  /* A photo for the desk (app/api/chat/photo; owner, 2026-10-28). Shown at
     once from the phone itself, then replaced by the stored one. */
  const fileRef = useRef<HTMLInputElement>(null)
  const [photoBusy, setPhotoBusy] = useState(false)
  const [viewPhoto, setViewPhoto] = useState<string | null>(null)
  async function sendPhoto(file: File) {
    if (!threadId || guest || photoBusy) return
    setPhotoBusy(true); setSendFailed(null)
    const local = URL.createObjectURL(file)
    const tmpId = 'local-photo-' + Date.now()
    setMessages(prev => [...prev, { id: tmpId, _local: true, _src: local, sender_type: 'parent', body: '📷', metadata: { photo: 'local' }, created_at: new Date().toISOString() }])
    let code = ''
    try {
      const fd = new FormData()
      fd.append('thread_id', threadId)
      fd.append('locale', locale)
      fd.append('file', await shrinkPhoto(file), 'photo.jpg')
      const r = await fetch('/api/chat/photo', { method: 'POST', body: fd })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { code = d.code || 'failed'; throw new Error(code) }
      setMessages(prev => {
        const rest = prev.filter(m => m.id !== tmpId)
        const add = [d.message, d.ack].filter(Boolean).filter((x: any) => !rest.some(m => m.id === x.id))
        return [...rest, ...add]
      })
    } catch {
      setMessages(prev => prev.filter(m => m.id !== tmpId))
      setSendFailed(code === 'too_large' ? 'chat.photo.tooLarge' : code === 'limited' ? 'chat.photo.limited' : code === 'not_image' ? 'chat.photo.notImage' : 'chat.photo.failed')
    } finally {
      setPhotoBusy(false)
      setTimeout(() => URL.revokeObjectURL(local), 60000)
    }
  }
  const photoSrc = (m: any) => m._src || `/api/chat/photo?id=${m.id}`

  /* The app's 客服 tab (variant 'page'). The school's notices sit in the
     conversation by time, as strips across it; a time pill marks a new day
     or a gap of 15 minutes. */
  function renderPage() {
    type Item = { k: 'm'; at: string; m: any } | { k: 'e'; at: string; e: ChatEvent }
    const items: Item[] = [
      ...messages.map(m => ({ k: 'm' as const, at: String(m.created_at || ''), m })),
      ...events.filter(e => CHAT_EVENT_KINDS.has(e.kind)).map(e => ({ k: 'e' as const, at: e.created_at, e })),
    ].sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0))
    const dayOf = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' })
    const clock = (iso: string) => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Los_Angeles' })
    const dateLine = (iso: string) => new Date(iso).toLocaleDateString(locale === 'en' ? 'en-US' : locale, { month: 'short', day: 'numeric', weekday: 'short', timeZone: 'America/Los_Angeles' })
    const lastAi = [...messages].reverse().find(m => m.sender_type !== 'system')
    const me = (myName || '').trim().charAt(0).toUpperCase() || '🙂'
    const avatar = (who: string) => who === 'ai'
      // eslint-disable-next-line @next/next/no-img-element
      ? <span className="pc-av pc-av-ai" aria-hidden="true"><img src="/mascot.png" alt="" /><i>AI</i></span>
      : who === 'admin'
        ? <span className="pc-av pc-av-desk" aria-hidden="true">🎧<i>{t('chat.deskBadge')}</i></span>
        : <span className="pc-av pc-av-me" aria-hidden="true">{me}</span>
    return (
      <div className="pc" ref={panelRef} tabIndex={-1}>
        <style>{PAGE_CSS}</style>
        <div ref={liveRef} className="sr-only" aria-live="polite" aria-atomic="true" />
        <div className="pc-mode">{mode === 'human' ? t('chat.subtitleHuman') : t('chat.subtitle')}</div>
        <div className="pc-feed" ref={listRef}>
          {items.length === 0 && (
            <div className="pc-empty"><span aria-hidden="true">👋</span>{t('chat.empty')}</div>
          )}
          {items.map((it, i) => {
            const prev = items[i - 1]
            const pill = !prev || dayOf(prev.at) !== dayOf(it.at) || Date.parse(it.at) - Date.parse(prev.at) > 15 * 60000
            const pillText = !prev || dayOf(prev.at) !== dayOf(it.at) ? `${dateLine(it.at)} ${clock(it.at)}` : clock(it.at)
            const key = it.k === 'm' ? it.m.id : 'e-' + it.e.id
            if (it.k === 'e') {
              const e = it.e
              const inner = <><span aria-hidden="true">{EVENT_ICON[e.kind] || '🔔'}</span> <b>{e.title}</b>{e.url && <u> {t('chat.event.open')} ›</u>}</>
              return (
                <Fragment key={key}>
                  {pill && <div className="pc-pill">{pillText}</div>}
                  {e.url ? <Link href={e.url} className="pc-strip">{inner}</Link> : <div className="pc-strip">{inner}</div>}
                </Fragment>
              )
            }
            const m = it.m
            if (m.sender_type === 'system') return (
              <Fragment key={key}>
                {pill && <div className="pc-pill">{pillText}</div>}
                <div className="pc-note">{m.metadata?.key === CHAT_HANDBACK_AUTO_KEY ? t('chat.handbackAuto') : m.metadata?.key === CHAT_HANDBACK_KEY || m.body === CHAT_HANDBACK_EN ? t('chat.handback') : m.body}</div>
              </Fragment>
            )
            const mine = m.sender_type === 'parent'
            const body = m.metadata?.photo ? (
              <button type="button" className="pc-photo tap-auto" onClick={() => setViewPhoto(photoSrc(m))} aria-label={t('chat.photo.open')}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {/* A picture arriving makes the list taller: keep the newest in view. */}
                <img src={photoSrc(m)} alt={t('chat.photo.alt')} onLoad={() => {
                  const el = listRef.current
                  if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 400) el.scrollTop = el.scrollHeight
                }} />
                {m._local && <span className="pc-photo-wait">{t('chat.photo.sending')}</span>}
              </button>
            ) : renderBody(m.body, t('chat.openLink'))
            return (
              <Fragment key={key}>
                {pill && <div className="pc-pill">{pillText}</div>}
                <div className={'pc-row' + (mine ? ' me' : '')}>
                  {!mine && avatar(m.sender_type)}
                  <div className="pc-col">
                    {!mine && <div className="pc-nm"><b className={m.sender_type === 'ai' ? 'pc-tag-ai' : 'pc-tag-desk'}>{t(m.sender_type === 'ai' ? 'chat.fromAi' : 'chat.fromDesk')}</b></div>}
                    <div className={'pc-bub' + (mine ? ' mine' : '') + (m.metadata?.photo ? ' ph' : '')}>
                      {body}
                      {m.sender_type === 'ai' && m.id === lastAi?.id && Array.isArray(m.metadata?.options) && (
                        <div className="pc-acts">
                          {m.metadata.options.map((opt: any, j: number) =>
                            opt.type === 'link' ? <a key={j} href={opt.url} className="pc-a1">{opt.label}</a>
                              : <button key={j} type="button" className={'tap-auto ' + (j === 0 ? 'pc-a1' : 'pc-a2')} disabled={sending} onClick={() => sendMessage(opt.label)}>{opt.label}</button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                  {mine && avatar('parent')}
                </div>
              </Fragment>
            )
          })}
          {awaitingAi && (
            <div className="pc-row">
              {avatar('ai')}
              <div className="pc-col"><div className="pc-bub pc-dots" aria-label={t('chat.typing')}>
                {[0, 1, 2].map(i => <span key={i} style={{ animationDelay: `${i * 0.2}s` }} />)}
              </div></div>
            </div>
          )}
        </div>
        {sendFailed && <div role="alert" className="pc-err">{t(sendFailed)}</div>}
        <div className="pc-inp">
          <input ref={inputRef} className="kb-focus" aria-label={t('chat.placeholder')} placeholder={t('chat.placeholder')}
            value={input} maxLength={800} onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key !== 'Enter' || e.shiftKey) return
              if (e.nativeEvent.isComposing || e.keyCode === 229) return
              sendMessage()
            }} />
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) sendPhoto(f) }} />
          <button type="button" className="pc-cam tap-auto" onClick={() => fileRef.current?.click()} disabled={photoBusy || !threadId} aria-label={t('chat.photo.send')}>📷</button>
          <button type="button" className="pc-send tap-auto" onClick={() => sendMessage()} disabled={!input.trim() || sending}>{t('chat.sendShort')}</button>
        </div>
        {viewPhoto && (
          <div className="pc-view" role="dialog" aria-modal="true" aria-label={t('chat.photo.alt')} onClick={() => setViewPhoto(null)}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={viewPhoto} alt={t('chat.photo.alt')} />
            <button type="button" className="tap-auto" onClick={() => setViewPhoto(null)} aria-label={t('common.close')}>✕</button>
          </div>
        )}
      </div>
    )
  }

  if (page) return renderPage()

  const windowStyle: React.CSSProperties = isMobile ? {
    position: 'fixed', inset: 0, zIndex: 1000,
    display: 'flex', flexDirection: 'column',
    background: PAPER, fontFamily: FONT_BODY,
    // Focused in code on opening (a phone); the dialog itself needs no ring.
    outline: 'none',
  } : {
    position: 'fixed', bottom: '80px', right: '20px', zIndex: 1000,
    width: '360px', height: '500px',
    borderRadius: '16px', overflow: 'hidden',
    display: 'flex', flexDirection: 'column',
    background: PAPER, border: '1px solid #d3deec', fontFamily: FONT_BODY,
    boxShadow: '0 20px 60px rgba(14,29,59,0.28)',
    outline: 'none',
  }

  return (
    <>
      <style>{`
        @keyframes msaTypingBlink { 0%, 80%, 100% { opacity: 0.25; transform: translateY(0); } 40% { opacity: 1; transform: translateY(-3px); } }
      `}</style>
      {/* FAB Button */}
      {!open && (
        <button ref={launcherRef} data-chat-toggle onClick={openPanel} style={{
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
        <div ref={panelRef} style={windowStyle} tabIndex={-1}
          role="dialog" aria-label={t('chat.title')} aria-modal={isMobile || undefined}
          onKeyDown={e => {
            // Escape closes it, full screen on a phone included; not while an
            // IME is composing, where Escape only drops the candidate (keyCode 229:
            // Safari reports isComposing late, as with Enter below).
            if (e.key !== 'Escape' || e.nativeEvent.isComposing || e.keyCode === 229) return
            e.stopPropagation()
            closePanel()
          }}>
          <div ref={liveRef} className="sr-only" aria-live="polite" aria-atomic="true" />
          {/* Header */}
          <div style={{ background: NAVY, padding: '16px 20px', display: 'flex', alignItems: 'center', gap: '12px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
            <img src="/logo.png" alt="Manta Shark Aquatics" width={36} height={36}
              style={{ display: 'block', borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 800, color: '#fff', fontSize: '16px' }}>{t('chat.title')}</div>
              <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.7)' }}>{!guest && mode === 'human' ? t('chat.subtitleHuman') : t('chat.subtitle')}</div>
            </div>
            <button onClick={closePanel} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.75)', fontSize: '20px', cursor: 'pointer', padding: '4px' }} aria-label={t('common.close')}>✕</button>
          </div>

          {/* Signed out: what an account adds, and the way to get one. */}
          {guest && (
            <div style={{ background: '#fff7e6', borderBottom: '1px solid #f3dfb4', padding: '9px 16px', fontSize: '12.5px', color: BRAND.ink, lineHeight: 1.5 }}>
              {t('chat.guest.banner')}{' '}
              <Link href="/register" onClick={() => setOpen(false)} style={{ color: BLUE, fontWeight: 800 }}>{t('chat.guest.signUp')}</Link>
              {' · '}
              <Link href="/login" onClick={() => setOpen(false)} style={{ color: BLUE, fontWeight: 700 }}>{t('chat.guest.signIn')}</Link>
              {' · '}
              <button type="button" className="tap-auto" onClick={() => { setContactErr(null); setContactOpen(true) }}
                style={{ background: 'none', border: 'none', padding: 0, color: BLUE, fontWeight: 700, fontSize: 'inherit', cursor: 'pointer', textDecoration: 'underline' }}>
                {t('chat.contact.open')}
              </button>
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
                {msg.metadata?.key === CHAT_HANDBACK_AUTO_KEY ? t('chat.handbackAuto') : msg.metadata?.key === CHAT_HANDBACK_KEY || msg.body === CHAT_HANDBACK_EN ? t('chat.handback') : msg.body}
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
                  {msg.metadata?.photo ? (
                    <a href={photoSrc(msg)} target="_blank" rel="noreferrer" style={{ display: 'block' }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={photoSrc(msg)} alt={t('chat.photo.alt')} style={{ display: 'block', maxWidth: '100%', maxHeight: '280px', borderRadius: '10px' }} />
                    </a>
                  ) : renderBody(msg.body, t('chat.openLink'))}
                  {msg.sender_type === 'ai' && msg.id === messages[messages.length - 1]?.id && Array.isArray(msg.metadata?.options) && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '8px' }}>
                      {msg.metadata.options.map((opt: any, i: number) =>
                        opt.type === 'contact' ? (
                          <button key={i} onClick={() => { setContactErr(null); setContactOpen(true) }} style={{ background: AMBER, color: NAVY, border: 'none', borderRadius: '8px', padding: '7px 12px', fontSize: '13px', fontWeight: 800, cursor: 'pointer' }}>{opt.label}</button>
                        ) : opt.type === 'link' ? (
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

          {/* Not sent: right above the box the text went back into, so it is
              seen without scrolling the conversation. */}
          {sendFailed && (
            <div role="alert" style={{ fontSize: '12.5px', color: '#9b1c1c', background: '#fdecec', borderTop: '1px solid #f5c2c2', padding: '8px 16px' }}>
              {t(sendFailed)}
            </div>
          )}
          {guest && contactOpen && (
            <div style={{ padding: '12px 16px', borderTop: '1px solid #e3ebf6', background: '#f8fafd', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ fontSize: '13.5px', fontWeight: 800, color: NAVY }}>{t('chat.contact.title')}</div>
              <div style={{ fontSize: '12.5px', color: '#56647d', lineHeight: 1.5 }}>{t('chat.contact.desc')}</div>
              {(['name', 'email', 'phone'] as const).map(f => (
                <input key={f} className="kb-focus" aria-label={t('chat.contact.' + f)} placeholder={t('chat.contact.' + f)}
                  type={f === 'email' ? 'email' : f === 'phone' ? 'tel' : 'text'} autoComplete={f === 'name' ? 'name' : f === 'email' ? 'email' : 'tel'}
                  value={contact[f]} maxLength={f === 'name' ? 80 : 120} onChange={e => setContact(c => ({ ...c, [f]: e.target.value }))}
                  style={{ border: '1px solid #d5e0ef', borderRadius: '8px', padding: '8px 12px', fontSize: '16px', color: BRAND.ink, outline: 'none', fontFamily: 'inherit' }} />
              ))}
              <textarea className="kb-focus" aria-label={t('chat.contact.text')} placeholder={t('chat.contact.text')} rows={2} maxLength={800}
                value={contact.text} onChange={e => setContact(c => ({ ...c, text: e.target.value }))}
                style={{ border: '1px solid #d5e0ef', borderRadius: '8px', padding: '8px 12px', fontSize: '16px', color: BRAND.ink, outline: 'none', fontFamily: 'inherit', resize: 'vertical' }} />
              {contactErr && <div role="alert" style={{ fontSize: '12.5px', color: '#9b1c1c' }}>{t(contactErr)}</div>}
              <div style={{ display: 'flex', gap: '8px' }}>
                <button type="button" onClick={() => setContactOpen(false)} disabled={contactBusy}
                  style={{ flex: 1, background: '#fff', border: '1px solid #d5e0ef', borderRadius: '8px', padding: '9px', fontWeight: 700, color: NAVY, cursor: 'pointer' }}>{t('common.cancel')}</button>
                <button type="button" onClick={sendContact} disabled={contactBusy || !contact.name.trim() || !contact.email.trim()}
                  style={{ flex: 1, background: AMBER, border: 'none', borderRadius: '8px', padding: '9px', fontWeight: 800, color: NAVY, cursor: contactBusy ? 'wait' : 'pointer', opacity: !contact.name.trim() || !contact.email.trim() ? 0.6 : 1 }}>
                  {contactBusy ? t('chat.contact.sending') : t('chat.contact.send')}
                </button>
              </div>
            </div>
          )}
          {/* Input */}
          <div style={{ padding: '12px 16px', borderTop: '1px solid #e3ebf6', display: contactOpen && guest ? 'none' : 'flex', gap: '8px', background: '#fff' }}>
            <input
              ref={inputRef}
              className="kb-focus"
              aria-label={t('chat.placeholder')}
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
                borderRadius: '10px', padding: '10px 14px', color: BRAND.ink, fontSize: '16px',
                // No ring of its own; .kb-focus draws one (found 2026-10-15:
                // the box had no visible focus at all).
                outline: 'none', fontFamily: 'inherit',
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
