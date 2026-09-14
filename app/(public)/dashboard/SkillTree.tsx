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

const CSS = `
.mst-back { position: fixed; inset: 0; z-index: 1200; background: rgba(4,9,17,0.88);
  backdrop-filter: blur(3px); display: flex; align-items: stretch; justify-content: center }
.mst-panel { position: relative; width: 100%; max-width: 1180px; background: #0b1428;
  overflow-y: auto; -webkit-overflow-scrolling: touch;
  --cw: 112px; --rh: 116px; --sz: 52px; --rkb: 4px }
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
  width: calc(var(--cols) * var(--cw));
  height: calc((var(--rows) - 1) * var(--rh) + var(--sz) + 40px) }
.mst-wires { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none;
  overflow: visible }
.mst-w { fill: none; stroke: #25395f; stroke-width: 2 }
.mst-w.lit { stroke: rgba(201,168,76,.8) }

.mst-tile { position: absolute; width: var(--sz); height: var(--sz); border-radius: 10px;
  background: #16233f; border: 1px solid #1e3a6e; display: grid; place-items: center;
  padding: 0; cursor: pointer; color: rgba(255,255,255,0.35);
  font-size: 17px; line-height: 1;
  left: calc(var(--c) * var(--cw) + (var(--cw) - var(--sz)) / 2);
  top: calc((var(--r) - 1) * var(--rh)) }
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
.mst-rk { position: absolute; left: 0; right: 0; bottom: var(--rkb); text-align: center;
  transform: translateX(1px);
  font-size: 9.5px; font-weight: 700; font-style: normal; line-height: 1;
  font-variant-numeric: tabular-nums; letter-spacing: .02em; opacity: .82 }
.mst-nm { position: absolute; top: calc(var(--sz) + 6px); width: var(--cw);
  left: calc((var(--sz) - var(--cw)) / 2); font-size: 10.5px; line-height: 1.3;
  text-align: center; color: rgba(255,255,255,0.35); font-weight: 500 }
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
  .mst-panel { --cw: 88px; --rh: 108px; --sz: 44px; --rkb: 2px }
  .mst-rk { font-size: 9px }
  .mst-scroll { margin: 8px 14px 0; padding: 14px 10px 10px }
  .mst-tabs, .mst-meta, .mst-key { padding-left: 14px; padding-right: 14px }
  .mst-detail { margin: 14px 14px 26px; position: sticky; bottom: 0 }
  .mst-nm { font-size: 9.5px }
}
`

export default function SkillTree({
  studentName, currentLevel, currentStage, percentBySkillId, onClose, forCoach = false,
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
        ? 'id, name, pass_criteria, stage, sort_order, level_id'
        : 'id, name, stage, sort_order, level_id'
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
        })
      }

      /* A skill's row is one past the deepest thing it needs FROM THE SAME
         LEVEL; prerequisites from an earlier level do not push it down, because
         by the time a swimmer is working this level those are behind them. */
      const byId = new Map(built.map(b => [b.id, b]))
      const memo: Record<string, number> = {}
      const rowOf = (id: string, seen = new Set<string>()): number => {
        if (memo[id]) return memo[id]
        if (seen.has(id)) return 1                 // a cycle cannot happen; do not hang on one
        seen.add(id)
        const me = byId.get(id)
        const same = (need[id] || []).filter(q => byId.get(q)?.level === me?.level)
        return memo[id] = same.length ? 1 + Math.max(...same.map(q => rowOf(q, seen))) : 1
      }
      for (const b of built) b.row = rowOf(b.id)

      /* Columns: a skill takes its first same-level prerequisite's column when
         that column is free, so a chain reads as one line straight down. */
      for (let L = 1; L <= MAX_LEVEL; L++) {
        const inL = built.filter(b => b.level === L)
        const maxRow = inL.length ? Math.max(...inL.map(b => b.row)) : 0
        for (let r = 1; r <= maxRow; r++) {
          const taken = new Set<number>()
          for (const b of inL.filter(x => x.row === r)
            .sort((x, y) => x.stage - y.stage || x.sort - y.sort)) {
            const par = (need[b.id] || []).map(q => byId.get(q)).find(q => q?.level === L)
            let c = par && !taken.has(par.col) ? par.col : 0
            while (taken.has(c)) c++
            taken.add(c); b.col = c
          }
        }
      }

      built.sort((a, b) => a.level - b.level || a.row - b.row || a.col - b.col)
      setSkills(built); setNeeds(need)
    })()
    return () => { alive = false }
  }, [supabase, currentLevel, currentStage, percentBySkillId, forCoach])

  const inLv = useMemo(() => (skills || []).filter(s => s.level === lv), [skills, lv])
  const cols = inLv.length ? Math.max(...inLv.map(s => s.col)) + 1 : 1
  const rows = inLv.length ? Math.max(...inLv.map(s => s.row)) : 1

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
      for (const el of Array.from(board.querySelectorAll<SVGPathElement>('.mst-w'))) {
        const [c1, r1] = (el.dataset.from || '0,1').split(',').map(Number)
        const [c2, r2] = (el.dataset.to || '0,1').split(',').map(Number)
        const px = (c: number) => c * cw + cw / 2
        const py = (r: number) => (r - 1) * rh + sz / 2
        const x1 = px(c1), y1 = py(r1) + sz / 2 + 2
        const x2 = px(c2), y2 = py(r2) - sz / 2 - 4
        /* The horizontal leg runs in the channel between one row's names and
           the next row's tiles. Placing it part-way down put it through the
           middle of the text. */
        const mid = py(r2) - sz / 2 - 20
        el.setAttribute('d', Math.abs(x1 - x2) < 2
          ? `M${x1} ${y1} L${x2} ${y2}`
          : `M${x1} ${y1} L${x1} ${mid} L${x2} ${mid} L${x2} ${y2}`)
      }
    }
    draw()
    const ro = new ResizeObserver(draw)
    ro.observe(board)
    window.addEventListener('resize', draw)
    return () => { ro.disconnect(); window.removeEventListener('resize', draw) }
  }, [inLv, cols, rows])

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
                  {inLv.flatMap(s => (needs[s.id] || [])
                    .map(q => (skills || []).find(x => x.id === q))
                    .filter((q): q is TreeSkill => !!q && q.level === lv)
                    .map(q => (
                      <path key={q.id + '>' + s.id}
                        className={'mst-w' + (masteryOf(q.percent) >= UNLOCK_LEVEL ? ' lit' : '')}
                        data-from={`${q.col},${q.row}`} data-to={`${s.col},${s.row}`} />
                    )))}
                </svg>
                {inLv.map(s => {
                  const band = masteryOf(s.percent)
                  return (
                    <button key={s.id} className={'mst-tile ' + s.state}
                      style={{ ['--c' as any]: s.col, ['--r' as any]: s.row }}
                      aria-current={sel?.id === s.id || undefined}
                      onClick={() => setSel(s)}
                      aria-label={tDb(locale, 'skills', s.id, s.name)}>
                      <span className="mst-mk">{MARK[s.state]}</span>
                      {band > 0 && <i className="mst-rk">{MASTERY_VALUE[band]}%</i>}
                      <span className="mst-nm">{tDb(locale, 'skills', s.id, s.name)}</span>
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
