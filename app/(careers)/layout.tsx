import CareersNav from './CareersNav'

const DARK = '#111d38'

export default function CareersLayout({ children }: { children: React.ReactNode }) {
  return (
    <div lang="en" style={{ background: DARK, minHeight: '100vh' }}>
      <CareersNav />
      {children}
      <footer
        style={{
          background: DARK,
          borderTop: '1px solid rgba(255,255,255,0.08)',
          padding: '28px 24px',
          textAlign: 'center',
          fontSize: '13px',
          color: 'rgba(255,255,255,0.45)',
        }}
      >
        Manta Shark Aquatics · California ·{' '}
        <a href="/" style={{ color: 'rgba(255,255,255,0.6)' }}>Main site</a>
      </footer>
    </div>
  )
}
