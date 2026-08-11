'use client'

import { useState, useEffect, Fragment } from 'react'
import { ZONE_COLORS, BAND_COLORS, TEAM_TIER_COLORS } from '@/lib/zone-colors'
import { daySlots, SLOT_STEP_MINUTES } from '@/lib/date'

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const DAY_SLOTS = daySlots()
const SLOTS = DAY_SLOTS.length

const COLORS = ZONE_COLORS
const PURPLE = '#a78bfa'

const BANDS = [
  { key: '1-2', label: 'L1–2' },
  { key: '3-4', label: 'L3–4' },
  { key: '5-6', label: 'L5–6' },
  { key: '7-9', label: 'L7–9' },
]
const BAND_GREENS = BAND_COLORS
const TEAM_COLORS = TEAM_TIER_COLORS

type Cell = { t: 'private' | 'group' | 'team'; tier?: string; band?: string } | null
type Brush = 'private' | 'group' | 'team' | 'erase'
type ZoneRow = { zone_type: string; weekday?: number; start_time: string; end_time: string; team_tier_id?: string | null; group_level_min?: number | null; group_level_max?: number | null }

const toMin = (t: string) => { const [h, m] = String(t).slice(0, 5).split(':').map(Number); return h * 60 + m }
const clampIdx = (i: number) => Math.max(0, Math.min(SLOTS - 1, i))
const idxToTime = (i: number) => DAY_SLOTS[clampIdx(i)].start
const idxToEnd = (i: number) => DAY_SLOTS[clampIdx(i)].end
// Which slots sit entirely inside a stored zone range
const slotsInRange = (start: string, end: string) => {
  const s = toMin(start), e = toMin(end)
  const out: number[] = []
  DAY_SLOTS.forEach((sl, i) => { if (toMin(sl.start) >= s && toMin(sl.end) <= e) out.push(i) })
  return out
}
// False across the long break — merging there would regenerate the wrong grid
const contiguous = (a: number, b: number) => toMin(DAY_SLOTS[b].start) - toMin(DAY_SLOTS[a].start) === SLOT_STEP_MINUTES

export default function ZonesEditorPage() {
  const [coaches, setCoaches] = useState<{ id: string; first_name: string; last_name: string }[]>([])
  const [coachId, setCoachId] = useState('')
  const [tiers, setTiers] = useState<{ id: string; name: string }[]>([])
  const [legacy, setLegacy] = useState<{ day_of_week: number; start_time: string; end_time: string }[]>([])
  const [weeklyRows, setWeeklyRows] = useState<ZoneRow[]>([])
  const [teamRows, setTeamRows] = useState<ZoneRow[]>([])
  const [ovTeamRows, setOvTeamRows] = useState<any[]>([])
  const [grid, setGrid] = useState<Cell[][]>(() => Array.from({ length: 7 }, () => Array(SLOTS).fill(null)))
  const [brush, setBrush] = useState<Brush>('private')
  const [brushTier, setBrushTier] = useState('')
  const [brushBand, setBrushBand] = useState(BANDS[0].key)
  const [painting, setPainting] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; warn?: boolean; text: string } | null>(null)
  const [hasZones, setHasZones] = useState(false)
  const [hasWeekly, setHasWeekly] = useState(false)
  const [mode, setMode] = useState<'weekly' | 'date'>('weekly')
  const [ovDate, setOvDate] = useState('')
  const [dayClosed, setDayClosed] = useState(false)
  const [hasOverride, setHasOverride] = useState(false)
  const [reload, setReload] = useState(0)
  const [ovDates, setOvDates] = useState<{ date: string; closed: boolean }[]>([])

  const ovDow = ovDate ? new Date(ovDate + 'T00:00:00').getDay() : 0
  const visDays = mode === 'date' && ovDate ? [ovDow] : [0, 1, 2, 3, 4, 5, 6]

  useEffect(() => {
    fetch('/api/admin/zones').then(r => r.json()).then(d => setCoaches(d.coaches || []))
    const up = () => setPainting(false)
    window.addEventListener('mouseup', up)
    return () => window.removeEventListener('mouseup', up)
  }, [])

  function buildWeeklyGrid(rows: ZoneRow[]) {
    const g: Cell[][] = Array.from({ length: 7 }, () => Array(SLOTS).fill(null))
    for (const z of rows) {
      if (z.zone_type === 'team') continue
      for (const i of slotsInRange(String(z.start_time).slice(0, 5), String(z.end_time).slice(0, 5))) {
        g[z.weekday!][i] = { t: z.zone_type as any, tier: z.team_tier_id || undefined, band: z.group_level_min != null ? z.group_level_min + '-' + z.group_level_max : undefined }
      }
    }
    return g
  }

  useEffect(() => {
    if (!coachId) return
    setMsg(null); setDirty(false); setMode('weekly'); setOvDate(''); setDayClosed(false)
    fetch(`/api/admin/zones?coach_id=${coachId}`).then(r => r.json()).then(d => {
      setTiers(d.tiers || [])
      setLegacy(d.legacy || [])
      setWeeklyRows(d.weekly || [])
      setTeamRows((d.weekly || []).filter((z: ZoneRow) => z.zone_type === 'team'))
      if ((d.tiers || []).length > 0 && !brushTier) setBrushTier(d.tiers[0].id)
      setGrid(buildWeeklyGrid(d.weekly || []))
      setHasZones((d.weekly || []).length > 0 || (d.overrideDates || []).length > 0)
      setHasWeekly((d.weekly || []).length > 0)
      setOvDates(d.overrideDates || [])
    })
  }, [coachId])

  useEffect(() => {
    if (!coachId) return
    if (mode === 'weekly') {
      setGrid(buildWeeklyGrid(weeklyRows)); setDirty(false); setMsg(null); setDayClosed(false)
      return
    }
    if (!ovDate) return
    setMsg(null); setDirty(false); setDayClosed(false)
    fetch(`/api/admin/zones?coach_id=${coachId}&date=${ovDate}`).then(r => r.json()).then(d => {
      const rows: ZoneRow[] = d.dateRows || []
      const g: Cell[][] = Array.from({ length: 7 }, () => Array(SLOTS).fill(null))
      if (rows.some(r => r.zone_type === 'closed')) {
        setDayClosed(true)
      } else {
        const src = rows.length > 0 ? rows.map(r => ({ ...r, weekday: ovDow })) : weeklyRows.filter(w => w.weekday === ovDow)
        setOvTeamRows(src.filter((z: any) => z.zone_type === 'team'))
        for (const z of src) {
          if (z.zone_type === 'team') continue
          for (const i of slotsInRange(String(z.start_time).slice(0, 5), String(z.end_time).slice(0, 5))) g[ovDow][i] = { t: z.zone_type as any, tier: z.team_tier_id || undefined, band: (z as any).group_level_min != null ? (z as any).group_level_min + '-' + (z as any).group_level_max : undefined }
        }
      }
      setGrid(g)
      setHasOverride(rows.length > 0)
    })
  }, [mode, ovDate, reload])

  const teamIvs = (day: number): { s: number; e: number; tier?: string }[] => {
    const rows: any[] = mode === 'date' ? ovTeamRows : teamRows.filter((z: any) => z.weekday === day)
    return rows.map((z: any) => ({ s: toMin(String(z.start_time).slice(0, 5)), e: toMin(String(z.end_time).slice(0, 5)), tier: z.team_tier_id || undefined }))
  }
  // A lesson slot overlapping a team block can't be painted — saving both would
  // produce overlapping zones and the API rejects the whole template
  const teamAt = (day: number, idx: number) => {
    const a = toMin(DAY_SLOTS[idx].start), b = toMin(DAY_SLOTS[idx].end)
    return teamIvs(day).find(iv => a < iv.e && b > iv.s)
  }

  function paint(day: number, idx: number) {
    if (teamAt(day, idx)) { setMsg({ ok: false, text: 'That slot sits inside a team practice block.' }); return }
    if (brush === 'team') { setMsg({ ok: false, text: 'Team practices are managed separately — they are not painted on the lesson grid.' }); return }
    setGrid(prev => {
      const g = prev.map(row => [...row])
      g[day][idx] = brush === 'erase' ? null : { t: brush, tier: undefined, band: brush === 'group' && brushBand ? brushBand : undefined }
      return g
    })
    setDirty(true); setMsg(null); setDayClosed(false)
  }

  function loadLegacyAsPrivate() {
    const g: Cell[][] = Array.from({ length: 7 }, () => Array(SLOTS).fill(null))
    for (const a of legacy) {
      for (const i of slotsInRange(String(a.start_time).slice(0, 5), String(a.end_time).slice(0, 5))) g[a.day_of_week][i] = { t: 'private' }
    }
    setGrid(g); setDirty(true); setMsg(null)
  }

  function compress(days: number[]) {
    const out: { zone_type: string; weekday: number; start_time: string; end_time: string; team_tier_id?: string; group_level_min?: number | null; group_level_max?: number | null }[] = []
    for (const d of days) {
      let i = 0
      while (i < SLOTS) {
        const c = grid[d][i]
        if (!c || teamAt(d, i)) { i++; continue }
        let j = i + 1
        while (j < SLOTS && contiguous(j - 1, j) && !teamAt(d, j) && grid[d][j] && grid[d][j]!.t === c.t && grid[d][j]!.tier === c.tier && grid[d][j]!.band === c.band) j++
        out.push({ zone_type: c.t, weekday: d, start_time: idxToTime(i), end_time: idxToEnd(j - 1), team_tier_id: c.tier, group_level_min: c.band ? Number(c.band.split('-')[0]) : null, group_level_max: c.band ? Number(c.band.split('-')[1]) : null })
        i = j
      }
    }
    return out
  }

  function teamCheck(zones: { zone_type: string; weekday: number; start_time: string; end_time: string }[]): string | null {
    for (const z of zones) {
      if (z.zone_type === 'team') {
        const dur = toMin(z.end_time) - toMin(z.start_time)
        if (dur % 90 !== 0) return `Team block ${DAY_NAMES[z.weekday]} ${z.start_time}–${z.end_time} must be a multiple of 90 minutes`
      }
    }
    return null
  }

  async function save() {
    if (mode === 'weekly') {
      const zones = [...compress([0, 1, 2, 3, 4, 5, 6]), ...teamRows.map((z: any) => ({ zone_type: 'team', weekday: z.weekday as number, start_time: String(z.start_time).slice(0, 5), end_time: String(z.end_time).slice(0, 5), team_tier_id: z.team_tier_id || undefined, group_level_min: null, group_level_max: null }))]
      const err = teamCheck(zones)
      if (err) { setMsg({ ok: false, text: err }); return }
      setSaving(true); setMsg(null)
      const res = await fetch('/api/admin/zones', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ coach_id: coachId, zones }),
      })
      const data = await res.json()
      setSaving(false)
      if (!res.ok) { setMsg({ ok: false, text: data.error || 'Save failed' }); return }
      setWeeklyRows(zones)
      setDirty(false); setHasZones(zones.length > 0)
      const w = data.warnings || []
      setMsg({ ok: true, warn: w.length > 0, text: `Saved weekly template (${data.count} block(s))` + (w.length ? ` — ⚠ ${w.length} existing booking(s) now fall outside the zones: ${w.join('; ')}. These lessons still happen; only new bookings are limited.` : '') })
      return
    }
    const painted = compress([ovDow])
    const zones = dayClosed ? painted : [...painted, ...ovTeamRows.map((z: any) => ({ zone_type: 'team', weekday: ovDow, start_time: String(z.start_time).slice(0, 5), end_time: String(z.end_time).slice(0, 5), team_tier_id: z.team_tier_id || undefined, group_level_min: null, group_level_max: null }))]
    const err = teamCheck(zones)
    if (err) { setMsg({ ok: false, text: err }); return }
    setSaving(true); setMsg(null)
    const body: any = { coach_id: coachId, date: ovDate }
    if (dayClosed && painted.length === 0) body.closed = true
    else body.zones = zones.map(z => ({ zone_type: z.zone_type, start_time: z.start_time, end_time: z.end_time, team_tier_id: z.team_tier_id, group_level_min: z.group_level_min ?? null, group_level_max: z.group_level_max ?? null }))
    const res = await fetch('/api/admin/zones', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    })
    const data = await res.json()
    setSaving(false)
    if (!res.ok) { setMsg({ ok: false, text: data.error || 'Save failed' }); return }
    setDirty(false); setHasOverride(true)
    setOvDates(prev => { const rest = prev.filter(o => o.date !== ovDate); return [...rest, { date: ovDate, closed: data.mode === 'closed' }].sort((a, b) => a.date.localeCompare(b.date)) })
    const w = data.warnings || []
    setMsg({ ok: true, warn: w.length > 0, text: (data.mode === 'closed' ? `${ovDate} closed for this coach` : `Override saved for ${ovDate}`) + (w.length ? ` — ⚠ ${w.length} existing booking(s) affected: ${w.join('; ')}. These lessons still happen; only new bookings are limited.` : '') })
  }

  function closeDay() {
    setGrid(prev => { const g = prev.map(r => [...r]); g[ovDow] = Array(SLOTS).fill(null); return g })
    setDayClosed(true); setDirty(true); setMsg(null)
  }

  async function clearOverride() {
    setSaving(true); setMsg(null)
    const res = await fetch('/api/admin/zones', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ coach_id: coachId, date: ovDate, clear: true }),
    })
    setSaving(false)
    if (!res.ok) { setMsg({ ok: false, text: 'Clear failed' }); return }
    setHasOverride(false); setReload(x => x + 1)
    setOvDates(prev => prev.filter(o => o.date !== ovDate))
    setMsg({ ok: true, text: `Override cleared — ${ovDate} follows the weekly template` })
  }

  // Team practices are 90 minutes and do not align to the 35-minute lesson
  // cadence, so they are never painted on the grid — they are managed here as
  // explicit rows. save() already merges teamRows / ovTeamRows back into the
  // payload, so editing these arrays is all that is needed.
  const TEAM_MINUTES = 90
  const [newTeamDow, setNewTeamDow] = useState(1)
  const [newTeamStart, setNewTeamStart] = useState('16:00')
  function addTeamBlock() {
    if (!/^\d{2}:\d{2}$/.test(newTeamStart)) { setMsg({ ok: false, text: 'Start time must be HH:MM' }); return }
    if (tiers.length === 0) { setMsg({ ok: false, text: 'No swim team tiers exist yet' }); return }
    const end = idxSafeEnd(newTeamStart)
    const row: any = { zone_type: 'team', start_time: newTeamStart, end_time: end, team_tier_id: brushTier || tiers[0].id }
    if (mode === 'date') { setOvTeamRows(prev => [...prev, row]) }
    else { setTeamRows(prev => [...prev, { ...row, weekday: newTeamDow }] as any) }
    setDirty(true); setMsg(null)
  }
  function removeTeamBlock(i: number) {
    if (mode === 'date') setOvTeamRows(prev => prev.filter((_, k) => k !== i))
    else setTeamRows(prev => prev.filter((_, k) => k !== i))
    setDirty(true)
  }
  function idxSafeEnd(start: string) {
    const m = toMin(start) + TEAM_MINUTES
    return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0')
  }

  const tierName = (id?: string) => tiers.find(t => t.id === id)?.name || ''
  const tierColor = (id?: string) => { const i = tiers.findIndex(t => t.id === id); return TEAM_COLORS[i >= 0 ? i % TEAM_COLORS.length : 0] }
  const cellLabel = (c: Cell) => !c ? '' : c.t === 'team' ? tierName(c.tier) : c.t === 'group' ? (c.band ? 'L' + c.band.replace('-', '–') : 'Group') : 'Private'
  const accent = mode === 'date' ? PURPLE : '#c9a84c'

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 20px' }}>
      <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: 28, fontWeight: 900, color: '#fff', marginBottom: 4 }}>Availability Zones</h1>
      <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', marginBottom: 20 }}>Paint each coach's weekly template: which times are open for which course types. Unpainted time is closed for booking.</p>

      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 16 }}>
        <select value={coachId} onChange={e => setCoachId(e.target.value)}
          style={{ background: '#1a2744', color: '#fff', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 10, padding: '10px 14px', fontSize: 14 }}>
          <option value="">Select coach…</option>
          {coaches.map(c => <option key={c.id} value={c.id}>{c.first_name} {c.last_name}</option>)}
        </select>
        {coachId && (
          <div style={{ display: 'flex', gap: 6 }}>
            {(['weekly', 'date'] as const).map(m => (
              <button key={m} onClick={() => setMode(m)}
                style={{ padding: '8px 14px', borderRadius: 10, fontSize: 12, fontWeight: 700, cursor: 'pointer', border: mode === m ? `2px solid ${m === 'date' ? PURPLE : '#c9a84c'}` : '1px solid rgba(255,255,255,0.15)', background: mode === m ? (m === 'date' ? 'rgba(167,139,250,0.12)' : 'rgba(201,168,76,0.12)') : 'transparent', color: m === 'date' ? PURPLE : '#c9a84c' }}>
                {m === 'weekly' ? 'Weekly Template' : 'Date Override'}
              </button>
            ))}
            {mode === 'date' && (
              <input type="date" value={ovDate} onChange={e => setOvDate(e.target.value)}
                style={{ background: '#1a2744', color: '#fff', border: `1px solid ${PURPLE}66`, borderRadius: 10, padding: '8px 12px', fontSize: 13 }} />
            )}
          </div>
        )}
        {coachId && mode === 'weekly' && hasZones && !hasWeekly && (
          <span style={{ fontSize: 12, color: '#e8883a' }}>
            No weekly template yet, so this coach is closed on every date except the ones with an override.
          </span>
        )}
        {coachId && mode === 'weekly' && !hasZones && (
          <span style={{ fontSize: 12, color: '#e8883a' }}>
            This coach is on the legacy hours table (all course types).{legacy.length > 0 && <> <button onClick={loadLegacyAsPrivate} style={{ color: '#c9a84c', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, textDecoration: 'underline', padding: 0 }}>Copy current hours as Private zones</button></>}
          </span>
        )}
      </div>

      {coachId && (() => {
        const laToday = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles' }).format(new Date())
        const upcoming = ovDates.filter(o => o.date >= laToday)
        if (upcoming.length === 0) return null
        return (
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginBottom: 14 }}>
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: PURPLE }}>Overrides:</span>
            {upcoming.map(o => (
              <button key={o.date} onClick={() => { setMode('date'); setOvDate(o.date) }}
                style={{ padding: '4px 10px', borderRadius: 20, fontSize: 12, fontWeight: 700, cursor: 'pointer', border: o.closed ? '1px solid rgba(224,90,74,0.5)' : `1px solid ${PURPLE}66`, background: mode === 'date' && ovDate === o.date ? (o.closed ? 'rgba(224,90,74,0.18)' : 'rgba(167,139,250,0.18)') : 'transparent', color: o.closed ? '#e05a4a' : PURPLE }}>
                {o.date.slice(5).replace('-', '/')}{o.closed ? ' ✕ closed' : ''}
              </button>
            ))}
          </div>
        )
      })()}

      {coachId && (mode === 'weekly' || ovDate) && (
        <>
          <div style={{ border: '1px solid rgba(224,90,74,0.35)', background: 'rgba(224,90,74,0.06)', borderRadius: 12, padding: '12px 14px', marginBottom: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#e05a4a', marginBottom: 8 }}>
              Swim team practices · 90 minutes each{mode === 'date' ? ' · this date only' : ' · weekly'}
            </div>
            {(mode === 'date' ? ovTeamRows : teamRows.slice().sort((a: any, b: any) => (a.weekday - b.weekday) || String(a.start_time).localeCompare(String(b.start_time)))).length === 0 ? (
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginBottom: 10 }}>No practices set for this coach yet.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
                {(mode === 'date' ? ovTeamRows : teamRows).map((z: any, i: number) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, color: 'rgba(255,255,255,0.85)' }}>
                    <span style={{ fontWeight: 700, minWidth: 90 }}>{mode === 'date' ? 'This date' : DAY_NAMES[z.weekday]}</span>
                    <span>{String(z.start_time).slice(0, 5)} – {String(z.end_time).slice(0, 5)}</span>
                    <span style={{ color: '#e05a4a', fontWeight: 700 }}>{tierName(z.team_tier_id) || 'Team'}</span>
                    <button onClick={() => removeTeamBlock(i)}
                      style={{ marginLeft: 'auto', padding: '3px 10px', borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: 'pointer', border: '1px solid rgba(224,90,74,0.5)', background: 'transparent', color: '#e05a4a' }}>Remove</button>
                  </div>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              {mode === 'weekly' && (
                <select value={newTeamDow} onChange={e => setNewTeamDow(Number(e.target.value))}
                  style={{ background: '#1a2744', color: '#fff', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 8, padding: '6px 10px', fontSize: 12 }}>
                  {DAY_NAMES.map((d, i) => <option key={i} value={i}>{d}</option>)}
                </select>
              )}
              <input type="time" value={newTeamStart} onChange={e => setNewTeamStart(e.target.value)}
                style={{ background: '#1a2744', color: '#fff', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 8, padding: '6px 10px', fontSize: 12 }} />
              <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)' }}>→ {idxSafeEnd(newTeamStart)}</span>
              <select value={brushTier} onChange={e => setBrushTier(e.target.value)}
                style={{ background: '#1a2744', color: '#e05a4a', border: '1px solid rgba(224,90,74,0.4)', borderRadius: 8, padding: '6px 10px', fontSize: 12, fontWeight: 700 }}>
                {tiers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
              <button onClick={addTeamBlock}
                style={{ padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer', border: '1px solid rgba(224,90,74,0.6)', background: 'rgba(224,90,74,0.15)', color: '#e05a4a' }}>+ Add practice</button>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 14 }}>
            {(['private', 'group'] as const).map(b => (
              <button key={b} onClick={() => setBrush(b)}
                style={{ padding: '8px 14px', borderRadius: 10, fontSize: 12, fontWeight: 700, textTransform: 'capitalize', cursor: 'pointer', border: brush === b ? `2px solid ${COLORS[b]}` : '1px solid rgba(255,255,255,0.15)', background: brush === b ? `${COLORS[b]}22` : 'transparent', color: COLORS[b] }}>
                {b === 'private' ? 'Private (1-on-1 / 1-on-2)' : b === 'group' ? 'Group (1-on-4)' : 'Team'}
              </button>
            ))}
            {brush === 'group' && (
              <select value={brushBand} onChange={e => setBrushBand(e.target.value)}
                style={{ background: '#1a2744', color: '#4caf72', border: '1px solid rgba(76,175,114,0.4)', borderRadius: 10, padding: '8px 10px', fontSize: 12, fontWeight: 700 }}>
                {BANDS.map(b => <option key={b.key} value={b.key}>{b.label}</option>)}
              </select>
            )}
            <button onClick={() => setBrush('erase')}
              style={{ padding: '8px 14px', borderRadius: 10, fontSize: 12, fontWeight: 700, cursor: 'pointer', border: brush === 'erase' ? '2px solid rgba(255,255,255,0.6)' : '1px solid rgba(255,255,255,0.15)', background: brush === 'erase' ? 'rgba(255,255,255,0.1)' : 'transparent', color: 'rgba(255,255,255,0.7)' }}>Eraser</button>
            {mode === 'date' && (
              <>
                <button onClick={closeDay} style={{ padding: '8px 14px', borderRadius: 10, fontSize: 12, fontWeight: 700, cursor: 'pointer', border: '1px solid rgba(224,90,74,0.4)', background: dayClosed ? 'rgba(224,90,74,0.15)' : 'transparent', color: '#e05a4a' }}>{dayClosed ? 'Day marked closed' : 'Close this day'}</button>
                {hasOverride && <button onClick={clearOverride} disabled={saving} style={{ padding: '8px 14px', borderRadius: 10, fontSize: 12, fontWeight: 700, cursor: 'pointer', border: '1px solid rgba(255,255,255,0.2)', background: 'transparent', color: 'rgba(255,255,255,0.6)' }}>Clear override</button>}
              </>
            )}
            <div style={{ flex: 1 }} />
            <button onClick={save} disabled={!dirty || saving}
              style={{ padding: '10px 22px', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: dirty ? 'pointer' : 'not-allowed', border: 'none', background: dirty ? accent : 'rgba(255,255,255,0.1)', color: dirty ? '#0d1529' : 'rgba(255,255,255,0.3)' }}>
              {saving ? 'Saving…' : mode === 'weekly' ? 'Save Template' : 'Save Override'}
            </button>
          </div>

          {msg && <div style={{ marginBottom: 12, padding: '10px 14px', borderRadius: 10, fontSize: 13, background: msg.warn ? 'rgba(232,136,58,0.1)' : msg.ok ? 'rgba(134,239,172,0.1)' : 'rgba(224,90,74,0.1)', border: msg.warn ? '1px solid rgba(232,136,58,0.4)' : msg.ok ? '1px solid rgba(134,239,172,0.3)' : '1px solid rgba(224,90,74,0.4)', color: msg.warn ? '#e8883a' : msg.ok ? '#86efac' : '#e05a4a' }}>{msg.text}</div>}
          {mode === 'date' && ovDate && <div style={{ marginBottom: 12, padding: '8px 14px', borderRadius: 10, fontSize: 12, background: 'rgba(167,139,250,0.08)', border: `1px solid ${PURPLE}44`, color: PURPLE }}>Editing {ovDate} ({DAY_NAMES[ovDow]}) only — this override replaces the weekly template for that date.{!hasOverride && !dirty ? ' Currently showing the weekly template as a starting point.' : ''}</div>}

          <div style={{ display: 'grid', gridTemplateColumns: `52px repeat(${visDays.length}, 1fr)`, gap: 2, userSelect: 'none', border: mode === 'date' ? `1px solid ${PURPLE}44` : 'none', borderRadius: 8, padding: mode === 'date' ? 6 : 0 }}>
            <div />
            {visDays.map(d => <div key={d} style={{ textAlign: 'center', fontSize: 11, fontWeight: 700, color: mode === 'date' ? PURPLE : 'rgba(255,255,255,0.5)', padding: '4px 0' }}>{mode === 'date' ? `${ovDate} · ${DAY_NAMES[d]}` : DAY_NAMES[d]}</div>)}
            {Array.from({ length: SLOTS }, (_, i) => {
              const gap = i < SLOTS - 1 ? toMin(DAY_SLOTS[i + 1].start) - toMin(DAY_SLOTS[i].end) : 0
              const gapH = gap >= 10 ? 14 : 7
              return (
              <Fragment key={i}>
                <div key={`t${i}`} style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', textAlign: 'right', paddingRight: 6, lineHeight: '20px' }}>{idxToTime(i)}</div>
                {visDays.map(d => {
                  const c = grid[d][i]
                  const th = teamAt(d, i)
                  if (th) {
                    // Draw the practice by its REAL minutes. Tinting the whole row
                    // made a 16:00 start look like 15:35, because 15:35 is where the
                    // row it lands in begins.
                    const ss = toMin(DAY_SLOTS[i].start), se = toMin(DAY_SLOTS[i].end)
                    const pctA = ((Math.max(th.s, ss) - ss) / (se - ss)) * 100
                    const pctB = ((Math.min(th.e, se) - ss) / (se - ss)) * 100
                    const col = tierColor(th.tier)
                    const hhmm = (m: number) => String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0')
                    const startsHere = th.s >= ss && th.s < se
                    return (
                      <div key={`c${d}-${i}`} title={`${tierName(th.tier)} practice ${hhmm(th.s)}–${hhmm(th.e)} · not bookable for lessons`}
                        style={{ height: 20, borderRadius: 3, cursor: 'not-allowed', background: `linear-gradient(to bottom, transparent 0 ${pctA}%, ${col}55 ${pctA}% ${pctB}%, transparent ${pctB}% 100%)`, border: `1px dashed ${col}66`, overflow: 'hidden', textAlign: 'center', fontSize: 9, fontWeight: 700, lineHeight: '20px', color: 'rgba(255,255,255,0.8)' }}>{startsHere ? hhmm(th.s) : ''}</div>
                    )
                  }
                  return (
                    <div key={`c${d}-${i}`}
                      onMouseDown={() => { setPainting(true); paint(d, i) }}
                      onMouseEnter={() => { if (painting) paint(d, i) }}
                      title={(c ? (c.t === 'team' ? tierName(c.tier) : c.t === 'group' && c.band ? 'group L' + c.band : c.t) + ' · ' : '') + idxToTime(i) + '–' + idxToEnd(i)}
                      style={{ height: 20, borderRadius: 3, cursor: 'crosshair', background: c ? (c.t === 'group' && c.band ? `${BAND_GREENS[c.band]}cc` : c.t === 'team' ? `${tierColor(c.tier)}cc` : `${COLORS[c.t]}99`) : 'rgba(255,255,255,0.04)', overflow: 'hidden', textAlign: 'center', fontSize: 9, fontWeight: 700, lineHeight: '20px', color: '#fff', textShadow: '0 1px 2px rgba(0,0,0,0.7)', letterSpacing: 0.3 }}>{cellLabel(c)}</div>
                  )
                })}
                {gap > 0 && <div key={`bt${i}`} style={{ fontSize: 8, color: 'rgba(255,255,255,0.25)', textAlign: 'right', paddingRight: 6, lineHeight: `${gapH}px` }}>{gap >= 10 ? `${gap}m` : ''}</div>}
                {gap > 0 && visDays.map(d => {
                  // A turnover strip that sits INSIDE a practice gets tinted too,
                  // or the block reads as several separate pieces.
                  const gs = toMin(DAY_SLOTS[i].end), ge = toMin(DAY_SLOTS[i + 1].start)
                  const tiv = teamIvs(d).find(iv => gs < iv.e && ge > iv.s)
                  return (
                    <div key={`b${d}-${i}`} title={tiv ? 'team practice' : `${gap}-minute turnover`} style={{ height: gapH, borderRadius: 2, background: tiv ? `${tierColor(tiv.tier)}55` : gap >= 10 ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.035)' }} />
                  )
                })}
              </Fragment>
              )
            })}
          </div>
          <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 12 }}>Click or drag to paint. Each row is one 30-minute lesson; the thin strip below it is the turnover (5 min, or 10 min after 4:05 PM). A 60-minute booking runs straight through one turnover and leaves the coach 10 minutes afterwards. Team practices are managed separately. Saving replaces the {mode === 'weekly' ? "coach's whole weekly template" : 'selected date'}; existing bookings are never affected.</p>
        </>
      )}
    </div>
  )
}
