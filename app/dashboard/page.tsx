'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

const NAVY = '#1a2744'
const DARK = '#111d38'
const GOLD = '#c9a84c'

const LEVEL_COLORS: Record<number, string> = {
  1: '#e05a4a', 2: '#e8883a', 3: '#d4a825', 4: '#4caf72',
  5: '#4a90c4', 6: '#7b5ea7', 7: '#9c7a3c', 8: '#a0a0a0', 9: '#c9a84c',
}
const LEVEL_NAMES: Record<number, string> = {
  1: 'Water Intro', 2: 'Water Comfort', 3: 'Pool Safety', 4: 'Beginner',
  5: 'Intermediate', 6: 'Advanced', 7: 'Bronze', 8: 'Silver', 9: 'Gold',
}

interface Parent { id: string; first_name: string; last_name: string; email: string }
interface Student { id: string; full_name: string; date_of_birth: string; current_level: number | null; gender: string }
interface Credit {
  id: string
  total_credits: number
  used_credits: number
  course_type_id: string
  student_id: string | null
  course_types?: { name: string } | { name: string }[]
}
interface Booking {
  id: string; status: string
  session_date: string; start_time: string; end_time: string
  course_name: string; coach_name: string; student_name?: string
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

function formatTime(t: string): string {
  const [h, m] = t.split(':').map(Number)
  const ampm = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 || 12
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`
}

function formatDate(d: string): string {
  const date = new Date(d + 'T00:00:00')
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

function getDaysUntil(d: string): number {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const date = new Date(d + 'T00:00:00')
  return Math.round((date.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
}

const QUICK_LINKS = [
  { label: 'Book a Lesson', icon: '📅', href: '/booking', color: GOLD, desc: 'Schedule your next session' },
  { label: 'Swim Levels', icon: '🏊', href: '/levels', color: '#4a90c4', desc: 'View curriculum & progress' },
  { label: 'Swim Plans', icon: '📦', href: '/plans', color: '#4caf72', desc: 'Browse lesson packages' },
  { label: 'Policies', icon: '📋', href: '/policies', color: '#9c7a3c', desc: 'Rules & terms' },
]

const STATUS_COLORS: Record<string, string> = {
  confirmed: '#4caf72',
  cancelled: '#e05a4a',
  completed: '#a0a0a0',
  pending: GOLD,
}

export default function DashboardPage() {
  const supabase = createClient()
  const [parent, setParent] = useState<Parent | null>(null)
  const [students, setStudents] = useState<Student[]>([])
  const [credits, setCredits] = useState<Credit[]>([])
  const [upcomingBookings, setUpcomingBookings] = useState<Booking[]>([])
  const [pastBookings, setPastBookings] = useState<Booking[]>([])
  const [loading, setLoading] = useState(true)
  const [greeting, setGreeting] = useState('Good morning')
  const [cancellingId, setCancellingId] = useState<string | null>(null)

  useEffect(() => {
    const hour = new Date().getHours()
    if (hour < 12) setGreeting('Good morning')
    else if (hour < 17) setGreeting('Good afternoon')
    else setGreeting('Good evening')
  }, [])

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: parentData } = await supabase
      .from('parents').select('*').eq('auth_user_id', user.id).single()
    if (!parentData) return
    setParent(parentData)

    const today = new Date().toISOString().split('T')[0]

    const [{ data: studs }, { data: credData }, { data: upcoming }, { data: past }] = await Promise.all([
      supabase.from('students').select('*').eq('parent_id', parentData.id).eq('is_active', true).order('sort_order'),
      supabase
        .from('lesson_credits')
        .select('id, total_credits, used_credits, course_type_id, student_id, course_types(name)')
        .eq('parent_id', parentData.id)
        .gt('total_credits', 0),
      supabase.from('bookings')
        .select('id, status, student_id, class_sessions(session_date, start_time, end_time, course_types(name), coaches(first_name)), students(full_name)')
        .eq('parent_id', parentData.id)
        .neq('status', 'cancelled')
        .order('created_at', { ascending: true }),
      supabase.from('bookings')
        .select('id, status, student_id, class_sessions(session_date, start_time, end_time, course_types(name), coaches(first_name)), students(full_name)')
        .eq('parent_id', parentData.id)
        .order('created_at', { ascending: false })
        .limit(20),
    ])

    setStudents(studs || [])
    setCredits((credData || []).filter((c: any) => (c.total_credits - c.used_credits) > 0))

    const parseBookings = (data: any[]): Booking[] =>
      (data || []).map((b: any) => ({
        id: b.id,
        status: b.status,
        session_date: b.class_sessions?.session_date,
        start_time: b.class_sessions?.start_time,
        end_time: b.class_sessions?.end_time,
        course_name: b.class_sessions?.course_types?.name,
        coach_name: b.class_sessions?.coaches?.first_name,
        student_name: b.students?.full_name,
      })).filter(b => b.session_date)

    const allUpcoming = parseBookings(upcoming || []).filter(b => b.session_date >= today)
    const allPast = parseBookings(past || []).filter(b => b.session_date < today)

    setUpcomingBookings(allUpcoming.sort((a, b) => a.session_date.localeCompare(b.session_date)))
    setPastBookings(allPast.sort((a, b) => b.session_date.localeCompare(a.session_date)).slice(0, 10))
    setLoading(false)
  }

  async function cancelBooking(bookingId: string) {
    setCancellingId(bookingId)
    await supabase.from('bookings').update({ status: 'cancelled' }).eq('id', bookingId)
    await fetchAll()
    setCancellingId(null)
  }

  if (loading) return (
    <div style={{ minHeight: '100vh', background: DARK, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '32px', marginBottom: '16px' }}>🦈</div>
        <div style={{ fontSize: '14px', color: 'rgba(255,255,255,0.5)' }}>Loading your dashboard...</div>
      </div>
    </div>
  )

  return (
    <div style={{ fontFamily: "'DM Sans', sans-serif", background: DARK, minHeight: '100vh' }}>
      <div style={{ background: NAVY, borderBottom: '1px solid rgba(255,255,255,0.08)', padding: '16px clamp(20px,5vw,48px)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Link href="/" style={{ textDecoration: 'none' }}>
            <img src="/logo.png" alt="Manta Shark Aquatics" style={{ height: '36px' }} />
          </Link>
          <div style={{ width: '1px', height: '24px', background: 'rgba(255,255,255,0.12)' }} />
          <span style={{ fontSize: '13px', fontWeight: 600, color: 'rgba(255,255,255,0.6)' }}>Parent Dashboard</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '13px', fontWeight: 600, color: '#fff' }}>{parent?.first_name} {parent?.last_name}</div>
            <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)' }}>{parent?.email}</div>
          </div>
          <button onClick={async () => { await supabase.auth.signOut(); window.location.href = '/' }}
            style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.15)', background: 'transparent', color: 'rgba(255,255,255,0.6)', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>
            Sign Out
          </button>
        </div>
      </div>

      <div style={{ maxWidth: '1100px', margin: '0 auto', padding: 'clamp(24px,4vw,48px) clamp(20px,5vw,48px)' }}>

        {/* GREETING */}
        <div style={{ marginBottom: '36px' }}>
          <div style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '2px', textTransform: 'uppercase', color: GOLD, marginBottom: '6px' }}>
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </div>
          <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: 'clamp(22px,3vw,34px)', fontWeight: 900, color: '#fff', margin: 0 }}>
            {greeting}, <em style={{ color: GOLD, fontStyle: 'italic' }}>{parent?.first_name}!</em>
          </h1>
          <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.5)', marginTop: '6px' }}>Here's a summary of your swimmers.</p>
        </div>

        {/* STUDENTS */}
        <section style={{ marginBottom: '36px' }}>
          <h2 style={{ fontSize: '13px', fontWeight: 700, color: 'rgba(255,255,255,0.5)', margin: '0 0 16px', letterSpacing: '1.5px', textTransform: 'uppercase' }}>My Swimmers</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
            {students.map((student) => {
              const hasLevel = student.current_level && Number(student.current_level) >= 1
              const levelColor = hasLevel ? (LEVEL_COLORS[Number(student.current_level)] || GOLD) : 'rgba(255,255,255,0.2)'
              const levelName = hasLevel ? LEVEL_NAMES[Number(student.current_level)] : null
              const age = student.date_of_birth ? getAge(student.date_of_birth) : null
              return (
                <div key={student.id} style={{ background: NAVY, borderRadius: '16px', border: '1px solid rgba(255,255,255,0.08)', padding: '24px', position: 'relative', overflow: 'hidden' }}>
                  <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '3px', background: levelColor }} />
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px' }}>
                    <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: levelColor, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Playfair Display', serif", fontSize: '18px', fontWeight: 900, color: '#fff', flexShrink: 0 }}>
                      {getInitials(student.full_name)}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '16px', fontWeight: 700, color: '#fff', marginBottom: '2px' }}>{student.full_name}</div>
                      <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)' }}>
                        {age !== null ? `Age ${age}` : 'Age unknown'}
                        {student.gender === 'male' ? ' · 👦' : student.gender === 'female' ? ' · 👧' : ''}
                      </div>
                    </div>
                  </div>
                  <div style={{ marginTop: '16px', background: hasLevel ? `${levelColor}18` : 'rgba(255,255,255,0.04)', border: `1px solid ${hasLevel ? levelColor + '35' : 'rgba(255,255,255,0.1)'}`, borderRadius: '10px', padding: '12px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                      <div style={{ fontSize: '10px', fontWeight: 600, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)', marginBottom: '2px' }}>Current Level</div>
                      {hasLevel ? (
                        <div style={{ fontSize: '14px', fontWeight: 700, color: '#fff' }}>Level {student.current_level} · {levelName}</div>
                      ) : (
                        <div style={{ fontSize: '14px', fontWeight: 700, color: 'rgba(255,255,255,0.4)' }}>Pending Assessment</div>
                      )}
                    </div>
                    {hasLevel ? (
                      <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: levelColor, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', fontWeight: 700, color: '#fff' }}>
                        {student.current_level}
                      </div>
                    ) : (
                      <div style={{ fontSize: '20px' }}>📋</div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </section>

        {/* UPCOMING LESSONS */}
        <section style={{ marginBottom: '36px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
            <h2 style={{ fontSize: '13px', fontWeight: 700, color: 'rgba(255,255,255,0.5)', margin: 0, letterSpacing: '1.5px', textTransform: 'uppercase' }}>Upcoming Lessons</h2>
            <Link href="/booking" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 700, color: GOLD, textDecoration: 'none', border: `1px solid ${GOLD}40`, borderRadius: '8px', padding: '6px 14px' }}>
              + Book a Lesson
            </Link>
          </div>
          {upcomingBookings.length === 0 ? (
            <div style={{ background: NAVY, borderRadius: '14px', border: '1px dashed rgba(255,255,255,0.12)', padding: '32px', textAlign: 'center' }}>
              <div style={{ fontSize: '28px', marginBottom: '10px' }}>📅</div>
              <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.4)', margin: '0 0 16px' }}>No upcoming lessons.</p>
              <Link href="/booking" style={{ display: 'inline-block', padding: '10px 24px', background: GOLD, color: NAVY, borderRadius: '8px', fontSize: '12px', fontWeight: 700, textDecoration: 'none', letterSpacing: '1px', textTransform: 'uppercase' }}>Book Now</Link>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {upcomingBookings.map((booking) => {
                const daysUntil = getDaysUntil(booking.session_date)
                const isToday = daysUntil === 0
                const isTomorrow = daysUntil === 1
                const statusColor = STATUS_COLORS[booking.status] || GOLD
                return (
                  <div key={booking.id} style={{ background: NAVY, borderRadius: '14px', border: `1px solid ${isToday ? GOLD + '40' : 'rgba(255,255,255,0.08)'}`, padding: '18px 20px', display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <div style={{ width: '52px', height: '52px', borderRadius: '12px', background: isToday ? GOLD : 'rgba(255,255,255,0.06)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <div style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: isToday ? NAVY : 'rgba(255,255,255,0.4)' }}>
                        {new Date(booking.session_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short' })}
                      </div>
                      <div style={{ fontSize: '20px', fontWeight: 900, color: isToday ? NAVY : '#fff', lineHeight: 1 }}>
                        {new Date(booking.session_date + 'T00:00:00').getDate()}
                      </div>
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                        <span style={{ fontSize: '14px', fontWeight: 700, color: '#fff' }}>{booking.course_name}</span>
                        {isToday && <span style={{ fontSize: '10px', fontWeight: 700, background: GOLD, color: NAVY, borderRadius: '10px', padding: '2px 8px' }}>TODAY</span>}
                        {isTomorrow && <span style={{ fontSize: '10px', fontWeight: 700, background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.7)', borderRadius: '10px', padding: '2px 8px' }}>TOMORROW</span>}
                      </div>
                      <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)' }}>
                        with {booking.coach_name} {booking.student_name ? '· ' + booking.student_name : ''} · {formatTime(booking.start_time)} – {formatTime(booking.end_time)} · {formatDate(booking.session_date)}
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
                      <span style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: statusColor, background: `${statusColor}18`, border: `1px solid ${statusColor}30`, borderRadius: '20px', padding: '3px 10px' }}>
                        {booking.status}
                      </span>
                      {daysUntil >= 1 && (
                        <button onClick={() => cancelBooking(booking.id)} disabled={cancellingId === booking.id}
                          style={{ padding: '6px 12px', borderRadius: '8px', border: '1px solid rgba(224,90,74,0.3)', background: 'transparent', color: '#e05a4a', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}>
                          {cancellingId === booking.id ? '...' : 'Cancel'}
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>

        {/* CREDITS */}
        <section style={{ marginBottom: '36px' }}>
          <h2 style={{ fontSize: '13px', fontWeight: 700, color: 'rgba(255,255,255,0.5)', margin: '0 0 16px', letterSpacing: '1.5px', textTransform: 'uppercase' }}>Lesson Credits</h2>
          {credits.length === 0 ? (
            <div style={{ background: NAVY, borderRadius: '14px', border: '1px dashed rgba(255,255,255,0.12)', padding: '28px', textAlign: 'center' }}>
              <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.4)', margin: '0 0 14px' }}>No active lesson credits.</p>
              <Link href="/plans" style={{ display: 'inline-block', padding: '9px 20px', background: 'transparent', color: GOLD, border: `1px solid ${GOLD}`, borderRadius: '8px', fontSize: '12px', fontWeight: 700, textDecoration: 'none', letterSpacing: '1px', textTransform: 'uppercase' }}>Browse Plans</Link>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '12px' }}>
              {credits.map((credit, i) => {
                const remaining = credit.total_credits - credit.used_credits
                const pct = Math.round((remaining / credit.total_credits) * 100)
                const ct = Array.isArray(credit.course_types) ? credit.course_types[0] : credit.course_types
                return (
                  <div key={i} style={{ background: NAVY, borderRadius: '14px', border: '1px solid rgba(255,255,255,0.08)', padding: '20px' }}>
                    <div style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)', marginBottom: '8px' }}>
                      {ct?.name || 'Lesson Credits'}
                    </div>
                    <div style={{ fontFamily: "'Playfair Display', serif", fontSize: '36px', fontWeight: 900, color: GOLD, lineHeight: 1 }}>{remaining}</div>
                    <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', marginTop: '4px', marginBottom: '12px' }}>of {credit.total_credits} remaining</div>
                    <div style={{ height: '4px', background: 'rgba(255,255,255,0.08)', borderRadius: '2px' }}>
                      <div style={{ height: '100%', width: `${pct}%`, background: GOLD, borderRadius: '2px' }} />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>

        {/* LESSON HISTORY */}
        {pastBookings.length > 0 && (
          <section style={{ marginBottom: '36px' }}>
            <h2 style={{ fontSize: '13px', fontWeight: 700, color: 'rgba(255,255,255,0.5)', margin: '0 0 16px', letterSpacing: '1.5px', textTransform: 'uppercase' }}>Lesson History</h2>
            <div style={{ background: NAVY, borderRadius: '14px', border: '1px solid rgba(255,255,255,0.08)', overflow: 'hidden' }}>
              {pastBookings.map((booking, i) => (
                <div key={booking.id} style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '14px 20px', borderBottom: i < pastBookings.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
                  <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.35)', width: '80px', flexShrink: 0 }}>{formatDate(booking.session_date)}</div>
                  <div style={{ flex: 1 }}>
                    <span style={{ fontSize: '13px', fontWeight: 600, color: 'rgba(255,255,255,0.7)' }}>{booking.course_name}</span>
                    <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.35)', marginLeft: '8px' }}>with {booking.coach_name}</span>
                  </div>
                  <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.35)' }}>{formatTime(booking.start_time)}</div>
                  <span style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: STATUS_COLORS[booking.status] || 'rgba(255,255,255,0.3)', background: `${STATUS_COLORS[booking.status] || 'rgba(255,255,255,0.1)'}18`, borderRadius: '10px', padding: '2px 8px' }}>
                    {booking.status}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* QUICK LINKS */}
        <section>
          <h2 style={{ fontSize: '13px', fontWeight: 700, color: 'rgba(255,255,255,0.5)', margin: '0 0 16px', letterSpacing: '1.5px', textTransform: 'uppercase' }}>Quick Links</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '12px' }}>
            {QUICK_LINKS.map((link) => (
              <Link key={link.label} href={link.href} style={{ display: 'flex', alignItems: 'center', gap: '14px', background: NAVY, borderRadius: '14px', border: '1px solid rgba(255,255,255,0.08)', padding: '18px 20px', textDecoration: 'none' }}
                onMouseEnter={(e) => { const el = e.currentTarget as HTMLElement; el.style.borderColor = link.color + '60'; el.style.transform = 'translateY(-2px)' }}
                onMouseLeave={(e) => { const el = e.currentTarget as HTMLElement; el.style.borderColor = 'rgba(255,255,255,0.08)'; el.style.transform = 'translateY(0)' }}>
                <span style={{ width: '40px', height: '40px', borderRadius: '10px', background: `${link.color}18`, border: `1px solid ${link.color}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', flexShrink: 0 }}>{link.icon}</span>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: '#fff', marginBottom: '2px' }}>{link.label}</div>
                  <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)' }}>{link.desc}</div>
                </div>
              </Link>
            ))}
          </div>
        </section>

      </div>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,700;0,900;1,700&family=DM+Sans:wght@400;500;600;700&display=swap');`}</style>
    </div>
  )
}
