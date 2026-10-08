import LegalPage from '@/components/brand/LegalPage'
export const metadata = { title: 'Privacy Policy | Manta Shark Aquatics' }

export default function PrivacyPolicyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      subtitle="What information we collect and how we use it."
      meta="Last updated: October 8, 2026"
    >
        <p>
          Manta Shark Aquatics (&quot;we&quot;, &quot;us&quot;, &quot;our&quot;) values your privacy. This Privacy Policy explains how we
          collect, use, and protect your personal information when you use our website
          (www.mantasharkaquatics.net) and services.
        </p>

        <h2>1. Information We Collect</h2>
        <ul>
          <li>Account information: name, email address, phone number, home address, and password.</li>
          <li>Student information: swimmer names, ages, and swim-level progress.</li>
          <li>Booking and attendance records for lessons you schedule with us.</li>
          <li>Payment information, processed securely by Stripe. We do not store full card numbers.</li>
          {/* Chat, voice notes and AI reports were missing (found 2026-10-08).
              Draft wording, to be reviewed by counsel before launch. */}
          <li>Messages you send through the chat on our website, whether or not you are signed in, and the replies you receive.</li>
          <li>
            Lesson records about your swimmer: after a lesson or a Swim Assessment, a coach may record
            a short spoken note about how your swimmer did. We keep the audio recording, a word-for-word
            transcript of it, the written lesson note prepared from it (and its translation into the
            language you choose), and the coach&apos;s skill scores.
          </li>
          <li>
            Progress reports about your swimmer, including monthly progress reports that are drafted
            with the help of an AI service and reviewed by our staff before they are sent to you.
          </li>
        </ul>
        <p>
          <strong>Health-Related and Program Information.</strong>{' '}If your student participates in a
          special needs program or receives services through a California Regional Center (including
          the Self-Determination Program), we may collect, at your request or with your consent,
          limited program-related information such as your student&apos;s legal name, Regional Center
          UCI number, and applicable service codes. We collect this information solely to prepare
          invoices and billing documentation for Regional Center reimbursement purposes and to
          appropriately accommodate your student&apos;s lessons. We do not use this information for
          marketing, do not sell or share it with third parties except as required to process your
          requested billing, and retain it only as long as necessary for accounting and legal
          compliance.
        </p>

        <h2>2. How We Use Your Information</h2>
        <ul>
          <li>To create and manage your account and your swimmers&apos; lesson bookings.</li>
          <li>To verify your identity during registration (email and SMS one-time passcodes).</li>
          <li>To send service communications such as booking confirmations, cancellations, reminders, and invoices.</li>
          <li>To process payments and maintain transaction records.</li>
          <li>To respond to your questions and provide customer support, including through an AI chat assistant on our website.</li>
          <li>To prepare lesson notes and progress reports about your swimmer, and to translate them into the language you choose.</li>
        </ul>

        <h2>3. SMS / Text Messaging</h2>
        <ul>
          <li>
            When you provide your phone number during account registration and tap &quot;Send Verification
            Code&quot;, you consent to receive text messages from Manta Shark Aquatics: a one-time
            verification passcode, a reminder the day before each lesson you book, and occasional notices
            about your account (for example, when the phone number on your account changes). We do not
            send marketing or promotional text messages.
          </li>
          <li>Message frequency varies: a passcode only when you request one, and one reminder for each lesson you book. Message and data rates may apply.</li>
          <li>Reply STOP to opt out of SMS at any time. Reply HELP for help, or contact us at info@mantasharkaquatics.net.</li>
          <li>Consent to receive SMS is not a condition of purchasing any goods or services.</li>
          <li>
            No mobile information will be shared with third parties or affiliates for marketing or
            promotional purposes. Text messaging originator opt-in data and consent will not be shared
            with any third parties, excluding vendors and service providers acting on our behalf (such
            as Twilio, our SMS delivery provider).
          </li>
          <li>See our <a href="/sms-terms">SMS Terms &amp; Conditions</a> for full program terms.</li>
        </ul>

        <h2>4. Third-Party Service Providers</h2>
        <p>We share only the data necessary to operate our services with trusted providers:</p>
        <ul>
          <li>Stripe (payment processing)</li>
          <li>Resend (transactional email)</li>
          <li>Twilio (SMS delivery)</li>
          <li>Vercel and Supabase (website hosting and secure data storage)</li>
          <li>
            Anthropic (an AI service that powers the chat assistant on our website, turns coaches&apos;
            transcripts into written lesson notes, translates those notes, and drafts monthly progress
            reports)
          </li>
          <li>OpenAI (converts coaches&apos; spoken lesson notes from audio into text)</li>
          <li>Google (suggests matching addresses as you type your home address when you register)</li>
        </ul>
        <p>
          These providers process data on our behalf, only to provide their service to us, and under
          their own privacy policies. We do not sell your personal information, and we do not share it
          with third parties for their marketing purposes.
        </p>
        <p>
          <strong>AI services.</strong>{' '}When we use an AI service, we send it only what the task
          needs — for example, a coach&apos;s recording and the names of the swimmers in that lesson
          to prepare a lesson note, or the messages in a chat conversation to answer it. Lesson notes and monthly
          progress reports prepared with AI are reviewed by our staff before you see them; a translation
          into the language you chose is made from the reviewed text. Replies in the
          chat may be written by the AI assistant; our staff can read chat conversations and may reply
          in person.
        </p>

        <h2>5. How We Protect Your Information</h2>
        <ul>
          <li>Payment information is encrypted and handled by Stripe.</li>
          <li>Access to student and payment records is limited to authorized staff.</li>
          <li>We apply regular security updates to prevent unauthorized access.</li>
        </ul>

        <h2>6. Your Rights</h2>
        <ul>
          <li>Access and update your personal information (contact us for changes).</li>
          <li>Request deletion of your data, unless we are legally required to retain transaction records.</li>
          <li>Withdraw consent to communications at any time (unsubscribe link in emails; reply STOP to SMS).</li>
        </ul>

        <h2>7. Cookies and Similar Technologies</h2>
        <p>
          We use only the cookies and browser storage needed to make the site work. We do not use
          advertising cookies, analytics cookies, or any third-party tracking pixels, and nothing on
          this site follows you to other websites. Because we set no non-essential cookies, we do not
          show a cookie consent banner.
        </p>
        <ul>
          <li>
            <strong>Sign-in session (required).</strong> When you log in, our authentication provider
            (Supabase) sets a session cookie so you stay signed in as you move between pages. Signing
            out clears it.
          </li>
          <li>
            <strong>Language preference.</strong> A small cookie remembers whether you chose English,
            Traditional Chinese, or Simplified Chinese, so the site opens in that language next time.
          </li>
          <li>
            <strong>Chat window state.</strong> Your browser remembers whether the chat window was
            open, for the current browser tab only. It is discarded when you close the tab.
          </li>
          {/* Found 2026-10-08: these two outlive the tab and were not disclosed. */}
          <li>
            <strong>Chat without an account.</strong> If you use the chat without signing in, your
            browser keeps an identifier for that conversation (in local storage), so the conversation is
            still there when you come back. When you sign in, the conversation moves into your account
            and the identifier is removed; otherwise it stays until you clear this site&apos;s data in
            your browser.
          </li>
          <li>
            <strong>Referral link.</strong> If you open a friend&apos;s referral link, your browser
            remembers the referral code (in local storage) for up to 30 days, so it can be applied if
            you register later.
          </li>
          <li>
            <strong>Booking in progress.</strong> If you leave the booking page to buy points, your
            browser remembers the booking you were putting together, for that browser tab only and for
            up to two hours, so you can pick up where you left off.
          </li>
          <li>
            <strong>Payments.</strong>{' '}Card payments are completed on Stripe&apos;s own secure pages.
            Stripe sets its own cookies there for fraud prevention, under Stripe&apos;s privacy policy.
          </li>
        </ul>
        {/* next/font serves the typefaces from this site; the old paragraph said
            the browser contacted Google Fonts, which it does not (found 2026-10-08). */}
        <p>
          The typefaces on our pages are served from our own website. Your browser does not contact
          Google Fonts or any other font service to display them.
        </p>
        <p>
          You can block or delete cookies in your browser settings. Blocking the sign-in cookie will
          prevent you from logging in to your account; the others only affect convenience.
        </p>

        <h2>8. California Privacy Rights &amp; Do Not Track</h2>
        <p>
          California residents may request access to, or deletion of, the personal information we
          hold about them by contacting us at info@mantasharkaquatics.net. We do not sell personal
          information. Our website does not respond to browser &quot;Do Not Track&quot; signals, as no uniform
          industry standard currently exists; we do not track visitors across third-party websites.
        </p>

        <h2>9. Changes to This Policy</h2>
        <p>
          We may update this policy to reflect legal or service changes. Significant updates will be
          communicated by email or a website notice.
        </p>

        <h2>10. Contact Us</h2>
        <p>
          Manta Shark Aquatics<br />
          Email: info@mantasharkaquatics.net<br />
          Website: www.mantasharkaquatics.net
        </p>

    </LegalPage>
  )
}
