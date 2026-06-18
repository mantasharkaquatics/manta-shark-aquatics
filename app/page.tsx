'use client'
import Link from 'next/link'
import Image from 'next/image'

export default function HomePage() {
  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,700;0,900;1,700;1,900&family=DM+Sans:wght@400;500;600;700&display=swap');
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'DM Sans', sans-serif; background: #111d38; }

        .wave { position: absolute; bottom: 0; left: -100%; width: 300%; height: 100%; }
        .wave1 { animation: wave-move 8s linear infinite; opacity: 0.15; }
        .wave2 { animation: wave-move 12s linear infinite reverse; opacity: 0.1; bottom: 10px; }
        .wave3 { animation: wave-move 6s linear infinite; opacity: 0.08; bottom: 20px; }
        @keyframes wave-move { 0% { transform: translateX(0); } 100% { transform: translateX(33.33%); } }

        .bubble { position: absolute; border-radius: 50%; background: rgba(201,168,76,0.25); border: 2px solid rgba(201,168,76,0.5); animation: float-up linear infinite; }
        @keyframes float-up { 0% { transform: translateY(0) scale(1); opacity: 0.9; } 100% { transform: translateY(-520px) scale(0.2); opacity: 0; } }

        .swimmer-dot { position: absolute; width: 24px; height: 14px; border-radius: 7px; top: -6px; background: #c9a84c; animation: swim linear infinite; }
        @keyframes swim { 0% { left: -5%; } 100% { left: 105%; } }

        .program-card { border: 1px solid #e5e7eb; border-radius: 16px; padding: 28px 20px; text-align: center; cursor: pointer; transition: all 0.25s; }
        .program-card:hover { border-color: #c9a84c; }
        .program-card.open { border-color: #c9a84c; box-shadow: 0 8px 24px rgba(201,168,76,0.15); }
        .program-desc { max-height: 0; overflow: hidden; transition: max-height 0.35s ease, opacity 0.35s ease, margin-top 0.35s ease; opacity: 0; margin-top: 0; font-size: 13px; color: #6b7280; line-height: 1.6; }
        .program-card.open .program-desc { max-height: 100px; opacity: 1; margin-top: 10px; }
        .program-hint { font-size: 11px; color: #c9a84c; margin-top: 8px; opacity: 0.6; transition: opacity 0.2s; }
        .program-card.open .program-hint { opacity: 0; }

        .tcard { display: none; grid-template-columns: 1fr 1fr 1fr; gap: 16px; }
        .tcard.active { display: grid; }
        .titem { background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 16px; padding: 24px; display: flex; flex-direction: column; }
        .ttext { flex: 1; font-size: 13px; color: rgba(255,255,255,0.8); line-height: 1.7; }
        .tauthor { margin-top: 20px; display: flex; align-items: center; gap: 10px; }
        .tavatar { width: 36px; height: 36px; border-radius: 50%; background: #c9a84c; display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 700; color: #111d38; flex-shrink: 0; }
        .dot { width: 8px; height: 8px; border-radius: 50%; background: rgba(255,255,255,0.3); cursor: pointer; transition: all 0.2s; border: none; }
        .dot.active { background: #c9a84c; width: 24px; border-radius: 4px; }
        .carousel-btn { width: 40px; height: 40px; border-radius: 50%; border: 1px solid rgba(255,255,255,0.3); background: transparent; color: white; cursor: pointer; font-size: 18px; transition: all 0.2s; }
        .carousel-btn:hover { background: #c9a84c; border-color: #c9a84c; color: #111d38; }

        @media (max-width: 768px) {
          .hero-nav-links { display: none; }
          .mobile-menu-btn { display: flex !important; }
          .hero-title { font-size: 32px !important; }
          .hero-sub { font-size: 14px !important; }
          .hero-stats { flex-wrap: wrap; gap: 10px !important; }
          .hero-stat { flex: 1; min-width: 120px; }
          .program-grid { grid-template-columns: 1fr 1fr !important; }
          .tcard.active { grid-template-columns: 1fr !important; }
          .tcard.active .titem:not(:first-child) { display: none; }
          .cta-btns { flex-direction: column; align-items: center; }
          .footer-grid { grid-template-columns: 1fr !important; gap: 32px !important; }
          .hero-content { padding: 32px 20px 100px !important; }
          .section-pad { padding: 48px 20px !important; }
          .nav-pad { padding: 14px 20px !important; }
        }
      `}</style>

      {/* NAVBAR */}
      <nav style={{ background: '#111d38', borderBottom: '1px solid rgba(255,255,255,0.08)', position: 'sticky', top: 0, zIndex: 100 }}>
        <div className="nav-pad" style={{ padding: '14px 48px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', maxWidth: '1200px', margin: '0 auto' }}>
          <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: '10px', textDecoration: 'none' }}>
            <Image src="/logo.png" alt="Manta Shark Aquatics" width={56} height={56} />
            <div>
              <div style={{ fontFamily: "'Playfair Display', serif", fontSize: '17px', fontWeight: 700, color: 'white', lineHeight: 1.2 }}>Manta Shark</div>
              <div style={{ fontSize: '10px', fontWeight: 600, color: '#c9a84c', letterSpacing: '2px', textTransform: 'uppercase' }}>Aquatics</div>
            </div>
          </Link>
          <div className="hero-nav-links" style={{ display: 'flex', gap: '24px', alignItems: 'center' }}>
            {['Services', 'Swim Levels', 'Swim Plans', 'About Us', 'Policies'].map(item => (
              <Link key={item} href={`/${item.toLowerCase().replace(/ /g, '-')}`} style={{ color: 'rgba(255,255,255,0.7)', fontSize: '14px', fontWeight: 500, textDecoration: 'none' }}>{item}</Link>
            ))}
            <Link href="/login" style={{ background: '#c9a84c', color: '#111d38', padding: '8px 20px', borderRadius: '8px', fontSize: '14px', fontWeight: 700, textDecoration: 'none' }}>Sign In</Link>
          </div>
        </div>
      </nav>

      {/* HERO */}
      <section style={{ background: '#111d38', position: 'relative', minHeight: '500px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div className="hero-content" style={{ position: 'relative', zIndex: 5, textAlign: 'center', padding: '56px 48px 130px' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '3px', textTransform: 'uppercase', color: '#c9a84c', marginBottom: '16px' }}>Serious · Structured · Science-Based</div>
          <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: '52px', fontWeight: 900, color: 'white', lineHeight: 1.1, marginBottom: '16px' }}>
            Serious About Swimming.<br /><em style={{ color: '#c9a84c' }}>Designed for Peace of Mind.</em>
          </h1>
          <p className="hero-sub" style={{ fontSize: '16px', color: 'rgba(255,255,255,0.6)', maxWidth: '540px', margin: '0 auto 32px', lineHeight: 1.7 }}>
            We combine professional swim coaching with expertise in education, psychology, and child development — delivering safe, structured, and progression-based instruction for every student.
          </p>
          <div className="hero-stats" style={{ display: 'flex', justifyContent: 'center', gap: '16px', marginBottom: '32px' }}>
            {[['5.0★', 'Average Rating'], ['500+', 'Students Coached'], ['100%', 'Progress-Focused']].map(([num, label]) => (
              <div key={label} className="hero-stat" style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '12px', padding: '12px 20px', textAlign: 'center' }}>
                <div style={{ fontSize: '22px', fontWeight: 700, color: '#c9a84c' }}>{num}</div>
                <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)', marginTop: '2px' }}>{label}</div>
              </div>
            ))}
          </div>
          <Link href="/register" style={{ background: '#c9a84c', color: '#111d38', padding: '16px 40px', borderRadius: '10px', fontSize: '14px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', textDecoration: 'none', display: 'inline-block' }}>Create Account</Link>
        </div>

        {/* Waves */}
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '200px', overflow: 'hidden' }}>
          <svg className="wave wave1" viewBox="0 0 1200 200" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none"><path d="M0,100 C150,180 350,0 600,100 C850,200 1050,20 1200,100 L1200,200 L0,200 Z" fill="#c9a84c"/></svg>
          <svg className="wave wave2" viewBox="0 0 1200 200" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none"><path d="M0,80 C200,160 400,20 600,80 C800,140 1000,40 1200,80 L1200,200 L0,200 Z" fill="#1a2744"/></svg>
          <svg className="wave wave3" viewBox="0 0 1200 200" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none"><path d="M0,120 C100,60 300,180 600,120 C900,60 1100,160 1200,120 L1200,200 L0,200 Z" fill="#0d1529"/></svg>
        </div>

        {/* Bubbles */}
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '200px', overflow: 'hidden', pointerEvents: 'none' }}>
          {[{w:12,l:'10%',d:'6s',del:'0s'},{w:8,l:'25%',d:'8s',del:'2s'},{w:16,l:'60%',d:'7s',del:'1s'},{w:10,l:'80%',d:'9s',del:'3s'},{w:6,l:'45%',d:'5s',del:'4s'}].map((b,i) => (
            <div key={i} className="bubble" style={{ width: b.w, height: b.w, left: b.l, bottom: '20px', animationDuration: b.d, animationDelay: b.del }} />
          ))}
        </div>
      </section>

      {/* SWIM LANES */}
      <div style={{ background: '#0d1529', padding: '0', overflow: 'hidden' }}>
        <style>{`
          @keyframes swim-a { 0% { left: -80px; } 100% { left: 110%; } }
          @keyframes swim-b { 0% { left: -80px; } 100% { left: 110%; } }
          @keyframes swim-c { 0% { left: -80px; } 100% { left: 110%; } }
          .sw { position: absolute; top: 50%; transform: translateY(-50%); }
          .sw-a { animation: swim-a 6s linear infinite; }
          .sw-b { animation: swim-b 8s linear infinite; animation-delay: -3s; }
          .sw-c { animation: swim-c 10s linear infinite; animation-delay: -6s; }
          .lane-rope { height: 3px; background: repeating-linear-gradient(90deg,#c9a84c 0,#c9a84c 12px,#1a3a5c 12px,#1a3a5c 20px); opacity: 0.6; }
          .lane-water { background: #0a2540; position: relative; height: 44px; overflow: hidden; }
        `}</style>
        <div className="lane-rope" />
        <div className="lane-water">
          <div className="sw sw-a">
            <svg width="72" height="28" viewBox="0 0 72 28">
              <circle cx="14" cy="10" r="5" fill="#f5c5a0"/>
              <rect x="8" y="13" width="20" height="8" rx="4" fill="#c9a84c"/>
              <line x1="28" y1="14" x2="48" y2="10" stroke="#f5c5a0" strokeWidth="3" strokeLinecap="round"><animate attributeName="y2" values="10;18;10" dur="0.6s" repeatCount="indefinite"/><animate attributeName="x2" values="48;44;48" dur="0.6s" repeatCount="indefinite"/></line>
              <line x1="28" y1="16" x2="50" y2="20" stroke="#f5c5a0" strokeWidth="3" strokeLinecap="round"><animate attributeName="y2" values="20;12;20" dur="0.6s" repeatCount="indefinite"/></line>
              <ellipse cx="60" cy="14" rx="10" ry="4" fill="#4ab3e8" opacity="0.5"><animate attributeName="rx" values="10;14;10" dur="0.6s" repeatCount="indefinite"/><animate attributeName="opacity" values="0.5;0.2;0.5" dur="0.6s" repeatCount="indefinite"/></ellipse>
            </svg>
          </div>
        </div>
        <div className="lane-rope" />
        <div className="lane-water">
          <div className="sw sw-b">
            <svg width="72" height="28" viewBox="0 0 72 28">
              <circle cx="14" cy="10" r="5" fill="#f5c5a0" opacity="0.85"/>
              <rect x="8" y="13" width="20" height="8" rx="4" fill="#2255aa" opacity="0.85"/>
              <line x1="28" y1="14" x2="48" y2="10" stroke="#f5c5a0" strokeWidth="3" strokeLinecap="round" opacity="0.85"><animate attributeName="y2" values="10;18;10" dur="0.8s" repeatCount="indefinite"/></line>
              <line x1="28" y1="16" x2="50" y2="20" stroke="#f5c5a0" strokeWidth="3" strokeLinecap="round" opacity="0.85"><animate attributeName="y2" values="20;12;20" dur="0.8s" repeatCount="indefinite"/></line>
              <ellipse cx="60" cy="14" rx="10" ry="4" fill="#4ab3e8" opacity="0.4"><animate attributeName="rx" values="10;13;10" dur="0.8s" repeatCount="indefinite"/></ellipse>
            </svg>
          </div>
        </div>
        <div className="lane-rope" />
        <div className="lane-water">
          <div className="sw sw-c">
            <svg width="72" height="28" viewBox="0 0 72 28">
              <circle cx="14" cy="10" r="5" fill="#f5c5a0" opacity="0.65"/>
              <rect x="8" y="13" width="20" height="8" rx="4" fill="#aa2255" opacity="0.65"/>
              <line x1="28" y1="14" x2="48" y2="10" stroke="#f5c5a0" strokeWidth="3" strokeLinecap="round" opacity="0.65"><animate attributeName="y2" values="10;18;10" dur="1s" repeatCount="indefinite"/></line>
              <line x1="28" y1="16" x2="50" y2="20" stroke="#f5c5a0" strokeWidth="3" strokeLinecap="round" opacity="0.65"><animate attributeName="y2" values="20;12;20" dur="1s" repeatCount="indefinite"/></line>
              <ellipse cx="60" cy="14" rx="10" ry="4" fill="#4ab3e8" opacity="0.3"><animate attributeName="rx" values="10;12;10" dur="1s" repeatCount="indefinite"/></ellipse>
            </svg>
          </div>
        </div>
        <div className="lane-rope" />
      </div>

      {/* PROGRAMS */}
      <section className="section-pad" style={{ background: 'white', padding: '64px 48px' }}>
        <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '3px', textTransform: 'uppercase', color: '#c9a84c', textAlign: 'center', marginBottom: '8px' }}>What We Offer</div>
          <h2 style={{ fontSize: '32px', fontWeight: 700, color: '#111d38', textAlign: 'center', marginBottom: '40px' }}>Our Programs</h2>
          <div className="program-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }} id="program-grid">
            {[
              { icon: '🏊', name: '1-on-1 Lessons', desc: `30-minute private sessions tailored entirely to your child's pace and goals.` },
              { icon: '👫', name: '1-on-2 Lessons', desc: '30-minute semi-private sessions — parent-arranged pairs for a shared experience.' },
              { icon: '👥', name: 'Group (1-on-4)', desc: '30-minute group classes with real-time availability. Book online, limited spots.' },
              { icon: '🏅', name: 'Swim Team', desc: '90-minute competitive training. Mon & Wed 6–7:30 PM. Max 24 swimmers.' },
            ].map((p, i) => (
              <div key={i} className="program-card" onClick={(e) => e.currentTarget.classList.toggle('open')}>
                <div style={{ fontSize: '36px', marginBottom: '14px' }}>{p.icon}</div>
                <div style={{ fontSize: '16px', fontWeight: 700, color: '#111d38' }}>{p.name}</div>
                <div className="program-desc">{p.desc}</div>
                <div className="program-hint">Tap to learn more</div>
              </div>
            ))}
          </div>
          <div style={{ textAlign: 'center', marginTop: '40px' }}>
            <Link href="/services" style={{ display: 'inline-block', padding: '12px 32px', border: '1px solid #111d38', borderRadius: '10px', color: '#111d38', fontWeight: 600, fontSize: '14px', textDecoration: 'none' }}>View All Services</Link>
          </div>
        </div>
      </section>

      {/* TESTIMONIALS */}
      <section className="section-pad" style={{ background: '#1a2744', padding: '64px 48px' }} id="testimonials-section">
        <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '3px', textTransform: 'uppercase', color: '#c9a84c', textAlign: 'center', marginBottom: '8px' }}>Testimonials</div>
          <h2 style={{ fontSize: '32px', fontWeight: 700, color: 'white', textAlign: 'center', marginBottom: '8px' }}>Our Parents & Swimmers Love Us!</h2>
          <div style={{ textAlign: 'center', color: '#c9a84c', fontSize: '14px', marginBottom: '40px' }}>★★★★★ 5.0 · 13 reviews</div>

          {[
            [
              { text: 'The consistency of great quality teaching and positive reinforcement encourages children to perform at their best. My kids have improved so much and are now more comfortable in the water.', name: 'Mercy', sub: 'Verified parent' },
              { text: 'We love the coaches. They are patient and caring. The swimming lessons are fun, engaging, and creative. My children look forward to every lesson — and wish they lasted longer!', name: 'Parent', sub: 'Mom of two swimmers' },
              { text: 'Coaches are very professional and know how to teach kids. I also like the fun and friendly learning environment. Teaching lifesaving skills first was something I really appreciated.', name: 'Anonymous', sub: 'Verified parent' },
            ],
            [
              { text: "Coaches' teaching is the best! The effort and love they put in to teach my boys are amazing! My boys look forward to coming back every summer! Patient, knowledgeable, and fun — they make students comfortable in water real quick!", name: 'Shannon', sub: 'Verified parent' },
              { text: 'Coaches are very patient and gentle with kids. We especially appreciate how they correct each stroke and pay attention to technique — not just mindless lap swim. My kids said they learn the most from Coach Ting and Chou!', name: 'Parent', sub: 'Mom of two swimmers' },
              { text: 'The teachers are very friendly, and coaching is focused on details and stroke correction. Our kids really like their swim lessons and have improved greatly after six months.', name: 'Wynne', sub: 'Verified parent' },
            ],
            [
              { text: 'Coaches are very professional. My kids love to go to swim lessons, and her swimming speed has obviously improved.', name: 'Jocelyn', sub: 'Verified parent' },
              { text: 'The coaches are very patient and professional. If your kids want to become professional swimmers, these coaches are the best.', name: 'Parent', sub: 'Mom of swimmer' },
              { text: `Coaches have the experience and knowledge to teach students how to swim correctly — they attend to each student's needs. Even students afraid at first eventually adjust and have fun in the water.`, name: 'Amy', sub: 'Verified parent' },
            ],
            [
              { text: 'Students are taught with clear and precise technique. Time is used very efficiently throughout the lesson. All coaches are well qualified, professional, and so kind. My daughter looks forward to swim lessons and is excited to see her coach.', name: 'Parent', sub: 'Mom of one swimmer' },
              { text: 'The coaches are very patient and attend to details with their teaching.', name: 'Parent', sub: 'Mom of one swimmer' },
              { text: 'Thank you! Our kids improved a lot — they love swimming and look forward to every lesson!', name: 'Anonymous', sub: 'Verified parent' },
            ],
          ].map((group, gi) => (
            <div key={gi} className={`tcard${gi === 0 ? ' active' : ''}`} data-slide={gi}>
              {group.map((t, ti) => (
                <div key={ti} className="titem">
                  <div style={{ fontSize: '28px', color: '#c9a84c', marginBottom: '12px', lineHeight: 1 }}>"</div>
                  <div className="ttext">{t.text}</div>
                  <div className="tauthor">
                    <div className="tavatar">{t.name[0]}</div>
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 600, color: 'white' }}>{t.name}</div>
                      <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)' }}>{t.sub}</div>
                      <div style={{ color: '#c9a84c', fontSize: '11px' }}>★★★★★</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ))}

          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '16px', marginTop: '32px' }}>
            <button className="carousel-btn" id="t-prev">&#8592;</button>
            <div style={{ display: 'flex', gap: '8px' }}>
              {[0,1,2,3].map(i => <button key={i} className={`dot${i===0?' active':''}`} data-dot={i} aria-label={`Go to slide ${i+1}`} />)}
            </div>
            <button className="carousel-btn" id="t-next">&#8594;</button>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="section-pad" style={{ background: '#111d38', padding: '64px 48px', textAlign: 'center' }}>
        <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: '36px', fontWeight: 900, color: 'white', marginBottom: '12px' }}>Ready to Get Started?</h2>
        <p style={{ color: 'rgba(255,255,255,0.6)', marginBottom: '32px' }}>Create your family account today and take the first step toward confident, capable swimming.</p>
        <div className="cta-btns" style={{ display: 'flex', gap: '16px', justifyContent: 'center' }}>
          <Link href="/register" style={{ background: '#c9a84c', color: '#111d38', padding: '14px 32px', borderRadius: '10px', fontWeight: 700, textDecoration: 'none', fontSize: '15px' }}>Create Account</Link>
          <Link href="/plans" style={{ background: 'transparent', color: 'white', padding: '14px 32px', borderRadius: '10px', fontWeight: 700, border: '1px solid rgba(255,255,255,0.3)', textDecoration: 'none', fontSize: '15px' }}>View Swim Plans</Link>
        </div>
      </section>

      {/* FOOTER */}
      <footer style={{ background: '#0d1529', padding: '48px 48px 24px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
        <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
          <div className="footer-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '48px', marginBottom: '40px' }}>
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
              {['Services', 'Swim Levels', 'Swim Plans', 'About Us', 'Policies'].map(l => (
                <div key={l} style={{ marginBottom: '8px' }}>
                  <Link href={`/${l.toLowerCase().replace(/ /g, '-')}`} style={{ fontSize: '13px', color: 'rgba(255,255,255,0.5)', textDecoration: 'none' }}>{l}</Link>
                </div>
              ))}
            </div>
            <div>
              <div style={{ fontSize: '12px', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: '#c9a84c', marginBottom: '16px' }}>Contact</div>
              <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.5)', lineHeight: 1.8 }}>
                info@mantasharkaquatics.net<br />
                Brea, California<br />
                Mon–Fri: 3:30–7:30 PM<br />
                Sat–Sun: 8:00 AM–12:00 PM
              </p>
            </div>
          </div>
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '20px', textAlign: 'center', fontSize: '12px', color: 'rgba(255,255,255,0.3)' }}>
            © 2026 Manta Shark Aquatics. All rights reserved.
          </div>
        </div>
      </footer>

      <script dangerouslySetInnerHTML={{ __html: `
        (function() {
          var current = 0;
          var total = 4;
          var timer;

          function goTo(n) {
            document.querySelectorAll('.tcard').forEach(function(el) { el.classList.remove('active'); });
            document.querySelectorAll('.dot').forEach(function(el, i) { el.classList.toggle('active', i === n); });
            document.querySelector('.tcard[data-slide="' + n + '"]').classList.add('active');
            current = n;
            clearInterval(timer);
            timer = setInterval(function() { goTo((current + 1) % total); }, 15000);
          }

          document.getElementById('t-prev').addEventListener('click', function() { goTo((current - 1 + total) % total); });
          document.getElementById('t-next').addEventListener('click', function() { goTo((current + 1) % total); });
          document.querySelectorAll('.dot').forEach(function(el, i) { el.addEventListener('click', function() { goTo(i); }); });

          timer = setInterval(function() { goTo((current + 1) % total); }, 15000);
        })();
      ` }} />
    </>
  )
}
