/* eslint-disable @typescript-eslint/no-explicit-any */
/* Following up families who could slip away (owner, 2026-10-23; the
   competitor review, item 3). docs/migration-family-notices.sql.

   1. After a Swim Assessment with nothing booked: an email on day 3 and on
      day 14 after the admin confirmed the report -- the coach's
      recommendation, the assessment credit and how much of it is left, and a
      button to book. Stops as soon as the swimmer has a lesson (or, when the
      Swim Team was recommended, a team membership). Sent by the daily 9:00
      job (/api/cron/low-balance runs it too).
   2. Families who have not come for a while: NOT emailed (owner: a "we miss
      you" mail is too pushy for families who come only in summer) -- listed
      for the desk on Admin > Follow-ups.
   3. Summer registration: one email to families who swam last summer and
      have nothing booked, sent only when the owner presses the button.

   All three are marketing mail: only families with the newsletter switch on,
   each with a one-click unsubscribe link and the school's postal address
   (CAN-SPAM), like the birthday card. family_notices keeps one row per email
   sent, so nothing goes twice. */

import type { SupabaseClient } from '@supabase/supabase-js'
import { allRows, allRowsIn } from '@/lib/db-paging'
import { getTodayLA } from '@/lib/date'
import { getT, toLocale, dateTag, type Locale } from '@/lib/i18n/all'
import { sendRawEmail } from '@/lib/email'
import { SCHOOL_MAILING_ADDRESS, SITE_URL } from '@/lib/site-config'
import { unsubscribeToken, unsubscribePageUrl, unsubscribeHeaders } from '@/lib/unsubscribe'
import { CREDIT_LESSONS, CREDIT_POINTS, countCreditLessons, daysLeft, addDays } from '@/lib/assessments'

type Svc = SupabaseClient

/** Days after the report is confirmed that each reminder goes. A reminder
 *  more than GRACE days late (the job was down, or the swimmer was assessed
 *  before this existed) is skipped rather than sent stale. */
export const ASSESS_STEPS = [3, 14] as const
const GRACE = 4
/** How far back the desk list and the job look at assessments: the credit
 *  window. */
const ASSESS_LOOKBACK = 60

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
const laDate = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' })
const daysBetween = (a: string, b: string) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000)

// ---------------------------------------------------------------------------
// Who

export type AssessFollow = {
  assessmentId: string
  studentId: string
  studentName: string
  parentId: string
  family: string
  parentFirst: string
  email: string | null
  phone: string | null
  lang: Locale
  subscribed: boolean
  confirmedOn: string
  daysSince: number
  course: string | null
  frequency: string | null
  creditDeadline: string | null
  creditStatus: string | null
  assessedOn: string
  sent: number[]
}

/** Swimmers assessed in the credit window who still have nothing booked. */
export async function assessmentsWithoutBooking(svc: Svc, today = getTodayLA()): Promise<AssessFollow[]> {
  const since = addDays(today, -ASSESS_LOOKBACK)
  const { data: rows, error } = await svc.from('student_assessments')
    .select('id, student_id, parent_id, assessed_on, confirmed_at, recommended_course, weekly_frequency, credit_deadline, credit_status')
    .not('confirmed_at', 'is', null).gte('assessed_on', since)
  if (error) throw new Error('assessments: ' + error.message)
  if (!rows?.length) return []
  const studentIds = [...new Set(rows.map((r: any) => r.student_id))]
  const parentIds = [...new Set(rows.map((r: any) => r.parent_id).filter(Boolean))]
  const [{ data: books, error: bErr }, { data: team }, { data: studs }, { data: pars }, { data: sent }] = await Promise.all([
    allRowsIn(studentIds, ch => svc.from('bookings')
      .select('student_id, is_trial, status, cs:class_sessions!bookings_class_session_id_fkey(session_date)')
      .in('student_id', ch).in('status', ['confirmed', 'completed']).order('id')),
    svc.from('team_memberships').select('student_id').in('student_id', studentIds).in('status', ['active', 'past_due', 'trialing']),
    svc.from('students').select('id, full_name').in('id', studentIds),
    svc.from('parents').select('id, first_name, last_name, email, phone, preferred_language, newsletter_subscribed').in('id', parentIds),
    svc.from('family_notices').select('kind, ref').in('ref', rows.map((r: any) => r.id)).like('kind', 'assess_%'),
  ])
  if (bErr) throw new Error('bookings: ' + (bErr.message || bErr))
  const stu = new Map((studs || []).map((s: any) => [s.id, s.full_name || '']))
  const par = new Map((pars || []).map((p: any) => [p.id, p]))
  const inTeam = new Set((team || []).map((m: any) => m.student_id))
  const sentBy = new Map<string, number[]>()
  for (const s of sent || []) sentBy.set(s.ref, [...(sentBy.get(s.ref) || []), Number(String(s.kind).replace('assess_', ''))])
  const out: AssessFollow[] = []
  for (const r of rows as any[]) {
    const booked = (books || []).some((b: any) => b.student_id === r.student_id && !b.is_trial && (b.cs?.session_date || '') >= r.assessed_on)
    if (booked || inTeam.has(r.student_id)) continue
    const p: any = par.get(r.parent_id) || {}
    const confirmedOn = laDate(r.confirmed_at)
    out.push({
      assessmentId: r.id, studentId: r.student_id, studentName: stu.get(r.student_id) || '',
      parentId: r.parent_id, family: `${p.first_name || ''} ${p.last_name || ''}`.trim(), parentFirst: p.first_name || '',
      email: p.email || null, phone: p.phone || null, lang: toLocale(p.preferred_language), subscribed: !!p.newsletter_subscribed,
      confirmedOn, daysSince: daysBetween(confirmedOn, today),
      course: r.recommended_course || null, frequency: r.weekly_frequency || null,
      creditDeadline: r.credit_deadline || null, creditStatus: r.credit_status || null, assessedOn: r.assessed_on,
      sent: (sentBy.get(r.id) || []).sort((a, b) => a - b),
    })
  }
  return out.sort((a, b) => a.daysSince - b.daysSince)
}

export type Lapsed = { parentId: string; family: string; email: string | null; phone: string | null; subscribed: boolean; swimmers: string[]; lastLesson: string; daysSince: number }

/** Families whose last lesson was more than `days` ago and who have nothing
 *  booked. Families on the Swim Team are active and left out. */
export async function lapsedFamilies(svc: Svc, days: number, today = getTodayLA()): Promise<Lapsed[]> {
  const { data: rows, error } = await allRows(() => svc.from('bookings')
    .select('parent_id, student_id, is_trial, cs:class_sessions!bookings_class_session_id_fkey(session_date)')
    .in('status', ['confirmed', 'completed']).order('id'))
  if (error) throw new Error('bookings: ' + (error.message || error))
  const last = new Map<string, string>()
  const upcoming = new Set<string>()
  const kids = new Map<string, Set<string>>()
  for (const b of rows as any[]) {
    const d: string | undefined = b.cs?.session_date
    if (!d || !b.parent_id || b.is_trial) continue
    if (d >= today) { upcoming.add(b.parent_id); continue }
    if (!last.has(b.parent_id) || d > last.get(b.parent_id)!) last.set(b.parent_id, d)
    kids.set(b.parent_id, (kids.get(b.parent_id) || new Set()).add(b.student_id))
  }
  const cutoff = addDays(today, -days)
  const ids = [...last.keys()].filter(id => !upcoming.has(id) && last.get(id)! < cutoff)
  if (!ids.length) return []
  const studentIds = [...new Set(ids.flatMap(id => [...(kids.get(id) || [])]))]
  const [{ data: pars }, { data: studs }, { data: team }] = await Promise.all([
    allRowsIn(ids, ch => svc.from('parents').select('id, first_name, last_name, email, phone, newsletter_subscribed, deletion_requested_at').in('id', ch).order('id')),
    allRowsIn(studentIds, ch => svc.from('students').select('id, full_name').in('id', ch).order('id')),
    svc.from('team_memberships').select('student_id').in('student_id', studentIds).in('status', ['active', 'past_due', 'trialing']),
  ])
  const stu = new Map((studs || []).map((s: any) => [s.id, s.full_name || '']))
  const teamKids = new Set((team || []).map((m: any) => m.student_id))
  return ((pars || []) as any[])
    .filter(p => !p.deletion_requested_at && ![...(kids.get(p.id) || [])].some(k => teamKids.has(k)))
    .map(p => ({
      parentId: p.id, family: `${p.first_name || ''} ${p.last_name || ''}`.trim(), email: p.email || null, phone: p.phone || null,
      subscribed: !!p.newsletter_subscribed, swimmers: [...(kids.get(p.id) || [])].map(k => stu.get(k) || '').filter(Boolean),
      lastLesson: last.get(p.id)!, daysSince: daysBetween(last.get(p.id)!, today),
    }))
    .sort((a, b) => a.daysSince - b.daysSince)
}

export type SummerFamily = { parentId: string; family: string; email: string | null; lang: Locale; subscribed: boolean; swimmers: string[]; sent: boolean }

/** Families who swam in June-August of `year` and have nothing booked now. */
export async function summerFamilies(svc: Svc, year: number, today = getTodayLA()): Promise<SummerFamily[]> {
  const from = `${year}-06-01`, to = `${year}-08-31`
  const { data: rows, error } = await allRows(() => svc.from('bookings')
    .select('parent_id, student_id, is_trial, cs:class_sessions!bookings_class_session_id_fkey(session_date)')
    .in('status', ['confirmed', 'completed']).order('id'))
  if (error) throw new Error('bookings: ' + (error.message || error))
  const kids = new Map<string, Set<string>>()
  const upcoming = new Set<string>()
  for (const b of rows as any[]) {
    const d: string | undefined = b.cs?.session_date
    if (!d || !b.parent_id || b.is_trial) continue
    if (d >= today) upcoming.add(b.parent_id)
    if (d >= from && d <= to) kids.set(b.parent_id, (kids.get(b.parent_id) || new Set()).add(b.student_id))
  }
  const ids = [...kids.keys()].filter(id => !upcoming.has(id))
  if (!ids.length) return []
  const studentIds = [...new Set(ids.flatMap(id => [...kids.get(id)!]))]
  const [{ data: pars }, { data: studs }, { data: sent }] = await Promise.all([
    allRowsIn(ids, ch => svc.from('parents').select('id, first_name, last_name, email, preferred_language, newsletter_subscribed, deletion_requested_at').in('id', ch).order('id')),
    allRowsIn(studentIds, ch => svc.from('students').select('id, full_name').in('id', ch).order('id')),
    svc.from('family_notices').select('parent_id').eq('kind', 'summer').in('ref', ids.map(id => `${id}:${year}`)),
  ])
  const stu = new Map((studs || []).map((s: any) => [s.id, s.full_name || '']))
  const done = new Set((sent || []).map((s: any) => s.parent_id))
  return ((pars || []) as any[]).filter(p => !p.deletion_requested_at).map(p => ({
    parentId: p.id, family: `${p.first_name || ''} ${p.last_name || ''}`.trim(), email: p.email || null,
    lang: toLocale(p.preferred_language), subscribed: !!p.newsletter_subscribed,
    swimmers: [...kids.get(p.id)!].map(k => stu.get(k) || '').filter(Boolean), sent: done.has(p.id),
  })).sort((a, b) => a.family.localeCompare(b.family))
}

// ---------------------------------------------------------------------------
// The emails

function shell(L: Locale, parentId: string, subject: string, title: string, inner: string, button: { href: string; label: string }) {
  const t = getT(L)
  const token = unsubscribeToken(parentId)
  const unsub = token ? unsubscribePageUrl(parentId, token) : `${SITE_URL}/unsubscribe`
  const html = `<!doctype html><html lang="${L}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(subject)}</title></head><body style="margin:0;background:#f6f9fd;"><div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 32px 16px;"><div style="text-align: center; margin-bottom: 24px;"><div style="color: #12254a; font-size: 18px; font-weight: 800; letter-spacing: 0.3em;">MANTA SHARK</div></div><div style="background: white; border-radius: 10px; padding: 28px;"><h2 style="color: #12254a; margin-top: 0;">${title}</h2>${inner}<div style="text-align:center; margin: 28px 0 8px;"><a href="${esc(button.href)}" style="display: inline-block; background: #f09800; color: #12254a; font-weight: 800; padding: 14px 32px; border-radius: 10px; text-decoration: none;">${esc(button.label)}</a></div></div><div style="color:#8a97ad;font-size:12px;line-height:1.7;text-align:center;margin-top:16px;">${t('bday.email.why')} <a href="${unsub}" style="color:#56647d;text-decoration:underline;">${t('bday.email.unsubscribe')}</a><br>Manta Shark Aquatics &middot; ${esc(SCHOOL_MAILING_ADDRESS)}</div></div></body></html>`
  return { subject, html, headers: token ? unsubscribeHeaders(parentId, token) : undefined }
}

const para = (s: string, style = '') => `<p style="color: #16294a; line-height: 1.6;${style}">${s}</p>`

export async function renderAssessFollowUp(svc: Svc, a: AssessFollow, step: number, today = getTodayLA()) {
  const L = a.lang
  const t = getT(L)
  const name = a.studentName.split(/\s+/)[0] || a.studentName
  const rec = a.course ? `${t('assess.course.' + a.course)}${a.frequency ? (L === 'en' ? ', ' : '，') + t('assess.freq.' + a.frequency) : ''}` : ''
  const team = a.course === 'team'
  let credit = ''
  const left = a.creditDeadline ? daysLeft(a.creditDeadline, today) : 0
  if (!team && a.creditDeadline && left > 0 && (!a.creditStatus || a.creditStatus === 'pending')) {
    const done = await countCreditLessons(svc, { student_id: a.studentId, assessed_on: a.assessedOn, credit_deadline: a.creditDeadline }, today).catch(() => 0)
    const date = new Date(a.creditDeadline + 'T12:00:00Z').toLocaleDateString(dateTag(L), { month: 'long', day: 'numeric', timeZone: 'UTC' })
    credit = `<p style="background: #eef8f1; border: 1px solid #bfe3cb; border-radius: 10px; padding: 12px 14px; color: #1f6b43; line-height: 1.6;">🎁 ${t('followup.assess.credit', { n: CREDIT_LESSONS, date, points: CREDIT_POINTS, done })}</p>`
  }
  const first = step === ASSESS_STEPS[0]
  const subject = first ? t('followup.assess.subject3', { name }) : (credit ? t('followup.assess.subject14', { name, days: left }) : t('followup.assess.subject14plain', { name }))
  const body = t(first ? 'followup.assess.body3' : 'followup.assess.body14', { name: esc(name), rec: esc(rec) })
  return shell(L, a.parentId, subject, t(first ? 'followup.assess.title3' : 'followup.assess.title14', { name: esc(name) }),
    para(t('assess.email.hi', { name: esc(a.parentFirst) })) + para(body) + credit,
    team ? { href: `${SITE_URL}/plans`, label: t('followup.assess.buttonTeam') }
      : { href: `${SITE_URL}/booking?swimmer=${encodeURIComponent(a.studentId)}`, label: t('followup.assess.button') })
}

export function renderSummer(f: SummerFamily, firstName: string) {
  const L = f.lang
  const t = getT(L)
  const names = f.swimmers.map(n => n.split(/\s+/)[0] || n).join(L === 'en' ? ' & ' : '、')
  const subject = t('followup.summer.subject')
  return shell(L, f.parentId, subject, t('followup.summer.title'),
    para(t('assess.email.hi', { name: esc(firstName) })) + para(t('followup.summer.body', { names: esc(names) })),
    { href: `${SITE_URL}/booking`, label: t('followup.summer.button') })
}

// ---------------------------------------------------------------------------
// Sending

/** Claims the notice (one row per email ever), sends, and hands the claim back
 *  if the email did not go. 'done' = already sent before. */
async function sendOnce(svc: Svc, row: { parent_id: string; kind: string; ref: string }, send: () => Promise<boolean>): Promise<'sent' | 'done' | 'failed'> {
  const { error } = await svc.from('family_notices').insert(row)
  if (error) return (error as any).code === '23505' ? 'done' : 'failed'
  const ok = await send().catch(() => false)
  if (!ok) { await svc.from('family_notices').delete().eq('kind', row.kind).eq('ref', row.ref); return 'failed' }
  return 'sent'
}

/** The daily run: day-3 and day-14 reminders that are due. */
export async function sendAssessmentFollowUps(svc: Svc, opts: { dry?: boolean } = {}) {
  const out = { due: 0, sent: 0, notSubscribed: 0, failed: 0, dry: [] as string[] }
  if (!SCHOOL_MAILING_ADDRESS.trim() || !unsubscribeToken('check')) return { ...out, skipped: true }
  const today = getTodayLA()
  for (const a of await assessmentsWithoutBooking(svc, today)) {
    // The latest step that is due and not stale; an earlier one not sent in
    // time is skipped rather than sent alongside it.
    const step = [...ASSESS_STEPS].reverse().find(s => a.daysSince >= s && a.daysSince <= s + GRACE)
    if (!step || a.sent.includes(step)) continue
    out.due++
    if (!a.subscribed || !a.email) { out.notSubscribed++; continue }
    if (opts.dry) { out.dry.push(`${a.studentName.split(/\s+/)[0]} day ${step}`); continue }
    const mail = await renderAssessFollowUp(svc, a, step, today)
    const r = await sendOnce(svc, { parent_id: a.parentId, kind: `assess_${step}`, ref: a.assessmentId },
      () => sendRawEmail({ to: a.email!, subject: mail.subject, html: mail.html, headers: mail.headers }))
    if (r === 'sent') out.sent++
    else if (r === 'failed') out.failed++
  }
  return out
}

/** The owner's button: the summer email to every subscribed family not yet
 *  sent it this year. */
export async function sendSummerReminders(svc: Svc, year: number) {
  const out = { sent: 0, alreadySent: 0, notSubscribed: 0, failed: 0 }
  if (!SCHOOL_MAILING_ADDRESS.trim() || !unsubscribeToken('check')) return { ...out, skipped: true }
  const fams = await summerFamilies(svc, year)
  const { data: pars } = fams.length ? await svc.from('parents').select('id, first_name').in('id', fams.map(f => f.parentId)) : { data: [] as any[] }
  const first = new Map((pars || []).map((p: any) => [p.id, p.first_name || '']))
  for (const f of fams) {
    if (f.sent) { out.alreadySent++; continue }
    if (!f.subscribed || !f.email) { out.notSubscribed++; continue }
    const mail = renderSummer(f, first.get(f.parentId) || '')
    const r = await sendOnce(svc, { parent_id: f.parentId, kind: 'summer', ref: `${f.parentId}:${year}` },
      () => sendRawEmail({ to: f.email!, subject: mail.subject, html: mail.html, headers: mail.headers }))
    if (r === 'sent') out.sent++
    else if (r === 'done') out.alreadySent++
    else out.failed++
  }
  return out
}

/** The summer the button defaults to: this year's once September has come,
 *  otherwise last year's. */
export function lastSummer(today = getTodayLA()): number {
  const y = Number(today.slice(0, 4))
  return today.slice(5, 7) >= '09' ? y : y - 1
}
