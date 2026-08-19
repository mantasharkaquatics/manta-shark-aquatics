import { Resend } from 'resend'
import { TRIAL_PRICE_CENTS } from './plans'

const resend = new Resend(process.env.RESEND_API_KEY)

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
  | 'credits_converted_to_tokens'
  | 'booking_series_confirmed'
  | 'applicant_verification_code'
  | 'applicant_application_received'
  | 'applicant_password_reset'

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
  refundKind?: 'credit' | 'token' | 'token_conversion' | 'mixed' | 'none'
  requesterStudentName?: string
  partnerStudentName?: string
  paymentMethod?: string
  planName?: string
  tokenCount?: number
  creditCount?: number
  validityDays?: number
  // Loose on purpose: the point of this pass is catching MISSPELLED field
  // names, not pinning down every value shape. Tighten if these grow legs.
  courseNames?: any
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
}

export async function sendEmail(payload: EmailPayload): Promise<boolean> {
  const { type, to, parentName, studentName, partnerName, courseName, coachName, date, time, paymentUrl, inviterName, invoiceNumber, invoiceId, invoiceUrl, amount, refundKind, code, changeField, newValue, applicantName, applicantEmail, applicantPhone, applicantCity, roleLabel, hasResume, appUrl } = payload

  let subject = ''
  let html = ''

  const formattedDate = date ? new Date(/^\d{4}-\d{2}-\d{2}$/.test(date) ? date + 'T00:00:00Z' : date).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' }) : ''

  if (type === 'booking_confirmed') {
    subject = `Booking Confirmed – ${courseName} on ${formattedDate}`
    html = `<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; background: #f9f9f9; padding: 32px; border-radius: 12px;"><div style="text-align: center; margin-bottom: 24px;"><h1 style="color: #1a2744; font-size: 24px; margin: 0;">Manta Shark Aquatics</h1></div><div style="background: white; border-radius: 8px; padding: 24px; margin-bottom: 16px;"><h2 style="color: #1a2744; margin-top: 0;">✅ Booking Confirmed!</h2><p>Hi ${parentName},</p><p>Your lesson has been booked successfully. Here are the details:</p><table style="width: 100%; border-collapse: collapse;"><tr><td style="padding: 8px 0; color: #666;">Student</td><td style="padding: 8px 0; font-weight: 600;">${studentName}</td></tr>${partnerName ? `<tr><td style="padding: 8px 0; color: #666;">Partner</td><td style="padding: 8px 0; font-weight: 600;">${partnerName}</td></tr>` : ''}<tr><td style="padding: 8px 0; color: #666;">Course</td><td style="padding: 8px 0; font-weight: 600;">${courseName}</td></tr><tr><td style="padding: 8px 0; color: #666;">Coach</td><td style="padding: 8px 0; font-weight: 600;">${coachName}</td></tr><tr><td style="padding: 8px 0; color: #666;">Date</td><td style="padding: 8px 0; font-weight: 600;">${formattedDate}</td></tr><tr><td style="padding: 8px 0; color: #666;">Time</td><td style="padding: 8px 0; font-weight: 600;">${time}</td></tr></table></div><p style="color: #666; font-size: 13px; text-align: center;">Questions? Reply to this email or chat with us at <a href="https://www.mantasharkaquatics.net">mantasharkaquatics.net</a></p></div>`

  } else if (type === 'contact_change_code') {
    subject = `Your Manta Shark Aquatics verification code`
    html = `<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; background: #f9f9f9; padding: 32px; border-radius: 12px;"><div style="text-align: center; margin-bottom: 24px;"><h1 style="color: #1a2744; font-size: 24px; margin: 0;">Manta Shark Aquatics</h1></div><div style="background: white; border-radius: 8px; padding: 24px;"><h2 style="color: #1a2744; margin-top: 0;">Verification code</h2><p>Hi ${parentName},</p><p>You asked us to update the phone number on your account. Share this code with our staff to confirm:</p><div style="text-align:center; margin: 24px 0;"><span style="display:inline-block; font-size: 32px; letter-spacing: 8px; font-weight: 700; color:#1a2744; background:#f1f1f1; padding: 14px 24px; border-radius: 8px;">${code}</span></div><p style="color:#666; font-size: 13px;">The code expires in 10 minutes. If you did not request this change, do not share the code — reply to this email and let us know.</p></div></div>`

  } else if (type === 'applicant_verification_code') {
    subject = `Your Manta Shark Aquatics application code`
    html = `<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; background: #f9f9f9; padding: 32px; border-radius: 12px;"><div style="text-align: center; margin-bottom: 24px;"><h1 style="color: #1a2744; font-size: 24px; margin: 0;">Manta Shark Aquatics</h1></div><div style="background: white; border-radius: 8px; padding: 24px;"><h2 style="color: #1a2744; margin-top: 0;">Verify your email</h2><p>Hi ${applicantName},</p><p>Thanks for starting an application with us. Enter this code to verify your email address and continue:</p><div style="text-align:center; margin: 24px 0;"><span style="display:inline-block; font-size: 32px; letter-spacing: 8px; font-weight: 700; color:#1a2744; background:#f1f1f1; padding: 14px 24px; border-radius: 8px;">${code}</span></div><p style="color:#666; font-size: 13px;">The code expires in 10 minutes. If you did not start an application, you can ignore this email.</p></div></div>`

  } else if (type === 'applicant_password_reset') {
    subject = `Reset your Manta Shark Aquatics password`
    html = `<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; background: #f9f9f9; padding: 32px; border-radius: 12px;"><div style="text-align: center; margin-bottom: 24px;"><h1 style="color: #1a2744; font-size: 24px; margin: 0;">Manta Shark Aquatics</h1></div><div style="background: white; border-radius: 8px; padding: 24px;"><h2 style="color: #1a2744; margin-top: 0;">Reset your password</h2><p>Hi ${applicantName || 'there'},</p><p>Enter this code on the reset page to choose a new password:</p><div style="text-align:center; margin: 24px 0;"><span style="display:inline-block; font-size: 32px; letter-spacing: 8px; font-weight: 700; color:#1a2744; background:#f1f1f1; padding: 14px 24px; border-radius: 8px;">${code}</span></div><p style="color:#666; font-size: 13px;">The code expires in 10 minutes. If you did not ask to reset your password, you can ignore this email and your password will stay the same.</p></div></div>`

  } else if (type === 'applicant_application_received') {
    subject = `New application: ${applicantName} for ${roleLabel}`
    html = `<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; background: #f9f9f9; padding: 32px; border-radius: 12px;"><div style="background: white; border-radius: 8px; padding: 24px;"><h2 style="color: #1a2744; margin-top: 0;">New application</h2><table style="width: 100%; border-collapse: collapse;"><tr><td style="padding: 8px 0; color: #666;">Name</td><td style="padding: 8px 0; font-weight: 600;">${applicantName}</td></tr><tr><td style="padding: 8px 0; color: #666;">Position</td><td style="padding: 8px 0; font-weight: 600;">${roleLabel}</td></tr><tr><td style="padding: 8px 0; color: #666;">Email</td><td style="padding: 8px 0; font-weight: 600;">${applicantEmail}</td></tr><tr><td style="padding: 8px 0; color: #666;">Phone</td><td style="padding: 8px 0; font-weight: 600;">${applicantPhone}</td></tr><tr><td style="padding: 8px 0; color: #666;">City</td><td style="padding: 8px 0; font-weight: 600;">${applicantCity || 'Not given'}</td></tr><tr><td style="padding: 8px 0; color: #666;">Resume</td><td style="padding: 8px 0; font-weight: 600;">${hasResume ? 'Attached' : 'None'}</td></tr></table><div style="text-align: center; margin-top: 24px;"><a href="${appUrl}/admin/applications" style="display: inline-block; background: #c9a84c; color: #1a2744; font-weight: 700; padding: 14px 32px; border-radius: 8px; text-decoration: none;">Review application</a></div></div></div>`

  } else if (type === 'contact_change_notice') {
    const what = changeField === 'email' ? 'email address' : 'phone number'
    subject = `Your Manta Shark Aquatics ${what} was changed`
    html = `<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; background: #f9f9f9; padding: 32px; border-radius: 12px;"><div style="text-align: center; margin-bottom: 24px;"><h1 style="color: #1a2744; font-size: 24px; margin: 0;">Manta Shark Aquatics</h1></div><div style="background: white; border-radius: 8px; padding: 24px;"><h2 style="color: #1a2744; margin-top: 0;">Account ${what} updated</h2><p>Hi ${parentName},</p><p>The ${what} on your account is now <strong>${newValue}</strong>.</p><p style="color:#666; font-size: 13px;">If you did not request this change, contact us immediately by replying to this email or calling the front desk.</p></div></div>`

  } else if (type === 'trial_payment_link') {
    const trialPrice = `$${Number(amount ?? TRIAL_PRICE_CENTS / 100)}`
    subject = `Complete Your Swim Assessment Booking – ${trialPrice}`
    html = `<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; background: #f9f9f9; padding: 32px; border-radius: 12px;"><div style="text-align: center; margin-bottom: 24px;"><h1 style="color: #1a2744; font-size: 24px; margin: 0;">Manta Shark Aquatics</h1></div><div style="background: white; border-radius: 8px; padding: 24px; margin-bottom: 16px;"><h2 style="color: #1a2744; margin-top: 0;">🏊 Swim Assessment Reserved</h2><p>Hi ${parentName},</p><p>We've reserved a Swim Assessment time for ${studentName}. Please complete payment to confirm your spot:</p><table style="width: 100%; border-collapse: collapse;"><tr><td style="padding: 8px 0; color: #666;">Student</td><td style="padding: 8px 0; font-weight: 600;">${studentName}</td></tr><tr><td style="padding: 8px 0; color: #666;">Course</td><td style="padding: 8px 0; font-weight: 600;">${courseName}</td></tr><tr><td style="padding: 8px 0; color: #666;">Coach</td><td style="padding: 8px 0; font-weight: 600;">${coachName}</td></tr><tr><td style="padding: 8px 0; color: #666;">Date</td><td style="padding: 8px 0; font-weight: 600;">${formattedDate}</td></tr><tr><td style="padding: 8px 0; color: #666;">Time</td><td style="padding: 8px 0; font-weight: 600;">${time}</td></tr><tr><td style="padding: 8px 0; color: #666;">Price</td><td style="padding: 8px 0; font-weight: 600;">${trialPrice}</td></tr></table><div style="text-align: center; margin-top: 24px;"><a href="${paymentUrl}" style="display: inline-block; background: #c9a84c; color: #1a2744; font-weight: 700; padding: 14px 32px; border-radius: 8px; text-decoration: none;">Complete Payment</a></div></div><p style="color: #666; font-size: 13px; text-align: center;">Questions? Reply to this email or chat with us at <a href="https://www.mantasharkaquatics.net">mantasharkaquatics.net</a></p></div>`

  } else if (type === 'booking_rescheduled') {
    subject = `Lesson Rescheduled – ${courseName} on ${formattedDate}`
    html = `<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; background: #f9f9f9; padding: 32px; border-radius: 12px;"><div style="text-align: center; margin-bottom: 24px;"><h1 style="color: #1a2744; font-size: 24px; margin: 0;">Manta Shark Aquatics</h1></div><div style="background: white; border-radius: 8px; padding: 24px; margin-bottom: 16px;"><h2 style="color: #1a2744; margin-top: 0;">📅 Lesson Rescheduled</h2><p>Hi ${parentName},</p><p>Your lesson has been rescheduled. Here are your new details:</p><table style="width: 100%; border-collapse: collapse;"><tr><td style="padding: 8px 0; color: #666;">Student</td><td style="padding: 8px 0; font-weight: 600;">${studentName}</td></tr><tr><td style="padding: 8px 0; color: #666;">Course</td><td style="padding: 8px 0; font-weight: 600;">${courseName}</td></tr><tr><td style="padding: 8px 0; color: #666;">Coach</td><td style="padding: 8px 0; font-weight: 600;">${coachName}</td></tr><tr><td style="padding: 8px 0; color: #666;">New Date</td><td style="padding: 8px 0; font-weight: 600;">${formattedDate}</td></tr><tr><td style="padding: 8px 0; color: #666;">New Time</td><td style="padding: 8px 0; font-weight: 600;">${time}</td></tr></table></div><p style="color: #666; font-size: 13px; text-align: center;">Questions? Reply to this email or chat with us at <a href="https://www.mantasharkaquatics.net">mantasharkaquatics.net</a></p></div>`

  } else if (type === 'booking_cancelled') {
    subject = `Lesson Cancelled – ${courseName} on ${formattedDate}`
    const rk = refundKind || 'credit'
    const cancelLine = rk === 'token' ? 'Your lesson has been cancelled. A replacement token has been issued to your account, valid for 60 days.' : rk === 'token_conversion' ? 'Because this cancellation was made within 24 hours of the lesson, your credit has been converted to a make-up token instead of being refunded. The token is valid for 60 days.' : rk === 'mixed' ? 'Your lessons have been cancelled. Your credits and replacement tokens have been returned to your account.' : rk === 'none' ? 'Your lesson has been cancelled.' : 'Your lesson has been cancelled and your credit has been returned to your account.'
    const readyLine = rk === 'token' ? 'Your replacement token is ready to use and is valid for 60 days.' : rk === 'token_conversion' ? 'Your make-up token is ready to use. Lessons booked with tokens are final.' : rk === 'mixed' ? 'Your refunds are ready to use.' : rk === 'none' ? "You're welcome to rebook any available time on your dashboard." : 'Your lesson credit has been restored and is ready to use.'
    html = `<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; background: #f9f9f9; padding: 32px; border-radius: 12px;"><div style="text-align: center; margin-bottom: 24px;"><h1 style="color: #1a2744; font-size: 24px; margin: 0;">Manta Shark Aquatics</h1></div><div style="background: white; border-radius: 8px; padding: 24px; margin-bottom: 16px;"><h2 style="color: #1a2744; margin-top: 0;">❌ Lesson Cancelled</h2><p>Hi ${parentName},</p><p>${cancelLine}</p><table style="width: 100%; border-collapse: collapse;"><tr><td style="padding: 8px 0; color: #666;">Student</td><td style="padding: 8px 0; font-weight: 600;">${studentName}</td></tr><tr><td style="padding: 8px 0; color: #666;">Course</td><td style="padding: 8px 0; font-weight: 600;">${courseName}</td></tr><tr><td style="padding: 8px 0; color: #666;">Date</td><td style="padding: 8px 0; font-weight: 600;">${formattedDate}</td></tr><tr><td style="padding: 8px 0; color: #666;">Time</td><td style="padding: 8px 0; font-weight: 600;">${time}</td></tr></table><p style="color: #c9a84c; font-weight: 600;">${readyLine}</p></div><p style="color: #666; font-size: 13px; text-align: center;">Questions? Reply to this email or chat with us at <a href="https://www.mantasharkaquatics.net">mantasharkaquatics.net</a></p></div>`

  } else if (type === 'block_cancellation_notice') {
    subject = `Lesson Cancelled \u2013 ${courseName} on ${formattedDate}`
    const refundLine = refundKind === 'token' ? ' A replacement token (valid for 60 days) will be automatically issued to your account.' : refundKind === 'none' ? '' : ' Your lesson credit will be automatically returned to your account.'
    html = `<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; background: #f9f9f9; padding: 32px; border-radius: 12px;"><div style="text-align: center; margin-bottom: 24px;"><h1 style="color: #1a2744; font-size: 24px; margin: 0;">Manta Shark Aquatics</h1></div><div style="background: white; border-radius: 8px; padding: 24px; margin-bottom: 16px;"><h2 style="color: #1a2744; margin-top: 0;">Lesson Cancellation Notice</h2><p>Hi ${parentName},</p><p>We're sorry \u2014 Coach ${coachName} is unavailable at the time below, so the following lesson has been cancelled.${refundLine}</p><table style="width: 100%; border-collapse: collapse;"><tr><td style="padding: 8px 0; color: #666;">Student</td><td style="padding: 8px 0; font-weight: 600;">${studentName}</td></tr><tr><td style="padding: 8px 0; color: #666;">Course</td><td style="padding: 8px 0; font-weight: 600;">${courseName}</td></tr><tr><td style="padding: 8px 0; color: #666;">Coach</td><td style="padding: 8px 0; font-weight: 600;">${coachName}</td></tr><tr><td style="padding: 8px 0; color: #666;">Date</td><td style="padding: 8px 0; font-weight: 600;">${formattedDate}</td></tr><tr><td style="padding: 8px 0; color: #666;">Time</td><td style="padding: 8px 0; font-weight: 600;">${time}</td></tr></table><p style="margin-top: 16px;">You're welcome to rebook any available time on your dashboard. We apologize for the inconvenience.</p></div><p style="color: #666; font-size: 13px; text-align: center;">Questions? Reply to this email or chat with us at <a href="https://www.mantasharkaquatics.net">mantasharkaquatics.net</a></p></div>`
  } else if (type === 'reminder_24h') {
    subject = `Reminder: ${courseName} Tomorrow at ${time}`
    html = `<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; background: #f9f9f9; padding: 32px; border-radius: 12px;"><div style="text-align: center; margin-bottom: 24px;"><h1 style="color: #1a2744; font-size: 24px; margin: 0;">Manta Shark Aquatics</h1></div><div style="background: white; border-radius: 8px; padding: 24px; margin-bottom: 16px;"><h2 style="color: #1a2744; margin-top: 0;">🏊 Lesson Tomorrow!</h2><p>Hi ${parentName},</p><p>Just a reminder that ${studentName} has a lesson tomorrow!</p><table style="width: 100%; border-collapse: collapse;"><tr><td style="padding: 8px 0; color: #666;">Student</td><td style="padding: 8px 0; font-weight: 600;">${studentName}</td></tr><tr><td style="padding: 8px 0; color: #666;">Course</td><td style="padding: 8px 0; font-weight: 600;">${courseName}</td></tr><tr><td style="padding: 8px 0; color: #666;">Coach</td><td style="padding: 8px 0; font-weight: 600;">${coachName}</td></tr><tr><td style="padding: 8px 0; color: #666;">Date</td><td style="padding: 8px 0; font-weight: 600;">${formattedDate}</td></tr><tr><td style="padding: 8px 0; color: #666;">Time</td><td style="padding: 8px 0; font-weight: 600;">${time}</td></tr></table><p>Please arrive 5 minutes early. See you in the pool! 🦈</p></div><p style="color: #666; font-size: 13px; text-align: center;">Questions? Reply to this email or chat with us at <a href="https://www.mantasharkaquatics.net">mantasharkaquatics.net</a></p></div>`

  } else if (type === 'partner_booking_invite') {
    // A 30-minute invitation costs the partner one credit; a 60-minute one is
    // two halves and costs two. Defaults to 1 so older callers are unaffected.
    const inviteCredits = Number(payload.creditCount ?? 1)
    subject = `Invitation: ${inviterName} invited ${studentName} to a 1-on-2 lesson`
    html = `<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; background: #f9f9f9; padding: 32px; border-radius: 12px;"><div style="text-align: center; margin-bottom: 24px;"><h1 style="color: #1a2744; font-size: 24px; margin: 0;">Manta Shark Aquatics</h1></div><div style="background: white; border-radius: 8px; padding: 24px; margin-bottom: 16px;"><h2 style="color: #1a2744; margin-top: 0;">🔔 Partner Lesson Invitation</h2><p>Hi ${parentName},</p><p><strong>${inviterName}</strong> has invited <strong>${studentName}</strong> to join the lesson below. Please log in to your Dashboard within 15 minutes to confirm:</p><table style="width: 100%; border-collapse: collapse;"><tr><td style="padding: 8px 0; color: #666;">Student</td><td style="padding: 8px 0; font-weight: 600;">${studentName}</td></tr><tr><td style="padding: 8px 0; color: #666;">Course</td><td style="padding: 8px 0; font-weight: 600;">${courseName}</td></tr><tr><td style="padding: 8px 0; color: #666;">Coach</td><td style="padding: 8px 0; font-weight: 600;">${coachName}</td></tr><tr><td style="padding: 8px 0; color: #666;">Date</td><td style="padding: 8px 0; font-weight: 600;">${formattedDate}</td></tr><tr><td style="padding: 8px 0; color: #666;">Time</td><td style="padding: 8px 0; font-weight: 600;">${time}</td></tr></table><div style="text-align: center; margin-top: 24px;"><a href="https://www.mantasharkaquatics.net/dashboard" style="display: inline-block; background: #7b61c4; color: white; font-weight: 700; padding: 14px 32px; border-radius: 8px; text-decoration: none;">Review Invitation</a></div><p style="color: #999; font-size: 12px; margin-top: 16px;">Confirming will use ${inviteCredits} lesson credit${inviteCredits === 1 ? '' : 's'} from your account. The invitation expires automatically if not confirmed in time.</p></div></div>`

  } else if (type === 'partner_booking_confirmed') {
    subject = `✅ ${studentName} Confirmed – ${courseName} on ${formattedDate}`
    html = `<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; background: #f9f9f9; padding: 32px; border-radius: 12px;"><div style="text-align: center; margin-bottom: 24px;"><h1 style="color: #1a2744; font-size: 24px; margin: 0;">Manta Shark Aquatics</h1></div><div style="background: white; border-radius: 8px; padding: 24px; margin-bottom: 16px;"><h2 style="color: #1a2744; margin-top: 0;">✅ Booking Confirmed</h2><p>Hi ${parentName},</p><p><strong>${studentName}</strong> has confirmed. Your 1-on-2 lesson is officially booked!</p><table style="width: 100%; border-collapse: collapse;"><tr><td style="padding: 8px 0; color: #666;">Course</td><td style="padding: 8px 0; font-weight: 600;">${courseName}</td></tr><tr><td style="padding: 8px 0; color: #666;">Coach</td><td style="padding: 8px 0; font-weight: 600;">${coachName}</td></tr><tr><td style="padding: 8px 0; color: #666;">Date</td><td style="padding: 8px 0; font-weight: 600;">${formattedDate}</td></tr><tr><td style="padding: 8px 0; color: #666;">Time</td><td style="padding: 8px 0; font-weight: 600;">${time}</td></tr></table></div></div>`

  } else if (type === 'partner_booking_rejected') {
    subject = `❌ ${studentName} Declined – ${courseName} on ${formattedDate}`
    html = `<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; background: #f9f9f9; padding: 32px; border-radius: 12px;"><div style="text-align: center; margin-bottom: 24px;"><h1 style="color: #1a2744; font-size: 24px; margin: 0;">Manta Shark Aquatics</h1></div><div style="background: white; border-radius: 8px; padding: 24px; margin-bottom: 16px;"><h2 style="color: #1a2744; margin-top: 0;">❌ Invitation Declined</h2><p>Hi ${parentName},</p><p><strong>${studentName}</strong> has declined your 1-on-2 invitation. The second student spot for this session has been released.</p><table style="width: 100%; border-collapse: collapse;"><tr><td style="padding: 8px 0; color: #666;">Course</td><td style="padding: 8px 0; font-weight: 600;">${courseName}</td></tr><tr><td style="padding: 8px 0; color: #666;">Date</td><td style="padding: 8px 0; font-weight: 600;">${formattedDate}</td></tr><tr><td style="padding: 8px 0; color: #666;">Time</td><td style="padding: 8px 0; font-weight: 600;">${time}</td></tr></table><p style="color: #666;">Your own booking (first student) is still active.</p></div></div>`

  } else if (type === 'partner_invite_expired') {
    subject = `Invitation Expired \u2013 ${courseName} on ${formattedDate}`
    html = `<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; background: #f9f9f9; padding: 32px; border-radius: 12px;"><div style="text-align: center; margin-bottom: 24px;"><h1 style="color: #1a2744; font-size: 24px; margin: 0;">Manta Shark Aquatics</h1></div><div style="background: white; border-radius: 8px; padding: 24px; margin-bottom: 16px;"><h2 style="color: #1a2744; margin-top: 0;">\u23f3 Invitation Expired</h2><p>Hi ${parentName},</p><p>The partner lesson invitation below was not confirmed in time, so the reserved time has been released. <strong>No lesson credits were used.</strong></p><table style="width: 100%; border-collapse: collapse;"><tr><td style="padding: 8px 0; color: #666;">Student</td><td style="padding: 8px 0; font-weight: 600;">${studentName}</td></tr><tr><td style="padding: 8px 0; color: #666;">Course</td><td style="padding: 8px 0; font-weight: 600;">${courseName}</td></tr><tr><td style="padding: 8px 0; color: #666;">Coach</td><td style="padding: 8px 0; font-weight: 600;">${coachName}</td></tr><tr><td style="padding: 8px 0; color: #666;">Date</td><td style="padding: 8px 0; font-weight: 600;">${formattedDate}</td></tr><tr><td style="padding: 8px 0; color: #666;">Time</td><td style="padding: 8px 0; font-weight: 600;">${time}</td></tr></table><p style="margin-top: 16px;">You're welcome to book again at any available time on your dashboard.</p><div style="text-align: center; margin-top: 24px;"><a href="https://www.mantasharkaquatics.net/dashboard" style="display: inline-block; background: #1a2744; color: white; font-weight: 700; padding: 14px 32px; border-radius: 8px; text-decoration: none;">Go to My Dashboard</a></div></div><p style="color: #666; font-size: 13px; text-align: center;">Questions? Reply to this email or chat with us at <a href="https://www.mantasharkaquatics.net">mantasharkaquatics.net</a></p></div>`

  } else if (type === 'partner_reschedule_requested') {
    subject = `Reschedule Request – ${courseName}`
    html = `<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; background: #f9f9f9; padding: 32px; border-radius: 12px;"><div style="text-align: center; margin-bottom: 24px;"><h1 style="color: #1a2744; font-size: 24px; margin: 0;">Manta Shark Aquatics</h1></div><div style="background: white; border-radius: 8px; padding: 24px; margin-bottom: 16px;"><h2 style="color: #1a2744; margin-top: 0;">📅 Reschedule Request</h2><p>Hi ${parentName},</p><p>Your 1-on-2 lesson partner has requested to reschedule. Please log in to your Dashboard to confirm or decline.</p><div style="text-align: center; margin-top: 24px;"><a href="https://www.mantasharkaquatics.net/dashboard" style="display: inline-block; background: #1a2744; color: white; font-weight: 700; padding: 14px 32px; border-radius: 8px; text-decoration: none;">Review Invitation</a></div></div></div>`

  } else if (type === 'invoice') {
    subject = `🧾 Invoice ${invoiceNumber} - Manta Shark Aquatics`
    html = `<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; background: #f9f9f9; padding: 32px; border-radius: 12px;"><div style="text-align: center; margin-bottom: 24px;"><h1 style="color: #1a2744; font-size: 24px; margin: 0;">Manta Shark Aquatics</h1></div><div style="background: white; border-radius: 8px; padding: 24px; margin-bottom: 16px;"><h2 style="color: #1a2744; margin-top: 0;">🧾 Invoice ${invoiceNumber}</h2><p>Hi ${parentName},</p><p>Thank you for your payment! Your invoice is ready. Log in to your dashboard to view and download it anytime.</p><table style="width: 100%; border-collapse: collapse;"><tr><td style="padding: 8px 0; color: #666;">Invoice Number</td><td style="padding: 8px 0; font-weight: 600;">${invoiceNumber}</td></tr><tr><td style="padding: 8px 0; color: #666;">Amount Paid</td><td style="padding: 8px 0; font-weight: 600; color: #c9a84c;">$${Number(amount).toFixed(2)}</td></tr></table><div style="margin-top: 20px; text-align: center;"><a href="https://www.mantasharkaquatics.net/dashboard" style="background: #1a2744; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; display: inline-block;">Go to My Dashboard</a></div></div><p style="color: #666; font-size: 13px; text-align: center;">Questions? Reply to this email or chat with us at <a href="https://www.mantasharkaquatics.net">mantasharkaquatics.net</a></p></div>`
  } else if (type === 'credits_converted_to_tokens') {
    const tokenCount = Number(payload.tokenCount ?? 0)
    const courseNames = String(payload.courseNames ?? '')
    const validityDays = Number(payload.validityDays ?? 60)
    subject = `Your Expired Credits Are Now Tokens \u2013 ${tokenCount} Token${tokenCount === 1 ? '' : 's'} Added`
    html = `<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; background: #f9f9f9; padding: 32px; border-radius: 12px;"><div style="text-align: center; margin-bottom: 24px;"><h1 style="color: #1a2744; font-size: 24px; margin: 0;">Manta Shark Aquatics</h1></div><div style="background: white; border-radius: 8px; padding: 24px; margin-bottom: 16px;"><h2 style="color: #1a2744; margin-top: 0;">\ud83c\udfab Credits Converted to Tokens</h2><p>Hi ${parentName},</p><p>Some of your lesson credits expired, so we've automatically converted them into <strong>${tokenCount} token${tokenCount === 1 ? '' : 's'}</strong> \u2014 nothing is lost.</p><table style="width: 100%; border-collapse: collapse;"><tr><td style="padding: 8px 0; color: #666;">Tokens added</td><td style="padding: 8px 0; font-weight: 600;">${tokenCount}</td></tr><tr><td style="padding: 8px 0; color: #666;">Course type</td><td style="padding: 8px 0; font-weight: 600;">${courseNames}</td></tr><tr><td style="padding: 8px 0; color: #666;">Valid for</td><td style="padding: 8px 0; font-weight: 600; color: #c9a84c;">${validityDays} days</td></tr></table><div style="background: #fdf6e3; border-radius: 8px; padding: 16px; margin-top: 16px;"><p style="margin: 0 0 8px 0; font-weight: 600; color: #1a2744;">How tokens work</p><ul style="margin: 0; padding-left: 20px; color: #444;"><li>Tokens can book <strong>same-day or next-day</strong> lessons only (at least 30 minutes before start time).</li><li>Token bookings are <strong>final</strong> \u2014 they cannot be cancelled or rescheduled.</li><li>Tokens are used automatically before credits when eligible.</li></ul></div><div style="text-align: center; margin-top: 24px;"><a href="https://www.mantasharkaquatics.net/dashboard" style="display: inline-block; background: #1a2744; color: white; font-weight: 700; padding: 14px 32px; border-radius: 8px; text-decoration: none;">Go to My Dashboard</a></div></div><p style="color: #666; font-size: 13px; text-align: center;">Questions? Reply to this email or chat with us at <a href="https://www.mantasharkaquatics.net">mantasharkaquatics.net</a></p></div>`

  } else if (type === 'booking_series_confirmed') {
    const dl = (payload.dates as string[] | undefined) || []
    const fmtD = (d: string) => new Date(d + 'T00:00:00Z').toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' })
    const dateRows = dl.map((d, i) => `<tr><td style="padding: 6px 0; color: #666;">Lesson ${i + 1}</td><td style="padding: 6px 0; font-weight: 600;">${fmtD(d)}</td></tr>`).join('')
    subject = `Booking Confirmed \u2013 ${dl.length} ${courseName} Lessons`
    html = `<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; background: #f9f9f9; padding: 32px; border-radius: 12px;"><div style="text-align: center; margin-bottom: 24px;"><h1 style="color: #1a2744; font-size: 24px; margin: 0;">Manta Shark Aquatics</h1></div><div style="background: white; border-radius: 8px; padding: 24px; margin-bottom: 16px;"><h2 style="color: #1a2744; margin-top: 0;">\u2705 Recurring Lessons Confirmed!</h2><p>Hi ${parentName},</p><p>Your recurring lessons have been booked successfully. Here are the details:</p><table style="width: 100%; border-collapse: collapse;"><tr><td style="padding: 8px 0; color: #666;">Student</td><td style="padding: 8px 0; font-weight: 600;">${studentName}</td></tr>${partnerName ? `<tr><td style="padding: 8px 0; color: #666;">Partner</td><td style="padding: 8px 0; font-weight: 600;">${partnerName}</td></tr>` : ''}<tr><td style="padding: 8px 0; color: #666;">Course</td><td style="padding: 8px 0; font-weight: 600;">${courseName}</td></tr><tr><td style="padding: 8px 0; color: #666;">Coach</td><td style="padding: 8px 0; font-weight: 600;">${coachName}</td></tr><tr><td style="padding: 8px 0; color: #666;">Time</td><td style="padding: 8px 0; font-weight: 600;">${time}</td></tr></table><h3 style="color: #1a2744; margin: 20px 0 8px;">Lesson Dates (${dl.length})</h3><table style="width: 100%; border-collapse: collapse;">${dateRows}</table></div><p style="color: #666; font-size: 13px; text-align: center;">Questions? Reply to this email or chat with us at <a href="https://www.mantasharkaquatics.net">mantasharkaquatics.net</a></p></div>`

  }

  if (!subject || !html) {
    console.error('sendEmail: unknown type', type)
    return false
  }

  try {
    await resend.emails.send({
      from: 'Manta Shark Aquatics <info@mantasharkaquatics.net>',
      to,
      subject,
      html,
    })
    return true
  } catch (err) {
    console.error('Email error:', err)
    return false
  }
}
