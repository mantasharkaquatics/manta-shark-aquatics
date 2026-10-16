'use client'

import { useEffect, useRef } from 'react'

/* Focus for a modal dialog: put the returned ref on the element that carries
   role="dialog".

   The dashboard's confirm and detail dialogs were plain divs: VoiceOver stayed
   on the button that opened one and could read on into the page behind it
   (found 2026-10-08). This moves focus to the dialog's first control as it
   opens and back to the opener as it closes. Read in a passive effect (not
   autoFocus) so the opener is still the active element -- also when one dialog
   hands over to the next.

   Moved here from the dashboard so its sheets and the fixed-class, account and
   partnerships confirms share it (found 2026-10-15: those never moved focus at
   all, and the sheets sit earlier in the page than the buttons that open them,
   so Tab walked the page behind). Tab and Shift+Tab now also stay inside the
   dialog, and `onEscape`, when given, closes it on Esc for pages that have no
   Esc handler of their own. Keys pressed inside a dialog nested in this one
   are left to that dialog. */
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

export function useDialogFocus<T extends HTMLElement = HTMLDivElement>(open: boolean, onEscape?: () => void) {
  const box = useRef<T | null>(null)
  const esc = useRef(onEscape)
  useEffect(() => { esc.current = onEscape })
  useEffect(() => {
    if (!open) return
    const el = box.current
    const back = document.activeElement as HTMLElement | null
    el?.querySelector<HTMLElement>('button:not([disabled]), a[href]')?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (!el || e.defaultPrevented) return
      const from = e.target instanceof Element ? e.target.closest('[role="dialog"]') : null
      if (from !== el) return
      if (e.key === 'Escape') {
        if (esc.current) { e.preventDefault(); esc.current() }
        return
      }
      if (e.key !== 'Tab') return
      const items = Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(n => n.getClientRects().length > 0)
      if (items.length === 0) { e.preventDefault(); return }
      const first = items[0]
      const last = items[items.length - 1]
      const active = document.activeElement
      if (e.shiftKey && (active === first || active === el)) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus() }
    }
    el?.addEventListener('keydown', onKey)
    return () => {
      el?.removeEventListener('keydown', onKey)
      if (back && back !== document.body && back.isConnected) back.focus()
    }
  }, [open])
  return box
}
