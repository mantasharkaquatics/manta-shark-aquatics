'use client'

import { useState, useEffect } from 'react'

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const GRID_START = 6 * 60   // 06:00
const GRID_END = 21 * 60    // 21:00
const SLOTS = (GRID_END - GRID_START) / 30

const COLORS: Record<string, string> = { private: '#c9a84c', group: '#4caf72', team: '#e05a4a' }

type Cell = { t: 'private' | 'group' | 'team'; tier?: string } | null
type Brush = 'private' | 'group' | 'team' | 'erase'

const idxToTime = (i: number) => {
  const m = GRID_START + i * 30
  return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0')
}
const timeToIdx = (t: string) => {
  const [h, m] = t.split(':').map(Number)
  return (h * 60 + m - GRID_START) / 30
}

export default function ZonesEditorPage() {
  const [coaches, setCoaches] = useState<{ id: string; first_name: string; last_name: string }[]>([])
  const [coachId, setCoachId] = useState('')
  const [tiers, setTiers] = useState<{ id: string; name: string }[]>([])
  const [legacy, setLegacy] = useState<{ day_of_week: number; start_time: string; end_time: string }[]>([])
  const [grid, setGrid] = useState<Cell[][]>(() => Array.from({ length: 7 }, () => Array(SLOTS).fill(null)))
  const [brush, setBrush] = useState<Brush>('private')
  const [brushTier, setBrushTier] = useState('')
  const [painting, setPainting] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [hasZones, setHasZones] = useState(false)

  useEffect(() => {
    fetch('/api/admin/zones').then(r => r.json()).then(d => setCoaches(d.coaches || []))
    const up = () => setPainting(false)
    window.addEventListener('mouseup', up)
    return () => window.removeEventListener('mouseup', up)
  }, [])

  useEffect(() => {
    if (!coachId) return
    setMsg(null); setDirty(false)
    fetch(`/api/admin/zones?coach_id=${coachId}`).then(r => r.json()).then(d => {
      setTiers(d.tiers || [])
      setLegacy(d.legacy || [])
      if ((d.tiers || []).length > 0 && !brushTier) setBrushTier(d.tiers[0].id)
      const g: Cell[][] = Array.from({ length: 7 }, () => Array(SLOTS).fill(null))
      for (const z of d.weekly || []) {
        const s = timeToIdx(String(z.start_time).slice(0, 5))
        const e = timeToIdx(String(z.end_time).slice(0, 5))
        for (let i = Math.max(0, s); i < Math.min(SLOTS, e); i++) {
          g[z.weekday][i] = { t: z.zone_type, tier: z.team_tier_id || undefined }
        }
      }
      setGrid(g)
      setHasZones((d.weekly || []).length > 0)
    })
  }, [coachId])

  function paint(day: number, idx: number) {
    setGrid(prev => {
      const g = prev.map(row => [...row])
      g[day][idx] = brush === 'erase' ? null : { t: brush, tier: brush === 'team' ? brushTier : undefined }
      return g
    })
    setDirty(true); setMsg(null)
  }

  function loadLegacyAsPrivate() {
    const g: Cell[][] = Array.from({ length: 7 }, () => Array(SLOTS).fill(null))
    for (const a of legacy) {
      const s = timeToIdx(String(a.start_time).slice(0, 5))
      const e = timeToIdx(String(a.end_time).slice(0, 5))
      for (let i = Math.max(0, s); i < Math.min(SLOTS, e); i++) g[a.day_of_week][i] = { t: 'private' }
    }
    setGrid(g); setDirty(true); setMsg(null)
  }

  function compress(): { zone_type: string; weekday: number; start_time: string; end_time: string; team_tier_id?: string }[] {
    const out: any[] = []
    for (let d = 0; d < 7; d++) {
      let i = 0
      while (i < SLOTS) {
        const c = grid[d][i]
        if (!c) { i++; continue }
        let j = i + 1
        while (j < SLOTS && grid[d][j] && grid[d][j]!.t === c.t && grid[d][j]!.tier === c.tier) j++
        out.push({ zone_type: c.t, weekday: d, start_time: idxToTime(i), end_time: idxToTime(j), team_tier_id: c.tier })
        i = j
      }
    }
    return out
  }

  async function save() {
    const zones = compress()
    for (const z of zones) {
      if (z.zone_type === 'team') {
        const dur = (timeToIdx(z.end_time) - timeToIdx(z.start_time)) * 30
        if (dur % 90 !== 0) { setMsg({ ok: false, text: `Team block ${DAY_NAMES[z.weekday]} ${z.start_time}–${z.end_time} must be a multiple of 90 minutes` }); return }
      }
    }
    setSaving(true); setMsg(null)
    const res = await fetch('/api/admin/zones', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ coach_id: coachId, zones }),
    })
    const data = await res.json()
    setSaving(false)
    if (!res.ok) { setMsg({ ok: false, text: data.error || 'Save failed' }); return }
    setDirty(false); setHasZones(zones.length > 0)
    setMsg({ ok: true, text: `Saved ${data.count} zone block(s)` })
  }

  const tierName = (id?: string) => tiers.find(t => t.id === id)?.name || ''

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
        {coachId && !hasZones && (
          <span style={{ fontSize: 12, color: '#e8883a' }}>
            This coach is on the legacy hours table (all course types).{legacy.length > 0 && <> <button onClick={loadLegacyAsPrivate} style={{ color: '#c9a84c', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, textDecoration: 'underline', padding: 0 }}>Copy current hours as Private zones</button></>}
          </span>
        )}
      </div>

      {coachId && (
        <>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 14 }}>
            {(['private', 'group', 'team'] as const).map(b => (
              <button key={b} onClick={() => setBrush(b)}
                style={{ padding: '8px 14px', borderRadius: 10, fontSize: 12, fontWeight: 700, textTransform: 'capitalize', cursor: 'pointer', border: brush === b ? `2px solid ${COLORS[b]}` : '1px solid rgba(255,255,255,0.15)', background: brush === b ? `${COLORS[b]}22` : 'transparent', color: COLORS[b] }}>
                {b === 'private' ? 'Private (1-on-1 / 1-on-2)' : b === 'group' ? 'Group (1-on-4)' : 'Team'}
              </button>
            ))}
            {brush === 'team' && (
              <select value={brushTier} onChange={e => setBrushTier(e.target.value)}
                style={{ background: '#1a2744', color: '#e05a4a', border: '1px solid rgba(224,90,74,0.4)', borderRadius: 10, padding: '8px 10px', fontSize: 12, fontWeight: 700 }}>
                {tiers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            )}
            <button onClick={() => setBrush('erase')}
              style={{ padding: '8px 14px', borderRadius: 10, fontSize: 12, fontWeight: 700, cursor: 'pointer', border: brush === 'erase' ? '2px solid rgba(255,255,255,0.6)' : '1px solid rgba(255,255,255,0.15)', background: brush === 'erase' ? 'rgba(255,255,255,0.1)' : 'transparent', color: 'rgba(255,255,255,0.7)' }}>Eraser</button>
            <div style={{ flex: 1 }} />
            <button onClick={save} disabled={!dirty || saving}
              style={{ padding: '10px 22px', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: dirty ? 'pointer' : 'not-allowed', border: 'none', background: dirty ? '#c9a84c' : 'rgba(255,255,255,0.1)', color: dirty ? '#0d1529' : 'rgba(255,255,255,0.3)' }}>
              {saving ? 'Saving…' : 'Save Template'}
            </button>
          </div>

          {msg && <div style={{ marginBottom: 12, padding: '10px 14px', borderRadius: 10, fontSize: 13, background: msg.ok ? 'rgba(134,239,172,0.1)' : 'rgba(224,90,74,0.1)', border: msg.ok ? '1px solid rgba(134,239,172,0.3)' : '1px solid rgba(224,90,74,0.4)', color: msg.ok ? '#86efac' : '#e05a4a' }}>{msg.text}</div>}

          <div style={{ display: 'grid', gridTemplateColumns: '52px repeat(7, 1fr)', gap: 2, userSelect: 'none' }}>
            <div />
            {DAY_NAMES.map(d => <div key={d} style={{ textAlign: 'center', fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.5)', padding: '4px 0' }}>{d}</div>)}
            {Array.from({ length: SLOTS }, (_, i) => (
              <>
                <div key={`t${i}`} style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', textAlign: 'right', paddingRight: 6, lineHeight: '20px' }}>{i % 2 === 0 ? idxToTime(i) : ''}</div>
                {DAY_NAMES.map((_, d) => {
                  const c = grid[d][i]
                  return (
                    <div key={`c${d}-${i}`}
                      onMouseDown={() => { setPainting(true); paint(d, i) }}
                      onMouseEnter={() => { if (painting) paint(d, i) }}
                      title={c ? (c.t === 'team' ? tierName(c.tier) : c.t) + ' · ' + idxToTime(i) : idxToTime(i)}
                      style={{ height: 20, borderRadius: 3, cursor: 'crosshair', background: c ? `${COLORS[c.t]}${c.t === 'team' ? 'cc' : '99'}` : 'rgba(255,255,255,0.04)', borderTop: i % 2 === 0 ? '1px solid rgba(255,255,255,0.08)' : 'none' }} />
                  )
                })}
              </>
            ))}
          </div>
          <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 12 }}>Click or drag to paint. Team blocks must total 90-minute multiples. Saving replaces this coach's whole weekly template; existing bookings are never affected.</p>
        </>
      )}
    </div>
  )
}
