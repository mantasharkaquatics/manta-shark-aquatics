'use client'

import { useEffect } from 'react'

// The same carousel that used to live in an inline <script>. React inserts
// script nodes through the DOM API, and browsers never execute those, so on
// client-side navigation the old version silently did nothing. An effect also
// gives us somewhere to stop the timer when the visitor leaves.
export default function TestimonialCarousel() {
  useEffect(() => {
    const total = 4
    let current = 0
    let timer: ReturnType<typeof setInterval> | undefined

    function goTo(n: number) {
      const target = document.querySelector(`.tcard[data-slide="${n}"]`)
      if (!target) return
      document.querySelectorAll('.tcard').forEach(el => el.classList.remove('active'))
      document.querySelectorAll('.dot').forEach((el, i) => el.classList.toggle('active', i === n))
      target.classList.add('active')
      current = n
      restart()
    }

    function restart() {
      if (timer) clearInterval(timer)
      timer = setInterval(() => goTo((current + 1) % total), 15000)
    }

    const prev = document.getElementById('t-prev')
    const next = document.getElementById('t-next')
    const dots = Array.from(document.querySelectorAll('.dot'))
    const onPrev = () => goTo((current - 1 + total) % total)
    const onNext = () => goTo((current + 1) % total)
    const onDot = dots.map((_, i) => () => goTo(i))

    prev?.addEventListener('click', onPrev)
    next?.addEventListener('click', onNext)
    dots.forEach((el, i) => el.addEventListener('click', onDot[i]))
    restart()

    return () => {
      if (timer) clearInterval(timer)
      prev?.removeEventListener('click', onPrev)
      next?.removeEventListener('click', onNext)
      dots.forEach((el, i) => el.removeEventListener('click', onDot[i]))
    }
  }, [])

  return null
}
