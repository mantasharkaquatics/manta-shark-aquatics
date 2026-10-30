'use client'

/* The app's home cards as a curved deck, each with its 3D swimmer standing
   in a little pool on top (owner, 2026-10-29: 版本一 豆豆身, app home only, the
   card's own content below the swimmer). Several swimmers swipe left and
   right on a curve; the one in the middle can be turned with a finger and
   dressed ("Change look"). Anyone in the family may dress them, view-only
   members too. (The owner tried every swimmer on one turning pool with one
   card below, and came back to this: one card per swimmer, keeping the pool.)

   A swimmer with no look and no gender on file asks "a boy's or a girl's
   look?" on its card; the answer is saved as the look only, never as the
   child's gender (owner, 2026-10-29: families are not asked a gender).
   Without WebGL, or if the model will not load, the plain cards show
   (`fallback`), as on the website. */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useT } from '@/lib/i18n/provider'
import {
  GEAR_COLORS, HAIR_COLORS, SKINS, SUIT_COLORS, type SwimmerLook,
} from '@/lib/swimmer-look'
import type { Character, Engine } from './engine'

export interface DeckItem { id: string; name: string; look: SwimmerLook | null }

/* What a swimmer with no gender yet looks like while the card asks: a swim
   cap hides the hair, so it is neither a boy nor a girl. */
const NEUTRAL: SwimmerLook = {
  gender: 'boy', skin: SKINS[1], hair: 'short', hairColor: HAIR_COLORS[0], suit: 'jammer', suitColor: SUIT_COLORS[1],
  goggles: 'forehead', goggleColor: GEAR_COLORS[0], cap: true, capColor: GEAR_COLORS[1], fins: false, finColor: GEAR_COLORS[3],
}
const lookKey = (l: SwimmerLook) => JSON.stringify(l)

const CSS = `
.sw-deck { --gap: 12px; display: flex; align-items: flex-start; gap: var(--gap); margin: 0 -20px -18px; padding: 4px 0 18px;
  overflow-x: auto; overflow-y: hidden; scroll-snap-type: x mandatory; overscroll-behavior-x: contain; scrollbar-width: none;
  -webkit-overflow-scrolling: touch; -webkit-user-select: none; user-select: none }
.sw-deck::-webkit-scrollbar { display: none }
/* Room so the first and last card can come to the middle. */
.sw-deck::before, .sw-deck::after { content: ''; flex: 0 0 calc((100% - var(--cw)) / 2 - var(--gap)) }
.sw-slot { position: relative; flex: 0 0 var(--cw); width: var(--cw); scroll-snap-align: center; scroll-snap-stop: always }
/* No curve or dimming driven by the scroll: on the iPhone those effects are
   worked out by the page's own thread, and any work there made the whole
   card jerk as it arrived (owner, 2026-10-30). The cards are a plain native
   row, which iOS moves entirely by itself. */
.sw-slot:not([data-on]) .msa-mcard * { pointer-events: none }
.sw-slot:not([data-on]) { cursor: pointer }
.sw-hold { position: absolute; z-index: 2; display: none; touch-action: none; cursor: grab; -webkit-tap-highlight-color: transparent }
.sw-stage { position: relative; height: 300px; margin: -20px -20px 14px; overflow: hidden;
  background: radial-gradient(120% 90% at 50% 18%, #e9f6fd, #c3e4f5) }
.sw-stage::after { content: ''; position: absolute; inset: auto 0 0 0; height: 46px; pointer-events: none;
  background: linear-gradient(180deg, rgba(29,63,124,0), rgba(29,63,124,.16)) }
.sw-live { position: absolute; inset: 0; z-index: 1 }
.sw-msg { position: absolute; inset: 0; display: grid; place-items: center; font-size: 13px; font-weight: 700; color: #12254a }
.sw-dress { position: absolute; top: 12px; left: 12px; z-index: 3; display: inline-flex; align-items: center; gap: 6px; height: 36px;
  padding: 0 14px 0 11px; border: 0; border-radius: 999px; background: rgba(255,255,255,.94); color: #12254a; font: inherit;
  font-size: 14px; font-weight: 800; cursor: pointer; box-shadow: 0 4px 14px rgba(18,37,74,.16) }
.sw-dress svg { width: 18px; height: 18px }
.sw-hint { position: absolute; top: 18px; right: 12px; z-index: 3; font-size: 12px; font-weight: 700; color: #12254a;
  background: rgba(255,255,255,.8); border-radius: 999px; padding: 4px 10px; transition: opacity .4s; pointer-events: none }
.sw-ask { position: absolute; left: 12px; right: 12px; bottom: 12px; z-index: 3; background: rgba(255,255,255,.95); border-radius: 16px;
  padding: 12px; color: #12254a; box-shadow: 0 6px 18px rgba(18,37,74,.16); text-align: center }
.sw-ask p { margin: 0 0 10px; font-size: 15px; font-weight: 800 }
.sw-ask small { display: block; margin-top: 8px; font-size: 12px; color: #56647d; line-height: 1.45 }
.sw-ask-row { display: flex; gap: 8px }
.sw-ask-row button { flex: 1; min-height: 44px; border: 0; border-radius: 12px; background: #12254a; color: #fff; font: inherit;
  font-size: 15px; font-weight: 800; cursor: pointer }
.sw-ask-row button:disabled { opacity: .6 }
.sw-dots { display: flex; justify-content: center; gap: 7px; margin-top: 12px }
.sw-dots button { width: 8px; height: 8px; min-height: 0; padding: 0; border: 0; border-radius: 99px; background: #b7c5da; cursor: pointer;
  transition: width .25s, background .25s }
.sw-dots button[aria-current="true"] { width: 26px; background: #2050a0 }
.sw-scrim { position: fixed; inset: 0; z-index: 1000; background: rgba(18,37,74,.25); opacity: 0; pointer-events: none; transition: opacity .25s }
.sw-scrim.on { opacity: 1; pointer-events: auto }
.sw-sheet { position: fixed; left: 0; right: 0; bottom: 0; z-index: 1001; max-width: 520px; margin: 0 auto; background: #fff;
  border-radius: 22px 22px 0 0; box-shadow: 0 -12px 40px rgba(18,37,74,.2); transform: translateY(105%);
  transition: transform .3s cubic-bezier(.2,.8,.2,1); color: #16294a;
  padding: 10px 16px calc(16px + var(--app-sab, env(safe-area-inset-bottom, 0px))) }
.sw-sheet.on { transform: none }
.sw-grab { width: 38px; height: 5px; border-radius: 3px; background: #d3dbe7; margin: 0 auto 10px }
.sw-top { display: flex; align-items: center; justify-content: space-between; gap: 10px }
.sw-top b { font-size: 17px }
.sw-done { height: 36px; min-height: 36px; padding: 0 18px; border-radius: 999px; border: 0; background: #f09800; color: #12254a;
  font: inherit; font-weight: 800; font-size: 14.5px; cursor: pointer }
.sw-tabs { display: flex; gap: 6px; overflow-x: auto; padding: 12px 2px 4px; scrollbar-width: none }
.sw-tabs::-webkit-scrollbar { display: none }
.sw-tabs button { flex: 1 0 auto; height: 34px; min-height: 34px; padding: 0 9px; border-radius: 999px; border: 1px solid #dbe4f0;
  background: #fff; color: #16294a; font: inherit; font-weight: 800; font-size: 13px; cursor: pointer }
.sw-tabs button[aria-selected="true"] { background: #12254a; border-color: #12254a; color: #fff }
.sw-panel { padding-top: 12px; min-height: 150px; display: flex; flex-direction: column; gap: 12px }
.sw-lab { font-size: 12.5px; font-weight: 800; letter-spacing: .06em; color: #5b6a83 }
.sw-opts { display: flex; flex-wrap: wrap; gap: 8px }
.sw-opts button { min-width: 72px; height: 40px; min-height: 40px; padding: 0 14px; border-radius: 12px; border: 1.5px solid #dbe4f0;
  background: #f7f9fc; color: #16294a; font: inherit; font-weight: 800; font-size: 14px; cursor: pointer }
.sw-opts button[aria-pressed="true"] { border-color: #2050a0; background: #e7effa; color: #2050a0 }
.sw-swatches { display: flex; flex-wrap: wrap; gap: 10px }
.sw-swatches button { width: 34px; height: 34px; min-height: 34px; border-radius: 50%; border: 2px solid #fff; box-shadow: 0 0 0 1.5px #dbe4f0;
  cursor: pointer; padding: 0 }
.sw-swatches button[aria-pressed="true"] { box-shadow: 0 0 0 2.5px #2050a0 }
.sw-toast { position: fixed; left: 50%; bottom: calc(var(--app-tab-h, 0px) + 16px); z-index: 1002; transform: translateX(-50%) translateY(20px);
  opacity: 0; background: #12254a; color: #fff; font-size: 14px; font-weight: 700; padding: 10px 16px; border-radius: 999px;
  transition: opacity .25s, transform .25s; pointer-events: none; white-space: nowrap }
.sw-toast.on { opacity: 1; transform: translateX(-50%) }
@media (prefers-reduced-motion: reduce) { .sw-sheet, .sw-scrim, .sw-dots button { transition: none !important } }
`

const ICON_DRESS = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 5a2 2 0 1 1 2 2l-2 1.5V10l8.5 6.5A1.5 1.5 0 0 1 19.6 19H4.4a1.5 1.5 0 0 1-.9-2.5L12 10" />
  </svg>
)

type Tab = 'gender' | 'hair' | 'suit' | 'goggles' | 'cap' | 'fins' | 'skin'
const TABS: Tab[] = ['gender', 'hair', 'suit', 'goggles', 'cap', 'fins', 'skin']

export default function SwimmerDeck({ items, renderCard, onLook, fallback, after }: {
  items: DeckItem[]
  /** The swimmer's card, with the stage as its first child. */
  renderCard: (item: DeckItem, stage: React.ReactNode) => React.ReactNode
  /** A look the server has saved. */
  onLook: (id: string, look: SwimmerLook) => void
  /** What to show when the phone cannot draw 3D: the plain cards. */
  fallback: React.ReactNode
  /** Shown under the cards and dots (the add-a-swimmer link); the fallback brings its own. */
  after?: React.ReactNode
}) {
  const t = useT()
  const [engine, setEngine] = useState<Engine | null | 'loading'>('loading')
  const chars = useRef(new Map<string, { ch: Character; key: string }>())
  const [hinted, setHinted] = useState(false)
  const [draft, setDraft] = useState<SwimmerLook | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('gender')
  const [busy, setBusy] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const deckRef = useRef<HTMLDivElement>(null)
  const dotsRef = useRef<HTMLDivElement>(null)
  const [cw, setCw] = useState(320)
  // Per card, by swimmer id: the card, the place for its own 3D canvas, the grab boxes.
  const slotEls = useRef(new Map<string, HTMLDivElement>())
  const liveEls = useRef(new Map<string, HTMLDivElement>())
  const holdEls = useRef(new Map<string, (HTMLDivElement | null)[]>())
  // Which card is in the middle. Kept out of React on purpose: changing card
  // must not re-render anything (owner, 2026-10-30: 換造型 popping in with a
  // pause when a new card arrived). Every card already carries everything it
  // shows, its own 3D view included; arriving only says which swimmer
  // breathes and turns, and moves the grab boxes.
  const centerRef = useRef(0)

  // Load three.js and the model once.
  useEffect(() => {
    let gone = false
    let made: Engine | null = null
    import('./engine').then(m => m.createEngine()).then(e => {
      made = e
      if (gone) { e?.dispose(); return }
      setEngine(e)
    }).catch(err => { console.warn('[swimmer] 3D not available', err); if (!gone) setEngine(null) })
    return () => { gone = true; made?.dispose() }
  }, [])

  /* ---------- the middle card, done by hand ---------- */
  const placeHolds = useCallback((id: string, show: boolean) => {
    if (!engine || engine === 'loading') return
    const boxes = show ? engine.swimmerBoxes() : []
    ;(holdEls.current.get(id) || []).forEach((g, k) => {
      if (!g) return
      const b = boxes[k]
      g.style.display = b ? 'block' : 'none'
      if (b) { g.style.left = b.x + 'px'; g.style.top = b.y + 'px'; g.style.width = b.w + 'px'; g.style.height = b.h + 'px' }
    })
  }, [engine])
  const markDots = (i: number) => {
    dotsRef.current?.querySelectorAll('button').forEach((b, k) => b.setAttribute('aria-current', String(k === i)))
  }
  /** Make card i the live one: nothing is drawn differently, the swimmer there just starts to breathe. */
  const activate = useCallback((i: number) => {
    if (!engine || engine === 'loading') return
    const it = items[i]; if (!it) return
    const was = items[centerRef.current]
    if (was && was.id !== it.id) { slotEls.current.get(was.id)?.removeAttribute('data-on'); placeHolds(was.id, false) }
    centerRef.current = i
    slotEls.current.get(it.id)?.setAttribute('data-on', '')
    engine.setActive(chars.current.get(it.id)?.ch ?? null)
    placeHolds(it.id, true)
    markDots(i)
  }, [engine, items, placeHolds])

  // Make and dress each swimmer and give it its own canvas on its card.
  useLayoutEffect(() => {
    if (!engine || engine === 'loading') return
    for (const it of items) {
      // The swimmer being dressed shows the sheet's choices, not the saved look.
      if (draft && it.id === editing) continue
      const look = it.look ?? NEUTRAL
      const k = lookKey(look)
      const had = chars.current.get(it.id)
      const ch = had ? had.ch : engine.make(look)
      if (had && had.key !== k) engine.dress(ch, look)
      chars.current.set(it.id, { ch, key: k })
      const host = liveEls.current.get(it.id)
      if (host) engine.mount(ch, host)
    }
    // A swimmer no longer in the list gives its canvas back.
    for (const [id, c] of chars.current) if (!items.some(it => it.id === id)) { engine.unmount(c.ch); chars.current.delete(id) }
    activate(Math.min(centerRef.current, items.length - 1))
  }, [engine, items, draft, editing, activate])

  // Dressing shows on the live swimmer straight away.
  useEffect(() => {
    if (!engine || engine === 'loading' || !draft || !editing) return
    const had = chars.current.get(editing)
    if (had) { engine.dress(had.ch, draft); chars.current.set(editing, { ch: had.ch, key: lookKey(draft) }); placeHolds(editing, true) }
  }, [engine, draft, editing, placeHolds])

  // Card width from the screen.
  useLayoutEffect(() => {
    const el = deckRef.current; if (!el) return
    const measure = () => setCw(Math.min(340, el.clientWidth - 64))
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  /* ---------- swipe and spin ----------
     Owner, 2026-10-29: "completely smooth, no stutter". Two script-driven
     versions (cards moved by JavaScript on every finger move) still
     stuttered on the iPhone: whatever else the page does on its main thread
     -- drawing the 3D swimmer, React, the phone's own work -- delays the
     next move. So the cards are a native horizontal scroller with snapping:
     iOS moves them itself, off the main thread, like any scrolling list on
     the phone. The curve and the dimming of the side cards are CSS driven by
     the scroll position (no script either).

     Turning the swimmer (owner: only when the finger is ON the swimmer):
     the live card carries invisible grab boxes over the swimmer, from
     engine.swimmerBoxes(), with touch-action: none. A finger that lands
     there turns the swimmer and the page does not scroll; a finger anywhere
     else -- pool, sky, the card below -- scrolls the cards, decided by the
     phone itself without asking any script. The live swimmer moves to the
     new middle card once the cards have stopped (activate). */
  const GAP = 12
  const restTimer = useRef(0)
  const nearest = useCallback(() => {
    const el = deckRef.current
    if (!el) return 0
    return Math.max(0, Math.min(items.length - 1, Math.round(el.scrollLeft / (cw + GAP))))
  }, [cw, items.length])
  // A finger still on the cards means they have not come to rest, even if they stand still.
  const touching = useRef(false)
  const rest = useCallback(() => {
    window.clearTimeout(restTimer.current)
    if (!engine || engine === 'loading' || touching.current) return
    const i = nearest()
    if (i !== centerRef.current) activate(i)
    engine.setMoving(false)
  }, [engine, nearest, activate])
  // As little as possible per scroll event: a timer, and the dots only when the nearest card changes.
  const lastNear = useRef(0)
  const onScroll = () => {
    const i = nearest()
    if (i !== lastNear.current) { lastNear.current = i; markDots(i) }
    if (engine && engine !== 'loading') engine.setMoving(true)
    window.clearTimeout(restTimer.current)
    restTimer.current = window.setTimeout(rest, 140)
  }
  useEffect(() => {
    const el = deckRef.current
    if (!el) return
    // Passive: these only listen, so the phone never waits for them before scrolling.
    const down = () => { touching.current = true }
    const up = () => { touching.current = false; window.clearTimeout(restTimer.current); restTimer.current = window.setTimeout(rest, 140) }
    el.addEventListener('touchstart', down, { passive: true })
    el.addEventListener('touchend', up, { passive: true })
    el.addEventListener('touchcancel', up, { passive: true })
    if ('onscrollend' in window) el.addEventListener('scrollend', rest)
    return () => {
      el.removeEventListener('touchstart', down); el.removeEventListener('touchend', up); el.removeEventListener('touchcancel', up)
      el.removeEventListener('scrollend', rest)
    }
  }, [rest])
  useEffect(() => () => window.clearTimeout(restTimer.current), [])
  const goTo = (i: number) => {
    const el = deckRef.current
    if (el) el.scrollTo({ left: i * (cw + GAP), behavior: 'smooth' })
  }
  // A tap on a side card brings it to the middle.
  const onSlotClick = (i: number) => (e: React.MouseEvent) => {
    if (i === centerRef.current) return
    e.preventDefault(); e.stopPropagation(); goTo(i)
  }

  const spin = useRef<null | { id: number; last: number; t: number; v: number }>(null)
  const onGrabDown = (e: React.PointerEvent) => {
    if (!engine || engine === 'loading') return
    e.preventDefault()
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    spin.current = { id: e.pointerId, last: e.clientX, t: performance.now(), v: 0 }
    engine.setDragging(true)
  }
  const onGrabMove = (e: React.PointerEvent) => {
    const d = spin.current
    if (!d || d.id !== e.pointerId || !engine || engine === 'loading') return
    const now = performance.now(), dx = e.clientX - d.last
    d.v = dx / Math.max(1, now - d.t); d.last = e.clientX; d.t = now
    engine.spin(dx)
    if (dx && !hinted) setHinted(true)
  }
  const onGrabUp = (e: React.PointerEvent) => {
    const d = spin.current
    if (!d || d.id !== e.pointerId || !engine || engine === 'loading') return
    spin.current = null
    engine.setDragging(false); engine.fling(d.v)
  }

  /* ---------- dressing ---------- */
  const say = (msg: string) => { setToast(msg); window.setTimeout(() => setToast(m => (m === msg ? null : m)), 1900) }
  const openSheet = (it: DeckItem) => {
    if (!it.look) return
    setDraft({ ...it.look }); setEditing(it.id); setTab('gender')
    const el = deckRef.current
    if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 76, behavior: 'smooth' })
  }
  const closeSheet = async () => {
    const it = items.find(x => x.id === editing)
    const d = draft
    setDraft(null); setEditing(null)
    if (!it || !d || !it.look || lookKey(d) === lookKey(it.look)) return
    // Shown as saved at once; put back if the server says no.
    const before = it.look
    onLook(it.id, d)
    const res = await fetch('/api/parent/swimmer-look', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ student_id: it.id, look: d }),
    }).catch(() => null)
    if (res?.ok) say(t('swimmer.saved', { name: it.name }))
    else { onLook(it.id, before); say(t('swimmer.saveFailed')) }
  }
  const set = <K extends keyof SwimmerLook>(k: K, v: SwimmerLook[K]) => setDraft(d => {
    if (!d) return d
    const n = { ...d, [k]: v }
    if (k === 'gender') {
      n.suit = v === 'girl' ? 'onepiece' : 'jammer'
      if (v === 'girl' && (n.hair === 'short' || n.hair === 'spiky')) n.hair = 'ponytail'
      if (v === 'boy' && n.hair !== 'short' && n.hair !== 'spiky') n.hair = 'short'
    }
    return n
  })
  const answer = async (it: DeckItem, style: 'boy' | 'girl') => {
    setBusy(it.id)
    const res = await fetch('/api/parent/swimmer-look', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ student_id: it.id, style }),
    }).catch(() => null)
    setBusy(null)
    const j = res?.ok ? await res.json().catch(() => null) : null
    if (j?.look) onLook(it.id, j.look)
    else say(t('swimmer.saveFailed'))
  }

  const opts = <K extends keyof SwimmerLook>(label: string, k: K, list: [SwimmerLook[K], string][]) => (
    <>
      <div className="sw-lab">{label}</div>
      <div className="sw-opts">
        {list.map(([v, txt]) => (
          <button key={String(v)} type="button" className="tap-auto" aria-pressed={draft?.[k] === v} onClick={() => set(k, v)}>{txt}</button>
        ))}
      </div>
    </>
  )
  const colors = <K extends keyof SwimmerLook>(label: string, k: K, list: readonly string[]) => (
    <>
      <div className="sw-lab">{label}</div>
      <div className="sw-swatches">
        {list.map((c, j) => (
          <button key={c} type="button" className="tap-auto" aria-label={t('swimmer.colorN', { n: j + 1 })} aria-pressed={draft?.[k] === c}
            style={{ background: c }} onClick={() => set(k, c as SwimmerLook[K])} />
        ))}
      </div>
    </>
  )

  const ready = engine && engine !== 'loading'
  const n = items.length

  if (engine === null) return <>{fallback}</>

  return (
    <>
      <style>{CSS}</style>
      <div ref={deckRef} className="sw-deck" style={{ '--cw': cw + 'px' } as React.CSSProperties} aria-roledescription="carousel"
        onScroll={onScroll}>
        {items.map((it, i) => {
          // Every card carries everything it can show, so arriving in the middle changes nothing React draws.
          const stage = (
            <div className="sw-stage" role="img" aria-label={t('swimmer.stageLabel', { name: it.name })}>
              {!ready && <div className="sw-msg">{t('swimmer.loading')}</div>}
              <div className="sw-live" ref={el => { if (el) liveEls.current.set(it.id, el); else liveEls.current.delete(it.id) }} />
              {ready && [0, 1, 2].map(k => (
                <div key={k} className="sw-hold" aria-hidden="true"
                  ref={el => { const a = holdEls.current.get(it.id) || []; a[k] = el; holdEls.current.set(it.id, a) }}
                  onPointerDown={onGrabDown} onPointerMove={onGrabMove} onPointerUp={onGrabUp} onPointerCancel={onGrabUp} />
              ))}
              {ready && it.look && (
                <button type="button" className="sw-dress tap-auto" onClick={() => openSheet(it)}>{ICON_DRESS}{t('swimmer.dress')}</button>
              )}
              {ready && it.look && <span className="sw-hint" style={{ opacity: hinted ? 0 : 1 }}>⟲ {t('swimmer.hintOne')}</span>}
              {!it.look && ready && (
                <div className="sw-ask">
                  <p>{t('swimmer.style.q', { name: it.name })}</p>
                  <div className="sw-ask-row">
                    <button type="button" className="tap-auto" disabled={busy === it.id} onClick={() => answer(it, 'boy')}>{t('swimmer.style.boy')}</button>
                    <button type="button" className="tap-auto" disabled={busy === it.id} onClick={() => answer(it, 'girl')}>{t('swimmer.style.girl')}</button>
                  </div>
                  <small>{t('swimmer.askHint', { name: it.name })}</small>
                </div>
              )}
            </div>
          )
          return (
            <div key={it.id} ref={el => { if (el) slotEls.current.set(it.id, el); else slotEls.current.delete(it.id) }} className="sw-slot"
              role="group" aria-roledescription="slide" aria-label={it.name} onClickCapture={onSlotClick(i)}>
              {renderCard(it, stage)}
            </div>
          )
        })}
      </div>
      {n > 1 && (
        <div className="sw-dots" ref={dotsRef}>
          {items.map((it, i) => (
            <button key={it.id} type="button" aria-label={it.name} onClick={() => goTo(i)} />
          ))}
        </div>
      )}
      {after}

      <div className={'sw-scrim' + (draft ? ' on' : '')} onClick={closeSheet} />
      <div className={'sw-sheet' + (draft ? ' on' : '')} role="dialog" aria-modal="true" aria-labelledby="sw-sheet-t" aria-hidden={!draft}>
        <div className="sw-grab" aria-hidden="true" />
        <div className="sw-top">
          <b id="sw-sheet-t">{t('swimmer.dress')}</b>
          <button type="button" className="sw-done tap-auto" onClick={closeSheet}>{t('swimmer.done')}</button>
        </div>
        <div className="sw-tabs" role="tablist">
          {TABS.map(k => (
            <button key={k} type="button" role="tab" className="tap-auto" aria-selected={tab === k} onClick={() => setTab(k)}>{t('swimmer.tab.' + k)}</button>
          ))}
        </div>
        {draft && (
          <div className="sw-panel" role="tabpanel">
            {tab === 'gender' && opts(t('swimmer.lab.gender'), 'gender', [['boy', t('swimmer.gender.male')], ['girl', t('swimmer.gender.female')]])}
            {tab === 'hair' && <>
              {opts(t(draft.cap ? 'swimmer.lab.hairCap' : 'swimmer.lab.hair'), 'hair',
                (['short', 'spiky', 'bob', 'ponytail', 'buns'] as const).map(h => [h, t('swimmer.hair.' + h)] as [SwimmerLook['hair'], string]))}
              {colors(t('swimmer.lab.hairColor'), 'hairColor', HAIR_COLORS)}
            </>}
            {tab === 'suit' && <>
              {opts(t('swimmer.lab.style'), 'suit', (['brief', 'jammer', 'onepiece'] as const).map(s => [s, t('swimmer.suit.' + s)] as [SwimmerLook['suit'], string]))}
              {colors(t('swimmer.lab.color'), 'suitColor', SUIT_COLORS)}
            </>}
            {tab === 'goggles' && <>
              {opts(t('swimmer.lab.wear'), 'goggles', (['none', 'eyes', 'forehead'] as const).map(g => [g, t('swimmer.goggles.' + g)] as [SwimmerLook['goggles'], string]))}
              {colors(t('swimmer.lab.color'), 'goggleColor', GEAR_COLORS)}
            </>}
            {tab === 'cap' && <>
              {opts(t('swimmer.lab.cap'), 'cap', [[false, t('swimmer.cap.off')], [true, t('swimmer.cap.on')]])}
              {colors(t('swimmer.lab.color'), 'capColor', GEAR_COLORS)}
            </>}
            {tab === 'fins' && <>
              {opts(t('swimmer.lab.fins'), 'fins', [[false, t('swimmer.fins.off')], [true, t('swimmer.fins.on')]])}
              {colors(t('swimmer.lab.color'), 'finColor', GEAR_COLORS)}
            </>}
            {tab === 'skin' && colors(t('swimmer.lab.skin'), 'skin', SKINS)}
          </div>
        )}
      </div>
      <div className={'sw-toast' + (toast ? ' on' : '')} role="status" aria-live="polite">{toast}</div>
    </>
  )
}

