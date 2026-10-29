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
.sw-deck { position: relative; perspective: 1100px; touch-action: pan-y; margin: 0 -20px; overflow-x: clip; overflow-y: visible;
  -webkit-user-select: none; user-select: none }
.sw-slot { position: absolute; top: 0; left: 50%; transform-origin: 50% 50%; will-change: transform, opacity; backface-visibility: hidden }
.sw-dim { position: absolute; inset: 0; z-index: 5; border-radius: 20px; background: #0b1a36; opacity: 0; pointer-events: none }
.sw-slot:not(.on) .msa-mcard * { pointer-events: none }
.sw-slot:not(.on) { cursor: pointer }
.sw-stage { position: relative; height: 300px; margin: -20px -20px 14px; overflow: hidden; touch-action: pan-y;
  background: radial-gradient(120% 90% at 50% 18%, #e9f6fd, #c3e4f5) }
.sw-stage::after { content: ''; position: absolute; inset: auto 0 0 0; height: 46px; pointer-events: none;
  background: linear-gradient(180deg, rgba(29,63,124,0), rgba(29,63,124,.16)) }
.sw-stage .sw-snap { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; display: block }
.sw-live { position: absolute; inset: 0 }
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
  const [snaps, setSnaps] = useState<Record<string, string>>({})
  // Which card is in the middle. The deck's exact position while a finger
  // or the settling spring moves it lives in posRef and is written straight
  // to the cards' style, never through React (a re-render of every card on
  // every frame is what made swiping feel heavy).
  const [center, setCenter] = useState(0)
  const [hinted, setHinted] = useState(false)
  const [draft, setDraft] = useState<SwimmerLook | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('gender')
  const [busy, setBusy] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const deckRef = useRef<HTMLDivElement>(null)
  const slotRefs = useRef<(HTMLDivElement | null)[]>([])
  const liveHost = useRef<HTMLDivElement | null>(null)
  const [deckH, setDeckH] = useState(0)
  const [cw, setCw] = useState(320)

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

  // Make, dress and photograph each swimmer when the engine is ready or a look changes.
  const snapKeys = useRef(new Map<string, string>())
  useEffect(() => {
    if (!engine || engine === 'loading') return
    const next: Record<string, string> = {}
    for (const it of items) {
      // The swimmer being dressed shows the sheet's choices, not the saved look.
      if (draft && it.id === editing) continue
      const look = it.look ?? NEUTRAL
      const k = lookKey(look)
      const had = chars.current.get(it.id)
      const ch = had ? had.ch : engine.make(look)
      if (had && had.key !== k) engine.dress(ch, look)
      chars.current.set(it.id, { ch, key: k })
      if (snapKeys.current.get(it.id) !== k) { next[it.id] = engine.snapshot(ch); snapKeys.current.set(it.id, k) }
    }
    if (!Object.keys(next).length) return
    // Pictures go in on the next frame, not inside this effect's render pass.
    const f = requestAnimationFrame(() => setSnaps(s => ({ ...s, ...next })))
    return () => cancelAnimationFrame(f)
  }, [engine, items, draft, editing])

  // The live canvas follows the centre card.
  useLayoutEffect(() => {
    if (!engine || engine === 'loading') return
    const it = items[center]
    engine.attach(liveHost.current)
    engine.show(it ? chars.current.get(it.id)?.ch ?? null : null)
  }, [engine, center, items, snaps])

  // Dressing shows on the live swimmer straight away.
  useEffect(() => {
    if (!engine || engine === 'loading' || !draft) return
    const id = items[center]?.id
    const had = id ? chars.current.get(id) : undefined
    if (id && had) { engine.dress(had.ch, draft); chars.current.set(id, { ch: had.ch, key: lookKey(draft) }) }
  }, [engine, draft, items, center])

  // The deck's size: card width from the screen, height from the tallest card.
  useLayoutEffect(() => {
    const el = deckRef.current; if (!el) return
    const measure = () => {
      setCw(Math.min(340, el.clientWidth - 64))
      setDeckH(Math.max(0, ...slotRefs.current.map(s => s?.offsetHeight || 0)))
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el); slotRefs.current.forEach(s => s && ro.observe(s))
    return () => ro.disconnect()
  }, [items.length])

  /* ---------- swipe and spin ----------
     Owner, 2026-10-29: only a drag that starts ON the swimmer turns it;
     anywhere else on the card -- the pool, the sky, the card below -- swipes
     to the next card. The deck follows the finger 1:1 and, on release,
     settles with a spring that starts at the finger's speed, so there is no
     jolt between dragging and settling. One card per swipe. */
  const posRef = useRef(0)
  const anim = useRef(0)
  const place = useCallback(() => {
    const p = posRef.current
    slotRefs.current.forEach((el, i) => {
      if (!el) return
      const off = i - p, a = Math.abs(off)
      el.style.transform = `translate3d(${off * cw * 0.8 - cw / 2}px,0,${-a * 140}px) rotateY(${-off * 30}deg) scale(${1 - Math.min(a, 1.5) * 0.05})`
      el.style.zIndex = String(100 - Math.round(a * 10))
      el.style.opacity = String(a > 1.7 ? 0 : 1 - Math.max(0, a - 1) * 0.6)
      el.style.width = cw + 'px'
      const dim = el.lastElementChild as HTMLElement | null
      if (dim?.classList.contains('sw-dim')) dim.style.opacity = String(Math.min(a, 1) * 0.12)
    })
  }, [cw])
  // Every render lays the cards out again (new cards, a new width).
  useLayoutEffect(() => { place() })

  const settle = useCallback((target: number, v0 = 0) => {
    const n = items.length
    target = Math.max(0, Math.min(n - 1, target))
    setCenter(target)
    cancelAnimationFrame(anim.current)
    // A critically damped spring: no wobble, and it keeps the flick's speed.
    const k = 190, c = 2 * Math.sqrt(k)
    let v = Math.max(-9, Math.min(9, v0)), last = performance.now()
    const step = (now: number) => {
      const dt = Math.min(0.032, (now - last) / 1000); last = now
      const x = posRef.current
      v += (-k * (x - target) - c * v) * dt
      posRef.current = x + v * dt
      if (Math.abs(posRef.current - target) < 0.0015 && Math.abs(v) < 0.02) { posRef.current = target; place(); return }
      place()
      anim.current = requestAnimationFrame(step)
    }
    anim.current = requestAnimationFrame(step)
  }, [items.length, place])
  const goTo = settle
  useEffect(() => () => cancelAnimationFrame(anim.current), [])

  const drag = useRef<null | {
    mode: 'spin' | 'swipe'; x: number; y: number; last: number; t: number; v: number; start: number; slot: number; moved: boolean; id: number
    trail: { t: number; x: number }[]
  }>(null)
  // A drag must not end as a tap on whatever button is under the finger.
  const dragged = useRef(false)
  const onClickCapture = (e: React.MouseEvent) => {
    if (dragged.current) { e.stopPropagation(); e.preventDefault(); dragged.current = false }
  }
  const onDown = (e: React.PointerEvent) => {
    dragged.current = false
    const target = e.target as HTMLElement
    const slot = target.closest('.sw-slot') as HTMLElement | null
    if (!slot) return
    const i = slotRefs.current.indexOf(slot as HTMLDivElement)
    if (i === center && target.closest('button, a, input, select, textarea')) return
    const ready = engine && engine !== 'loading'
    // Turning is for the swimmer only: the finger has to land on the swimmer itself.
    const onSwimmer = ready && i === center && !!target.closest('.sw-stage') && !target.closest('.sw-ask')
      && Math.abs(posRef.current - center) < 0.05 && engine.hitSwimmer(e.clientX, e.clientY)
    cancelAnimationFrame(anim.current)
    const now = performance.now()
    drag.current = {
      mode: onSwimmer ? 'spin' : 'swipe', x: e.clientX, y: e.clientY, last: e.clientX, t: now, v: 0, start: posRef.current, slot: i,
      moved: false, id: e.pointerId, trail: [{ t: now, x: e.clientX }],
    }
  }
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d || e.pointerId !== d.id) return
    const dx = e.clientX - d.x, dy = e.clientY - d.y
    if (!d.moved) {
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return
      if (Math.abs(dy) > Math.abs(dx)) {   // the page is being scrolled
        drag.current = null
        if (d.mode === 'swipe' && Math.abs(posRef.current - Math.round(posRef.current)) > 0.001) settle(Math.round(posRef.current))
        return
      }
      d.moved = true
      deckRef.current?.setPointerCapture(e.pointerId)
      if (d.mode === 'spin' && engine && engine !== 'loading') engine.setDragging(true)
    }
    const now = performance.now(), ddx = e.clientX - d.last
    d.v = ddx / Math.max(1, now - d.t); d.last = e.clientX; d.t = now
    d.trail.push({ t: now, x: e.clientX }); while (d.trail.length > 2 && now - d.trail[0].t > 90) d.trail.shift()
    if (d.mode === 'spin' && engine && engine !== 'loading') { engine.spin(ddx); setHinted(true); return }
    if (items.length < 2) return
    // The card under the finger moves with it; past either end it gives, like a rubber band.
    let p = d.start - dx / (cw * 0.8)
    const max = items.length - 1
    if (p < 0) p = -Math.min(0.35, -p * 0.35)
    else if (p > max) p = max + Math.min(0.35, (p - max) * 0.35)
    posRef.current = p
    place()
  }
  const onUp = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d || e.pointerId !== d.id) return
    drag.current = null
    if (d.mode === 'spin' && engine && engine !== 'loading') { engine.setDragging(false); if (d.moved) engine.fling(d.v) }
    if (d.moved) dragged.current = true
    if (d.mode !== 'swipe') return
    if (!d.moved) { if (d.slot !== center) goTo(d.slot); else if (Math.abs(posRef.current - center) > 0.001) settle(center); return }
    // The finger's speed over its last ~90ms, in cards per second.
    const a = d.trail[0], b = d.trail[d.trail.length - 1]
    const pxPerMs = b.t > a.t ? (b.x - a.x) / (b.t - a.t) : 0
    const vCards = -pxPerMs * 1000 / (cw * 0.8)
    const from = Math.round(d.start)
    let to = Math.round(posRef.current)
    if (Math.abs(pxPerMs) > 0.25) to = from + (pxPerMs < 0 ? 1 : -1)   // a flick always moves one card
    settle(Math.max(from - 1, Math.min(from + 1, to)), vCards)
  }

  /* ---------- dressing ---------- */
  const say = (msg: string) => { setToast(msg); window.setTimeout(() => setToast(m => (m === msg ? null : m)), 1900) }
  const openSheet = () => {
    const it = items[center]; if (!it?.look) return
    setDraft({ ...it.look }); setEditing(it.id); setTab('gender')
    const el = deckRef.current
    if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 76, behavior: 'smooth' })
  }
  const closeSheet = async () => {
    const it = items[center]
    const d = draft
    setDraft(null)
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
      <div ref={deckRef} className="sw-deck" style={{ height: deckH || undefined }} aria-roledescription="carousel"
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onClickCapture={onClickCapture}>
        {items.map((it, i) => {
          const on = i === center
          const stage = (
            <div className="sw-stage">
              {on && ready ? <div className="sw-live" ref={liveHost} role="img" aria-label={t('swimmer.stageLabel', { name: it.name })} />
                : snaps[it.id] ? <img className="sw-snap" src={snaps[it.id]} alt={t('swimmer.stageLabel', { name: it.name })} />
                : <div className="sw-msg">{t('swimmer.loading')}</div>}
              {on && ready && it.look && (
                <button type="button" className="sw-dress tap-auto" onClick={openSheet}>{ICON_DRESS}{t('swimmer.dress')}</button>
              )}
              {on && ready && it.look && <span className="sw-hint" style={{ opacity: hinted ? 0 : 1 }}>⟲ {t('swimmer.hintOne')}</span>}
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
            <div key={it.id} ref={el => { slotRefs.current[i] = el }} className={'sw-slot' + (on ? ' on' : '')}
              role="group" aria-roledescription="slide" aria-label={it.name}>
              {renderCard(it, stage)}
              <div className="sw-dim" aria-hidden="true" />
            </div>
          )
        })}
      </div>
      {n > 1 && (
        <div className="sw-dots">
          {items.map((it, i) => (
            <button key={it.id} type="button" aria-label={it.name} aria-current={i === center} onClick={() => goTo(i)} />
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

