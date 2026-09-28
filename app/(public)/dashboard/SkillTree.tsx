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
import { stageEarned } from '@/lib/ribbons'
import StageRibbon from '@/components/StageRibbon'

const GOLD = '#c9a84c'
/* Amber that reads as text on white (the brand amber #f09800 is for fills). */
const AMBER_TXT = '#c97d00'

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
  /** skills.col_override -- a column the owner pinned by hand, overriding what
      the prerequisites would have chosen. Null for almost every skill. */
  pin: number | null
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
  /** The programme, not a person: every skill draws as passed and
      percentBySkillId is ignored. The admin curriculum page used to do this by
      handing in a map of 100s it had built from its own copy of the skill list,
      which drifted the moment a skill was added -- the new ones came back
      unpassed on a page whose whole point is that everything is passed. The
      count now comes from the same query that draws the tiles. */
  allPassed?: boolean
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
/* Light, on the same palette as the Dashboard it opens from (owner's choice,
   2026-09-28): white panel, the three stages as alternating paper and white
   bands, amber = in progress, solid green = passed, blue ring = can start.
   The old navy version tinted each band with the level's ribbon colour, which
   on Level 1 turned the whole board a muddy red. */
.mst-back { position: fixed; inset: 0; z-index: 1200; background: rgba(18,37,74,0.55);
  backdrop-filter: blur(3px); display: flex; align-items: stretch; justify-content: center }
.mst-panel { position: relative; width: 100%; max-width: 1180px; background: #fff; color: #16294a;
  overflow-y: auto; -webkit-overflow-scrolling: touch;
  --cw: 112px; --rh: 132px; --sz: 52px; --rkb: 4px; --lane: 26px; --pad: 30px;
  --rail: 150px; --sp: 16px; --hd: 0px }
@media (min-width: 900px) { .mst-panel { margin: 24px; border-radius: 16px;
  border: 1px solid #e3ebf6; box-shadow: 0 30px 70px rgba(10,22,48,.35) } }

.mst-head { position: sticky; top: 0; z-index: 5; background: #fff;
  border-bottom: 1px solid #e3ebf6; padding: 16px 20px 12px }
.mst-x { position: absolute; top: 12px; right: 14px; width: 34px; height: 34px; border: none;
  border-radius: 9px; background: #eef3f9; color: #56647d;
  font-size: 17px; cursor: pointer; line-height: 1 }
.mst-stats { display: flex; gap: 22px; flex-wrap: wrap; margin-top: 10px }
.mst-stat b { display: block; font-size: 19px; font-weight: 800; line-height: 1.1;
  font-variant-numeric: tabular-nums }
.mst-stat span { font-size: 10px; letter-spacing: .06em; color: #56647d }

.mst-tabs { display: flex; gap: 6px; overflow-x: auto; padding: 12px 20px 4px }
.mst-tab { flex: 0 0 auto; display: flex; flex-direction: column; align-items: flex-start;
  gap: 1px; background: #fff; border: 1px solid #d3deec; border-radius: 10px;
  padding: 7px 13px; cursor: pointer; color: #16294a; font: inherit; min-height: 48px }
.mst-tab b { font-size: 11px; letter-spacing: .09em; color: #8794ab; font-weight: 700 }
.mst-tab span { font-size: 13px; font-weight: 600; white-space: nowrap }
.mst-tab[aria-selected=true] { background: #12254a; border-color: #12254a; color: #fff }
.mst-tab[aria-selected=true] b { color: #f7b733 }
.mst-tab:focus-visible { outline: 2px solid #2050a0; outline-offset: 2px }

.mst-meta { font-size: 11.5px; color: #56647d; margin: 0; padding: 8px 20px 0 }
/* Fixed: the board is sized to fit the box (see fit() below), so there is
   nothing to drag sideways. It used to scroll -- the bands were wider than the
   box by design, and on a phone the whole board was. */
.mst-scroll { position: relative; overflow: hidden; margin: 8px 20px 0; background: #fff;
  border: 1px solid #e3ebf6; border-radius: 13px;
  padding: var(--sp) 14px 12px calc(14px + var(--rail)) }
.mst-board { position: relative; z-index: 1; margin: 0 auto;
  width: calc(var(--cols) * var(--cw) + 2 * var(--lane));
  height: calc(var(--pad) + (var(--rows) - 1) * var(--rh) + var(--sz) + 40px) }
.mst-wires { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none;
  overflow: visible }
.mst-w { fill: none; stroke: #c9d8ee; stroke-width: 2 }
.mst-w.lit { stroke: #f09800 }

.mst-tile { position: absolute; width: var(--sz); height: var(--sz); border-radius: 12px;
  background: #fff; border: 1.5px solid #c9d8ee; display: grid; place-items: center;
  padding: 0; cursor: pointer; color: #b3bdcc;
  font-size: 17px; line-height: 1;
  left: calc(var(--lane) + var(--c) * var(--cw) + (var(--cw) - var(--sz)) / 2);
  top: calc(var(--pad) + (var(--r) - 1) * var(--rh)) }
/* One pixel above the geometric centre, and the same one pixel on every tile:
   the percentage along the bottom pulls the eye down, so dead centre reads low. */
.mst-mk { display: block; width: 20px; height: 20px; transform: translateY(-1px) }
.mst-mk svg { display: block; width: 100%; height: 100% }
/* The number sits inside the tile, along the bottom, rather than in a badge hung
   off the corner, so it never reaches into the next column on a phone. */
.mst-rk { position: absolute; left: 4px; right: 0; bottom: var(--rkb); text-align: center;
  font-size: 9.5px; font-weight: 800; font-style: normal; line-height: 1;
  font-variant-numeric: tabular-nums; letter-spacing: .02em }
.mst-nm { position: absolute; top: calc(var(--sz) + 6px); width: calc(var(--cw) - 6px);
  left: calc((var(--sz) - var(--cw)) / 2 + 3px); font-size: 11px; line-height: 1.3;
  text-align: center; color: #b3bdcc; font-weight: 600 }
/* The three stages, as three bands behind the board, alternating paper and
   white so each row reads as its own layer without any colour competing with
   the tiles. */
.mst-stripe { position: absolute; left: 0; width: 100%; z-index: 0;
  top: var(--bt); height: var(--bh); background: #f6f9fd }
.mst-stripe.even { background: #fff; border-top: 1px solid #e9eff7; border-bottom: 1px solid #e9eff7 }

/* Each stage's ribbon and name sit at the left end of its own band, level with
   its row of tiles. The box keeps a --rail-wide gutter for them. On a phone
   they move to the top of the band instead (see the media query), so the
   board gets the whole width. */
.mst-rail { position: absolute; z-index: 1; width: calc(var(--rail) - 6px);
  left: max(12px, calc(14px + (100% - 28px - var(--rail)
    - var(--cols) * var(--cw) - 2 * var(--lane)) / 2));
  top: calc(var(--sp) + var(--pad) + (var(--r) - 1) * var(--rh) + var(--sz) / 2);
  transform: translateY(-50%);
  display: flex; align-items: center; gap: 8px; font-size: 10px;
  color: #8794ab; line-height: 1.35 }
.mst-rail b { display: block; font-size: 12px; font-weight: 800; max-width: 104px; color: #12254a }
.mst-rail svg { display: block; flex-shrink: 0 }

.mst-apart { position: absolute; left: 0; right: 0; height: 1px;
  background: linear-gradient(90deg, transparent, #e3ebf6 20%, #e3ebf6 80%, transparent);
  top: calc(var(--pad) + (var(--r) - 1) * var(--rh) - 24px) }

/* A checkpoint is not a step, so it is not drawn as one: a wide badge, its own
   band, a medal instead of a state mark. */
.mst-tile.apart { width: min(268px, 86%); height: 64px; left: 50%;
  transform: translateX(-50%); border-radius: 15px; padding: 0 16px;
  display: flex; align-items: center; gap: 13px; text-align: left;
  background: linear-gradient(135deg, #fff 0%, #f6f9fd 100%); border: 1.5px solid #c9d8ee;
  color: #2050a0 }
.mst-tile.apart .mst-mk { width: 26px; height: 26px; transform: none; flex: none }
.mst-tile.apart .mst-nm { position: static; width: auto; left: auto; top: auto;
  font-size: 13px; font-weight: 800; text-align: left; line-height: 1.25; color: #12254a }
.mst-tile.apart .mst-eb { font-size: 9px; letter-spacing: .16em; font-weight: 700;
  font-style: normal; color: #8794ab; display: block; margin-bottom: 3px }
.mst-tile.apart .mst-rk { position: static; margin-left: auto; font-size: 11px }
.mst-tile.apart.done { border-color: #1f9d62; background: #e8f6ee; color: #1f7a57 }
.mst-tile.apart.done .mst-nm { color: #1f7a57 }
.mst-tile.apart.active { border-color: #f09800; background: #fff6e3; color: #c97d00;
  box-shadow: 0 6px 16px rgba(240,152,0,.2) }
.mst-tile.apart.locked { background: #f6f9fd; border-color: #e3e9f2; color: #b3bdcc }
.mst-tile.apart.locked .mst-nm { color: #b3bdcc }
.mst-tile:focus-visible { outline: 2px solid #2050a0; outline-offset: 3px }
.mst-tile.open { border-color: #c9d8ee; background: #fff; color: #2050a0 }
.mst-tile.open .mst-nm { color: #3b4a66 }
.mst-tile.ready { border-color: #b3c3dc; border-style: dashed; color: #8794ab }
.mst-tile.ready .mst-nm { color: #8794ab }
.mst-tile.active { border-color: #f09800; background: #fff6e3; color: #c97d00;
  box-shadow: 0 4px 12px rgba(240,152,0,.22) }
.mst-tile.active .mst-nm { color: #c97d00; font-weight: 800 }
.mst-tile.done { border-color: #1f9d62; background: #1f9d62; color: #fff;
  box-shadow: 0 4px 12px rgba(31,157,98,.25) }
.mst-tile.done .mst-nm { color: #1f7a57; font-weight: 800 }
.mst-tile.locked { background: #f1f4f8; border-color: #e3e9f2; color: #a3aec0 }
.mst-tile.locked .mst-nm { color: #9aa6ba }
.mst-tile[aria-current=true] { outline: 2px solid #12254a; outline-offset: 3px }

.mst-key { display: flex; flex-wrap: wrap; gap: 8px 16px; font-size: 11.5px;
  color: #56647d; padding: 12px 20px 0 }
.mst-key span { display: inline-flex; align-items: center; gap: 6px }
.mst-key i { width: 9px; height: 9px; border-radius: 50%; background: currentColor; flex: none }

.mst-detail { margin: 14px 20px 26px; background: #f6f9fd; border: 1px solid #e3ebf6;
  border-radius: 13px; padding: 14px 16px }
.mst-detail h3 { margin: 0; font-size: 15.5px; color: #12254a }
.mst-detail .dm { font-size: 11.5px; color: #8794ab; margin: 3px 0 0 }
.mst-band { display: inline-block; margin-top: 9px; font-size: 11.5px; font-weight: 700;
  border-radius: 6px; padding: 2px 9px; border: 1px solid currentColor; background: #fff }
.mst-dt { font-size: 10px; letter-spacing: .1em; color: #8794ab; margin: 12px 0 4px }
.mst-dd { margin: 0; font-size: 12.5px; color: #3b4a66; line-height: 1.7 }
.mst-pre { display: flex; flex-wrap: wrap; gap: 5px }
.mst-pre span { font-size: 11.5px; border-radius: 6px; padding: 2px 8px; background: #eef3f9;
  color: #3b4a66 }
.mst-pre span.ok { background: #e6f4ee; color: #1f7a57 }
.mst-pre span b { font-weight: 700; opacity: .65; margin-left: 4px; font-size: 10px }

/* Phone: the stage heading stays at the left of its band -- anywhere between
   the rows it would sit on the lines that drop into the row below -- but as a
   narrow column: ribbon on top, name wrapped under it. The board gets the rest
   of the width, so it fits without sideways scrolling. */
@media (max-width: 640px) {
  .mst-panel { --cw: 88px; --rh: 124px; --sz: 44px; --rkb: 2px; --lane: 12px; --pad: 30px;
    --rail: 54px; --sp: 14px; --hd: 0px }
  .mst-rail { left: 6px; width: 50px; transform: none; flex-direction: column; gap: 3px;
    text-align: center; top: calc(var(--sp) + var(--pad) + (var(--r) - 1) * var(--rh) - 4px) }
  .mst-rail b { font-size: 10px; max-width: 50px; line-height: 1.25 }
  .mst-rail span span { display: block; font-size: 9px; margin-top: 2px }
  .mst-rk { font-size: 9px }
  .mst-scroll { margin: 8px 14px 0; padding: var(--sp) 8px 10px calc(8px + var(--rail)) }
  .mst-tabs, .mst-meta, .mst-key { padding-left: 14px; padding-right: 14px }
  .mst-detail { margin: 14px 14px 26px; position: sticky; bottom: 0 }
  .mst-nm { font-size: 10px }
}
`

export default function SkillTree({
  studentName, currentLevel, currentStage, percentBySkillId, onClose, forCoach = false,
  notes, allPassed = false,
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
        ? 'id, name, pass_criteria, stage, sort_order, level_id, is_standalone, col_override'
        : 'id, name, stage, sort_order, level_id, is_standalone, col_override'
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
      const pctOf = (id: string) => (allPassed ? 100 : percentBySkillId[id] ?? 0)
      const ready = (id: string) =>
        (need[id] || []).every(q => masteryOf(pctOf(q)) >= UNLOCK_LEVEL)

      const built: TreeSkill[] = []
      for (const s of skRows as any[]) {
        const level = levelOf[String(s.level_id)]
        if (!level) continue
        const id = String(s.id)
        const rec = allPassed ? 100 : percentBySkillId[id]
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
          pin: (s as any).col_override == null ? null : Number((s as any).col_override),
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
          id: b.id, stage: b.stage, sort: b.sort, col: b.pin,
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
  }, [supabase, currentLevel, currentStage, percentBySkillId, forCoach, allPassed])

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
    const box = board.parentElement as HTMLElement
    /* Fixed, not scrollable: the columns shrink to whatever the box has room
       for (never wider than the CSS size for this screen), and the tiles with
       them when a column gets narrow. The lines are then routed on the sizes
       actually in use. */
    const fit = () => {
      box.style.removeProperty('--cw')
      box.style.removeProperty('--sz')
      const bs = getComputedStyle(box)
      const maxCw = parseFloat(bs.getPropertyValue('--cw'))
      const maxSz = parseFloat(bs.getPropertyValue('--sz'))
      const lane0 = parseFloat(bs.getPropertyValue('--lane')) || 0
      const avail = box.clientWidth - parseFloat(bs.paddingLeft) - parseFloat(bs.paddingRight)
      if (!maxCw || !maxSz || avail <= 0) return
      const cw = Math.max(48, Math.min(maxCw, Math.floor((avail - 2 * lane0) / cols)))
      if (cw < maxCw) {
        box.style.setProperty('--cw', cw + 'px')
        box.style.setProperty('--sz', Math.min(maxSz, cw - 8) + 'px')
      }
    }
    const draw = () => {
      fit()
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
      /* What a line has to get past on each row, measured off the page: the
         tile, and the name as it actually renders. A short name leaves a gap a
         line can drop through; assuming the whole column was blocked was what
         sent those lines round the outside of the board. */
      const base = board.getBoundingClientRect()
      const blocked: Record<number, Array<[number, number]>> = {}
      const startY: Record<string, number> = {}
      const heads: Record<number, [number, number]> = {}
      for (const el of Array.from(board.querySelectorAll<HTMLElement>('.mst-tile'))) {
        const row = Number(getComputedStyle(el).getPropertyValue('--r')) || 0
        const put = (l: number, r: number) => { (blocked[row] ||= []).push([l, r]) }
        const b = el.getBoundingClientRect()
        put(b.left - base.left - 4, b.right - base.left + 4)
        const nm = el.querySelector('.mst-nm')
        if (nm) {
          const range = document.createRange()
          range.selectNodeContents(nm)
          const t = range.getBoundingClientRect()
          if (t.width) put(t.left - base.left - 5, t.right - base.left + 5)
          // The line leaves from under the name, never through it.
          if (t.height && el.dataset.id) startY[el.dataset.id] = t.bottom - base.top + 4
        }
      }
      // On a phone the stage names sit in each row's top channel.
      if (parseFloat(cs.getPropertyValue('--hd')) > 0) {
        for (const el of Array.from(box.querySelectorAll<HTMLElement>('.mst-rail'))) {
          const row = Number(getComputedStyle(el).getPropertyValue('--r')) || 0
          const b = el.getBoundingClientRect()
          heads[row] = [b.left - base.left - 6, b.right - base.left + 6]
        }
      }
      const paths = routeWires(edges, spots, { cw, rh, sz, lane, pad, cols, blocked, startY, heads })
      for (const el of Array.from(board.querySelectorAll<SVGPathElement>('.mst-w'))) {
        el.setAttribute('d', paths[el.dataset.k || ''] || '')
      }
    }
    draw()
    const ro = new ResizeObserver(draw)
    ro.observe(box)
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
          <div style={{ fontSize: '10px', letterSpacing: '1.6px', textTransform: 'uppercase', color: '#2050a0', fontWeight: 700 }}>
            {t('tree.title')}
          </div>
          <div style={{ fontSize: '20px', fontWeight: 800, color: '#12254a', marginTop: '2px' }}>
            {studentName}
          </div>
          <div className="mst-stats">
            <div className="mst-stat">
              <b style={{ color: LEVEL_COLORS[String(currentLevel)] || GOLD }}>{currentLevel}</b>
              <span>{t('tree.stat.level')}</span>
            </div>
            <div className="mst-stat">
              <b style={{ color: AMBER_TXT }}>{currentStage}</b>
              <span>{t('tree.stat.stage')}</span>
            </div>
            <div className="mst-stat">
              <b style={{ color: AMBER_TXT }}>{done}
                <span style={{ fontSize: '13px', color: '#8794ab' }}>/{total || '—'}</span>
              </b>
              <span>{t('tree.stat.lit')}</span>
            </div>
            <div className="mst-stat">
              <b style={{ color: AMBER_TXT }}>{total ? Math.round((100 * done) / total) : 0}%</b>
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

            <div className="mst-scroll" style={{ ['--cols' as any]: cols }}>
              {([1, 2, 3] as const).filter(st => st <= rows).map(st => (
                <div key={st} className={'mst-stripe' + (st % 2 === 0 ? ' even' : '')}
                  style={{
                    /* The first band runs up to the box's own edge and the
                       last one down to it, so the layers fill the box. --hd is
                       the room a phone makes at the top of each band for the
                       stage name. */
                    ['--bt' as any]: st === 1 ? '0px'
                      : `calc(var(--sp) + var(--pad) - 18px - var(--hd) + ${st - 1} * var(--rh))`,
                    ['--bh' as any]: st === 1 ? 'calc(var(--sp) + var(--pad) - 18px - var(--hd) + var(--rh))'
                      : st === rows ? 'calc(var(--sz) + 70px + var(--hd))' : 'var(--rh)',
                  }} />
              ))}
              {/* A stage is earned when every skill in it reads 100 -- the same
                  rule the coach marks against, so the ribbon cannot drift from
                  the tiles beside it. */}
              {([1, 2, 3] as const).filter(st => st <= rows).map(st => {
                const got = stageEarned(
                  inLv.filter(x => x.stage === st && !x.apart).map(x => x.percent))
                return (
                  <div key={'rail' + st} className={'mst-rail' + (got ? ' got' : '')}
                    style={{ ['--r' as any]: st }}>
                    <StageRibbon level={lv} stage={st} size={30} earned={got}
                      label={t(stageNameKey(lv, st))} />
                    <span>
                      <b>{t(stageNameKey(lv, st))}</b>
                      <span>{t('tree.stageN', { n: st })}</span>
                    </span>
                  </div>
                )
              })}
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
                  <div className="mst-apart" style={{ ['--r' as any]: apartRow }} />
                )}
                {inLv.map(s => {
                  const band = masteryOf(s.percent)
                  /* A level the swimmer has not reached keeps its skills to
                     itself (owner, 2026-09-28): a padlock with no name, and
                     nothing to open. The stage names beside the rows stay, so
                     the family still sees what the level is about. Anything
                     the coach has already started up there shows as usual,
                     and coaches always see everything. */
                  if (!forCoach && s.level > currentLevel && band === 0) {
                    return (
                      <div key={s.id} data-id={s.id} className={'mst-tile locked' + (s.apart ? ' apart' : '')}
                        style={{ ['--c' as any]: s.col, ['--r' as any]: s.row, cursor: 'default' }}
                        aria-label={t('tree.state.locked')}>
                        <span className="mst-mk">{MARK.locked}</span>
                      </div>
                    )
                  }
                  return (
                    <button key={s.id} data-id={s.id}
                      className={'mst-tile ' + s.state + (s.apart ? ' apart' : '')}
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
              <span><i style={{ color: '#1f9d62' }} />{t('tree.state.done')}</span>
              <span><i style={{ color: '#f09800' }} />{t('tree.state.active')}</span>
              <span><i style={{ color: '#2050a0' }} />{t('tree.state.open')}</span>
              <span><i style={{ color: '#8794ab', boxShadow: 'inset 0 0 0 1.5px currentColor', background: 'transparent' }} />{t('tree.state.ready')}</span>
              <span><i style={{ color: '#c3ccd9' }} />{t('tree.state.locked')}</span>
            </div>

            <div className="mst-detail">
              {!sel && <p className="mst-dd" style={{ opacity: .6 }}>{t('tree.pickHint')}</p>}
              {sel && (
                <>
                  <h3>{tDb(locale, 'skills', sel.id, sel.name)}</h3>
                  <p className="dm">
                    {t(levelNameKey(sel.level))} · {t('dash.stageN', { n: sel.stage })} ·{' '}
                    {/* A checkpoint belongs to the stage but is not part of its
                        theme, so it says what it is rather than borrowing the
                        stage's name. */}
                    {sel.apart ? t('tree.stageTest') : t(stageNameKey(sel.level, sel.stage))}
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
