export type SmsResult = { ok: true } | { ok: false; reason: string }

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

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}))
      console.error('sendSms: Twilio rejected the message', response.status, errData)
      const code = (errData as { code?: number }).code
      if (code === 21211 || code === 21614) {
        return { ok: false, reason: 'That phone number could not receive a text. Please check it and try again.' }
      }
      if (code === 21610) {
        return { ok: false, reason: 'This number has opted out of our texts. Reply START to re-subscribe, then try again.' }
      }
      return { ok: false, reason: 'We could not send the text message. Please try again in a moment.' }
    }

    return { ok: true }
  } catch (e) {
    console.error('sendSms: network error reaching Twilio', e)
    return { ok: false, reason: 'We could not send the text message. Please try again in a moment.' }
  }
}

export const SMS_COMPLIANCE_SUFFIX =
  ' Msg&Data rates may apply. Reply HELP for help, STOP to opt out.'
