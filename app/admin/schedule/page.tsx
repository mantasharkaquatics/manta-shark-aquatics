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

  const todayDate = new Date().toISOString().split('T')[0]
  const nowIso = new Date().toISOString()

  // Step 1: 查 bookings（不帶 join）
  const [
    { data: rawInvites },
    { data: rawReschedules },
    { data: rawCancelled },
    { data: rawRescheduled },
  ] = await Promise.all([
    supabase.from('bookings')
      .select('id, pending_expires_at, class_session_id, parent_id, partner_parent_id, student_id')
      .eq('status', 'pending_partner').eq('pending_action', 'confirm')
      .gt('pending_expires_at', nowIso).order('pending_expires_at'),
    supabase.from('bookings')
      .select('id, pending_action, pending_new_session_id, class_session_id, parent_id, student_id')
      .in('pending_action', ['reschedule', 'reschedule_initiator']),
    supabase.from('bookings')
      .select('id, updated_at, student_id, parent_id, class_session_id')
      .eq('status', 'cancelled').gte('updated_at', todayDate + 'T00:00:00.000Z')
      .order('updated_at', { ascending: false }).limit(20),
    supabase.from('bookings')
      .select('id, updated_at, student_id, parent_id, class_session_id, pending_new_session_id, pending_action')
      .eq('status', 'cancelled').in('pending_action', ['reschedule', 'reschedule_initiator'])
      .gte('updated_at', todayDate + 'T00:00:00.000Z')
      .order('updated_at', { ascending: false }).limit(20),
  ])

  // Step 2: 收集所有需要查的 IDs
  const allBookings = [...(rawInvites||[]), ...(rawReschedules||[]), ...(rawCancelled||[]), ...(rawRescheduled||[])]
  const sessionIds = [...new Set(allBookings.map((b:any) => b.class_session_id).filter(Boolean))]
  const studentIds = [...new Set(allBookings.map((b:any) => b.student_id).filter(Boolean))]
  const parentIds = [...new Set(allBookings.map((b:any) => b.parent_id).filter(Boolean))]
  const newSessionIds = [...new Set([
    ...(rawReschedules||[]).map((b:any) => b.pending_new_session_id),
    ...(rawRescheduled||[]).map((b:any) => b.pending_new_session_id),
  ].filter(Boolean))]
  const allSessionIds = [...new Set([...sessionIds, ...newSessionIds])]

  // Step 3: 分開查
  const [{ data: sessionsData }, { data: studentsData }, { data: parentsData }] = await Promise.all([
    allSessionIds.length > 0
      ? supabase.from('class_sessions').select('id, session_date, start_time, course_types(name), coaches(first_name)').in('id', allSessionIds)
      : Promise.resolve({ data: [] }),
    studentIds.length > 0
      ? supabase.from('students').select('id, full_name').in('id', studentIds)
      : Promise.resolve({ data: [] }),
    parentIds.length > 0
      ? supabase.from('parents').select('id, first_name, last_name').in('id', parentIds)
      : Promise.resolve({ data: [] }),
  ])

  const sessionMap: Record<string, any> = {}
  for (const s of sessionsData || []) {
    const ct = Array.isArray((s as any).course_types) ? (s as any).course_types[0] : (s as any).course_types
    const coach = Array.isArray((s as any).coaches) ? (s as any).coaches[0] : (s as any).coaches
    sessionMap[(s as any).id] = { ...(s as any), ct, coach }
  }
  const studentMap: Record<string, any> = {}
  for (const s of studentsData || []) studentMap[(s as any).id] = s
  const parentMap: Record<string, any> = {}
  for (const p of parentsData || []) parentMap[(p as any).id] = p

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

  const pendingCount = (rawInvites?.length || 0) + (rawReschedules?.length || 0)

  const renderBookingInfo = (b: any) => {
    const cs = sessionMap[b.class_session_id]
    const student = studentMap[b.student_id]
    const parent = parentMap[b.parent_id]
    return { cs, student, parent }
  }

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
            {rawInvites && rawInvites.length > 0 && <span className="bg-purple-900/40 text-purple-400 text-xs px-2 py-0.5 rounded-full font-semibold">{rawInvites.length}</span>}
            <div className="flex-1 h-px bg-[#1e3a6e]" />
          </div>
          {!rawInvites || rawInvites.length === 0 ? (
            <div className="bg-[#111d38] rounded-xl border border-[#1e3a6e] p-6 text-center text-gray-500 text-sm">無待確認邀請</div>
          ) : (
            <div className="space-y-3">
              {rawInvites.map((b: any) => {
                const { cs, student, parent } = renderBookingInfo(b)
                const mins = minsLeft(b.pending_expires_at)
                return (
                  <div key={b.id} className="bg-[#111d38] rounded-xl border border-purple-800/40 p-5 flex items-start justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-purple-400 text-xs font-bold uppercase tracking-wide">1-on-2 邀請待確認</span>
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${mins <= 3 ? 'bg-red-900/40 text-red-400' : 'bg-yellow-900/30 text-yellow-400'}`}>剩 {mins} 分鐘</span>
                      </div>
                      <p className="text-white font-semibold">{student?.full_name} <span className="text-gray-400 font-normal text-sm">({parent?.first_name} {parent?.last_name})</span></p>
                      <p className="text-[#c9a84c] text-sm mt-0.5">{cs?.ct?.name} · Coach {cs?.coach?.first_name} · {fDate(cs?.session_date)} {fTime(cs?.start_time)}</p>
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
            {rawReschedules && rawReschedules.length > 0 && <span className="bg-yellow-900/40 text-yellow-400 text-xs px-2 py-0.5 rounded-full font-semibold">{rawReschedules.length}</span>}
            <div className="flex-1 h-px bg-[#1e3a6e]" />
          </div>
          {!rawReschedules || rawReschedules.length === 0 ? (
            <div className="bg-[#111d38] rounded-xl border border-[#1e3a6e] p-6 text-center text-gray-500 text-sm">無待確認改期</div>
          ) : (
            <div className="space-y-3">
              {(() => {
                // merge 同 class_session_id + pending_new_session_id 的兩筆
                const merged: Record<string, any[]> = {}
                for (const b of rawReschedules) {
                  const key = (b.class_session_id || '') + '|' + (b.pending_new_session_id || '')
                  if (!merged[key]) merged[key] = []
                  merged[key].push(b)
                }
                return Object.values(merged).map((group: any[]) => {
                  const initiator = group.find((b:any) => b.pending_action === 'reschedule_initiator') || group[0]
                  const recipient = group.find((b:any) => b.pending_action === 'reschedule')
                  const cs = sessionMap[initiator.class_session_id]
                  const newCs = initiator.pending_new_session_id ? sessionMap[initiator.pending_new_session_id] : null
                  const iStudent = studentMap[initiator.student_id]
                  const iParent = parentMap[initiator.parent_id]
                  const rStudent = recipient ? studentMap[recipient.student_id] : null
                  const rParent = recipient ? parentMap[recipient.parent_id] : null
                  return (
                    <div key={initiator.id} className="bg-[#111d38] rounded-xl border border-yellow-800/30 p-5">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-yellow-400 text-xs font-bold uppercase tracking-wide">待確認改期</span>
                      </div>
                      <div className="flex items-center gap-3 mt-1 flex-wrap mb-3">
                        <span className="text-gray-500 text-sm line-through">{cs?.ct?.name} · Coach {cs?.coach?.first_name} · {fDate(cs?.session_date)} {fTime(cs?.start_time)}</span>
                        <span className="text-gray-500">→</span>
                        <span className="text-[#c9a84c] text-sm">{newCs?.ct?.name || cs?.ct?.name} · Coach {newCs?.coach?.first_name || cs?.coach?.first_name} · {fDate(newCs?.session_date)} {fTime(newCs?.start_time)}</span>
                      </div>
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-yellow-400 font-semibold w-16 shrink-0">發起方</span>
                          <span className="text-white text-sm font-semibold">{iStudent?.full_name}</span>
                          <span className="text-gray-400 text-xs">({iParent?.first_name} {iParent?.last_name})</span>
                        </div>
                        {rStudent && (
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-purple-400 font-semibold w-16 shrink-0">待確認</span>
                            <span className="text-white text-sm font-semibold">{rStudent?.full_name}</span>
                            <span className="text-gray-400 text-xs">({rParent?.first_name} {rParent?.last_name})</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })
              })()}
            </div>
          )}
        </section>

        <section>
          <div className="flex items-center gap-3 mb-4">
            <h2 className="text-xs font-bold uppercase tracking-widest text-red-400">❌ 今日取消</h2>
            {rawCancelled && rawCancelled.length > 0 && <span className="bg-red-900/40 text-red-400 text-xs px-2 py-0.5 rounded-full font-semibold">{rawCancelled.length}</span>}
            <div className="flex-1 h-px bg-[#1e3a6e]" />
          </div>
          {!rawCancelled || rawCancelled.length === 0 ? (
            <div className="bg-[#111d38] rounded-xl border border-[#1e3a6e] p-6 text-center text-gray-500 text-sm">今日無取消</div>
          ) : (
            <div className="space-y-3">
              {rawCancelled.map((b: any) => {
                const { cs, student, parent } = renderBookingInfo(b)
                return (
                  <div key={b.id} className="bg-[#111d38] rounded-xl border border-red-900/30 p-5 flex items-start justify-between gap-4">
                    <div>
                      <p className="text-white font-semibold">{student?.full_name} <span className="text-gray-400 font-normal text-sm">({parent?.first_name} {parent?.last_name})</span></p>
                      <p className="text-red-400 text-sm mt-0.5">{cs?.ct?.name} · Coach {cs?.coach?.first_name} · {fDate(cs?.session_date)} {fTime(cs?.start_time)}</p>
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
            {rawRescheduled && rawRescheduled.length > 0 && <span className="bg-green-900/40 text-green-400 text-xs px-2 py-0.5 rounded-full font-semibold">{rawRescheduled.length}</span>}
            <div className="flex-1 h-px bg-[#1e3a6e]" />
          </div>
          {!rawRescheduled || rawRescheduled.length === 0 ? (
            <div className="bg-[#111d38] rounded-xl border border-[#1e3a6e] p-6 text-center text-gray-500 text-sm">今日無改期</div>
          ) : (
            <div className="space-y-3">
              {(() => {
                // merge 同 class_session_id + pending_new_session_id
                const merged: Record<string, any[]> = {}
                for (const b of rawRescheduled) {
                  const key = (b.class_session_id || '') + '|' + (b.pending_new_session_id || '')
                  if (!merged[key]) merged[key] = []
                  merged[key].push(b)
                }
                return Object.values(merged).map((group: any[]) => {
                  const b0 = group[0]
                  const cs = sessionMap[b0.class_session_id]
                  const newCs = b0.pending_new_session_id ? sessionMap[b0.pending_new_session_id] : null
                  const names = group.map((b:any) => {
                    const s = studentMap[b.student_id]
                    const p = parentMap[b.parent_id]
                    return s ? `${s.full_name} (${p?.first_name} ${p?.last_name})` : ''
                  }).filter(Boolean).join('、')
                  return (
                    <div key={b0.id} className="bg-[#111d38] rounded-xl border border-green-900/30 p-5 flex items-start justify-between gap-4">
                      <div>
                        <p className="text-white font-semibold text-sm">{names}</p>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <span className="text-gray-500 text-sm line-through">{cs?.ct?.name} · Coach {cs?.coach?.first_name} · {fDate(cs?.session_date)} {fTime(cs?.start_time)}</span>
                          {newCs && <><span className="text-gray-500">→</span><span className="text-green-400 text-sm">{fDate(newCs?.session_date)} {fTime(newCs?.start_time)}</span></>}
                        </div>
                      </div>
                      <span className="text-gray-500 text-xs shrink-0">{fDT(b0.updated_at)}</span>
                    </div>
                  )
                })
              })()}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
