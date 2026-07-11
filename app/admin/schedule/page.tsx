import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { getTodayLA } from '@/lib/date'

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

  const todayDate = getTodayLA()
  const nowIso = new Date().toISOString()

  // Step 1: fetch bookings (no joins)
  const [
    { data: rawInvites },
    { data: rawReschedules },
    { data: rawCancelled },
    { data: rawRescheduled },
    { data: rawNewBookings },
  ] = await Promise.all([
    supabase.from('bookings')
      .select('id, pending_expires_at, class_session_id, parent_id, partner_parent_id, partner_booking_id, student_id')
      .eq('status', 'pending_partner').eq('pending_action', 'confirm')
      .gt('pending_expires_at', nowIso).order('pending_expires_at'),
    supabase.from('bookings')
      .select('id, pending_action, pending_new_session_id, class_session_id, parent_id, student_id, pending_expires_at')
      .in('pending_action', ['reschedule', 'reschedule_initiator']),
    supabase.from('bookings')
      .select('id, updated_at, student_id, parent_id, class_session_id, cancellation_reason')
      .eq('status', 'cancelled').is('pending_action', null)
      .not('lesson_credit_id', 'is', null)
      .or('cancellation_reason.is.null,cancellation_reason.neq.rescheduled')
      .gte('updated_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
      .order('updated_at', { ascending: false }).limit(50),
    supabase.from('bookings')
      .select('id, updated_at, student_id, parent_id, class_session_id, pending_new_session_id, pending_action, original_booking_id')
      .eq('status', 'cancelled').eq('cancellation_reason', 'rescheduled')
      .gte('updated_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
      .order('updated_at', { ascending: true }).limit(50),
    supabase.from('bookings')
      .select('id, created_at, student_id, parent_id, class_session_id, original_booking_id')
      .eq('status', 'confirmed').is('original_booking_id', null)
      .is('cancellation_reason', null)
      .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
      .order('created_at', { ascending: false }).limit(50),
  ])

  // Step 2: collect all IDs to fetch
  const allBookings = [...(rawInvites||[]), ...(rawReschedules||[]), ...(rawCancelled||[]), ...(rawRescheduled||[]), ...(rawNewBookings||[])]
  const sessionIds = [...new Set(allBookings.map((b:any) => b.class_session_id).filter(Boolean))]
  const studentIds = [...new Set(allBookings.map((b:any) => b.student_id).filter(Boolean))]
  const parentIds = [...new Set(allBookings.map((b:any) => b.parent_id).filter(Boolean))]
  const newSessionIds = [...new Set([
    ...(rawReschedules||[]).map((b:any) => b.pending_new_session_id),
    ...(rawRescheduled||[]).map((b:any) => b.pending_new_session_id),
  ].filter(Boolean))]
  const allSessionIds = [...new Set([...sessionIds, ...newSessionIds])]

  // Step 3: fetch separately
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

  // Fetch initiator parent and student (via partner_parent_id and partner_booking_id)
  const partnerParentIds = [...new Set((rawInvites||[]).map((b:any) => b.partner_parent_id).filter(Boolean))]
  const partnerBookingIds = [...new Set((rawInvites||[]).map((b:any) => b.partner_booking_id).filter(Boolean))]
  const [{ data: partnerParentsData }, { data: partnerBookingsData }] = await Promise.all([
    partnerParentIds.length > 0
      ? supabase.from('parents').select('id, first_name, last_name').in('id', partnerParentIds)
      : Promise.resolve({ data: [] }),
    partnerBookingIds.length > 0
      ? supabase.from('bookings').select('id, student_id').in('id', partnerBookingIds)
      : Promise.resolve({ data: [] }),
  ])
  const partnerParentMap: Record<string, any> = {}
  for (const p of partnerParentsData || []) partnerParentMap[(p as any).id] = p
  const partnerBookingStudentMap: Record<string, string> = {}
  for (const b of partnerBookingsData || []) {
    partnerBookingStudentMap[(b as any).id] = (b as any).student_id
  }


  const sessionMap: Record<string, any> = {}
  for (const s of sessionsData || []) {
    const ct = Array.isArray((s as any).course_types) ? (s as any).course_types[0] : (s as any).course_types
    const coach = Array.isArray((s as any).coaches) ? (s as any).coaches[0] : (s as any).coaches
    sessionMap[(s as any).id] = { ...(s as any), ct, coach }
  }
  const studentMap: Record<string, any> = {}
  for (const s of studentsData || []) studentMap[(s as any).id] = s
  // Backfill initiator student
  const initiatorStudentIds = [...new Set(Object.values(partnerBookingStudentMap).filter(Boolean))]
  if (initiatorStudentIds.length > 0) {
    const { data: initiatorStudentsData } = await supabase.from('students').select('id, full_name').in('id', initiatorStudentIds)
    for (const s of initiatorStudentsData || []) studentMap[(s as any).id] = s
  }
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

  const mergedRescheduleCount = (() => {
    const merged: Record<string, boolean> = {}
    for (const b of rawReschedules || []) {
      const key = (b.class_session_id || '') + '|' + (b.pending_new_session_id || '')
      merged[key] = true
    }
    return Object.keys(merged).length
  })()
  const pendingCount = (rawInvites?.length || 0) + mergedRescheduleCount

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
          <p className="text-gray-400 mt-1">A live view of everything pending and every recent change</p>
        </div>
        {pendingCount > 0 && (
          <div className="flex items-center gap-2 bg-yellow-900/30 border border-yellow-600/40 rounded-xl px-4 py-2">
            <div className="w-2 h-2 rounded-full bg-yellow-400" />
            <span className="text-yellow-400 text-sm font-semibold">{pendingCount} pending</span>
          </div>
        )}
      </div>

      <div className="space-y-8">
        <section>
          <div className="flex items-center gap-3 mb-4">
            <h2 className="text-xs font-bold uppercase tracking-widest text-purple-400">⏳ Pending Invitations</h2>
            {rawInvites && rawInvites.length > 0 && <span className="bg-purple-900/40 text-purple-400 text-xs px-2 py-0.5 rounded-full font-semibold">{rawInvites.length}</span>}
            <div className="flex-1 h-px bg-[#1e3a6e]" />
          </div>
          {!rawInvites || rawInvites.length === 0 ? (
            <div className="bg-[#111d38] rounded-xl border border-[#1e3a6e] p-6 text-center text-gray-500 text-sm">No pending invitations</div>
          ) : (
            <div className="space-y-3">
              {rawInvites.map((b: any) => {
                const { cs, student, parent } = renderBookingInfo(b)
                const mins = minsLeft(b.pending_expires_at)
                return (
                  <div key={b.id} className="bg-[#111d38] rounded-xl border border-purple-800/40 p-5 flex items-start justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-purple-400 text-xs font-bold uppercase tracking-wide">1-on-2 invitation pending</span>
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${mins <= 3 ? 'bg-red-900/40 text-red-400' : 'bg-yellow-900/30 text-yellow-400'}`}>{mins} min left</span>
                      </div>
                      <p className="text-[#c9a84c] text-sm mb-2">{cs?.ct?.name} · Coach {cs?.coach?.first_name} · {fDate(cs?.session_date)} {fTime(cs?.start_time)}</p>
                      <div className="flex flex-col gap-1">
                        {(() => {
                          const initiatorParent = b.partner_parent_id ? partnerParentMap[b.partner_parent_id] : null
                          const initiatorStudentId = b.partner_booking_id ? partnerBookingStudentMap[b.partner_booking_id] : null
                          const initiatorStudent = initiatorStudentId ? studentMap[initiatorStudentId] : null
                          return (<>
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-yellow-400 font-semibold w-14 shrink-0">Initiator</span>
                              <span className="text-white text-sm font-semibold">{initiatorStudent?.full_name || '—'}</span>
                              <span className="text-gray-400 text-xs">({initiatorParent?.first_name} {initiatorParent?.last_name})</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-purple-400 font-semibold w-14 shrink-0">Invited</span>
                              <span className="text-white text-sm font-semibold">{student?.full_name}</span>
                              <span className="text-gray-400 text-xs">({parent?.first_name} {parent?.last_name})</span>
                            </div>
                          </>)
                        })()}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>

        <section>
          <div className="flex items-center gap-3 mb-4">
            <h2 className="text-xs font-bold uppercase tracking-widest text-yellow-400">🔄 Pending Reschedules</h2>
            {mergedRescheduleCount > 0 && <span className="bg-yellow-900/40 text-yellow-400 text-xs px-2 py-0.5 rounded-full font-semibold">{mergedRescheduleCount}</span>}
            <div className="flex-1 h-px bg-[#1e3a6e]" />
          </div>
          {!rawReschedules || rawReschedules.length === 0 ? (
            <div className="bg-[#111d38] rounded-xl border border-[#1e3a6e] p-6 text-center text-gray-500 text-sm">No pending reschedules</div>
          ) : (
            <div className="space-y-3">
              {(() => {
                // Merge the two rows sharing class_session_id + pending_new_session_id
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
                        <span className="text-yellow-400 text-xs font-bold uppercase tracking-wide">Reschedule pending</span>
                        {initiator.pending_expires_at && (() => {
                          const mins = Math.max(0, Math.floor((new Date(initiator.pending_expires_at).getTime() - Date.now()) / 60000))
                          return <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${mins <= 3 ? 'bg-red-900/40 text-red-400' : 'bg-yellow-900/30 text-yellow-400'}`}>{mins} min left</span>
                        })()}
                      </div>
                      <div className="flex items-center gap-3 mt-1 flex-wrap mb-3">
                        <span className="text-gray-500 text-sm line-through">{cs?.ct?.name} · Coach {cs?.coach?.first_name} · {fDate(cs?.session_date)} {fTime(cs?.start_time)}</span>
                        <span className="text-gray-500">→</span>
                        <span className="text-[#c9a84c] text-sm">{newCs?.ct?.name || cs?.ct?.name} · Coach {newCs?.coach?.first_name || cs?.coach?.first_name} · {fDate(newCs?.session_date)} {fTime(newCs?.start_time)}</span>
                      </div>
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-yellow-400 font-semibold w-16 shrink-0">Initiator</span>
                          <span className="text-white text-sm font-semibold">{iStudent?.full_name}</span>
                          <span className="text-gray-400 text-xs">({iParent?.first_name} {iParent?.last_name})</span>
                        </div>
                        {rStudent && (
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-purple-400 font-semibold w-16 shrink-0">Pending</span>
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
            <h2 className="text-xs font-bold uppercase tracking-widest text-gray-400">📋 Recent Activity</h2>
            <span className="text-gray-600 text-xs">Last 30 days</span>
            <div className="flex-1 h-px bg-[#1e3a6e]" />
          </div>
          {(() => {
            // Merge cancellations and reschedules, sorted by time
            type ActivityItem = { key: string; type: 'cancelled' | 'rescheduled' | 'new'; names: string; cs: any; newCs: any; updatedAt: string; isCrossAccount?: boolean; steps?: { fromCs: any; toCs: any; updatedAt: string }[] }
            const items: ActivityItem[] = []

            // New bookings (dedupe same session)
            const mergedNew: Record<string, any[]> = {}
            for (const b of rawNewBookings || []) {
              const key = b.class_session_id || b.id
              if (!mergedNew[key]) mergedNew[key] = []
              mergedNew[key].push(b)
            }
            for (const group of Object.values(mergedNew)) {
              const b0 = group[0]
              const names = group.map((b:any) => {
                const s = studentMap[b.student_id]; const p = parentMap[b.parent_id]
                return s ? `${s.full_name} (${p?.first_name} ${p?.last_name})` : ''
              }).filter(Boolean).join('、')
              const isCrossAccountNew = new Set(group.map((b:any) => b.parent_id)).size > 1
              items.push({ key: 'n-' + b0.id, type: 'new', names, cs: sessionMap[b0.class_session_id], newCs: null, updatedAt: b0.created_at, isCrossAccount: isCrossAccountNew })
            }

            // Cancellations
            const mergedCancelled: Record<string, any[]> = {}
            for (const b of rawCancelled || []) {
              const key = b.class_session_id || b.id
              if (!mergedCancelled[key]) mergedCancelled[key] = []
              mergedCancelled[key].push(b)
            }
            for (const group of Object.values(mergedCancelled)) {
              const b0 = group[0]
              const names = group.map((b:any) => {
                const s = studentMap[b.student_id]; const p = parentMap[b.parent_id]
                return s ? `${s.full_name} (${p?.first_name} ${p?.last_name})` : ''
              }).filter(Boolean).join('、')
              const isCrossAccountC = new Set(group.map((b:any) => b.parent_id)).size > 1
              items.push({ key: 'c-' + b0.id, type: 'cancelled', names, cs: sessionMap[b0.class_session_id], newCs: null, updatedAt: b0.updated_at, isCrossAccount: isCrossAccountC })
            }

            // Completed reschedules: first chain rows sharing original_booking_id
            // Each chain is one student's reschedule history
            // Then merge different students with identical steps (same class_session_id → same pending_new_session_id)
            const rescheduleChains: Record<string, any[]> = {}
            for (const b of rawRescheduled || []) {
              // Use original_booking_id (traced to origin) or id as the chain key
              const chainKey = b.original_booking_id || b.id
              if (!rescheduleChains[chainKey]) rescheduleChains[chainKey] = []
              rescheduleChains[chainKey].push(b)
            }
            // Then merge chains with identical steps (two students rescheduling the same session)
            // Identical steps = same class_session_id and pending_new_session_id
            // Find each chainKey's first step and merge chains whose first steps match
            const mergedChainKeys: Record<string, string[]> = {} // superKey → [chainKeys]
            for (const [chainKey, chain] of Object.entries(rescheduleChains)) {
              const firstStep = (chain[0] as any).class_session_id + '|' + (chain[0] as any).pending_new_session_id
              if (!mergedChainKeys[firstStep]) mergedChainKeys[firstStep] = []
              mergedChainKeys[firstStep].push(chainKey)
            }
            for (const chainKeys of Object.values(mergedChainKeys)) {
              // Merge bookings from all related chains
              const allBookings: any[] = []
              for (const ck of chainKeys) {
                allBookings.push(...(rescheduleChains[ck] || []))
              }
              // Collect all student names (deduped)
              const nameSet = new Set<string>()
              for (const b of allBookings) {
                const st = studentMap[b.student_id]; const pa = parentMap[b.parent_id]
                if (st) nameSet.add(`${st.full_name} (${pa?.first_name} ${pa?.last_name})`)
              }
              const names = [...nameSet].join('、')
              // Build timeline steps (deduped)
              const steps: { fromCs: any; toCs: any; updatedAt: string }[] = []
              const seen = new Set<string>()
              for (const b of allBookings) {
                const stepKey = b.class_session_id + '|' + b.pending_new_session_id
                if (!seen.has(stepKey)) {
                  seen.add(stepKey)
                  steps.push({ fromCs: sessionMap[b.class_session_id], toCs: b.pending_new_session_id ? sessionMap[b.pending_new_session_id] : null, updatedAt: b.updated_at })
                }
              }
              const rep = allBookings[0]
              const isCrossAccountR = new Set(allBookings.map((b:any) => b.parent_id)).size > 1
              items.push({ key: 'r-' + rep.id, type: 'rescheduled', names, cs: steps[0]?.fromCs, newCs: steps[steps.length-1]?.toCs, updatedAt: steps[steps.length-1]?.updatedAt, isCrossAccount: isCrossAccountR, steps })
            }

            // Filter out completed lessons (judged by final session_date + start_time)
            const nowLA = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }))
            const filteredItems = items.filter((item: any) => {
              const finalCs = item.newCs || item.cs
              if (!finalCs?.session_date || !finalCs?.start_time) return true
              const [h, m] = finalCs.start_time.split(':').map(Number)
              const sessionStart = new Date(finalCs.session_date + 'T00:00:00')
              sessionStart.setHours(h, m, 0, 0)
              const sessionStartLA = new Date(sessionStart.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }))
              return nowLA < sessionStartLA
            })
            filteredItems.sort((a: any, b: any) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())

            if (filteredItems.length === 0) return <div className="bg-[#111d38] rounded-xl border border-[#1e3a6e] p-6 text-center text-gray-500 text-sm">No activity in the last 30 days</div>

            return (
              <div className="space-y-2">
                {filteredItems.map(item => (
                  <div key={item.key} className={`bg-[#111d38] rounded-xl border p-4 flex items-start justify-between gap-4 ${item.type === 'cancelled' ? 'border-red-900/25' : 'border-green-900/25'}`}>
                    <div className="flex items-start gap-3">
                      <span className={`text-xs font-bold px-2 py-1 rounded-lg shrink-0 mt-0.5 ${item.type === 'cancelled' ? 'bg-red-900/30 text-red-400' : item.type === 'new' ? 'bg-blue-900/30 text-blue-400' : 'bg-green-900/30 text-green-400'}`}>
                        {item.type === 'cancelled' ? 'Cancelled' : item.type === 'new' ? 'New Booking' : 'Rescheduled'}
                      </span>
                      <div>
                        <p className="text-white text-sm font-semibold">{item.names}{item.isCrossAccount && <span className="ml-2 text-xs bg-blue-900 text-blue-300 px-1.5 py-0.5 rounded font-normal">Linked</span>}</p>
                        {item.type === 'new' ? (
                          <p className="text-blue-400 text-xs mt-0.5">{item.cs?.ct?.name} · Coach {item.cs?.coach?.first_name} · {fDate(item.cs?.session_date)} {fTime(item.cs?.start_time)}</p>
                        ) : item.type === 'cancelled' ? (
                          <p className="text-gray-500 text-xs mt-0.5">{item.cs?.ct?.name} · Coach {item.cs?.coach?.first_name} · {fDate(item.cs?.session_date)} {fTime(item.cs?.start_time)}</p>
                        ) : (
                          <div className="mt-0.5">
                            <span className="text-gray-500 text-xs">{item.cs?.ct?.name}</span>
                            <div className="flex flex-col gap-0.5 mt-1">
                              {(item.steps || []).map((step, i) => {
                                const isLast = i === (item.steps?.length || 0) - 1
                                return (
                                  <div key={i} className="flex items-center gap-2 flex-wrap">
                                    <span className="text-gray-600 text-xs w-4 shrink-0">{i + 1}.</span>
                                    <span className="text-[#c9a84c] text-xs">{fDate(step.fromCs?.session_date)} {fTime(step.fromCs?.start_time)} Coach {step.fromCs?.coach?.first_name}</span>
                                    <span className="text-gray-500 text-xs">→</span>
                                    <span className={`text-xs ${isLast ? 'text-green-400' : 'text-[#c9a84c]'}`}>{fDate(step.toCs?.session_date)} {fTime(step.toCs?.start_time)} Coach {step.toCs?.coach?.first_name}</span>
                                    <span className="text-gray-600 text-xs">({fDT(step.updatedAt)})</span>
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                    <span className="text-gray-600 text-xs shrink-0">{fDT(item.updatedAt)}</span>
                  </div>
                ))}
              </div>
            )
          })()}
        </section>
      </div>
    </div>
  )
}
