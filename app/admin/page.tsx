import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { serviceClient } from '@/lib/api-auth'
import Link from 'next/link'
import { getT, tDb, dateTag } from '@/lib/i18n/all'
import { getAdminLocale } from '@/lib/i18n/admin-locale'

function formatTimeRange(start: string, end: string): string {
  const fmt = (t: string) => {
    const [h, m] = t.split(':').map(Number)
    const hour = h % 12 || 12
    return { text: `${hour}:${String(m).padStart(2, '0')}`, ampm: h >= 12 ? 'PM' : 'AM' }
  }
  const s = fmt(start)
  const e = fmt(end)
  if (s.ampm === e.ampm) return `${s.text} \u2013 ${e.text} ${e.ampm}`
  return `${s.text} ${s.ampm} \u2013 ${e.text} ${e.ampm}`
}

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

  const locale = await getAdminLocale()
  const t = getT(locale)

  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' })

  const [
    { count: totalMembers },
    { count: totalStudents },
    { count: pendingUpgradesCount },
    { data: pendingTimeOff },
    { data: todaySessions },
    { count: pendingTimeOffCount },
  ] = await Promise.all([
    supabase.from('parents').select('*', { count: 'exact', head: true }),
    supabase.from('students').select('*', { count: 'exact', head: true }).eq('is_active', true),
    // Both cards counted a .limit(5) list and so never showed more than 5
    // (found 2026-10-04). This list was never displayed: count it instead.
    supabase.from('students').select('*', { count: 'exact', head: true }).eq('upgrade_pending', true),
    supabase.from('coach_time_off').select('id, date, reason, coaches(first_name, last_name)').gte('date', today).order('date').limit(5),
    supabase.from('class_sessions').select('id, start_time, end_time, enrolled_count, max_students, course_types(id, name), coaches(first_name)').eq('session_date', today).neq('status', 'cancelled').gt('enrolled_count', 0).order('start_time'),
    // The time-off list above stops at 5 for display; the card needs the total.
    supabase.from('coach_time_off').select('*', { count: 'exact', head: true }).gte('date', today),
  ])

  // coach_applications has RLS on with zero policies, so the cookie-scoped
  // client above always reads 0 rows. This one query needs the service client.
  const { count: newApplications } = await serviceClient()
    .from('coach_applications')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'new')

  const studentsBySession: Record<string, string[]> = {}
  // An assessment rides on a 1-on-1 course type, so the course name alone
  // listed it as "1-on-1 Private".
  const assessmentSessions = new Set<string>()
  if (todaySessions && todaySessions.length > 0) {
    const { data: sessionBookings } = await supabase
      .from('bookings')
      .select('class_session_id, student_id, parent_id, is_trial')
      .in('class_session_id', todaySessions.map((s: any) => s.id))
      .eq('status', 'confirmed')
    const studentIds = [...new Set((sessionBookings || []).map((b: any) => b.student_id).filter(Boolean))]
    const parentIds = [...new Set((sessionBookings || []).map((b: any) => b.parent_id).filter(Boolean))]
    if (studentIds.length > 0) {
      const [{ data: studentRows }, { data: parentRows }] = await Promise.all([
        supabase.from('students').select('id, full_name, current_level').in('id', studentIds),
        parentIds.length > 0
          ? supabase.from('parents').select('id, first_name, last_name').in('id', parentIds)
          : Promise.resolve({ data: [] as any[] }),
      ])
      const studentById = new Map((studentRows || []).map((r: any) => [r.id, r]))
      const parentById = new Map((parentRows || []).map((r: any) => [r.id, r]))
      for (const b of (sessionBookings || [])) {
        if ((b as any).is_trial) assessmentSessions.add(b.class_session_id)
        const st = studentById.get(b.student_id)
        if (!st) continue
        const pa = parentById.get(b.parent_id)
        const parentName = pa ? `${pa.first_name ?? ''} ${pa.last_name ?? ''}`.trim() : ''
        const level = st.current_level ? ' · ' + t('admin.levelN', { n: st.current_level }) : ''
        const label = parentName ? `${parentName} — ${st.full_name}${level}` : `${st.full_name}${level}`
        if (!studentsBySession[b.class_session_id]) studentsBySession[b.class_session_id] = []
        studentsBySession[b.class_session_id].push(label)
      }
    }
  }

  const stats = [
    { label: t('admin.dash.totalMembers'), value: totalMembers ?? 0, href: '/admin/members', color: 'text-blue-400' },
    { label: t('admin.dash.activeStudents'), value: totalStudents ?? 0, href: '/admin/members', color: 'text-green-400' },
    { label: t('admin.dash.pendingUpgrades'), value: pendingUpgradesCount ?? 0, href: '/admin/reviews', color: 'text-[#c9a84c]' },
    { label: t('admin.dash.timeOffRequests'), value: pendingTimeOffCount ?? 0, href: '/admin/time-off', color: 'text-purple-400' },
    { label: t('admin.dash.newApplications'), value: newApplications ?? 0, href: '/admin/applications', color: 'text-orange-400' },
  ]

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white font-['Playfair_Display']">{t('admin.dash.title')}</h1>
        <p className="text-gray-400 mt-1">{new Date().toLocaleDateString(dateTag(locale, 'en-GB'), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Los_Angeles' })}</p>
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
            <h2 className="text-sm font-semibold text-[#c9a84c] uppercase tracking-wider">{t('admin.dash.todayClasses')}</h2>
            <Link href="/admin/schedule" className="text-gray-400 hover:text-white text-xs transition-colors">{t('admin.dash.viewAll')}</Link>
          </div>
          {!todaySessions || todaySessions.length === 0 ? (
            <p className="text-gray-400 text-sm">{t('admin.dash.noClasses')}</p>
          ) : (
            <div className="space-y-2">
              {todaySessions.map((s: any) => (
                <div key={s.id} className="flex items-center justify-between bg-[#0d1529] rounded-lg p-3">
                  <div>
                    <p className="text-white text-sm">{assessmentSessions.has(s.id) ? t('common.assessment') : (s.course_types?.id ? tDb(locale, 'course_types', s.course_types.id, s.course_types.name) : s.course_types?.name)}</p>
                    <p className="text-gray-400 text-xs">{t('admin.coachName', { name: s.coaches?.first_name ?? '' })} · {formatTimeRange(s.start_time, s.end_time)}</p>
                    <p className="text-[#c9a84c] text-xs mt-0.5">{(studentsBySession[s.id] || []).join(' / ')}</p>
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
            <h2 className="text-sm font-semibold text-[#c9a84c] uppercase tracking-wider">{t('admin.dash.upcomingTimeOff')}</h2>
            <Link href="/admin/time-off" className="text-gray-400 hover:text-white text-xs transition-colors">{t('admin.dash.viewAll')}</Link>
          </div>
          {!pendingTimeOff || pendingTimeOff.length === 0 ? (
            <p className="text-gray-400 text-sm">{t('admin.dash.noTimeOff')}</p>
          ) : (
            <div className="space-y-2">
              {pendingTimeOff.map((off: any) => (
                <div key={off.id} className="flex items-center justify-between bg-[#0d1529] rounded-lg p-3">
                  <div>
                    <p className="text-white text-sm">{t('admin.coachName', { name: `${off.coaches?.first_name ?? ''} ${off.coaches?.last_name ?? ''}`.trim() })}</p>
                    <p className="text-gray-400 text-xs">{new Date(off.date + 'T12:00:00').toLocaleDateString(dateTag(locale), { month: 'short', day: 'numeric' })}{off.reason ? ` · ${off.reason}` : ''}</p>
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
