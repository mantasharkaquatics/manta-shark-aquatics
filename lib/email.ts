import { Resend } from 'resend'
// From i18n/all, not i18n: index.ts holds only English now, so the voucher,
// fixed-class and assessment emails went out in English (found 2026-10-05).
// This file is server-only, so the extra dictionaries never reach the browser.
import { getT, toLocale } from './i18n/all'
import { stageNameKey } from './levels'
import { ASSESSMENT_POINTS as CREDIT_POINTS, ASSESSMENT_CREDIT_LESSONS as CREDIT_LESSONS } from './points'
import { CONTACT_EMAIL, EMAIL_FROM } from './site-config'
import { getLocations, locationLine, type Location } from './locations'
import { FAMILY_TYPES, familyEmail, familyLang, placeHtml, calendarAttachments, withCalendarNote, type MailAttachment } from './email-family'
import type { CalendarLesson } from './lesson-calendar'

const resend = new Resend(process.env.RESEND_API_KEY)

// Every value interpolated into an email's HTML goes through esc(). Names,
// cities and the like are typed by parents and job applicants, and one raw
// city became a clickable link in the staff notification (found 2026-10-05).
// Quotes too, so a value is also safe inside an href="...". Subjects are plain
// text and stay unescaped.
const esc = (v: unknown) => String(v ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;')

// Literal union, not `string`: a typo in a type name used to sail through the
// build and send a blank email. The index signature below still lets extra
// fields ride along — tightening that is a separate pass.
export type EmailType =
  | 'booking_confirmed'
  | 'contact_change_code'
  | 'contact_verify_code'
  | 'level_certificate'
  | 'contact_change_notice'
  | 'trial_payment_link'
  | 'booking_rescheduled'
  | 'booking_cancelled'
  | 'block_cancellation_notice'
  | 'reminder_24h'
  | 'partner_booking_invite'
  | 'partner_booking_confirmed'
  | 'partner_booking_rejected'
  | 'partner_invite_expired'
  | 'partner_invite_withdrawn'
  | 'partner_invite_unlinked'
  | 'partner_invite_failed'
  | 'partner_reschedule_requested'
  | 'partner_reschedule_not_moved'
  | 'partner_absent_lesson_continues'
  | 'invoice'
  | 'booking_series_confirmed'
  | 'applicant_verification_code'
  | 'applicant_application_received'
  | 'applicant_password_reset'
  | 'parent_password_reset'
  | 'payment_reversed'
  | 'refund_issued'
  | 'referral_reward'
  | 'assessment_report'
  | 'monthly_report'
  | 'voucher_expiring'
  | 'low_balance'
  | 'fixed_class_ended'
  | 'fixed_class_renewal'
  | 'fixed_class_moved'
  | 'admin_alert'
  | 'staff_invite'
  | 'staff_email_changed'
  | 'welcome'
  | 'chat_reply'

export interface EmailPayload {
  type: EmailType
  to: string
  parentName?: string
  studentName?: string
  partnerName?: string
  courseName?: string
  coachName?: string
  date?: string
  time?: string
  paymentUrl?: string
  inviterName?: string
  invoiceNumber?: string
  invoiceId?: string
  invoiceUrl?: string
  amount?: number | string
  dates?: string[]
  // One entry per date, when a batch spans more than one time of day. A single
  // Time row would then be wrong for some of the lessons it sits above.
  times?: string[]
  // voucher: the lesson became a make-up voucher, usable until expiresOn.
  // assessment_refunded: a Swim Assessment cancelled after its payment was
  // refunded in full or charged back -- nothing is owed either way.
  refundKind?: 'points' | 'voucher' | 'none' | 'assessment' | 'assessment_refunded'
  requesterStudentName?: string
  partnerStudentName?: string
  // partner_reschedule_requested / partner_reschedule_not_moved: date and time
  // are the lesson's CURRENT time; newDate / newTime the one proposed. deadline
  // is when the request lapses ("3:45 PM"); rescheduleOutcome why it did not happen.
  newDate?: string
  newTime?: string
  deadline?: string
  rescheduleOutcome?: 'declined' | 'withdrawn' | 'expired' | 'unavailable' | 'too_late' | 'coach_unavailable'
  paymentMethod?: string
  planName?: string
  // Loose on purpose: the point of this pass is catching MISSPELLED field
  // names, not pinning down every value shape. Tighten if these grow legs.
  items?: any[]
  code?: string
  applicantName?: string
  applicantEmail?: string
  applicantPhone?: string
  applicantCity?: string
  roleLabel?: string
  hasResume?: boolean
  appUrl?: string
  changeField?: 'email' | 'phone'
  newValue?: string
  // payment_reversed: what the bank sent back, what is now owed, and how many
  // unswum lessons were released to pay part of it down.
  pointsOwed?: number
  lessonsReleased?: number
  /** payment_reversed: the released lessons themselves (no separate
   *  cancellation email goes out for them). */
  releasedLessons?: { date: string; time: string; studentNames: string[] }[]
  reversalKind?: 'payment_failed' | 'chargeback'
  // refund_issued: the part still to be handed over in person, if any.
  handBackAmount?: number
  // refund_issued: the part of handBackAmount that was paid by Zelle and goes
  // back by Zelle once a manager has checked it (owner, 2026-10-21).
  zelleBackAmount?: number
  // referral_reward: which side of the referral this family is, the other
  // family's last name, and the date the reward stops working.
  referralRole?: 'referrer' | 'referred'
  otherFamily?: string
  expiresOn?: string
  // booking_cancelled: a leave voucher's first usable date (null = at once).
  usableFrom?: string
  /** booking_cancelled: a make-up was cancelled in time and its voucher came back. */
  voucherBack?: boolean
  /** booking_cancelled: the OTHER family of a shared 1-on-2 cancelled it;
   *  partnerName is their swimmers, amount the points that came back. */
  partnerCancelled?: boolean
  /** partner_invite_failed: why the invitation ended, and whether this
   *  family is the one who sent it. */
  inviteFailReason?: 'slot_taken' | 'slot_full' | 'swimmer_busy' | 'inviter_points' | 'too_late' | 'coach_unavailable'
  isInviter?: boolean
  /** partner_invite_failed swimmer_busy: who already has a lesson then. */
  busyNames?: string
  // parent_password_reset: the link to /reset-password, and the family's
  // language (en / zh-Hant / zh-Hans) -- this one email is written in all three.
  resetUrl?: string
  lang?: string
  // assessment_report (written in the family's language): the level the
  // swimmer was placed in, what the school recommends, and the credit deadline.
  level?: number
  course?: string
  frequency?: string
  reason?: string
  creditDeadline?: string
  // monthly_report: the month ('2026-09-01'), whose reports, and the one the
  // button opens (the dashboard opens the right report from ?report=).
  month?: string
  studentNames?: string[]
  /** admin_alert: a short title and plain-text lines (escaped here). */
  /** booking_series_confirmed: 'fixed' for a fixed class (the default is a
   *  plain set of lessons). */
  seriesKind?: 'fixed' | 'lessons'
  alertTitle?: string
  /** staff_invite / staff_email_changed: the staff member's first name, and
   *  the manager who made the change. */
  staffName?: string
  changedBy?: string
  alertLines?: string[]
  reportId?: string
  // voucher_expiring: which lesson the voucher is for (course slug, minutes).
  minutes?: number
  // fixed_class_renewal / fixed_class_moved: the class's weekday (0 = Sunday),
  // where the renewal button goes, and where each moved lesson landed.
  weekday?: number
  linkUrl?: string
  moveItems?: { date: string; kind: string; coach: string }[]
  /** Which pool the lesson is at ("Monrovia · 123 Main St"), from
   *  lessonLocationLine / sessionLocationLine in lib/locations.ts. Unset while
   *  only one pool is open to families, and then no Location row appears. */
  location?: string
  /** booking_series_confirmed: the pool of each date, aligned with `dates`.
   *  All the same = one Location row; different = said on each date. */
  locations?: (string | undefined)[]
  /** The lessons this email is about, for its calendar file (owner,
   *  2026-10-22): lessonCalendar() in lib/lesson-calendar.ts, read after the
   *  change. Family emails only. */
  calendar?: CalendarLesson[]
  /** low_balance (lib/low-balance.ts): spendable points, points per week,
   *  points already paid for booked lessons, and weeks the two together last. */
  balance?: number
  weekly?: number
  booked?: number
  weeksLeft?: number
}

/** The pool a lesson email's `location` line names (lib/locations
 *  locationLine), read back so the email can add its map link, phone and
 *  arrival notes (owner, 2026-10-22). null when it cannot be matched. */
async function poolOfLine(line: string | undefined): Promise<Location | null> {
  if (!line) return null
  try {
    const { serviceClient } = await import('./api-auth')
    const all = await getLocations(serviceClient())
    return all.find(l => locationLine(l) === line) || null
  } catch { return null }
}

export async function sendEmail(payload: EmailPayload): Promise<boolean> {
  const { type, to, parentName, studentName, coachName, date, time, amount, code, newValue, applicantName, applicantEmail, applicantPhone, applicantCity, roleLabel, hasResume, appUrl } = payload

  let subject = ''
  let html = ''
  // A plain-text copy, for the few emails that set one (an account notice
  // with one is less often filed under Promotions).
  let text = ''
  let attachments: MailAttachment[] | undefined
  // The lesson's pool (its map link, phone and arrival notes come from it).
  const pool = await poolOfLine(payload.location)

  if (FAMILY_TYPES.has(type)) {
    // The family's emails, in the family's language (lib/email-family.ts).
    const L = await familyLang(payload)
    const r = await familyEmail(payload, L, { pool, poolOfLine })
    if (r) { subject = r.subject; html = r.html; attachments = r.attachments }
  } else if (type === 'applicant_verification_code') {
    subject = `Your Manta Shark Aquatics application code`
    html = `<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; background: #f9f9f9; padding: 32px; border-radius: 12px;"><div style="text-align: center; margin-bottom: 24px;"><h1 style="color: #1a2744; font-size: 24px; margin: 0;">Manta Shark Aquatics</h1></div><div style="background: white; border-radius: 8px; padding: 24px;"><h2 style="color: #1a2744; margin-top: 0;">Verify your email</h2><p>Hi ${esc(applicantName || 'there')},</p><p>Thanks for starting an application with us. Enter this code to verify your email address and continue:</p><div style="text-align:center; margin: 24px 0;"><span style="display:inline-block; font-size: 32px; letter-spacing: 8px; font-weight: 700; color:#1a2744; background:#f1f1f1; padding: 14px 24px; border-radius: 8px;">${esc(code)}</span></div><p style="color:#666; font-size: 13px;">The code expires in 10 minutes. If you did not start an application, you can ignore this email.</p></div></div>`

  } else if (type === 'parent_password_reset') {
    const L = payload.lang === 'zh-Hant' ? 'zh-Hant' : payload.lang === 'zh-Hans' ? 'zh-Hans' : 'en'
    const c = {
      en: { subject: 'Reset your Manta Shark Aquatics password', title: 'Reset your password', hi: `Hi ${esc(parentName || 'there')},`,
            body: 'We received a request to reset the password for your account. Tap the button below to choose a new one.',
            btn: 'Reset password', note: 'This link works once and expires in 1 hour. If you did not ask to reset your password, you can ignore this email and your password will stay the same.' },
      'zh-Hant': { subject: '重設您的 Manta Shark Aquatics 密碼', title: '重設密碼', hi: `${esc(parentName || '')} 您好：`,
            body: '我們收到重設您帳號密碼的要求。請點下方按鈕設定新密碼。',
            btn: '重設密碼', note: '這個連結只能使用一次，1 小時後失效。如果不是您本人提出的要求，請忽略這封信，您的密碼不會改變。' },
      'zh-Hans': { subject: '重设您的 Manta Shark Aquatics 密码', title: '重设密码', hi: `${esc(parentName || '')} 您好：`,
            body: '我们收到重设您账号密码的请求。请点下方按钮设置新密码。',
            btn: '重设密码', note: '这个链接只能使用一次，1 小时后失效。如果不是您本人提出的请求，请忽略这封邮件，您的密码不会改变。' },
    }[L]
    subject = c.subject
    html = `<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; background: #f6f9fd; padding: 32px; border-radius: 12px;"><div style="text-align: center; margin-bottom: 24px;"><div style="color: #12254a; font-size: 18px; font-weight: 800; letter-spacing: 0.3em;">MANTA SHARK</div></div><div style="background: white; border-radius: 10px; padding: 28px;"><h2 style="color: #12254a; margin-top: 0;">${c.title}</h2><p style="color: #16294a;">${c.hi}</p><p style="color: #16294a; line-height: 1.6;">${c.body}</p><div style="text-align:center; margin: 28px 0;"><a href="${esc(payload.resetUrl)}" style="display: inline-block; background: #f09800; color: #12254a; font-weight: 800; padding: 14px 32px; border-radius: 10px; text-decoration: none;">${c.btn}</a></div><p style="color:#56647d; font-size: 13px; line-height: 1.6;">${c.note}</p></div></div>`

  } else if (type === 'applicant_password_reset') {
    subject = `Reset your Manta Shark Aquatics password`
    html = `<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; background: #f9f9f9; padding: 32px; border-radius: 12px;"><div style="text-align: center; margin-bottom: 24px;"><h1 style="color: #1a2744; font-size: 24px; margin: 0;">Manta Shark Aquatics</h1></div><div style="background: white; border-radius: 8px; padding: 24px;"><h2 style="color: #1a2744; margin-top: 0;">Reset your password</h2><p>Hi ${esc(applicantName || 'there')},</p><p>Enter this code on the reset page to choose a new password:</p><div style="text-align:center; margin: 24px 0;"><span style="display:inline-block; font-size: 32px; letter-spacing: 8px; font-weight: 700; color:#1a2744; background:#f1f1f1; padding: 14px 24px; border-radius: 8px;">${esc(code)}</span></div><p style="color:#666; font-size: 13px;">The code expires in 10 minutes. If you did not ask to reset your password, you can ignore this email and your password will stay the same.</p></div></div>`

  } else if (type === 'applicant_application_received') {
    subject = `New application: ${applicantName} for ${roleLabel}`
    html = `<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; background: #f9f9f9; padding: 32px; border-radius: 12px;"><div style="background: white; border-radius: 8px; padding: 24px;"><h2 style="color: #1a2744; margin-top: 0;">New application</h2><table style="width: 100%; border-collapse: collapse;"><tr><td style="padding: 8px 16px 8px 0; color: #666; white-space: nowrap; width: 1%; vertical-align: top;">Name</td><td style="padding: 8px 0; font-weight: 600;">${esc(applicantName)}</td></tr><tr><td style="padding: 8px 16px 8px 0; color: #666; white-space: nowrap; width: 1%; vertical-align: top;">Position</td><td style="padding: 8px 0; font-weight: 600;">${esc(roleLabel)}</td></tr><tr><td style="padding: 8px 16px 8px 0; color: #666; white-space: nowrap; width: 1%; vertical-align: top;">Email</td><td style="padding: 8px 0; font-weight: 600;">${esc(applicantEmail)}</td></tr><tr><td style="padding: 8px 16px 8px 0; color: #666; white-space: nowrap; width: 1%; vertical-align: top;">Phone</td><td style="padding: 8px 0; font-weight: 600;">${esc(applicantPhone)}</td></tr><tr><td style="padding: 8px 16px 8px 0; color: #666; white-space: nowrap; width: 1%; vertical-align: top;">City</td><td style="padding: 8px 0; font-weight: 600;">${esc(applicantCity || 'Not given')}</td></tr><tr><td style="padding: 8px 16px 8px 0; color: #666; white-space: nowrap; width: 1%; vertical-align: top;">Resume</td><td style="padding: 8px 0; font-weight: 600;">${hasResume ? 'Attached' : 'None'}</td></tr></table><div style="text-align: center; margin-top: 24px;"><a href="${esc(appUrl)}/admin/applications" style="display: inline-block; background: #c9a84c; color: #1a2744; font-weight: 700; padding: 14px 32px; border-radius: 8px; text-decoration: none;">Review application</a></div></div></div>`

  } else if (type === 'assessment_report') {
    // In the family's language, like the report itself. The email only says
    // the report is ready and gives the headline; the report lives on the dashboard.
    const L = toLocale(payload.lang)
    const t = getT(L)
    const lv = Number(payload.level)
    const dl = payload.creditDeadline
      ? new Date(payload.creditDeadline + 'T12:00:00Z').toLocaleDateString(L === 'en' ? 'en-US' : L === 'zh-Hans' ? 'zh-CN' : 'zh-TW', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' })
      : ''
    const row = (k: string, v: string) => `<tr><td style="padding: 8px 16px 8px 0; color: #56647d; white-space: nowrap; width: 1%; vertical-align: top;">${k}</td><td style="padding: 8px 0; font-weight: 600; color: #16294a;">${v}</td></tr>`
    const rec = `${t('assess.course.' + payload.course)} · ${t('assess.freq.' + payload.frequency)}`
      + (payload.reason ? `<div style="font-weight: 400; color: #56647d; margin-top: 4px;">${esc(payload.reason)}</div>` : '')
    subject = t('assess.email.subject', { name: studentName || '' })
    html = `<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; background: #f6f9fd; padding: 32px; border-radius: 12px;"><div style="text-align: center; margin-bottom: 24px;"><div style="color: #12254a; font-size: 18px; font-weight: 800; letter-spacing: 0.3em;">MANTA SHARK</div></div><div style="background: white; border-radius: 10px; padding: 28px;"><h2 style="color: #12254a; margin-top: 0;">${t('assess.report.eyebrow')}</h2><p style="color: #16294a;">${t('assess.email.hi', { name: esc(parentName || '') })}</p><p style="color: #16294a; line-height: 1.6;">${t('assess.email.body', { student: esc(studentName || '') })}</p><table style="width: 100%; border-collapse: collapse; margin: 8px 0 4px;">${row(t('assess.email.result'), `${t('level.badge', { n: lv, name: t('level.' + lv + '.name') })} · ${t(stageNameKey(lv, 1))}`)}${row(t('assess.report.recTitle'), rec)}</table>${dl ? `<p style="background: #eef8f1; border: 1px solid #bfe3cb; border-radius: 10px; padding: 12px 14px; color: #1f6b43; line-height: 1.6;">🎁 <strong>${t('assess.credit.title')}</strong><br>${t('assess.email.credit', { n: CREDIT_LESSONS, date: dl, points: CREDIT_POINTS })}</p>` : ''}<div style="text-align:center; margin: 28px 0 8px;"><a href="https://www.mantasharkaquatics.net/dashboard" style="display: inline-block; background: #f09800; color: #12254a; font-weight: 800; padding: 14px 32px; border-radius: 10px; text-decoration: none;">${t('assess.email.button')}</a></div></div></div>`

  } else if (type === 'monthly_report') {
    // One email per family, in their language, however many swimmers they have.
    const L = toLocale(payload.lang)
    const t = getT(L)
    const monthLabel = payload.month
      ? new Date(payload.month + 'T12:00:00Z').toLocaleDateString(L === 'en' ? 'en-US' : L === 'zh-Hans' ? 'zh-CN' : 'zh-TW', { year: 'numeric', month: 'long', timeZone: 'UTC' })
      : ''
    const names = (payload.studentNames || []).map(esc).join(L === 'en' ? ', ' : '、')
    const url = 'https://www.mantasharkaquatics.net/dashboard' + (payload.reportId ? '?report=' + encodeURIComponent(payload.reportId) : '')
    subject = t('monthly.email.subject', { month: monthLabel })
    html = `<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; background: #f6f9fd; padding: 32px; border-radius: 12px;"><div style="text-align: center; margin-bottom: 24px;"><div style="color: #12254a; font-size: 18px; font-weight: 800; letter-spacing: 0.3em;">MANTA SHARK</div></div><div style="background: white; border-radius: 10px; padding: 28px;"><h2 style="color: #12254a; margin-top: 0;">${t('monthly.email.title', { month: monthLabel })}</h2><p style="color: #16294a;">${t('assess.email.hi', { name: esc(parentName || '') })}</p><p style="color: #16294a; line-height: 1.6;">${t('monthly.email.body', { names, month: monthLabel })}</p><div style="text-align:center; margin: 28px 0 8px;"><a href="${url}" style="display: inline-block; background: #f09800; color: #12254a; font-weight: 800; padding: 14px 32px; border-radius: 10px; text-decoration: none;">${t('monthly.email.button')}</a></div></div></div>`

  } else if (type === 'chat_reply') {
    // The desk answered in the chat and the family has not read it for 10
    // minutes (app/api/cron/chat-reply-email; owner, 2026-10-08: email only,
    // no SMS). In the family's language. The reply itself stays in the chat:
    // the button opens the dashboard with the chat open (?chat=1).
    const L = toLocale(payload.lang)
    const t = getT(L)
    subject = t('chat.email.subject')
    html = `<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; background: #f6f9fd; padding: 32px; border-radius: 12px;"><div style="text-align: center; margin-bottom: 24px;"><div style="color: #12254a; font-size: 18px; font-weight: 800; letter-spacing: 0.3em;">MANTA SHARK</div></div><div style="background: white; border-radius: 10px; padding: 28px;"><h2 style="color: #12254a; margin-top: 0;">${t('chat.email.title')}</h2><p style="color: #16294a;">${t('assess.email.hi', { name: esc(parentName || '') })}</p><p style="color: #16294a; line-height: 1.6;">${t('chat.email.body')}</p><div style="text-align:center; margin: 28px 0 8px;"><a href="https://www.mantasharkaquatics.net/dashboard?chat=1" style="display: inline-block; background: #f09800; color: #12254a; font-weight: 800; padding: 14px 32px; border-radius: 10px; text-decoration: none;">${t('chat.email.button')}</a></div></div></div>`

  } else if (type === 'voucher_expiring') {
    // A make-up voucher runs out in a week. In the family's language, once.
    const L = toLocale(payload.lang)
    const t = getT(L)
    const by = payload.expiresOn
      ? new Date(payload.expiresOn + 'T12:00:00Z').toLocaleDateString(L === 'en' ? 'en-US' : L === 'zh-Hans' ? 'zh-CN' : 'zh-TW', { month: 'long', day: 'numeric', weekday: 'long', timeZone: 'UTC' })
      : ''
    const names = (payload.studentNames || []).map(esc).join(L === 'en' ? ' & ' : '、')
    // The sentence form ("30-minute 1-on-1"), not the screen label with its
    // "·" (found 2026-10-06).
    const course = payload.course || '1on1'
    const kind = t('voucher.email.kind.' + course + (course === '1on1' ? '.' + (payload.minutes === 60 ? 60 : 30) : course === '1on2' && payload.minutes === 60 ? '.60' : ''))
    subject = t('voucher.email.subject', { date: by })
    html = `<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; background: #f6f9fd; padding: 32px; border-radius: 12px;"><div style="text-align: center; margin-bottom: 24px;"><div style="color: #12254a; font-size: 18px; font-weight: 800; letter-spacing: 0.3em;">MANTA SHARK</div></div><div style="background: white; border-radius: 10px; padding: 28px;"><h2 style="color: #12254a; margin-top: 0;">${t('voucher.email.title')}</h2><p style="color: #16294a;">${t('assess.email.hi', { name: esc(parentName || '') })}</p><p style="color: #16294a; line-height: 1.6;">${t('voucher.email.body', { names, kind, date: by })}</p><div style="text-align:center; margin: 28px 0 8px;"><a href="https://www.mantasharkaquatics.net/dashboard?vouchers=1" style="display: inline-block; background: #f09800; color: #12254a; font-weight: 800; padding: 14px 32px; border-radius: 10px; text-decoration: none;">${t('voucher.email.button')}</a></div></div></div>`

  } else if (type === 'low_balance') {
    // The family's points will not last two more weeks of their lessons
    // (lib/low-balance.ts; owner, 2026-10-14). An account notice, like a
    // booking confirmation: no unsubscribe link, sent whatever the newsletter
    // setting. Once per dip below the line. In the family's language.
    //
    // Written to read as an account statement, not an offer (owner,
    // 2026-10-14, after the first one landed in Gmail's Promotions tab): the
    // figures in a small table, a "see my points" button rather than "top
    // up", and a plain-text copy.
    const L = toLocale(payload.lang)
    const t = getT(L)
    const n = (v?: number) => (v ?? 0).toLocaleString('en-US')
    const under1 = (payload.weeksLeft ?? 0) < 1
    const booked = (payload.booked ?? 0) > 0
    const url = 'https://www.mantasharkaquatics.net/dashboard?points=1'
    const rows: [string, string][] = [
      [t('lowbal.email.rowBalance'), t('lowbal.email.points', { n: n(payload.balance) })],
      [t('lowbal.email.rowWeekly'), t('lowbal.email.points', { n: n(payload.weekly) })],
      ...(booked ? [[t('lowbal.email.rowBooked'), t('lowbal.email.points', { n: n(payload.booked) })] as [string, string]] : []),
      [t('lowbal.email.rowLeft'), t(under1 ? 'lowbal.email.left0' : 'lowbal.email.left1')],
    ]
    const notes = [booked ? t('lowbal.email.booked') : '', t('lowbal.email.nudge')].filter(Boolean)
    const p = (x: string) => `<p style="color: #16294a; line-height: 1.6;">${x}</p>`
    subject = t('lowbal.email.subject')
    html = `<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; background: #f6f9fd; padding: 32px; border-radius: 12px;"><div style="text-align: center; margin-bottom: 24px;"><div style="color: #12254a; font-size: 18px; font-weight: 800; letter-spacing: 0.3em;">MANTA SHARK</div></div><div style="background: white; border-radius: 10px; padding: 28px;"><h2 style="color: #12254a; margin-top: 0;">${t('lowbal.email.title')}</h2><p style="color: #16294a;">${t('assess.email.hi', { name: esc(parentName || '') })}</p>${p(t('lowbal.email.intro'))}<table style="width: 100%; border-collapse: collapse; margin: 4px 0 8px;">${rows.map(([k, v]) => `<tr><td style="padding: 9px 12px 9px 0; color: #56647d; border-bottom: 1px solid #e6edf6;">${k}</td><td style="padding: 9px 0; color: #12254a; font-weight: 700; border-bottom: 1px solid #e6edf6; text-align: right; white-space: nowrap;">${v}</td></tr>`).join('')}</table>${p(notes.join(L === 'en' ? ' ' : ''))}<div style="text-align:center; margin: 24px 0 8px;"><a href="${url}" style="display: inline-block; background: #12254a; color: #ffffff; font-weight: 700; padding: 12px 28px; border-radius: 10px; text-decoration: none;">${t('lowbal.email.button')}</a></div><p style="color: #56647d; margin: 24px 0 0;">${t('bday.email.sign')}</p></div></div>`
    text = [
      t('assess.email.hi', { name: parentName || '' }),
      '',
      t('lowbal.email.intro'),
      '',
      ...rows.map(([k, v]) => k + (L === 'en' ? ': ' : '：') + v),
      '',
      notes.join(L === 'en' ? ' ' : ''),
      '',
      `${t('lowbal.email.button')}: ${url}`,
      '',
      t('bday.email.sign'),
    ].join('\n')

  } else if (type === 'welcome') {
    // Sent once, when /api/auth/complete-registration creates the family
    // (owner, 2026-10-06: a proper, branded letter with the logo). In the
    // language picked on the register page. Table layout and inline styles
    // only -- that is what Gmail and Outlook render reliably.
    const L = toLocale(payload.lang)
    const t = getT(L)
    const SITE = 'https://www.mantasharkaquatics.net'
    const names = (payload.studentNames || []).map(esc).join(L === 'en' ? ' & ' : '、')
    const intro = names ? t('welcome.email.intro', { names }) : t('welcome.email.introNoNames')
    const font = "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang TC', 'Microsoft JhengHei', Helvetica, Arial, sans-serif"
    const can = ['can1', 'can2', 'can3'].map(k => `<tr><td width="22" valign="top" style="padding: 5px 0; color: #f09800; font-size: 15px; line-height: 22px;">&#9679;</td><td style="padding: 5px 0; color: #16294a; font-size: 15px; line-height: 22px;">${t('welcome.email.' + k)}</td></tr>`).join('')
    subject = t('welcome.email.subject')
    html = `<!doctype html><html lang="${L}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${t('welcome.email.subject')}</title></head>
<body style="margin: 0; padding: 0; background: #eef2f8;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background: #eef2f8; font-family: ${font};"><tr><td align="center" style="padding: 32px 12px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width: 100%; max-width: 600px; background: #ffffff; border-radius: 14px; overflow: hidden;">
  <tr><td align="center" style="padding: 28px 24px 22px;"><a href="${SITE}"><img src="${SITE}/email-logo.png" width="200" alt="Manta Shark Aquatics" style="display: block; width: 200px; max-width: 60%; height: auto; border: 0;"></a></td></tr>
  <tr><td style="background: #12254a; padding: 34px 40px 36px;">
    <div style="color: #f09800; font-size: 12px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase; margin-bottom: 10px;">${t('welcome.email.eyebrow')}</div>
    <div style="color: #ffffff; font-size: 26px; line-height: 1.3; font-weight: 800;">${t('welcome.email.title')}</div>
  </td></tr>
  <tr><td style="padding: 34px 40px 8px;">
    <p style="margin: 0 0 14px; color: #16294a; font-size: 16px; line-height: 1.6;">${t('assess.email.hi', { name: esc(parentName || '') })}</p>
    <p style="margin: 0; color: #16294a; font-size: 16px; line-height: 1.7;">${intro}</p>
  </td></tr>
  <tr><td style="padding: 24px 40px 8px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background: #f4f7fc; border: 1px solid #dde5f1; border-radius: 12px;"><tr><td style="padding: 24px 26px 26px;">
      <div style="color: #b0761a; font-size: 12px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase; margin-bottom: 6px;">${t('welcome.email.nextLabel')}</div>
      <div style="color: #12254a; font-size: 19px; font-weight: 800; margin-bottom: 10px;">${t('welcome.email.nextTitle')}</div>
      <p style="margin: 0 0 22px; color: #16294a; font-size: 15px; line-height: 1.7;">${t('welcome.email.next')}</p>
      <a href="${SITE}/booking" style="display: inline-block; background: #f09800; color: #12254a; font-size: 15px; font-weight: 800; padding: 14px 30px; border-radius: 10px; text-decoration: none;">${t('welcome.email.button')}</a>
    </td></tr></table>
  </td></tr>
  <tr><td style="padding: 26px 40px 6px;">
    <div style="color: #12254a; font-size: 15px; font-weight: 700; margin-bottom: 8px;">${t('welcome.email.canTitle')}</div>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0">${can}</table>
    <p style="margin: 14px 0 0;"><a href="${SITE}/dashboard" style="color: #12254a; font-size: 15px; font-weight: 700; text-decoration: underline;">${t('welcome.email.dashboardLink')} &rarr;</a></p>
  </td></tr>
  <tr><td style="padding: 28px 40px 34px;">
    <p style="margin: 0 0 4px; color: #16294a; font-size: 15px; line-height: 1.6;">${t('welcome.email.signoff')}</p>
    <p style="margin: 0; color: #12254a; font-size: 15px; font-weight: 700;">${t('welcome.email.team')}</p>
  </td></tr>
  <tr><td style="background: #12254a; padding: 22px 40px; color: #c9d3e6; font-size: 13px; line-height: 1.7;">
    ${t('welcome.email.questions')}<br>
    <a href="mailto:${CONTACT_EMAIL}" style="color: #f0b44d; text-decoration: none;">${CONTACT_EMAIL}</a> &middot; <a href="${SITE}" style="color: #f0b44d; text-decoration: none;">mantasharkaquatics.net</a><br>
    ${t('footer.location')} &middot; ${t('footer.hours')}
  </td></tr>
</table>
</td></tr></table>
</body></html>`

  } else if (type === 'admin_alert') {
    // To the school, not a family: something the system did on its own that a
    // person should know about (first use 2026-10-06: a duplicate Swim Team
    // subscription cancelled and refunded). English, as staff mail is.
    subject = `[Manta Shark admin] ${payload.alertTitle || 'Action needed'}`
    html = `<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;"><h2 style="color: #1a2744; margin-top: 0;">${esc(payload.alertTitle || 'Action needed')}</h2>${(payload.alertLines || []).map(l => `<p style="color: #16294a; line-height: 1.6;">${esc(l)}</p>`).join('')}</div>`

  } else if (type === 'staff_invite') {
    // A new manager's back-office login (owner, 2026-10-13): the link sets
    // their password through the same /reset-password page families use.
    // English, as staff mail is.
    subject = 'Your Manta Shark Aquatics staff account'
    html = `<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; background: #f9f9f9; padding: 32px; border-radius: 12px;"><div style="text-align: center; margin-bottom: 24px;"><h1 style="color: #1a2744; font-size: 24px; margin: 0;">Manta Shark Aquatics</h1></div><div style="background: white; border-radius: 8px; padding: 24px;"><h2 style="color: #1a2744; margin-top: 0;">Set your password</h2><p>Hi ${esc(payload.staffName || 'there')},</p><p>${esc(payload.changedBy || 'The school')} has given you access to the Manta Shark Aquatics back office. Tap the button below to choose your password. After that, sign in at the website with <strong>${esc(to)}</strong> and your password.</p><div style="text-align:center; margin: 24px 0;"><a href="${esc(payload.resetUrl)}" style="display: inline-block; background: #c9a84c; color: #1a2744; font-weight: 700; padding: 14px 32px; border-radius: 8px; text-decoration: none;">Set password</a></div><p style="color:#666; font-size: 13px;">This link works once and expires in 1 hour. If it has expired, use "Forgot password" on the sign-in page with this email address.</p></div></div>`

  } else if (type === 'staff_email_changed') {
    // Sent to the OLD address after a manager moved a staff login to a new
    // one (owner, 2026-10-13), so the person it happened to always knows.
    subject = 'Your Manta Shark Aquatics sign-in email was changed'
    html = `<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; background: #f9f9f9; padding: 32px; border-radius: 12px;"><div style="text-align: center; margin-bottom: 24px;"><h1 style="color: #1a2744; font-size: 24px; margin: 0;">Manta Shark Aquatics</h1></div><div style="background: white; border-radius: 8px; padding: 24px;"><h2 style="color: #1a2744; margin-top: 0;">Sign-in email changed</h2><p>The email you use to sign in to Manta Shark Aquatics was changed from <strong>${esc(to)}</strong> to <strong>${esc(newValue)}</strong> by ${esc(payload.changedBy || 'a manager')}.</p><p>From now on, use the new address to sign in. Your password and PIN have not changed.</p><p style="color:#666; font-size: 13px;">If you did not expect this change, reply to this email or tell a manager right away.</p></div></div>`

  } else if (type === 'fixed_class_renewal' || type === 'fixed_class_moved') {
    // Both in the family's language. date = the class's last lesson (renewal),
    // expiresOn = the day the held slot opens to other families.
    const L = toLocale(payload.lang)
    const t = getT(L)
    const loc = L === 'en' ? 'en-US' : L === 'zh-Hans' ? 'zh-CN' : 'zh-TW'
    const day = (d?: string) => d ? new Date(d + 'T12:00:00Z').toLocaleDateString(loc, { month: 'long', day: 'numeric', weekday: 'short', timeZone: 'UTC' }) : ''
    // 2026-01-04 was a Sunday, so +weekday lands on the right day name.
    const weekdayName = new Date(`2026-01-${String(4 + Number(payload.weekday ?? 0)).padStart(2, '0')}T12:00:00Z`).toLocaleDateString(loc, { weekday: 'long', timeZone: 'UTC' })
    const names = (payload.studentNames || []).map(esc).join(L === 'en' ? ' & ' : '、')
    const vars = { names, weekday: weekdayName, time: esc(time || ''), coach: esc(coachName || ''), date: day(date), hold: day(payload.expiresOn) }
    const shell = (title: string, inner: string, btnHref: string, btn: string) => `<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; background: #f6f9fd; padding: 32px; border-radius: 12px;"><div style="text-align: center; margin-bottom: 24px;"><div style="color: #12254a; font-size: 18px; font-weight: 800; letter-spacing: 0.3em;">MANTA SHARK</div></div><div style="background: white; border-radius: 10px; padding: 28px;"><h2 style="color: #12254a; margin-top: 0;">${title}</h2><p style="color: #16294a;">${t('assess.email.hi', { name: esc(parentName || '') })}</p>${inner}<div style="text-align:center; margin: 28px 0 8px;"><a href="${esc(btnHref)}" style="display: inline-block; background: #f09800; color: #12254a; font-weight: 800; padding: 14px 32px; border-radius: 10px; text-decoration: none;">${btn}</a></div></div></div>`
    // The pool, under the body: these two go out in the family's language and
    // have no label rows, so a pin and the pool's own name and address say it
    // without a word to translate.
    const poolP = payload.location ? `<p style="color: #16294a; line-height: 1.6;">&#128205; ${placeHtml(t, payload.location, pool)}</p>` : ''
    if (type === 'fixed_class_renewal') {
      // Plain text: the escaped names showed "O&#39;Brien" in the subject line
      // (found 2026-10-07). The escaped vars stay for the HTML body.
      const plainNames = (payload.studentNames || []).join(L === 'en' ? ' & ' : '、')
      subject = t('fixed.email.renew.subject', { ...vars, names: plainNames })
      html = shell(t('fixed.email.renew.title'), `<p style="color: #16294a; line-height: 1.6;">${t(payload.expiresOn ? 'fixed.email.renew.body' : 'fixed.email.renew.bodyNoHold', vars)}</p>` + poolP,
        payload.linkUrl || 'https://www.mantasharkaquatics.net/dashboard', t('fixed.email.renew.button'))
    } else {
      const items = payload.moveItems || []
      const rows = items.map(i => `<tr><td style="padding: 6px 0; font-weight: 600; color: #16294a;">${day(i.date)}</td><td style="padding: 6px 0; color: #56647d;">${i.kind === 'later' ? t('fixed.email.move.later') : i.kind === 'other_coach' ? t('fixed.email.move.other', { coach: esc(i.coach) }) : ''}</td></tr>`).join('')
      const n = Number(amount ?? 0)
      subject = t('fixed.email.move.subject', vars)
      html = shell(t('fixed.email.move.title'),
        `<p style="color: #16294a; line-height: 1.6;">${t('fixed.email.move.body', vars)}</p>` + poolP
        + (rows ? `<h3 style="color: #12254a; margin: 18px 0 6px; font-size: 15px;">${t('fixed.email.move.dates', { n: items.length })}</h3><table style="width: 100%; border-collapse: collapse;">${rows}</table>` : '')
        + (n > 0 ? `<p style="background: #fdf3e1; border: 1px solid #f3dcae; border-radius: 10px; padding: 12px 14px; color: #7a4b00; line-height: 1.6;">${t('fixed.email.move.vouchers', { n })}</p>` : ''),
        'https://www.mantasharkaquatics.net/dashboard', t('fixed.email.move.button'))
    }
  }

  // Any other email about lessons (a fixed class moved) carries its calendar
  // files the same way.
  if (!attachments && payload.calendar?.length && html) {
    const L = toLocale(payload.lang)
    attachments = calendarAttachments(payload, L)
    if (attachments.some(f => f.contentType.endsWith('REQUEST'))) html = withCalendarNote(html, L)
    if (!attachments.length) attachments = undefined
  }

  if (!subject || !html) {
    console.error('sendEmail: unknown type', type)
    return false
  }

  try {
    // Resend reports an API failure in its result, not by throwing. Checked
    // since 2026-10-06, so a false here really means "not sent".
    const { error } = await resend.emails.send({
      from: EMAIL_FROM,
      replyTo: CONTACT_EMAIL,
      to,
      subject,
      html,
      ...(text ? { text } : {}),
      ...(attachments ? { attachments } : {}),
    })
    if (error) throw error
    return true
  } catch (err) {
    console.error('Email error:', err)
    return false
  }
}

/**
 * An email whose subject and HTML were built elsewhere (lib/birthday.ts), with
 * optional extra headers -- List-Unsubscribe for marketing mail. Same sender,
 * reply-to and failure reporting as sendEmail: false means not sent.
 */
export async function sendRawEmail(msg: { to: string; subject: string; html: string; headers?: Record<string, string> }): Promise<boolean> {
  try {
    const { error } = await resend.emails.send({
      from: EMAIL_FROM,
      replyTo: CONTACT_EMAIL,
      to: msg.to,
      subject: msg.subject,
      html: msg.html,
      ...(msg.headers ? { headers: msg.headers } : {}),
    })
    if (error) throw error
    return true
  } catch (err) {
    console.error('Email error:', err)
    return false
  }
}
