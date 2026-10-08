'use client'

import { useRouter } from 'next/navigation'
import { useT, useLocale } from '@/lib/i18n/provider'
import { tDb } from '@/lib/i18n'
import { isRealBooking } from '../real-booking'

type Student = { id: string; full_name: string; current_level: string | null }
type Booking = { id: string; status: string; is_trial?: boolean; students: Student }
type Session = {
  id: string; session_date: string; start_time: string; end_time: string
  status: string; enrolled_count: number; max_students: number
  course_types: { id?: string; name: string; slug: string }; bookings: Booking[]
}

export default function CoachScheduleClient({
  coach, sessions, today, offIds = [], loadFailed = false,
}: {
  coach: { id: string; first_name: string; last_name: string }
  sessions: Session[]
  today: string
  /** Sessions inside the coach's time off, not yet handled by the office. */
  offIds?: string[]
  /** The class read failed: say so instead of "no upcoming classes". */
  loadFailed?: boolean
}) {
  const t = useT()
  const router = useRouter()
  const locale = useLocale()

  const formatTime = (time: string) => {
    const [h, m] = time.split(':')
    const hour = parseInt(h)
    return `${hour > 12 ? hour - 12 : hour === 0 ? 12 : hour}:${m} ${hour >= 12 ? 'PM' : 'AM'}`
  }

  const formatDate = (d: string) => {
    const date = new Date(d + 'T12:00:00')
    return date.toLocaleDateString(locale, { weekday: 'short', month: 'short', day: 'numeric' })
  }

  const isToday = (d: string) => d === today

  // Group by date
  const grouped: Record<string, Session[]> = {}
  sessions.forEach(s => {
    if (!grouped[s.session_date]) grouped[s.session_date] = []
    grouped[s.session_date].push(s)
  })

  // Real bookings only (found 2026-10-04): in_cart / pending_payment /
  // pending_partner rows are not a swimmer the coach should expect.
  const activeBookings = (s: Session) => s.bookings.filter(isRealBooking)

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white font-['Playfair_Display']">{t('coach.schedule.title')}</h1>
        <p className="text-gray-400 mt-1">{t('coach.schedule.subtitle')}</p>
      </div>

      {loadFailed ? (
        <div className="bg-red-900/20 rounded-xl p-8 text-center border border-red-500/40" role="alert">
          <p className="text-red-200">{t('coach.loadFailed')}</p>
          <button onClick={() => router.refresh()} className="mt-4 bg-[#c9a84c] hover:bg-[#b8963e] text-[#111d38] text-sm font-semibold px-4 py-2 rounded-lg transition-all">{t('coach.reload')}</button>
        </div>
      ) : Object.keys(grouped).length === 0 ? (
        <div className="bg-[#111d38] rounded-xl p-12 text-center border border-[#1e3a6e]">
          <p className="text-gray-400">{t('coach.schedule.none')}</p>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).map(([date, daySessions]) => (
            <div key={date}>
              <div className="flex items-center gap-3 mb-3">
                <h2 className={`font-semibold text-sm uppercase tracking-wider ${isToday(date) ? 'text-[#c9a84c]' : 'text-gray-400'}`}>
                  {isToday(date) ? '📍 ' + t('coach.schedule.today') + ' — ' : ''}{formatDate(date)}
                </h2>
                <div className="flex-1 h-px bg-[#1e3a6e]" />
              </div>

              <div className="space-y-3">
                {daySessions.map(session => (
                  <div key={session.id} className="bg-[#111d38] rounded-xl border border-[#1e3a6e] p-5">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        {/* An assessment sits on a 1-on-1 slot; the Today tab already
                            names it, and the schedule said "1-on-1 private". */}
                        <p className="text-white font-semibold">{activeBookings(session).some(b => b.is_trial)
                          ? t('common.assessment')
                          : session.course_types?.id
                          ? tDb(locale, 'course_types', session.course_types.id, session.course_types.name)
                          : session.course_types?.name}</p>
                        <p className="text-[#c9a84c] text-sm mt-0.5">
                          {formatTime(session.start_time)} – {formatTime(session.end_time)}
                        </p>
                        {offIds.includes(session.id) && (
                          <span className="inline-block mt-1 text-[11px] text-amber-300 bg-amber-900/30 border border-amber-500/40 rounded-full px-2.5 py-0.5">{t('coach.offPending')}</span>
                        )}
                      </div>
                      <span className={`text-xs px-3 py-1 rounded-full ${
                        activeBookings(session).length >= session.max_students
                          ? 'bg-red-900/30 text-red-400'
                          : 'bg-[#1e3a6e] text-gray-300'
                      }`}>
                        {t('coach.schedule.seats', { n: activeBookings(session).length, max: session.max_students })}
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
                              {/* An unassigned swimmer read "Level " with no number (found 2026-10-04);
                                  same label as Today and Progress now. */}
                              <p className="text-gray-500 text-xs">{booking.students?.current_level ? t('coach.level', { n: booking.students.current_level }) : t('coach.progress.unassigned')}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-gray-500 text-sm">{t('coach.schedule.noStudents')}</p>
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
