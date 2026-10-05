import LegalPage from '@/components/brand/LegalPage'
export const metadata = { title: 'SMS Terms & Conditions | Manta Shark Aquatics' }

export default function SmsTermsPage() {
  return (
    <LegalPage
      title="SMS Terms & Conditions"
      subtitle="Message frequency, rates, and how to opt out."
      meta="Last updated: October 5, 2026"
    >
        <h2>Program Description</h2>
        <p>
          Manta Shark Aquatics sends text messages to the mobile number on your account at
          www.mantasharkaquatics.net. When you enter your phone number and tap &quot;Send Verification
          Code&quot;, you agree to receive:
        </p>
        <ul>
          <li><strong>Verification passcodes.</strong> A one-time passcode to confirm your phone number when you register, or when you apply for a coaching position, sent only when you request it.</li>
          <li><strong>Lesson reminders.</strong> A reminder the day before each lesson you have booked, with the swimmer, lesson time and coach.</li>
          <li><strong>Account notices.</strong> Occasional messages about your account, such as a confirmation when the phone number on your account is changed.</li>
        </ul>
        <p>We do not send marketing or promotional text messages.</p>

        <h2>Message Frequency</h2>
        <p>
          Message frequency varies. Passcodes are sent only when you request one. Lesson reminders are
          one message for each lesson you have booked; a 60-minute lesson, or two of your children in
          the same lesson, gets one reminder, not two.
        </p>

        <h2>Fees</h2>
        <p>
          Message and data rates may apply. Charges are billed by your mobile carrier according to
          your mobile plan. Carriers are not liable for delayed or undelivered messages.
        </p>

        <h2>Opting Out</h2>
        <p>
          Reply STOP to any message to opt out. After opting out you will receive one final
          confirmation message and no further text messages, including lesson reminders; booking
          confirmations and other notices continue by email. Reply START to receive text messages
          again. Consent to receive text messages is not a condition of purchasing any goods or
          services. If you cannot receive a verification passcode by text, contact us at
          info@mantasharkaquatics.net and we will help you finish setting up your account.
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
