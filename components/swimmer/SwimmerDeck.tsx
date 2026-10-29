'use client'

/* The app's home (owner, 2026-10-29): every swimmer in the family stands in
   one little pool that turns like a turntable, and ONE student card under it
   shows whoever is in front (owner: "one turntable; turn it and the card
   below changes", after a first version with one swimmer per card).
   Dragging on the swimmer in front turns that swimmer; dragging elsewhere on
   the pool turns it to the next swimmer (components/swimmer/engine.ts). The
   name with ‹ › and the dots under the card do the same. 換造型 dresses the
   swimmer in front -- anyone in the family may, view-only members too.

   A swimmer with no look and no gender on file wears a cap and asks "a boy's
   or a girl's look?"; the answer is saved as the look only, never as the
   child's gender (owner, 2026-10-29: gender is optional).
   Without WebGL, or if the model will not load, the plain cards show
   instead (the website's swipe row). */

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useT } from '@/lib/i18n/provider'
import {
  GEAR_COLORS, HAIR_COLORS, SKINS, SUIT_COLORS, type SwimmerLook,
} from '@/lib/swimmer-look'
import type { Engine } from './engine'

export interface DeckItem { id: string; name: string; look: SwimmerLook | null }

/* What a swimmer with no gender yet looks like while the card asks: a swim
   cap hides the hair, so it is neither a boy nor a girl. */
const NEUTRAL: SwimmerLook = {
  gender: 'boy', skin: SKINS[1], hair: 'short', hairColor: HAIR_COLORS[0], suit: 'jammer', suitColor: SUIT_COLORS[1],
  goggles: 'forehead', goggleColor: GEAR_COLORS[0], cap: true, capColor: GEAR_COLORS[1], fins: false, finColor: GEAR_COLORS[3],
}
const lookKey = (l: SwimmerLook) => JSON.stringify(l)

const CSS = `
.sw-tt { position: relative; height: 340px; margin: 0 -20px; overflow: hidden; touch-action: pan-y; -webkit-user-select: none; user-select: none;
  background: radial-gradient(120% 90% at 50% 15%, #e9f6fd, #c3e4f5) }
.sw-name { position: absolute; left: 50%; bottom: 34px; transform: translateX(-50%); z-index: 3; display: inline-flex; align-items: center; gap: 8px;
  padding: 5px 8px; border-radius: 999px; background: rgba(18,37,74,.88); color: #fff; font-weight: 900; font-size: 15px; white-space: nowrap }
.sw-name span { padding: 0 6px }
.sw-name button { width: 32px; height: 32px; min-height: 32px; border: 0; border-radius: 50%; background: rgba(255,255,255,.16); color: #fff;
  font: inherit; font-size: 18px; cursor: pointer; display: grid; place-items: center; padding: 0 }
.sw-card { position: relative; z-index: 2; margin-top: -24px; animation: swIn .24s ease }
@keyframes swIn { from { opacity: 0; transform: translateY(10px) } }
.sw-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap }
.sw-msg { position: absolute; inset: 0; display: grid; place-items: center; font-size: 13px; font-weight: 700; color: #12254a }
.sw-dress { position: absolute; top: 12px; left: 12px; z-index: 3; display: inline-flex; align-items: center; gap: 6px; height: 36px;
  padding: 0 14px 0 11px; border: 0; border-radius: 999px; background: rgba(255,255,255,.94); color: #12254a; font: inherit;
  font-size: 14px; font-weight: 800; cursor: pointer; box-shadow: 0 4px 14px rgba(18,37,74,.16) }
.sw-dress svg { width: 18px; height: 18px }
.sw-hint { position: absolute; top: 18px; right: 12px; z-index: 3; font-size: 12px; font-weight: 700; color: #12254a;
  background: rgba(255,255,255,.8); border-radius: 999px; padding: 4px 10px; transition: opacity .4s; pointer-events: none }
.sw-ask { position: absolute; left: 12px; right: 12px; bottom: 80px; z-index: 3; background: rgba(255,255,255,.95); border-radius: 16px;
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
@media (prefers-reduced-motion: reduce) { .sw-card, .sw-sheet, .sw-scrim, .sw-dots button { transition: none !important } }
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
  /** The swimmer's card (the second argument is always null now: the swimmers stand on the pool above). */
  renderCard: (item: DeckItem, stage: React.ReactNode) => React.ReactNode
  /** A look the server has saved. */
  onLook: (id: string, look: SwimmerLook) => void
  /** What to show when the phone cannot draw 3D: the plain cards. */
  fallback: React.ReactNode
  /** Shown under the card and dots (the add-a-swimmer link); the fallback brings its own. */
  after?: React.ReactNode
}) {
  const t = useT()
  const [engine, setEngine] = useState<Engine | null | 'loading'>('loading')
  const [idx, setIdx] = useState(0)
  const [hinted, setHinted] = useState(false)
  const [draft, setDraft] = useState<SwimmerLook | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('gender')
  const [busy, setBusy] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const n = items.length
  const cur = items[Math.min(idx, Math.max(0, n - 1))]

  // Load three.js, the model and the pool once.
  useEffect(() => {
    let gone = false
    let made: Engine | null = null
    import('./engine')
      .then(m => m.createEngine({ onIndex: i => setIdx(i), onTouched: () => setHinted(true) }))
      .then(e => { made = e; if (gone) { e?.dispose(); return } setEngine(e) })
      .catch(err => { console.warn('[swimmer] 3D not available', err); if (!gone) setEngine(null) })
    return () => { gone = true; made?.dispose() }
  }, [])

  // The pool goes in the stage once both exist.
  useLayoutEffect(() => {
    if (!engine || engine === 'loading') return
    engine.attach(stageRef.current)
    return () => engine.attach(null)
  }, [engine])

  // Who stands on the pool, dressed as saved (or as the sheet has them now).
  useEffect(() => {
    if (!engine || engine === 'loading') return
    engine.setSwimmers(items.map(it => ({ id: it.id, look: draft && it.id === editing ? draft : it.look ?? NEUTRAL })))
  }, [engine, items, draft, editing])

  const go = (i: number) => { if (engine && engine !== 'loading') engine.goTo(((i % n) + n) % n) }

  /* ---------- dressing (the swimmer in front) ---------- */
  const say = (msg: string) => { setToast(msg); window.setTimeout(() => setToast(m => (m === msg ? null : m)), 1900) }
  const openSheet = () => {
    if (!cur?.look) return
    setDraft({ ...cur.look }); setEditing(cur.id); setTab('gender')
    const el = stageRef.current
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
    const nd = { ...d, [k]: v }
    if (k === 'gender') {
      nd.suit = v === 'girl' ? 'onepiece' : 'jammer'
      if (v === 'girl' && (nd.hair === 'short' || nd.hair === 'spiky')) nd.hair = 'ponytail'
      if (v === 'boy' && nd.hair !== 'short' && nd.hair !== 'spiky') nd.hair = 'short'
    }
    return nd
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
  if (engine === null || !cur) return <>{fallback}</>

  return (
    <>
      <style>{CSS}</style>
      <div ref={stageRef} className="sw-tt" aria-roledescription="carousel">
        <span className="sw-sr">{t('swimmer.stageLabel', { name: cur.name })}</span>
        {!ready && <div className="sw-msg">{t('swimmer.loading')}</div>}
        {ready && cur.look && (
          <button type="button" className="sw-dress tap-auto" onClick={openSheet}>{ICON_DRESS}{t('swimmer.dress')}</button>
        )}
        {ready && cur.look && <span className="sw-hint" style={{ opacity: hinted ? 0 : 1 }}>{t(n > 1 ? 'swimmer.hintPool' : 'swimmer.hintOne')}</span>}
        {ready && !cur.look && (
          <div className="sw-ask">
            <p>{t('swimmer.style.q', { name: cur.name })}</p>
            <div className="sw-ask-row">
              <button type="button" className="tap-auto" disabled={busy === cur.id} onClick={() => answer(cur, 'boy')}>{t('swimmer.style.boy')}</button>
              <button type="button" className="tap-auto" disabled={busy === cur.id} onClick={() => answer(cur, 'girl')}>{t('swimmer.style.girl')}</button>
            </div>
            <small>{t('swimmer.askHint', { name: cur.name })}</small>
          </div>
        )}
        <div className="sw-name">
          {n > 1 && <button type="button" className="tap-auto" aria-label={t('swimmer.prev')} onClick={() => go(idx - 1)}>‹</button>}
          <span>{cur.name}</span>
          {n > 1 && <button type="button" className="tap-auto" aria-label={t('swimmer.next')} onClick={() => go(idx + 1)}>›</button>}
        </div>
      </div>
      <div className="sw-card" key={cur.id}>{renderCard(cur, null)}</div>
      {n > 1 && (
        <div className="sw-dots">
          {items.map((it, i) => (
            <button key={it.id} type="button" aria-label={it.name} aria-current={i === idx} onClick={() => go(i)} />
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
