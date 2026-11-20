'use client'

import { useEffect } from 'react'

/* Pulling a sheet's head down closes it (決定 9: "往下拉" is one of the ways
   out of a pop-up of kind ①). One listener for every sheet on the page:
   a touch that starts on .msa-sheet-head and moves down follows the finger,
   and on release presses that sheet's ✕ -- but only after a long pull or a
   quick flick (owner, 2026-11-20: a small pull closed it; "要拉很快、或是拉比較遠
   再收起來"). Anything less springs back. Phones only -- the head is a grab
   bar there (app/globals.css). */
// Far enough: 40% of the sheet, never less than 180px.
const FAR_SHARE = 0.4, FAR_MIN = 180
// Fast enough: 0.6px per ms over the last ~100ms, after at least 40px.
const FLICK_SPEED = 0.6, FLICK_MIN = 40, FLICK_WINDOW = 100
const SPRING = 'transform .32s cubic-bezier(.2,.9,.3,1.15)'

type Pull = { y: number; sheet: HTMLElement; h: number; trail: { y: number; t: number }[] }

export default function SheetSwipe() {
  useEffect(() => {
    let start: Pull | null = null
    const down = (e: TouchEvent) => {
      const t = e.target instanceof Element ? e.target : null
      let head = t?.closest('.msa-sheet-head, .msa-lsheet-top, .msa-lsheet-grab, .sw-top, .sw-grab, html.msa-app .mst-back > .mst-panel > .mst-head') as HTMLElement | null | undefined
      // The bare top of a sheet -- its padding, the gap by the grab bar --
      // pulls too, above its title row and only while scrolled to the top
      // (14-role test 2, J80: only the 5px bar and the title did).
      if (!head && t?.matches('.sw-sheet, .msa-lsheet')) {
        const bare = t as HTMLElement
        const topEl = bare.querySelector('.sw-top, .msa-lsheet-top')
        if (topEl && e.touches[0].clientY < topEl.getBoundingClientRect().bottom && bare.scrollTop === 0) head = bare
      }
      if (!head || t?.closest('button, a, input, textarea, select')) return
      const sheet = head.closest('.msa-sheet, .msa-lsheet, .sw-sheet, .mst-panel') as HTMLElement | null
      if (!sheet || window.innerWidth > 640) return
      const y = e.touches[0].clientY
      start = { y, sheet, h: sheet.getBoundingClientRect().height, trail: [{ y, t: e.timeStamp }] }
    }
    const move = (e: TouchEvent) => {
      if (!start) return
      const y = e.touches[0].clientY
      const dy = Math.max(0, y - start.y)
      start.trail.push({ y, t: e.timeStamp })
      if (start.trail.length > 12) start.trail.shift()
      start.sheet.style.transform = `translateY(${dy}px)`
      start.sheet.style.transition = 'none'
    }
    const release = (e: TouchEvent, cancelled: boolean) => {
      if (!start) return
      const { sheet, y, h, trail } = start; start = null
      const endY = e.changedTouches[0]?.clientY ?? trail[trail.length - 1].y
      const dy = endY - y
      // Speed over the last moments only: a finger that stopped before
      // lifting is not a flick, however fast it moved earlier.
      const now = e.timeStamp
      const from = trail.find(p => now - p.t <= FLICK_WINDOW) || trail[trail.length - 1]
      const speed = now > from.t ? (endY - from.y) / (now - from.t) : 0
      const far = dy >= Math.max(FAR_MIN, h * FAR_SHARE)
      const flick = dy >= FLICK_MIN && speed >= FLICK_SPEED
      if (!cancelled && (far || flick)) {
        sheet.style.transition = 'transform .2s ease-out'
        sheet.style.transform = 'translateY(100%)'
        const x = sheet.querySelector<HTMLElement>('.msa-sheet-x')
        setTimeout(() => {
          if (x) x.click(); else (sheet.parentElement as HTMLElement | null)?.click()
          // A sheet that stays in the page, hidden (換造型), starts clean next time.
          setTimeout(() => { sheet.style.transform = ''; sheet.style.transition = '' }, 300)
        }, 170)
      } else {
        sheet.style.transition = SPRING
        sheet.style.transform = ''
        setTimeout(() => { if (!start || start.sheet !== sheet) sheet.style.transition = '' }, 340)
      }
    }
    const up = (e: TouchEvent) => release(e, false)
    const cancel = (e: TouchEvent) => release(e, true)
    document.addEventListener('touchstart', down, { passive: true })
    document.addEventListener('touchmove', move, { passive: true })
    document.addEventListener('touchend', up, { passive: true })
    document.addEventListener('touchcancel', cancel, { passive: true })
    return () => {
      document.removeEventListener('touchstart', down)
      document.removeEventListener('touchmove', move)
      document.removeEventListener('touchend', up)
      document.removeEventListener('touchcancel', cancel)
    }
  }, [])
  return null
}
