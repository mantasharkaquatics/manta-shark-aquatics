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
        <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.4)', margin: '0 0 8px' }}>The agreement governing your account, bookings, lessons, points, payments, and refunds.</p>
        <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.35)', margin: '0 0 24px' }}>Version: {LEGAL_VERSIONS.terms} · Last updated September 1, 2026</p>

        <h2 style={h2}>1. Acceptance of Terms</h2>
        <p style={p}>By creating an account with Manta Shark Aquatics (&ldquo;we,&rdquo; &ldquo;us,&rdquo; or &ldquo;the School&rdquo;), you agree to be bound by this User Agreement. If you do not agree, please do not register or use our services. This agreement applies to the parent or legal guardian creating the account and to all students enrolled under that account.</p>

        <h2 style={h2}>2. Registration &amp; Account</h2>
        <p style={p}>You must provide accurate, current information during registration, including a verified email address and phone number. You are responsible for maintaining the confidentiality of your account credentials and for all activity under your account. Accounts may only be created by a parent or legal guardian aged 18 or older.</p>

        <h2 style={h2}>3. Points</h2>
        <div style={plain}><strong>In plain terms:</strong> lessons are paid for out of a points balance. One point is one dollar. Points never expire, they are shared by everyone on your account, and anything you have not used can be refunded at any time.</div>
        <p style={p}>Lessons are paid for with points. <strong>One point is worth US$1.00</strong>, and that rate is fixed &mdash; it does not change with the amount you add, when you add it, or how long it sits in your account. You may add any whole-dollar amount from $50 to $10,000 at a time. All payments are processed securely through Stripe.</p>
        <p style={p}><strong>Points do not expire.</strong> There is no validity window, no dormancy or service fee, and no deduction of any kind for leaving a balance unused. Points are held against your family account and are shared by every student on it. Points are not transferable to another family account.</p>
        <p style={p}>Points you have paid for are refundable in cash under Section 7. Points added by the School without payment &mdash; a promotional bonus, a goodwill adjustment, or a negotiated programme rate &mdash; book lessons in exactly the same way but are not redeemable for cash, because no payment was received for them. Your points history, in your account dashboard, shows every addition and deduction with the reason for it.</p>
        <p style={p}>Two things are not paid for with points. The <strong>Swim Assessment</strong> is charged to your card at the price shown when you book it, because a family books it before they have an account balance. <strong>Swim Team</strong> is a monthly membership under Section 8. Neither draws on your points.</p>

        <h2 style={h2}>4. What a Lesson Costs</h2>
        <div style={plain}><strong>In plain terms:</strong> every lesson has a listed price. Two things bring it down &mdash; how many lessons you have completed, and booking at a quieter hour. Both are applied when you book, so they also apply to points you already have.</div>
        <p style={p}>Each lesson has a base price in points, per swimmer, per 30 minutes, shown on our Points page and on the booking calendar before you confirm. A 60-minute lesson costs exactly twice a 30-minute one. A lesson booked for two swimmers on your own account is charged for both.</p>
        <p style={p}><strong>VIP discount.</strong> As lessons are completed on your account, every future lesson is discounted: 3% from 10 lessons, 5% from 20, 7% from 30, 9% from 50, and 12% from 80. The count is per family account and includes every swimmer on it. Because the discount is applied when you book rather than when you buy, reaching a new level changes the price of every lesson you book from then on, including lessons paid for with points already in your account.</p>
        <p style={p}><strong>Off-peak discount.</strong> Lessons starting inside our quieter hours are discounted 5%. Those hours are 6:00&nbsp;a.m. to 12:00&nbsp;noon and 7:30&nbsp;p.m. to 9:00&nbsp;p.m. Monday through Friday, and 6:00&nbsp;a.m. to 10:00&nbsp;a.m. and 7:30&nbsp;p.m. to 9:00&nbsp;p.m. on Saturday and Sunday. Whether a lesson is off-peak is decided by the time it starts. The booking calendar marks these times.</p>
        <p style={p}>Where both discounts apply they are multiplied together and the result is rounded down to a whole number of points, so any remainder is always in your favour. The exact figure, and the balance you will be left with, are shown before you confirm a booking. There is no discount for adding a larger amount of points, and no surcharge of any kind.</p>

        <h2 style={h2}>5. Booking, Cancellation &amp; Rescheduling</h2>
        <div style={plain}><strong>In plain terms:</strong> cancel or reschedule freely up to 24 hours before a lesson and the points come straight back. Inside 24 hours the points are not returned &mdash; but for every 10 lessons you complete you earn one late-cancellation allowance, and you choose whether to spend it.</div>
        <p style={p}>Lessons may be booked through your account dashboard subject to availability, and no later than 30 minutes before the lesson starts. Points are taken from your balance when the booking is made.</p>
        <p style={p}>More than 24 hours before the scheduled start time, you may cancel for a <strong>full return of the points</strong>, or reschedule as often as you like. A rescheduled lesson keeps the points already charged for it: it is not re-priced, whether the new time would cost more or less.</p>
        <p style={p}>Within 24 hours of the scheduled start time, lessons cannot be rescheduled online and the points are not returned, because the coach&rsquo;s time is already reserved for your student. In place of that, your account earns <strong>one late-cancellation allowance for every 10 lessons completed</strong>. Using one returns the full points for that lesson. Allowances accumulate over the life of your account, are counted per family account, and are never reset. You choose whether to use one at the moment you cancel; we will never spend one on your behalf. When none remain, a lesson starting within 24 hours cannot be cancelled online and the points are used; contact us and our team will review the situation.</p>
        <p style={p}>Two exceptions apply. A <strong>1-on-2 lesson</strong> starting within 24 hours cannot be cancelled online at all, because a second family shares the slot; contact us and our staff will handle it. A <strong>Swim Assessment</strong> cannot be cancelled online at any time; contact us and we will cancel it for you.</p>
        <p style={p}>No-shows are treated as completed lessons: the points are used and no allowance is consumed.</p>
        <p style={p}><em>Illness exception.</em> If a student is ill within the 24-hour window, contact us before the lesson. With a doctor&rsquo;s note, the absence is excused without limit. Without a note, one excused illness absence is allowed per student. An excused absence has its points returned by our staff after review, without spending a late-cancellation allowance.</p>

        <h2 style={h2}>6. School-Initiated Cancellations</h2>
        <p style={p}>If the School cancels a lesson &mdash; including for extreme weather or an official disaster alert &mdash; you will be notified by email and SMS, and the points for that lesson are returned to your account <strong>in full, whatever the notice period</strong>. A School-initiated cancellation never spends a late-cancellation allowance, because the 24-hour rule exists to protect a coach&rsquo;s reserved time and it is the School giving that time up.</p>

        <h2 style={h2}>7. Refunds</h2>
        <div style={plain}><strong>In plain terms:</strong> points you paid for can be turned back into money at any time, one dollar per point, for whatever you have not spent. There is no deadline and no fee.</div>
        <p style={p}>Unused points that you paid for are refundable in cash at <strong>US$1.00 per point</strong> &mdash; the same rate at which they were purchased &mdash; at any time and with no expiry, deadline, or processing fee. There is no minimum: a balance of any size may be refunded, in whole or in part. If your remaining paid balance is under $10 you may ask for it in cash.</p>
        <p style={p}>Points already spent on lessons are not refundable, whether or not the lesson has been taken: this includes completed lessons, no-shows, and cancellations made within 24 hours where no allowance was used. Points added by the School without payment are not redeemable for cash, as stated in Section 3. The Swim Assessment fee is not refundable once the assessment has taken place.</p>
        <p style={p}>To request a refund, contact us through the in-app chat or at the front desk. Refunds are reviewed and processed by our staff and issued to the original payment method. This policy is provided in accordance with California law, including Civil Code Sections 1749.5 and 1723.</p>

        <h2 style={h2}>8. Monthly Programs &amp; Automatic Renewal</h2>
        <div style={plain}><strong>In plain terms:</strong> monthly programs renew each month automatically until you cancel, and you can cancel anytime before your next billing date.</div>
        <p style={p}>Group programs and Swim Team memberships are billed monthly and renew automatically each month until canceled. The recurring price is disclosed at signup, and you will be notified in advance of any price change. You may cancel at any time before your next billing date from your account dashboard or by contacting us at info@mantasharkaquatics.net; cancellation stops future charges and your membership remains active through the period already paid.</p>

        <h2 style={h2}>9. Check-in &amp; Attendance</h2>
        <p style={p}>Students must check in at the front desk before each lesson, either by QR code or by name. Check-in opens 30 minutes before the scheduled start time and closes when the lesson ends. Attendance records are maintained electronically and are visible in your account dashboard.</p>

        <h2 style={h2}>10. Late Arrivals</h2>
        <p style={p}>Lessons start and end at their scheduled times. Time missed due to late arrival is not made up, and the lesson counts in full, as the coach&rsquo;s time is reserved for your student.</p>

        <h2 style={h2}>11. Student Conduct &amp; Safety</h2>
        <p style={p}>Students must follow all posted pool rules and instructions from coaches and staff at all times. The School reserves the right to remove any student from a lesson for unsafe behavior without refund. Students should not enter the pool area before their scheduled lesson. Parents are not required to remain on premises, except for infant and baby swim programs, where a parent or guardian participates in the water.</p>

        <h2 style={h2}>12. Health Requirements</h2>
        <p style={p}>Students must be in good health to participate. Please do not bring a student to a lesson if they are ill, have an open wound, or have a contagious condition. You must inform us of any medical conditions, allergies, or special needs that may affect the student&rsquo;s safety in the water.</p>

        <h2 style={h2}>13. Termination</h2>
        <p style={p}>We reserve the right to suspend or terminate accounts that violate this agreement, engage in abusive behavior toward staff or other families, or misuse the booking system. Unused points on terminated accounts are refunded according to Section 7 unless the termination results from fraud or abuse.</p>

        <h2 style={h2}>14. Limitation of Liability</h2>
        <p style={p}>To the maximum extent permitted by law, the School&rsquo;s total liability for any claim arising from this agreement or the services shall not exceed the amount you paid for the lesson giving rise to the claim. Participation in swim lessons is also subject to the separate Liability Waiver you accept during registration.</p>

        <h2 style={h2}>15. Governing Law</h2>
        <p style={p}>This agreement is governed by the laws of the State of California. Any disputes shall be resolved in the state or federal courts located in California.</p>

        <h2 style={h2}>16. Changes to This Agreement</h2>
        <p style={p}>We may update this User Agreement from time to time. Material changes will be communicated by email or through your account dashboard, and continued use of the services after notice constitutes acceptance. The version you accepted is recorded with your account.</p>

        <h2 style={h2}>17. Contact</h2>
        <p style={p}>Questions about this agreement may be directed to info@mantasharkaquatics.net.</p>
      </div>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;900&display=swap');`}</style>
    </div>
  )
}
