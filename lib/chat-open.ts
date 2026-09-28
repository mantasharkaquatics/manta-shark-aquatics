// One chat widget is mounted by the page layouts (components/GlobalChat); a
// page that wants it -- the FAQ's "ask us", the adaptive-swim button -- asks it
// to open instead of mounting a second one. The text, if any, is put in the
// box but NOT sent: putting words in a parent's mouth and firing them off is
// not ours to do.
export const CHAT_OPEN_EVENT = 'msa:chat-open'

export function openChat(text?: string) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(CHAT_OPEN_EVENT, { detail: { text: text || '' } }))
}
