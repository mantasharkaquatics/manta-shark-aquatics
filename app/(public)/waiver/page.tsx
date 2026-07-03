import { LEGAL_VERSIONS } from '@/lib/legal'

export const metadata = { title: 'Liability Waiver — Manta Shark Aquatics' }

export default function Page() {
  return (
    <div style={{ minHeight: '100vh', background: '#111d38', padding: '60px 20px' }}>
      <div style={{ maxWidth: '760px', margin: '0 auto' }}>
        <p style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase', color: '#c9a84c', marginBottom: '8px' }}>Manta Shark Aquatics</p>
        <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: '34px', fontWeight: 900, color: '#fff', margin: '0 0 6px' }}>Liability Waiver</h1>
        <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.4)', margin: '0 0 8px' }}>Release of liability and assumption of risk for swim instruction.</p>
        <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.35)', margin: '0 0 24px' }}>Version: {LEGAL_VERSIONS.waiver} · Last updated July 2, 2026</p>
        <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: '20px', fontWeight: 700, color: '#c9a84c', margin: '32px 0 12px' }}>Assumption of Risk</h2>
        <p style={{ fontSize: '14px', lineHeight: 1.8, color: 'rgba(255,255,255,0.75)', margin: '0 0 12px' }}>I understand that swimming and swim instruction involve inherent risks, including but not limited to drowning, slips and falls, collisions, muscle strain, and illness from waterborne contaminants. I acknowledge that these risks cannot be entirely eliminated even with proper instruction and supervision, and I voluntarily accept and assume all such risks on behalf of myself and my minor child(ren) enrolled at Manta Shark Aquatics.</p>
        <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: '20px', fontWeight: 700, color: '#c9a84c', margin: '32px 0 12px' }}>Release of Liability</h2>
        <p style={{ fontSize: '14px', lineHeight: 1.8, color: 'rgba(255,255,255,0.75)', margin: '0 0 12px' }}>In consideration of my child(ren) being permitted to participate in swim lessons and related activities, I, on behalf of myself, my child(ren), and our heirs and assigns, hereby release, waive, and discharge Manta Shark Aquatics, its owners, coaches, employees, and agents from any and all claims, demands, or causes of action arising out of or related to any loss, damage, or injury sustained while participating in lessons or while on the premises, to the fullest extent permitted by California law. I understand this release does not apply to gross negligence, recklessness, or intentional misconduct.</p>
        <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: '20px', fontWeight: 700, color: '#c9a84c', margin: '32px 0 12px' }}>Indemnification</h2>
        <p style={{ fontSize: '14px', lineHeight: 1.8, color: 'rgba(255,255,255,0.75)', margin: '0 0 12px' }}>I agree to indemnify and hold harmless Manta Shark Aquatics from any claims brought by or on behalf of my child(ren) arising from participation in lessons, except to the extent caused by the School’s gross negligence or willful misconduct.</p>
        <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: '20px', fontWeight: 700, color: '#c9a84c', margin: '32px 0 12px' }}>Medical Authorization</h2>
        <p style={{ fontSize: '14px', lineHeight: 1.8, color: 'rgba(255,255,255,0.75)', margin: '0 0 12px' }}>In the event of an emergency, I authorize the staff of Manta Shark Aquatics to secure emergency medical treatment for my child(ren), including contacting emergency services. I understand that I am responsible for any resulting medical expenses. I confirm that I have disclosed all relevant medical conditions during registration.</p>
        <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: '20px', fontWeight: 700, color: '#c9a84c', margin: '32px 0 12px' }}>Swim Ability Acknowledgment</h2>
        <p style={{ fontSize: '14px', lineHeight: 1.8, color: 'rgba(255,255,255,0.75)', margin: '0 0 12px' }}>I understand that swim lessons do not make a child “drown-proof” and that constant supervision around water remains essential outside of lessons. Level assignments reflect instructional progress only and are not a certification of unsupervised swim ability.</p>
        <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: '20px', fontWeight: 700, color: '#c9a84c', margin: '32px 0 12px' }}>Acknowledgment</h2>
        <p style={{ fontSize: '14px', lineHeight: 1.8, color: 'rgba(255,255,255,0.75)', margin: '0 0 12px' }}>I confirm that I am the parent or legal guardian of the enrolled student(s), that I am at least 18 years old, that I have read and understood this waiver, and that I accept it voluntarily by checking the corresponding box during registration. My electronic acceptance has the same legal effect as a handwritten signature.</p>
      </div>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;900&display=swap');`}</style>
    </div>
  )
}
