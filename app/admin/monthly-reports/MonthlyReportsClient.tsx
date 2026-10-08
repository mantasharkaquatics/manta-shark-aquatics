'use client'

import { useCallback, useEffect, useState } from 'react'
import AlertModal from '@/components/AlertModal'
import { formatTime12h } from '@/lib/date'
import { MASTERY_COLOR, masteryOf, masteryKey, type Mastery } from '@/lib/mastery'
import { LEVEL_NAMES } from '@/lib/levels'
import { FONT_BODY } from '@/lib/brand'
import { tDb, dateTag, type Locale, type TFunction } from '@/lib/i18n'
import { useT, useLocale } from '@/lib/i18n/provider'
import MonthlyReportSheet, { REPORT_SHEET_CSS, type MonthlyReport } from '@/app/(public)/dashboard/MonthlyReportSheet'

type Report = {
  id: string; student_id: string; month: string; status: 'draft' | 'approved' | 'sent'
  data: any; summary: string; focus: string
  summary_i18n: Record<string, string> | null; focus_i18n: Record<string, string> | null
  generated_at: string; approved_at: string | null; sent_at: string | null; emailed_at: string | null
  feedback: 'up' | 'down' | null; feedback_comment: string | null; feedback_at: string | null
  studentName: string; parentName: string
  /** False when the family has no email address on file. */
  parentHasEmail?: boolean
  noteTexts: { date: string; coachName: string | null; text: string }[]
  previewNotes: { date: string; coachName: string | null; text: string; language: string; translations: Record<string, string> }[]
}
// Each language is named in itself, whatever the admin's own language is.
const PREVIEW_LANGS: { lang: Locale; labelKey: string }[] = [
  { lang: 'en', labelKey: 'locale.en.native' }, { lang: 'zh-Hant', labelKey: 'locale.zh-Hant.native' }, { lang: 'zh-Hans', labelKey: 'locale.zh-Hans.native' },
]
type Payload = { month: string; months: string[]; today: string; reports: Report[]; eligible: number | null; sendsFrom: string }

const monthLabel = (m: string, locale: Locale) => new Date(m + 'T12:00:00Z').toLocaleDateString(dateTag(locale, 'en-US'), { year: 'numeric', month: 'long', timeZone: 'UTC' })
const dayLabel = (d: string, locale: Locale) => new Date(d + 'T12:00:00Z').toLocaleDateString(dateTag(locale, 'en-US'), { month: 'short', day: 'numeric', weekday: 'short', timeZone: 'UTC' })

/** Error codes from /api/admin/monthly-reports that have their own line. */
const MONTHLY_ERROR_KEYS: Record<string, string> = {
  no_email: 'admin.monthly.email.noAddress',
  email_failed: 'admin.monthly.email.failed',
  already_sent: 'admin.monthly.err.alreadySent',
}

/** Mastery chip text. Step 0 reads "Not taught" here, not the parent site's "Not taught yet". */
function masteryLabel(t: TFunction, m: Mastery): string {
  return m === 0 ? t('admin.progress.mastery0') : t(masteryKey(m))
}

/** A translated line whose {n} is shown in bold, e.g. "<b>3</b> approved". The
 *  {n} placeholder is left unfilled by t() and split on here. */
function withBold(text: string, n: number, className?: string) {
  const [before, ...rest] = text.split('{n}')
  return <>{before}<b className={className}>{n}</b>{rest.join('{n}')}</>
}

/**
 * Every family's monthly report, written by the model in English and read here
 * before anything leaves. Nothing is sent until every report of the month is
 * approved and the month is over; the last approval sends them all.
 */
export default function MonthlyReportsClient() {
  const t = useT()
  const locale = useLocale()
  const [month, setMonth] = useState<string | null>(null)
  const [data, setData] = useState<Payload | null>(null)
  const [edits, setEdits] = useState<Record<string, { summary: string; focus: string }>>({})
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const [busy, setBusy] = useState<string | null>(null)
  const [progress, setProgress] = useState<string | null>(null)
  const [alertMsg, setAlertMsg] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [preview, setPreview] = useState<{ id: string; lang: Locale } | null>(null)

  /** The report as the family's dashboard receives it, in one language. Until
   *  approval there is no translation, so the (edited) English stands in. */
  function asFamily(r: Report, lang: Locale): MonthlyReport {
    const e = edits[r.id]
    const summary = (lang !== 'en' && r.summary_i18n?.[lang]) || (e?.summary ?? r.summary)
    const focus = (lang !== 'en' && r.focus_i18n?.[lang]) || (e?.focus ?? r.focus)
    return {
      id: r.id, studentId: r.student_id, month: r.month, data: r.data,
      summary, focus: String(focus || '').split('\n').map(l => l.trim()).filter(Boolean),
      notes: (r.previewNotes || []).map(n => ({
        date: n.date, coachName: n.coachName,
        text: String((n.language === lang ? n.text : (n.translations[lang] || n.text)) || '').trim(),
      })).filter(n => n.text),
      feedback: r.feedback, feedbackComment: r.feedback_comment,
    }
  }

  const load = useCallback(async (m: string | null) => {
    const r = await fetch('/api/admin/monthly-reports' + (m ? '?month=' + m : '')).catch(() => null)
    if (!r || !r.ok) { setAlertMsg(t('admin.monthly.err.load')); return }
    const j: Payload = await r.json()
    setData(j)
    setMonth(j.month)
    setEdits({})
    // eslint-disable-next-line react-hooks/exhaustive-deps -- t only words the alert; a language switch must not reload and drop unsaved edits
  }, [])
  useEffect(() => { load(null) }, [load])

  async function post(body: object) {
    const r = await fetch('/api/admin/monthly-reports', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    }).catch(() => null)
    if (!r) { setAlertMsg(t('admin.reviews.err.offline')); return null }
    const j = await r.json().catch(() => ({}))
    // The route's words are English; the cases the desk meets get ours.
    if (!r.ok) { setAlertMsg(t(MONTHLY_ERROR_KEYS[String(j.code || '')] || 'admin.monthly.err.generic')); return null }
    return j
  }

  async function generate() {
    if (!month) return
    setBusy('generate')
    let total = 0
    let misses = 0
    for (let round = 0; round < 40; round++) {
      setProgress(t('admin.monthly.writing', { n: total }))
      // A dropped connection mid-batch is retried: what was written stays written.
      const r = await fetch('/api/admin/monthly-reports', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'generate', month }),
      }).catch(() => null)
      const j = r && r.ok ? await r.json().catch(() => null) : null
      if (!j) {
        if (++misses <= 2) continue
        setAlertMsg(t('admin.monthly.err.stopped'))
        break
      }
      total += j.written
      if (j.remaining === 0 || j.written + j.failed === 0) {
        if (j.failed) setAlertMsg(t('admin.monthly.err.someFailed', { n: j.failed }))
        break
      }
    }
    setProgress(null)
    setBusy(null)
    await load(month)
  }

  /* The family's email for this month, now: one that failed or has not gone
     yet, or again for a family who says it never came. */
  async function emailNow(r: Report) {
    setBusy(r.id + 'email')
    const j = await post({ action: 'email', id: r.id })
    setBusy(null)
    if (j) {
      setNotice(t('admin.monthly.email.done'))
      await load(month)
    }
  }

  async function act(r: Report, action: 'save' | 'approve' | 'unapprove' | 'regenerate') {
    const e = edits[r.id] || { summary: r.summary, focus: r.focus }
    setBusy(r.id + action)
    const j = await post({ action, id: r.id, summary: e.summary, focus: e.focus })
    setBusy(null)
    if (j) {
      if (action === 'approve' && j.sent?.some((s: any) => s.sent > 0)) setNotice(t('admin.monthly.allSent'))
      await load(month)
    }
  }

  if (!data) return <div className="p-8 text-gray-400 text-sm">{t('common.loading')}</div>

  const reports = data.reports
  const drafts = reports.filter(r => r.status === 'draft').length
  const approved = reports.filter(r => r.status === 'approved').length
  const sent = reports.filter(r => r.status === 'sent').length
  // Released, but the family's email has not gone (yet, or it failed).
  const notEmailed = reports.filter(r => r.status === 'sent' && !r.emailed_at).length
  const missing = data.eligible == null ? 0 : Math.max(0, data.eligible - reports.length)
  const monthOver = data.today >= data.sendsFrom
  // The month's last day. A report written before it saw only part of the month.
  const lastDay = new Date(Date.parse(data.sendsFrom + 'T12:00:00Z') - 86_400_000).toISOString().slice(0, 10)
  const writtenOn = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' })

  return (
    <div className="p-6 md:p-8 max-w-5xl">
      <AlertModal message={alertMsg} onClose={() => setAlertMsg(null)} />
      <AlertModal title={t('admin.monthly.sentTitle')} message={notice} onClose={() => setNotice(null)} />
      <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">{t('admin.monthly.title')}</h1>
          <p className="text-gray-400 text-sm mt-1">{t('admin.monthly.subtitle')}</p>
        </div>
        <select value={month || ''} onChange={e => { setMonth(e.target.value); load(e.target.value) }}
          className="bg-[#111d38] border border-[#1e3a6e] text-white text-sm rounded-lg px-3 py-2">
          {data.months.map(m => <option key={m} value={m}>{monthLabel(m, locale)}</option>)}
        </select>
      </div>

      <div className="rounded-xl border border-[#1e3a6e] bg-[#111d38] p-4 mb-6 flex flex-wrap items-center gap-x-6 gap-y-3">
        <span className="text-sm text-gray-300">{withBold(data.eligible != null ? t('admin.monthly.stat.writtenOf', { total: data.eligible }) : t('admin.monthly.stat.written'), reports.length, 'text-white')}</span>
        <span className="text-sm text-amber-300">{withBold(t('admin.monthly.stat.waiting'), drafts)}</span>
        <span className="text-sm text-emerald-300">{withBold(t('admin.monthly.stat.approved'), approved)}</span>
        <span className="text-sm text-sky-300">{withBold(t('admin.monthly.stat.sent'), sent)}</span>
        {notEmailed > 0 && <span className="text-sm text-red-300">{withBold(t('admin.monthly.stat.notEmailed'), notEmailed)}</span>}
        {missing > 0 && (
          <button onClick={generate} disabled={!!busy}
            className="ml-auto px-4 py-2 rounded-lg bg-[#c9a84c] text-[#111d38] font-semibold text-sm disabled:opacity-50">
            {progress || t('admin.monthly.generateNow', { n: missing })}
          </button>
        )}
        <p className="basis-full text-xs text-gray-400">
          {sent > 0 && drafts + approved === 0 ? (reports[0]?.sent_at ? t('admin.monthly.status.sentOn', { date: new Date(reports[0].sent_at).toLocaleDateString(dateTag(locale, 'en-US'), { month: 'short', day: 'numeric' }) }) : t('admin.monthly.status.sent'))
            : drafts > 0 ? (monthOver ? t('admin.monthly.status.drafts', { n: drafts }) : t('admin.monthly.status.draftsFrom', { n: drafts, date: dayLabel(data.sendsFrom, locale) }))
            : reports.length > 0 && !monthOver ? t('admin.monthly.status.allApproved', { date: dayLabel(data.sendsFrom, locale) })
            : reports.length === 0 ? t('admin.monthly.status.none') : ''}
        </p>
      </div>

      <div className="space-y-4">
        {reports.map(r => {
          const d = r.data || {}
          const e = edits[r.id] || { summary: r.summary, focus: r.focus }
          const locked = r.status !== 'draft'
          const chip = r.status === 'sent' ? 'bg-sky-500/15 text-sky-300' : r.status === 'approved' ? 'bg-emerald-500/15 text-emerald-300' : 'bg-amber-500/15 text-amber-300'
          const stageNow = (d.stages || []).find((s: any) => s.stage === d.stage)
          return (
            <div key={r.id} className="bg-[#111d38] rounded-xl border border-[#1e3a6e] p-5">
              <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
                <div>
                  <p className="text-white font-semibold">{r.studentName} <span className={`ml-2 text-[11px] px-2 py-0.5 rounded-full ${chip}`}>{r.status === 'draft' ? t('admin.monthly.chip.draft') : r.status === 'approved' ? t('admin.monthly.chip.approved') : t('admin.monthly.chip.sent')}</span></p>
                  <p className="text-gray-400 text-xs mt-0.5">
                    {r.parentName} · {t(d.lessons?.length === 1 ? 'admin.monthly.lessonsOne' : 'admin.monthly.lessonsMany', { n: d.lessons?.length || 0, m: d.attended || 0 })}
                    {d.level ? ` · L${d.level} ${LEVEL_NAMES[String(d.level)] ? t(`level.${d.level}.name`) : ''} · ${t('admin.monthly.stageN', { n: d.stage ?? '' })}${stageNow ? ` ${stageNow.percent}%` : ''}` : ` · ${t('admin.reviews.noLevelYet')}`}
                    {d.coachName ? ` · ${t('admin.coachName', { name: d.coachName })}` : ''}
                  </p>
                </div>
                <button onClick={() => setOpen(o => ({ ...o, [r.id]: !o[r.id] }))} className="text-xs text-gray-400 hover:text-[#c9a84c]">
                  {open[r.id] ? t('admin.monthly.hideData') : t('admin.monthly.showData')}
                </button>
              </div>

              {d.pendingReviews > 0 && r.status === 'draft' && (
                <p className="text-amber-300 text-xs mb-3">{t('admin.monthly.pendingReviews', { n: d.pendingReviews })}</p>
              )}
              {r.status !== 'sent' && r.generated_at && writtenOn(r.generated_at) < lastDay && (
                <p className="text-amber-300 text-xs mb-3">{t('admin.monthly.writtenEarly', { date: dayLabel(writtenOn(r.generated_at), locale) })}</p>
              )}
              {d.aiFailed && r.status === 'draft' && (
                <p className="text-red-300 text-xs mb-3">{t('admin.monthly.aiFailed')}</p>
              )}

              {open[r.id] && (
                <div className="mb-4 grid md:grid-cols-2 gap-4 text-xs">
                  <div>
                    <p className="text-gray-500 uppercase tracking-wider mb-1">{t('admin.monthly.lessons')}</p>
                    {(d.lessons || []).map((l: any) => (
                      <p key={l.key} className="text-gray-300">{dayLabel(l.date, locale)} {l.start ? formatTime12h(l.start) : ''} · {l.isTrial ? t('common.assessment') : l.courseTypeId ? tDb(locale, 'course_types', l.courseTypeId, l.courseName) : l.courseName} · <span className={l.attended ? 'text-emerald-300' : 'text-red-300'}>{l.attended ? t('admin.monthly.attended') : t('admin.monthly.absent')}</span></p>
                    ))}
                    {d.stageSkills?.length > 0 && <p className="text-gray-500 uppercase tracking-wider mt-3 mb-1">{t('admin.monthly.stageSkills', { n: d.stage ?? '' })}</p>}
                    {(d.stageSkills || []).map((s: any) => (
                      <p key={s.id} className="text-gray-300">{tDb(locale, 'skills', s.id, s.name)}{t('admin.colon')}<span style={{ color: MASTERY_COLOR[masteryOf(s.start)] }}>{masteryLabel(t, masteryOf(s.start))}</span> → <span style={{ color: MASTERY_COLOR[masteryOf(s.end)] }}>{masteryLabel(t, masteryOf(s.end))}</span></p>
                    ))}
                    {d.otherSkills?.length > 0 && <p className="text-gray-500 uppercase tracking-wider mt-3 mb-1">{t('admin.monthly.otherSkills')}</p>}
                    {(d.otherSkills || []).map((s: any) => (
                      <p key={s.id} className="text-gray-300">{tDb(locale, 'skills', s.id, s.name)}<span className="text-gray-500">{t('admin.monthly.stageParen', { n: s.stage })}</span>{t('admin.colon')}<span style={{ color: MASTERY_COLOR[masteryOf(s.start)] }}>{masteryLabel(t, masteryOf(s.start))}</span> → <span style={{ color: MASTERY_COLOR[masteryOf(s.end)] }}>{masteryLabel(t, masteryOf(s.end))}</span></p>
                    ))}
                  </div>
                  <div>
                    <p className="text-gray-500 uppercase tracking-wider mb-1">{t('admin.monthly.coachNotes')}</p>
                    {r.noteTexts.length === 0 && <p className="text-gray-500">{t('admin.monthly.noneThisMonth')}</p>}
                    {r.noteTexts.map((n, i) => <p key={i} className="text-gray-300 mb-2">{dayLabel(n.date, locale)}{n.coachName ? ` · ${n.coachName}` : ''}{t('admin.colon')}{n.text}</p>)}
                  </div>
                </div>
              )}

              <label className="block text-gray-500 text-xs uppercase tracking-wider mb-1">{t('admin.monthly.summary')}</label>
              <textarea value={e.summary} disabled={locked} rows={4}
                onChange={ev => setEdits(p => ({ ...p, [r.id]: { ...e, summary: ev.target.value } }))}
                className="w-full rounded-lg bg-[#0a1428] border border-[#1e3a6e] text-gray-200 text-sm px-3 py-2 disabled:opacity-70 focus:outline-none focus:border-[#c9a84c]/60" />
              <label className="block text-gray-500 text-xs uppercase tracking-wider mt-3 mb-1">{t('admin.monthly.focusLabel')}</label>
              <textarea value={e.focus} disabled={locked} rows={2}
                onChange={ev => setEdits(p => ({ ...p, [r.id]: { ...e, focus: ev.target.value } }))}
                className="w-full rounded-lg bg-[#0a1428] border border-[#1e3a6e] text-gray-200 text-sm px-3 py-2 disabled:opacity-70 focus:outline-none focus:border-[#c9a84c]/60" />
              <p className="text-gray-600 text-[11px] mt-1">{t('admin.monthly.writtenInEnglish')}</p>

              <div className="flex flex-wrap gap-2 mt-3">
                {r.status === 'draft' && (<>
                  <button onClick={() => act(r, 'approve')} disabled={!!busy}
                    className="px-4 py-2 rounded-lg bg-[#c9a84c] text-[#111d38] font-semibold text-sm disabled:opacity-50">
                    {busy === r.id + 'approve' ? t('admin.monthly.approving') : t('admin.monthly.approve')}
                  </button>
                  {edits[r.id] && (
                    <button onClick={() => act(r, 'save')} disabled={!!busy}
                      className="px-3 py-2 rounded-lg border border-gray-600 text-gray-300 text-sm disabled:opacity-50">
                      {busy === r.id + 'save' ? t('admin.monthly.saving') : t('admin.monthly.saveDraft')}
                    </button>
                  )}
                  <button onClick={() => act(r, 'regenerate')} disabled={!!busy}
                    className="px-3 py-2 rounded-lg border border-gray-600 text-gray-300 text-sm disabled:opacity-50">
                    {busy === r.id + 'regenerate' ? t('admin.monthly.rewriting') : t('admin.monthly.rewrite')}
                  </button>
                </>)}
                {r.status === 'approved' && (
                  <button onClick={() => act(r, 'unapprove')} disabled={!!busy}
                    className="px-3 py-2 rounded-lg border border-gray-600 text-gray-300 text-sm disabled:opacity-50">
                    {busy === r.id + 'unapprove' ? '…' : t('admin.monthly.editAgain')}
                  </button>
                )}
                <span className="flex items-center gap-1 text-xs text-gray-500 ml-auto">
                  {t('admin.monthly.previewAs')}
                  {PREVIEW_LANGS.map(p => (
                    <button key={p.lang} onClick={() => setPreview({ id: r.id, lang: p.lang })}
                      className="px-2 py-1 rounded border border-gray-700 text-gray-300 hover:border-[#c9a84c]/60 hover:text-[#c9a84c]">{t(p.labelKey)}</button>
                  ))}
                </span>
                {/* Each family's email, as it actually went (owner, 2026-10-08). */}
                {r.status === 'sent' && (
                  <p className="basis-full flex flex-wrap items-center gap-2 text-xs">
                    {r.emailed_at ? (
                      <span className="text-emerald-300">{t('admin.monthly.email.sentOn', { date: new Date(r.emailed_at).toLocaleDateString(dateTag(locale, 'en-US'), { month: 'short', day: 'numeric' }) })}</span>
                    ) : r.parentHasEmail === false ? (
                      <span className="text-red-300">{t('admin.monthly.email.noAddress')}</span>
                    ) : (
                      <span className="text-red-300">{t('admin.monthly.email.notYet')}</span>
                    )}
                    {r.parentHasEmail !== false && (
                      <button onClick={() => emailNow(r)} disabled={!!busy}
                        className="px-2.5 py-1 rounded border border-gray-600 text-gray-300 hover:border-[#c9a84c]/60 hover:text-[#c9a84c] disabled:opacity-50">
                        {busy === r.id + 'email' ? t('admin.monthly.email.sending') : r.emailed_at ? t('admin.monthly.email.again') : t('admin.monthly.email.now')}
                      </button>
                    )}
                  </p>
                )}
                {r.status === 'sent' && (
                  <p className="text-sm text-gray-400">
                    {t('admin.monthly.familyAnswer', { answer: r.feedback === 'up' ? t('admin.monthly.fb.good') : r.feedback === 'down' ? t('admin.monthly.fb.question') : t('admin.monthly.fb.none') })}
                    {r.feedback_comment ? <span className="block text-gray-300 mt-1">“{r.feedback_comment}”</span> : null}
                  </p>
                )}
              </div>
            </div>
          )
        })}
      </div>
      {preview && (() => {
        const r = reports.find(x => x.id === preview.id)
        if (!r) return null
        return (
          <div style={{ fontFamily: FONT_BODY }}>
            <style>{REPORT_SHEET_CSS}</style>
            {r.status === 'draft' && preview.lang !== 'en' && (
              <p style={{ position: 'fixed', top: 12, left: '50%', transform: 'translateX(-50%)', zIndex: 1001, margin: 0, background: '#12254a', color: '#fff', fontSize: 12, padding: '6px 12px', borderRadius: 8 }}>
                {t('admin.monthly.previewDraftNote')}
              </p>
            )}
            <MonthlyReportSheet key={r.id + preview.lang} studentName={r.studentName} reports={[asFamily(r, preview.lang)]}
              initialId={r.id} previewLang={preview.lang} onClose={() => setPreview(null)} />
          </div>
        )
      })()}
    </div>
  )
}
