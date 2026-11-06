'use client'

import { useEffect } from 'react'

/* Pulling a sheet's head down closes it (決定 9: "往下拉" is one of the ways
   out of a pop-up of kind ①). One listener for every sheet on the page:
   a touch that starts on .msa-sheet-head and moves down far enough presses
   that sheet's ✕. The sheet follows the finger meanwhile. Phones only --
   the head is a grab bar there (app/globals.css). */
export default function SheetSwipe() {
  useEffect(() => {
    let start: { y: number; sheet: HTMLElement } | null = null
    const down = (e: TouchEvent) => {
      const t = e.target instanceof Element ? e.target : null
      let head = t?.closest('.msa-sheet-head, .msa-lsheet-top, .msa-lsheet-grab, .sw-top, .sw-grab') as HTMLElement | null | undefined
      // The bare top of a sheet -- its padding, the gap by the grab bar --
      // pulls too, above its title row and only while scrolled to the top
      // (14-role test 2, J80: only the 5px bar and the title did).
      if (!head && t?.matches('.sw-sheet, .msa-lsheet')) {
        const bare = t as HTMLElement
        const topEl = bare.querySelector('.sw-top, .msa-lsheet-top')
        if (topEl && e.touches[0].clientY < topEl.getBoundingClientRect().bottom && bare.scrollTop === 0) head = bare
      }
      if (!head || t?.closest('button, a, input, textarea, select')) return
      const sheet = head.closest('.msa-sheet, .msa-lsheet, .sw-sheet') as HTMLElement | null
      if (!sheet || window.innerWidth > 640) return
      start = { y: e.touches[0].clientY, sheet }
    }
    const move = (e: TouchEvent) => {
      if (!start) return
      const dy = Math.max(0, e.touches[0].clientY - start.y)
      start.sheet.style.transform = `translateY(${dy}px)`
      start.sheet.style.transition = 'none'
    }
    const up = (e: TouchEvent) => {
      if (!start) return
      const { sheet, y } = start; start = null
      const dy = (e.changedTouches[0]?.clientY ?? y) - y
      sheet.style.transition = 'transform .18s ease'
      if (dy > 80) {
        sheet.style.transform = 'translateY(100%)'
        const x = sheet.querySelector<HTMLElement>('.msa-sheet-x')
        setTimeout(() => {
          if (x) x.click(); else (sheet.parentElement as HTMLElement | null)?.click()
          // A sheet that stays in the page, hidden (換造型), starts clean next time.
          setTimeout(() => { sheet.style.transform = ''; sheet.style.transition = '' }, 300)
        }, 150)
      } else sheet.style.transform = ''
    }
    document.addEventListener('touchstart', down, { passive: true })
    document.addEventListener('touchmove', move, { passive: true })
    document.addEventListener('touchend', up, { passive: true })
    document.addEventListener('touchcancel', up, { passive: true })
    return () => {
      document.removeEventListener('touchstart', down)
      document.removeEventListener('touchmove', move)
      document.removeEventListener('touchend', up)
      document.removeEventListener('touchcancel', up)
    }
  }, [])
  return null
}
