export const metadata = { title: 'SMS Terms & Conditions | Manta Shark Aquatics' }

const NAVY = '#1a2744'
const GOLD = '#c9a84c'

function H2({ children }: { children: React.ReactNode }) {
  return <h2 style={{ fontSize: 20, fontWeight: 700, color: NAVY, marginTop: 32, marginBottom: 12 }}>{children}</h2>
}

export default function SmsTermsPage() {
  return (
    <main style={{ maxWidth: 760, margin: '0 auto', padding: '48px 24px', color: '#333', lineHeight: 1.7, fontSize: 15 }}>
      <p style={{ color: GOLD, fontWeight: 700, letterSpacing: 2, fontSize: 12, textTransform: 'uppercase' }}>Manta Shark Aquatics</p>
      <h1 style={{ fontSize: 32, fontWeight: 800, color: NAVY, margin: '4px 0 4px' }}>SMS Terms &amp; Conditions</h1>
      <p style={{ color: '#888', fontSize: 13 }}>Last Updated: July 4, 2026</p>

      <H2>Program Description</H2>
      <p>
        Manta Shark Aquatics sends SMS messages to verify your phone number during account
        registration on www.mantasharkaquatics.net. When you enter your phone number and tap
        &quot;Send Verification Code&quot;, we send you a one-time passcode by SMS. Messages are sent only
        when you request them.
      </p>

      <H2>Message Frequency</H2>
      <p>One message per verification request. Message frequency varies based on how many codes you request.</p>

      <H2>Fees</H2>
      <p>
        Message and data rates may apply. Charges are billed by your mobile carrier according to
        your mobile plan. Carriers are not liable for delayed or undelivered messages.
      </p>

      <H2>Opting Out</H2>
      <p>
        Reply STOP to any message to opt out. After opting out you will receive one final
        confirmation message and no further messages will be sent. Note that phone verification by
        SMS is offered as a convenience; consent to receive SMS is not a condition of purchasing any
        goods or services. If you need help with your account without SMS, contact us at
        info@mantasharkaquatics.net.
      </p>

      <H2>Help</H2>
      <p>Reply HELP to any message, or contact us at info@mantasharkaquatics.net.</p>

      <H2>Privacy</H2>
      <p>
        Your phone number is used only as described in these terms and in our{' '}
        <a href="/privacy-policy" style={{ color: GOLD }}>Privacy Policy</a>. No mobile information
        will be shared with third parties or affiliates for marketing or promotional purposes.
      </p>

      <H2>Contact</H2>
      <p>
        Manta Shark Aquatics<br />
        Email: info@mantasharkaquatics.net<br />
        Website: www.mantasharkaquatics.net
      </p>
    </main>
  )
}
