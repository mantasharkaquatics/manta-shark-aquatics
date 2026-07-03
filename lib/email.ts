import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

export interface EmailPayload {
  type: string
  to: string
  parentName?: string
  studentName?: string
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
  [key: string]: unknown
}

export async function sendEmail(payload: EmailPayload): Promise<boolean> {
  const { type, to, parentName, studentName, courseName, coachName, date, time, paymentUrl, inviterName, invoiceNumber, invoiceId, invoiceUrl, amount } = payload

  let subject = ''
  let html = ''

  const formattedDate = date ? new Date(date).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) : ''

  if (type === 'booking_confirmed') {
    subject = `Booking Confirmed – ${courseName} on ${formattedDate}`
    html = `<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; background: #f9f9f9; padding: 32px; border-radius: 12px;"><div style="text-align: center; margin-bottom: 24px;"><h1 style="color: #1a2744; font-size: 24px; margin: 0;">Manta Shark Aquatics</h1></div><div style="background: white; border-radius: 8px; padding: 24px; margin-bottom: 16px;"><h2 style="color: #1a2744; margin-top: 0;">✅ Booking Confirmed!</h2><p>Hi ${parentName},</p><p>Your lesson has been booked successfully. Here are the details:</p><table style="width: 100%; border-collapse: collapse;"><tr><td style="padding: 8px 0; color: #666;">Student</td><td style="padding: 8px 0; font-weight: 600;">${studentName}</td></tr><tr><td style="padding: 8px 0; color: #666;">Course</td><td style="padding: 8px 0; font-weight: 600;">${courseName}</td></tr><tr><td style="padding: 8px 0; color: #666;">Coach</td><td style="padding: 8px 0; font-weight: 600;">${coachName}</td></tr><tr><td style="padding: 8px 0; color: #666;">Date</td><td style="padding: 8px 0; font-weight: 600;">${formattedDate}</td></tr><tr><td style="padding: 8px 0; color: #666;">Time</td><td style="padding: 8px 0; font-weight: 600;">${time}</td></tr></table></div><p style="color: #666; font-size: 13px; text-align: center;">Questions? Reply to this email or chat with us at <a href="https://www.mantasharkaquatics.net">mantasharkaquatics.net</a></p></div>`

  } else if (type === 'trial_payment_link') {
    subject = `Complete Your Trial Lesson Booking – $85`
    html = `<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; background: #f9f9f9; padding: 32px; border-radius: 12px;"><div style="text-align: center; margin-bottom: 24px;"><h1 style="color: #1a2744; font-size: 24px; margin: 0;">Manta Shark Aquatics</h1></div><div style="background: white; border-radius: 8px; padding: 24px; margin-bottom: 16px;"><h2 style="color: #1a2744; margin-top: 0;">🏊 Trial Lesson Reserved</h2><p>Hi ${parentName},</p><p>We've reserved a trial lesson time for ${studentName}. Please complete payment to confirm your spot:</p><table style="width: 100%; border-collapse: collapse;"><tr><td style="padding: 8px 0; color: #666;">Student</td><td style="padding: 8px 0; font-weight: 600;">${studentName}</td></tr><tr><td style="padding: 8px 0; color: #666;">Course</td><td style="padding: 8px 0; font-weight: 600;">${courseName}</td></tr><tr><td style="padding: 8px 0; color: #666;">Coach</td><td style="padding: 8px 0; font-weight: 600;">${coachName}</td></tr><tr><td style="padding: 8px 0; color: #666;">Date</td><td style="padding: 8px 0; font-weight: 600;">${formattedDate}</td></tr><tr><td style="padding: 8px 0; color: #666;">Time</td><td style="padding: 8px 0; font-weight: 600;">${time}</td></tr><tr><td style="padding: 8px 0; color: #666;">Price</td><td style="padding: 8px 0; font-weight: 600;">$85</td></tr></table><div style="text-align: center; margin-top: 24px;"><a href="${paymentUrl}" style="display: inline-block; background: #c9a84c; color: #1a2744; font-weight: 700; padding: 14px 32px; border-radius: 8px; text-decoration: none;">Complete Payment</a></div></div><p style="color: #666; font-size: 13px; text-align: center;">Questions? Reply to this email or chat with us at <a href="https://www.mantasharkaquatics.net">mantasharkaquatics.net</a></p></div>`

  } else if (type === 'booking_rescheduled') {
    subject = `Lesson Rescheduled – ${courseName} on ${formattedDate}`
    html = `<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; background: #f9f9f9; padding: 32px; border-radius: 12px;"><div style="text-align: center; margin-bottom: 24px;"><h1 style="color: #1a2744; font-size: 24px; margin: 0;">Manta Shark Aquatics</h1></div><div style="background: white; border-radius: 8px; padding: 24px; margin-bottom: 16px;"><h2 style="color: #1a2744; margin-top: 0;">📅 Lesson Rescheduled</h2><p>Hi ${parentName},</p><p>Your lesson has been rescheduled. Here are your new details:</p><table style="width: 100%; border-collapse: collapse;"><tr><td style="padding: 8px 0; color: #666;">Student</td><td style="padding: 8px 0; font-weight: 600;">${studentName}</td></tr><tr><td style="padding: 8px 0; color: #666;">Course</td><td style="padding: 8px 0; font-weight: 600;">${courseName}</td></tr><tr><td style="padding: 8px 0; color: #666;">Coach</td><td style="padding: 8px 0; font-weight: 600;">${coachName}</td></tr><tr><td style="padding: 8px 0; color: #666;">New Date</td><td style="padding: 8px 0; font-weight: 600;">${formattedDate}</td></tr><tr><td style="padding: 8px 0; color: #666;">New Time</td><td style="padding: 8px 0; font-weight: 600;">${time}</td></tr></table></div><p style="color: #666; font-size: 13px; text-align: center;">Questions? Reply to this email or chat with us at <a href="https://www.mantasharkaquatics.net">mantasharkaquatics.net</a></p></div>`

  } else if (type === 'booking_cancelled') {
    subject = `Lesson Cancelled – ${courseName} on ${formattedDate}`
    html = `<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; background: #f9f9f9; padding: 32px; border-radius: 12px;"><div style="text-align: center; margin-bottom: 24px;"><h1 style="color: #1a2744; font-size: 24px; margin: 0;">Manta Shark Aquatics</h1></div><div style="background: white; border-radius: 8px; padding: 24px; margin-bottom: 16px;"><h2 style="color: #1a2744; margin-top: 0;">❌ Lesson Cancelled</h2><p>Hi ${parentName},</p><p>Your lesson has been cancelled and your credit has been returned to your account.</p><table style="width: 100%; border-collapse: collapse;"><tr><td style="padding: 8px 0; color: #666;">Student</td><td style="padding: 8px 0; font-weight: 600;">${studentName}</td></tr><tr><td style="padding: 8px 0; color: #666;">Course</td><td style="padding: 8px 0; font-weight: 600;">${courseName}</td></tr><tr><td style="padding: 8px 0; color: #666;">Date</td><td style="padding: 8px 0; font-weight: 600;">${formattedDate}</td></tr><tr><td style="padding: 8px 0; color: #666;">Time</td><td style="padding: 8px 0; font-weight: 600;">${time}</td></tr></table><p style="color: #c9a84c; font-weight: 600;">Your lesson credit has been restored and is ready to use.</p></div><p style="color: #666; font-size: 13px; text-align: center;">Questions? Reply to this email or chat with us at <a href="https://www.mantasharkaquatics.net">mantasharkaquatics.net</a></p></div>`

  } else if (type === 'reminder_24h') {
    subject = `Reminder: ${courseName} Tomorrow at ${time}`
    html = `<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; background: #f9f9f9; padding: 32px; border-radius: 12px;"><div style="text-align: center; margin-bottom: 24px;"><h1 style="color: #1a2744; font-size: 24px; margin: 0;">Manta Shark Aquatics</h1></div><div style="background: white; border-radius: 8px; padding: 24px; margin-bottom: 16px;"><h2 style="color: #1a2744; margin-top: 0;">🏊 Lesson Tomorrow!</h2><p>Hi ${parentName},</p><p>Just a reminder that ${studentName} has a lesson tomorrow!</p><table style="width: 100%; border-collapse: collapse;"><tr><td style="padding: 8px 0; color: #666;">Student</td><td style="padding: 8px 0; font-weight: 600;">${studentName}</td></tr><tr><td style="padding: 8px 0; color: #666;">Course</td><td style="padding: 8px 0; font-weight: 600;">${courseName}</td></tr><tr><td style="padding: 8px 0; color: #666;">Coach</td><td style="padding: 8px 0; font-weight: 600;">${coachName}</td></tr><tr><td style="padding: 8px 0; color: #666;">Date</td><td style="padding: 8px 0; font-weight: 600;">${formattedDate}</td></tr><tr><td style="padding: 8px 0; color: #666;">Time</td><td style="padding: 8px 0; font-weight: 600;">${time}</td></tr></table><p>Please arrive 5 minutes early. See you in the pool! 🦈</p></div><p style="color: #666; font-size: 13px; text-align: center;">Questions? Reply to this email or chat with us at <a href="https://www.mantasharkaquatics.net">mantasharkaquatics.net</a></p></div>`

  } else if (type === 'partner_booking_invite') {
    subject = `Invitation: ${inviterName} invited ${studentName} to a 1-on-2 lesson`
    html = `<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; background: #f9f9f9; padding: 32px; border-radius: 12px;"><div style="text-align: center; margin-bottom: 24px;"><h1 style="color: #1a2744; font-size: 24px; margin: 0;">Manta Shark Aquatics</h1></div><div style="background: white; border-radius: 8px; padding: 24px; margin-bottom: 16px;"><h2 style="color: #1a2744; margin-top: 0;">🔔 Partner Lesson Invitation</h2><p>Hi ${parentName},</p><p><strong>${inviterName}</strong> has invited <strong>${studentName}</strong> to join the lesson below. Please log in to your Dashboard within 15 minutes to confirm:</p><table style="width: 100%; border-collapse: collapse;"><tr><td style="padding: 8px 0; color: #666;">Student</td><td style="padding: 8px 0; font-weight: 600;">${studentName}</td></tr><tr><td style="padding: 8px 0; color: #666;">Course</td><td style="padding: 8px 0; font-weight: 600;">${courseName}</td></tr><tr><td style="padding: 8px 0; color: #666;">Coach</td><td style="padding: 8px 0; font-weight: 600;">${coachName}</td></tr><tr><td style="padding: 8px 0; color: #666;">Date</td><td style="padding: 8px 0; font-weight: 600;">${formattedDate}</td></tr><tr><td style="padding: 8px 0; color: #666;">Time</td><td style="padding: 8px 0; font-weight: 600;">${time}</td></tr></table><div style="text-align: center; margin-top: 24px;"><a href="https://www.mantasharkaquatics.net/dashboard" style="display: inline-block; background: #7b61c4; color: white; font-weight: 700; padding: 14px 32px; border-radius: 8px; text-decoration: none;">Review Invitation</a></div><p style="color: #999; font-size: 12px; margin-top: 16px;">Confirming will use 1 lesson credit from your account. The invitation expires automatically if not confirmed in time.</p></div></div>`

  } else if (type === 'partner_booking_confirmed') {
    subject = `✅ ${studentName} Confirmed – ${courseName} on ${formattedDate}`
    html = `<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; background: #f9f9f9; padding: 32px; border-radius: 12px;"><div style="text-align: center; margin-bottom: 24px;"><h1 style="color: #1a2744; font-size: 24px; margin: 0;">Manta Shark Aquatics</h1></div><div style="background: white; border-radius: 8px; padding: 24px; margin-bottom: 16px;"><h2 style="color: #1a2744; margin-top: 0;">✅ Booking Confirmed</h2><p>Hi ${parentName},</p><p><strong>${studentName}</strong> has confirmed. Your 1-on-2 lesson is officially booked!</p><table style="width: 100%; border-collapse: collapse;"><tr><td style="padding: 8px 0; color: #666;">Course</td><td style="padding: 8px 0; font-weight: 600;">${courseName}</td></tr><tr><td style="padding: 8px 0; color: #666;">Coach</td><td style="padding: 8px 0; font-weight: 600;">${coachName}</td></tr><tr><td style="padding: 8px 0; color: #666;">Date</td><td style="padding: 8px 0; font-weight: 600;">${formattedDate}</td></tr><tr><td style="padding: 8px 0; color: #666;">Time</td><td style="padding: 8px 0; font-weight: 600;">${time}</td></tr></table></div></div>`

  } else if (type === 'partner_booking_rejected') {
    subject = `❌ ${studentName} Declined – ${courseName} on ${formattedDate}`
    html = `<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; background: #f9f9f9; padding: 32px; border-radius: 12px;"><div style="text-align: center; margin-bottom: 24px;"><h1 style="color: #1a2744; font-size: 24px; margin: 0;">Manta Shark Aquatics</h1></div><div style="background: white; border-radius: 8px; padding: 24px; margin-bottom: 16px;"><h2 style="color: #1a2744; margin-top: 0;">❌ Invitation Declined</h2><p>Hi ${parentName},</p><p><strong>${studentName}</strong> has declined your 1-on-2 invitation. The second student spot for this session has been released.</p><table style="width: 100%; border-collapse: collapse;"><tr><td style="padding: 8px 0; color: #666;">Course</td><td style="padding: 8px 0; font-weight: 600;">${courseName}</td></tr><tr><td style="padding: 8px 0; color: #666;">Date</td><td style="padding: 8px 0; font-weight: 600;">${formattedDate}</td></tr><tr><td style="padding: 8px 0; color: #666;">Time</td><td style="padding: 8px 0; font-weight: 600;">${time}</td></tr></table><p style="color: #666;">Your own booking (first student) is still active.</p></div></div>`

  } else if (type === 'partner_reschedule_requested') {
    subject = `Reschedule Request – ${courseName}`
    html = `<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; background: #f9f9f9; padding: 32px; border-radius: 12px;"><div style="text-align: center; margin-bottom: 24px;"><h1 style="color: #1a2744; font-size: 24px; margin: 0;">Manta Shark Aquatics</h1></div><div style="background: white; border-radius: 8px; padding: 24px; margin-bottom: 16px;"><h2 style="color: #1a2744; margin-top: 0;">📅 Reschedule Request</h2><p>Hi ${parentName},</p><p>Your 1-on-2 lesson partner has requested to reschedule. Please log in to your Dashboard to confirm or decline.</p><div style="text-align: center; margin-top: 24px;"><a href="https://www.mantasharkaquatics.net/dashboard" style="display: inline-block; background: #1a2744; color: white; font-weight: 700; padding: 14px 32px; border-radius: 8px; text-decoration: none;">Review Invitation</a></div></div></div>`

  } else if (type === 'invoice') {
    subject = `🧾 Invoice ${invoiceNumber} - Manta Shark Aquatics`
    html = `<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; background: #f9f9f9; padding: 32px; border-radius: 12px;"><div style="text-align: center; margin-bottom: 24px;"><h1 style="color: #1a2744; font-size: 24px; margin: 0;">Manta Shark Aquatics</h1></div><div style="background: white; border-radius: 8px; padding: 24px; margin-bottom: 16px;"><h2 style="color: #1a2744; margin-top: 0;">🧾 Invoice ${invoiceNumber}</h2><p>Hi ${parentName},</p><p>Thank you for your payment! Your invoice is ready. Log in to your dashboard to view and download it anytime.</p><table style="width: 100%; border-collapse: collapse;"><tr><td style="padding: 8px 0; color: #666;">Invoice Number</td><td style="padding: 8px 0; font-weight: 600;">${invoiceNumber}</td></tr><tr><td style="padding: 8px 0; color: #666;">Amount Paid</td><td style="padding: 8px 0; font-weight: 600; color: #c9a84c;">$${Number(amount).toFixed(2)}</td></tr></table><div style="margin-top: 20px; text-align: center;"><a href="https://www.mantasharkaquatics.net/dashboard" style="background: #1a2744; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; display: inline-block;">Go to My Dashboard</a></div></div><p style="color: #666; font-size: 13px; text-align: center;">Questions? Reply to this email or chat with us at <a href="https://www.mantasharkaquatics.net">mantasharkaquatics.net</a></p></div>`
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
