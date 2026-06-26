import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default async function AdminSchedulePage() {
  const cookieStore = await cookies()
  const supabaseAuth = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } }
  )
  const { data: { user } } = await supabaseAuth.auth.getUser()
  if (!user) redirect('/login')
  const { data: admin } = await supabaseAuth.from('admins').select('id').eq('auth_user_id', user.id).single()
  if (!admin) redirect('/dashboard')

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const todayStart = new Date().toISOString()
  const todayDate = new Date().toISOString().split('T')[0]

  const [
    { data: pendingInvites },
    { data: pendingReschedules },
    { data: todayCancelled },
    { data: todayRescheduled },
  ] = await Promise.all([
    supabase.from('bookings')
      .select('id, pending_expires_at, class_session_id, parent_id, partner_parent_id, student_id, students(full_name), parents(first_name, last_name), class_sessions(session_date, start_time, course_types(name), coaches(first_name))')
      .eq('status', 'pending_partner').eq('pending_action', 'confirm')
      .gt('pending_expires_at', new Date().toISOString()).order('pending_expires_at'),
    supabase.from('bookings')
      .select('id, pending_action, pending_new_session_id, class_session_id, parent_id, student_id, students(full_name), parents(first_name, last_name), class_sessions(session_date, start_time, course_types(name), coaches(first_name))')
      .in('pending_action', ['reschedule', 'reschedule_initiator']),
    supabase.from('bookings')
      .select('id, updated_at, student_id, parent_id, class_session_id, students(full_name), parents(first_name, last_name), class_sessions(session_date, start_time, course_types(name), coaches(first_name))')
      .eq('status', 'cancelled').gte('updated_at', todayDate + 'T00:00:00.000Z')
      .order('updated_at', { ascending: false }).limit(20),
    supabase.from('bookings')
      .select('id, updated_at, student_id, parent_id, class_session_id, students(full_name), parents(first_name, last_name), class_sessions(session_date, start_time, course_types(name), coaches(first_name))')
      .eq('status', 'rescheduled').gte('updated_at', todayDate + 'T00:00:00.000Z')
      .order('updated_at', { ascending: false }).limit(20),
  ])

  const newSessionIds = [...new Set((pendingReschedules || []).map((b: any) => b.pending_new_session_id).filter(Boolean))]
  const newSessionMap: Record<string, any> = {}
  if (newSessionIds.length > 0) {
    const { data: newSessions } = await supabase.from('class_sessions')
      .select('id, session_date, start_time, course_types(name), coaches(first_name)').in('id', newSessionIds)
    for (const s of newSessions || []) newSessionMap[(s as any).id] = s
  }

  const n = (x: any) => Array.isArray(x) ? x[0] : x
  const fTime = (t: string) => {
    if (!t) return ''
    const [h, m] = t.split(':')
    const hour = parseInt(h)
    return `${hour > 12 ? hour - 12 : hour === 0 ? 12 : hour}:${m} ${hour >= 12 ? 'PM' : 'AM'}`
  }
  const fDate = (d: string) => d ? new Date(d + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) : ''
  const fDT = (iso: string) => iso ? new Date(iso).toLocaleString('en-US', { timeZone: 'America/Los_Angeles', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true }) : ''
  const minsLeft = (exp: string) => Math.max(0, Math.floor((new Date(exp).getTime() - Date.now()) / 60000))

  const pendingCount = (pendingInvites?.length || 0) + (pendingReschedules?.length || 0)

  return (
    <div>
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white font-['Playfair_Display']">Activity Monitor</h1>
          <p className="text-gray-400 mt-1">即時掌握所有待處理與異動狀況</p>
        </div>
        {pendingCount > 0 && (
          <div className="flex items-center gap-2 bg-yellow-900/30 border border-yellow-600/40 rounded-xl px-4 py-2">
            <div className="w-2 h-2 rounded-full bg-yellow-400" />
            <span className="text-yellow-400 text-sm font-semibold">{pendingCount} 項待處理</span>
          </div>
        )}
      </div>

      <div className="space-y-8">
        <section>
          <div className="flex items-center gap-3 mb-4">
            <h2 className="text-xs font-bold uppercase tracking-widest text-purple-400">⏳ 待確認邀請</h2>
            {pendingInvites && pendingInvites.length > 0 && <span className="bg-purple-900/40 text-purple-400 text-xs px-2 py-0.5 rounded-full font-semibold">{pendingInvites.length}</span>}
            <div className="flex-1 h-px bg-[#1e3a6e]" />
          </div>
          {!pendingInvites || pendingInvites.length === 0 ? (
            <div className="bg-[#111d38] rounded-xl border border-[#1e3a6e] p-6 text-center text-gray-500 text-sm">無待確認邀請</div>
          ) : (
            <div className="space-y-3">
              {pendingInvites.map((b: any) => {
                const student = n(b.students); const parent = n(b.parents)
                const cs = n(b.class_sessions); const ct = n(cs?.course_types); const coach = n(cs?.coaches)
                const mins = minsLeft(b.pending_expires_at)
                return (
                  <div key={b.id} className="bg-[#111d38] rounded-xl border border-purple-800/40 p-5 flex items-start justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-purple-400 text-xs font-bold uppercase tracking-wide">1-on-2 邀請待確認</span>
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${mins <= 3 ? 'bg-red-900/40 text-red-400' : 'bg-yellow-900/30 text-yellow-400'}`}>剩 {mins} 分鐘</span>
                      </div>
                      <p className="text-white font-semibold">{student?.full_name} <span className="text-gray-400 font-normal text-sm">({parent?.first_name} {parent?.last_name})</span></p>
                      <p className="text-[#c9a84c] text-sm mt-0.5">{ct?.name} · Coach {coach?.first_name} · {fDate(cs?.session_date)} {fTime(cs?.start_time)}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>

        <section>
          <div className="flex items-center gap-3 mb-4">
            <h2 className="text-xs font-bold uppercase tracking-widest text-yellow-400">🔄 待確認改期</h2>
            {pendingReschedules && pendingReschedules.length > 0 && <span className="bg-yellow-900/40 text-yellow-400 text-xs px-2 py-0.5 rounded-full font-semibold">{pendingReschedules.length}</span>}
            <div className="flex-1 h-px bg-[#1e3a6e]" />
          </div>
          {!pendingReschedules || pendingReschedules.length === 0 ? (
            <div className="bg-[#111d38] rounded-xl border border-[#1e3a6e] p-6 text-center text-gray-500 text-sm">無待確認改期</div>
          ) : (
            <div className="space-y-3">
              {pendingReschedules.map((b: any) => {
                const student = n(b.students); const parent = n(b.parents)
                const cs = n(b.class_sessions); const ct = n(cs?.course_types); const coach = n(cs?.coaches)
                const newCs = b.pending_new_session_id ? newSessionMap[b.pending_new_session_id] : null
                const newCt = newCs ? n(newCs.course_types) : null; const newCoach = newCs ? n(newCs.coaches) : null
                const isInitiator = b.pending_action === 'reschedule_initiator'
                return (
                  <div key={b.id} className="bg-[#111d38] rounded-xl border border-yellow-800/30 p-5">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-yellow-400 text-xs font-bold uppercase tracking-wide">{isInitiator ? '發起改期 — 等待對方確認' : '收到改期請求 — 待確認'}</span>
                    </div>
                    <p className="text-white font-semibold">{student?.full_name} <span className="text-gray-400 font-normal text-sm">({parent?.first_name} {parent?.last_name})</span></p>
                    <div className="flex items-center gap-3 mt-1 flex-wrap">
                      <span className="text-gray-500 text-sm line-through">{ct?.name} · Coach {coach?.first_name} · {fDate(cs?.session_date)} {fTime(cs?.start_time)}</span>
                      <span className="text-gray-500">→</span>
                      <span className="text-[#c9a84c] text-sm">{newCt?.name || ct?.name} · Coach {newCoach?.first_name || coach?.first_name} · {fDate(newCs?.session_date)} {fTime(newCs?.start_time)}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>

        <section>
          <div className="flex items-center gap-3 mb-4">
            <h2 className="text-xs font-bold uppercase tracking-widest text-red-400">❌ 今日取消</h2>
            {todayCancelled && todayCancelled.length > 0 && <span className="bg-red-900/40 text-red-400 text-xs px-2 py-0.5 rounded-full font-semibold">{todayCancelled.length}</span>}
            <div className="flex-1 h-px bg-[#1e3a6e]" />
          </div>
          {!todayCancelled || todayCancelled.length === 0 ? (
            <div className="bg-[#111d38] rounded-xl border border-[#1e3a6e] p-6 text-center text-gray-500 text-sm">今日無取消</div>
          ) : (
            <div className="space-y-3">
              {todayCancelled.map((b: any) => {
                const student = n(b.students); const parent = n(b.parents)
                const cs = n(b.class_sessions); const ct = n(cs?.course_types); const coach = n(cs?.coaches)
                return (
                  <div key={b.id} className="bg-[#111d38] rounded-xl border border-red-900/30 p-5 flex items-start justify-between gap-4">
                    <div>
                      <p className="text-white font-semibold">{student?.full_name} <span className="text-gray-400 font-normal text-sm">({parent?.first_name} {parent?.last_name})</span></p>
                      <p className="text-red-400 text-sm mt-0.5">{ct?.name} · Coach {coach?.first_name} · {fDate(cs?.session_date)} {fTime(cs?.start_time)}</p>
                    </div>
                    <span className="text-gray-500 text-xs shrink-0">{fDT(b.updated_at)}</span>
                  </div>
                )
              })}
            </div>
          )}
        </section>

        <section>
          <div className="flex items-center gap-3 mb-4">
            <h2 className="text-xs font-bold uppercase tracking-widest text-green-400">✅ 今日改期完成</h2>
            {todayRescheduled && todayRescheduled.length > 0 && <span className="bg-green-900/40 text-green-400 text-xs px-2 py-0.5 rounded-full font-semibold">{todayRescheduled.length}</span>}
            <div className="flex-1 h-px bg-[#1e3a6e]" />
          </div>
          {!todayRescheduled || todayRescheduled.length === 0 ? (
            <div className="bg-[#111d38] rounded-xl border border-[#1e3a6e] p-6 text-center text-gray-500 text-sm">今日無改期</div>
          ) : (
            <div className="space-y-3">
              {todayRescheduled.map((b: any) => {
                const student = n(b.students); const parent = n(b.parents)
                const cs = n(b.class_sessions); const ct = n(cs?.course_types); const coach = n(cs?.coaches)
                return (
                  <div key={b.id} className="bg-[#111d38] rounded-xl border border-green-900/30 p-5 flex items-start justify-between gap-4">
                    <div>
                      <p className="text-white font-semibold">{student?.full_name} <span className="text-gray-400 font-normal text-sm">({parent?.first_name} {parent?.last_name})</span></p>
                      <p className="text-green-400 text-sm mt-0.5">{ct?.name} · Coach {coach?.first_name} · {fDate(cs?.session_date)} {fTime(cs?.start_time)}</p>
                    </div>
                    <span className="text-gray-500 text-xs shrink-0">{fDT(b.updated_at)}</span>
                  </div>
                )
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
