import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

export default async function AdminSchedulePage() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } }
  )
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: admin } = await supabase.from('admins').select('id').eq('auth_user_id', user.id).single()
  if (!admin) redirect('/dashboard')

  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' })
  const in14Days = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' })

  const { data: rawSessions } = await supabase
    .from('class_sessions')
    .select('id, session_date, start_time, end_time, status, enrolled_count, max_students, course_types(name), coaches(first_name, last_name), bookings(id, status, students(full_name, current_level))')
    .gte('session_date', today)
    .lte('session_date', in14Days)
    .neq('status', 'cancelled')
    .order('session_date')
    .order('start_time')

  const sessions = (rawSessions || []).map((s: any) => ({
    ...s,
    course_types: Array.isArray(s.course_types) ? s.course_types[0] : s.course_types,
    coaches: Array.isArray(s.coaches) ? s.coaches[0] : s.coaches,
    bookings: (s.bookings || []).map((b: any) => ({
      ...b,
      students: Array.isArray(b.students) ? b.students[0] : b.students,
    })),
  }))

  const grouped: Record<string, typeof sessions> = {}
  sessions.forEach(s => {
    if (!grouped[s.session_date]) grouped[s.session_date] = []
    grouped[s.session_date].push(s)
  })

  const formatTime = (t: string) => {
    const [h, m] = t.split(':')
    const hour = parseInt(h)
    return `${hour > 12 ? hour - 12 : hour === 0 ? 12 : hour}:${m} ${hour >= 12 ? 'PM' : 'AM'}`
  }

  const formatDate = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white font-['Playfair_Display']">Schedule</h1>
        <p className="text-gray-400 mt-1">All classes for the next 14 days</p>
      </div>

      {Object.keys(grouped).length === 0 ? (
        <div className="bg-[#111d38] rounded-xl border border-[#1e3a6e] p-12 text-center">
          <p className="text-gray-400">No classes scheduled</p>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).map(([date, daySessions]) => (
            <div key={date}>
              <div className="flex items-center gap-3 mb-3">
                <h2 className={`font-semibold text-sm uppercase tracking-wider ${date === today ? 'text-[#c9a84c]' : 'text-gray-400'}`}>
                  {date === today ? '📍 Today — ' : ''}{formatDate(date)}
                </h2>
                <div className="flex-1 h-px bg-[#1e3a6e]" />
              </div>
              <div className="space-y-3">
                {daySessions.map(session => {
                  const active = session.bookings.filter((b: any) => b.status !== 'cancelled')
                  return (
                    <div key={session.id} className="bg-[#111d38] rounded-xl border border-[#1e3a6e] p-5">
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <p className="text-white font-semibold">{session.course_types?.name}</p>
                          <p className="text-[#c9a84c] text-sm">{formatTime(session.start_time)} – {formatTime(session.end_time)}</p>
                          <p className="text-gray-500 text-xs mt-0.5">Coach {session.coaches?.first_name} {session.coaches?.last_name}</p>
                        </div>
                        <span className={`text-xs px-3 py-1 rounded-full ${active.length >= session.max_students ? 'bg-red-900/30 text-red-400' : 'bg-[#1e3a6e] text-gray-300'}`}>
                          {active.length}/{session.max_students}
                        </span>
                      </div>
                      {active.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {active.map((b: any) => (
                            <span key={b.id} className="bg-[#0d1529] text-gray-300 text-xs px-3 py-1 rounded-full">
                              {b.students?.full_name} · L{b.students?.current_level}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
