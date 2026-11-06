/* The Android back button inside the app (owner, 2026-11-04, 問題 14 選項 A).
   Capacitor's own handling went back a page, or closed the app, even with a
   sheet open. Now, in order:
     1. a sheet or dialog on top of the page is closed (only that);
     2. a page that has steps of its own may take it (APP_BACK_EVENT,
        cancelable -- the booking page steps back);
     3. the first level of the 預約 / 課表 / 訊息 / 我的 tabs goes to 首頁;
     4. 首頁 (or the sign-in page) puts the app in the background;
     5. anywhere else, back a page (首頁 when there is nothing to go back to).
   iPhones have no back button; nothing here runs there. */

export const APP_BACK_EVENT = 'msa:app-back'

const TAB_ROOTS = new Set(['/booking', '/dashboard/schedule', '/dashboard/chat', '/dashboard/me'])
const HOME_ROOTS = new Set(['/dashboard', '/login', '/'])

const shown = (el: Element) => {
  // A closed sheet can stay in the page, hidden from readers and pushed off
  // the bottom (the swimmer's 換造型 sheet): not open.
  if (el.closest('[aria-hidden="true"], [inert]')) return false
  const r = (el as HTMLElement).getBoundingClientRect()
  const cs = getComputedStyle(el)
  return r.width > 0 && r.height > 0 && r.top < window.innerHeight - 1 && r.bottom > 1
    && cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) > 0.05
}
/** The element, or its nearest ancestor, that is fixed to the screen. */
const fixedOf = (el: Element | null): HTMLElement | null => {
  for (let x = el as HTMLElement | null; x && x !== document.body; x = x.parentElement) {
    if (getComputedStyle(x).position === 'fixed') return x
  }
  return null
}

/** The sheet or dialog on top, if any: the last one in the page that is
 *  shown and sits on the screen (an in-page "are you sure" box is not one). */
function topOverlay(): { dialog: HTMLElement; backdrop: HTMLElement } | null {
  const list = [...document.querySelectorAll('[role="dialog"], [role="alertdialog"], .sw-scrim.on')]
    .filter(shown)
    .map(el => ({ dialog: el as HTMLElement, backdrop: fixedOf(el) }))
    .filter((x): x is { dialog: HTMLElement; backdrop: HTMLElement } => !!x.backdrop)
  return list.length ? list[list.length - 1] : null
}

const wait = (ms: number) => new Promise(r => setTimeout(r, ms))
const gone = (el: HTMLElement) => !el.isConnected || !shown(el)

async function closeOverlay(o: { dialog: HTMLElement; backdrop: HTMLElement }) {
  // Esc first: the sheets and dialogs that take a keyboard close on it.
  const esc = () => new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true })
  // A dialog that took the Esc (prevented it) has answered this press: a
  // second Esc or a tap would go on to close what it chose to keep, as the
  // suggestion box's confirm step (14-role test 2, J23).
  if (!o.dialog.dispatchEvent(esc())) { await wait(80); return }
  document.dispatchEvent(esc())
  await wait(80)
  if (gone(o.dialog)) return
  // Esc opened a question of its own ("discard your changes?"): that is the
  // answer to this press -- nothing more is tapped (14-role test 2, J03).
  const now = topOverlay()
  if (now && now.dialog !== o.dialog) return
  // Then a tap on the dimmed area around it, as a finger would close it.
  o.backdrop.click()
  await wait(80)
  if (gone(o.dialog)) return
  // A sheet that is its own fixed box has its dimmed area beside it (a
  // sibling covering the screen): tap that.
  const scrim = [...(o.backdrop.parentElement?.children || [])].find(x => {
    if (x === o.backdrop || !(x instanceof HTMLElement) || getComputedStyle(x).position !== 'fixed' || !shown(x)) return false
    const r = x.getBoundingClientRect()
    return r.width >= window.innerWidth * 0.9 && r.height >= window.innerHeight * 0.6
  }) as HTMLElement | undefined
  if (scrim) {
    scrim.click()
    await wait(80)
    if (gone(o.dialog)) return
  }
  // Last, its own close button.
  const btn = [...o.dialog.querySelectorAll('button')].find(b =>
    /關閉|关闭|close|取消|cancel/i.test(b.getAttribute('aria-label') || '') || /^[✕×✖]$|^(關閉|关闭|Close)$/.test((b.textContent || '').trim()))
  btn?.click()
}

export async function handleAppBack(o: { canGoBack: boolean; goHome: () => void; minimize: () => void }) {
  // The language menu open: back closes it, nothing more (14-role test 2,
  // J79). AppShell closes it on Esc and puts focus back on its button.
  if (document.querySelector('.msa-ab-menu')) { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); return }
  const top = topOverlay()
  if (top) { await closeOverlay(top); return }
  const ev = new CustomEvent(APP_BACK_EVENT, { cancelable: true })
  window.dispatchEvent(ev)
  if (ev.defaultPrevented) return
  const path = location.pathname.replace(/^\/(zh-Hant|zh-Hans|en)(?=\/|$)/, '') || '/'
  if (TAB_ROOTS.has(path)) { o.goHome(); return }
  if (HOME_ROOTS.has(path)) { o.minimize(); return }
  if (o.canGoBack && history.length > 1) history.back()
  else o.goHome()
}
