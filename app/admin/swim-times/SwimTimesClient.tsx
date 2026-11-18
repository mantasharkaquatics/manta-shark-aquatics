'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import AlertModal from '@/components/AlertModal'
import { useT, useLocale } from '@/lib/i18n/provider'
import { dateTag } from '@/lib/i18n'

/* Admin > 成績 (owner, 2026-11-17; lib/swim-times.ts). A meet's swimmers
   were typed by name at the meet, not picked from the school's students, so
   each one is linked here by hand (a suggestion first: same birth date, then
   the closest name). "Show to families" puts the meet's results on the
   linked swimmers' 成績 pages; until then families see nothing of it.
   Lesson test times need nothing here: they are confirmed with their report
   in Reviews. */

type Swimmer = { id: number; name: string; birthdate: string | null; gender: string | null; student_id: string | null; entries: number }
type Meet = { id: number; title: string; meet_date: string | null; published: boolean; swimmers: Swimmer[] }
type Student = { id: string; name: string; dob: string | null; family: string }

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9一-鿿]+/g, ' ').trim()
/** How alike two names are: shared words, initials and a shared start. */
function nameScore(a: string, b: string): number {
  const x = norm(a).split(' ').filter(Boolean), y = norm(b).split(' ').filter(Boolean)
  if (!x.length || !y.length) return 0
  let s = 0
  for (const w of x) {
    if (y.includes(w)) s += 3
    else if (y.some(v => v.startsWith(w) || w.startsWith(v))) s += 2
    else if (w.length === 1 && y.some(v => v[0] === w)) s += 1
  }
  return s
}

const field = 'w-full rounded-lg border border-[#1e3a6e] bg-[#0d1529] px-3 py-2 text-white text-sm focus:outline-none focus:border-[#c9a84c]'

export default function SwimTimesClient() {
  const t = useT()
  const locale = useLocale()
  const [meets, setMeets] = useState<Meet[] | null>(null)
  const [students, setStudents] = useState<Student[]>([])
  const [missing, setMissing] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [alertMsg, setAlertMsg] = useState<string | null>(null)
  const [query, setQuery] = useState<Record<number, string>>({})

  const load = useCallback(async () => {
    const r = await fetch('/api/admin/meets', { cache: 'no-store' }).catch(() => null)
    const d = r ? await r.json().catch(() => ({})) : {}
    if (!r || !r.ok) { if (d.missing) setMissing(true); else setAlertMsg(t('admin.times.err.load')); return }
    setMeets(d.meets || []); setStudents(d.students || [])
  }, [t])
  useEffect(() => { const id = setTimeout(load, 0); return () => clearTimeout(id) }, [load])

  const byId = useMemo(() => new Map(students.map(s => [s.id, s])), [students])
  const suggest = (sw: Swimmer): Student[] => {
    const q = (query[sw.id] ?? '').trim()
    const scored = students.map(s => ({ s, n: (sw.birthdate && s.dob === sw.birthdate ? 10 : 0) + nameScore(q || sw.name, s.name) + (q && norm(s.family).includes(norm(q)) ? 2 : 0) }))
      .filter(x => x.n > 0).sort((a, b) => b.n - a.n)
    return scored.slice(0, 5).map(x => x.s)
  }

  async function post(body: unknown, key: string) {
    setBusy(key)
    const r = await fetch('/api/admin/meets', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null)
    setBusy(null)
    if (!r || !r.ok) { setAlertMsg(t('admin.times.err.save')); return false }
    return true
  }
  const link = async (sw: Swimmer, studentId: string | null) => {
    if (!(await post({ link: { swimmer_id: sw.id, student_id: studentId } }, 'l' + sw.id))) return
    setMeets(ms => (ms || []).map(m => ({ ...m, swimmers: m.swimmers.map(x => (x.id === sw.id ? { ...x, student_id: studentId } : x)) })))
    setQuery(q => { const n = { ...q }; delete n[sw.id]; return n })
  }
  const publish = async (m: Meet, on: boolean) => {
    if (!(await post({ publish: { meet_id: m.id, published: on } }, 'p' + m.id))) return
    setMeets(ms => (ms || []).map(x => (x.id === m.id ? { ...x, published: on } : x)))
  }
  const day = (d: string | null) => (d ? new Date(d + 'T12:00:00').toLocaleDateString(dateTag(locale), { year: 'numeric', month: 'short', day: 'numeric' }) : '')

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold text-white">{t('admin.times.title')}</h1>
      <p className="text-gray-400 text-sm mt-1 mb-6">{t('admin.times.sub')}</p>
      {missing && <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 text-amber-200 text-sm p-3">{t('admin.times.migration')}</p>}
      {!missing && meets === null && <p className="text-gray-400 text-sm">{t('admin.times.loading')}</p>}
      {meets && meets.length === 0 && <p className="text-gray-400 text-sm">{t('admin.times.none')}</p>}
      <div className="space-y-6">
        {(meets || []).map(m => {
          const linked = m.swimmers.filter(s => s.student_id).length
          return (
            <section key={m.id} className="rounded-xl border border-[#1e3a6e] bg-[#111d38] p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-white font-bold text-lg">{m.title}</h2>
                  <p className="text-gray-400 text-xs mt-0.5">{day(m.meet_date)} · {t('admin.times.linked', { linked, total: m.swimmers.length })}</p>
                </div>
                <button type="button" disabled={busy === 'p' + m.id} onClick={() => publish(m, !m.published)}
                  className={`px-4 py-2 rounded-lg text-sm font-bold ${m.published ? 'border border-green-500/50 text-green-300' : 'bg-[#c9a84c] text-[#1a2744]'}`}>
                  {m.published ? t('admin.times.shown') : t('admin.times.show')}
                </button>
              </div>
              {m.published && <p className="text-green-300/80 text-xs mt-2">{t('admin.times.shownHint')}</p>}
              <div className="mt-4 divide-y divide-white/5">
                {m.swimmers.map(sw => {
                  const st = sw.student_id ? byId.get(sw.student_id) : null
                  return (
                    <div key={sw.id} className="py-2.5 flex flex-wrap items-center gap-3">
                      <div className="w-44 min-w-0">
                        <p className="text-white text-sm font-semibold truncate">{sw.name}</p>
                        <p className="text-gray-500 text-[11px]">{[sw.birthdate, sw.gender, t('admin.times.events', { n: sw.entries })].filter(Boolean).join(' · ')}</p>
                      </div>
                      {sw.student_id ? (
                        <div className="flex-1 flex items-center gap-3 min-w-0">
                          <span className="text-green-300 text-sm truncate">✓ {st ? st.name : sw.student_id}{st?.family ? <span className="text-gray-500"> · {st.family}</span> : null}</span>
                          <button type="button" disabled={busy === 'l' + sw.id} onClick={() => link(sw, null)} className="text-gray-400 text-xs underline">{t('admin.times.unlink')}</button>
                        </div>
                      ) : (
                        <div className="flex-1 min-w-[240px]">
                          <input className={field} placeholder={t('admin.times.search')} value={query[sw.id] ?? ''}
                            onChange={e => setQuery(q => ({ ...q, [sw.id]: e.target.value }))} />
                          <div className="flex flex-wrap gap-1.5 mt-1.5">
                            {suggest(sw).map(s => (
                              <button key={s.id} type="button" disabled={busy === 'l' + sw.id} onClick={() => link(sw, s.id)}
                                className="px-2.5 py-1 rounded-full border border-[#c9a84c]/50 text-[#c9a84c] text-xs">
                                {s.name}{s.dob ? ` · ${s.dob}` : ''}{s.family ? ` · ${s.family}` : ''}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </section>
          )
        })}
      </div>
      <AlertModal message={alertMsg} onClose={() => setAlertMsg(null)} />
    </div>
  )
}
