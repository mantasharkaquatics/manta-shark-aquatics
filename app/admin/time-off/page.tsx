import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

export default async function AdminTimeOffPage() {
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

  const { data: timeOffList } = await supabase
    .from('coach_time_off')
    .select('id, date, reason, created_at, coaches(first_name, last_name, email)')
    .gte('date', today)
    .order('date')

  const formatDate = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'long', day: 'numeric' })

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white font-['Playfair_Display']">Coach Time Off</h1>
        <p className="text-gray-400 mt-1">Upcoming time off requests from all coaches</p>
      </div>

      {!timeOffList || timeOffList.length === 0 ? (
        <div className="bg-[#111d38] rounded-xl border border-[#1e3a6e] p-12 text-center">
          <p className="text-gray-400">No upcoming time off requests</p>
        </div>
      ) : (
        <div className="space-y-3">
          {timeOffList.map((item: any) => (
            <div key={item.id} className="bg-[#111d38] rounded-xl border border-[#1e3a6e] p-5 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-[#1e3a6e] flex items-center justify-center flex-shrink-0">
                  <span className="text-[#c9a84c] font-bold text-sm">{item.coaches?.first_name?.charAt(0)}</span>
                </div>
                <div>
                  <p className="text-white font-medium">Coach {item.coaches?.first_name} {item.coaches?.last_name}</p>
                  <p className="text-[#c9a84c] text-sm">{formatDate(item.date)}</p>
                  {item.reason && <p className="text-gray-400 text-xs mt-0.5">{item.reason}</p>}
                </div>
              </div>
              <span className="text-gray-500 text-xs">
                Requested {new Date(item.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
