import { LEGAL_VERSIONS } from '@/lib/legal'

export const metadata = { title: 'Terms of Service — Manta Shark Aquatics' }

export default function Page() {
  return (
    <div style={{ minHeight: '100vh', background: '#111d38', padding: '60px 20px' }}>
      <div style={{ maxWidth: '760px', margin: '0 auto' }}>
        <p style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase', color: '#c9a84c', marginBottom: '8px' }}>Manta Shark Aquatics</p>
        <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: '34px', fontWeight: 900, color: '#fff', margin: '0 0 6px' }}>Terms of Service</h1>
        <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.4)', margin: '0 0 8px' }}>The agreement governing your account, bookings, and lessons.</p>
        <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.35)', margin: '0 0 24px' }}>Version: {LEGAL_VERSIONS.terms} · Last updated July 2, 2026</p>
        <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: '20px', fontWeight: 700, color: '#c9a84c', margin: '32px 0 12px' }}>1. Acceptance of Terms</h2>
        <p style={{ fontSize: '14px', lineHeight: 1.8, color: 'rgba(255,255,255,0.75)', margin: '0 0 12px' }}>By creating an account with Manta Shark Aquatics (“we,” “us,” or “the School”), you agree to be bound by these Terms of Service. If you do not agree, please do not register or use our services. These terms apply to the parent or legal guardian creating the account and to all students enrolled under that account.</p>
        <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: '20px', fontWeight: 700, color: '#c9a84c', margin: '32px 0 12px' }}>2. Registration & Account</h2>
        <p style={{ fontSize: '14px', lineHeight: 1.8, color: 'rgba(255,255,255,0.75)', margin: '0 0 12px' }}>You must provide accurate, current information during registration, including verified email and phone number. You are responsible for maintaining the confidentiality of your account credentials and for all activity under your account. Accounts may only be created by a parent or legal guardian aged 18 or older.</p>
        <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: '20px', fontWeight: 700, color: '#c9a84c', margin: '32px 0 12px' }}>3. Lesson Credits & Payments</h2>
        <p style={{ fontSize: '14px', lineHeight: 1.8, color: 'rgba(255,255,255,0.75)', margin: '0 0 12px' }}>Lessons are purchased as credit packages. Credits are shared across all students under the same family account and are consumed oldest-first. All payments are processed securely through Stripe. Prices are as listed on our Plans page at the time of purchase. Credits are non-transferable to other family accounts and have no cash value.</p>
        <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: '20px', fontWeight: 700, color: '#c9a84c', margin: '32px 0 12px' }}>4. Booking, Cancellation & Rescheduling</h2>
        <p style={{ fontSize: '14px', lineHeight: 1.8, color: 'rgba(255,255,255,0.75)', margin: '0 0 12px' }}>Lessons may be booked through your account dashboard subject to availability. Cancellations or reschedule requests must be made at least 24 hours before the scheduled lesson start time. Cancellations made within 24 hours of the lesson are not eligible for refund, credit return, or rescheduling. No-shows are treated as completed lessons and the credit is forfeited.</p>
        <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: '20px', fontWeight: 700, color: '#c9a84c', margin: '32px 0 12px' }}>5. Check-in & Attendance</h2>
        <p style={{ fontSize: '14px', lineHeight: 1.8, color: 'rgba(255,255,255,0.75)', margin: '0 0 12px' }}>Students must check in at the front desk before each lesson, either by QR code or by name. Check-in opens 30 minutes before the scheduled start time and closes when the lesson ends. Attendance records are maintained electronically and are visible in your account dashboard.</p>
        <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: '20px', fontWeight: 700, color: '#c9a84c', margin: '32px 0 12px' }}>6. Student Conduct & Safety</h2>
        <p style={{ fontSize: '14px', lineHeight: 1.8, color: 'rgba(255,255,255,0.75)', margin: '0 0 12px' }}>Students must follow all posted pool rules and instructions from coaches and staff at all times. The School reserves the right to remove any student from a lesson for unsafe behavior without refund. Students should not enter the pool area before their scheduled lesson. A parent or guardian must remain on premises for students under a School-designated age.</p>
        <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: '20px', fontWeight: 700, color: '#c9a84c', margin: '32px 0 12px' }}>7. Health Requirements</h2>
        <p style={{ fontSize: '14px', lineHeight: 1.8, color: 'rgba(255,255,255,0.75)', margin: '0 0 12px' }}>Students must be in good health to participate. Please do not bring a student to a lesson if they are ill, have an open wound, or have a contagious condition. You must inform us of any medical conditions, allergies, or special needs that may affect the student’s safety in the water.</p>
        <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: '20px', fontWeight: 700, color: '#c9a84c', margin: '32px 0 12px' }}>8. Termination</h2>
        <p style={{ fontSize: '14px', lineHeight: 1.8, color: 'rgba(255,255,255,0.75)', margin: '0 0 12px' }}>We reserve the right to suspend or terminate accounts that violate these terms, engage in abusive behavior toward staff or other families, or misuse the booking system. Unused credits on terminated accounts may be refunded at the School’s discretion, less any applicable fees.</p>
        <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: '20px', fontWeight: 700, color: '#c9a84c', margin: '32px 0 12px' }}>9. Limitation of Liability</h2>
        <p style={{ fontSize: '14px', lineHeight: 1.8, color: 'rgba(255,255,255,0.75)', margin: '0 0 12px' }}>To the maximum extent permitted by law, the School’s total liability for any claim arising from these terms or the services shall not exceed the amount you paid for the lesson package giving rise to the claim. Participation in swim lessons is also subject to the separate Liability Waiver you accept during registration.</p>
        <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: '20px', fontWeight: 700, color: '#c9a84c', margin: '32px 0 12px' }}>10. Changes to These Terms</h2>
        <p style={{ fontSize: '14px', lineHeight: 1.8, color: 'rgba(255,255,255,0.75)', margin: '0 0 12px' }}>We may update these Terms of Service from time to time. Material changes will be communicated by email or through your account dashboard, and continued use of the services after notice constitutes acceptance. The version you accepted is recorded with your account.</p>
        <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: '20px', fontWeight: 700, color: '#c9a84c', margin: '32px 0 12px' }}>11. Contact</h2>
        <p style={{ fontSize: '14px', lineHeight: 1.8, color: 'rgba(255,255,255,0.75)', margin: '0 0 12px' }}>Questions about these terms may be directed to info@mantasharkaquatics.net.</p>
      </div>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;900&display=swap');`}</style>
    </div>
  )
}
