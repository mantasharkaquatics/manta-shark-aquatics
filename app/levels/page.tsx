'use client'

import { useState } from 'react'
import Link from 'next/link'
import Navbar from '@/components/Navbar'

const levels = [
  {
    num: 1,
    name: 'Water Intro',
    color: '#e05a4a',
    tagline: 'Building trust, comfort, and safety in the water.',
    desc: 'At this level, your child will learn how to enjoy the water safely while developing the foundation for swimming skills through playful, supportive instruction.',
    goals: [
      'Enter and exit the pool safely using safety techniques',
      'Blow bubbles and submerge their entire face with confidence',
      'Identify pool safety zones (shallow vs. deep)',
      'Float on their front and back with light assistance',
      'Move from floating to standing position independently',
    ],
  },
  {
    num: 2,
    name: 'Water Comfort',
    color: '#e8883a',
    tagline: 'Building early water confidence through kicking, floating, and breath control.',
    desc: 'At this level, your child will build foundational water skills through kicking, breath control, and body positioning, while gaining confidence with floating and shallow water movement.',
    goals: [
      'Demonstrate proper kicking motion on land for 20 seconds',
      'Kick with a kickboard for 7 yards with proper breathing and body position',
      'Kick on their back with a kickboard for 5 yards while keeping their face up and body afloat',
      'Flip back and forth while hugging the kickboard 3 times with control',
      'Push off the wall and maintain a horizontal float for 5 seconds',
      'Perform 10 shallow water bubble jumps with controlled breathing',
      'Hold their breath for 10 seconds underwater',
      'Retrieve an object from a depth of 2–3 feet',
    ],
  },
  {
    num: 3,
    name: 'Pool Safety',
    color: '#d4a825',
    tagline: 'Mastering basic swim independence and essential water safety skills.',
    desc: 'At this level, your child will build confidence moving through the water unassisted while learning critical safety techniques like breath control, floating, and survival skills.',
    goals: [
      'Demonstrate proper kicking technique: small, fast flutter kicks with straight legs and pointed toes',
      'Float independently on their back (starfish position) for 20 seconds',
      'Perform 10 bubble jumps in deeper water (4–5 ft.) to practice breath control',
      'Jump in and retrieve an object from 4–5 ft. depth',
      'Swim 15 yards independently and comfortably using BBQ swim technique',
      'Tread water for 15 seconds while keeping their head above water',
    ],
  },
  {
    num: 4,
    name: 'Beginner',
    color: '#4caf72',
    tagline: 'Building stroke fundamentals and early endurance.',
    desc: 'At this level, your child will begin swimming independently using proper technique, with a focus on freestyle, backstroke, and swimming with confidence in different conditions.',
    goals: [
      'Demonstrate proper streamline push-off',
      'Swim 15 meters of freestyle with rotary (side) breathing, strong flutter kicks, and using straight-arm pulls and recovery',
      'Kick on their back for 15 meters while keeping a straight body line',
      'Swim 15 meters of early backstroke with proper technique (straight-arm recovery, pinky-first entry)',
      'Float on their back independently for at least 30 seconds',
      'Swim 7 meters without goggles while wearing a t-shirt to practice water safety skills',
    ],
  },
  {
    num: 5,
    name: 'Intermediate',
    color: '#4a90c4',
    tagline: 'Improving stroke technique and building stamina.',
    desc: 'At this level, your child will gain more endurance while refining freestyle and backstroke. They will also be introduced to butterfly and more challenging swim tasks.',
    goals: [
      'Swim 25 meters of freestyle with rotary breathing, breath control (2-stroke and 3-stroke breathing), and high-elbow techniques',
      'Perform 5 meters of underwater freestyle kick starting below the surface',
      'Kick 25 meters on their back with proper streamline body position',
      'Swim 15 meters of backstroke using alternating arms and proper timing',
      'Swim 25 meters of butterfly kick with basic coordination',
      'Swim 15 meters without goggles while wearing a short-sleeved shirt',
    ],
  },
  {
    num: 6,
    name: 'Advanced',
    color: '#7b5ea7',
    tagline: 'Mastering technique and learning advanced strokes.',
    desc: 'At this level, your child will refine all four strokes and build stronger swim efficiency, flip turns, and more advanced water movement skills.',
    goals: [
      'Swim 50 meters of freestyle with rotary breathing, high elbow recovery, and efficient catch of water',
      'Perform freestyle flip turns and streamline push-offs with 10 underwater flutter kicks and/or 5 underwater dolphin kicks',
      'Swim 25 meters of backstroke using high elbow catch and strong underwater push',
      'Swim 25 meters of single-arm butterfly with correct body wave and timing',
      'Swim 25 meters of breaststroke with proper kick technique',
      'Swim 25 meters without goggles while wearing a short-sleeved shirt and shorts',
    ],
  },
  {
    num: 7,
    name: 'Bronze',
    color: '#9c7a3c',
    tagline: 'Blending speed, technique, and endurance.',
    desc: 'At this level, your child will train with more focus on time, efficiency, and advanced coordination across all four competitive strokes.',
    goals: [
      'Swim 50 meters of freestyle within a set time limit using flip turns, high elbow recovery, and full stroke mechanics',
      'Swim 75 meters of freestyle nonstop with endurance and efficient breathing',
      'Swim 50 meters of backstroke with strong technique, alternating arm strokes, and smooth body position',
      'Perform backstroke flip turns and stroke-count finishes',
      'Swim 10 meters of butterfly with full stroke form and rhythm',
      'Swim 25 meters of breaststroke with proper arm-kick-glide rhythm and breathing',
      'Perform 7 meters of underwater butterfly kick on one breath',
      'Swim 25 meters without goggles while wearing a short-sleeved shirt and shorts',
    ],
  },
  {
    num: 8,
    name: 'Silver',
    color: '#a0a0a0',
    tagline: 'Training for endurance, efficiency, and competitive-level technique.',
    desc: 'At this level, your child will strengthen their stamina and refine the technical skills needed for competitive swimming, including legal turns, pullouts, and full-stroke performance.',
    goals: [
      'Swim 50 meters of freestyle with rotary breathing within a set target time using proper technique and flip turns',
      'Swim 100 meters of freestyle without stopping, focusing on efficient stroke technique, breathing, and endurance',
      'Perform legal open turns by touching the wall with both hands before rotating and pushing off',
      'Complete a proper breaststroke underwater pullout (one dolphin kick, one arm pull, one breaststroke kick) after each start and turn',
      'Swim 50 meters of breaststroke in a competitive format with one open turn and one underwater pullout',
      'Swim 25 meters of butterfly using full-stroke technique and competitive form',
    ],
  },
  {
    num: 9,
    name: 'Gold',
    color: '#c8a020',
    tagline: 'Mastering endurance and all four strokes in a competitive format.',
    desc: 'At this level, your child will demonstrate advanced endurance, stroke proficiency, and knowledge of competitive swim formats, including the individual medley.',
    goals: [
      'Swim 50 meters of freestyle with rotary breathing within a set target time using strong stroke mechanics and flip turns',
      'Swim 200 meters of freestyle nonstop with efficient breathing, turns, and pacing',
      'Swim 100 meters individual medley (25m each of butterfly, backstroke, breaststroke, freestyle) without stopping and in the correct order',
      'Perform legal transitions and turns between each stroke during the individual medley',
      'Demonstrate solid understanding of all four strokes in a competitive format',
    ],
  },
]

export default function LevelsPage() {
  const [activeLevel, setActiveLevel] = useState(0)
  const [openAccordion, setOpenAccordion] = useState<number | null>(null)

  const current = levels[activeLevel]

  return (
    <div style={{ fontFamily: "'DM Sans', sans-serif", background: '#111d38', minHeight: '100vh' }}>
      <Navbar />

      {/* ── TOP BANNER ── */}
      <div
        style={{
          background: '#1a2744',
          position: 'relative',
          overflow: 'hidden',
          padding: 'clamp(80px, 10vw, 100px) clamp(24px, 5vw, 72px) clamp(28px, 4vw, 40px)',
        }}
      >
        {/* dot pattern */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.05) 1.5px, transparent 1.5px)',
            backgroundSize: '22px 22px',
          }}
        />
        {/* deco rings */}
        <div
          style={{
            position: 'absolute',
            right: '-60px',
            top: '50%',
            transform: 'translateY(-50%)',
            width: '380px',
            height: '380px',
            pointerEvents: 'none',
          }}
        >
          {[0, 50, 110].map((inset, i) => (
            <span
              key={i}
              style={{
                position: 'absolute',
                borderRadius: '50%',
                border: `1px solid ${i === 2 ? 'rgba(200,160,32,0.13)' : 'rgba(255,255,255,0.07)'}`,
                inset: `${inset}px`,
              }}
            />
          ))}
        </div>

        <div style={{ position: 'relative', zIndex: 1 }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '10px',
              fontWeight: 600,
              letterSpacing: '3px',
              textTransform: 'uppercase',
              color: 'rgba(255,255,255,0.5)',
              marginBottom: '8px',
            }}
          >
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#c9a84c', display: 'inline-block' }} />
            Swim Curriculum
          </div>

          <h1
            style={{
              fontFamily: "'Playfair Display', serif",
              fontSize: 'clamp(22px, 3vw, 36px)',
              fontWeight: 900,
              color: '#fff',
              lineHeight: 1.1,
              letterSpacing: '-0.5px',
              marginBottom: '10px',
            }}
          >
            MantaShark <br />
            <em style={{ color: '#c9a84c', fontStyle: 'italic' }}>Levels</em>
          </h1>

          <p
            style={{
              fontSize: 'clamp(12px, 1.3vw, 14px)',
              color: 'rgba(255,255,255,0.65)',
              lineHeight: 1.6,
              maxWidth: '520px',
              marginBottom: '16px',
            }}
          >
            Building capable swimmers from start to finish — from their first splash to competitive aquatic skills.
          </p>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '14px' }}>
            <div style={{ width: '40px', height: '2px', background: '#c9a84c', borderRadius: '1px' }} />
            <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'rgba(255,255,255,0.3)' }} />
          </div>

          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            {[
              { label: '9 Levels', dot: '#e05a4a' },
              { label: 'Progression-Based', dot: '#4caf72' },
              { label: 'All Ages', dot: '#c9a84c' },
            ].map((chip) => (
              <span
                key={chip.label}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: 'rgba(255,255,255,0.1)',
                  border: '1px solid rgba(255,255,255,0.18)',
                  borderRadius: '30px',
                  padding: '6px 14px',
                  fontSize: '11px',
                  fontWeight: 600,
                  letterSpacing: '1px',
                  textTransform: 'uppercase',
                  color: 'rgba(255,255,255,0.82)',
                }}
              >
                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: chip.dot, display: 'inline-block' }} />
                {chip.label}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* ── DESKTOP LEVEL SELECTOR ── */}
      <div
        className="desktop-levels"
        style={{
          display: 'grid',
          gridTemplateColumns: '210px 1fr',
          background: '#f0f4f8',
          minHeight: '560px',
        }}
      >
        {/* Side Nav */}
        <nav style={{ background: '#1a2744', padding: '16px 12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {levels.map((lv, i) => (
            <button
              key={lv.num}
              onClick={() => setActiveLevel(i)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '12px 14px',
                borderRadius: '10px',
                border: 'none',
                background: activeLevel === i ? 'rgba(255,255,255,0.15)' : 'transparent',
                cursor: 'pointer',
                width: '100%',
                textAlign: 'left',
                transition: 'background 0.15s',
              }}
              onMouseEnter={(e) => {
                if (activeLevel !== i) (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.09)'
              }}
              onMouseLeave={(e) => {
                if (activeLevel !== i) (e.currentTarget as HTMLElement).style.background = 'transparent'
              }}
            >
              <span
                style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '13px',
                  fontWeight: 700,
                  color: '#fff',
                  flexShrink: 0,
                  background: lv.color,
                  border: `2px solid ${activeLevel === i ? '#fff' : 'rgba(255,255,255,0.25)'}`,
                }}
              >
                {lv.num}
              </span>
              <span style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                <span style={{ fontSize: '9px', fontWeight: 600, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)' }}>
                  Level {lv.num}
                </span>
                <span style={{ fontSize: '13px', fontWeight: 600, color: activeLevel === i ? '#fff' : 'rgba(255,255,255,0.8)', whiteSpace: 'nowrap' }}>
                  {lv.name}
                </span>
              </span>
              <span
                style={{
                  marginLeft: 'auto',
                  fontSize: '14px',
                  color: activeLevel === i ? '#c9a84c' : 'rgba(255,255,255,0.25)',
                  transform: activeLevel === i ? 'rotate(90deg)' : 'none',
                  transition: 'transform 0.2s, color 0.2s',
                }}
              >
                ›
              </span>
            </button>
          ))}
        </nav>

        {/* Panel */}
        <div style={{ padding: '32px 40px', background: '#f0f4f8', minHeight: '560px' }}>
          {/* Header */}
          <div
            style={{
              borderRadius: '16px',
              padding: '28px 36px',
              marginBottom: '28px',
              position: 'relative',
              overflow: 'hidden',
              background: current.color,
            }}
          >
            <div
              style={{
                position: 'absolute',
                right: '-30px',
                top: '-30px',
                width: '140px',
                height: '140px',
                borderRadius: '50%',
                background: 'rgba(255,255,255,0.08)',
                pointerEvents: 'none',
              }}
            />
            <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '2.5px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.6)', marginBottom: '6px' }}>
              Level {current.num}
            </div>
            <div
              style={{
                fontFamily: "'Playfair Display', serif",
                fontSize: 'clamp(24px, 2.8vw, 34px)',
                fontWeight: 900,
                color: '#fff',
              }}
            >
              {current.name}
            </div>
          </div>

          {/* Body */}
          <div
            style={{
              background: '#fff',
              borderRadius: '16px',
              padding: '28px 32px',
              boxShadow: '0 2px 16px rgba(26,52,128,0.07)',
            }}
          >
            <p style={{ fontSize: '15px', fontWeight: 700, color: '#1a2744', marginBottom: '10px', lineHeight: 1.5 }}>
              {current.tagline}
            </p>
            <p
              style={{
                fontSize: '13.5px',
                color: '#5a6a8a',
                lineHeight: 1.8,
                marginBottom: '22px',
                paddingBottom: '20px',
                borderBottom: '1px solid rgba(0,0,0,0.07)',
              }}
            >
              {current.desc}
            </p>
            <div style={{ fontSize: '13px', fontWeight: 700, color: '#1a2744', marginBottom: '14px' }}>
              By the end of this level, your child will be able to:
            </div>
            <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '11px', padding: 0, margin: 0 }}>
              {current.goals.map((goal, i) => (
                <li key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '11px', fontSize: '13.5px', color: '#3a4a6a', lineHeight: 1.65 }}>
                  <span
                    style={{
                      flexShrink: 0,
                      width: '7px',
                      height: '7px',
                      borderRadius: '50%',
                      background: current.color,
                      marginTop: '7px',
                      display: 'inline-block',
                    }}
                  />
                  {goal}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* ── MOBILE ACCORDION ── */}
      <div
        className="mobile-levels"
        style={{
          display: 'none',
          padding: '12px',
          flexDirection: 'column',
          gap: '6px',
          background: '#f0f4f8',
        }}
      >
        {levels.map((lv, i) => (
          <div
            key={lv.num}
            style={{
              borderRadius: '12px',
              overflow: 'hidden',
              background: '#fff',
              boxShadow: '0 2px 8px rgba(0,0,0,0.07)',
            }}
          >
            <button
              onClick={() => setOpenAccordion(openAccordion === i ? null : i)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '10px 14px',
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                width: '100%',
                textAlign: 'left',
              }}
            >
              <span
                style={{
                  width: '30px',
                  height: '30px',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '12px',
                  fontWeight: 700,
                  color: '#fff',
                  flexShrink: 0,
                  background: lv.color,
                }}
              >
                {lv.num}
              </span>
              <span style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: '8px', fontWeight: 600, letterSpacing: '1px', textTransform: 'uppercase', color: '#aaa' }}>Level {lv.num}</span>
                <span style={{ fontSize: '12px', fontWeight: 600, color: '#2a3a5c' }}>{lv.name}</span>
              </span>
              <span
                style={{
                  marginLeft: 'auto',
                  fontSize: '14px',
                  color: '#bbb',
                  transform: openAccordion === i ? 'rotate(180deg)' : 'none',
                  transition: 'transform 0.25s',
                  display: 'inline-block',
                }}
              >
                ▾
              </span>
            </button>

            <div
              style={{
                maxHeight: openAccordion === i ? '1400px' : '0',
                overflow: 'hidden',
                transition: 'max-height 0.35s ease',
                padding: '0 16px',
              }}
            >
              <div style={{ padding: '4px 0 20px' }}>
                <p style={{ fontSize: '13px', fontWeight: 600, color: '#1a2744', marginBottom: '8px', lineHeight: 1.5 }}>{lv.tagline}</p>
                <p
                  style={{
                    fontSize: '12px',
                    color: '#5a6a8a',
                    lineHeight: 1.7,
                    marginBottom: '14px',
                    paddingBottom: '12px',
                    borderBottom: '1px solid rgba(0,0,0,0.07)',
                  }}
                >
                  {lv.desc}
                </p>
                <div style={{ fontSize: '11px', fontWeight: 700, color: '#1a2744', marginBottom: '10px' }}>
                  By the end of this level, your child will be able to:
                </div>
                <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '8px', padding: 0, margin: 0 }}>
                  {lv.goals.map((goal, gi) => (
                    <li key={gi} style={{ display: 'flex', alignItems: 'flex-start', gap: '9px', fontSize: '12px', color: '#3a4a6a', lineHeight: 1.6 }}>
                      <span
                        style={{
                          flexShrink: 0,
                          width: '6px',
                          height: '6px',
                          borderRadius: '50%',
                          background: lv.color,
                          marginTop: '6px',
                          display: 'inline-block',
                        }}
                      />
                      {goal}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* ── BOTTOM CTA ── */}
      <div style={{ background: '#1a2744', position: 'relative', overflow: 'hidden' }}>
        <div
          style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.04) 1.5px, transparent 1.5px)',
            backgroundSize: '22px 22px',
          }}
        />
        <svg
          viewBox="0 0 1440 48"
          xmlns="http://www.w3.org/2000/svg"
          preserveAspectRatio="none"
          aria-hidden="true"
          style={{ display: 'block', width: '100%', lineHeight: 0 }}
        >
          <path d="M0,24 C360,48 1080,0 1440,24 L1440,0 L0,0 Z" fill="#f0f4f8" />
        </svg>

        <div
          style={{
            position: 'relative',
            zIndex: 1,
            maxWidth: '820px',
            margin: '0 auto',
            padding: 'clamp(36px, 5vw, 64px) clamp(24px, 6vw, 60px) clamp(48px, 6vw, 72px)',
            textAlign: 'center',
          }}
        >
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '10px',
              fontWeight: 600,
              letterSpacing: '3px',
              textTransform: 'uppercase',
              color: 'rgba(255,255,255,0.5)',
              marginBottom: '14px',
            }}
          >
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#c9a84c', display: 'inline-block' }} />
            Join the Program
          </div>

          <h2
            style={{
              fontFamily: "'Playfair Display', serif",
              fontSize: 'clamp(24px, 3.2vw, 38px)',
              fontWeight: 900,
              color: '#fff',
              lineHeight: 1.2,
              marginBottom: '20px',
            }}
          >
            More Than Swimming —<br />
            <em style={{ color: '#c9a84c', fontStyle: 'italic' }}>Skills for Life.</em>
          </h2>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', marginBottom: '24px' }}>
            <div style={{ width: '36px', height: '2px', background: 'rgba(200,160,32,0.4)', borderRadius: '1px' }} />
            <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#c9a84c' }} />
            <div style={{ width: '36px', height: '2px', background: 'rgba(200,160,32,0.4)', borderRadius: '1px' }} />
          </div>

          <p style={{ fontSize: 'clamp(13px, 1.3vw, 15px)', color: 'rgba(255,255,255,0.68)', lineHeight: 1.85, marginBottom: '12px' }}>
            The MantaShark Level program takes swimmers from their very first strokes to{' '}
            <strong style={{ color: 'rgba(255,255,255,0.9)', fontWeight: 600 }}>competitive-level technique</strong>. Whether your child dreams of joining a swim team, ocean sports, water safety programs, or simply a lifetime of aquatic confidence —
          </p>
          <p style={{ fontSize: 'clamp(13px, 1.3vw, 15px)', color: 'rgba(255,255,255,0.68)', lineHeight: 1.85, marginBottom: '12px' }}>
            our coaches focus on{' '}
            <strong style={{ color: 'rgba(255,255,255,0.9)', fontWeight: 600 }}>water safety, technique, and endurance</strong>, ensuring each student progresses at their own pace while having fun.
          </p>

          <div style={{ display: 'flex', justifyContent: 'center', gap: '14px', flexWrap: 'wrap', margin: '28px 0 36px' }}>
            {[
              { icon: '🏊', label: 'Levels', value: '9' },
              { icon: '⭐', label: 'Rating', value: '5.0' },
              { icon: '👶', label: 'All Ages', value: 'Welcome' },
            ].map((hl) => (
              <div
                key={hl.label}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '6px',
                  background: 'rgba(255,255,255,0.07)',
                  border: '1px solid rgba(255,255,255,0.11)',
                  borderRadius: '14px',
                  padding: '16px 24px',
                  minWidth: '130px',
                }}
              >
                <span style={{ fontSize: '22px' }}>{hl.icon}</span>
                <span style={{ fontSize: '10px', fontWeight: 600, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.5)' }}>{hl.label}</span>
                <span
                  style={{
                    fontFamily: "'Playfair Display', serif",
                    fontSize: '20px',
                    fontWeight: 700,
                    color: '#c9a84c',
                  }}
                >
                  {hl.value}
                </span>
              </div>
            ))}
          </div>

          <Link
            href="/register"
            style={{
              display: 'inline-block',
              fontFamily: "'DM Sans', sans-serif",
              fontSize: '13px',
              fontWeight: 700,
              letterSpacing: '2px',
              textTransform: 'uppercase',
              color: '#1a2744',
              background: '#c9a84c',
              border: '2px solid #c9a84c',
              padding: '15px 48px',
              borderRadius: '6px',
              cursor: 'pointer',
              textDecoration: 'none',
              boxShadow: '0 4px 24px rgba(200,160,32,0.28)',
              transition: 'background 0.22s, color 0.22s, transform 0.15s',
            }}
            onMouseEnter={(e) => {
              const el = e.currentTarget as HTMLElement
              el.style.background = 'transparent'
              el.style.color = '#c9a84c'
              el.style.transform = 'translateY(-2px)'
            }}
            onMouseLeave={(e) => {
              const el = e.currentTarget as HTMLElement
              el.style.background = '#c9a84c'
              el.style.color = '#1a2744'
              el.style.transform = 'translateY(0)'
            }}
          >
            Sign Up Now
          </Link>
          <p style={{ marginTop: '10px', fontSize: '11px', color: 'rgba(255,255,255,0.32)' }}>
            Create a free account to get started
          </p>
        </div>
      </div>

      {/* ── RESPONSIVE CSS ── */}
      <style>{`
        @media (max-width: 768px) {
          .desktop-levels { display: none !important; }
          .mobile-levels { display: flex !important; }
        }
        @media (min-width: 769px) {
          .mobile-levels { display: none !important; }
        }
      `}</style>
    </div>
  )
}