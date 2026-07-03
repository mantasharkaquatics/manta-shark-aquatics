import { LEGAL_VERSIONS } from '@/lib/legal'

export const metadata = { title: 'Photo & Video Release — Manta Shark Aquatics' }

export default function Page() {
  return (
    <div style={{ minHeight: '100vh', background: '#111d38', padding: '60px 20px' }}>
      <div style={{ maxWidth: '760px', margin: '0 auto' }}>
        <p style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase', color: '#c9a84c', marginBottom: '8px' }}>Manta Shark Aquatics</p>
        <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: '34px', fontWeight: 900, color: '#fff', margin: '0 0 6px' }}>Photo & Video Release</h1>
        <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.4)', margin: '0 0 8px' }}>Optional consent for promotional use of lesson photos and videos.</p>
        <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.35)', margin: '0 0 24px' }}>Version: {LEGAL_VERSIONS.media} · Last updated July 2, 2026</p>
        <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: '20px', fontWeight: 700, color: '#c9a84c', margin: '32px 0 12px' }}>Grant of Permission</h2>
        <p style={{ fontSize: '14px', lineHeight: 1.8, color: 'rgba(255,255,255,0.75)', margin: '0 0 12px' }}>By opting in, I grant Manta Shark Aquatics permission to photograph and video record my child(ren) during lessons and School events, and to use such media for the School’s promotional purposes, including the School website, social media accounts, and printed marketing materials.</p>
        <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: '20px', fontWeight: 700, color: '#c9a84c', margin: '32px 0 12px' }}>Conditions</h2>
        <p style={{ fontSize: '14px', lineHeight: 1.8, color: 'rgba(255,255,255,0.75)', margin: '0 0 12px' }}>Media will never be sold to third parties. Student full names will not be published alongside images without separate written consent. No compensation will be provided for the use of such media.</p>
        <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: '20px', fontWeight: 700, color: '#c9a84c', margin: '32px 0 12px' }}>Optional & Revocable</h2>
        <p style={{ fontSize: '14px', lineHeight: 1.8, color: 'rgba(255,255,255,0.75)', margin: '0 0 12px' }}>This release is entirely optional and is not a condition of enrollment. You may opt in or out at registration, and you may revoke consent at any time by emailing info@mantasharkaquatics.net, after which we will cease new use of your child’s media and remove identified images from our active channels within a reasonable time.</p>
      </div>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;900&display=swap');`}</style>
    </div>
  )
}
