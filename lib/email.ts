import { Resend } from 'resend'
import { TRIAL_PRICE_CENTS, TRIAL_HOLD_MINUTES } from './plans'
// From i18n/all, not i18n: index.ts holds only English now, so the voucher,
// fixed-class and assessment emails went out in English (found 2026-10-05).
// This file is server-only, so the extra dictionaries never reach the browser.
import { getT, toLocale } from './i18n/all'
import { stageNameKey } from './levels'
import { ASSESSMENT_POINTS as CREDIT_POINTS, ASSESSMENT_CREDIT_LESSONS as CREDIT_LESSONS } from './points'

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
  | 'partner_reschedule_requested'
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
  | 'fixed_class_ended'
  | 'fixed_class_renewal'
  | 'fixed_class_moved'
  | 'welcome'

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
  refundKind?: 'points' | 'voucher' | 'none'
  requesterStudentName?: string
  partnerStudentName?: string
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
  reversalKind?: 'payment_failed' | 'chargeback'
  // refund_issued: the part still to be handed over in person, if any.
  handBackAmount?: number
  // referral_reward: which side of the referral this family is, the other
  // family's last name, and the date the reward stops working.
  referralRole?: 'referrer' | 'referred'
  otherFamily?: string
  expiresOn?: string
  // booking_cancelled: a leave voucher's first usable date (null = at once).
  usableFrom?: string
  /** booking_cancelled: a make-up was cancelled in time and its voucher came back. */
  voucherBack?: boolean
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
  reportId?: string
  // voucher_expiring: which lesson the voucher is for (course slug, minutes).
  minutes?: number
  // fixed_class_renewal / fixed_class_moved: the class's weekday (0 = Sunday),
  // where the renewal button goes, and where each moved lesson landed.
  weekday?: number
  linkUrl?: string
  moveItems?: { date: string; kind: string; coach: string }[]
}

export async function sendEmail(payload: EmailPayload): Promise<boolean> {
  const { type, to, parentName, studentName, partnerName, courseName, coachName, date, time, paymentUrl, inviterName, invoiceNumber, invoiceId, invoiceUrl, amount, refundKind, code, changeField, newValue, applicantName, applicantEmail, applicantPhone, applicantCity, roleLabel, hasResume, appUrl } = payload

  let subject = ''
  let html = ''

  const formattedDate = date ? new Date(/^\d{4}-\d{2}-\d{2}$/.test(date) ? date + 'T00:00:00Z' : date).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' }) : ''

  if (type === 'booking_confirmed') {
    subject = `Booking Confirmed – ${courseName} on ${formattedDate}`
    html = `<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; background: #f9f9f9; padding: 32px; border-radius: 12px;"><div style="text-align: center; margin-bottom: 24px;"><h1 style="color: #1a2744; font-size: 24px; margin: 0;">Manta Shark Aquatics</h1></div><div style="background: white; border-radius: 8px; padding: 24px; margin-bottom: 16px;"><h2 style="color: #1a2744; margin-top: 0;">✅ Booking Confirmed!</h2><p>Hi ${esc(parentName)},</p><p>Your lesson has been booked successfully. Here are the details:</p><table style="width: 100%; border-collapse: collapse;"><tr><td style="padding: 8px 16px 8px 0; color: #666; white-space: nowrap; width: 1%; vertical-align: top;">Student</td><td style="padding: 8px 0; font-weight: 600;">${esc(studentName)}</td></tr>${partnerName ? `<tr><td style="padding: 8px 16px 8px 0; color: #666; white-space: nowrap; width: 1%; vertical-align: top;">Partner</td><td style="padding: 8px 0; font-weight: 600;">${esc(partnerName)}</td></tr>` : ''}<tr><td style="padding: 8px 16px 8px 0; color: #666; white-space: nowrap; width: 1%; vertical-align: top;">Course</td><td style="padding: 8px 0; font-weight: 600;">${esc(courseName)}</td></tr><tr><td style="padding: 8px 16px 8px 0; color: #666; white-space: nowrap; width: 1%; vertical-align: top;">Coach</td><td style="padding: 8px 0; font-weight: 600;">${esc(coachName)}</td></tr><tr><td style="padding: 8px 16px 8px 0; color: #666; white-space: nowrap; width: 1%; vertical-align: top;">Date</td><td style="padding: 8px 0; font-weight: 600;">${formattedDate}</td></tr><tr><td style="padding: 8px 16px 8px 0; color: #666; white-space: nowrap; width: 1%; vertical-align: top;">Time</td><td style="padding: 8px 0; font-weight: 600;">${esc(time)}</td></tr></table></div><p style="color: #666; font-size: 13px; text-align: center;">Questions? Reply to this email or chat with us at <a href="https://www.mantasharkaquatics.net">mantasharkaquatics.net</a></p></div>`

  } else if (type === 'contact_change_code') {
    subject = `Your Manta Shark Aquatics verification code`
    html = `<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; background: #f9f9f9; padding: 32px; border-radius: 12px;"><div style="text-align: center; margin-bottom: 24px;"><h1 style="color: #1a2744; font-size: 24px; margin: 0;">Manta Shark Aquatics</h1></div><div style="background: white; border-radius: 8px; padding: 24px;"><h2 style="color: #1a2744; margin-top: 0;">Verification code</h2><p>Hi ${esc(parentName)},</p><p>You asked us to update the phone number on your account. Share this code with our staff to confirm:</p><div style="text-align:center; margin: 24px 0;"><span style="display:inline-block; font-size: 32px; letter-spacing: 8px; font-weight: 700; color:#1a2744; background:#f1f1f1; padding: 14px 24px; border-radius: 8px;">${esc(code)}</span></div><p style="color:#666; font-size: 13px;">The code expires in 10 minutes. If you did not request this change, do not share the code — reply to this email and let us know.</p></div></div>`

  } else if (type === 'applicant_verification_code') {
    subject = `Your Manta Shark Aquatics application code`
    html = `<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; background: #f9f9f9; padding: 32px; border-radius: 12px;"><div style="text-align: center; margin-bottom: 24px;"><h1 style="color: #1a2744; font-size: 24px; margin: 0;">Manta Shark Aquatics</h1></div><div style="background: white; border-radius: 8px; padding: 24px;"><h2 style="color: #1a2744; margin-top: 0;">Verify your email</h2><p>Hi ${esc(applicantName)},</p><p>Thanks for starting an application with us. Enter this code to verify your email address and continue:</p><div style="text-align:center; margin: 24px 0;"><span style="display:inline-block; font-size: 32px; letter-spacing: 8px; font-weight: 700; color:#1a2744; background:#f1f1f1; padding: 14px 24px; border-radius: 8px;">${esc(code)}</span></div><p style="color:#666; font-size: 13px;">The code expires in 10 minutes. If you did not start an application, you can ignore this email.</p></div></div>`

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

  } else if (type === 'contact_change_notice') {
    const what = changeField === 'email' ? 'email address' : 'phone number'
    subject = `Your Manta Shark Aquatics ${what} was changed`
    html = `<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; background: #f9f9f9; padding: 32px; border-radius: 12px;"><div style="text-align: center; margin-bottom: 24px;"><h1 style="color: #1a2744; font-size: 24px; margin: 0;">Manta Shark Aquatics</h1></div><div style="background: white; border-radius: 8px; padding: 24px;"><h2 style="color: #1a2744; margin-top: 0;">Account ${what} updated</h2><p>Hi ${esc(parentName)},</p><p>The ${what} on your account is now <strong>${esc(newValue)}</strong>.</p><p style="color:#666; font-size: 13px;">If you did not request this change, contact us immediately by replying to this email or calling the front desk.</p></div></div>`

  } else if (type === 'trial_payment_link') {
    const trialPrice = `$${Number(amount ?? TRIAL_PRICE_CENTS / 100)}`
    subject = `Complete Your Swim Assessment Booking – ${trialPrice}`
    html = `<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; background: #f9f9f9; padding: 32px; border-radius: 12px;"><div style="text-align: center; margin-bottom: 24px;"><h1 style="color: #1a2744; font-size: 24px; margin: 0;">Manta Shark Aquatics</h1></div><div style="background: white; border-radius: 8px; padding: 24px; margin-bottom: 16px;"><h2 style="color: #1a2744; margin-top: 0;">🏊 Swim Assessment Reserved</h2><p>Hi ${esc(parentName)},</p><p>We've reserved a Swim Assessment time for ${esc(studentName)}. Please complete payment within ${TRIAL_HOLD_MINUTES} minutes to confirm your spot — after that the time is released for other families:</p><table style="width: 100%; border-collapse: collapse;"><tr><td style="padding: 8px 16px 8px 0; color: #666; white-space: nowrap; width: 1%; vertical-align: top;">Student</td><td style="padding: 8px 0; font-weight: 600;">${esc(studentName)}</td></tr><tr><td style="padding: 8px 16px 8px 0; color: #666; white-space: nowrap; width: 1%; vertical-align: top;">Course</td><td style="padding: 8px 0; font-weight: 600;">${esc(courseName)}</td></tr><tr><td style="padding: 8px 16px 8px 0; color: #666; white-space: nowrap; width: 1%; vertical-align: top;">Coach</td><td style="padding: 8px 0; font-weight: 600;">${esc(coachName)}</td></tr><tr><td style="padding: 8px 16px 8px 0; color: #666; white-space: nowrap; width: 1%; vertical-align: top;">Date</td><td style="padding: 8px 0; font-weight: 600;">${formattedDate}</td></tr><tr><td style="padding: 8px 16px 8px 0; color: #666; white-space: nowrap; width: 1%; vertical-align: top;">Time</td><td style="padding: 8px 0; font-weight: 600;">${esc(time)}</td></tr><tr><td style="padding: 8px 16px 8px 0; color: #666; white-space: nowrap; width: 1%; vertical-align: top;">Price</td><td style="padding: 8px 0; font-weight: 600;">${trialPrice}</td></tr></table><div style="text-align: center; margin-top: 24px;"><a href="${esc(paymentUrl)}" style="display: inline-block; background: #c9a84c; color: #1a2744; font-weight: 700; padding: 14px 32px; border-radius: 8px; text-decoration: none;">Complete Payment</a></div></div><p style="color: #666; font-size: 13px; text-align: center;">Questions? Reply to this email or chat with us at <a href="https://www.mantasharkaquatics.net">mantasharkaquatics.net</a></p></div>`

  } else if (type === 'booking_rescheduled') {
    subject = `Lesson Rescheduled – ${courseName} on ${formattedDate}`
    html = `<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; background: #f9f9f9; padding: 32px; border-radius: 12px;"><div style="text-align: center; margin-bottom: 24px;"><h1 style="color: #1a2744; font-size: 24px; margin: 0;">Manta Shark Aquatics</h1></div><div style="background: white; border-radius: 8px; padding: 24px; margin-bottom: 16px;"><h2 style="color: #1a2744; margin-top: 0;">📅 Lesson Rescheduled</h2><p>Hi ${esc(parentName)},</p><p>Your lesson has been rescheduled. Here are your new details:</p><table style="width: 100%; border-collapse: collapse;"><tr><td style="padding: 8px 16px 8px 0; color: #666; white-space: nowrap; width: 1%; vertical-align: top;">Student</td><td style="padding: 8px 0; font-weight: 600;">${esc(studentName)}</td></tr><tr><td style="padding: 8px 16px 8px 0; color: #666; white-space: nowrap; width: 1%; vertical-align: top;">Course</td><td style="padding: 8px 0; font-weight: 600;">${esc(courseName)}</td></tr><tr><td style="padding: 8px 16px 8px 0; color: #666; white-space: nowrap; width: 1%; vertical-align: top;">Coach</td><td style="padding: 8px 0; font-weight: 600;">${esc(coachName)}</td></tr><tr><td style="padding: 8px 16px 8px 0; color: #666; white-space: nowrap; width: 1%; vertical-align: top;">New Date</td><td style="padding: 8px 0; font-weight: 600;">${formattedDate}</td></tr><tr><td style="padding: 8px 16px 8px 0; color: #666; white-space: nowrap; width: 1%; vertical-align: top;">New Time</td><td style="padding: 8px 0; font-weight: 600;">${esc(time)}</td></tr></table></div><p style="color: #666; font-size: 13px; text-align: center;">Questions? Reply to this email or chat with us at <a href="https://www.mantasharkaquatics.net">mantasharkaquatics.net</a></p></div>`

  } else if (type === 'booking_cancelled') {
    subject = `Lesson Cancelled – ${courseName} on ${formattedDate}`
    const rk = refundKind || 'credit'
    const voucherBy = payload.expiresOn
      ? new Date(payload.expiresOn + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' })
      : ''
    const cancelLine = rk === 'none'
      ? 'Your lesson has been cancelled.'
      : rk === 'voucher' && payload.voucherBack
      ? 'Your make-up lesson has been cancelled and the make-up voucher has been returned to your account.'
      : rk === 'voucher'
      ? 'Your lesson has been cancelled and turned into a make-up voucher.'
      : 'Your lesson has been cancelled and the points have been returned to your account.'
    const readyLine = rk === 'none'
      ? "You're welcome to rebook any available time on your dashboard."
      : rk === 'voucher'
      ? (payload.usableFrom && voucherBy
        ? `Book your make-up lesson from your dashboard for a date between ${new Date(payload.usableFrom + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' })} and ${voucherBy} (14 days either side of the missed lesson). You can book it now. It costs no points.`
        : `Book your make-up lesson from your dashboard${voucherBy ? ` by ${voucherBy}` : ''}. It costs no points.`)
      : 'Your points are back in your wallet.'
    html = `<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; background: #f9f9f9; padding: 32px; border-radius: 12px;"><div style="text-align: center; margin-bottom: 24px;"><h1 style="color: #1a2744; font-size: 24px; margin: 0;">Manta Shark Aquatics</h1></div><div style="background: white; border-radius: 8px; padding: 24px; margin-bottom: 16px;"><h2 style="color: #1a2744; margin-top: 0;">❌ Lesson Cancelled</h2><p>Hi ${esc(parentName)},</p><p>${cancelLine}</p><table style="width: 100%; border-collapse: collapse;"><tr><td style="padding: 8px 16px 8px 0; color: #666; white-space: nowrap; width: 1%; vertical-align: top;">Student</td><td style="padding: 8px 0; font-weight: 600;">${esc(studentName)}</td></tr><tr><td style="padding: 8px 16px 8px 0; color: #666; white-space: nowrap; width: 1%; vertical-align: top;">Course</td><td style="padding: 8px 0; font-weight: 600;">${esc(courseName)}</td></tr><tr><td style="padding: 8px 16px 8px 0; color: #666; white-space: nowrap; width: 1%; vertical-align: top;">Date</td><td style="padding: 8px 0; font-weight: 600;">${formattedDate}</td></tr><tr><td style="padding: 8px 16px 8px 0; color: #666; white-space: nowrap; width: 1%; vertical-align: top;">Time</td><td style="padding: 8px 0; font-weight: 600;">${esc(time)}</td></tr></table><p style="color: #c9a84c; font-weight: 600;">${readyLine}</p></div><p style="color: #666; font-size: 13px; text-align: center;">Questions? Reply to this email or chat with us at <a href="https://www.mantasharkaquatics.net">mantasharkaquatics.net</a></p></div>`

  } else if (type === 'block_cancellation_notice') {
    subject = `Lesson Cancelled \u2013 ${courseName} on ${formattedDate}`
    const refundLine = refundKind === 'none' ? ''
      : refundKind === 'voucher' ? ' Your make-up voucher will be returned to your account so you can book another time.'
      : ' The points will be automatically returned to your account.'
    html = `<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; background: #f9f9f9; padding: 32px; border-radius: 12px;"><div style="text-align: center; margin-bottom: 24px;"><h1 style="color: #1a2744; font-size: 24px; margin: 0;">Manta Shark Aquatics</h1></div><div style="background: white; border-radius: 8px; padding: 24px; margin-bottom: 16px;"><h2 style="color: #1a2744; margin-top: 0;">Lesson Cancellation Notice</h2><p>Hi ${esc(parentName)},</p><p>We're sorry \u2014 Coach ${esc(coachName)} is unavailable at the time below, so the following lesson has been cancelled.${refundLine}</p><table style="width: 100%; border-collapse: collapse;"><tr><td style="padding: 8px 16px 8px 0; color: #666; white-space: nowrap; width: 1%; vertical-align: top;">Student</td><td style="padding: 8px 0; font-weight: 600;">${esc(studentName)}</td></tr><tr><td style="padding: 8px 16px 8px 0; color: #666; white-space: nowrap; width: 1%; vertical-align: top;">Course</td><td style="padding: 8px 0; font-weight: 600;">${esc(courseName)}</td></tr><tr><td style="padding: 8px 16px 8px 0; color: #666; white-space: nowrap; width: 1%; vertical-align: top;">Coach</td><td style="padding: 8px 0; font-weight: 600;">${esc(coachName)}</td></tr><tr><td style="padding: 8px 16px 8px 0; color: #666; white-space: nowrap; width: 1%; vertical-align: top;">Date</td><td style="padding: 8px 0; font-weight: 600;">${formattedDate}</td></tr><tr><td style="padding: 8px 16px 8px 0; color: #666; white-space: nowrap; width: 1%; vertical-align: top;">Time</td><td style="padding: 8px 0; font-weight: 600;">${esc(time)}</td></tr></table><p style="margin-top: 16px;">You're welcome to rebook any available time on your dashboard. We apologize for the inconvenience.</p></div><p style="color: #666; font-size: 13px; text-align: center;">Questions? Reply to this email or chat with us at <a href="https://www.mantasharkaquatics.net">mantasharkaquatics.net</a></p></div>`
  } else if (type === 'reminder_24h') {
    subject = `Reminder: ${courseName} Tomorrow at ${time}`
    html = `<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; background: #f9f9f9; padding: 32px; border-radius: 12px;"><div style="text-align: center; margin-bottom: 24px;"><h1 style="color: #1a2744; font-size: 24px; margin: 0;">Manta Shark Aquatics</h1></div><div style="background: white; border-radius: 8px; padding: 24px; margin-bottom: 16px;"><h2 style="color: #1a2744; margin-top: 0;">🏊 Lesson Tomorrow!</h2><p>Hi ${esc(parentName)},</p><p>Just a reminder that ${esc(studentName)} has a lesson tomorrow!</p><table style="width: 100%; border-collapse: collapse;"><tr><td style="padding: 8px 16px 8px 0; color: #666; white-space: nowrap; width: 1%; vertical-align: top;">Student</td><td style="padding: 8px 0; font-weight: 600;">${esc(studentName)}</td></tr><tr><td style="padding: 8px 16px 8px 0; color: #666; white-space: nowrap; width: 1%; vertical-align: top;">Course</td><td style="padding: 8px 0; font-weight: 600;">${esc(courseName)}</td></tr><tr><td style="padding: 8px 16px 8px 0; color: #666; white-space: nowrap; width: 1%; vertical-align: top;">Coach</td><td style="padding: 8px 0; font-weight: 600;">${esc(coachName)}</td></tr><tr><td style="padding: 8px 16px 8px 0; color: #666; white-space: nowrap; width: 1%; vertical-align: top;">Date</td><td style="padding: 8px 0; font-weight: 600;">${formattedDate}</td></tr><tr><td style="padding: 8px 16px 8px 0; color: #666; white-space: nowrap; width: 1%; vertical-align: top;">Time</td><td style="padding: 8px 0; font-weight: 600;">${esc(time)}</td></tr></table><p>Please arrive 5 minutes early. See you in the pool! 🦈</p></div><p style="color: #666; font-size: 13px; text-align: center;">Questions? Reply to this email or chat with us at <a href="https://www.mantasharkaquatics.net">mantasharkaquatics.net</a></p></div>`

  } else if (type === 'partner_booking_invite') {
    // No figure here on purpose. The dashboard shows the invited family the
    // exact cost, from the live price list, before they confirm. The dashboard shows them theirs before
    // they confirm.
    subject = `Invitation: ${inviterName} invited ${studentName} to a 1-on-2 lesson`
    html = `<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; background: #f9f9f9; padding: 32px; border-radius: 12px;"><div style="text-align: center; margin-bottom: 24px;"><h1 style="color: #1a2744; font-size: 24px; margin: 0;">Manta Shark Aquatics</h1></div><div style="background: white; border-radius: 8px; padding: 24px; margin-bottom: 16px;"><h2 style="color: #1a2744; margin-top: 0;">🔔 Partner Lesson Invitation</h2><p>Hi ${esc(parentName)},</p><p><strong>${esc(inviterName)}</strong> has invited <strong>${esc(studentName)}</strong> to join the lesson below. Please sign in to your dashboard within 15 minutes to confirm:</p><table style="width: 100%; border-collapse: collapse;"><tr><td style="padding: 8px 16px 8px 0; color: #666; white-space: nowrap; width: 1%; vertical-align: top;">Student</td><td style="padding: 8px 0; font-weight: 600;">${esc(studentName)}</td></tr><tr><td style="padding: 8px 16px 8px 0; color: #666; white-space: nowrap; width: 1%; vertical-align: top;">Course</td><td style="padding: 8px 0; font-weight: 600;">${esc(courseName)}</td></tr><tr><td style="padding: 8px 16px 8px 0; color: #666; white-space: nowrap; width: 1%; vertical-align: top;">Coach</td><td style="padding: 8px 0; font-weight: 600;">${esc(coachName)}</td></tr><tr><td style="padding: 8px 16px 8px 0; color: #666; white-space: nowrap; width: 1%; vertical-align: top;">Date</td><td style="padding: 8px 0; font-weight: 600;">${formattedDate}</td></tr><tr><td style="padding: 8px 16px 8px 0; color: #666; white-space: nowrap; width: 1%; vertical-align: top;">Time</td><td style="padding: 8px 0; font-weight: 600;">${esc(time)}</td></tr></table><div style="text-align: center; margin-top: 24px;"><a href="https://www.mantasharkaquatics.net/dashboard" style="display: inline-block; background: #7b61c4; color: white; font-weight: 700; padding: 14px 32px; border-radius: 8px; text-decoration: none;">Review Invitation</a></div><p style="color: #999; font-size: 12px; margin-top: 16px;">Confirming will use points from your wallet — your dashboard shows exactly how many before you confirm. The invitation expires automatically if not confirmed in time.</p></div></div>`

  } else if (type === 'partner_booking_confirmed') {
    subject = `✅ ${studentName} Confirmed – ${courseName} on ${formattedDate}`
    html = `<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; background: #f9f9f9; padding: 32px; border-radius: 12px;"><div style="text-align: center; margin-bottom: 24px;"><h1 style="color: #1a2744; font-size: 24px; margin: 0;">Manta Shark Aquatics</h1></div><div style="background: white; border-radius: 8px; padding: 24px; margin-bottom: 16px;"><h2 style="color: #1a2744; margin-top: 0;">✅ Booking Confirmed</h2><p>Hi ${esc(parentName)},</p><p><strong>${esc(studentName)}</strong> has confirmed. Your 1-on-2 lesson is officially booked!</p><table style="width: 100%; border-collapse: collapse;"><tr><td style="padding: 8px 16px 8px 0; color: #666; white-space: nowrap; width: 1%; vertical-align: top;">Course</td><td style="padding: 8px 0; font-weight: 600;">${esc(courseName)}</td></tr><tr><td style="padding: 8px 16px 8px 0; color: #666; white-space: nowrap; width: 1%; vertical-align: top;">Coach</td><td style="padding: 8px 0; font-weight: 600;">${esc(coachName)}</td></tr><tr><td style="padding: 8px 16px 8px 0; color: #666; white-space: nowrap; width: 1%; vertical-align: top;">Date</td><td style="padding: 8px 0; font-weight: 600;">${formattedDate}</td></tr><tr><td style="padding: 8px 16px 8px 0; color: #666; white-space: nowrap; width: 1%; vertical-align: top;">Time</td><td style="padding: 8px 0; font-weight: 600;">${esc(time)}</td></tr></table></div></div>`

  } else if (type === 'partner_booking_rejected') {
    // Accurate to what /api/bookings/reject-partner does (found 2026-10-05):
    // declining cancels the inviter's pending row too (all four rows of an
    // hour), and nothing was charged -- both families pay only on confirm.
    // The old text said the inviter's own booking was still active.
    subject = `❌ ${studentName} Declined – ${courseName} on ${formattedDate}`
    html = `<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; background: #f9f9f9; padding: 32px; border-radius: 12px;"><div style="text-align: center; margin-bottom: 24px;"><h1 style="color: #1a2744; font-size: 24px; margin: 0;">Manta Shark Aquatics</h1></div><div style="background: white; border-radius: 8px; padding: 24px; margin-bottom: 16px;"><h2 style="color: #1a2744; margin-top: 0;">❌ Invitation Declined</h2><p>Hi ${esc(parentName)},</p><p><strong>${esc(studentName)}</strong> has declined your 1-on-2 invitation, so the lesson below was not booked.</p><table style="width: 100%; border-collapse: collapse;"><tr><td style="padding: 8px 16px 8px 0; color: #666; white-space: nowrap; width: 1%; vertical-align: top;">Course</td><td style="padding: 8px 0; font-weight: 600;">${esc(courseName)}</td></tr><tr><td style="padding: 8px 16px 8px 0; color: #666; white-space: nowrap; width: 1%; vertical-align: top;">Date</td><td style="padding: 8px 0; font-weight: 600;">${formattedDate}</td></tr><tr><td style="padding: 8px 16px 8px 0; color: #666; white-space: nowrap; width: 1%; vertical-align: top;">Time</td><td style="padding: 8px 0; font-weight: 600;">${esc(time)}</td></tr></table><p style="color: #666;">No points were taken from your account. You're welcome to book another time from your dashboard.</p></div></div>`

  } else if (type === 'partner_invite_expired') {
    subject = `Invitation Expired \u2013 ${courseName} on ${formattedDate}`
    html = `<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; background: #f9f9f9; padding: 32px; border-radius: 12px;"><div style="text-align: center; margin-bottom: 24px;"><h1 style="color: #1a2744; font-size: 24px; margin: 0;">Manta Shark Aquatics</h1></div><div style="background: white; border-radius: 8px; padding: 24px; margin-bottom: 16px;"><h2 style="color: #1a2744; margin-top: 0;">\u23f3 Invitation Expired</h2><p>Hi ${esc(parentName)},</p><p>The partner lesson invitation below was not confirmed in time, so the reserved time has been released. <strong>No points were used.</strong></p><table style="width: 100%; border-collapse: collapse;"><tr><td style="padding: 8px 16px 8px 0; color: #666; white-space: nowrap; width: 1%; vertical-align: top;">Student</td><td style="padding: 8px 0; font-weight: 600;">${esc(studentName)}</td></tr><tr><td style="padding: 8px 16px 8px 0; color: #666; white-space: nowrap; width: 1%; vertical-align: top;">Course</td><td style="padding: 8px 0; font-weight: 600;">${esc(courseName)}</td></tr><tr><td style="padding: 8px 16px 8px 0; color: #666; white-space: nowrap; width: 1%; vertical-align: top;">Coach</td><td style="padding: 8px 0; font-weight: 600;">${esc(coachName)}</td></tr><tr><td style="padding: 8px 16px 8px 0; color: #666; white-space: nowrap; width: 1%; vertical-align: top;">Date</td><td style="padding: 8px 0; font-weight: 600;">${formattedDate}</td></tr><tr><td style="padding: 8px 16px 8px 0; color: #666; white-space: nowrap; width: 1%; vertical-align: top;">Time</td><td style="padding: 8px 0; font-weight: 600;">${esc(time)}</td></tr></table><p style="margin-top: 16px;">You're welcome to book again at any available time on your dashboard.</p><div style="text-align: center; margin-top: 24px;"><a href="https://www.mantasharkaquatics.net/dashboard" style="display: inline-block; background: #1a2744; color: white; font-weight: 700; padding: 14px 32px; border-radius: 8px; text-decoration: none;">Go to My Dashboard</a></div></div><p style="color: #666; font-size: 13px; text-align: center;">Questions? Reply to this email or chat with us at <a href="https://www.mantasharkaquatics.net">mantasharkaquatics.net</a></p></div>`

  } else if (type === 'partner_reschedule_requested') {
    subject = `Reschedule Request – ${courseName}`
    html = `<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; background: #f9f9f9; padding: 32px; border-radius: 12px;"><div style="text-align: center; margin-bottom: 24px;"><h1 style="color: #1a2744; font-size: 24px; margin: 0;">Manta Shark Aquatics</h1></div><div style="background: white; border-radius: 8px; padding: 24px; margin-bottom: 16px;"><h2 style="color: #1a2744; margin-top: 0;">📅 Reschedule Request</h2><p>Hi ${esc(parentName)},</p><p>Your 1-on-2 lesson partner has requested to reschedule. Please sign in to your dashboard to confirm or decline.</p><div style="text-align: center; margin-top: 24px;"><a href="https://www.mantasharkaquatics.net/dashboard" style="display: inline-block; background: #1a2744; color: white; font-weight: 700; padding: 14px 32px; border-radius: 8px; text-decoration: none;">Review Request</a></div></div></div>`

  } else if (type === 'invoice') {
    subject = `🧾 Invoice ${invoiceNumber} – Manta Shark Aquatics`
    html = `<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; background: #f9f9f9; padding: 32px; border-radius: 12px;"><div style="text-align: center; margin-bottom: 24px;"><h1 style="color: #1a2744; font-size: 24px; margin: 0;">Manta Shark Aquatics</h1></div><div style="background: white; border-radius: 8px; padding: 24px; margin-bottom: 16px;"><h2 style="color: #1a2744; margin-top: 0;">🧾 Invoice ${esc(invoiceNumber)}</h2><p>Hi ${esc(parentName)},</p><p>Thank you for your payment! Your invoice is ready. Log in to your dashboard to view and download it anytime.</p><table style="width: 100%; border-collapse: collapse;"><tr><td style="padding: 8px 16px 8px 0; color: #666; white-space: nowrap; width: 1%; vertical-align: top;">Invoice Number</td><td style="padding: 8px 0; font-weight: 600;">${esc(invoiceNumber)}</td></tr><tr><td style="padding: 8px 16px 8px 0; color: #666; white-space: nowrap; width: 1%; vertical-align: top;">Amount Paid</td><td style="padding: 8px 0; font-weight: 600; color: #c9a84c;">$${Number(amount).toFixed(2)}</td></tr></table><div style="margin-top: 20px; text-align: center;"><a href="https://www.mantasharkaquatics.net/dashboard" style="background: #1a2744; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; display: inline-block;">Go to My Dashboard</a></div></div><p style="color: #666; font-size: 13px; text-align: center;">Questions? Reply to this email or chat with us at <a href="https://www.mantasharkaquatics.net">mantasharkaquatics.net</a></p></div>`
  } else if (type === 'refund_issued') {
    // No apology and no upsell. They asked for their money back and they are
    // getting it; the only thing this has to do is say how much, when it lands,
    // and what still needs a person.
    const total = Number(amount ?? 0)
    const hand = Number(payload.handBackAmount ?? 0)
    const card = total - hand
    const cardLine = card > 0
      ? `<p><strong>$${card.toFixed(2)}</strong> is on its way back to the card or account you paid with. Banks usually show it within 5\u201310 business days.</p>`
      : ''
    const handLine = hand > 0
      ? `<p><strong>$${hand.toFixed(2)}</strong> was paid at the front desk, so we\u2019ll hand that back in person next time you\u2019re in \u2014 or tell us if you\u2019d rather we mailed a check.</p>`
      : ''
    subject = `Your $${total.toFixed(2)} refund from Manta Shark Aquatics`
    html = `<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; background: #f9f9f9; padding: 32px; border-radius: 12px;"><div style="text-align: center; margin-bottom: 24px;"><h1 style="color: #1a2744; font-size: 24px; margin: 0;">Manta Shark Aquatics</h1></div><div style="background: white; border-radius: 8px; padding: 24px; margin-bottom: 16px;"><h2 style="color: #1a2744; margin-top: 0;">Refund issued</h2><p>Hi ${esc(parentName)},</p><p>We\u2019ve refunded <strong>$${total.toFixed(2)}</strong> and taken the matching points out of your account.</p>${cardLine}${handLine}<p style="color:#666; font-size: 13px; margin-top: 16px;">Your points history on your dashboard shows this alongside everything else on your account. If anything doesn\u2019t look right, reply to this email and we\u2019ll sort it out.</p></div></div>`

  } else if (type === 'referral_reward') {
    const pts = Number(amount ?? 0)
    const why = payload.referralRole === 'referrer'
      ? `The ${esc(payload.otherFamily)} family, who joined with your referral code, has taken their first paid lesson. Thank you for introducing them!`
      : `Welcome aboard! You joined with the ${esc(payload.otherFamily)} family's referral code, and you've now taken your first paid lesson.`
    subject = `You've received ${pts} bonus points`
    html = `<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; background: #f9f9f9; padding: 32px; border-radius: 12px;"><div style="text-align: center; margin-bottom: 24px;"><h1 style="color: #1a2744; font-size: 24px; margin: 0;">Manta Shark Aquatics</h1></div><div style="background: white; border-radius: 8px; padding: 24px; margin-bottom: 16px;"><h2 style="color: #1a2744; margin-top: 0;">${pts} bonus points for you</h2><p>Hi ${esc(parentName)},</p><p>${why}</p><p><strong>${pts} bonus points</strong> have been added to your account${payload.expiresOn ? ` and can be used until <strong>${esc(payload.expiresOn)}</strong>` : ''}. Bonus points are used before your purchased points and cannot be exchanged for cash.</p><div style="text-align: center; margin-top: 24px;"><a href="https://www.mantasharkaquatics.net/dashboard" style="display: inline-block; background: #c9a84c; color: #1a2744; font-weight: 700; padding: 14px 32px; border-radius: 8px; text-decoration: none;">Book a Lesson</a></div></div><p style="color: #666; font-size: 13px; text-align: center;">Questions? Reply to this email or chat with us at <a href="https://www.mantasharkaquatics.net">mantasharkaquatics.net</a></p></div>`

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

  } else if (type === 'voucher_expiring') {
    // A make-up voucher runs out in a week. In the family's language, once.
    const L = toLocale(payload.lang)
    const t = getT(L)
    const by = payload.expiresOn
      ? new Date(payload.expiresOn + 'T12:00:00Z').toLocaleDateString(L === 'en' ? 'en-US' : L === 'zh-Hans' ? 'zh-CN' : 'zh-TW', { month: 'long', day: 'numeric', weekday: 'long', timeZone: 'UTC' })
      : ''
    const names = (payload.studentNames || []).map(esc).join(L === 'en' ? ' & ' : '、')
    const kind = t('voucher.kind.' + (payload.course || '1on1') + (payload.course === '1on1' ? '.' + (payload.minutes === 60 ? 60 : 30) : ''))
    subject = t('voucher.email.subject', { date: by })
    html = `<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; background: #f6f9fd; padding: 32px; border-radius: 12px;"><div style="text-align: center; margin-bottom: 24px;"><div style="color: #12254a; font-size: 18px; font-weight: 800; letter-spacing: 0.3em;">MANTA SHARK</div></div><div style="background: white; border-radius: 10px; padding: 28px;"><h2 style="color: #12254a; margin-top: 0;">${t('voucher.email.title')}</h2><p style="color: #16294a;">${t('assess.email.hi', { name: esc(parentName || '') })}</p><p style="color: #16294a; line-height: 1.6;">${t('voucher.email.body', { names, kind, date: by })}</p><div style="text-align:center; margin: 28px 0 8px;"><a href="https://www.mantasharkaquatics.net/dashboard?vouchers=1" style="display: inline-block; background: #f09800; color: #12254a; font-weight: 800; padding: 14px 32px; border-radius: 10px; text-decoration: none;">${t('voucher.email.button')}</a></div></div></div>`

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
    <a href="mailto:info@mantasharkaquatics.net" style="color: #f0b44d; text-decoration: none;">info@mantasharkaquatics.net</a> &middot; <a href="${SITE}" style="color: #f0b44d; text-decoration: none;">mantasharkaquatics.net</a><br>
    ${t('footer.location')} &middot; ${t('footer.hours')}
  </td></tr>
</table>
</td></tr></table>
</body></html>`

  } else if (type === 'fixed_class_ended') {
    // The front desk ended a fixed class part-way. reason is what the remaining
    // lessons became: refund (amount = points), voucher (amount = vouchers), keep.
    const n = Number(payload.lessonsReleased ?? 0)
    const what = payload.reason === 'refund'
      ? `${Number(amount ?? 0)} points have been returned to your account.`
      : payload.reason === 'voucher'
      ? `They have been turned into ${Number(amount ?? 0)} make-up voucher${Number(amount ?? 0) === 1 ? '' : 's'}, which you can use from your dashboard.`
      : ''
    subject = `Fixed class ended – ${courseName}`
    html = `<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; background: #f9f9f9; padding: 32px; border-radius: 12px;"><div style="text-align: center; margin-bottom: 24px;"><h1 style="color: #1a2744; font-size: 24px; margin: 0;">Manta Shark Aquatics</h1></div><div style="background: white; border-radius: 8px; padding: 24px; margin-bottom: 16px;"><h2 style="color: #1a2744; margin-top: 0;">Fixed class ended</h2><p>Hi ${esc(parentName)},</p><p>As we agreed, ${esc(studentName)}'s fixed ${esc(courseName)} class has ended. The ${n} remaining lesson${n === 1 ? ' has' : 's have'} been cancelled. ${what}</p></div><p style="color: #666; font-size: 13px; text-align: center;">Questions? Reply to this email or chat with us at <a href="https://www.mantasharkaquatics.net">mantasharkaquatics.net</a></p></div>`

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
    if (type === 'fixed_class_renewal') {
      subject = t('fixed.email.renew.subject', vars)
      html = shell(t('fixed.email.renew.title'), `<p style="color: #16294a; line-height: 1.6;">${t('fixed.email.renew.body', vars)}</p>`,
        payload.linkUrl || 'https://www.mantasharkaquatics.net/dashboard', t('fixed.email.renew.button'))
    } else {
      const items = payload.moveItems || []
      const rows = items.map(i => `<tr><td style="padding: 6px 0; font-weight: 600; color: #16294a;">${day(i.date)}</td><td style="padding: 6px 0; color: #56647d;">${i.kind === 'later' ? t('fixed.email.move.later') : i.kind === 'other_coach' ? t('fixed.email.move.other', { coach: esc(i.coach) }) : ''}</td></tr>`).join('')
      const n = Number(amount ?? 0)
      subject = t('fixed.email.move.subject', vars)
      html = shell(t('fixed.email.move.title'),
        `<p style="color: #16294a; line-height: 1.6;">${t('fixed.email.move.body', vars)}</p>`
        + (rows ? `<h3 style="color: #12254a; margin: 18px 0 6px; font-size: 15px;">${t('fixed.email.move.dates', { n: items.length })}</h3><table style="width: 100%; border-collapse: collapse;">${rows}</table>` : '')
        + (n > 0 ? `<p style="background: #fdf3e1; border: 1px solid #f3dcae; border-radius: 10px; padding: 12px 14px; color: #7a4b00; line-height: 1.6;">${t('fixed.email.move.vouchers', { n })}</p>` : ''),
        'https://www.mantasharkaquatics.net/dashboard', t('fixed.email.move.button'))
    }

  } else if (type === 'payment_reversed') {
    // Written to be read by someone who did nothing wrong. The overwhelmingly
    // likely story is a closed account or a typo'd routing number, not a
    // person trying it on -- so it says what happened, what it costs them, and
    // exactly which button fixes it, and it does not accuse anyone.
    const owed = Number(payload.pointsOwed ?? 0)
    const released = Number(payload.lessonsReleased ?? 0)
    const dollars = Number(amount ?? 0)
    const cause = payload.reversalKind === 'chargeback'
      ? 'Your bank has reversed this payment at your request.'
      : "Your bank wasn't able to complete this payment, so the funds never reached us."
    const releasedLine = released > 0
      ? `<p>To keep this from growing, we've released ${released} lesson${released === 1 ? '' : 's'} you hadn't taken yet and put those points back. You'll see a cancellation notice for each one.</p>`
      : ''
    const owedLine = owed > 0
      ? `<p>That leaves <strong>${owed.toLocaleString('en-US')} points</strong> to settle for lessons already taken. Booking is paused until the balance is settled.</p>`
      : '<p>Your balance is settled — nothing further is owed, and you can book again straight away.</p>'
    subject = `Action needed: your $${dollars.toFixed(2)} payment didn't go through`
    html = `<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; background: #f9f9f9; padding: 32px; border-radius: 12px;"><div style="text-align: center; margin-bottom: 24px;"><h1 style="color: #1a2744; font-size: 24px; margin: 0;">Manta Shark Aquatics</h1></div><div style="background: white; border-radius: 8px; padding: 24px; margin-bottom: 16px;"><h2 style="color: #1a2744; margin-top: 0;">Payment didn't go through</h2><p>Hi ${esc(parentName)},</p><p>${cause} We'd already added the points to your wallet, so we've had to take them back out.</p><table style="width: 100%; border-collapse: collapse;"><tr><td style="padding: 8px 16px 8px 0; color: #666; white-space: nowrap; width: 1%; vertical-align: top;">Amount</td><td style="padding: 8px 0; font-weight: 600;">$${dollars.toFixed(2)}</td></tr><tr><td style="padding: 8px 16px 8px 0; color: #666; white-space: nowrap; width: 1%; vertical-align: top;">Points removed</td><td style="padding: 8px 0; font-weight: 600;">${dollars.toLocaleString('en-US', { maximumFractionDigits: 0 })}</td></tr></table>${releasedLine}${owedLine}<div style="text-align: center; margin-top: 24px;"><a href="https://www.mantasharkaquatics.net/plans" style="display: inline-block; background: #c9a84c; color: #1a2744; font-weight: 700; padding: 14px 32px; border-radius: 8px; text-decoration: none;">Pay by card</a></div><p style="color: #666; font-size: 13px; margin-top: 16px;">Paying by card clears this immediately. If you think this is a mistake, reply to this email and we'll sort it out with you.</p></div></div>`

  } else if (type === 'booking_series_confirmed') {
    const dl = (payload.dates as string[] | undefined) || []
    const tl = (payload.times as string[] | undefined) || []
    const fmtD = (d: string) => new Date(d + 'T00:00:00Z').toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' })
    const dateRows = dl.map((d, i) => `<tr><td style="padding: 6px 0; color: #666;">Lesson ${i + 1}</td><td style="padding: 6px 0; font-weight: 600;">${fmtD(d)}${tl[i] ? ` &middot; ${esc(tl[i])}` : ''}</td></tr>`).join('')
    subject = `Booking Confirmed \u2013 ${dl.length} ${courseName} Lessons`
    html = `<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; background: #f9f9f9; padding: 32px; border-radius: 12px;"><div style="text-align: center; margin-bottom: 24px;"><h1 style="color: #1a2744; font-size: 24px; margin: 0;">Manta Shark Aquatics</h1></div><div style="background: white; border-radius: 8px; padding: 24px; margin-bottom: 16px;"><h2 style="color: #1a2744; margin-top: 0;">\u2705 Recurring Lessons Confirmed!</h2><p>Hi ${esc(parentName)},</p><p>Your recurring lessons have been booked successfully. Here are the details:</p><table style="width: 100%; border-collapse: collapse;"><tr><td style="padding: 8px 16px 8px 0; color: #666; white-space: nowrap; width: 1%; vertical-align: top;">Student</td><td style="padding: 8px 0; font-weight: 600;">${esc(studentName)}</td></tr>${partnerName ? `<tr><td style="padding: 8px 16px 8px 0; color: #666; white-space: nowrap; width: 1%; vertical-align: top;">Partner</td><td style="padding: 8px 0; font-weight: 600;">${esc(partnerName)}</td></tr>` : ''}<tr><td style="padding: 8px 16px 8px 0; color: #666; white-space: nowrap; width: 1%; vertical-align: top;">Course</td><td style="padding: 8px 0; font-weight: 600;">${esc(courseName)}</td></tr><tr><td style="padding: 8px 16px 8px 0; color: #666; white-space: nowrap; width: 1%; vertical-align: top;">Coach</td><td style="padding: 8px 0; font-weight: 600;">${esc(coachName)}</td></tr>${time ? `<tr><td style="padding: 8px 16px 8px 0; color: #666; white-space: nowrap; width: 1%; vertical-align: top;">Time</td><td style="padding: 8px 0; font-weight: 600;">${esc(time)}</td></tr>` : ''}</table><h3 style="color: #1a2744; margin: 20px 0 8px;">Lesson Dates (${dl.length})</h3><table style="width: 100%; border-collapse: collapse;">${dateRows}</table></div><p style="color: #666; font-size: 13px; text-align: center;">Questions? Reply to this email or chat with us at <a href="https://www.mantasharkaquatics.net">mantasharkaquatics.net</a></p></div>`

  }

  if (!subject || !html) {
    console.error('sendEmail: unknown type', type)
    return false
  }

  try {
    // Resend reports an API failure in its result, not by throwing. Checked
    // since 2026-10-06, so a false here really means "not sent".
    const { error } = await resend.emails.send({
      from: 'Manta Shark Aquatics <info@mantasharkaquatics.net>',
      to,
      subject,
      html,
    })
    if (error) throw error
    return true
  } catch (err) {
    console.error('Email error:', err)
    return false
  }
}
