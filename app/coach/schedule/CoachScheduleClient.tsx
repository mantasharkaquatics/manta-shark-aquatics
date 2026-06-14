'use client'

type Student = { id: string; full_name: string; current_level: string }
type Booking = { id: string; status: string; students: Student }
type Session = {
  id: string; session_date: string; start_time: string; end_time: string
  status: string; enrolled_count: number; max_students: number
  course_types: { name: string; slug: string }; bookings: Booking[]
}

export default function CoachScheduleClient({
  coach, sessions, today
}: {
  coach: { id: string; first_name: string; last_name: string }
  sessions: Session[]
  today: string
}) {
  const formatTime = (t: string) => {
    const [h, m] = t.split(':')
    const hour = parseInt(h)
    return `${hour > 12 ? hour - 12 : hour === 0 ? 12 : hour}:${m} ${hour >= 12 ? 'PM' : 'AM'}`
  }

  const formatDate = (d: string) => {
    const date = new Date(d + 'T12:00:00')
    return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
  }

  const isToday = (d: string) => d === today

  // Group by date
  const grouped: Record<string, Session[]> = {}
  sessions.forEach(s => {
    if (!grouped[s.session_date]) grouped[s.session_date] = []
    grouped[s.session_date].push(s)
  })

  const activeBookings = (s: Session) => s.bookings.filter(b => b.status !== 'cancelled')

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white font-['Playfair_Display']">Schedule</h1>
        <p className="text-gray-400 mt-1">Your upcoming classes for the next 30 days</p>
      </div>

      {Object.keys(grouped).length === 0 ? (
        <div className="bg-[#111d38] rounded-xl p-12 text-center border border-[#1e3a6e]">
          <p className="text-gray-400">No upcoming classes scheduled</p>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).map(([date, daySessions]) => (
            <div key={date}>
              <div className="flex items-center gap-3 mb-3">
                <h2 className={`font-semibold text-sm uppercase tracking-wider ${isToday(date) ? 'text-[#c9a84c]' : 'text-gray-400'}`}>
                  {isToday(date) ? '📍 Today — ' : ''}{formatDate(date)}
                </h2>
                <div className="flex-1 h-px bg-[#1e3a6e]" />
              </div>

              <div className="space-y-3">
                {daySessions.map(session => (
                  <div key={session.id} className="bg-[#111d38] rounded-xl border border-[#1e3a6e] p-5">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <p className="text-white font-semibold">{session.course_types?.name}</p>
                        <p className="text-[#c9a84c] text-sm mt-0.5">
                          {formatTime(session.start_time)} – {formatTime(session.end_time)}
                        </p>
                      </div>
                      <span className={`text-xs px-3 py-1 rounded-full ${
                        activeBookings(session).length >= session.max_students
                          ? 'bg-red-900/30 text-red-400'
                          : 'bg-[#1e3a6e] text-gray-300'
                      }`}>
                        {activeBookings(session).length}/{session.max_students} students
                      </span>
                    </div>

                    {activeBookings(session).length > 0 ? (
                      <div className="space-y-2">
                        {activeBookings(session).map(booking => (
                          <div key={booking.id} className="flex items-center gap-3 bg-[#0d1529] rounded-lg p-3">
                            <div className="w-7 h-7 rounded-full bg-[#1e3a6e] flex items-center justify-center flex-shrink-0">
                              <span className="text-[#c9a84c] text-xs font-bold">
                                {booking.students?.full_name?.charAt(0)}
                              </span>
                            </div>
                            <div>
                              <p className="text-white text-sm">{booking.students?.full_name}</p>
                              <p className="text-gray-500 text-xs">Level {booking.students?.current_level}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-gray-500 text-sm">No students booked yet</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
