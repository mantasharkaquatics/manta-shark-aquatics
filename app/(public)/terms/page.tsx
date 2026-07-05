import { LEGAL_VERSIONS } from '@/lib/legal'

export const metadata = { title: 'User Agreement — Manta Shark Aquatics' }

const h2: React.CSSProperties = { fontFamily: "'Playfair Display', serif", fontSize: '20px', fontWeight: 700, color: '#c9a84c', margin: '32px 0 12px' }
const p: React.CSSProperties = { fontSize: '14px', lineHeight: 1.8, color: 'rgba(255,255,255,0.75)', margin: '0 0 12px' }
const plain: React.CSSProperties = { fontSize: '13px', lineHeight: 1.7, color: 'rgba(255,255,255,0.85)', background: 'rgba(201,168,76,0.10)', border: '1px solid rgba(201,168,76,0.35)', borderRadius: '10px', padding: '12px 16px', margin: '0 0 14px' }

export default function Page() {
  return (
    <div style={{ minHeight: '100vh', background: '#111d38', padding: '60px 20px' }}>
      <div style={{ maxWidth: '760px', margin: '0 auto' }}>
        <p style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase', color: '#c9a84c', marginBottom: '8px' }}>Manta Shark Aquatics</p>
        <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: '34px', fontWeight: 900, color: '#fff', margin: '0 0 6px' }}>User Agreement</h1>
        <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.4)', margin: '0 0 8px' }}>The agreement governing your account, bookings, lessons, payments, and refunds.</p>
        <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.35)', margin: '0 0 24px' }}>Version: {LEGAL_VERSIONS.terms} · Last updated July 4, 2026</p>

        <h2 style={h2}>1. Acceptance of Terms</h2>
        <p style={p}>By creating an account with Manta Shark Aquatics (&ldquo;we,&rdquo; &ldquo;us,&rdquo; or &ldquo;the School&rdquo;), you agree to be bound by this User Agreement. If you do not agree, please do not register or use our services. This agreement applies to the parent or legal guardian creating the account and to all students enrolled under that account.</p>

        <h2 style={h2}>2. Registration &amp; Account</h2>
        <p style={p}>You must provide accurate, current information during registration, including a verified email address and phone number. You are responsible for maintaining the confidentiality of your account credentials and for all activity under your account. Accounts may only be created by a parent or legal guardian aged 18 or older.</p>

        <h2 style={h2}>3. Lesson Credits, Packages &amp; Validity</h2>
        <div style={plain}><strong>In plain terms:</strong> credits are shared by your whole family and each package has an expiration window, so plan lessons within it.</div>
        <p style={p}>Lessons are purchased as credit packages. Credits are shared across all students under the same family account and are consumed oldest-first. Packages are valid for the following periods from the date of purchase: 10 sessions &mdash; 4 months; 20 sessions &mdash; 8 months; 30 sessions &mdash; 12 months; 50 sessions &mdash; 18 months. Credits expire at the end of the validity period. All payments are processed securely through Stripe. Prices are as listed on our Plans page at the time of purchase. Credits are non-transferable to other family accounts and have no cash value.</p>

        <h2 style={h2}>4. Booking, Cancellation &amp; Rescheduling</h2>
        <div style={plain}><strong>In plain terms:</strong> you can cancel or reschedule freely up to 24 hours before a lesson. Inside 24 hours the lesson counts, except documented illness or emergency, which our team reviews personally.</div>
        <p style={p}>Lessons may be booked through your account dashboard subject to availability. Cancellations or reschedule requests must be made at least 24 hours before the scheduled lesson start time; rescheduling more than 24 hours in advance is unlimited, subject to package validity. Cancellations made within 24 hours of the lesson are not eligible for refund, credit return, or rescheduling. No-shows are treated as completed lessons and the credit is used.</p>
        <p style={p}><em>Illness exception.</em> If a student is ill within the 24-hour window, contact us before the lesson. With a doctor&rsquo;s note, the absence is excused without limit. Without a note, one excused illness absence is allowed per student. Excused absences are compensated with one Swim Team credit valid for one year, issued by our staff after review.</p>

        <h2 style={h2}>5. School-Initiated Cancellations</h2>
        <p style={p}>If the School cancels a lesson (including for extreme weather or official disaster alerts), the credit is automatically returned to your account and you will be notified by email and SMS. If the School cancels within 24 hours of the lesson start time, your account will also receive one complimentary Swim Team credit.</p>

        <h2 style={h2}>6. Refund Policy</h2>
        <div style={plain}><strong>In plain terms:</strong> lessons you have not taken can be refunded at the exact per-session price you actually paid. Ask us in chat or at the front desk and a team member will handle it.</div>
        <p style={p}>Lessons not yet taken are refundable. The refund amount equals the number of remaining sessions multiplied by the actual per-session price paid for that package. Lessons already taken, no-shows, and cancellations within 24 hours of the lesson are not refundable. To request a refund, contact us through the in-app chat or at the front desk; refunds are reviewed and processed by our staff and issued to the original payment method. This policy is provided in accordance with California Civil Code Section 1723.</p>

        <h2 style={h2}>7. Monthly Programs &amp; Automatic Renewal</h2>
        <div style={plain}><strong>In plain terms:</strong> monthly programs renew each month automatically until you cancel, and you can cancel anytime before your next billing date.</div>
        <p style={p}>Group programs and Swim Team memberships are billed monthly and renew automatically each month until cancelled. The recurring price is disclosed at signup, and you will be notified in advance of any price change. You may cancel at any time before your next billing date from your account dashboard or by contacting us at info@mantasharkaquatics.net; cancellation stops future charges and your membership remains active through the period already paid.</p>

        <h2 style={h2}>8. Check-in &amp; Attendance</h2>
        <p style={p}>Students must check in at the front desk before each lesson, either by QR code or by name. Check-in opens 30 minutes before the scheduled start time and closes when the lesson ends. Attendance records are maintained electronically and are visible in your account dashboard.</p>

        <h2 style={h2}>9. Late Arrivals</h2>
        <p style={p}>Lessons start and end at their scheduled times. Time missed due to late arrival is not made up or credited, and the lesson counts in full, as the coach&rsquo;s time is reserved for your student.</p>

        <h2 style={h2}>10. Student Conduct &amp; Safety</h2>
        <p style={p}>Students must follow all posted pool rules and instructions from coaches and staff at all times. The School reserves the right to remove any student from a lesson for unsafe behavior without refund. Students should not enter the pool area before their scheduled lesson. Parents are not required to remain on premises, except for infant and baby swim programs, where a parent or guardian participates in the water.</p>

        <h2 style={h2}>11. Health Requirements</h2>
        <p style={p}>Students must be in good health to participate. Please do not bring a student to a lesson if they are ill, have an open wound, or have a contagious condition. You must inform us of any medical conditions, allergies, or special needs that may affect the student&rsquo;s safety in the water.</p>

        <h2 style={h2}>12. Termination</h2>
        <p style={p}>We reserve the right to suspend or terminate accounts that violate this agreement, engage in abusive behavior toward staff or other families, or misuse the booking system. Unused credits on terminated accounts are refunded according to Section 6 unless the termination results from fraud or abuse.</p>

        <h2 style={h2}>13. Limitation of Liability</h2>
        <p style={p}>To the maximum extent permitted by law, the School&rsquo;s total liability for any claim arising from this agreement or the services shall not exceed the amount you paid for the lesson package giving rise to the claim. Participation in swim lessons is also subject to the separate Liability Waiver you accept during registration.</p>

        <h2 style={h2}>14. Governing Law</h2>
        <p style={p}>This agreement is governed by the laws of the State of California. Any disputes shall be resolved in the state or federal courts located in California.</p>

        <h2 style={h2}>15. Changes to This Agreement</h2>
        <p style={p}>We may update this User Agreement from time to time. Material changes will be communicated by email or through your account dashboard, and continued use of the services after notice constitutes acceptance. The version you accepted is recorded with your account.</p>

        <h2 style={h2}>16. Contact</h2>
        <p style={p}>Questions about this agreement may be directed to info@mantasharkaquatics.net.</p>
      </div>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;900&display=swap');`}</style>
    </div>
  )
}
