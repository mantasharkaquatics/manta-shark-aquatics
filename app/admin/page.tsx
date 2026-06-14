import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import Link from 'next/link'

export default async function AdminDashboardPage() {
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

  const [
    { count: totalMembers },
    { count: totalStudents },
    { data: pendingUpgrades },
    { data: pendingTimeOff },
    { data: todaySessions },
  ] = await Promise.all([
    supabase.from('parents').select('*', { count: 'exact', head: true }),
    supabase.from('students').select('*', { count: 'exact', head: true }).eq('is_active', true),
    supabase.from('students').select('id, full_name, current_level, parent_id').eq('upgrade_pending', true).limit(5),
    supabase.from('coach_time_off').select('id, date, reason, coaches(first_name, last_name)').gte('date', today).order('date').limit(5),
    supabase.from('class_sessions').select('id, start_time, end_time, enrolled_count, max_students, course_types(name), coaches(first_name)').eq('session_date', today).neq('status', 'cancelled').order('start_time'),
  ])

  const stats = [
    { label: 'Total Members', value: totalMembers ?? 0, href: '/admin/members', color: 'text-blue-400' },
    { label: 'Active Students', value: totalStudents ?? 0, href: '/admin/members', color: 'text-green-400' },
    { label: 'Pending Upgrades', value: pendingUpgrades?.length ?? 0, href: '/admin/upgrades', color: 'text-[#c9a84c]' },
    { label: 'Time Off Requests', value: pendingTimeOff?.length ?? 0, href: '/admin/time-off', color: 'text-purple-400' },
  ]

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white font-['Playfair_Display']">Admin Dashboard</h1>
        <p className="text-gray-400 mt-1">{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'America/Los_Angeles' })}</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {stats.map(stat => (
          <Link key={stat.label} href={stat.href}
            className="bg-[#111d38] rounded-xl border border-[#1e3a6e] p-5 hover:border-[#c9a84c]/50 transition-all">
            <p className={`text-3xl font-bold ${stat.color}`}>{stat.value}</p>
            <p className="text-gray-400 text-sm mt-1">{stat.label}</p>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Today's schedule */}
        <div className="bg-[#111d38] rounded-xl border border-[#1e3a6e] p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-[#c9a84c] uppercase tracking-wider">Today's Classes</h2>
            <Link href="/admin/schedule" className="text-gray-400 hover:text-white text-xs transition-colors">View all →</Link>
          </div>
          {!todaySessions || todaySessions.length === 0 ? (
            <p className="text-gray-400 text-sm">No classes today</p>
          ) : (
            <div className="space-y-2">
              {todaySessions.map((s: any) => (
                <div key={s.id} className="flex items-center justify-between bg-[#0d1529] rounded-lg p-3">
                  <div>
                    <p className="text-white text-sm">{s.course_types?.name}</p>
                    <p className="text-gray-400 text-xs">Coach {s.coaches?.first_name} · {s.start_time?.slice(0,5)}</p>
                  </div>
                  <span className="text-gray-400 text-xs">{s.enrolled_count}/{s.max_students}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Pending time off */}
        <div className="bg-[#111d38] rounded-xl border border-[#1e3a6e] p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-[#c9a84c] uppercase tracking-wider">Upcoming Time Off</h2>
            <Link href="/admin/time-off" className="text-gray-400 hover:text-white text-xs transition-colors">View all →</Link>
          </div>
          {!pendingTimeOff || pendingTimeOff.length === 0 ? (
            <p className="text-gray-400 text-sm">No upcoming time off</p>
          ) : (
            <div className="space-y-2">
              {pendingTimeOff.map((t: any) => (
                <div key={t.id} className="flex items-center justify-between bg-[#0d1529] rounded-lg p-3">
                  <div>
                    <p className="text-white text-sm">Coach {t.coaches?.first_name} {t.coaches?.last_name}</p>
                    <p className="text-gray-400 text-xs">{new Date(t.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}{t.reason ? ` · ${t.reason}` : ''}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
