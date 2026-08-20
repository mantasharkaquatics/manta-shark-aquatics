// Every outbound SMS in the codebase goes through here. Callers get a shaped
// result instead of a raw Response: `reason` is safe to show a parent, while
// `sid` / `status` / `code` are the operator-facing details a cron or an admin
// route wants in its log. Twilio credentials are read here and nowhere else.
export type SmsResult =
  | { ok: true; sid?: string; status?: string }
  | { ok: false; reason: string; code?: number }

export async function sendSms(to: string, body: string): Promise<SmsResult> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID
  const authToken = process.env.TWILIO_AUTH_TOKEN
  const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID

  if (!accountSid || !authToken || !messagingServiceSid) {
    console.error('sendSms: Twilio environment variables are not configured')
    return { ok: false, reason: 'SMS is not configured. Please contact us directly.' }
  }

  try {
    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          Authorization:
            'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64'),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          MessagingServiceSid: messagingServiceSid,
          To: to,
          Body: body,
        }),
      }
    )

    const data = (await response.json().catch(() => ({}))) as {
      sid?: string
      status?: string
      code?: number
    }

    if (!response.ok) {
      console.error('sendSms: Twilio rejected the message', response.status, data)
      const code = data.code
      if (code === 21211 || code === 21614) {
        return { ok: false, reason: 'That phone number could not receive a text. Please check it and try again.', code }
      }
      if (code === 21610) {
        return { ok: false, reason: 'This number has opted out of our texts. Reply START to re-subscribe, then try again.', code }
      }
      return { ok: false, reason: 'We could not send the text message. Please try again in a moment.', code }
    }

    // A 2xx with no sid is not a delivery Twilio ever promised to make. Callers
    // that stamp a "we texted them" row check for the sid, not just ok.
    return { ok: true, sid: data.sid, status: data.status }
  } catch (e) {
    console.error('sendSms: network error reaching Twilio', e)
    return { ok: false, reason: 'We could not send the text message. Please try again in a moment.' }
  }
}

export const SMS_COMPLIANCE_SUFFIX =
  ' Msg&Data rates may apply. Reply HELP for help, STOP to opt out.'
