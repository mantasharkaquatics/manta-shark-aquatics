'use client'

import { useState, useMemo } from 'react'

type Record_ = {
  id: string
  session_date: string
  created_at: string
  reviewed_at: string
  snapshot: Record<string, number>
  student: { id: string; full_name: string; current_level: string | null }
  coach: { first_name: string }
  reviewer: { first_name: string; last_name: string }
}
type Skill = { id: string; name: string; sort_order: number; level_id: string }

function barColor(pct: number): string {
  if (pct >= 70) return '#3ecf8e'
  if (pct >= 30) return '#f5a623'
  if (pct > 0) return '#f56565'
  return 'rgba(255,255,255,0.15)'
}

export default function AdminProgressHistoryClient({ records, skills }: {
  records: Record_[]
  skills: Skill[]
}) {
  const [search, setSearch] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const skillMap = useMemo(() => {
    const m: Record<string, string> = {}
    for (const s of skills) m[s.id] = s.name
    return m
  }, [skills])

  const filtered = useMemo(() => {
    if (!search || search.length < 2) return records
    const q = search.toLowerCase()
    return records.filter(r => r.student?.full_name?.toLowerCase().includes(q))
  }, [search, records])

  // 依學生分組
  const grouped = useMemo(() => {
    const g: Record<string, Record_[]> = {}
    for (const r of filtered) {
      const key = r.student?.id || 'unknown'
      if (!g[key]) g[key] = []
      g[key].push(r)
    }
    return Object.values(g)
  }, [filtered])

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white font-['Playfair_Display']">Progress History</h1>
        <p className="text-gray-400 mt-1">All approved progress records</p>
      </div>

      <div className="mb-6">
        <input
          type="text"
          placeholder="Search by student name..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full max-w-md bg-[#111d38] border border-[#1e3a6e] rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-[#c9a84c] transition-colors placeholder-gray-500"
        />
      </div>

      {grouped.length === 0 ? (
        <div className="bg-[#111d38] rounded-xl border border-[#1e3a6e] p-8 text-center text-gray-400">
          {search.length >= 2 ? 'No records found' : 'No approved records yet'}
        </div>
      ) : (
        <div className="space-y-6">
          {grouped.map(group => {
            const student = group[0].student
            return (
              <div key={student?.id}>
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-8 h-8 rounded-full bg-[#1e3a6e] flex items-center justify-center">
                    <span className="text-[#c9a84c] font-bold text-sm">{student?.full_name?.charAt(0)}</span>
                  </div>
                  <div>
                    <p className="text-white font-semibold">{student?.full_name}</p>
                    <p className="text-gray-500 text-xs">{group.length} sessions recorded</p>
                  </div>
                </div>

                <div className="space-y-2 ml-2">
                  {group.map(rec => {
                    const isOpen = expandedId === rec.id
                    const entries = Object.entries(rec.snapshot || {})
                    const avgPct = entries.length > 0
                      ? Math.round(entries.reduce((s, [, v]) => s + (v as number), 0) / entries.length)
                      : 0

                    return (
                      <div key={rec.id} className="bg-[#111d38] rounded-xl border border-[#1e3a6e] overflow-hidden">
                        <button
                          onClick={() => setExpandedId(isOpen ? null : rec.id)}
                          className="w-full flex items-center justify-between px-5 py-3 text-left hover:bg-[#1e3a6e]/20 transition-all"
                        >
                          <div className="flex items-center gap-4">
                            <div>
                              <p className="text-white text-sm font-medium">{rec.session_date}</p>
                              <p className="text-gray-500 text-xs">
                                教練 {rec.coach?.first_name} · 審核：{rec.reviewer?.first_name} {rec.reviewer?.last_name}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="flex items-center gap-2">
                              <div className="w-24 h-1.5 bg-white/10 rounded-full overflow-hidden">
                                <div className="h-full rounded-full" style={{ width: `${avgPct}%`, backgroundColor: barColor(avgPct) }} />
                              </div>
                              <span className="text-xs font-mono" style={{ color: barColor(avgPct) }}>{avgPct}%</span>
                            </div>
                            <span className="text-gray-500 text-xs">{isOpen ? '▲' : '▼'}</span>
                          </div>
                        </button>

                        {isOpen && (
                          <div className="border-t border-[#1e3a6e] px-5 py-4 space-y-2">
                            {entries.map(([skillId, pct]) => {
                              const p = pct as number
                              const color = barColor(p)
                              return (
                                <div key={skillId} className="flex items-center gap-3">
                                  <p className="text-gray-300 text-xs w-52 flex-shrink-0">{skillMap[skillId] || skillId}</p>
                                  <div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden">
                                    <div className="h-full rounded-full" style={{ width: `${p}%`, backgroundColor: color }} />
                                  </div>
                                  <span className="text-xs font-mono w-8 text-right" style={{ color }}>{p}%</span>
                                </div>
                              )
                            })}
                            <p className="text-gray-600 text-xs pt-2">
                              審核時間：{new Date(rec.reviewed_at).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                            </p>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
