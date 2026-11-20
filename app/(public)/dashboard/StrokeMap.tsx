'use client'

/*
 * The parent's learning map (owner, 2026-11-20): one table, the four strokes
 * as rows and the same 8 steps as columns -- a tick where the step is done,
 * the swimmer's own face where they are practising, light grey for what is
 * still ahead -- with water safety as its own five boxes above. A stroke the
 * school has not reached yet reads "starts in Level 4" rather than an empty
 * row, so a family sees "not yet", not "behind". A plain sentence on top says
 * what the child can do and what they are learning. Tapping a row opens that
 * stroke's steps with every skill and the coach's mark.
 *
 * Built on lib/stroke-map (the steps and which skill finishes each). Coaches
 * and the admin keep the skill tree (SkillTree); this is for families only.
 * The look the owner chose: the table he liked, kept grown-up -- no stickers,
 * stars or game feel; the only playful thing is the child's own swimmer.
 */

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useLocale, useT } from '@/lib/i18n/provider'
import { joinList, tDb } from '@/lib/i18n'
import { masteryOf, masteryKey, MASTERY_COLOR, PASS_LEVEL } from '@/lib/mastery'
import { STROKES, TRACKS, TRACK_COLOR, TRACK_ICON, trackRows, type TrackId, type TrackRow } from '@/lib/stroke-map'
import type { SwimmerLook } from '@/lib/swimmer-look'
import SwimmerFace from '@/components/swimmer/SwimmerFace'
import Sheet from '@/components/ui/Sheet'
import Icon from '@/components/ui/Icon'
import LoadFailed from '@/components/LoadFailed'

type Props = {
  studentName: string
  look: SwimmerLook | null
  currentLevel: number
  /** Every recorded value for this student, keyed by skill id, all levels. */
  percentBySkillId: Record<string, number>
  onClose: () => void
  /** Drawn inside 「的學習」: no sheet of its own. */
  embedded?: boolean
}

type SkillRow = { id: string; name: string; level: number; stage: number; sort: number }

const CSS = `
.msa-sheet.smp-sheet { background: #f5f8fc }
.smp { display: flex; flex-direction: column; gap: 12px; color: #12254a }
.smp-me { display: flex; align-items: center; gap: 12px; background: #fff; border-radius: 18px; padding: 12px 13px }
.smp-me small { display: block; font-size: 12px; color: #6b7690; font-weight: 800 }
.smp-me p { margin: 2px 0 0; font-size: 16px; font-weight: 900; line-height: 1.45 }
.smp-card { display: block; width: 100%; text-align: left; background: #fff; border: 0; border-radius: 18px; padding: 12px; font: inherit; color: inherit }
button.smp-card, .smp-row { cursor: pointer; -webkit-tap-highlight-color: transparent }
.smp-sh { display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: 13px; font-weight: 900; margin-bottom: 8px }
.smp-sh span { display: flex; align-items: center; gap: 5px }
.smp-sh em { font-style: normal; font-size: 12px; color: #56647d; font-weight: 700; text-align: right }
.smp-g5 { display: grid; grid-template-columns: repeat(5, 1fr); gap: 4px }
.smp-g5.l { margin-top: 4px; font-size: 10px; font-weight: 800; color: #8f9ab0; text-align: center; line-height: 1.2 }
.smp-hdr, .smp-cells { display: grid; grid-template-columns: repeat(8, 1fr); gap: 3px }
.smp-hdr span { white-space: nowrap; letter-spacing: -.02em }
.smp-hdr { margin-left: 69px; font-size: 9px; font-weight: 800; color: #8f9ab0; text-align: center; margin-bottom: 2px; line-height: 1.2 }
.smp-row { display: grid; grid-template-columns: 66px 1fr; column-gap: 3px; align-items: center; width: 100%; padding: 8px 0 7px;
  border: 0; border-top: 1px solid #eef2f7; background: none; font: inherit; color: inherit; text-align: left }
/* icon over the name, so a long name or large text never runs into the boxes */
.smp-nm { display: flex; flex-direction: column; align-items: center; gap: 1px; font-size: 12px; white-space: nowrap; font-weight: 900; line-height: 1.15; min-width: 0 }
.smp-sub { grid-column: 2; font-size: 12px; color: #56647d; font-weight: 700; margin-top: 4px; line-height: 1.4 }
.smp-c { height: 26px; border-radius: 9px; background: #eef2f7; position: relative; display: flex; align-items: center; justify-content: center }
.smp-c.done { background: var(--k) }
.smp-c.done::after { content: ''; width: 9px; height: 5px; border-left: 2px solid #fff; border-bottom: 2px solid #fff; transform: rotate(-45deg) translate(1px, -1px) }
.smp-c.now { background: #fff; box-shadow: inset 0 0 0 2px #f09800 }
.smp-c.now .smp-face { position: absolute; top: -3px; width: 30px; height: 30px; border-radius: 50%; background: #ffe9bf;
  border: 2px solid #fff; box-shadow: 0 2px 6px rgba(20,40,80,.25); overflow: hidden; display: flex; align-items: center; justify-content: center }
.smp-wait { height: 26px; border-radius: 9px; background: repeating-linear-gradient(135deg, #f3f6fa 0 6px, #eef2f7 6px 12px);
  display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 800; color: #7c879c }
.smp-lg { display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; font-size: 11.5px; color: #6b7690; font-weight: 700; margin-top: 8px }
.smp-lg i { display: inline-block; width: 12px; height: 12px; border-radius: 4px; vertical-align: -2px; margin-right: 4px }
.smp-hint { text-align: center; font-size: 12px; color: #8f9ab0; font-weight: 700 }
/* one stroke */
.smp-back { align-self: flex-start; display: inline-flex; align-items: center; gap: 2px; border: 0; background: #e8eef7; color: #2050a0;
  font: inherit; font-size: 13px; font-weight: 800; border-radius: 999px; padding: 6px 12px 6px 8px; cursor: pointer }
.smp-big { display: flex; align-items: center; gap: 10px }
.smp-big b { display: block; font-size: 20px; font-weight: 900 }
.smp-big small { font-size: 12.5px; color: #56647d; font-weight: 700 }
.smp-steps { background: #fff; border-radius: 18px; padding: 6px 12px }
.smp-st { display: grid; grid-template-columns: 24px 1fr; gap: 10px; padding: 9px 0; position: relative }
.smp-st:not(:last-child)::after { content: ''; position: absolute; left: 11px; top: 33px; bottom: -9px; width: 2px; background: #e3e8f0 }
.smp-st.done:not(:last-child)::after { background: var(--k) }
.smp-dot { width: 24px; height: 24px; border-radius: 50%; border: 2px solid #cfd6e2; background: #fff; display: flex; align-items: center;
  justify-content: center; color: #fff; z-index: 1; position: relative }
.smp-st.done .smp-dot { background: var(--k); border-color: var(--k) }
.smp-st.now .smp-dot { border: 2.5px dashed #f09800; background: #fff7e6 }
.smp-st b { font-size: 14px }
.smp-sk { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 6px; font-size: 12.5px; color: #3b4a66; margin-top: 4px; line-height: 1.4 }
.smp-sk em { font-style: normal; font-size: 11px; font-weight: 800; border-radius: 6px; padding: 1px 6px; white-space: nowrap }
.smp-sk .key::before { content: '★'; color: #e0a800; margin-right: 2px; font-size: 11px }
.smp-note { font-size: 11.5px; color: #8f9ab0; font-weight: 700 }
@media (prefers-reduced-motion: no-preference) { .smp-c.now { transition: box-shadow .2s } }
`

export default function StrokeMap({ studentName, look, currentLevel, percentBySkillId, onClose, embedded }: Props) {
  const t = useT()
  const locale = useLocale()
  const supabase = useMemo(() => createClient(), [])
  const [skills, setSkills] = useState<SkillRow[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [tries, setTries] = useState(0)
  const [open, setOpen] = useState<TrackId | null>(null)

  useEffect(() => {
    let alive = true
    ;(async () => {
      setFailed(false)
      const [{ data: lv, error: e1 }, { data: sk, error: e2 }] = await Promise.all([
        supabase.from('levels').select('id, level_number'),
        supabase.from('skills').select('id, name, level_id, stage, sort_order').eq('is_active', true),
      ])
      if (!alive) return
      if (e1 || e2 || !lv || !sk) { setFailed(true); return }
      const levelNo: Record<string, number> = {}
      for (const l of lv as { id: string; level_number: number }[]) levelNo[String(l.id)] = Number(l.level_number)
      setSkills((sk as { id: string; name: string; level_id: string; stage: number; sort_order: number }[])
        .filter(s => levelNo[String(s.level_id)])
        .map(s => ({ id: String(s.id), name: String(s.name || ''), level: levelNo[String(s.level_id)], stage: Number(s.stage) || 1, sort: Number(s.sort_order) || 0 })))
    })()
    return () => { alive = false }
  }, [supabase, tries])

  const levelOf = useMemo(() => Object.fromEntries((skills || []).map(s => [s.id, s.level])) as Record<string, number>, [skills])
  const byId = useMemo(() => Object.fromEntries((skills || []).map(s => [s.id, s])) as Record<string, SkillRow>, [skills])
  const rows = useMemo(() => skills ? trackRows(levelOf, percentBySkillId, currentLevel) : null, [skills, levelOf, percentBySkillId, currentLevel])
  const pct = (id: string) => percentBySkillId[id] ?? ((levelOf[id] ?? 99) < currentLevel ? 100 : 0)

  const name = (id: TrackId) => t('smap.track.' + id)
  const noun = (id: TrackId, i: number) => t(`smap.noun.${id}.${i + 1}`)

  /* One line for a stroke: what is done, what is being practised. */
  const rowLine = (r: TrackRow): string => {
    if (r.id === 'sf') {
      if (r.best === TRACKS.sf.length - 1) return t('smap.safe.all')
      return r.now >= 0 ? t('smap.row.learn', { noun: noun('sf', r.now) }) : ''
    }
    const can = r.best < 0 ? '' : r.best === 0 ? t('smap.row.can.1', { noun: noun(r.id, 0) }) : t('smap.row.can.' + (r.best + 1))
    const learn = r.now < 0 ? '' : r.now <= 3 ? t('smap.row.learn', { noun: noun(r.id, r.now) }) : t('smap.row.learn.' + (r.now + 1))
    if (can && learn) return t('smap.row.join', { a: can, b: learn })
    return can || learn || t('smap.row.none')
  }

  /* The sentence on top: the best a stroke has reached, then what is being
     learnt (the strokes still being put together, not distance work). */
  const summary = (rs: Record<TrackId, TrackRow>): string => {
    const strokes = STROKES.map(id => rs[id])
    const top = Math.max(...strokes.map(r => r.best))
    let can = ''
    if (top >= 1) {
      const list = strokes.filter(r => r.best === top).map(r => name(r.id))
      can = t('smap.sum.can.' + (top + 1), { list: joinList(locale, list), n: list.length })
    }
    const nouns: string[] = []
    for (const r of strokes) if (r.waitLevel == null && r.now >= 0 && r.now <= 3) nouns.push(noun(r.id, r.now))
    if (!can && rs.sf.now >= 0 && rs.sf.now <= 2) nouns.unshift(noun('sf', rs.sf.now))
    if (!nouns.length && rs.sf.now >= 0) nouns.push(noun('sf', rs.sf.now))
    const uniq = [...new Set(nouns)].slice(0, 3)
    let learn = uniq.length ? t(can ? 'smap.sum.learn' : 'smap.sum.learnOnly', { list: joinList(locale, uniq) }) : ''
    if (!learn) {
      const dist = strokes.find(r => r.now >= 4)
      if (dist) learn = t('smap.row.learn.' + (dist.now + 1))
    }
    if (can && learn) return t('smap.sum.join', { a: can, b: learn })
    return can || learn || t('smap.sum.start')
  }

  const face = <span className="smp-face"><SwimmerFace look={look} size={30} /></span>
  const cells = (r: TrackRow) => r.cells.map((c, i) => (
    <span key={i} className={'smp-c ' + c} style={{ ['--k' as string]: TRACK_COLOR[r.id] }}>{c === 'now' && face}</span>
  ))

  let body: React.ReactNode
  if (failed) body = <LoadFailed onRetry={() => setTries(n => n + 1)} />
  else if (!rows) body = <div style={{ height: 320 }} aria-busy="true" />
  else if (open) {
    const r = rows[open]
    const steps = TRACKS[open]
    const titleOf = (i: number) => open === 'sf' ? t('smap.safe.' + (i + 1)) : t('smap.step.' + (i + 1))
    body = (
      <div className="smp">
        <button type="button" className="smp-back tap-auto" onClick={() => setOpen(null)}><Icon name="back" size={16} />{t('smap.back')}</button>
        <div className="smp-big" style={{ color: TRACK_COLOR[open] }}>
          <Icon name={TRACK_ICON[open]} size={34} />
          <div><b>{name(open)}</b><small>{rowLine(r) || (r.waitLevel ? t('smap.wait', { n: r.waitLevel }) : '')}</small></div>
        </div>
        <div className="smp-steps" style={{ ['--k' as string]: TRACK_COLOR[open] }}>
          {steps.map((st, i) => {
            const list = (st.skills.length ? st.skills : st.keys).filter(id => byId[id])
              .sort((a, b) => byId[a].level - byId[b].level || byId[a].stage - byId[b].stage || byId[a].sort - byId[b].sort)
            return (
              <div key={i} className={'smp-st ' + r.cells[i]}>
                <span className="smp-dot">{r.cells[i] === 'done' && (
                  <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 6.3 5 8.6 9.6 3.6" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                )}</span>
                <div>
                  <b>{i + 1}. {titleOf(i)}</b>
                  {!st.skills.length && <div className="smp-note">{t('smap.shared')}</div>}
                  <div className="smp-sk">
                    {list.map(id => {
                      const m = masteryOf(pct(id))
                      return (
                        <span key={id} className={st.keys.includes(id) && steps.length > 1 ? 'key' : ''}>
                          {tDb(locale, 'skills', id, byId[id].name)}{' '}
                          <em style={{ color: m >= PASS_LEVEL ? '#1b7f47' : MASTERY_COLOR[m], background: m >= PASS_LEVEL ? '#e6f6ec' : '#f3f5f9' }}>{t(masteryKey(m))}</em>
                        </span>
                      )
                    })}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
        <div className="smp-hint">{t('smap.key')}</div>
      </div>
    )
  } else {
    const sf = rows.sf
    body = (
      <div className="smp">
        <div className="smp-me">
          <SwimmerFace look={look} size={54} />
          <div>
            <small>{studentName} · {t('level.badge', { n: currentLevel, name: t(`level.${currentLevel}.name`) })}</small>
            <p>{summary(rows)}</p>
          </div>
        </div>
        <button type="button" className="smp-card tap-auto" onClick={() => setOpen('sf')}
          aria-label={t('smap.openRow', { name: name('sf'), status: rowLine(sf) })}>
          <div className="smp-sh">
            <span style={{ color: TRACK_COLOR.sf }}><Icon name="shield" size={18} />{name('sf')}</span>
            <em>{rowLine(sf)}</em>
          </div>
          <div className="smp-g5">{cells(sf)}</div>
          <div className="smp-g5 l">{[1, 2, 3, 4, 5].map(i => <span key={i}>{t('smap.safe.' + i)}</span>)}</div>
        </button>
        <div className="smp-card">
          <div className="smp-hdr" aria-hidden="true">{[1, 2, 3, 4, 5, 6, 7, 8].map(i => <span key={i}>{t('smap.col.' + i)}</span>)}</div>
          {STROKES.map(id => {
            const r = rows[id]
            const line = r.waitLevel ? t('smap.wait', { n: r.waitLevel }) : rowLine(r)
            return (
              <button key={id} type="button" className="smp-row tap-auto" onClick={() => setOpen(id)}
                aria-label={t('smap.openRow', { name: name(id), status: line })}>
                <span className="smp-nm" style={{ color: TRACK_COLOR[id] }}><Icon name={TRACK_ICON[id]} size={18} />{t('smap.short.' + id)}</span>
                {r.waitLevel ? <span className="smp-wait">{line}</span> : <span className="smp-cells">{cells(r)}</span>}
                {!r.waitLevel && <span className="smp-sub">{line}</span>}
              </button>
            )
          })}
          <div className="smp-lg" aria-hidden="true">
            <span><i style={{ background: TRACK_COLOR.fr }} />{t('smap.lg.done')}</span>
            <span><i style={{ background: '#fff', boxShadow: 'inset 0 0 0 2px #f09800' }} />{t('smap.lg.now')}</span>
            <span><i style={{ background: '#eef2f7' }} />{t('smap.lg.todo')}</span>
          </div>
        </div>
        <div className="smp-hint">{t('smap.hint')}</div>
      </div>
    )
  }

  const content = <><style>{CSS}</style>{body}</>
  if (embedded) return content
  return <Sheet title={t('dash.skillTree')} onClose={onClose} className="smp-sheet">{content}</Sheet>
}
