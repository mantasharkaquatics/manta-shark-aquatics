import LegalPage from '@/components/brand/LegalPage'
export const metadata = { title: 'SMS Terms & Conditions | Manta Shark Aquatics' }

export default function SmsTermsPage() {
  return (
    <LegalPage
      title="SMS Terms & Conditions"
      subtitle="Message frequency, rates, and how to opt out."
      meta="Last updated: July 4, 2026"
    >
        <h2>Program Description</h2>
        <p>
          Manta Shark Aquatics sends SMS messages to verify your phone number during account
          registration on www.mantasharkaquatics.net. When you enter your phone number and tap
          &quot;Send Verification Code&quot;, we send you a one-time passcode by SMS. Messages are sent only
          when you request them.
        </p>

        <h2>Message Frequency</h2>
        <p>One message per verification request. Message frequency varies based on how many codes you request.</p>

        <h2>Fees</h2>
        <p>
          Message and data rates may apply. Charges are billed by your mobile carrier according to
          your mobile plan. Carriers are not liable for delayed or undelivered messages.
        </p>

        <h2>Opting Out</h2>
        <p>
          Reply STOP to any message to opt out. After opting out you will receive one final
          confirmation message and no further messages will be sent. Note that phone verification by
          SMS is offered as a convenience; consent to receive SMS is not a condition of purchasing any
          goods or services. If you need help with your account without SMS, contact us at
          info@mantasharkaquatics.net.
        </p>

        <h2>Help</h2>
        <p>Reply HELP to any message, or contact us at info@mantasharkaquatics.net.</p>

        <h2>Privacy</h2>
        <p>
          Your phone number is used only as described in these terms and in our{' '}
          <a href="/privacy-policy">Privacy Policy</a>. No mobile information
          will be shared with third parties or affiliates for marketing or promotional purposes.
        </p>

        <h2>Contact</h2>
        <p>
          Manta Shark Aquatics<br />
          Email: info@mantasharkaquatics.net<br />
          Website: www.mantasharkaquatics.net
        </p>

    </LegalPage>
  )
}
