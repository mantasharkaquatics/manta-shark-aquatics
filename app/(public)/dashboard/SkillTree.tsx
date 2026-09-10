'use client'

/*
 * The whole curriculum as one picture.
 *
 * The dashboard card already answers "how is this stage going". What it cannot
 * answer is "where does this end, and how far along are we" -- for that a
 * parent has to hold seven levels in their head. This does it for them: all 82
 * skills, in teaching order, wired together, with everything already passed lit
 * up behind the swimmer and everything still locked ahead of them.
 *
 * Three rules keep it honest:
 *   - A level below the current one is complete, because finishing it is the
 *     only way to leave it. The approved history can lag; the fact does not.
 *   - Inside the current level the numbers are the real recorded percentages,
 *     including a stage the coach has already started ahead of schedule.
 *   - A level above the current one is locked. Nothing is scored there yet, so
 *     showing 0% would imply a judgement nobody has made.
 */

import { useEffect, useLayoutEffect, useRef, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useLocale, useT } from '@/lib/i18n/provider'
import { tDb } from '@/lib/i18n'
import { LEVEL_COLORS, MAX_LEVEL, STAGES, levelNameKey, stageNameKey } from '@/lib/levels'

const GOLD = '#c9a84c'

type NodeState = 'done' | 'active' | 'open' | 'locked'

type TreeSkill = {
  id: string
  name: string
  criteria: string
  level: number
  stage: number
  sort: number
  percent: number
  state: NodeState
}

type Props = {
  studentName: string
  currentLevel: number
  currentStage: number
  /** Live percent for the current level's skills, keyed by skill id. */
  percentBySkillId: Record<string, number>
  onClose: () => void
}

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)))

const GLYPH: Record<NodeState, string> = { done: '✦', active: '◆', open: '○', locked: '🔒' }

/* Inline styles beat media queries, and this needs to lay out differently on a
   phone, so everything width-dependent lives here as a class. */
const CSS = `
.mst-back { position: fixed; inset: 0; z-index: 1200; background: rgba(4,9,17,0.86);
  backdrop-filter: blur(3px); display: flex; align-items: stretch; justify-content: center }
.mst-panel { position: relative; width: 100%; max-width: 1180px; background: #0b1428;
  overflow-y: auto; -webkit-overflow-scrolling: touch }
@media (min-width: 900px) { .mst-panel { margin: 24px; border-radius: 16px;
  border: 1px solid rgba(255,255,255,0.1) } .mst-back { padding: 0 } }

.mst-head { position: sticky; top: 0; z-index: 3; background: #0b1428;
  border-bottom: 1px solid rgba(255,255,255,0.08); padding: 16px 20px 14px }
.mst-x { position: absolute; top: 12px; right: 14px; width: 34px; height: 34px; border: none;
  border-radius: 9px; background: rgba(255,255,255,0.07); color: rgba(255,255,255,0.75);
  font-size: 17px; cursor: pointer; line-height: 1 }
.mst-x:hover { background: rgba(255,255,255,0.14); color: #fff }
.mst-stats { display: flex; gap: 22px; flex-wrap: wrap; margin-top: 12px }
.mst-stat b { display: block; font-size: 19px; font-weight: 800; line-height: 1.2;
  font-variant-numeric: tabular-nums }
.mst-stat span { font-size: 10px; letter-spacing: 1.2px; text-transform: uppercase;
  color: rgba(255,255,255,0.38) }

.mst-body { padding: 18px 20px 64px }

.mst-band { position: relative; border: 1px solid rgba(255,255,255,0.09); border-radius: 14px;
  background: #12203c; padding: 14px 16px 18px; margin-top: 22px }
.mst-band:first-child { margin-top: 0 }
.mst-band.is-locked { opacity: 0.62 }
.mst-band::before { content: ""; position: absolute; left: 50%; top: -22px; width: 2px; height: 22px;
  background: rgba(255,255,255,0.12) }
.mst-band:first-child::before { display: none }

.mst-bh { position: relative; z-index: 2; display: flex; align-items: center; gap: 12px;
  width: 100%; text-align: left; background: none; border: none; padding: 0 0 12px;
  border-bottom: 1px solid rgba(255,255,255,0.08); margin-bottom: 14px; color: inherit }
.mst-band.is-folded .mst-bh { border-bottom: none; margin-bottom: 0; padding-bottom: 0 }
button.mst-bh { cursor: pointer }
button.mst-bh:focus-visible { outline: 2px solid ${GOLD}; outline-offset: 4px; border-radius: 8px }
.mst-band.is-folded .mst-stages { display: none }
.mst-num { width: 34px; height: 34px; flex: none; display: flex; align-items: center;
  justify-content: center; border-radius: 9px; font-size: 17px; font-weight: 800 }
.mst-bt { flex: 1; min-width: 0 }
.mst-bt h3 { margin: 0; font-size: 16px; font-weight: 700; line-height: 1.25; color: #fff }
.mst-bt span { font-size: 11px; color: rgba(255,255,255,0.4) }
.mst-bp { font-size: 12px; color: rgba(255,255,255,0.4); white-space: nowrap;
  font-variant-numeric: tabular-nums }
.mst-chev { font-size: 12px; color: rgba(255,255,255,0.4); flex: none }

.mst-wires { position: absolute; inset: 0; z-index: 0; pointer-events: none }
.mst-w { fill: none; stroke: rgba(255,255,255,0.09); stroke-width: 2;
  stroke-linecap: round; stroke-linejoin: round }

.mst-stages { display: flex; align-items: flex-start; gap: 18px }
.mst-stage { flex: 1 1 0; min-width: 0; border: 1px solid transparent; border-radius: 11px;
  padding: 8px 8px 12px }
.mst-sh { position: relative; z-index: 2; display: flex; align-items: baseline; gap: 8px;
  margin-bottom: 12px }
.mst-sh em { font-style: normal; font-size: 10px; font-weight: 700; letter-spacing: 1.1px;
  text-transform: uppercase; color: rgba(255,255,255,0.38) }
.mst-sh i { font-style: normal; font-size: 11px; margin-left: auto; color: rgba(255,255,255,0.35);
  font-variant-numeric: tabular-nums }

.mst-nodes { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr));
  align-items: start; gap: 24px 6px }
.mst-node { position: relative; z-index: 1; width: 100%; display: flex; flex-direction: column;
  align-items: center; gap: 6px; text-align: center; background: none; border: none;
  padding: 0; cursor: pointer; color: inherit }
.mst-node:focus-visible { outline: 2px solid ${GOLD}; outline-offset: 4px; border-radius: 8px }
.mst-ring { width: 50px; height: 56px; flex: none; display: flex; align-items: center;
  justify-content: center;
  clip-path: polygon(50% 0, 100% 25%, 100% 75%, 50% 100%, 0 75%, 0 25%) }
.mst-hex { width: 42px; height: 48px; display: flex; align-items: center; justify-content: center;
  clip-path: polygon(50% 0, 100% 25%, 100% 75%, 50% 100%, 0 75%, 0 25%) }
.mst-glyph { font-size: 15px; line-height: 1 }
.mst-label { width: 100%; font-size: 11px; font-weight: 600; line-height: 1.3;
  overflow-wrap: break-word }

@media (max-width: 860px) {
  .mst-stages { flex-direction: column; gap: 10px }
  .mst-stage { flex: 1 1 auto; width: 100% }
  .mst-nodes { gap: 22px 8px }
  .mst-label { font-size: 12.5px }
  .mst-body { padding: 14px 12px 64px }
  .mst-band { padding: 12px 12px 16px }
}

.mst-detail { position: fixed; left: 0; right: 0; bottom: 0; z-index: 1300; max-height: 62vh;
  overflow-y: auto; background: #12203c; border-top: 1px solid rgba(255,255,255,0.12);
  border-radius: 16px 16px 0 0; box-shadow: 0 -12px 44px rgba(0,0,0,0.5) }
/* The card is read against the node it describes, so the tree moves out from
   under it rather than being covered by it -- but only where there is width to
   give: a stage needs three hexes across, and below this the card would squeeze
   them out, so there it stays a bottom sheet. The wires redraw on the reflow. */
@media (min-width: 1280px) {
  .mst-detail { left: auto; right: 28px; bottom: 28px; width: 348px;
    border-radius: 14px; border: 1px solid rgba(255,255,255,0.12); max-height: 66vh }
  .mst-panel.has-detail { max-width: none }
  .mst-panel.has-detail .mst-body { padding-right: 384px }
}
`

export default function SkillTree({ studentName, currentLevel, currentStage, percentBySkillId, onClose }: Props) {
  const supabase = createClient()
  const locale = useLocale()
  const t = useT()

  const [skills, setSkills] = useState<TreeSkill[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [folded, setFolded] = useState<Set<number>>(new Set())
  const [sel, setSel] = useState<TreeSkill | null>(null)
  const bodyRef = useRef<HTMLDivElement | null>(null)

  /* ---- the curriculum, once ---- */
  useEffect(() => {
    let alive = true
    ;(async () => {
      const [{ data: levRows }, { data: skRows }] = await Promise.all([
        supabase.from('levels').select('id, level_number'),
        supabase.from('skills').select('id, name, pass_criteria, stage, sort_order, level_id')
          .eq('is_active', true).order('sort_order'),
      ])
      if (!alive) return
      if (!levRows || !skRows) { setFailed(true); return }
      const levelOf: Record<string, number> = {}
      for (const l of levRows as any[]) levelOf[String(l.id)] = Number(l.level_number)

      const built: TreeSkill[] = []
      for (const s of skRows as any[]) {
        const level = levelOf[String(s.level_id)]
        if (!level) continue
        const stage = Number(s.stage) || 1
        let percent: number
        let state: NodeState
        if (level < currentLevel) { percent = 100; state = 'done' }
        else if (level > currentLevel) { percent = 0; state = 'locked' }
        else if (stage < currentStage) { percent = 100; state = 'done' }
        else {
          percent = clamp(percentBySkillId[String(s.id)] ?? 0)
          state = percent >= 100 ? 'done' : percent > 0 ? 'active' : 'open'
        }
        built.push({
          id: String(s.id), name: String(s.name || ''),
          criteria: String(s.pass_criteria || ''),
          level, stage, sort: Number(s.sort_order) || 0, percent, state,
        })
      }
      built.sort((a, b) => a.level - b.level || a.stage - b.stage || a.sort - b.sort)
      setSkills(built)
      // A level that is entirely behind them opens folded: the page should
      // start on the water the swimmer is actually in.
      const done = new Set<number>()
      for (let lv = 1; lv <= MAX_LEVEL; lv++) {
        const inLv = built.filter(s => s.level === lv)
        if (inLv.length > 0 && inLv.every(s => s.percent >= 100)) done.add(lv)
      }
      setFolded(done)
    })().catch(() => { if (alive) setFailed(true) })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentLevel, currentStage])

  /* ---- escape closes, and the page behind stops scrolling ---- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (sel) setSel(null); else onClose()
    }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev }
  }, [onClose, sel])

  /* ---- the wires ----
     One path per consecutive pair of skills, stage boundaries included, so the
     line itself is the order the swimmer works through. They are drawn from
     measured hex positions rather than from the data, which is what lets the
     same routing serve the three-column desktop grid and the stacked phone
     layout; that also means React cannot own them, so the paths are written
     straight into the SVG after layout. */
  const draw = useCallback(() => {
    const root = bodyRef.current
    if (!root) return
    root.querySelectorAll<SVGSVGElement>('svg.mst-wires').forEach(svg => {
      while (svg.firstChild) svg.removeChild(svg.firstChild)
      const band = svg.parentElement
      if (!band || band.classList.contains('is-folded')) return
      const br = band.getBoundingClientRect()
      svg.setAttribute('width', String(br.width))
      svg.setAttribute('height', String(br.height))
      svg.setAttribute('viewBox', `0 0 ${br.width} ${br.height}`)
      const nodes = Array.from(band.querySelectorAll<HTMLElement>('.mst-node'))
      for (let i = 0; i < nodes.length - 1; i++) {
        const a = boxOf(nodes[i], br), b = boxOf(nodes[i + 1], br)
        if (!a || !b) continue
        const sa = nodes[i].closest('.mst-stage'), sb = nodes[i + 1].closest('.mst-stage')
        if (!sa || !sb) continue
        const ra = sa.getBoundingClientRect(), rb = sb.getBoundingClientRect()
        const env: Env = { cross: sa !== sb, rx: ra.right - br.left - 6 }
        if (sa !== sb) env.gx = (ra.right + rb.left) / 2 - br.left
        const from = Number(nodes[i].dataset.pct || 0), to = Number(nodes[i + 1].dataset.pct || 0)
        const p = document.createElementNS('http://www.w3.org/2000/svg', 'path')
        p.setAttribute('d', rounded(route(a, b, env), 9))
        p.setAttribute('class', 'mst-w')
        if (from >= 100) {
          const c = nodes[i].dataset.color || '#c9a84c'
          p.setAttribute('stroke', to >= 100 ? c : '#c9a84c')
          p.setAttribute('stroke-width', '2.5')
          if (to < 100) p.setAttribute('stroke-dasharray', '5 7')
        }
        svg.appendChild(p)
      }
    })
  }, [])

  useLayoutEffect(() => {
    draw()
    const root = bodyRef.current
    if (!root) return
    const ro = new ResizeObserver(() => draw())
    ro.observe(root)
    window.addEventListener('resize', draw)
    const f = (document as any).fonts
    if (f && f.ready) f.ready.then(draw).catch(() => {})
    return () => { ro.disconnect(); window.removeEventListener('resize', draw) }
  }, [draw, skills, folded, sel])

  const total = skills?.length ?? 0
  const done = skills?.filter(s => s.percent >= 100).length ?? 0

  return (
    <div className="mst-back" role="dialog" aria-modal="true" aria-label={t('tree.title')} onClick={onClose}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className={'mst-panel' + (sel ? ' has-detail' : '')} onClick={e => e.stopPropagation()}>
        <div className="mst-head">
          <button className="mst-x" onClick={onClose} aria-label={t('common.close')}>✕</button>
          <div style={{ fontSize: '10px', letterSpacing: '1.6px', textTransform: 'uppercase', color: GOLD }}>
            {t('tree.title')}
          </div>
          <div style={{ fontSize: '20px', fontWeight: 800, color: '#fff', marginTop: '2px' }}>{studentName}</div>
          <div className="mst-stats">
            <div className="mst-stat">
              <b style={{ color: LEVEL_COLORS[String(currentLevel)] || GOLD }}>{currentLevel}</b>
              <span>{t('tree.stat.level')}</span>
            </div>
            <div className="mst-stat">
              <b style={{ color: GOLD }}>{currentStage}</b>
              <span>{t('tree.stat.stage')}</span>
            </div>
            <div className="mst-stat">
              <b style={{ color: GOLD }}>{done}<span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.35)' }}>/{total || '—'}</span></b>
              <span>{t('tree.stat.lit')}</span>
            </div>
            <div className="mst-stat">
              <b style={{ color: GOLD }}>{total ? Math.round((100 * done) / total) : 0}%</b>
              <span>{t('tree.stat.overall')}</span>
            </div>
          </div>
        </div>

        <div className="mst-body" ref={bodyRef}>
          {skills === null && !failed && (
            <div style={{ padding: '40px 0', textAlign: 'center', color: 'rgba(255,255,255,0.4)', fontSize: '13px' }}>
              {t('common.loading')}
            </div>
          )}
          {failed && (
            <div style={{ padding: '40px 0', textAlign: 'center', color: 'rgba(255,255,255,0.5)', fontSize: '13px' }}>
              {t('tree.loadFailed')}
            </div>
          )}
          {skills !== null && !failed && Array.from({ length: MAX_LEVEL }, (_, i) => i + 1).map(lv => {
            const inLv = skills.filter(s => s.level === lv)
            if (inLv.length === 0) return null
            const color = LEVEL_COLORS[String(lv)] || GOLD
            const lvDone = inLv.filter(s => s.percent >= 100).length
            const full = lvDone === inLv.length
            const isFolded = folded.has(lv)
            const HeadTag: any = full ? 'button' : 'div'
            return (
              <section key={lv} className={
                'mst-band' + (isFolded ? ' is-folded' : '') + (lv > currentLevel ? ' is-locked' : '')
              } style={lv === currentLevel ? { borderColor: color, boxShadow: `0 0 0 1px ${color}55` } : undefined}>
                <svg className="mst-wires" aria-hidden="true" />
                <HeadTag
                  className="mst-bh"
                  {...(full ? {
                    'aria-expanded': !isFolded,
                    onClick: () => setFolded(prev => {
                      const next = new Set(prev)
                      if (next.has(lv)) next.delete(lv); else next.add(lv)
                      return next
                    }),
                  } : {})}
                >
                  <div className="mst-num" style={{ color, border: `1px solid ${color}`, background: `${color}22` }}>{lv}</div>
                  <div className="mst-bt">
                    <h3>{t(levelNameKey(lv))}</h3>
                    <span>{t('tree.levelMeta', { n: inLv.length })}</span>
                  </div>
                  <div className="mst-bp"><b style={{ color, fontSize: '15px' }}>{lvDone}</b>/{inLv.length}</div>
                  {full && <div className="mst-chev">{isFolded ? '▾' : '▴'}</div>}
                </HeadTag>
                <div className="mst-stages">
                  {STAGES.map(st => {
                    const rows = inLv.filter(s => s.stage === st)
                    const stDone = rows.filter(s => s.percent >= 100).length
                    const isNow = lv === currentLevel && st === currentStage
                    return (
                      <div key={st} className="mst-stage"
                        style={isNow ? { borderColor: `${GOLD}70`, background: 'rgba(201,168,76,0.06)' } : undefined}>
                        <div className="mst-sh">
                          <em style={isNow ? { color: GOLD } : undefined}>{t('dash.stageN', { n: st })}</em>
                          <i>{stDone}/{rows.length}</i>
                        </div>
                        <div className="mst-nodes">
                          {rows.map(sk => {
                            const skin = nodeSkin(sk, color)
                            return (
                              <button key={sk.id} className="mst-node" data-pct={sk.percent} data-color={color}
                                onClick={() => setSel(sk)}
                                aria-label={tDb(locale, 'skills', sk.id, sk.name)}>
                                <span className="mst-ring" style={skin.ring}>
                                  <span className="mst-hex" style={{ background: skin.hex }}>
                                    <span className="mst-glyph" style={{ color: skin.glyph }}>{GLYPH[sk.state]}</span>
                                  </span>
                                </span>
                                <span className="mst-label" style={{ color: skin.label }}>
                                  {tDb(locale, 'skills', sk.id, sk.name)}
                                </span>
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </section>
            )
          })}
        </div>
      </div>

      {sel && (
        <aside className="mst-detail" onClick={e => e.stopPropagation()} aria-live="polite">
          <div style={{ padding: '18px 20px 22px', position: 'relative' }}>
            <button className="mst-x" style={{ top: '10px', right: '12px' }} onClick={() => setSel(null)} aria-label={t('common.close')}>✕</button>
            <span style={{
              display: 'inline-block', fontSize: '10px', letterSpacing: '1.2px', textTransform: 'uppercase',
              padding: '3px 9px', borderRadius: '20px', color: LEVEL_COLORS[String(sel.level)] || GOLD,
              border: `1px solid ${LEVEL_COLORS[String(sel.level)] || GOLD}`,
              background: `${LEVEL_COLORS[String(sel.level)] || GOLD}18`,
            }}>
              {t('level.badge', { n: sel.level, name: t(levelNameKey(sel.level)) })}
            </span>
            <h4 style={{ margin: '12px 0 2px', fontSize: '18px', fontWeight: 800, color: '#fff', lineHeight: 1.3 }}>
              {tDb(locale, 'skills', sel.id, sel.name)}
            </h4>
            <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.45)', marginBottom: '14px' }}>
              {t('dash.stageN', { n: sel.stage })} · {t(stageNameKey(sel.level, sel.stage))} · {t(`tree.state.${sel.state}`)} · {sel.percent}%
            </div>
            <div style={{ height: '6px', borderRadius: '3px', background: 'rgba(255,255,255,0.1)', overflow: 'hidden', marginBottom: '16px' }}>
              <div style={{ height: '100%', width: sel.percent + '%', borderRadius: '3px', background: sel.percent >= 100 ? '#4caf72' : GOLD }} />
            </div>
            <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '1.2px', textTransform: 'uppercase', color: '#7fd6a2', marginBottom: '5px' }}>
              {t('tree.criteria')}
            </div>
            <p style={{ margin: 0, fontSize: '13.5px', lineHeight: 1.75, color: sel.criteria ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.4)' }}>
              {sel.criteria || t('tree.noCriteria')}
            </p>
          </div>
        </aside>
      )}
    </div>
  )
}

function nodeSkin(sk: TreeSkill, color: string) {
  if (sk.state === 'done') return {
    ring: { background: color, boxShadow: `0 0 16px ${color}70` },
    hex: `color-mix(in srgb, ${color} 22%, #0a1526)`, glyph: color, label: '#fff',
  }
  if (sk.state === 'active') return {
    ring: { background: `conic-gradient(${GOLD} ${sk.percent}%, #28354f 0)`, boxShadow: `0 0 18px ${GOLD}55` },
    hex: '#0d1730', glyph: GOLD, label: GOLD,
  }
  if (sk.state === 'open') return {
    ring: { background: `color-mix(in srgb, ${color} 42%, #28354f)` },
    hex: '#0a1526', glyph: 'rgba(255,255,255,0.6)', label: 'rgba(255,255,255,0.62)',
  }
  return {
    ring: { background: '#16223a' },
    hex: '#0a1526', glyph: 'rgba(255,255,255,0.35)', label: 'rgba(255,255,255,0.32)',
  }
}

/* ---- orthogonal routing, from measured boxes ---- */
type Box = { l: number; r: number; t: number; b: number; cx: number; cy: number }
type Env = { cross: boolean; rx: number; gx?: number }

function boxOf(node: HTMLElement, br: DOMRect): Box | null {
  const ring = node.querySelector('.mst-ring')
  if (!ring) return null
  const r = ring.getBoundingClientRect()
  return {
    l: r.left - br.left, r: r.right - br.left, t: r.top - br.top, b: r.bottom - br.top,
    cx: (r.left + r.right) / 2 - br.left, cy: (r.top + r.bottom) / 2 - br.top,
  }
}

function route(a: Box, b: Box, env: Env): [number, number][] {
  const dx = b.cx - a.cx, dy = b.cy - a.cy
  if (Math.abs(dy) < 6 && dx > 0) return [[a.r, a.cy], [b.l, b.cy]]
  if (Math.abs(dx) < 6 && dy > 0) {
    if (!env.cross) return [[a.cx, a.b], [b.cx, b.t]]
    // stages stacked: step aside so the drop misses the next stage's heading
    const x = a.r + 14, lane = b.t - 13
    return [[a.cx, a.b], [a.cx, a.b + 12], [x, a.b + 12], [x, lane], [b.cx, lane], [b.cx, b.t]]
  }
  if (dx < 0 && dy > 0) {                       // the row wrapped: carriage return
    const lane = b.t - 13
    const x = Math.max(a.r + 6, Math.min(a.r + 10, env.rx))
    return [[a.r, a.cy], [x, a.cy], [x, lane], [b.cx, lane], [b.cx, b.t]]
  }
  // on to the next stage: turn in the gutter between the two stage boxes
  const mx = env.gx != null ? env.gx : (a.r + b.l) / 2
  return [[a.r, a.cy], [mx, a.cy], [mx, b.cy], [b.l, b.cy]]
}

function rounded(pts: [number, number][], r: number): string {
  let d = `M ${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`
  for (let i = 1; i < pts.length - 1; i++) {
    const [px, py] = pts[i - 1], [cx, cy] = pts[i], [nx, ny] = pts[i + 1]
    const d1 = Math.hypot(cx - px, cy - py), d2 = Math.hypot(nx - cx, ny - cy)
    if (d1 < 1 || d2 < 1) continue
    const rr = Math.min(r, d1 / 2, d2 / 2)
    d += ` L ${(cx + ((px - cx) / d1) * rr).toFixed(1)} ${(cy + ((py - cy) / d1) * rr).toFixed(1)}`
      + ` Q ${cx.toFixed(1)} ${cy.toFixed(1)}`
      + ` ${(cx + ((nx - cx) / d2) * rr).toFixed(1)} ${(cy + ((ny - cy) / d2) * rr).toFixed(1)}`
  }
  const e = pts[pts.length - 1]
  return d + ` L ${e[0].toFixed(1)} ${e[1].toFixed(1)}`
}
