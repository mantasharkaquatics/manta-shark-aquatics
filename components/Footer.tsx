import Image from 'next/image'
import Link from 'next/link'

const LINKS = [
  { label: 'Services', href: '/services' },
  { label: 'Swim Levels', href: '/levels' },
  { label: 'Swim Plans', href: '/plans' },
  { label: 'About Us', href: '/about' },
]

const LEGAL = [
  { label: 'User Agreement', href: '/terms' },
  { label: 'Privacy Policy', href: '/privacy-policy' },
  { label: 'Liability Waiver', href: '/waiver' },
  { label: 'Photo & Video Release', href: '/media-release' },
  { label: 'SMS Terms', href: '/sms-terms' },
]

export default function Footer() {
  return (
    <footer style={{ background: '#0d1529', padding: '48px 48px 24px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
      <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
        <div className="footer-grid" style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr 1fr', gap: '40px', marginBottom: '40px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
              <Image src="/logo.png" alt="Manta Shark Aquatics" width={48} height={48} />
              <div>
                <div style={{ fontFamily: "'Playfair Display', serif", fontSize: '16px', fontWeight: 700, color: 'white' }}>Manta Shark Aquatics</div>
                <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)' }}>Southern California</div>
              </div>
            </div>
            <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.4)', lineHeight: 1.7 }}>Professional swim coaching with expertise in education, psychology, and child development.</p>
          </div>
          <div>
            <div style={{ fontSize: '12px', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: '#c9a84c', marginBottom: '16px' }}>Links</div>
            {LINKS.map(l => (
              <div key={l.label} style={{ marginBottom: '8px' }}>
                <Link href={l.href} style={{ fontSize: '13px', color: 'rgba(255,255,255,0.5)', textDecoration: 'none' }}>{l.label}</Link>
              </div>
            ))}
          </div>
          <div>
            <div style={{ fontSize: '12px', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: '#c9a84c', marginBottom: '16px' }}>Legal</div>
            {LEGAL.map(l => (
              <div key={l.label} style={{ marginBottom: '8px' }}>
                <Link href={l.href} style={{ fontSize: '13px', color: 'rgba(255,255,255,0.5)', textDecoration: 'none' }}>{l.label}</Link>
              </div>
            ))}
          </div>
          <div>
            <div style={{ fontSize: '12px', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: '#c9a84c', marginBottom: '16px' }}>Contact</div>
            <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.5)', lineHeight: 1.8 }}>
              info@mantasharkaquatics.net<br />
              Brea, California<br />
              Open daily · 6:00 AM &ndash; 9:00 PM
            </p>
          </div>
        </div>
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '20px', textAlign: 'center', fontSize: '12px', color: 'rgba(255,255,255,0.3)' }}>
          &copy; 2026 Manta Shark Aquatics. All rights reserved.
        </div>
      </div>
    </footer>
  )
}
