const GOLD = '#c9a84c'
const NAVY = '#1a2744'
const DARK = '#111d38'

const FACTS = [
  { k: 'Pay', v: '$20–55/hr' },
  { k: 'Type', v: 'Part-time, W-2' },
  { k: 'Location', v: 'California' },
  { k: 'Training', v: 'Paid' },
]

const BACKGROUNDS = [
  'Competitive swimming', 'Recreational swimming', 'Water polo', 'Lifeguarding',
  'Swim instruction', 'Kinesiology', 'Exercise science', 'Education',
  'Psychology', 'Child development', 'ABA and special needs', 'Youth sports coaching',
]

const DUTIES = [
  'Teach private, semi-private and small-group lessons, based on your experience and readiness',
  'Build water confidence, safety skills, stroke technique and endurance',
  'Adapt to each student’s level, personality and learning needs',
  'Keep close supervision and a safe teaching environment at all times',
  'Motivate students with positive, clear, age-appropriate coaching',
  'Communicate with parents about student progress',
  'Take part in ongoing training and professional development',
  'Work with our swim team, depending on experience and interest',
]

const QUALS = [
  'Previous swimming experience is required',
  'Strong swimming ability and confidence in the water',
  'Competitive swimming experience is a strong plus',
  'Comfortable and enthusiastic working with children',
  'Dependable, punctual and professional',
  'Clear communication with students, parents and other coaches',
  'Open to coaching and feedback',
  'Teaching experience preferred but not required',
  'CPR, First Aid, AED or lifeguard certification is a plus — we can discuss certification options if you do not have them',
]

const BENEFITS = [
  '401(k)', '401(k) matching', 'Flexible schedule', 'Paid training',
  'On-the-job training', 'Professional development assistance',
  'Opportunities for advancement', 'Referral program',
]

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ maxWidth: '860px', margin: '0 auto', padding: '0 24px 44px' }}>
      <h2 style={{ fontSize: '24px', fontWeight: 700, margin: '0 0 16px' }}>{title}</h2>
      {children}
    </section>
  )
}

const P: React.CSSProperties = { fontSize: '16px', lineHeight: 1.85, color: 'rgba(255,255,255,0.72)', margin: '0 0 14px' }
const UL: React.CSSProperties = { margin: 0, padding: '0 0 0 22px', color: 'rgba(255,255,255,0.72)', fontSize: '15px', lineHeight: 2 }

export default function CareersContent() {
  return (
    <main style={{ background: DARK, color: '#fff' }}>

      <section style={{ maxWidth: '860px', margin: '0 auto', padding: '72px 24px 36px' }}>
        <div style={{ fontSize: '12px', letterSpacing: '2px', color: GOLD, marginBottom: '16px' }}>NOW HIRING</div>
        <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: '42px', lineHeight: 1.15, margin: '0 0 20px' }}>
          Swim instructor jobs in California
        </h1>
        <p style={{ fontSize: '18px', lineHeight: 1.7, color: 'rgba(255,255,255,0.75)', maxWidth: '640px', margin: '0 0 28px' }}>
          Manta Shark Aquatics is hiring swim coaches. If you are a strong swimmer who enjoys
          working with children, you do not need a teaching certification to start. We train you,
          and the training is paid.
        </p>
        <a href="#apply" style={{ display: 'inline-block', background: GOLD, color: DARK, fontSize: '15px', fontWeight: 700, padding: '13px 30px', borderRadius: '10px', textDecoration: 'none' }}>
          Apply now
        </a>
      </section>

      <section style={{ maxWidth: '860px', margin: '0 auto 44px', padding: '0 24px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1px', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '14px', overflow: 'hidden' }}>
          {FACTS.map(f => (
            <div key={f.k} style={{ background: NAVY, padding: '18px 20px' }}>
              <div style={{ fontSize: '11px', letterSpacing: '1.5px', color: 'rgba(255,255,255,0.4)', marginBottom: '6px' }}>{f.k.toUpperCase()}</div>
              <div style={{ fontSize: '15px', fontWeight: 700, color: GOLD }}>{f.v}</div>
            </div>
          ))}
        </div>
      </section>

      <Section title="About Manta Shark Aquatics">
        <p style={P}>
          We are a growing Southern California swim school built on progress-based, individualized
          instruction. We work with swimmers across every age and ability — from children
          learning their first water skills to advanced swimmers developing stroke, endurance and
          competitive speed.
        </p>
        <p style={{ ...P, margin: 0 }}>
          Our program has grown largely through family referrals and word of mouth, and we are
          looking for motivated, dependable coaches to grow with the team.
        </p>
      </Section>

      <Section title="Who we are looking for">
        <p style={P}>
          We are glad to train candidates who have a strong swimming foundation, enjoy working with
          children, and want to develop as a coach. We especially welcome college students and
          recent graduates studying education, kinesiology, psychology, child development, ABA,
          special needs, sports or coaching.
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', margin: '18px 0 14px' }}>
          {BACKGROUNDS.map(b => (
            <span key={b} style={{ fontSize: '13px', color: 'rgba(255,255,255,0.8)', background: NAVY, border: '1px solid rgba(255,255,255,0.12)', borderRadius: '999px', padding: '6px 14px' }}>{b}</span>
          ))}
        </div>
        <p style={{ ...P, margin: 0 }}>
          Other backgrounds are welcome too. What matters most is your reliability, your ability to
          work with children, your willingness to learn, and your comfort in the water.
        </p>
      </Section>

      <Section title="What you will do">
        <ul style={UL}>{DUTIES.map(d => <li key={d}>{d}</li>)}</ul>
      </Section>

      <Section title="Qualifications">
        <ul style={UL}>{QUALS.map(q => <li key={q}>{q}</li>)}</ul>
      </Section>

      <Section title="Training and development">
        <p style={P}>
          Paid training is available. Selected candidates begin training after the interview and
          onboarding process. New coaches work alongside experienced Manta Shark instructors,
          observe lessons, receive hands-on coaching, and take on teaching responsibilities as they
          are ready.
        </p>
        <p style={{ ...P, margin: 0 }}>
          We are interested in developing coaches for the long term. Advancement and increased
          compensation follow as instructors gain experience and show strong teaching, reliability
          and leadership.
        </p>
      </Section>

      <Section title="Schedule">
        <p style={P}>
          Many strong candidates
          are college students or have other commitments, so we can work with different
          availability. Specific days, hours, locations and lesson assignments are discussed
          individually.
        </p>
        <p style={{ ...P, margin: 0 }}>
          Once a teaching schedule is set, consistency matters — our students and families
          depend on continuity with their coach.
        </p>
      </Section>

      <Section title="Benefits">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '10px' }}>
          {BENEFITS.map(b => (
            <div key={b} style={{ background: NAVY, border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px', padding: '14px 16px', fontSize: '14px', color: 'rgba(255,255,255,0.85)' }}>{b}</div>
          ))}
        </div>
      </Section>

      <Section title="Why join Manta Shark">
        <p style={P}>
          This can be more than a typical part-time job. If you are interested in teaching,
          psychology, child development, kinesiology, athletics or coaching, swim instruction gives
          you hands-on experience in communication, motivation, skill development, behavior
          management and individualized teaching.
        </p>
        <p style={{ ...P, margin: 0 }}>
          Whether you are already an experienced instructor or a strong swimmer who wants to become
          a great coach, we would like to hear from you.
        </p>
      </Section>

      <section id="apply" style={{ background: NAVY, padding: '56px 24px', textAlign: 'center' }}>
        <h2 style={{ fontSize: '26px', fontWeight: 700, margin: '0 0 10px' }}>Ready to apply?</h2>
        <p style={{ fontSize: '15px', color: 'rgba(255,255,255,0.6)', margin: '0 0 24px', maxWidth: '520px', marginLeft: 'auto', marginRight: 'auto', lineHeight: 1.7 }}>
          Tell us about your swimming background and your availability. We read every application.
        </p>
        <a href="mailto:info@mantasharkaquatics.net?subject=Swim%20instructor%20application"
          style={{ display: 'inline-block', background: GOLD, color: DARK, fontSize: '15px', fontWeight: 700, padding: '13px 30px', borderRadius: '10px', textDecoration: 'none' }}>
          Apply now
        </a>
        <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.4)', margin: '22px 0 0' }}>
          We also accept applications for lifeguard and front desk roles.
        </p>
      </section>

    </main>
  )
}
