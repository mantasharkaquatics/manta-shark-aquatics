import { isBlocked } from '@/lib/availability'
import { getEffectiveZones } from '@/lib/zones'
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { buildKnowledgeBlock } from '@/lib/ai/knowledge'
import { buildSystemPromptParts } from '@/lib/ai/system-prompt'
import { PLANS } from '@/lib/plans'
import { getTodayLA, getNowMinutesLA, formatTime12h } from '@/lib/date'
import { cancelBookingWithPartner } from '@/lib/bookings/cancel'

const FALLBACK = 'Thanks for your message! A member of our team will get back to you shortly.'
const MODEL = 'claude-sonnet-4-6'
const CANCEL_LOCK_MINUTES = 24 * 60

function minutesUntilSession(sessionDate: string, startTime: string): number {
  const dayDiff = Math.round(
    (Date.parse(sessionDate + 'T00:00:00Z') - Date.parse(getTodayLA() + 'T00:00:00Z')) / 86400000
  )
  const [h, m] = startTime.split(':').map(Number)
  return dayDiff * 1440 + (h * 60 + m) - getNowMinutesLA()
}

async function getTrialSlots(svc: any, date: string, coachId: string | undefined, parentId: string) {
  const today = getTodayLA()
  const dayDiff = Math.round((Date.parse(date + 'T00:00:00Z') - Date.parse(today + 'T00:00:00Z')) / 86400000)
  if (isNaN(dayDiff) || dayDiff < 0) return { error: 'Date is in the past or invalid.' }
  if (dayDiff > 14) return { error: 'Slots can only be checked up to 14 days ahead. Ask the parent for a date within 2 weeks.' }
  const dow = new Date(date + 'T00:00:00Z').getUTCDay()

  let coachQ = svc.from('coaches').select('id, first_name, last_name').eq('is_active', true)
  if (coachId) coachQ = coachQ.eq('id', coachId)
  const { data: coaches } = await coachQ
  if (!coaches || coaches.length === 0) return { error: 'Coach not found.' }
  const ids = coaches.map((c: any) => c.id)
  const effMap = new Map<string, any>()
  await Promise.all(coaches.map(async (c: any) => { effMap.set(c.id, await getEffectiveZones(svc, c.id, date)) }))

  const [availRes, offRes, sessRes] = await Promise.all([
    svc.from('coach_availability').select('coach_id, start_time, end_time').in('coach_id', ids).eq('day_of_week', dow).eq('is_active', true),
    svc.from('coach_time_off').select('coach_id, start_time, end_time, block_type').in('coach_id', ids).eq('date', date),
    svc.from('class_sessions').select('coach_id, start_time').in('coach_id', ids).eq('session_date', date).in('status', ['open', 'full']).gt('enrolled_count', 0),
  ])
  const offBlocks: any[] = offRes.data || []
  const blocked = new Map<string, Set<string>>()
  for (const s of sessRes.data || []) {
    if (!blocked.has(s.coach_id)) blocked.set(s.coach_id, new Set())
    blocked.get(s.coach_id)!.add(String(s.start_time).slice(0, 5))
  }
  const { data: ownBookings } = await svc
    .from('bookings')
    .select('class_session_id, student_id, status')
    .eq('parent_id', parentId)
    .not('status', 'in', '("cancelled","pending_partner")')
  const ownSessionIds = (ownBookings || []).map((b: any) => b.class_session_id).filter(Boolean)
  const ownTimes = new Map<string, string>()
  if (ownSessionIds.length) {
    const { data: ownSess } = await svc
      .from('class_sessions')
      .select('id, coach_id, start_time')
      .in('id', ownSessionIds)
      .eq('session_date', date)
    const stuIds = [...new Set((ownBookings || []).map((b: any) => b.student_id).filter(Boolean))]
    const { data: stus } = stuIds.length
      ? await svc.from('students').select('id, full_name').in('id', stuIds)
      : { data: [] }
    const stuMap = new Map((stus || []).map((x: any) => [x.id, x.full_name]))
    for (const sess of ownSess || []) {
      const bk = (ownBookings || []).find((b: any) => b.class_session_id === sess.id)
      ownTimes.set(`${sess.coach_id}|${String(sess.start_time).slice(0, 5)}`, String(stuMap.get(bk?.student_id) || 'your student'))
    }
  }

  const nowMins = getNowMinutesLA()
  const out: any[] = []
  for (const c of coaches) {
    const times: { time: string; label: string }[] = []
    const effC = effMap.get(c.id)
    const windows = effC && !effC.legacy
      ? effC.rows.filter((z: any) => z.zone_type === 'private')
      : (availRes.data || []).filter((a: any) => a.coach_id === c.id)
    for (const w of windows) {
      const [sh, sm] = String(w.start_time).slice(0, 5).split(':').map(Number)
      const [eh, em] = String(w.end_time).slice(0, 5).split(':').map(Number)
      let cur = sh * 60 + sm
      const endMin = eh * 60 + em
      while (cur + 30 <= endMin) {
        const t = `${String(Math.floor(cur / 60)).padStart(2, '0')}:${String(cur % 60).padStart(2, '0')}`
        const tEnd = `${String(Math.floor((cur + 30) / 60)).padStart(2, '0')}:${String((cur + 30) % 60).padStart(2, '0')}`
        if (!(dayDiff === 0 && cur <= nowMins + 30) && !blocked.get(c.id)?.has(t) && !isBlocked(offBlocks, c.id, t, tEnd)) times.push({ time: t, label: formatTime12h(t) })
        cur += 30
      }
    }
    const own = [...ownTimes.entries()]
      .filter(([k]) => k.startsWith(c.id + '|'))
      .map(([k, v]) => ({ time: k.split('|')[1], label: formatTime12h(k.split('|')[1]), already_booked_by_this_family_for: v }))
    if (times.length || own.length) out.push({ coach_id: c.id, coach: `${c.first_name} ${c.last_name}`, available_times: times, ...(own.length ? { this_familys_existing_bookings_at: own, note: 'Times in this_familys_existing_bookings_at are NOT free slots taken by others - they are THIS parent own existing bookings. Never suggest rebooking them or describe them as unavailable.' } : {}) })
  }
  return { date, slots: out }
}

const TOOLS = [
  {
    name: 'get_my_credits',
    description: "Get the parent's lesson credit packages and remaining sessions.",
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_upcoming_lessons',
    description: "Get the parent's upcoming booked lessons. Always call this before cancelling or rescheduling so you have real booking ids.",
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_lesson_history',
    description: "Get the parent's 10 most recent past lessons.",
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'cancel_booking',
    description: 'Cancel one upcoming lesson and refund the credit. Only call AFTER the parent has explicitly confirmed cancelling this specific lesson in the conversation. booking_id must come from get_upcoming_lessons.',
    input_schema: {
      type: 'object',
      properties: { booking_id: { type: 'string', description: 'The booking id to cancel' } },
      required: ['booking_id'],
    },
  },
  {
    name: 'get_reschedule_link',
    description: 'Get a link that takes the parent to the booking page to reschedule one upcoming lesson. booking_id must come from get_upcoming_lessons.',
    input_schema: {
      type: 'object',
      properties: { booking_id: { type: 'string', description: 'The booking id to reschedule' } },
      required: ['booking_id'],
    },
  },
  {
    name: 'create_checkout_link',
    description: 'Create a secure Stripe Checkout payment link for a lesson plan. The parent completes payment themselves on Stripe. Never claim a payment has been made.',
    input_schema: {
      type: 'object',
      properties: { plan_id: { type: 'string', description: 'One of the plan ids listed in the system prompt' } },
      required: ['plan_id'],
    },
  },
  {
    name: 'get_my_students',
    description: "Get the parent's students with real student_id values, whether each has an assigned level, and whether they still need a Swim Assessment.",
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_trial_slots',
    description: 'Get real available Swim Assessment time slots for a date (within 14 days). Optionally filter by coach_id. Never invent availability; only present times returned by this tool.',
    input_schema: {
      type: 'object',
      properties: {
        date: { type: 'string', description: 'YYYY-MM-DD' },
        coach_id: { type: 'string', description: 'Optional coach_id from a previous get_trial_slots result' },
      },
      required: ['date'],
    },
  },
  {
    name: 'book_trial_pending',
    description: 'Reserve one Swim Assessment slot (pending payment) and get a secure payment link. Only call AFTER the parent has clearly confirmed this exact student, date and time in a LATER message. The slot is held ~30 minutes; the booking is confirmed only after the parent pays.',
    input_schema: {
      type: 'object',
      properties: {
        student_id: { type: 'string', description: 'From get_my_students' },
        coach_id: { type: 'string', description: 'From get_trial_slots' },
        date: { type: 'string', description: 'YYYY-MM-DD' },
        time: { type: 'string', description: 'HH:MM 24h, from get_trial_slots' },
      },
      required: ['student_id', 'coach_id', 'date', 'time'],
    },
  },
  {
    name: 'get_group_classes',
    description: "Get real 1-on-4 group class availability for one student, automatically filtered to the student's level band. Pass date (YYYY-MM-DD) for that day's classes, or year+month to learn which dates that month have matching classes. Never invent group class times; only present what this tool returns.",
    input_schema: {
      type: 'object',
      properties: {
        student_id: { type: 'string', description: 'From get_my_students' },
        date: { type: 'string', description: 'YYYY-MM-DD for a single day' },
        year: { type: 'number', description: 'Calendar year, for month view' },
        month: { type: 'number', description: '1-12, for month view' },
      },
      required: ['student_id'],
    },
  },
  {
    name: 'escalate_to_human',
    description: 'Flag this conversation for a human team member. Use when you cannot help, are uncertain, the parent is upset, or the request is outside your abilities.',
    input_schema: {
      type: 'object',
      properties: {
        reason: { type: 'string', description: 'Short reason for escalation' },
        summary: { type: 'string', description: "2-3 sentence handoff summary for the human team member, in the parent's language: who/what the parent is asking about, what they want, and where it got stuck. Be specific." },
      },
      required: ['reason', 'summary'],
    },
  },
]

export async function POST(req: NextRequest) {
  const cookieStore = await cookies()
  const supabaseAuth = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } }
  )
  const { data: { user } } = await supabaseAuth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { thread_id } = await req.json()
  if (!thread_id) return NextResponse.json({ error: 'Missing thread_id' }, { status: 400 })

  const svc = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: parent } = await svc
    .from('parents').select('id, email, first_name').eq('auth_user_id', user.id).single()
  if (!parent) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data: thread } = await svc
    .from('chat_threads').select('id, parent_id, mode, ai_context_from').eq('id', thread_id).single()
  if (!thread || thread.parent_id !== parent.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let historyQuery = svc
    .from('chat_messages')
    .select('id, sender_type, body')
    .eq('thread_id', thread_id)
    .order('created_at', { ascending: false })
    .limit(12)
  // Hand-back-to-AI cutoff: earlier conversation (human-service segment) is invisible to the AI, like a fresh conversation
  if ((thread as any)?.ai_context_from) historyQuery = historyQuery.gte('created_at', (thread as any).ai_context_from)
  const { data: history } = await historyQuery
  const recent = (history || []).reverse()
  const lastMsg = recent[recent.length - 1]
  if ((thread as any)?.mode === 'human') {
    return NextResponse.json({ ok: true, skipped: 'human_mode' })
  }
  if (!lastMsg || lastMsg.sender_type !== 'parent') {
    return NextResponse.json({ skipped: true })
  }

  // Idempotent claim on the triggering message: if another invocation already
  // claimed it (duplicate client call / rapid resend), skip. Fails open if the
  // ai_handled column does not exist yet.
  const { data: msgClaim, error: claimErr } = await svc
    .from('chat_messages')
    .update({ ai_handled: true })
    .eq('id', lastMsg.id)
    .eq('ai_handled', false)
    .select('id')
  if (!claimErr && (!msgClaim || msgClaim.length === 0)) {
    return NextResponse.json({ skipped: true, reason: 'already handled' })
  }

  async function postAiMessage(body: string, escalated: boolean, metadata: Record<string, unknown> | null = null) {
    await svc.from('chat_messages').insert({ thread_id, sender_type: 'ai', body, ...(metadata ? { metadata } : {}) })
    const upd: Record<string, unknown> = {
      last_message_at: new Date().toISOString(),
      last_message_preview: body.slice(0, 120),
    }
    if (escalated) upd.unread_by_admin = true
    await svc.from('chat_threads').update(upd).eq('id', thread_id)
  }

  const origin = process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin
  const cookieHeader = req.headers.get('cookie') || ''
  let escalate = false
  let cancelSucceededThisTurn = false
  let trialBookSucceededThisTurn = false

  // ---------- helpers used by multiple tools ----------
  async function fetchLessonRows(pastNotFuture: boolean) {
    const { data: bookings } = await svc
      .from('bookings')
      .select('id, student_id, class_session_id, status, partner_booking_id, lesson_credit_id')
      .eq('parent_id', parent!.id)
      .neq('status', 'cancelled')
      .neq('status', 'pending_partner')
    const rows = bookings || []
    if (!rows.length) return []
    const sessionIds = [...new Set(rows.map(b => b.class_session_id).filter(Boolean))]
    const { data: sessions } = await svc
      .from('class_sessions')
      .select('id, session_date, start_time, end_time, coach_id, course_type_id')
      .in('id', sessionIds)
    const sMap = new Map((sessions || []).map(s => [s.id, s]))
    const coachIds = [...new Set((sessions || []).map(s => s.coach_id).filter(Boolean))]
    const ctIds = [...new Set((sessions || []).map(s => s.course_type_id).filter(Boolean))]
    const studentIds = [...new Set(rows.map(b => b.student_id).filter(Boolean))]
    const [coachRes, ctRes, stuRes] = await Promise.all([
      coachIds.length ? svc.from('coaches').select('id, first_name, last_name').in('id', coachIds) : Promise.resolve({ data: [] }),
      ctIds.length ? svc.from('course_types').select('id, name, slug').in('id', ctIds) : Promise.resolve({ data: [] }),
      studentIds.length ? svc.from('students').select('id, full_name').in('id', studentIds) : Promise.resolve({ data: [] }),
    ])
    const cMap = new Map((coachRes.data || []).map((c: any) => [c.id, c]))
    const ctMap = new Map((ctRes.data || []).map((c: any) => [c.id, c]))
    const stuMap = new Map((stuRes.data || []).map((s: any) => [s.id, s]))
    const out = []
    for (const b of rows) {
      const s: any = sMap.get(b.class_session_id)
      if (!s) continue
      const mins = minutesUntilSession(s.session_date, s.start_time)
      if (pastNotFuture ? mins >= 0 : mins < 0) continue
      const coach: any = cMap.get(s.coach_id)
      const ct: any = ctMap.get(s.course_type_id)
      const stu: any = stuMap.get(b.student_id)
      out.push({
        booking_id: b.id,
        student: stu?.full_name || 'Unknown',
        course: ct?.name || 'Lesson',
        course_slug: ct?.slug || '',
        coach: coach ? `${coach.first_name} ${coach.last_name}` : 'TBD',
        date: s.session_date,
        time: `${formatTime12h(s.start_time.slice(0, 5))} - ${formatTime12h(s.end_time.slice(0, 5))}`,
        status: b.status,
        minutes_until: mins,
        cancellable_online: mins > CANCEL_LOCK_MINUTES,
        _session: s,
        _booking: b,
      })
    }
    out.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))
    return out
  }

  async function loadOwnedUpcoming(bookingId: string) {
    const rows = await fetchLessonRows(false)
    return rows.find(r => r.booking_id === bookingId) || null
  }

  function pub(rows: any[]) {
    return rows.map(({ _session, _booking, ...rest }) => rest)
  }

  // ---------- tool executor ----------
  async function runTool(name: string, input: any): Promise<any> {
    if (name === 'get_my_credits') {
      const { data: creds } = await svc
        .from('lesson_credits')
        .select('id, total_credits, used_credits, course_type_id, created_at')
        .eq('parent_id', parent!.id)
        .gt('total_credits', 0)
        .is('converted_to_token_at', null)
        .order('created_at', { ascending: true })
      const rows = creds || []
      const ctIds = [...new Set(rows.map(c => c.course_type_id).filter(Boolean))]
      const { data: cts } = ctIds.length
        ? await svc.from('course_types').select('id, name').in('id', ctIds)
        : { data: [] }
      const ctMap = new Map((cts || []).map((c: any) => [c.id, c.name]))
      return rows.map(c => ({
        package: ctMap.get(c.course_type_id) || 'Lessons',
        purchased_on: (c.created_at || '').slice(0, 10),
        total: c.total_credits,
        used: c.used_credits,
        remaining: c.total_credits - c.used_credits,
      }))
    }

    if (name === 'get_upcoming_lessons') {
      return pub(await fetchLessonRows(false))
    }

    if (name === 'get_lesson_history') {
      const rows = await fetchLessonRows(true)
      return pub(rows.reverse().slice(0, 10))
    }

    if (name === 'cancel_booking') {
      const row = await loadOwnedUpcoming(String(input.booking_id || ''))
      if (!row) return { error: 'Booking not found among your upcoming lessons.' }
      if (!row.cancellable_online) {
        escalate = true
        return { error: 'This lesson starts within 24 hours and cannot be cancelled online. The conversation has been flagged for a team member.' }
      }
      const result = await cancelBookingWithPartner(svc, row.booking_id, parent!.id)
      if (result.status === 409) {
        return { error: 'This lesson was already cancelled. No further action was taken.' }
      }
      if (!result.ok) {
        escalate = true
        return { error: 'Cancellation failed. The conversation has been flagged for a team member.' }
      }
      // Verify against the database before reporting success
      const { data: check } = await svc
        .from('bookings').select('status').eq('id', row.booking_id).single()
      if (!check || check.status !== 'cancelled') {
        escalate = true
        return { error: 'Cancellation could not be verified. The conversation has been flagged for a team member.' }
      }
      cancelSucceededThisTurn = true
      return {
        success: true,
        cancelled: { student: row.student, course: row.course, date: row.date, time: row.time },
        partner_bookings_cancelled: result.cancelledBookingIds.length - 1,
        credit_refunded: true,
      }
    }

    if (name === 'get_reschedule_link') {
      const row = await loadOwnedUpcoming(String(input.booking_id || ''))
      if (!row) return { error: 'Booking not found among your upcoming lessons.' }
      if (!row.cancellable_online) {
        escalate = true
        return { error: 'This lesson starts within 24 hours and cannot be rescheduled online. The conversation has been flagged for a team member.' }
      }
      const b = row._booking
      const partnerParam = b.partner_booking_id ? `&reschedule_partner_booking_id=${b.partner_booking_id}` : ''
      const url = `${origin}/booking?reschedule_booking_id=${b.id}&reschedule_credit_id=${b.lesson_credit_id}&reschedule_slug=${row.course_slug}&reschedule_student_id=${b.student_id}${partnerParam}`
      return { url, note: 'The current lesson is only cancelled after the parent confirms the new time on the booking page.' }
    }

    if (name === 'create_checkout_link') {
      const planId = String(input.plan_id || '')
      if (!PLANS[planId]) return { error: 'Unknown plan id.' }
      const res = await fetch(`${origin}/api/stripe/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', cookie: cookieHeader },
        body: JSON.stringify({ planId }),
      })
      if (!res.ok) {
        escalate = true
        return { error: 'Could not create a payment link. The conversation has been flagged for a team member.' }
      }
      const data = await res.json()
      const p = PLANS[planId]
      return { url: data.url, plan: p.name, price: `$${(p.amount / 100).toLocaleString('en-US')}` }
    }

    if (name === 'get_my_students') {
      const { data: studs } = await svc
        .from('students')
        .select('id, full_name, current_level, trial_used_at')
        .eq('parent_id', parent!.id)
      const ids = (studs || []).map((s: any) => s.id)
      const { data: trialCreds } = ids.length
        ? await svc.from('lesson_credits').select('student_id').in('student_id', ids).eq('is_trial', true).eq('used_credits', 0)
        : { data: [] }
      const { data: activeTrials } = ids.length
        ? await svc.from('bookings').select('student_id').in('student_id', ids).eq('is_trial', true).neq('status', 'cancelled')
        : { data: [] }
      const credSet = new Set((trialCreds || []).map((c: any) => c.student_id))
      const activeSet = new Set((activeTrials || []).map((b: any) => b.student_id))
      return (studs || []).map((s: any) => {
        const hasCredit = s.current_level == null && credSet.has(s.id) && !activeSet.has(s.id)
        return {
          student_id: s.id,
          name: s.full_name,
          has_assigned_level: s.current_level != null,
          has_prepaid_assessment_credit: hasCredit,
          needs_assessment: s.current_level == null && (!s.trial_used_at || hasCredit),
        }
      })
    }

    if (name === 'get_trial_slots') {
      const date = String(input.date || '')
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: 'date must be YYYY-MM-DD.' }
      return await getTrialSlots(svc, date, input.coach_id ? String(input.coach_id) : undefined, parent!.id)
    }

    if (name === 'get_group_classes') {
      const studentId = String(input.student_id || '')
      const date = input.date ? String(input.date) : ''
      const year = input.year ? String(input.year) : ''
      const month = input.month ? String(input.month) : ''
      if (!studentId) return { error: 'student_id required. Call get_my_students first.' }
      const { data: owned } = await svc
        .from('students').select('id').eq('id', studentId).eq('parent_id', parent!.id).single()
      if (!owned) return { error: 'Student not found on this account. Call get_my_students for real ids.' }
      let qs = ''
      if (date) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: 'date must be YYYY-MM-DD.' }
        qs = `date=${date}`
      } else if (year && month) {
        qs = `year=${year}&month=${month}`
      } else {
        return { error: 'Provide date (YYYY-MM-DD) or year+month.' }
      }
      const res = await fetch(`${origin}/api/bookings/group-classes?student_id=${studentId}&${qs}`, { headers: { cookie: cookieHeader } })
      const data = await res.json().catch(() => ({} as any))
      if (!res.ok) return { error: data.error || 'Could not load group classes.' }
      return data
    }

    if (name === 'book_trial_pending') {
      const studentId = String(input.student_id || '')
      const coachId = String(input.coach_id || '')
      const date = String(input.date || '')
      const time = String(input.time || '')
      if (!studentId || !coachId || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time))
        return { error: 'Missing or invalid fields. Ids must come from get_my_students / get_trial_slots.' }
      const { data: owned } = await svc
        .from('students').select('id, full_name').eq('id', studentId).eq('parent_id', parent!.id).single()
      if (!owned) return { error: 'Student not found on this account. Call get_my_students for real ids.' }

      const { data: prepaid } = await svc
        .from('lesson_credits').select('id')
        .eq('student_id', studentId).eq('is_trial', true).eq('used_credits', 0)
        .limit(1)
      if (prepaid && prepaid.length > 0) {
        const cres = await fetch(`${origin}/api/bookings/trial-credit-book`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', cookie: cookieHeader },
          body: JSON.stringify({ studentId, coachId, date, time }),
        })
        const cdata = await cres.json().catch(() => ({} as any))
        if (!cres.ok || !cdata.ok) {
          return { error: cdata.error || 'Could not book with the prepaid credit. The slot may have just been taken - check get_trial_slots again.' }
        }
        trialBookSucceededThisTurn = true
        return {
          success: true,
          confirmed: true,
          paid_with_prepaid_credit: true,
          student: owned.full_name,
          date,
          time: formatTime12h(time),
          note: 'Booked and CONFIRMED using the prepaid assessment credit. No payment is needed. Tell the parent it is confirmed.',
        }
      }

      const res = await fetch(`${origin}/api/stripe/trial-checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', cookie: cookieHeader },
        body: JSON.stringify({ studentId, coachId, date, time }),
      })
      const data = await res.json().catch(() => ({} as any))
      if (!res.ok || !data.url) {
        return { error: data.error || 'Could not reserve this slot. It may have just been taken - check get_trial_slots again and offer other times.' }
      }
      trialBookSucceededThisTurn = true
      return {
        success: true,
        student: owned.full_name,
        date,
        time: formatTime12h(time),
        payment_url: data.url,
        note: 'Slot reserved PENDING PAYMENT only. The parent must pay via payment_url within 30 minutes or the slot is released automatically. Never say the booking is confirmed.',
      }
    }

    if (name === 'escalate_to_human') {
      escalate = true
      const summary = String(input.summary || input.reason || '').slice(0, 1000)
      const { data: t } = await svc.from('chat_threads').select('escalation_summary').eq('id', thread_id).single()
      const stamp = new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })
      const merged = ((t?.escalation_summary ? t.escalation_summary + '\n\n' : '') + `[${stamp}] ` + summary).slice(-4000)
      await svc.from('chat_threads').update({ escalation_summary: merged }).eq('id', thread_id)
      return { acknowledged: true, note: 'A team member has been notified about THIS request and will follow up in this chat. Tell the parent this specific request was passed to the team, then ask if there is anything else you can help with right now. You remain available for other questions.' }
    }

    return { error: 'Unknown tool.' }
  }

  try {
    const upcomingSnapshot = pub(await fetchLessonRows(false))
    const { data: tmStuds } = await svc.from('students').select('id, full_name').eq('parent_id', parent.id)
    const tmNameById: Record<string, string> = {}
    for (const st of tmStuds || []) tmNameById[st.id] = st.full_name
    const tmIds = (tmStuds || []).map((st: any) => st.id)
    let teamSnapshot: any[] = []
    if (tmIds.length) {
      const { data: tms } = await svc.from('team_memberships')
        .select('student_id, status, cancels_at, expires_at, stripe_subscription_id, team_tiers(name)')
        .in('student_id', tmIds).neq('status', 'cancelled')
      teamSnapshot = (tms || []).map((m: any) => {
        const prepaid = !m.stripe_subscription_id
        const expired = prepaid && m.expires_at ? new Date(m.expires_at).getTime() < Date.now() : false
        return {
          student: tmNameById[m.student_id] || '',
          tier: Array.isArray(m.team_tiers) ? m.team_tiers[0]?.name : m.team_tiers?.name,
          track: prepaid ? 'prepaid' : 'subscription',
          status: expired ? 'expired' : m.status,
          ...(prepaid ? { paid_through: m.expires_at } : {}),
          ...(m.cancels_at ? { cancels_at: m.cancels_at } : {}),
        }
      })
    }
    const knowledge = await buildKnowledgeBlock(svc)
    const nowMins = getNowMinutesLA()
    const hh = String(Math.floor(nowMins / 60)).padStart(2, '0')
    const mm = String(nowMins % 60).padStart(2, '0')
    const planList = Object.entries(PLANS)
      .map(([id, p]) => `${id}: ${p.name} — $${(p.amount / 100).toLocaleString('en-US')}`)
      .join('\n')

    const { staticPart, dynamicPart } = buildSystemPromptParts({
      mode: 'live',
      parentName: parent.first_name,
      dateLine: `Current date (Pacific Time): ${getTodayLA()}, current time: ${formatTime12h(`${hh}:${mm}`)}.`,
      upcomingSnapshotJson: JSON.stringify(upcomingSnapshot),
      teamSnapshotJson: JSON.stringify(teamSnapshot),
      planList,
      knowledge,
    })
    // Prompt caching: static part (rules + POLICIES + knowledge) carries cache_control,
    // cached together with the tools prefix; dynamic part (time/parent/snapshot) is not cached.
    const system = [
      { type: 'text' as const, text: staticPart, cache_control: { type: 'ephemeral' as const } },
      { type: 'text' as const, text: dynamicPart },
    ]

    const merged: { role: 'user' | 'assistant'; content: any }[] = []
    for (const m of recent) {
      const role = m.sender_type === 'parent' ? ('user' as const) : ('assistant' as const)
      const prev = merged[merged.length - 1]
      if (prev && prev.role === role && typeof prev.content === 'string') prev.content += '\n' + m.body
      else merged.push({ role, content: m.body })
    }
    while (merged.length && merged[0].role !== 'user') merged.shift()

    let finalText = ''
    for (let i = 0; i < 6; i++) {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY!,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({ model: MODEL, max_tokens: 1000, system, messages: merged, tools: TOOLS }),
      })
      if (!res.ok) throw new Error(`anthropic status ${res.status}`)
      const data = await res.json()
      const content = data.content || []
      const toolUses = content.filter((c: any) => c.type === 'tool_use')
      const text = content.filter((c: any) => c.type === 'text').map((c: any) => c.text).join('')

      if (data.stop_reason === 'tool_use' && toolUses.length) {
        merged.push({ role: 'assistant', content })
        const results = []
        for (const tu of toolUses) {
          let out
          try {
            out = await runTool(tu.name, tu.input || {})
          } catch (e) {
            console.error('[ai-reply tool]', tu.name, e)
            escalate = true
            out = { error: 'Tool failed. The conversation has been flagged for a team member.' }
          }
          try {
            await svc.from('ai_tool_logs').insert({
              thread_id,
              parent_id: parent.id,
              tool_name: tu.name,
              input: tu.input || {},
              output: out,
            })
          } catch {}
          results.push({ type: 'tool_result', tool_use_id: tu.id, content: JSON.stringify(out) })
        }
        merged.push({ role: 'user', content: results })
        continue
      }

      finalText = text.trim()
      break
    }

    if (!finalText) throw new Error('no final text from agent loop')

    // Deterministic guard against hallucinated cancellations: if the model
    // claims a completed cancellation but cancel_booking did not succeed in
    // this invocation, replace the reply and flag a human.
    const claimsCancelled =
      /(cancelled|canceled|has been cancelled|已取消|已經取消|已经取消|取消了|取消成功|refunded|已退款|退款了)/i.test(finalText)
    if (claimsCancelled && !cancelSucceededThisTurn) {
      const asksConfirm = /(確認|确认|confirm|are you sure|要取消)/i.test(finalText)
      if (!asksConfirm) {
        console.error('[ai-reply guard] blocked hallucinated cancellation claim:', finalText.slice(0, 200))
        escalate = true
        finalText =
          'I was not able to complete that cancellation just now, so nothing has been changed on your account. A team member has been notified and will follow up shortly.'
      }
    }

    const claimsTrialBooked =
      /(已保留|已為您保留|已為您預約|已幫您預約|預約成功|已成功預約|slot (is|has been) reserved|reserved (the|this|your) slot|successfully (booked|reserved))/i.test(finalText)
    if (claimsTrialBooked && !trialBookSucceededThisTurn) {
      console.error('[ai-reply guard] blocked hallucinated trial booking claim:', finalText.slice(0, 200))
      escalate = true
      finalText =
        'I was not able to reserve that time slot just now, so nothing has been booked or charged. A team member has been notified and will follow up shortly.'
    }

    let replyBody = finalText
    let replyMeta: Record<string, unknown> | null = null
    const optIdx = finalText.lastIndexOf('<<OPTIONS>>')
    if (optIdx !== -1) {
      replyBody = finalText.slice(0, optIdx).trim()
      try {
        const arr = JSON.parse(finalText.slice(optIdx + '<<OPTIONS>>'.length).trim())
        if (Array.isArray(arr)) {
          const clean = arr
            .filter((o: any) => o && typeof o.label === 'string' && o.label.length <= 60 &&
              (o.type === 'reply' || (o.type === 'link' && typeof o.url === 'string' &&
                (o.url.startsWith('/') || o.url.startsWith('https://')))))
            .slice(0, 12)
            .map((o: any) => o.type === 'link'
              ? { label: o.label, type: 'link', url: o.url }
              : { label: o.label, type: 'reply' })
          if (clean.length) replyMeta = { options: clean }
        }
      } catch {}
      if (!replyBody) replyBody = finalText
    }

    await postAiMessage(replyBody, escalate, replyMeta)
    return NextResponse.json({ ok: true, escalated: escalate })
  } catch (err) {
    console.error('[ai-reply]', err)
    await postAiMessage(FALLBACK, true)
    return NextResponse.json({ ok: true, escalated: true, fallback: true })
  }
}
