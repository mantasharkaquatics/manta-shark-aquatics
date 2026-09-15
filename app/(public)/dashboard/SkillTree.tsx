'use client'

/*
 * The whole curriculum as one picture, laid out the way a talent tree is: tiles
 * on a grid, one level at a time, with an arrow drawn for every prerequisite
 * that actually exists.
 *
 * The arrows are the point. The previous version wired consecutive nodes
 * together in reading order, which looked like a dependency graph and was not
 * one -- it implied that dryland kicking waited on bubble blowing because they
 * happened to sit next to each other. Every line here comes from a row in
 * skill_prerequisites, so what the picture says is what the curriculum says.
 *
 * Two audiences, one component. A coach gets the pass standard and the list of
 * prerequisites; a family does not. The standard is written in the coach's
 * terms for the person who has to apply it -- on a family's screen it turns a
 * map of where the swimmer is going into a checklist they are invited to grade
 * their own child against. `forCoach` is also why the criteria are not even
 * fetched for a parent: not shown has to mean not sent.
 */

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { ReactElement } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useLocale, useT } from '@/lib/i18n/provider'
import { tDb } from '@/lib/i18n'
import { LEVEL_COLORS, MAX_LEVEL, levelNameKey, stageNameKey } from '@/lib/levels'
import { masteryOf, masteryKey, MASTERY_COLOR, MASTERY_VALUE, PASS_LEVEL, UNLOCK_LEVEL } from '@/lib/mastery'
import { placeLevel, routeWires } from '@/lib/tree-layout'

const GOLD = '#c9a84c'

/* 'ready' is the state the stage model could not express: everything this skill
   needs is done, but it sits in a level the school has not reached yet. Saying
   "locked" there would be untrue -- the coach could teach it tomorrow -- and
   "open" would promise a lesson nobody has scheduled. Rescue-from-the-side is
   the clearest case: it needs no swimming at all, and it lives in Level 5. */
type NodeState = 'done' | 'active' | 'open' | 'ready' | 'locked'

type TreeSkill = {
  id: string
  name: string
  criteria: string
  level: number
  stage: number
  row: number
  col: number
  sort: number
  percent: number
  state: NodeState
  /** A checkpoint rather than a step: it sits in its own band with no lines.
      The prerequisites still exist and still gate it -- they are just not the
      thing the picture is about. */
  apart: boolean
}

type Props = {
  studentName: string
  currentLevel: number
  currentStage: number
  /** Every recorded value for this student, keyed by skill id, all levels. */
  percentBySkillId: Record<string, number>
  onClose: () => void
  /** Coaches see the pass standard and what each skill waits on. Families do not. */
  forCoach?: boolean
  /** Teaching notes, keyed by skill id, from docs/coaching-content.json. Only
      the admin curriculum page passes these; nobody else sees them. */
  notes?: Record<string, { teach: Record<string, string>; err: Record<string, string> }>
}

/* The five state marks, drawn rather than typed. They used to be characters --
   a star, a diamond, a ring, a padlock -- and a character is whatever font the
   browser finds it in: four glyphs from four different fallback fonts, each
   with its own size and its own idea of where the middle is, and a different
   answer again on a phone. These are the same four shapes as paths on one
   20x20 box, so every tile draws its mark at the same 13px and on the same
   centre line, in every browser. */
const MARK: Record<NodeState, ReactElement> = {
  done: (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path fill="currentColor" d="M10 3.2C10.7 7.6 12.4 9.3 16.8 10
        C12.4 10.7 10.7 12.4 10 16.8C9.3 12.4 7.6 10.7 3.2 10
        C7.6 9.3 9.3 7.6 10 3.2Z" />
    </svg>
  ),
  active: (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path fill="currentColor" d="M10 3.4 16.6 10 10 16.6 3.4 10Z" />
    </svg>
  ),
  open: (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <circle cx="10" cy="10" r="5.6" fill="none" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  ),
  /* Same ring, broken: the skill is reachable but not on the plan yet. */
  ready: (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <circle cx="10" cy="10" r="5.6" fill="none" stroke="currentColor" strokeWidth="1.8"
        strokeDasharray="2.3 2.5" strokeLinecap="round" />
    </svg>
  ),
  locked: (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <g fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round">
        <rect x="4.8" y="9.4" width="10.4" height="6.3" rx="1.5" />
        <path d="M7.5 9.4V6.8a2.5 2.5 0 0 1 5 0v2.6" strokeLinecap="round" />
      </g>
    </svg>
  ),
}

/* The checkpoint's own mark: a medal, not a step. Same 20x20 box as the state
   marks so it sits on the same centre line. */
const MEDAL = (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path fill="currentColor" d="M8.6 15.2 6 22.4l6-2.6 6 2.6-2.6-7.2" />
    <circle cx="12" cy="9" r="7" fill="none" stroke="currentColor" strokeWidth="1.7" />
    <path fill="currentColor" d="M12 4.9 13.4 7.8l3.2.5-2.3 2.2.5 3.2-2.8-1.5-2.8 1.5.5-3.2L7.4 8.3l3.2-.5z" />
  </svg>
)

const CSS = `
.mst-back { position: fixed; inset: 0; z-index: 1200; background: rgba(4,9,17,0.88);
  backdrop-filter: blur(3px); display: flex; align-items: stretch; justify-content: center }
.mst-panel { position: relative; width: 100%; max-width: 1180px; background: #0b1428;
  overflow-y: auto; -webkit-overflow-scrolling: touch;
  --cw: 112px; --rh: 116px; --sz: 52px; --rkb: 4px; --lane: 26px; --pad: 30px }
@media (min-width: 900px) { .mst-panel { margin: 24px; border-radius: 16px;
  border: 1px solid rgba(255,255,255,0.1) } }

.mst-head { position: sticky; top: 0; z-index: 5; background: #0b1428;
  border-bottom: 1px solid rgba(255,255,255,0.08); padding: 16px 20px 12px }
.mst-x { position: absolute; top: 12px; right: 14px; width: 34px; height: 34px; border: none;
  border-radius: 9px; background: rgba(255,255,255,0.07); color: rgba(255,255,255,0.75);
  font-size: 17px; cursor: pointer; line-height: 1 }
.mst-stats { display: flex; gap: 22px; flex-wrap: wrap; margin-top: 10px }
.mst-stat b { display: block; font-size: 19px; font-weight: 800; line-height: 1.1;
  font-variant-numeric: tabular-nums }
.mst-stat span { font-size: 10px; letter-spacing: .09em; color: rgba(255,255,255,0.4) }

.mst-tabs { display: flex; gap: 6px; overflow-x: auto; padding: 12px 20px 4px }
.mst-tab { flex: 0 0 auto; display: flex; flex-direction: column; align-items: flex-start;
  gap: 1px; background: #111d38; border: 1px solid #1e3a6e; border-radius: 10px;
  padding: 7px 13px; cursor: pointer; color: rgba(255,255,255,0.62); font: inherit;
  min-height: 48px }
.mst-tab b { font-size: 11px; letter-spacing: .09em; color: rgba(255,255,255,0.38);
  font-weight: 700 }
.mst-tab span { font-size: 13px; font-weight: 500; white-space: nowrap }
.mst-tab[aria-selected=true] { background: rgba(201,168,76,.12); border-color: ${GOLD};
  color: #fff }
.mst-tab[aria-selected=true] b { color: ${GOLD} }
.mst-tab:focus-visible { outline: 2px solid ${GOLD}; outline-offset: 2px }

.mst-meta { font-size: 11.5px; color: rgba(255,255,255,0.35); margin: 0; padding: 8px 20px 0 }
.mst-scroll { overflow-x: auto; margin: 8px 20px 0; background: #111d38;
  border: 1px solid #1e3a6e; border-radius: 13px; padding: 16px 14px 12px }
.mst-board { position: relative; margin: 0 auto;
  width: calc(var(--cols) * var(--cw) + 2 * var(--lane));
  height: calc(var(--pad) + (var(--rows) - 1) * var(--rh) + var(--sz) + 40px) }
.mst-wires { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none;
  overflow: visible }
.mst-w { fill: none; stroke: #25395f; stroke-width: 2 }
.mst-w.lit { stroke: rgba(201,168,76,.8) }

.mst-tile { position: absolute; width: var(--sz); height: var(--sz); border-radius: 10px;
  background: #16233f; border: 1px solid #1e3a6e; display: grid; place-items: center;
  padding: 0; cursor: pointer; color: rgba(255,255,255,0.35);
  font-size: 17px; line-height: 1;
  left: calc(var(--lane) + var(--c) * var(--cw) + (var(--cw) - var(--sz)) / 2);
  top: calc(var(--pad) + (var(--r) - 1) * var(--rh)) }
/* One pixel above the geometric centre, and the same one pixel on every tile:
   the percentage along the bottom pulls the eye down, so dead centre reads low.
   A pixel is also the smallest move a screen can actually make -- anything
   finer is rounding noise, and it comes out in whichever direction the
   rasteriser feels like. */
.mst-mk { display: block; width: 20px; height: 20px; transform: translateY(-1px) }
.mst-mk svg { display: block; width: 100%; height: 100% }
/* The number sits inside the tile, along the bottom, rather than in a badge hung
   off the corner: "100%" measures 30px at any readable size, which on a 44px
   phone tile overhung the skill name and reached into the next column. Taking it
   out of the flow leaves the mark on the tile's own centre, recorded or not. */
.mst-rk { position: absolute; left: 4px; right: 0; bottom: var(--rkb); text-align: center;
  font-size: 9.5px; font-weight: 700; font-style: normal; line-height: 1;
  font-variant-numeric: tabular-nums; letter-spacing: .02em; opacity: .82 }
.mst-nm { position: absolute; top: calc(var(--sz) + 6px); width: var(--cw);
  left: calc((var(--sz) - var(--cw)) / 2); font-size: 10.5px; line-height: 1.3;
  text-align: center; color: rgba(255,255,255,0.35); font-weight: 500 }
.mst-apart { position: absolute; left: 0; right: 0; height: 1px;
  background: linear-gradient(90deg, transparent, rgba(255,255,255,0.10) 20%,
    rgba(255,255,255,0.10) 80%, transparent);
  top: calc(var(--pad) + (var(--r) - 1) * var(--rh) - 24px) }

/* A checkpoint is not a step, so it is not drawn as one: a wide badge, its own
   band, a medal instead of a state mark. It is the thing a whole level was for,
   and on the board it should look like it. */
.mst-tile.apart { width: min(268px, 86%); height: 64px; left: 50%;
  transform: translateX(-50%); border-radius: 15px; padding: 0 16px;
  display: flex; align-items: center; gap: 13px; text-align: left;
  background: linear-gradient(135deg, #16233f 0%, #1b2b4d 52%, #16233f 100%);
  border: 1px solid #31497a }
.mst-tile.apart::after { content: ''; position: absolute; inset: 0; border-radius: 15px;
  background: linear-gradient(115deg, transparent 38%, rgba(255,255,255,.055) 50%,
    transparent 62%); pointer-events: none }
.mst-tile.apart .mst-mk { width: 26px; height: 26px; transform: none; flex: none }
.mst-tile.apart .mst-nm { position: static; width: auto; left: auto; top: auto;
  font-size: 13px; font-weight: 700; text-align: left; line-height: 1.25 }
.mst-tile.apart .mst-eb { font-size: 9px; letter-spacing: .16em; font-weight: 700;
  font-style: normal; opacity: .62; display: block; margin-bottom: 3px }
.mst-tile.apart .mst-rk { position: static; margin-left: auto; font-size: 11px;
  opacity: 1 }
.mst-tile.apart.done { border-color: #4caf72;
  background: linear-gradient(135deg, #112d1e 0%, #17382a 52%, #112d1e 100%);
  box-shadow: 0 0 22px rgba(76,175,114,.22) }
.mst-tile.apart.active { border-color: ${GOLD};
  box-shadow: 0 0 22px rgba(201,168,76,.26) }
.mst-tile.apart.locked { opacity: .5 }
.mst-tile:focus-visible { outline: 2px solid ${GOLD}; outline-offset: 3px }
.mst-tile.open { border-color: #31497a; background: #1a2a4a; color: #6d8cc0 }
.mst-tile.open .mst-nm { color: rgba(255,255,255,0.6) }
/* A dotted ring is mostly gaps, so it needs more contrast than a solid
   one to read at the same weight. */
.mst-tile.ready { border-color: #3a5487; border-style: dashed; color: rgba(255,255,255,0.68) }
.mst-tile.ready .mst-nm { color: rgba(255,255,255,0.5) }
.mst-tile.active { border-color: ${GOLD}; background: #262112; color: ${GOLD};
  box-shadow: 0 0 15px rgba(201,168,76,.32) }
.mst-tile.active .mst-nm { color: ${GOLD}; font-weight: 700 }
.mst-tile.done { border-color: #4caf72; background: #112d1e; color: #4caf72;
  box-shadow: 0 0 15px rgba(76,175,114,.28) }
.mst-tile.done .mst-nm { color: #4caf72; font-weight: 700 }
.mst-tile.locked { opacity: .58 }
.mst-tile[aria-current=true] { box-shadow: 0 0 0 2px #e9f0fb }

.mst-key { display: flex; flex-wrap: wrap; gap: 8px 16px; font-size: 11.5px;
  color: rgba(255,255,255,0.38); padding: 12px 20px 0 }
.mst-key span { display: inline-flex; align-items: center; gap: 6px }
.mst-key i { width: 8px; height: 8px; border-radius: 50%; background: currentColor; flex: none }

.mst-detail { margin: 14px 20px 26px; background: #111d38; border: 1px solid #1e3a6e;
  border-radius: 13px; padding: 14px 16px }
.mst-detail h3 { margin: 0; font-size: 15.5px; color: #fff }
.mst-detail .dm { font-size: 11.5px; color: rgba(255,255,255,0.38); margin: 3px 0 0 }
.mst-band { display: inline-block; margin-top: 9px; font-size: 11.5px; font-weight: 700;
  border-radius: 6px; padding: 2px 9px; border: 1px solid currentColor }
.mst-dt { font-size: 10px; letter-spacing: .1em; color: rgba(255,255,255,0.35);
  margin: 12px 0 4px }
.mst-dd { margin: 0; font-size: 12.5px; color: rgba(255,255,255,0.72); line-height: 1.7 }
.mst-pre { display: flex; flex-wrap: wrap; gap: 5px }
.mst-pre span { font-size: 11.5px; border-radius: 6px; padding: 2px 8px; background: #16233f;
  color: rgba(255,255,255,0.6) }
.mst-pre span.ok { background: #112d1e; color: #4caf72 }
.mst-pre span b { font-weight: 700; opacity: .65; margin-left: 4px; font-size: 10px }

@media (max-width: 640px) {
  .mst-panel { --cw: 88px; --rh: 108px; --sz: 44px; --rkb: 2px; --lane: 22px; --pad: 30px }
  .mst-rk { font-size: 9px }
  .mst-scroll { margin: 8px 14px 0; padding: 14px 10px 10px }
  .mst-tabs, .mst-meta, .mst-key { padding-left: 14px; padding-right: 14px }
  .mst-detail { margin: 14px 14px 26px; position: sticky; bottom: 0 }
  .mst-nm { font-size: 9.5px }
}
`

export default function SkillTree({
  studentName, currentLevel, currentStage, percentBySkillId, onClose, forCoach = false,
  notes,
}: Props) {
  const supabase = createClient()
  const locale = useLocale()
  const t = useT()

  const [skills, setSkills] = useState<TreeSkill[] | null>(null)
  const [needs, setNeeds] = useState<Record<string, string[]>>({})
  const [failed, setFailed] = useState(false)
  const [lv, setLv] = useState(Math.min(Math.max(1, currentLevel || 1), MAX_LEVEL))
  const [sel, setSel] = useState<TreeSkill | null>(null)
  const boardRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    let alive = true
    ;(async () => {
      const cols = forCoach
        ? 'id, name, pass_criteria, stage, sort_order, level_id, is_standalone'
        : 'id, name, stage, sort_order, level_id, is_standalone'
      const [{ data: levRows }, { data: skRows }, { data: preRows }] = await Promise.all([
        supabase.from('levels').select('id, level_number'),
        supabase.from('skills').select(cols).eq('is_active', true).order('sort_order'),
        supabase.from('skill_prerequisites').select('skill_id, requires_id'),
      ])
      if (!alive) return
      if (!levRows || !skRows) { setFailed(true); return }

      const levelOf: Record<string, number> = {}
      for (const l of levRows as any[]) levelOf[String(l.id)] = Number(l.level_number)

      const need: Record<string, string[]> = {}
      for (const r of (preRows || []) as any[]) {
        (need[String(r.skill_id)] ||= []).push(String(r.requires_id))
      }
      const ready = (id: string) =>
        (need[id] || []).every(q => masteryOf(percentBySkillId[q] ?? 0) >= UNLOCK_LEVEL)

      const built: TreeSkill[] = []
      for (const s of skRows as any[]) {
        const level = levelOf[String(s.level_id)]
        if (!level) continue
        const id = String(s.id)
        const rec = percentBySkillId[id]
        /* Two separate questions the stage model could only ask as one.
           CAN he start it -- are the prerequisites done?
           IS it scheduled -- has the school reached this level and stage? */
        const canStart = ready(id)
        const stage = Number(s.stage) || 1
        const scheduled = level < currentLevel || (level === currentLevel && stage <= currentStage)
        let percent = 0
        let state: NodeState
        if (rec != null && masteryOf(rec) > 0) {
          percent = clamp(rec)
          state = masteryOf(percent) >= PASS_LEVEL ? 'done' : 'active'
        } else if (level < currentLevel && rec == null) {
          percent = 100; state = 'done'          // promoted past it; the promotion is the record
        } else {
          percent = rec != null ? clamp(rec) : 0
          state = !canStart ? 'locked' : scheduled ? 'open' : 'ready'
        }
        built.push({
          id, name: String(s.name || ''), criteria: String((s as any).pass_criteria || ''),
          level, stage, row: 1, col: 0, sort: Number(s.sort_order) || 0, percent, state,
          apart: Boolean((s as any).is_standalone),
        })
      }

      /* Rows are the stages: 階段 1 on the top row, 階段 2 under it, 階段 3
         under that, level by level. The layout -- which column each skill
         takes -- and the lines both come out of lib/tree-layout. */
      for (let L = 1; L <= MAX_LEVEL; L++) {
        const inL = built.filter(b => b.level === L)
        if (!inL.length) continue
        const onBoard = inL.filter(b => !b.apart)
        const here = new Set(onBoard.map(b => b.id))
        const { rows: nRows, spots } = placeLevel(onBoard.map(b => ({
          id: b.id, stage: b.stage, sort: b.sort,
          needs: (need[b.id] || []).filter(q => here.has(q)),
        })))
        for (const b of onBoard) {
          const sp = spots[b.id]
          if (sp) { b.row = sp.row; b.col = sp.col }
        }
        /* The standalone ones get a band of their own under the last row. */
        const apart = inL.filter(b => b.apart).sort((a, b) => a.stage - b.stage || a.sort - b.sort)
        const width = Math.max(1, ...[1, 2, 3].map(st => onBoard.filter(b => b.stage === st).length))
        apart.forEach((b, i) => {
          b.row = nRows + 1
          b.col = (width - apart.length) / 2 + i
        })
      }

      built.sort((a, b) => a.level - b.level || a.row - b.row || a.col - b.col)
      setSkills(built); setNeeds(need)
    })()
    return () => { alive = false }
  }, [supabase, currentLevel, currentStage, percentBySkillId, forCoach])

  const inLv = useMemo(() => (skills || []).filter(s => s.level === lv), [skills, lv])
  /* Columns come from the widest stage, not from the highest column index:
     a short row is centred, so its columns are half-steps. */
  const cols = inLv.length
    ? Math.max(...[1, 2, 3].map(st => inLv.filter(s => s.stage === st && !s.apart).length)) : 1
  const rows = inLv.length ? Math.max(...inLv.map(s => s.row)) : 1
  const apartRow = inLv.some(s => s.apart) ? Math.max(...inLv.map(s => s.row)) : 0

  /* The wires are drawn from the geometry the CSS is actually using, so the
     phone's smaller grid needs no second set of numbers -- it changes --cw and
     --sz and this redraws against them. */
  useLayoutEffect(() => {
    const board = boardRef.current
    if (!board) return
    const draw = () => {
      const cs = getComputedStyle(board)
      const cw = parseFloat(cs.getPropertyValue('--cw'))
      const rh = parseFloat(cs.getPropertyValue('--rh'))
      const sz = parseFloat(cs.getPropertyValue('--sz'))
      if (!cw || !rh || !sz) return
      const svg = board.querySelector('svg')
      if (svg) svg.setAttribute('viewBox', `0 0 ${board.clientWidth} ${board.clientHeight}`)
      const lane = parseFloat(cs.getPropertyValue('--lane')) || 0
      const pad = parseFloat(cs.getPropertyValue('--pad')) || 0
      const spots = Object.fromEntries(inLv.map(s => [s.id, { row: s.row, col: s.col }]))
      const edges = inLv.filter(s => !s.apart).flatMap(s => (needs[s.id] || [])
        .filter(q => spots[q] && !inLv.find(x => x.id === q)?.apart)
        .map(q => ({ from: q, to: s.id })))
      const paths = routeWires(edges, spots, { cw, rh, sz, lane, pad, cols })
      for (const el of Array.from(board.querySelectorAll<SVGPathElement>('.mst-w'))) {
        el.setAttribute('d', paths[el.dataset.k || ''] || '')
      }
    }
    draw()
    const ro = new ResizeObserver(draw)
    ro.observe(board)
    window.addEventListener('resize', draw)
    return () => { ro.disconnect(); window.removeEventListener('resize', draw) }
  }, [inLv, needs, cols, rows])

  const total = skills?.length ?? 0
  const done = skills?.filter(s => s.state === 'done').length ?? 0
  const lvDone = inLv.filter(s => s.state === 'done').length
  const color = LEVEL_COLORS[String(lv)] || GOLD

  return (
    <div className="mst-back" role="dialog" aria-modal="true" aria-label={t('tree.title')}
      onClick={onClose}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="mst-panel" onClick={e => e.stopPropagation()}>
        <div className="mst-head">
          <button className="mst-x" onClick={onClose} aria-label={t('common.close')}>✕</button>
          <div style={{ fontSize: '10px', letterSpacing: '1.6px', textTransform: 'uppercase', color: GOLD }}>
            {t('tree.title')}
          </div>
          <div style={{ fontSize: '20px', fontWeight: 800, color: '#fff', marginTop: '2px' }}>
            {studentName}
          </div>
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
              <b style={{ color: GOLD }}>{done}
                <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.35)' }}>/{total || '—'}</span>
              </b>
              <span>{t('tree.stat.lit')}</span>
            </div>
            <div className="mst-stat">
              <b style={{ color: GOLD }}>{total ? Math.round((100 * done) / total) : 0}%</b>
              <span>{t('tree.stat.overall')}</span>
            </div>
          </div>
        </div>

        {failed && <p className="mst-meta" style={{ padding: '22px 20px' }}>{t('tree.loadFailed')}</p>}

        {skills && (
          <>
            <div className="mst-tabs" role="tablist">
              {Array.from({ length: MAX_LEVEL }, (_, i) => i + 1).map(n => (
                <button key={n} className="mst-tab" role="tab" aria-selected={n === lv}
                  onClick={() => { setLv(n); setSel(null) }}>
                  <b>L{n}</b><span>{t(levelNameKey(n))}</span>
                </button>
              ))}
            </div>

            <p className="mst-meta">
              {t('tree.levelMeta', { n: inLv.length })} · {t('tree.stat.lit')} {lvDone}
            </p>

            <div className="mst-scroll">
              <div className="mst-board" ref={boardRef}
                style={{ ['--cols' as any]: cols, ['--rows' as any]: rows }}>
                <svg className="mst-wires" preserveAspectRatio="none">
                  {inLv.filter(s => !s.apart).flatMap(s => (needs[s.id] || [])
                    .map(q => (skills || []).find(x => x.id === q))
                    .filter((q): q is TreeSkill => !!q && q.level === lv && !q.apart)
                    .map(q => (
                      <path key={q.id + '>' + s.id}
                        className={'mst-w' + (masteryOf(q.percent) >= UNLOCK_LEVEL ? ' lit' : '')}
                        data-k={`${q.id}>${s.id}`} />
                    )))}
                </svg>
                {apartRow > 0 && (
                  <div className="mst-apart" style={{ ['--r' as any]: apartRow + 1 }}>
                    <span>{t('tree.apart')}</span>
                  </div>
                )}
                {inLv.map(s => {
                  const band = masteryOf(s.percent)
                  return (
                    <button key={s.id} className={'mst-tile ' + s.state}
                      style={{ ['--c' as any]: s.col, ['--r' as any]: s.row }}
                      aria-current={sel?.id === s.id || undefined}
                      onClick={() => setSel(s)}
                      aria-label={tDb(locale, 'skills', s.id, s.name)}>
                      <span className="mst-mk">{s.apart ? MEDAL : MARK[s.state]}</span>
                      {s.apart
                        ? (
                          <span className="mst-nm">
                            <i className="mst-eb">{t('tree.apart')}</i>
                            {tDb(locale, 'skills', s.id, s.name)}
                          </span>
                        )
                        : <span className="mst-nm">{tDb(locale, 'skills', s.id, s.name)}</span>}
                      {band > 0 && <i className="mst-rk">{MASTERY_VALUE[band]}%</i>}
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="mst-key">
              <span><i style={{ color: '#4caf72' }} />{t('tree.state.done')}</span>
              <span><i style={{ color: GOLD }} />{t('tree.state.active')}</span>
              <span><i style={{ color: '#6d8cc0' }} />{t('tree.state.open')}</span>
              <span><i style={{ opacity: .6, boxShadow: 'inset 0 0 0 1px currentColor', background: 'transparent' }} />{t('tree.state.ready')}</span>
              <span><i style={{ opacity: .45 }} />{t('tree.state.locked')}</span>
            </div>

            <div className="mst-detail">
              {!sel && <p className="mst-dd" style={{ opacity: .6 }}>{t('tree.pickHint')}</p>}
              {sel && (
                <>
                  <h3>{tDb(locale, 'skills', sel.id, sel.name)}</h3>
                  <p className="dm">
                    {t(levelNameKey(sel.level))} · {t('dash.stageN', { n: sel.stage })} ·{' '}
                    {t(stageNameKey(sel.level, sel.stage))}
                  </p>
                  <span className="mst-band" style={{ color: MASTERY_COLOR[masteryOf(sel.percent)] }}>
                    {t(masteryKey(masteryOf(sel.percent)))}
                  </span>
                  {forCoach && (
                    <>
                      <p className="mst-dt">{t('tree.needs')}</p>
                      {(needs[sel.id] || []).length === 0
                        ? <p className="mst-dd">{t('tree.noNeeds')}</p>
                        : <div className="mst-pre">
                            {(needs[sel.id] || []).map(q => {
                              const r = (skills || []).find(x => x.id === q)
                              if (!r) return null
                              const ok = masteryOf(r.percent) >= UNLOCK_LEVEL
                              return (
                                <span key={q} className={ok ? 'ok' : ''}>
                                  {tDb(locale, 'skills', r.id, r.name)}
                                  {r.level !== sel.level && <b>L{r.level}</b>}
                                </span>
                              )
                            })}
                          </div>}
                      {notes?.[sel.id] && (notes[sel.id].teach[locale] || notes[sel.id].teach['zh-Hant']) && (
                        <>
                          <p className="mst-dt">{t('tree.teach')}</p>
                          <p className="mst-dd">
                            {notes[sel.id].teach[locale] || notes[sel.id].teach['zh-Hant']}
                          </p>
                          <p className="mst-dt">{t('tree.err')}</p>
                          <p className="mst-dd">
                            {notes[sel.id].err[locale] || notes[sel.id].err['zh-Hant']}
                          </p>
                        </>
                      )}
                      <p className="mst-dt">{t('tree.criteria')}</p>
                      <p className="mst-dd">
                        {sel.criteria
                          ? tDb(locale, 'skill_criteria', sel.id, sel.criteria)
                          : t('tree.noCriteria')}
                      </p>
                    </>
                  )}
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)))
