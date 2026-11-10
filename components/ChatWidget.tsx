'use client'
import { Fragment, useState, useEffect, useLayoutEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useIsMobile } from '@/lib/use-is-mobile'
import { useT, useLocale } from '@/lib/i18n/provider'
import Link from 'next/link'
import { useTabPanel } from '@/lib/tab-panel'
import { CHAT_OPEN_EVENT, CHAT_HANDBACK_EN, CHAT_HANDBACK_KEY, CHAT_HANDBACK_AUTO_KEY, ACCOUNT_CHANGED_EVENT, takePendingChatOpen, reportChatOpen, reportChatUnread } from '@/lib/chat-open'
import { BRAND, FONT_BODY, FONT_DISPLAY } from '@/lib/brand'
import { useRouter } from 'next/navigation'
import { appLook, photoPickerPlugin } from '@/lib/native-app'
import { fmtDate } from '@/lib/fmt-date'
import Icon from '@/components/ui/Icon'

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
/* The app's chat page (owner, 2026-10-28). First drawn after a game's chat;
   the owner found that too much like a game the same day and chose the quiet
   school-colour version: light page, white bubbles, the family's own in navy,
   small round pictures, the school's notices as small cards. */
const PAGE_CSS = `
.pc { flex: 1; min-height: 0; display: flex; flex-direction: column; outline: none; font-family: ${FONT_BODY}; background: ${BRAND.paper}; }
.pc-mode { text-align: center; font-size: 12px; color: ${BRAND.mute}; padding: 6px 12px 7px; border-bottom: 1px solid #dfe7f2; }
.pc-feed { flex: 1; min-height: 0; overflow-y: auto; padding: 8px 12px 14px; display: flex; flex-direction: column; gap: 8px; }
.pc-empty { margin: 40px auto 0; text-align: center; color: ${BRAND.mute}; font-size: 15px; display: flex; flex-direction: column; gap: 8px; }
.pc-empty span { font-size: 32px; }
.pc-pill { align-self: center; font-size: 11.5px; font-weight: 600; color: #5f6b80; padding: 6px 0 0; }
.pc-note { align-self: center; max-width: 90%; text-align: center; font-size: 12px; color: ${BRAND.mute}; }
.pc-strip { display: flex; align-items: center; gap: 10px; margin: 2px 4px; padding: 10px 12px; border-radius: 10px; text-decoration: none;
  background: #fff; border: 1px solid ${BRAND.line}; border-left: 3px solid ${BRAND.amber}; color: ${BRAND.ink}; font-size: 13.5px; line-height: 1.45; }
.pc-strip b { font-weight: 700; flex: 1; min-width: 0; }
.pc-strip u { text-decoration: none; color: ${BRAND.blue}; font-weight: 800; white-space: nowrap; }
.pc-row { display: flex; gap: 8px; align-items: flex-end; }
.pc-row.me { justify-content: flex-end; }
.pc-av { flex-shrink: 0; width: 30px; height: 30px; border-radius: 50%; display: grid; place-items: center; font-weight: 800; font-size: 13px; margin-bottom: 2px; }
.pc-av img { width: 21px; height: auto; display: block; }
.pc-av-ai { background: #fff; border: 1px solid ${BRAND.line}; }
.pc-av-desk { background: ${BRAND.navy}; color: #fff; }
.pc-col { max-width: min(78%, 420px); display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.pc-row.me .pc-col { align-items: flex-end; }
.pc-nm { font-size: 11.5px; font-weight: 700; color: ${BRAND.mute}; padding-left: 4px; }
.pc-bub { font-size: 15px; line-height: 1.55; padding: 9px 13px; border-radius: 18px 18px 18px 6px; white-space: pre-wrap; overflow-wrap: anywhere;
  background: #fff; border: 1px solid ${BRAND.line}; color: ${BRAND.ink}; box-shadow: 0 1px 2px rgba(18,37,74,.06); }
.pc-bub.mine { background: ${BRAND.navy}; border-color: ${BRAND.navy}; color: #fff; border-radius: 18px 18px 6px 18px; }
.pc-bub.mine a { color: #fff; }
.pc-bub.ph { padding: 3px; background: transparent; border: 0; box-shadow: none; }
.pc-photo { display: block; position: relative; padding: 0; border: 0; background: none; cursor: zoom-in; min-height: 0; }
/* A fixed square (owner, 2026-10-28): the list never grows as pictures load,
   so the chat opens already at its newest message. Tap for the whole photo. */
.pc-photo img { display: block; width: 180px; height: 180px; object-fit: cover; border-radius: 14px; background: #e8edf5; }
.pc-photo-wait { position: absolute; inset: auto 6px 6px auto; font-size: 11px; font-weight: 700; color: #fff; background: rgba(0,0,0,.55); padding: 2px 8px; border-radius: 8px; }
.pc-acts { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 9px; }
.pc-acts button, .pc-acts a { font: inherit; font-size: 13.5px; font-weight: 700; padding: 7px 13px; border-radius: 999px; cursor: pointer; text-decoration: none; min-height: 0; }
.pc-a1 { background: ${BRAND.amber}; color: ${BRAND.navy}; border: 0; }
.pc-a2 { background: #fff; color: ${BRAND.navy}; border: 1px solid #d6e0ee; }
.pc-acts button:disabled { opacity: .6; cursor: not-allowed; }
.pc-dots { display: flex; gap: 5px; align-items: center; padding: 13px 14px; }
.pc-dots span { width: 7px; height: 7px; border-radius: 50%; background: #8a97ad; animation: msaTypingBlink 1.2s infinite; }
.pc-err { font-size: 13px; color: #9b1c1c; background: #fdecec; border-top: 1px solid #f5c2c2; padding: 8px 14px; }
.pc-tray { background: ${BRAND.paper}; padding: 12px 12px 4px; }
.pc-thumbs { display: flex; gap: 10px; overflow-x: auto; padding: 6px 2px 2px; }
.pc-th { position: relative; flex-shrink: 0; width: 64px; height: 64px; }
.pc-th img { width: 64px; height: 64px; object-fit: cover; border-radius: 10px; display: block; }
.pc-th button { position: absolute; top: -6px; right: -6px; width: 22px; height: 22px; min-height: 0; border-radius: 50%; border: 2px solid #fff; background: ${BRAND.navy}; color: #fff; font-size: 11px; line-height: 1; cursor: pointer; padding: 0; }
.pc-th button::before { content: ''; position: absolute; inset: -10px; }
.pc-add { flex-shrink: 0; width: 64px; height: 64px; min-height: 0; border-radius: 10px; border: 1.5px dashed #b5c3d8; background: #f4f7fb; color: ${BRAND.mute}; font-size: 24px; cursor: pointer; }
.pc-trow { display: flex; align-items: center; gap: 12px; margin-top: 10px; }
.pc-trow span { flex: 1; font-size: 13px; color: ${BRAND.mute}; }
.pc-tcancel { min-height: 0; border: 0; background: none; font: inherit; font-weight: 700; font-size: 14px; color: ${BRAND.mute}; cursor: pointer; padding: 8px 4px; }
.pc-tsend { min-height: 0; border: 0; border-radius: 999px; padding: 9px 16px; font: inherit; font-weight: 800; font-size: 14px; background: ${BRAND.amber}; color: ${BRAND.navy}; cursor: pointer; }
.pc-tsend:disabled { opacity: .6; cursor: wait; }
/* No row of its own (owner, 2026-10-28, after Messenger): the input sits on
   the chat's own colour, no band and no line, so it looks the same before
   and while typing; the box itself is white, 46px tall, with 15px above it
   and 11px below; the photo and send buttons sit 16px in from the screen's
   edges. While the keyboard is down the row sits just above the home
   indicator (2px over its band -- owner: lower). */
.pc-inp { display: flex; gap: 10px; align-items: center; padding: 15px 16px max(11px, calc(var(--app-sab, 0px) + 2px)); background: ${BRAND.paper}; }
.pc-inp:focus-within { padding-bottom: 11px; }
/* Typing shows as the box's own edge turning blue, not a ring around it
   that crowded the line above. */
.pc-inp input.kb-focus:focus, .pc-inp input.kb-focus:focus-visible, .pc-inp textarea.kb-focus:focus, .pc-inp textarea.kb-focus:focus-visible { outline: none !important; box-shadow: none !important; border-color: ${BRAND.blue}; }
.pc-inp input:not([type=file]) { flex: 1; min-width: 0; height: 46px; font: inherit; font-size: 16px; padding: 0 16px; border-radius: 999px; border: 1px solid #dbe3ef; background: #fff; color: ${BRAND.ink}; outline: none; }
/* A box that grows with the question, up to five lines (50-role test,
   2026-11-05: one line showed only the last few words). */
.pc-inp textarea { flex: 1; min-width: 0; min-height: 46px; max-height: 132px; resize: none; overflow-y: auto; font: inherit; font-size: 16px; line-height: 22px; padding: 11px 16px; border-radius: 23px; border: 1px solid #dbe3ef; background: #fff; color: ${BRAND.ink}; outline: none; box-sizing: border-box; display: block; }
.pc-inp:has(textarea) { align-items: flex-end; }
.pc-cam { width: 44px; height: 44px; min-height: 0; flex-shrink: 0; border-radius: 50%; border: 0; background: none; color: ${BRAND.navy}; cursor: pointer; display: grid; place-items: center; }
.pc-send { width: 44px; height: 44px; min-height: 0; flex-shrink: 0; border-radius: 50%; border: 0; background: ${BRAND.amber}; color: ${BRAND.navy}; cursor: pointer; display: grid; place-items: center; }
.pc-send:disabled { background: #e6ebf2; color: #9aa6ba; cursor: not-allowed; }
.pc-cam:disabled { opacity: .5; cursor: not-allowed; }
.pc-cam:focus-visible, .pc-send:focus-visible, .pc-strip:focus-visible, .pc-acts button:focus-visible, .pc-tsend:focus-visible, .pc-add:focus-visible { outline: 2px solid ${BRAND.blue}; outline-offset: 2px; }
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
  // Line icons by name (components/ui/Icon, 決定 10).
  report: 'note', stage_up: 'medal', level_up: 'trophy',
  block_cancellation_notice: 'warn', team_practice_cancelled: 'warn',
  booking_confirmed: 'calendar', booking_series_confirmed: 'calendar', booking_rescheduled: 'calendar', booking_cancelled: 'calendar',
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
   filling the screen: the school's notices as small cards in it by time, a
   photo button (up to 5, picked then sent) and buttons in the AI's replies. In the app the floating widget never opens; asking it to
   (openChat, ?chat=1) goes to that page instead. */
/* The live feed of one conversation, shared by every widget that shows it
   (see the comment where it is used). Supabase gives back the channel it
   already has for a topic, and adding to one already subscribed throws. */
type ChatFeedListener = { insert: (payload: { new: unknown }) => void; recall: (payload: unknown) => void }
const chatFeeds = new Map<string, { sb: ReturnType<typeof createClient>; ch: ReturnType<ReturnType<typeof createClient>['channel']>; ls: Set<ChatFeedListener> }>()
function listenChat(sb: ReturnType<typeof createClient>, threadId: string, l: ChatFeedListener): () => void {
  let feed = chatFeeds.get(threadId)
  if (!feed) {
    const ls = new Set<ChatFeedListener>()
    const ch = sb.channel(`chat:${threadId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `thread_id=eq.${threadId}` },
        (payload) => { for (const x of ls) x.insert(payload as { new: unknown }) })
      .on('broadcast', { event: 'recall' }, ({ payload }) => { for (const x of ls) x.recall(payload) })
      .subscribe()
    feed = { sb, ch, ls }
    chatFeeds.set(threadId, feed)
  }
  const f = feed
  f.ls.add(l)
  return () => {
    f.ls.delete(l)
    if (f.ls.size === 0 && chatFeeds.get(threadId) === f) { chatFeeds.delete(threadId); f.sb.removeChannel(f.ch) }
  }
}

export default function ChatWidget({ parentId, lift = 0, variant = 'float', events = [] }: {
  parentId: string | null; lift?: number; variant?: 'float' | 'page'; events?: ChatEvent[]
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
  /* Inside the app's pager (components/TabPager) the chat page stays loaded
     while another tab is on screen: it is not being looked at, nor
     open, then. */
  const panel = useTabPanel()
  const panelOn = panel ? panel.active : true
  useEffect(() => {
    if (!page) try { sessionStorage.setItem('msa_chat_open', open ? '1' : '0') } catch {}
    // Told to the page (lib/chat-open), so the dashboard holds its low-balance
    // notice while the panel is open (found 2026-10-15). Not the "closed" of
    // the first pass of a restore: the panel is about to open.
    if (!open && restoring.current) return
    restoring.current = false
    reportChatOpen(open && panelOn)
  }, [open, panelOn, page])
  useEffect(() => () => reportChatOpen(false), [])
  const [threadId, setThreadId] = useState<string | null>(null)
  // Whose message is whose in a family with more than one person (J07):
  // until known, every family message counts as one's own, as before.
  const [fam, setFam] = useState<{ me: string | null; main: string; names: Record<string, string> } | null>(null)
  useEffect(() => {
    if (!threadId || fam) return
    let live = true
    fetch('/api/chat/thread', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'family' }) })
      .then(r => (r.ok ? r.json() : null)).catch(() => null)
      .then(d => { if (live && d && typeof d === 'object') setFam({ me: d.me ?? null, main: String(d.main || ''), names: d.names || {} }) })
    return () => { live = false }
  }, [threadId, fam])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const isMine = (m: any) => m.sender_type === 'parent' && (!fam || (m.sender_guardian_id ?? null) === fam.me)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const familyName = (m: any) => (m.sender_guardian_id ? fam?.names[m.sender_guardian_id] : fam?.main) || ''
  const [messages, setMessages] = useState<any[]>([])
  /* The greeting ("Hi! How can we help?") is for a conversation that has
     nothing in it -- not for one whose history is still on its way, where
     it flashed up and vanished (owner, 2026-10-28). */
  const [historyReady, setHistoryReady] = useState(false)
  // The words typed so far survive leaving the chat (50-role test,
  // 2026-11-05): kept for this browser tab only, never the photos.
  const [input, setInput] = useState('')
  const draftRead = useRef(false)
  useEffect(() => {
    if (!draftRead.current) {
      draftRead.current = true
      let d = ''
      try { d = sessionStorage.getItem('msa_chat_draft') || '' } catch {}
      if (d) { setInput(d); return }
    }
    try { if (input) sessionStorage.setItem('msa_chat_draft', input); else sessionStorage.removeItem('msa_chat_draft') } catch {}
  }, [input])
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
      const v = document.visibilityState === 'visible' && panelOn
      visibleRef.current = v
      setVisible(v)
    }
    sync()
    document.addEventListener('visibilitychange', sync)
    return () => document.removeEventListener('visibilitychange', sync)
  }, [panelOn])
  const [awaitingAi, setAwaitingAi] = useState(false)
  /* Who answers this thread now: the AI, or the desk after it has taken over
     (chat_threads.mode, set by Admin > Messages). The header used to say "AI
     assistant" all the time, so a family whose message went to the desk --
     and got no AI reply, by design -- read the silence as being ignored
     (found 2026-10-08). Kept current from what arrives in the chat: a desk
     reply means the desk has it, the desk's hand-back notice means the AI is
     back, and a message the AI skipped means the desk has it. */
  const [mode, setMode] = useState<'ai' | 'human'>('ai')
  /* The next message goes to a person, not the assistant (lib/chat-open
     openChatToTeam; owner, 2026-11-04, 問題 15). */
  const [toTeam, setToTeam] = useState(false)
  /* The lesson the family opened the chat from (lib/chat-open opts.about):
     offered above the box, and put at the head of the message if kept. */
  const [about, setAbout] = useState('')
  // Kept for the tab with the draft, so leaving the chat and coming back
  // still asks "this lesson?" (14-role test 2, J63). A new request wins.
  const aboutRead = useRef(false)
  useEffect(() => {
    if (!aboutRead.current) {
      aboutRead.current = true
      let a = ''
      try { a = sessionStorage.getItem('msa_chat_about') || '' } catch {}
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (a) setAbout(prev => prev || a)
      return
    }
    try { if (about) sessionStorage.setItem('msa_chat_about', about); else sessionStorage.removeItem('msa_chat_about') } catch {}
  }, [about])
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
      setMode('human')
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

  // The words asked for go in the box (never sent for the family); a request
  // for a person opens the visitor's "ask the team" form instead, or marks a
  // signed-in family's next message for the desk.
  const guestRef = useRef(guest)
  guestRef.current = guest
  function applyOpen(text: string, team: boolean, aboutLine = '') {
    setAbout(aboutLine)
    if (team && guestRef.current) {
      setContactErr(null); setContact(c => ({ ...c, text: c.text || text })); setContactOpen(true)
      return
    }
    if (text) setInput(text)
    if (team) setToTeam(true)
  }

  useEffect(() => {
    // In the app the chat is a page of its own: go there, and leave the
    // request (and its text) for the page to take when it mounts.
    // Not for a visitor: the chat page is for families, and they were sent to
    // sign in instead of seeing the "ask the team" form (14-role test 2, J24).
    const toPage = () => !page && appLook() && !guestRef.current
    const onOpen = (e: Event) => {
      if (toPage()) { router.push('/dashboard/chat'); return }
      takePendingChatOpen()
      focusOnOpenRef.current = true
      setOpen(true)
      const d = (e as CustomEvent).detail || {}
      applyOpen(String(d.text || ''), !!d.toTeam, String(d.about || ''))
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
      applyOpen(pending.text, !!pending.toTeam, pending.about || '')
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
  // The page's box is a textarea that grows with what is typed (up to its max-height).
  useLayoutEffect(() => {
    const el = inputRef.current as unknown as HTMLElement | null
    if (!el || el.tagName !== 'TEXTAREA') return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight + 2, 132) + 'px'
  }, [input])
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
    // One channel per conversation shared by every widget on the page
    // (listenChat below): in the app the 訊息 tab's chat and the hidden
    // floating one are both mounted, and a second .on() on a channel
    // already subscribed throws (2026-11-10: the 訊息 tab failed to draw).
    return listenChat(supabase, threadId, {
      insert: (payload) => {
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
        // The desk's "back to the assistant" notices carry a key; a plain note
        // (a teacher will answer, /api/chat/to-team) does not hand anything back.
        else if (from === 'system' && (payload.new as { metadata?: { key?: string } } | null)?.metadata?.key) setMode('ai')
        if (!(openRef.current && visibleRef.current) && (from === 'admin' || from === 'ai')) setUnread(u => u + 1)
      },
      // The desk recalled a reply (owner, 2026-10-23; /api/admin/chat-recall):
      // it leaves the screen without a trace. Read back from the database the
      // row is already hidden from this family.
      recall: (payload) => {
        const id = (payload as { id?: string } | null)?.id
        if (!id) return
        setMessages(prev => prev.filter(m => m.id !== id))
        // It may have been counted in the dot: count again.
        if (!(openRef.current && visibleRef.current)) recountUnread()
      },
    })
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
  /* The keyboard stays up while the conversation is scrolled; a tap on it
     puts the keyboard away (owner, 2026-11-10: "as in Messenger", after a
     firm pull down -- like Instagram -- still felt wrong). A tap = the
     finger lifted within 10px and 350ms of where it landed, not on a
     button or link (a photo is a button; those do their own thing). On the iPhone a tap
     on plain text never takes the focus from the box by itself. */
  const tap = useRef<{ x: number; y: number; t: number } | null>(null)
  const feedTouch = {
    onTouchStart: (e: React.TouchEvent) => {
      const p = e.touches[0]
      tap.current = p && e.touches.length === 1 ? { x: p.clientX, y: p.clientY, t: e.timeStamp } : null
    },
    onTouchMove: (e: React.TouchEvent) => {
      const s = tap.current, p = e.touches[0]
      if (s && p && Math.hypot(p.clientX - s.x, p.clientY - s.y) > 10) tap.current = null
    },
    onTouchEnd: (e: React.TouchEvent) => {
      const s = tap.current
      tap.current = null
      if (!s || e.timeStamp - s.t > 350) return
      if ((e.target as Element | null)?.closest?.('button, a, input, textarea, select, [role="button"]')) return
      const box = inputRef.current
      if (box && document.activeElement === box) box.blur()
    },
  }
  /* The conversation first appears already at its newest message (owner,
     2026-10-28: the whole history used to fly past on opening). Until the
     list has been placed once, and for a moment after while the rest of it
     (event strips, a late message) arrives, it jumps there before paint;
     only what comes in after that glides into view. */
  const placedAtRef = useRef(0)
  const lastSeenRef = useRef<{ id: string | null; awaiting: boolean }>({ id: null, awaiting: false })
  useLayoutEffect(() => {
    const el = listRef.current
    if (!el) return
    const now = Date.now()
    const newest = messages.length ? String(messages[messages.length - 1].id) : null
    const fresh = newest !== lastSeenRef.current.id || awaitingAi !== lastSeenRef.current.awaiting
    lastSeenRef.current = { id: newest, awaiting: awaitingAi }
    if (!placedAtRef.current || now - placedAtRef.current < 1500) {
      el.scrollTop = el.scrollHeight
      if (!placedAtRef.current && messages.length) placedAtRef.current = now
      return
    }
    // A new message or the AI starting to type: glide to it. Anything else
    // that made the list longer (event strips arriving): stay at the bottom
    // without a visible move, if that is where the family was.
    if (fresh) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
    else if (el.scrollHeight - el.scrollTop - el.clientHeight < 400) el.scrollTop = el.scrollHeight
  }, [messages, awaitingAi, events.length])

  // Opening the panel shows the newest message. The thread is usually loaded
  // before the panel opens, so the effect above has nothing new to react to,
  // and the freshly mounted list used to sit at the oldest message.
  useLayoutEffect(() => {
    if (!open) return
    const el = listRef.current
    if (el) el.scrollTop = el.scrollHeight
    // A list mounted again (the panel reopened) is placed afresh.
    placedAtRef.current = 0
  }, [open])

  // The list keeps its bottom where it was when it gets shorter -- the iOS
  // app now shortens the page to the keyboard's top (SceneDelegate.swift,
  // 2026-11-10), and without this the newest messages went under the box.
  useEffect(() => {
    const el = listRef.current
    if (!open || !el || typeof ResizeObserver === 'undefined') return
    let h = el.clientHeight
    const ro = new ResizeObserver(() => {
      const shrunk = h - el.clientHeight
      h = el.clientHeight
      if (shrunk > 0) el.scrollTop += shrunk
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [open])

  useEffect(() => {
    if (open && visible) setUnread(0)
  }, [open, visible])

  async function initThread() {
    if (guest) {
      const k = readGuestKey()
      setGuestKey(k)
      if (k) await loadGuest(k, true)
      else setHistoryReady(true) // a visitor with no conversation yet
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
    setHistoryReady(true)
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
    setHistoryReady(true)
  }

  async function sendMessage(text?: string) {
    const typed = (text ?? input).trim()
    // Which lesson it is about, at the head of the message (then cleared).
    // A reply button counts too (50-role test, 2026-11-05: it dropped the lesson).
    const body = typed && about ? `${t('chat.about.prefix', { what: about })}\n${typed}` : typed
    if (typed && about) setAbout('')
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
    if (toTeam) {
      // Straight to the desk: no assistant, no typing dots.
      let got: typeof messages | null = null
      try {
        const r = await fetch('/api/chat/to-team', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ thread_id: threadId, body, locale }),
        })
        if (r.ok) got = (await r.json().catch(() => null))?.messages ?? null
      } catch {}
      if (!got) {
        if (!text) setInput(prev => prev ? prev : body)
        setSendFailed('chat.sendFailed')
        setSending(false)
        return
      }
      const rows = got
      setMessages(prev => [...prev, ...rows.filter(r => !prev.some(m => m.id === r.id))])
      setMode('human'); setToTeam(false); setSending(false)
      return
    }
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
      // And the family sees that it went to the desk, on this screen only
      // (50-role test, 2026-11-05: the message just sat there unanswered).
      setMessages(prev => [...prev, { id: 'local-ai-fail-' + prev.length, thread_id: threadId, sender_type: 'system', body: t('chat.aiFailed'), created_at: new Date().toISOString(), metadata: null } as never])
    }
  }

  /* A photo for the desk (app/api/chat/photo; owner, 2026-10-28). Shown at
     once from the phone itself, then replaced by the stored one. */
  const fileRef = useRef<HTMLInputElement>(null)
  const [photoBusy, setPhotoBusy] = useState(false)
  const [viewPhoto, setViewPhoto] = useState<string | null>(null)
  /* Picked first, sent on 送出 (owner, 2026-10-28: a tap on a picture used
     to send it at once). Up to MAX_PHOTOS, shown above the box, each with an
     ✕; ＋ adds more. */
  const MAX_PHOTOS = 5
  const [picked, setPicked] = useState<{ file: File; url: string }[]>([])
  const pick = (list: FileList | File[] | null) => {
    const files = Array.from(list || []).filter(f => f.type.startsWith('image/') || /\.(heic|heif|jpe?g|png|webp)$/i.test(f.name))
    setPicked(prev => [...prev, ...files.slice(0, MAX_PHOTOS - prev.length).map(file => ({ file, url: URL.createObjectURL(file) }))])
  }
  /* The camera icon: the photo library alone inside the iPhone app (native
     PhotoPicker); anywhere else the page's file button. */
  async function choosePhotos() {
    const native = photoPickerPlugin()
    if (!native) { fileRef.current?.click(); return }
    try {
      const { photos } = await native.pick({
        limit: Math.max(1, MAX_PHOTOS - picked.length),
        labels: { recents: t('chat.photo.sheet.recents'), search: t('chat.photo.sheet.search') },
      })
      const files = (photos || []).map((b64, i) => {
        const bin = atob(b64)
        const bytes = new Uint8Array(bin.length)
        for (let j = 0; j < bin.length; j++) bytes[j] = bin.charCodeAt(j)
        return new File([bytes], `photo-${Date.now()}-${i}.jpg`, { type: 'image/jpeg' })
      })
      if (files.length) pick(files)
    } catch {
      // The picker could not open: fall back to the page's own.
      fileRef.current?.click()
    }
  }
  // Picked photos open a row above the box; keep the newest message in sight
  // above it (2026-11-04: the row covered the last 140px of the chat).
  useLayoutEffect(() => {
    const el = listRef.current
    if (el && picked.length) el.scrollTop = el.scrollHeight
  }, [picked.length])

  const unpick = (url: string) => setPicked(prev => { URL.revokeObjectURL(url); return prev.filter(p => p.url !== url) })
  const clearPicked = () => setPicked(prev => { prev.forEach(p => URL.revokeObjectURL(p.url)); return [] })
  async function sendPhotos() {
    const batch = picked
    if (!threadId || guest || photoBusy || !batch.length) return
    setPhotoBusy(true); setSendFailed(null)
    setPicked([])
    const stamp = Date.now()
    const temps = batch.map((p, i) => ({ id: `local-photo-${stamp}-${i}`, _local: true, _src: p.url, sender_type: 'parent', body: '📷', metadata: { photo: 'local' }, created_at: new Date(stamp + i).toISOString() }))
    const tempIds = new Set(temps.map(x => x.id))
    setMessages(prev => [...prev, ...temps])
    let code = ''
    try {
      const fd = new FormData()
      fd.append('thread_id', threadId)
      fd.append('locale', locale)
      for (const p of batch) fd.append('file', await shrinkPhoto(p.file), 'photo.jpg')
      const r = await fetch('/api/chat/photo', { method: 'POST', body: fd })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { code = d.code || 'failed'; throw new Error(code) }
      setMessages(prev => {
        const rest = prev.filter(m => !tempIds.has(m.id))
        const add = [...(d.messages || []), d.ack].filter(Boolean).filter((x: any) => !rest.some(m => m.id === x.id))
        return [...rest, ...add]
      })
    } catch {
      setMessages(prev => prev.filter(m => !tempIds.has(m.id)))
      setSendFailed(code === 'too_large' ? 'chat.photo.tooLarge' : code === 'limited' ? 'chat.photo.limited' : code === 'not_image' ? 'chat.photo.notImage' : 'chat.photo.failed')
    } finally {
      setPhotoBusy(false)
      setTimeout(() => batch.forEach(p => URL.revokeObjectURL(p.url)), 60000)
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
    const dateLine = (iso: string) => fmtDate(new Date(iso), locale === 'en' ? 'en-US' : locale, { month: 'short', day: 'numeric', weekday: 'short', timeZone: 'America/Los_Angeles' })
    const lastAi = [...messages].reverse().find(m => m.sender_type !== 'system')
    const avatar = (m: (typeof messages)[number]) => m.sender_type === 'parent'
      ? <span className="pc-av pc-av-desk" aria-hidden="true" style={{ background: '#e6edf8', color: '#2050a0' }}>{familyName(m).charAt(0).toUpperCase()}</span>
      : m.sender_type === 'ai'
      // eslint-disable-next-line @next/next/no-img-element
      ? <span className="pc-av pc-av-ai" aria-hidden="true"><img src="/mascot.png" alt="" /></span>
      : <span className="pc-av pc-av-desk" aria-hidden="true">{t('chat.deskBadge').trim().charAt(0).toUpperCase()}</span>
    // Never which staff member wrote: families see 櫃台 only (owner,
    // 2026-10-28); the desk's own screen shows who.
    const nameOf = (m: (typeof messages)[number]) => m.sender_type === 'ai' ? t('chat.fromAi') : m.sender_type === 'parent' ? familyName(m) : t('chat.fromDesk')
    return (
      <div className="pc" ref={panelRef} tabIndex={-1}>
        <style>{PAGE_CSS}</style>
        <div ref={liveRef} className="sr-only" aria-live="polite" aria-atomic="true" />
        <div className="pc-mode">{mode === 'human' || (toTeam && !guest) ? t('chat.subtitleHuman') : t('chat.subtitle')}</div>
        <div className="pc-feed" ref={listRef} {...feedTouch}>
          {items.length === 0 && historyReady && (
            <div className="pc-empty"><span aria-hidden="true" style={{ color: '#2050a0' }}><Icon name="chat" /></span>{t('chat.empty')}</div>
          )}
          {items.map((it, i) => {
            const prev = items[i - 1]
            const pill = !prev || dayOf(prev.at) !== dayOf(it.at) || Date.parse(it.at) - Date.parse(prev.at) > 15 * 60000
            const pillText = !prev || dayOf(prev.at) !== dayOf(it.at) ? `${dateLine(it.at)} ${clock(it.at)}` : clock(it.at)
            const key = it.k === 'm' ? it.m.id : 'e-' + it.e.id
            if (it.k === 'e') {
              const e = it.e
              const inner = <><span aria-hidden="true"><Icon name={EVENT_ICON[e.kind] || 'bell'} /></span><b>{e.title}</b>{e.url && <u>{t('chat.event.open')}</u>}</>
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
            const mine = isMine(m)
            const body = m.metadata?.photo ? (
              <button type="button" className="pc-photo tap-auto" onClick={() => setViewPhoto(photoSrc(m))} aria-label={t('chat.photo.open')}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photoSrc(m)} alt={t('chat.photo.alt')} width={180} height={180} />
                {m._local && <span className="pc-photo-wait">{t('chat.photo.sending')}</span>}
              </button>
            ) : renderBody(m.body, t('chat.openLink'))
            return (
              <Fragment key={key}>
                {pill && <div className="pc-pill">{pillText}</div>}
                <div className={'pc-row' + (mine ? ' me' : '')}>
                  {!mine && avatar(m)}
                  <div className="pc-col">
                    {!mine && <div className="pc-nm">{nameOf(m)}</div>}
                    {/* Who sent it, for a screen reader too (50-role test, 2026-11-05). */}
                    {mine && <span className="sr-only">{t('chat.fromMe')}</span>}
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
                </div>
              </Fragment>
            )
          })}
          {awaitingAi && (
            <div className="pc-row">
              {avatar({ sender_type: 'ai' })}
              <div className="pc-col"><div className="pc-bub pc-dots" aria-label={t('chat.typing')}>
                {[0, 1, 2].map(i => <span key={i} style={{ animationDelay: `${i * 0.2}s` }} />)}
              </div></div>
            </div>
          )}
        </div>
{about && (
          <div className="pc-about" role="status" style={{ fontSize: '13px', color: '#16294a', background: '#eef4fc', borderTop: '1px solid #c9d8ee', padding: '9px 16px', display: 'flex', gap: '10px', alignItems: 'center' }}>
            <span aria-hidden="true"><Icon name="calendar" /></span>
            <span style={{ flex: 1, minWidth: 0, lineHeight: 1.45 }}><b style={{ display: 'block', fontSize: '12px', color: '#56647d' }}>{t('chat.about.q')}</b>{about}</span>
            <button type="button" className="tap-auto" onClick={() => setAbout('')} style={{ background: 'none', border: 'none', color: '#2050a0', fontWeight: 800, cursor: 'pointer', fontSize: '12.5px', padding: 0, whiteSpace: 'nowrap' }}>{t('chat.about.no')}</button>
          </div>
        )}
        {toTeam && !guest && (
          <div className="pc-team" role="status" style={{ fontSize: '12.5px', color: '#1f6b45', background: '#e7f6ec', borderTop: '1px solid #bfe3cb', padding: '8px 16px', display: 'flex', gap: '8px', alignItems: 'center' }}>
            <span style={{ flex: 1 }}>{t('chat.toTeam.banner')}</span>
            <button type="button" className="tap-auto" onClick={() => setToTeam(false)} style={{ background: 'none', border: 'none', color: '#1f6b45', fontWeight: 800, cursor: 'pointer', fontSize: 'inherit', padding: 0 }}>{t('chat.toTeam.cancel')}</button>
          </div>
        )}
        {sendFailed && <div role="alert" className="pc-err">{t(sendFailed)}</div>}
        <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={e => { pick(e.target.files); e.target.value = '' }} />
        {picked.length > 0 && (
          <div className="pc-tray" role="group" aria-label={t('chat.photo.picked', { n: picked.length })}>
            <div className="pc-thumbs">
              {picked.map(p => (
                <div key={p.url} className="pc-th">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.url} alt="" />
                  <button type="button" onClick={() => unpick(p.url)} aria-label={t('chat.photo.remove')}>✕</button>
                </div>
              ))}
              {picked.length < MAX_PHOTOS && (
                <button type="button" className="pc-add" onClick={choosePhotos} aria-label={t('chat.photo.add')}>＋</button>
              )}
            </div>
            <div className="pc-trow">
              <span>{t('chat.photo.picked', { n: picked.length })}</span>
              <button type="button" className="pc-tcancel" onClick={clearPicked} disabled={photoBusy}>{t('common.cancel')}</button>
              <button type="button" className="pc-tsend" onClick={sendPhotos} disabled={photoBusy || !threadId}>{t('chat.photo.sendN', { n: picked.length })}</button>
            </div>
          </div>
        )}
        <div className="pc-inp">
          <button type="button" className="pc-cam tap-auto" onClick={choosePhotos} disabled={photoBusy || !threadId || picked.length >= MAX_PHOTOS} aria-label={t('chat.photo.send')}>
            <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="3" /><circle cx="9" cy="10" r="2" /><path d="m21 16-5-5-9 9" /></svg>
          </button>
          <textarea ref={inputRef as unknown as React.RefObject<HTMLTextAreaElement>} className="kb-focus" rows={1} aria-label={t('chat.placeholder')} placeholder={t('chat.placeholder')}
            value={input} maxLength={800} onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key !== 'Enter' || e.shiftKey) return
              if (e.nativeEvent.isComposing || e.keyCode === 229) return
              e.preventDefault()
              sendMessage()
            }} />
          {/* mousedown kept from moving the focus (owner, 2026-11-10): on the
              iPhone the first tap only closed the keyboard -- the box lost
              focus, the row moved down under the finger and the tap missed --
              and a second tap was needed. Now the keyboard stays open and the
              first tap sends, as in Messages. */}
          <button type="button" className="pc-send tap-auto" onMouseDown={e => e.preventDefault()} onClick={() => sendMessage()} disabled={!input.trim() || sending} aria-label={t('chat.send')}>
            <svg viewBox="0 0 24 24" width="23" height="23" fill="currentColor" aria-hidden="true"><path d="M3.4 20.4 21 12 3.4 3.6 3.4 10l12.6 2-12.6 2z" /></svg>
          </button>
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
            // Full screen on a phone it covers the page, so Tab stays inside
            // it (2026-11-04: Tab past 送出 went to the hidden page behind).
            if (e.key === 'Tab' && isMobile && panelRef.current) {
              const items = Array.from(panelRef.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'))
                .filter(n => n.getClientRects().length > 0)
              if (items.length) {
                const first = items[0], last = items[items.length - 1], active = document.activeElement
                if (e.shiftKey && (active === first || active === panelRef.current)) { e.preventDefault(); last.focus() }
                else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus() }
              }
              return
            }
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
              <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.7)' }}>{mode === 'human' || (toTeam && !guest) ? t('chat.subtitleHuman') : t('chat.subtitle')}</div>
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
              {mode !== 'human' && <>{' · '}
              <button type="button" className="tap-auto" onClick={() => { setContactErr(null); setContactOpen(true) }}
                style={{ background: 'none', border: 'none', padding: 0, color: BLUE, fontWeight: 700, fontSize: 'inherit', cursor: 'pointer', textDecoration: 'underline' }}>
                {t('chat.contact.open')}
              </button></>}
            </div>
          )}

          {/* Messages */}
          <div ref={listRef} {...feedTouch} style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {messages.length === 0 && historyReady && (
              <div style={{ textAlign: 'center', color: '#56647d', fontSize: '14px', marginTop: '40px' }}>
                <div style={{ fontSize: '32px', marginBottom: '8px', color: '#2050a0' }}><Icon name="chat" /></div>
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
                <div style={{ textAlign: 'center', fontSize: '11px', color: '#5f6b80', margin: '4px 0' }}>
                  {fmtDate(new Date(msg.created_at), locale === 'en' ? 'en-US' : locale, { month: 'short', day: 'numeric', weekday: 'short', timeZone: 'America/Los_Angeles' })}
                </div>
              )}
              {msg.sender_type === 'system' ? (
              <div key={msg.id} style={{ textAlign: 'center', fontSize: '11.5px', color: '#5f6b80', padding: '2px 0' }}>
                {/* The desk handing the chat back: a fixed line, so it is
                    shown in the family's language (rows from before the key
                    carry only the English body). */}
                {msg.metadata?.key === CHAT_HANDBACK_AUTO_KEY ? t('chat.handbackAuto') : msg.metadata?.key === CHAT_HANDBACK_KEY || msg.body === CHAT_HANDBACK_EN ? t('chat.handback') : msg.body}
              </div>
            ) : (
              <div key={msg.id} style={{ display: 'flex', justifyContent: isMine(msg) ? 'flex-end' : 'flex-start' }}>
                <div style={{
                  maxWidth: '75%', padding: '10px 14px', borderRadius: isMine(msg) ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                  background: isMine(msg) ? BLUE : '#fff',
                  color: isMine(msg) ? '#fff' : BRAND.ink,
                  border: isMine(msg) ? 'none' : '1px solid #e3ebf6',
                  whiteSpace: 'pre-wrap', fontSize: '14px', lineHeight: 1.55, fontWeight: isMine(msg) ? 600 : 400,
                }}>
                  {msg.sender_type === 'parent' && !isMine(msg) && familyName(msg) && (
                    <div style={{ fontSize: '11px', fontWeight: 800, color: '#56647d', marginBottom: '4px' }}>{familyName(msg)}</div>
                  )}
                  {msg.sender_type === 'ai' && (
                    <div style={{ fontSize: '11px', fontWeight: 800, color: BLUE, marginBottom: '4px', letterSpacing: '0.5px' }}>{t('chat.fromAi')}</div>
                  )}
                  {msg.sender_type === 'admin' && (
                    <div style={{ fontSize: '11px', fontWeight: 800, color: '#1f7a57', marginBottom: '4px', letterSpacing: '0.5px' }}>{t('chat.fromDesk')}</div>
                  )}
                  {msg.metadata?.photo ? (
                    <a href={photoSrc(msg)} target="_blank" rel="noreferrer" style={{ display: 'block' }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={photoSrc(msg)} alt={t('chat.photo.alt')} width={160} height={160} style={{ display: 'block', width: '160px', height: '160px', objectFit: 'cover', borderRadius: '10px', background: '#e8edf5' }} />
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

          {about && (
            <div className="pc-about" role="status" style={{ fontSize: '13px', color: '#16294a', background: '#eef4fc', borderTop: '1px solid #c9d8ee', padding: '9px 16px', display: 'flex', gap: '10px', alignItems: 'center' }}>
              <span aria-hidden="true"><Icon name="calendar" /></span>
              <span style={{ flex: 1, minWidth: 0, lineHeight: 1.45 }}><b style={{ display: 'block', fontSize: '12px', color: '#56647d' }}>{t('chat.about.q')}</b>{about}</span>
              <button type="button" className="tap-auto" onClick={() => setAbout('')} style={{ background: 'none', border: 'none', color: '#2050a0', fontWeight: 800, cursor: 'pointer', fontSize: '12.5px', padding: 0, whiteSpace: 'nowrap' }}>{t('chat.about.no')}</button>
            </div>
          )}
          {toTeam && !guest && (
            <div className="pc-team" role="status" style={{ fontSize: '12.5px', color: '#1f6b45', background: '#e7f6ec', borderTop: '1px solid #bfe3cb', padding: '8px 16px', display: 'flex', gap: '8px', alignItems: 'center' }}>
              <span style={{ flex: 1 }}>{t('chat.toTeam.banner')}</span>
              <button type="button" className="tap-auto" onClick={() => setToTeam(false)} style={{ background: 'none', border: 'none', color: '#1f6b45', fontWeight: 800, cursor: 'pointer', fontSize: 'inherit', padding: 0 }}>{t('chat.toTeam.cancel')}</button>
            </div>
          )}
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
            {/* The keyboard stays open: see .pc-send. */}
            <button onMouseDown={e => e.preventDefault()} onClick={() => sendMessage()} disabled={!input.trim() || sending} aria-label={t('chat.send')} style={{
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
