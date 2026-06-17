import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

export async function POST(req: NextRequest) {
  const { type, to, parentName, studentName, courseName, coachName, date, time } = await req.json()

  let subject = ''
  let html = ''

  const formattedDate = new Date(date).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })

  if (type === 'booking_confirmed') {
    subject = `Booking Confirmed – ${courseName} on ${formattedDate}`
    html = `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; background: #f9f9f9; padding: 32px; border-radius: 12px;">
        <div style="text-align: center; margin-bottom: 24px;">
          <h1 style="color: #1a2744; font-size: 24px; margin: 0;">Manta Shark Aquatics</h1>
        </div>
        <div style="background: white; border-radius: 8px; padding: 24px; margin-bottom: 16px;">
          <h2 style="color: #1a2744; margin-top: 0;">✅ Booking Confirmed!</h2>
          <p>Hi ${parentName},</p>
          <p>Your lesson has been booked successfully. Here are the details:</p>
          <table style="width: 100%; border-collapse: collapse;">
            <tr><td style="padding: 8px 0; color: #666;">Student</td><td style="padding: 8px 0; font-weight: 600;">${studentName}</td></tr>
            <tr><td style="padding: 8px 0; color: #666;">Course</td><td style="padding: 8px 0; font-weight: 600;">${courseName}</td></tr>
            <tr><td style="padding: 8px 0; color: #666;">Coach</td><td style="padding: 8px 0; font-weight: 600;">${coachName}</td></tr>
            <tr><td style="padding: 8px 0; color: #666;">Date</td><td style="padding: 8px 0; font-weight: 600;">${formattedDate}</td></tr>
            <tr><td style="padding: 8px 0; color: #666;">Time</td><td style="padding: 8px 0; font-weight: 600;">${time}</td></tr>
          </table>
        </div>
        <p style="color: #666; font-size: 13px; text-align: center;">Questions? Reply to this email or chat with us at <a href="https://www.mantasharkaquatics.net">mantasharkaquatics.net</a></p>
      </div>
    `
  } else if (type === 'booking_rescheduled') {
    subject = `Lesson Rescheduled – ${courseName} on ${formattedDate}`
    html = `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; background: #f9f9f9; padding: 32px; border-radius: 12px;">
        <div style="text-align: center; margin-bottom: 24px;">
          <h1 style="color: #1a2744; font-size: 24px; margin: 0;">Manta Shark Aquatics</h1>
        </div>
        <div style="background: white; border-radius: 8px; padding: 24px; margin-bottom: 16px;">
          <h2 style="color: #1a2744; margin-top: 0;">📅 Lesson Rescheduled</h2>
          <p>Hi ${parentName},</p>
          <p>Your lesson has been rescheduled. Here are your new details:</p>
          <table style="width: 100%; border-collapse: collapse;">
            <tr><td style="padding: 8px 0; color: #666;">Student</td><td style="padding: 8px 0; font-weight: 600;">${studentName}</td></tr>
            <tr><td style="padding: 8px 0; color: #666;">Course</td><td style="padding: 8px 0; font-weight: 600;">${courseName}</td></tr>
            <tr><td style="padding: 8px 0; color: #666;">Coach</td><td style="padding: 8px 0; font-weight: 600;">${coachName}</td></tr>
            <tr><td style="padding: 8px 0; color: #666;">New Date</td><td style="padding: 8px 0; font-weight: 600;">${formattedDate}</td></tr>
            <tr><td style="padding: 8px 0; color: #666;">New Time</td><td style="padding: 8px 0; font-weight: 600;">${time}</td></tr>
          </table>
        </div>
        <p style="color: #666; font-size: 13px; text-align: center;">Questions? Reply to this email or chat with us at <a href="https://www.mantasharkaquatics.net">mantasharkaquatics.net</a></p>
      </div>
    `
  } else if (type === 'booking_cancelled') {
    subject = `Lesson Cancelled – ${courseName} on ${formattedDate}`
    html = `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; background: #f9f9f9; padding: 32px; border-radius: 12px;">
        <div style="text-align: center; margin-bottom: 24px;">
          <h1 style="color: #1a2744; font-size: 24px; margin: 0;">Manta Shark Aquatics</h1>
        </div>
        <div style="background: white; border-radius: 8px; padding: 24px; margin-bottom: 16px;">
          <h2 style="color: #1a2744; margin-top: 0;">❌ Lesson Cancelled</h2>
          <p>Hi ${parentName},</p>
          <p>Your lesson has been cancelled and your credit has been returned to your account.</p>
          <table style="width: 100%; border-collapse: collapse;">
            <tr><td style="padding: 8px 0; color: #666;">Student</td><td style="padding: 8px 0; font-weight: 600;">${studentName}</td></tr>
            <tr><td style="padding: 8px 0; color: #666;">Course</td><td style="padding: 8px 0; font-weight: 600;">${courseName}</td></tr>
            <tr><td style="padding: 8px 0; color: #666;">Date</td><td style="padding: 8px 0; font-weight: 600;">${formattedDate}</td></tr>
            <tr><td style="padding: 8px 0; color: #666;">Time</td><td style="padding: 8px 0; font-weight: 600;">${time}</td></tr>
          </table>
          <p style="color: #c9a84c; font-weight: 600;">Your lesson credit has been restored and is ready to use.</p>
        </div>
        <p style="color: #666; font-size: 13px; text-align: center;">Questions? Reply to this email or chat with us at <a href="https://www.mantasharkaquatics.net">mantasharkaquatics.net</a></p>
      </div>
    `
  } else if (type === 'reminder_24h') {
    subject = `Reminder: ${courseName} Tomorrow at ${time}`
    html = `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; background: #f9f9f9; padding: 32px; border-radius: 12px;">
        <div style="text-align: center; margin-bottom: 24px;">
          <h1 style="color: #1a2744; font-size: 24px; margin: 0;">Manta Shark Aquatics</h1>
        </div>
        <div style="background: white; border-radius: 8px; padding: 24px; margin-bottom: 16px;">
          <h2 style="color: #1a2744; margin-top: 0;">🏊 Lesson Tomorrow!</h2>
          <p>Hi ${parentName},</p>
          <p>Just a reminder that ${studentName} has a lesson tomorrow!</p>
          <table style="width: 100%; border-collapse: collapse;">
            <tr><td style="padding: 8px 0; color: #666;">Student</td><td style="padding: 8px 0; font-weight: 600;">${studentName}</td></tr>
            <tr><td style="padding: 8px 0; color: #666;">Course</td><td style="padding: 8px 0; font-weight: 600;">${courseName}</td></tr>
            <tr><td style="padding: 8px 0; color: #666;">Coach</td><td style="padding: 8px 0; font-weight: 600;">${coachName}</td></tr>
            <tr><td style="padding: 8px 0; color: #666;">Date</td><td style="padding: 8px 0; font-weight: 600;">${formattedDate}</td></tr>
            <tr><td style="padding: 8px 0; color: #666;">Time</td><td style="padding: 8px 0; font-weight: 600;">${time}</td></tr>
          </table>
          <p>Please arrive 5 minutes early. See you in the pool! 🦈</p>
        </div>
        <p style="color: #666; font-size: 13px; text-align: center;">Questions? Reply to this email or chat with us at <a href="https://www.mantasharkaquatics.net">mantasharkaquatics.net</a></p>
      </div>
    `
  }

  try {
    await resend.emails.send({
      from: 'Manta Shark Aquatics <info@mantasharkaquatics.net>',
      to,
      subject,
      html,
    })
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Email error:', err)
    return NextResponse.json({ error: 'Failed to send email' }, { status: 500 })
  }
}
