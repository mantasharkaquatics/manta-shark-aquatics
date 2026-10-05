'use client'
import { useEffect, useState } from 'react'
import { masteryOf, masteryKey, MASTERY_COLOR } from '@/lib/mastery'
import { useLocale, useT, useTFor } from '@/lib/i18n/provider'
import { tDb, type Locale } from '@/lib/i18n'
import { BRAND } from '@/lib/brand'

// The monthly report sheet, as the family reads it on /dashboard. It lives in
// its own file so the admin Monthly Reports page can show the very same sheet
// (previewLang) before a month is sent.

const NAVY = BRAND.navy
const GOLD = BRAND.blue
const AMBER = BRAND.amber
const INTL_LOCALE: Record<string, string> = { en: 'en-US', 'zh-Hant': 'zh-TW', 'zh-Hans': 'zh-CN' }
const intlOf = (locale: string) => INTL_LOCALE[locale] || 'en-US'
function formatTime(t: string): string {
  const [h, m] = t.split(':').map(Number)
  const ampm = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 || 12
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`
}

export { REPORT_SHEET_CSS } from './report-sheet-css'

/** A monthly progress report, as the family reads it (lib/monthly-reports). */
export type MonthlyReport = {
  id: string
  studentId: string
  month: string
  data: {
    studentName: string; level: number | null; stage: 1 | 2 | 3 | null; coachName: string | null
    lessons: { key: string; date: string; start: string | null; courseTypeId: string | null; courseName: string; isTrial: boolean; attended: boolean }[]
    attended: number
    stages: { stage: number; percent: number; complete: boolean; skillCount: number }[]
    stageSkills: { id: string; name: string; start: number; end: number }[]
    otherSkills?: { id: string; name: string; stage: number; start: number; end: number }[]
    mastered: number
  }
  summary: string
  focus: string[]
  notes: { date: string; coachName: string | null; text: string }[]
  feedback: 'up' | 'down' | null
  feedbackComment: string | null
}

/* Option A, chosen by the owner 2026-09-30: line icons drawn here rather than
   emoji, so every phone shows the same thumb and the same question mark. */
const FbIcon = ({ kind, size = 30 }: { kind: 'up' | 'down'; size?: number }) => kind === 'up' ? (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#1f7a57" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M7 10v11H4a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1h3z" />
    <path d="M7 10l4-7a2.5 2.5 0 0 1 2.5 2.8L13 9h5.6a2 2 0 0 1 2 2.4l-1.5 7.6a2.5 2.5 0 0 1-2.5 2H7" />
  </svg>
) : (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#2050a0" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="9.5" />
    <path d="M9.3 9.2a2.8 2.8 0 1 1 3.9 2.6c-.8.4-1.2.9-1.2 1.8v.6" />
    <circle cx="12" cy="17.2" r=".6" fill="#2050a0" />
  </svg>
)

/* The family's answer is "clear" or "I have a question" -- the owner swapped the
   thumbs-down for a question on 2026-09-30, so a family with a doubt says so
   instead of grading us. Stored as 'up' / 'down'. */
export default function MonthlyReportSheet({ studentName, reports, initialId, onClose, onFeedback, previewLang }: {
  studentName: string
  reports: MonthlyReport[]
  initialId: string
  onClose: () => void
  onFeedback?: (id: string, feedback: 'up' | 'down', comment: string) => void
  /** Admin preview (Monthly Reports): the sheet in this language, read-only. */
  previewLang?: Locale
}) {
  const ctxT = useT()
  const ctxLocale = useLocale()
  // Another language's text is fetched on demand (lib/i18n/load.ts).
  const tPreview = useTFor(previewLang || 'en')
  const t = previewLang ? tPreview : ctxT
  const locale: Locale = previewLang || ctxLocale
  const preview = !!previewLang
  const [id, setId] = useState(initialId)
  const [fb, setFb] = useState<'up' | 'down' | null>(null)
  const [comment, setComment] = useState('')
  const [fbState, setFbState] = useState<'idle' | 'sending' | 'done' | 'error'>('idle')
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  const r = reports.find(x => x.id === id) || reports[0]
  if (!r) return null
  const d = r.data

  const loc = intlOf(locale)
  const monthName = (m: string, withYear = true) => new Date(m + 'T12:00:00Z').toLocaleDateString(loc, withYear ? { year: 'numeric', month: 'long', timeZone: 'UTC' } : { month: 'long', timeZone: 'UTC' })
  const shortDate = (dt: string) => new Date(dt + 'T12:00:00Z').toLocaleDateString(loc, { month: 'numeric', day: 'numeric', weekday: 'short', timeZone: 'UTC' })
  const next = (() => { const x = new Date(r.month + 'T12:00:00Z'); x.setUTCMonth(x.getUTCMonth() + 2, 1); return x.toLocaleDateString(loc, { month: 'long', day: 'numeric', timeZone: 'UTC' }) })()
  const stageNow = d.stages.find(s => s.stage === d.stage)
  const card: React.CSSProperties = { background: '#fff', border: '1px solid #e3ebf6', borderRadius: '14px', padding: '16px' }
  const h: React.CSSProperties = { fontSize: '14px', fontWeight: 800, color: '#12254a', margin: '0 0 10px' }
  const answered = fbState === 'done' || (!!r.feedback && fbState === 'idle' && !fb)

  async function send() {
    if (!fb || preview) return
    setFbState('sending')
    const res = await fetch('/api/parent/monthly-reports', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: r.id, feedback: fb, comment }),
    }).catch(() => null)
    if (res && res.ok) { setFbState('done'); onFeedback?.(r.id, fb, comment) } else setFbState('error')
  }

  return (
    <div className="msa-sheet-back" onClick={onClose}>
      <div className="msa-sheet" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true"
        aria-label={t('monthly.sheetTitle', { name: studentName, month: monthName(r.month, false) })}>
        <div className="msa-sheet-head">
          <b>{t('monthly.sheetTitle', { name: studentName, month: monthName(r.month, false) })}</b>
          <button className="msa-sheet-x" onClick={onClose} aria-label={t('common.close')}>✕</button>
        </div>
        {preview && (
          <p style={{ margin: '-6px 0 12px', fontSize: '12px', color: '#8a5a00', background: '#fff3d6', border: '1px solid #f3d491', borderRadius: '8px', padding: '6px 10px' }}>
            Manager preview: this is the sheet the family opens once the month is sent. The answer buttons do nothing here.
          </p>
        )}
        {reports.length > 1 && (
          <div className="msa-month-tabs" role="tablist">
            {reports.map(x => (
              <button key={x.id} role="tab" aria-selected={x.id === r.id} className={'tap-auto' + (x.id === r.id ? ' on' : '')} onClick={() => { setId(x.id); setFb(null); setComment(''); setFbState('idle') }}>
                {monthName(x.month)}
              </button>
            ))}
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div className="msa-report-hero">
            <div className="msa-report-eyebrow">MANTA SHARK · {t('monthly.eyebrow')}</div>
            <div className="msa-report-name">{studentName}</div>
            <div className="msa-report-meta">{d.coachName ? t('monthly.meta', { month: monthName(r.month), coach: d.coachName }) : monthName(r.month)}</div>
            {d.level && (
              <span className="msa-report-pill">{t('level.badge', { n: d.level, name: t(`level.${d.level}.name`) })} · {t('dash.stageN', { n: d.stage || 1 })}</span>
            )}
          </div>

          <div style={card}>
            <p style={h}>{t('monthly.overview')}</p>
            <div className="msa-report-stats">
              <div><b>{d.attended}</b><span>{t('monthly.statLessons')}</span></div>
              {d.level && <div><b>{d.mastered}</b><span>{t('monthly.statMastered')}</span></div>}
              {d.level && stageNow && <div><b>{stageNow.percent}%</b><span>{t('monthly.statStage', { n: stageNow.stage })}</span></div>}
            </div>
            {r.summary && <p style={{ fontSize: '14px', color: '#16294a', lineHeight: 1.75, margin: '12px 0 0', whiteSpace: 'pre-wrap' }}>{r.summary}</p>}
          </div>

          {d.level && d.stages.length === 3 && (
            <div style={card}>
              <p style={h}>{t('monthly.levelProgress', { n: d.level })}</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {d.stages.map(s => (
                  <div key={s.stage}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#56647d', marginBottom: '4px' }}>
                      <span>{t('dash.stageN', { n: s.stage })}</span>
                      <span style={{ fontVariantNumeric: 'tabular-nums' }}>{s.complete ? '🎊 ' + t('monthly.stageDone') : s.percent === 0 && s.stage !== d.stage ? t('monthly.notStarted') : s.percent + '%'}</span>
                    </div>
                    <div className="msa-report-skill-bar"><i style={{ width: s.percent + '%', background: s.complete ? '#4caf72' : '#f0a020' }} /></div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {d.stageSkills.length > 0 && (
            <div style={card}>
              <p style={h}>{t('monthly.stageSkills', { n: d.stage || 1 })}</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {d.stageSkills.map(s => {
                  const m = masteryOf(s.end)
                  const up = masteryOf(s.end) > masteryOf(s.start)
                  return (
                    <div key={s.id} className="msa-report-skill">
                      <span className="msa-report-skill-name">
                        {tDb(locale, 'skills', s.id, s.name)}
                        {up && <em className="msa-report-up">↑ {t('monthly.improved')}</em>}
                      </span>
                      <span className="msa-report-skill-bar"><i style={{ width: Math.max(s.end, m === 0 ? 0 : 4) + '%', background: MASTERY_COLOR[m] }} /></span>
                      <span className="msa-report-skill-chip" style={{ color: MASTERY_COLOR[m], background: MASTERY_COLOR[m] + '1f' }}>{t(masteryKey(m))}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {(d.otherSkills?.length ?? 0) > 0 && (
            <div style={card}>
              <p style={h}>{t('monthly.otherSkills')}</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {d.otherSkills!.map(s => {
                  const m = masteryOf(s.end)
                  const up = masteryOf(s.end) > masteryOf(s.start)
                  return (
                    <div key={s.id} className="msa-report-skill">
                      <span className="msa-report-skill-name">
                        {tDb(locale, 'skills', s.id, s.name)}
                        <em style={{ fontStyle: 'normal', fontSize: '11px', color: '#8592a8', marginLeft: '6px' }}>{t('dash.stageN', { n: s.stage })}</em>
                        {up && <em className="msa-report-up">↑ {t('monthly.improved')}</em>}
                      </span>
                      <span className="msa-report-skill-bar"><i style={{ width: Math.max(s.end, m === 0 ? 0 : 4) + '%', background: MASTERY_COLOR[m] }} /></span>
                      <span className="msa-report-skill-chip" style={{ color: MASTERY_COLOR[m], background: MASTERY_COLOR[m] + '1f' }}>{t(masteryKey(m))}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {r.notes.length > 0 && (
            <div style={card}>
              <p style={h}>{t('monthly.notes')}</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {r.notes.map((n, i) => (
                  <div key={i} style={{ borderLeft: `3px solid ${GOLD}`, background: '#f6f9fd', borderRadius: '0 8px 8px 0', padding: '10px 12px' }}>
                    <div style={{ fontSize: '13.5px', color: '#16294a', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{n.text}</div>
                    <div style={{ fontSize: '12px', color: '#8592a8', marginTop: '4px' }}>{n.coachName ? t('monthly.noteBy', { date: shortDate(n.date), coach: n.coachName }) : shortDate(n.date)}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={card}>
            <p style={h}>{t('monthly.lessons')}</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {d.lessons.map(l => (
                <div key={l.key} style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', fontSize: '13px', color: '#16294a' }}>
                  <span>{shortDate(l.date)}{l.start ? ' ' + formatTime(l.start) : ''} · {l.isTrial ? t('common.assessment') : l.courseTypeId ? tDb(locale, 'course_types', l.courseTypeId, l.courseName) : l.courseName}</span>
                  <span style={{ flexShrink: 0, fontWeight: 700, color: l.attended ? '#1f7a57' : '#c0563f' }}>{l.attended ? t('monthly.attended') : t('monthly.absent')}</span>
                </div>
              ))}
            </div>
          </div>

          {r.focus.length > 0 && (
            <div style={card}>
              <p style={h}>{t('monthly.focus')}</p>
              <ul style={{ margin: 0, paddingLeft: '20px', listStyle: 'disc', display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '13.5px', color: '#16294a', lineHeight: 1.6 }}>
                {r.focus.map((f, i) => <li key={i}>{f}</li>)}
              </ul>
            </div>
          )}

          <div style={{ ...card, textAlign: 'center' }}>
            {answered ? (
              <p style={{ margin: 0, fontSize: '13.5px', color: '#1f7a57', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                <FbIcon kind={(fbState === 'done' ? fb : r.feedback) === 'up' ? 'up' : 'down'} size={22} />{t('monthly.fb.thanks')}
              </p>
            ) : (<>
              <p style={{ ...h, margin: '0 0 10px' }}>{t('monthly.fb.q')}</p>
              <div style={{ display: 'flex', justifyContent: 'center', gap: '10px' }}>
                {(['up', 'down'] as const).map(v => (
                  <button key={v} className={'msa-fb' + (fb === v ? ' on' : '')} onClick={() => setFb(v)}
                    aria-pressed={fb === v}>
                    <FbIcon kind={v} /><span>{t(v === 'up' ? 'monthly.fb.up' : 'monthly.fb.down')}</span>
                  </button>
                ))}
              </div>
              {fb && (<>
                <textarea value={comment} onChange={e => setComment(e.target.value.slice(0, 1000))} rows={3}
                  placeholder={t(fb === 'down' ? 'monthly.fb.placeholderQ' : 'monthly.fb.placeholder')} aria-label={t(fb === 'down' ? 'monthly.fb.placeholderQ' : 'monthly.fb.placeholder')}
                  style={{ width: '100%', marginTop: '12px', borderRadius: '10px', border: '1px solid #d5deeb', padding: '10px 12px', fontSize: '16px', fontFamily: 'inherit', color: '#16294a', resize: 'vertical', boxSizing: 'border-box' }} />
                <button onClick={send} disabled={fbState === 'sending'}
                  style={{ marginTop: '10px', border: 0, borderRadius: '10px', padding: '11px 22px', background: AMBER, color: NAVY, fontWeight: 800, fontSize: '14px', cursor: 'pointer', fontFamily: 'inherit' }}>
                  {t('monthly.fb.send')}
                </button>
                {fbState === 'error' && <p style={{ margin: '8px 0 0', fontSize: '12.5px', color: '#c0563f' }}>{t('monthly.fb.error')}</p>}
              </>)}
              <p style={{ margin: '10px 0 0', fontSize: '11.5px', color: '#8592a8' }}>{t('monthly.fb.note')}</p>
            </>)}
          </div>

          <p style={{ textAlign: 'center', fontSize: '11.5px', color: '#8592a8', margin: '4px 0 0', lineHeight: 1.6 }}>
            {t('monthly.footer')}<br />{t('monthly.next', { date: next })}
          </p>
        </div>
      </div>
    </div>
  )
}
