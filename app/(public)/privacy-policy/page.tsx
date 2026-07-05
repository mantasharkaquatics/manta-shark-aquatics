export const metadata = { title: 'Privacy Policy | Manta Shark Aquatics' }

const NAVY = '#1a2744'
const GOLD = '#c9a84c'

function H2({ children }: { children: React.ReactNode }) {
  return <h2 style={{ fontSize: 20, fontWeight: 700, color: NAVY, marginTop: 32, marginBottom: 12 }}>{children}</h2>
}

export default function PrivacyPolicyPage() {
  return (
    <main style={{ maxWidth: 760, margin: '0 auto', padding: '48px 24px', color: '#333', lineHeight: 1.7, fontSize: 15 }}>
      <p style={{ color: GOLD, fontWeight: 700, letterSpacing: 2, fontSize: 12, textTransform: 'uppercase' }}>Manta Shark Aquatics</p>
      <h1 style={{ fontSize: 32, fontWeight: 800, color: NAVY, margin: '4px 0 4px' }}>Privacy Policy</h1>
      <p style={{ color: '#888', fontSize: 13 }}>Last Updated: July 4, 2026</p>

      <p style={{ marginTop: 24 }}>
        Manta Shark Aquatics (&quot;we&quot;, &quot;us&quot;, &quot;our&quot;) values your privacy. This Privacy Policy explains how we
        collect, use, and protect your personal information when you use our website
        (www.mantasharkaquatics.net) and services.
      </p>

      <H2>1. Information We Collect</H2>
      <ul>
        <li>Account information: name, email address, phone number, home address, and password.</li>
        <li>Student information: swimmer names, ages, and swim-level progress.</li>
        <li>Booking and attendance records for lessons you schedule with us.</li>
        <li>Payment information, processed securely by Stripe. We do not store full card numbers.</li>
      </ul>

      <H2>2. How We Use Your Information</H2>
      <ul>
        <li>To create and manage your account and your swimmers&apos; lesson bookings.</li>
        <li>To verify your identity during registration (email and SMS one-time passcodes).</li>
        <li>To send service communications such as booking confirmations, cancellations, reminders, and invoices.</li>
        <li>To process payments and maintain transaction records.</li>
        <li>To respond to your questions and provide customer support.</li>
      </ul>

      <H2>3. SMS / Text Messaging</H2>
      <ul>
        <li>
          When you provide your phone number during account registration and tap &quot;Send Verification
          Code&quot;, you consent to receive a one-time verification passcode by SMS from Manta Shark
          Aquatics. Messages are sent only when you request them.
        </li>
        <li>Message frequency: one message per verification request. Message and data rates may apply.</li>
        <li>Reply STOP to opt out of SMS at any time. Reply HELP for help, or contact us at info@mantasharkaquatics.net.</li>
        <li>Consent to receive SMS is not a condition of purchasing any goods or services.</li>
        <li>
          No mobile information will be shared with third parties or affiliates for marketing or
          promotional purposes. Text messaging originator opt-in data and consent will not be shared
          with any third parties, excluding vendors and service providers acting on our behalf (such
          as Twilio, our SMS delivery provider).
        </li>
        <li>See our <a href="/sms-terms" style={{ color: GOLD }}>SMS Terms &amp; Conditions</a> for full program terms.</li>
      </ul>

      <H2>4. Third-Party Service Providers</H2>
      <p>We share only the data necessary to operate our services with trusted providers:</p>
      <ul>
        <li>Stripe (payment processing)</li>
        <li>Resend (transactional email)</li>
        <li>Twilio (SMS delivery)</li>
        <li>Vercel and Supabase (website hosting and secure data storage)</li>
      </ul>
      <p>
        These providers process data on our behalf under their own privacy policies. We do not sell
        your personal information, and we do not share it with third parties for their marketing purposes.
      </p>

      <H2>5. How We Protect Your Information</H2>
      <ul>
        <li>Payment information is encrypted and handled by Stripe.</li>
        <li>Access to student and payment records is limited to authorized staff.</li>
        <li>We apply regular security updates to prevent unauthorized access.</li>
      </ul>

      <H2>6. Your Rights</H2>
      <ul>
        <li>Access and update your personal information (contact us for changes).</li>
        <li>Request deletion of your data, unless we are legally required to retain transaction records.</li>
        <li>Withdraw consent to communications at any time (unsubscribe link in emails; reply STOP to SMS).</li>
      </ul>

      <H2>7. Changes to This Policy</H2>
      <p>
        We may update this policy to reflect legal or service changes. Significant updates will be
        communicated by email or a website notice.
      </p>

      <H2>8. Contact Us</H2>
      <p>
        Manta Shark Aquatics<br />
        Email: info@mantasharkaquatics.net<br />
        Website: www.mantasharkaquatics.net
      </p>
    </main>
  )
}
