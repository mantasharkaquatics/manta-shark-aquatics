// One chat widget is mounted by the page layouts (components/GlobalChat); a
// page that wants it -- the FAQ's "ask us", the adaptive-swim button -- asks it
// to open instead of mounting a second one. The text, if any, is put in the
// box but NOT sent: putting words in a parent's mouth and firing them off is
// not ours to do.
export const CHAT_OPEN_EVENT = 'msa:chat-open'

// The widget mounts only once GlobalChat knows who is signed in (a network
// round trip or more), so a request made before that -- /adaptive-swim?chat=1
// asks on page load, and a quick tap on "Ask us in chat" on a slow phone --
// had no listener and was lost (found 2026-10-08). The last request is kept
// here as well, and the widget takes it when it mounts. A minute old, it is
// stale: the visitor has moved on.
const PENDING_KEY = '__msaChatOpenPending'
const PENDING_MAX_AGE_MS = 60_000
type Pending = { text: string; at: number }

export function openChat(text?: string) {
  if (typeof window === 'undefined') return
  ;(window as unknown as Record<string, Pending | null>)[PENDING_KEY] = { text: text || '', at: Date.now() }
  window.dispatchEvent(new CustomEvent(CHAT_OPEN_EVENT, { detail: { text: text || '' } }))
}

/** The open request not yet handled, if any; clears it. */
export function takePendingChatOpen(): { text: string } | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as Record<string, Pending | null>
  const p = w[PENDING_KEY]
  w[PENDING_KEY] = null
  if (!p || Date.now() - p.at > PENDING_MAX_AGE_MS) return null
  return { text: p.text }
}

// The notice posted when the desk hands a conversation back to the assistant
// (app/api/admin/chat-handoff). Stored with metadata.key so the widget can
// show it in the family's language; the English body is what the admin
// screen shows, and what rows written before the key existed carry.
export const CHAT_HANDBACK_KEY = 'handback'
export const CHAT_HANDBACK_EN = 'Front desk session has ended. Our AI assistant will continue to help you here.'
