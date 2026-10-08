'use client'

import { LANGUAGE_LABELS } from '@/lib/ai/models'
import { MASTERY_LEVELS, MASTERY_VALUE, MASTERY_COLOR, MASTERY_FILL, masteryOf, masteryKey, UNLOCK_LEVEL, type Mastery } from '@/lib/mastery'
import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useT, useLocale } from '@/lib/i18n/provider'
import { tDb, dateTag, type Locale, type TFunction } from '@/lib/i18n'

type Record_ = {
  id: string
  session_date: string
  created_at: string
  reviewed_at: string
  snapshot: Record<string, number>
  student: { id: string; full_name: string; current_level: string | null }
  coach: { first_name: string }
  reviewer: { first_name: string; last_name: string }
  lesson_key: string
  note: {
    id: string
    transcript: string
    note: string
    language: string
    audio_seconds: number | null
    audio_url: string | null
  } | null
  edits: {
    id: string
    prev_note: string | null
    prev_snapshot: Record<string, number> | null
    edited_at: string
    editor: { first_name: string; last_name: string } | null
  }[]
}
type Skill = { id: string; name: string; sort_order: number; level_id: string }

/** Mastery chip text. Step 0 reads "Not taught" here, not the parent site's "Not taught yet". */
function masteryLabel(t: TFunction, m: Mastery): string {
  return m === 0 ? t('admin.progress.mastery0') : t(masteryKey(m))
}

/** The language a note was recorded in, in the admin's language. */
function languageLabel(t: TFunction, code: string): string {
  return LANGUAGE_LABELS[code] ? t(`admin.progress.lang.${code}`) : code
}

/** A date in the admin's language with the clock time kept as 12-hour English. */
function dateTimeLabel(iso: string, locale: Locale): string {
  const d = new Date(iso)
  const date = d.toLocaleDateString(dateTag(locale, 'en-US'), { month: 'short', day: 'numeric', year: 'numeric' })
  const time = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
  return date + (locale === 'en' ? ', ' : ' ') + time
}

function barColor(pct: number): string {
  if (pct >= 70) return '#3ecf8e'
  if (pct >= 30) return '#f5a623'
  if (pct > 0) return '#f56565'
  return 'rgba(255,255,255,0.15)'
}

/** Where the server is in the list: one page of reports, for a name search or all. */
type Pager = { page: number; pageSize: number; total: number; q: string }

export default function AdminProgressHistoryClient({ records, skills, pager, loadError = false }: {
  records: Record_[]
  skills: Skill[]
  pager: Pager
  /** A read failed: what is shown may be incomplete (no notes, no edits). */
  loadError?: boolean
}) {
  const t = useT()
  const locale = useLocale()
  const router = useRouter()
  // The search runs on the server (page.tsx), over every report, not only
  // the page on screen; Enter or the button applies it.
  const [search, setSearch] = useState(pager.q)
  const pages = Math.max(1, Math.ceil(pager.total / pager.pageSize))
  const go = (page: number, q = pager.q) => {
    const sp = new URLSearchParams()
    if (q.trim()) sp.set('q', q.trim())
    if (page > 1) sp.set('page', String(page))
    const qs = sp.toString()
    router.push('/admin/progress-history' + (qs ? '?' + qs : ''))
  }
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editNote, setEditNote] = useState('')
  const [editSnapshot, setEditSnapshot] = useState<Record<string, number>>({})
  const [saving, setSaving] = useState(false)
  const [editError, setEditError] = useState('')
  const [openHistory, setOpenHistory] = useState<string | null>(null)

  function startEdit(rec: Record_) {
    setEditingId(rec.id)
    setEditNote(rec.note?.note || '')
    setEditSnapshot({ ...(rec.snapshot || {}) })
    setEditError('')
  }

  async function saveEdit(rec: Record_) {
    setSaving(true)
    setEditError('')
    try {
      const res = await fetch('/api/admin/report-edit', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          history_id: rec.id,
          note_id: rec.note?.id || null,
          student_id: rec.student?.id,
          lesson_key: rec.lesson_key,
          note_text: editNote,
          snapshot: editSnapshot,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || t('admin.progress.err.saveFailed'))
      window.location.reload()
    } catch (err: any) {
      setEditError(err.message || t('admin.progress.err.saveFailed'))
      setSaving(false)
    }
  }

  const skillMap = useMemo(() => {
    const m: Record<string, string> = {}
    for (const s of skills) m[s.id] = tDb(locale, 'skills', s.id, s.name)
    return m
  }, [skills, locale])

  const filtered = records

  // Group by student
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
        <h1 className="text-2xl font-bold text-white font-['Playfair_Display']">{t('admin.progress.title')}</h1>
        <p className="text-gray-400 mt-1">{t('admin.progress.subtitle')}</p>
      </div>

      <form className="mb-6 flex flex-wrap gap-2" onSubmit={e => { e.preventDefault(); go(1, search) }}>
        <input
          type="text"
          placeholder={t('admin.progress.searchPlaceholder')}
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full max-w-md bg-[#111d38] border border-[#1e3a6e] rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-[#c9a84c] transition-colors placeholder-gray-500"
        />
        <button type="submit" className="px-4 py-2.5 rounded-lg border border-[#1e3a6e] text-gray-300 text-sm hover:border-[#c9a84c]/50">{t('admin.progress.search')}</button>
        {pager.q && (
          <button type="button" onClick={() => { setSearch(''); go(1, '') }} className="px-3 py-2.5 rounded-lg text-gray-500 text-sm hover:text-gray-300">{t('admin.progress.clearSearch')}</button>
        )}
      </form>

      {loadError && (
        <p className="mb-4 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-2 text-sm text-red-300">{t('admin.progress.err.load')}</p>
      )}

      {grouped.length === 0 ? (
        <div className="bg-[#111d38] rounded-xl border border-[#1e3a6e] p-8 text-center text-gray-400">
          {pager.q ? t('admin.progress.noMatches') : t('admin.progress.empty')}
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
                    <p className="text-gray-500 text-xs">{t('admin.progress.sessionsRecorded', { n: group.length })}</p>
                  </div>
                </div>

                <div className="space-y-2 ml-2">
                  {group.map(rec => {
                    const isOpen = expandedId === rec.id
                    const entries = Object.entries(rec.snapshot || {})
                    const selfCount = entries.filter(([, v]) => masteryOf(v as number) >= UNLOCK_LEVEL).length
                    const avgPct = entries.length > 0 ? Math.round(100 * selfCount / entries.length) : 0

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
                                {t('admin.coachName', { name: rec.coach?.first_name ?? '' })} · {t('admin.progress.reviewedBy', { name: `${rec.reviewer?.first_name ?? ''} ${rec.reviewer?.last_name ?? ''}` })}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="flex items-center gap-2">
                              <div className="w-24 h-1.5 bg-white/10 rounded-full overflow-hidden">
                                <div className="h-full rounded-full" style={{ width: `${avgPct}%`, backgroundColor: barColor(avgPct) }} />
                              </div>
                              <span className="text-xs font-mono" style={{ color: barColor(avgPct) }}>{selfCount}/{entries.length}</span>
                            </div>
                            <span className="text-gray-500 text-xs">{isOpen ? '▲' : '▼'}</span>
                          </div>
                        </button>

                        {isOpen && (
                          <div className="border-t border-[#1e3a6e] px-5 py-4 space-y-2">
                            <div className="flex items-center justify-between pb-1">
                              <span className="text-[11px] text-gray-500">
                                {rec.edits.length > 0 && t('admin.progress.editedOn', { date: new Date(rec.edits[0].edited_at).toLocaleDateString(dateTag(locale, 'en-US'), { month: 'short', day: 'numeric', year: 'numeric' }) })}
                              </span>
                              <span className="flex gap-2">
                                {editingId === rec.id ? (
                                  <>
                                    <button onClick={() => setEditingId(null)} className="px-3 py-1 rounded-lg border border-[#1e3a6e] text-gray-400 text-xs hover:text-white transition-colors">{t('common.cancel')}</button>
                                    <button onClick={() => saveEdit(rec)} disabled={saving} className="px-3 py-1 rounded-lg bg-[#c9a84c] text-[#0b1526] text-xs font-semibold disabled:opacity-40">{saving ? t('admin.progress.saving') : t('admin.progress.saveChanges')}</button>
                                  </>
                                ) : (
                                  <button onClick={() => startEdit(rec)} className="px-3 py-1 rounded-lg border border-[#1e3a6e] text-gray-400 text-xs hover:text-white transition-colors">{t('admin.progress.edit')}</button>
                                )}
                              </span>
                            </div>
                            {editingId === rec.id && editError && (
                              <p className="text-red-400 text-xs">{editError}</p>
                            )}
                            {rec.note && (
                              <div className="mb-4 pb-4 border-b border-[#1e3a6e] space-y-3">
                                <div className="flex items-center justify-between">
                                  <p className="text-[#c9a84c] text-xs font-semibold tracking-wide">{t('admin.progress.lessonNote')}</p>
                                  <p className="text-gray-500 text-xs">
                                    {t('admin.progress.recordedIn', { lang: languageLabel(t, rec.note.language) })}
                                    {rec.note.audio_seconds ? ` \u00b7 ${t('admin.progress.seconds', { n: rec.note.audio_seconds })}` : ''}
                                  </p>
                                </div>
                                {rec.note.audio_url && (
                                  <audio controls src={rec.note.audio_url} className="w-full" />
                                )}
                                {rec.note.transcript && (
                                  <div>
                                    <p className="text-gray-500 text-xs mb-1">{t('admin.progress.coachSaid')}</p>
                                    <p className="text-gray-300 text-xs leading-relaxed">{rec.note.transcript}</p>
                                  </div>
                                )}
                                {rec.note.note && (
                                  <div>
                                    <p className="text-gray-500 text-xs mb-1">{t('admin.progress.familyRead')}</p>
                                    {editingId === rec.id ? (
                                      <textarea
                                        value={editNote}
                                        onChange={e => setEditNote(e.target.value)}
                                        rows={4}
                                        className="w-full bg-[#0b1526] border border-[#1e3a6e] rounded-lg px-3 py-2 text-gray-200 text-xs leading-relaxed focus:outline-none focus:border-[#c9a84c]"
                                      />
                                    ) : (
                                      <p className="text-gray-200 text-xs leading-relaxed">{rec.note.note}</p>
                                    )}
                                  </div>
                                )}
                              </div>
                            )}
                            {entries.map(([skillId, pct]) => {
                              const p = pct as number
                              const color = barColor(p)
                              return (
                                <div key={skillId} className="flex items-center gap-3">
                                  <p className="text-gray-300 text-xs w-52 flex-shrink-0">{skillMap[skillId] || skillId}</p>
                                  {editingId === rec.id ? (
                                    <div className="flex-1 flex gap-1">
                                      {MASTERY_LEVELS.map(b => {
                                        const v = MASTERY_VALUE[b]
                                        const on = masteryOf(editSnapshot[skillId] as number) === b
                                        return (
                                        <button
                                          key={b}
                                          onClick={() => setEditSnapshot(prev => ({ ...prev, [skillId]: v }))}
                                          className="flex-1 rounded py-1 text-[10px] leading-tight border transition-colors"
                                          style={{
                                            borderColor: on ? MASTERY_COLOR[b] : 'rgba(255,255,255,0.12)',
                                            color: on ? MASTERY_COLOR[b] : 'rgba(255,255,255,0.45)',
                                          }}
                                        >{masteryLabel(t, b)}</button>
                                        )
                                      })}
                                    </div>
                                  ) : (
                                    <>
                                      <div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden">
                                        <div className="h-full rounded-full" style={{ width: `${MASTERY_FILL[masteryOf(p)]}%`, backgroundColor: MASTERY_COLOR[masteryOf(p)] }} />
                                      </div>
                                      <span className="text-xs w-24 text-right" style={{ color: MASTERY_COLOR[masteryOf(p)] }}>{masteryLabel(t, masteryOf(p))}</span>
                                    </>
                                  )}
                                </div>
                              )
                            })}
                            {rec.edits.length > 0 && (
                              <div className="pt-2">
                                <button
                                  onClick={() => setOpenHistory(openHistory === rec.id ? null : rec.id)}
                                  className="text-gray-500 text-xs hover:text-gray-300 transition-colors"
                                >
                                  {openHistory === rec.id
                                    ? t('admin.progress.hideVersions')
                                    : t(rec.edits.length === 1 ? 'admin.progress.showVersion' : 'admin.progress.showVersions', { n: rec.edits.length })}
                                </button>
                                {openHistory === rec.id && (
                                  <div className="mt-2 space-y-3">
                                    {rec.edits.map(ed => (
                                      <div key={ed.id} className="border-l-2 border-[#1e3a6e] pl-3">
                                        <p className="text-gray-500 text-xs">
                                          {t('admin.progress.before', { date: dateTimeLabel(ed.edited_at, locale) })}
                                          {ed.editor ? ` \u00b7 ${ed.editor.first_name} ${ed.editor.last_name || ''}`.trimEnd() : ''}
                                        </p>
                                        {ed.prev_note && (
                                          <p className="text-gray-400 text-xs leading-relaxed mt-1">{ed.prev_note}</p>
                                        )}
                                        {ed.prev_snapshot && (
                                          <p className="text-gray-500 text-xs mt-1">
                                            {Object.entries(ed.prev_snapshot).map(([sid, v]) => `${skillMap[sid] || sid} ${v}%`).join(' \u00b7 ')}
                                          </p>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )}
                            <p className="text-gray-600 text-xs pt-2">
                              {t('admin.progress.reviewedAt', { date: dateTimeLabel(rec.reviewed_at, locale) })}
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

      {pages > 1 && (
        <div className="mt-8 flex items-center justify-center gap-3 text-sm">
          <button onClick={() => go(pager.page - 1)} disabled={pager.page <= 1}
            className="px-3 py-1.5 rounded-lg border border-[#1e3a6e] text-gray-300 disabled:opacity-40">‹ {t('admin.progress.newer')}</button>
          <span className="text-gray-500">{t('admin.progress.pageOf', { page: pager.page, pages })}</span>
          <button onClick={() => go(pager.page + 1)} disabled={pager.page >= pages}
            className="px-3 py-1.5 rounded-lg border border-[#1e3a6e] text-gray-300 disabled:opacity-40">{t('admin.progress.older')} ›</button>
        </div>
      )}
    </div>
  )
}
