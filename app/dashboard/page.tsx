'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

const NAVY = '#1a2744'
const DARK = '#111d38'
const GOLD = '#c9a84c'

const LEVEL_COLORS: Record<number, string> = {
  1: '#e05a4a',
  2: '#e8883a',
  3: '#d4a825',
  4: '#4caf72',
  5: '#4a90c4',
  6: '#7b5ea7',
  7: '#9c7a3c',
  8: '#a0a0a0',
  9: '#c9a84c',
}

const LEVEL_NAMES: Record<number, string> = {
  1: 'Water Intro',
  2: 'Water Comfort',
  3: 'Pool Safety',
  4: 'Beginner',
  5: 'Intermediate',
  6: 'Advanced',
  7: 'Bronze',
  8: 'Silver',
  9: 'Gold',
}

interface Parent {
  id: string
  first_name: string
  last_name: string
  email: string
}

interface Student {
  id: string
  full_name: string
  date_of_birth: string
  current_level: number
  gender: string
}

interface CreditSummary {
  course_type: string
  remaining: number
}

function getAge(dob: string): number {
  const birth = new Date(dob)
  const today = new Date()
  let age = today.getFullYear() - birth.getFullYear()
  const m = today.getMonth() - birth.getMonth()
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--
  return age
}

function getInitials(name: string): string {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
}

const QUICK_LINKS = [
  { label: 'Book a Lesson', icon: '📅', href: '/booking', color: GOLD, desc: 'Schedule your next session' },
  { label: 'Swim Levels', icon: '🏊', href: '/levels', color: '#4a90c4', desc: 'View curriculum & progress' },
  { label: 'Swim Plans', icon: '📦', href: '/plans', color: '#4caf72', desc: 'Browse lesson packages' },
  { label: 'Policies', icon: '📋', href: '/policies', color: '#9c7a3c', desc: 'Rules & terms' },
]

export default function DashboardPage() {
  const supabase = createClient()

  const [parent, setParent] = useState<Parent | null>(null)
  const [students, setStudents] = useState<Student[]>([])
  const [credits, setCredits] = useState<CreditSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [greeting, setGreeting] = useState('Good morning')

  useEffect(() => {
    const hour = new Date().getHours()
    if (hour < 12) setGreeting('Good morning')
    else if (hour < 17) setGreeting('Good afternoon')
    else setGreeting('Good evening')
  }, [])

  useEffect(() => {
    async function fetchData() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // Fetch parent
      const { data: parentData } = await supabase
        .from('parents')
        .select('*')
        .eq('auth_user_id', user.id)
        .single()

      if (parentData) {
        setParent(parentData)

        // Fetch students
        const { data: studentData } = await supabase
          .from('students')
          .select('*')
          .eq('parent_id', parentData.id)
          .eq('is_active', true)
          .order('sort_order', { ascending: true })

        if (studentData) setStudents(studentData)

        // Fetch credits summary
        const { data: creditData } = await supabase
          .from('lesson_credits')
          .select('course_type_id, remaining_credits, course_types(name)')
          .eq('parent_id', parentData.id)
          .gt('remaining_credits', 0)

        if (creditData) {
          const summary = creditData.map((c: any) => ({
            course_type: c.course_types?.name || 'Unknown',
            remaining: c.remaining_credits,
          }))
          setCredits(summary)
        }
      }

      setLoading(false)
    }

    fetchData()
  }, [])

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh', background: DARK,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '32px', marginBottom: '16px' }}>🦈</div>
          <div style={{ fontSize: '14px', color: 'rgba(255,255,255,0.5)' }}>Loading your dashboard...</div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ fontFamily: "'DM Sans', sans-serif", background: DARK, minHeight: '100vh' }}>

      {/* ── TOP BAR ── */}
      <div style={{
        background: NAVY,
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        padding: '16px clamp(20px,5vw,48px)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Link href="/" style={{ textDecoration: 'none' }}>
            <img src="/logo.png" alt="Manta Shark Aquatics" style={{ height: '36px' }} />
          </Link>
          <div style={{ width: '1px', height: '24px', background: 'rgba(255,255,255,0.12)' }} />
          <span style={{ fontSize: '13px', fontWeight: 600, color: 'rgba(255,255,255,0.6)' }}>
            Parent Dashboard
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '13px', fontWeight: 600, color: '#fff' }}>
              {parent?.first_name} {parent?.last_name}
            </div>
            <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)' }}>{parent?.email}</div>
          </div>
          <button
            onClick={async () => {
              await supabase.auth.signOut()
              window.location.href = '/'
            }}
            style={{
              padding: '8px 16px', borderRadius: '8px',
              border: '1px solid rgba(255,255,255,0.15)',
              background: 'transparent', color: 'rgba(255,255,255,0.6)',
              fontSize: '12px', fontWeight: 600, cursor: 'pointer',
            }}
          >
            Sign Out
          </button>
        </div>
      </div>

      <div style={{ maxWidth: '1100px', margin: '0 auto', padding: 'clamp(24px,4vw,48px) clamp(20px,5vw,48px)' }}>

        {/* ── GREETING ── */}
        <div style={{ marginBottom: '36px' }}>
          <div style={{
            fontSize: '11px', fontWeight: 600, letterSpacing: '2px',
            textTransform: 'uppercase', color: GOLD, marginBottom: '6px',
          }}>
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </div>
          <h1 style={{
            fontFamily: "'Playfair Display', serif",
            fontSize: 'clamp(22px,3vw,34px)', fontWeight: 900,
            color: '#fff', margin: 0,
          }}>
            {greeting}, <em style={{ color: GOLD, fontStyle: 'italic' }}>{parent?.first_name}!</em>
          </h1>
          <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.5)', marginTop: '6px' }}>
            Here's a summary of your swimmers.
          </p>
        </div>

        {/* ── STUDENTS ── */}
        <section style={{ marginBottom: '36px' }}>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            marginBottom: '16px',
          }}>
            <h2 style={{ fontSize: '14px', fontWeight: 700, color: 'rgba(255,255,255,0.7)', margin: 0, letterSpacing: '1px', textTransform: 'uppercase' }}>
              My Swimmers
            </h2>
          </div>

          {students.length === 0 ? (
            <div style={{
              background: NAVY, borderRadius: '16px',
              border: '1px dashed rgba(255,255,255,0.15)',
              padding: '36px', textAlign: 'center',
            }}>
              <div style={{ fontSize: '32px', marginBottom: '12px' }}>👶</div>
              <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.5)', marginBottom: '16px' }}>
                No swimmers added yet.
              </p>
              <Link href="/register/student" style={{
                display: 'inline-block', padding: '10px 24px',
                background: GOLD, color: NAVY,
                borderRadius: '8px', fontSize: '12px', fontWeight: 700,
                textDecoration: 'none', letterSpacing: '1px', textTransform: 'uppercase',
              }}>
                Add a Swimmer
              </Link>
            </div>
          ) : (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
              gap: '16px',
            }}>
              {students.map((student) => {
                const levelColor = LEVEL_COLORS[student.current_level] || GOLD
                const levelName = LEVEL_NAMES[student.current_level] || 'Unknown'
                const age = getAge(student.date_of_birth)

                return (
                  <div key={student.id} style={{
                    background: NAVY, borderRadius: '16px',
                    border: '1px solid rgba(255,255,255,0.08)',
                    padding: '24px',
                    position: 'relative', overflow: 'hidden',
                  }}>
                    {/* Level color top bar */}
                    <div style={{
                      position: 'absolute', top: 0, left: 0, right: 0,
                      height: '3px', background: levelColor,
                    }} />

                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px' }}>
                      {/* Avatar */}
                      <div style={{
                        width: '48px', height: '48px', borderRadius: '50%',
                        background: levelColor,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontFamily: "'Playfair Display', serif",
                        fontSize: '18px', fontWeight: 900, color: '#fff',
                        flexShrink: 0,
                      }}>
                        {getInitials(student.full_name)}
                      </div>

                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '16px', fontWeight: 700, color: '#fff', marginBottom: '2px' }}>
                          {student.full_name}
                        </div>
                        <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)' }}>
                          Age {age} · {student.gender === 'male' ? '👦' : student.gender === 'female' ? '👧' : '🧒'}
                        </div>
                      </div>
                    </div>

                    {/* Level badge */}
                    <div style={{
                      marginTop: '16px',
                      background: `${levelColor}18`,
                      border: `1px solid ${levelColor}35`,
                      borderRadius: '10px', padding: '12px 14px',
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    }}>
                      <div>
                        <div style={{ fontSize: '10px', fontWeight: 600, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)', marginBottom: '2px' }}>
                          Current Level
                        </div>
                        <div style={{ fontSize: '14px', fontWeight: 700, color: '#fff' }}>
                          Level {student.current_level} · {levelName}
                        </div>
                      </div>
                      <div style={{
                        width: '32px', height: '32px', borderRadius: '50%',
                        background: levelColor,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '13px', fontWeight: 700, color: '#fff',
                      }}>
                        {student.current_level}
                      </div>
                    </div>

                    <Link href={`/progress/${student.id}`} style={{
                      display: 'block', textAlign: 'center',
                      marginTop: '14px', padding: '10px',
                      borderRadius: '8px', textDecoration: 'none',
                      fontSize: '12px', fontWeight: 700, letterSpacing: '1px',
                      textTransform: 'uppercase',
                      color: levelColor,
                      border: `1px solid ${levelColor}40`,
                      background: 'transparent',
                    }}>
                      View Progress →
                    </Link>
                  </div>
                )
              })}
            </div>
          )}
        </section>

        {/* ── CREDITS ── */}
        <section style={{ marginBottom: '36px' }}>
          <h2 style={{ fontSize: '14px', fontWeight: 700, color: 'rgba(255,255,255,0.7)', margin: '0 0 16px', letterSpacing: '1px', textTransform: 'uppercase' }}>
            Lesson Credits
          </h2>

          {credits.length === 0 ? (
            <div style={{
              background: NAVY, borderRadius: '14px',
              border: '1px dashed rgba(255,255,255,0.12)',
              padding: '28px', textAlign: 'center',
            }}>
              <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.4)', margin: '0 0 14px' }}>
                No active lesson credits.
              </p>
              <Link href="/plans" style={{
                display: 'inline-block', padding: '9px 20px',
                background: 'transparent', color: GOLD,
                border: `1px solid ${GOLD}`,
                borderRadius: '8px', fontSize: '12px', fontWeight: 700,
                textDecoration: 'none', letterSpacing: '1px', textTransform: 'uppercase',
              }}>
                Browse Plans
              </Link>
            </div>
          ) : (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
              gap: '12px',
            }}>
              {credits.map((credit, i) => (
                <div key={i} style={{
                  background: NAVY, borderRadius: '14px',
                  border: '1px solid rgba(255,255,255,0.08)',
                  padding: '20px',
                }}>
                  <div style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)', marginBottom: '8px' }}>
                    {credit.course_type}
                  </div>
                  <div style={{
                    fontFamily: "'Playfair Display', serif",
                    fontSize: '36px', fontWeight: 900, color: GOLD, lineHeight: 1,
                  }}>
                    {credit.remaining}
                  </div>
                  <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', marginTop: '4px' }}>
                    sessions remaining
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ── QUICK LINKS ── */}
        <section>
          <h2 style={{ fontSize: '14px', fontWeight: 700, color: 'rgba(255,255,255,0.7)', margin: '0 0 16px', letterSpacing: '1px', textTransform: 'uppercase' }}>
            Quick Links
          </h2>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
            gap: '12px',
          }}>
            {QUICK_LINKS.map((link) => (
              <Link key={link.label} href={link.href} style={{
                display: 'flex', alignItems: 'center', gap: '14px',
                background: NAVY, borderRadius: '14px',
                border: '1px solid rgba(255,255,255,0.08)',
                padding: '18px 20px', textDecoration: 'none',
                transition: 'border-color 0.2s, transform 0.15s',
              }}
              onMouseEnter={(e) => {
                const el = e.currentTarget as HTMLElement
                el.style.borderColor = link.color + '60'
                el.style.transform = 'translateY(-2px)'
              }}
              onMouseLeave={(e) => {
                const el = e.currentTarget as HTMLElement
                el.style.borderColor = 'rgba(255,255,255,0.08)'
                el.style.transform = 'translateY(0)'
              }}
              >
                <span style={{
                  width: '40px', height: '40px', borderRadius: '10px',
                  background: `${link.color}18`,
                  border: `1px solid ${link.color}30`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '20px', flexShrink: 0,
                }}>
                  {link.icon}
                </span>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: '#fff', marginBottom: '2px' }}>
                    {link.label}
                  </div>
                  <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)' }}>
                    {link.desc}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>

      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,700;0,900;1,700&family=DM+Sans:wght@400;500;600;700&display=swap');
      `}</style>
    </div>
  )
}
