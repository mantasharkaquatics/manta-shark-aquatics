import { isBlocked } from '@/lib/availability'
import { autoHandBackIfIdle } from '@/lib/chat-handback'
import { getEffectiveZones } from '@/lib/zones'
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { buildKnowledgeBlock } from '@/lib/ai/knowledge'
import { buildSystemPromptParts } from '@/lib/ai/system-prompt'
import { TOPUP_PRESETS, presetLessons } from '@/lib/points'
import { walletSummary } from '@/lib/points-wallet'
import { getTodayLA, getNowMinutesLA, formatTime12h, formatDateLA, minutesUntil, SLOT_STEP_MINUTES } from '@/lib/date'
import { cancelLesson } from '@/lib/bookings/cancel'
import { readJson, badRequest } from '@/lib/http'
import { ASSESSMENT_MAX_DAYS } from '@/lib/assessment-slot'
import { renewalHolds, heldSeats } from '@/lib/fixed-classes'
import { TRIAL_HOLD_MINUTES } from '@/lib/plans'
import { LEAVE_WINDOW_DAYS } from '@/lib/vouchers'
import { allRows, allRowsIn } from '@/lib/db-paging'
import { graceUsedThisMonth } from '@/lib/vouchers'
import { translate } from '@/lib/i18n/all'
import { takeSlots, keyHash } from '@/lib/ip-rate-limit'
import { claimsCompletedCancellation } from '@/lib/ai/reply-guards'

// The fixed texts this route posts itself (the catch-all fallback and the two
// guard replacements) used to be English only, even to a parent writing in
// Chinese (found 2026-10-05). The guest route translates its fallback with
// the page locale; a parent thread has no page locale, so -- like the AI
// itself, which answers in the language the parent wrote in -- the language is
// read off the parent's message, with their saved preferred_language for a
// message that has no letters to go by (an emoji, a number). Kept here rather
// than in the locale files: these are message bodies stored in the thread,
// not UI chrome.
type ReplyLang = 'en' | 'zh-Hant' | 'zh-Hans'
const CANNED: Record<'fallback' | 'cancelGuard' | 'trialGuard' | 'rateLimited', Record<ReplyLang, string>> = {
  fallback: {
    en: 'Thanks for your message! A member of our team will get back to you shortly.',
    'zh-Hant': '謝謝您的訊息！我們的團隊成員會盡快回覆您。',
    'zh-Hans': '谢谢您的消息！我们的团队成员会尽快回复您。',
  },
  cancelGuard: {
    en: 'I was not able to complete that cancellation just now, so nothing has been changed on your account. A team member has been notified and will follow up shortly.',
    'zh-Hant': '剛剛沒能完成這次取消，您的帳戶沒有任何變更。我們已通知團隊成員，會盡快與您聯繫。',
    'zh-Hans': '刚刚没能完成这次取消，您的账户没有任何变更。我们已通知团队成员，会尽快与您联系。',
  },
  trialGuard: {
    en: 'I was not able to reserve that time slot just now, so nothing has been booked or charged. A team member has been notified and will follow up shortly.',
    'zh-Hant': '剛剛沒能為您保留這個時段，所以沒有預約，也沒有收取任何費用。我們已通知團隊成員，會盡快與您聯繫。',
    'zh-Hans': '刚刚没能为您保留这个时段，所以没有预约，也没有收取任何费用。我们已通知团队成员，会尽快与您联系。',
  },
  rateLimited: {
    en: 'You have sent a lot of messages in a short time, so automatic replies are paused for now. A team member has been notified and will reply to you here.',
    'zh-Hant': '您在短時間內傳送了很多訊息，自動回覆先暫停一下。我們已通知團隊成員，會在這裡回覆您。',
    'zh-Hans': '您在短时间内发送了很多消息，自动回复先暂停一下。我们已通知团队成员，会在这里回复您。',
  },
}
// Common characters that differ between the two scripts, pair for pair.
const SIMPLIFIED_ONLY = new Set('们这个么说为时吗课预账号还让请谢点发会没过后学级钱现问题开关对经车东边来认识帮应该习练师费单节场员间长电话动写买卖实岁儿两报约择换续邮证网页钟几样给从处')
const TRADITIONAL_ONLY = new Set('們這個麼說為時嗎課預帳號還讓請謝點發會沒過後學級錢現問題開關對經車東邊來認識幫應該習練師費單節場員間長電話動寫買賣實歲兒兩報約擇換續郵證網頁鐘幾樣給從處')
function replyLang(text: string | null | undefined, preferred: string | null | undefined): ReplyLang {
  const pref: ReplyLang | null = preferred === 'zh-Hant' || preferred === 'zh-Hans' || preferred === 'en' ? preferred : null
  const t = String(text || '')
  if (/[\u3400-\u9fff]/.test(t)) {
    let s = 0, tr = 0
    for (const ch of t) { if (SIMPLIFIED_ONLY.has(ch)) s++; else if (TRADITIONAL_ONLY.has(ch)) tr++ }
    if (s !== tr) return s > tr ? 'zh-Hans' : 'zh-Hant'
    return pref === 'zh-Hans' ? 'zh-Hans' : 'zh-Hant'
  }
  if (/[A-Za-z]/.test(t)) return 'en'
  return pref || 'en'
}
const MODEL = 'claude-sonnet-4-6'
const CANCEL_LOCK_MINUTES = 24 * 60

// A signed-in parent's messages that reach the model (owner, 2026-10-08).
// The guest chat was fenced; this one was not, so one account looping on the
// send button could run Claude calls without end. Past either limit the
// assistant is not called: the thread is flagged for the desk and the parent
// told, once, that a person will reply. Counted in ip_rate_hits through
// lib/ip-rate-limit (keyed on a hash of the parent id); that table keeps a
// day, which is the longest window here.
const PARENT_PER_HOUR = 30
const PARENT_PER_DAY = 150
// The chat box takes 800 characters (as the guest chat does); a longer parent
// message did not come from it and is cut before it reaches the model.
const MAX_PARENT_LEN = 800

// Real elapsed minutes, through lib/date like cancelLesson itself (found
// 2026-10-07). This used to count every day as 1440 wall-clock minutes, so in
// the hour before a daylight-saving change the chat and the server disagreed
// about the 24-hour line: on spring-forward a lesson 23h40m away was offered
// as cancellable online and then judged late by the server (grace spent,
// voucher instead of points); on fall-back the chat refused one it could cancel.
function minutesUntilSession(sessionDate: string, startTime: string): number {
  return minutesUntil(sessionDate, String(startTime).slice(0, 5), getTodayLA(), getNowMinutesLA())
}

async function getTrialSlots(svc: any, date: string, coachId: string | undefined, parentId: string) {
  const today = getTodayLA()
  const dayDiff = Math.round((Date.parse(date + 'T00:00:00Z') - Date.parse(today + 'T00:00:00Z')) / 86400000)
  if (isNaN(dayDiff) || dayDiff < 0) return { error: 'Date is in the past or invalid.' }
  // The assessment is exempt from the 14-day single-lesson window: the
  // booking page takes it up to ASSESSMENT_MAX_DAYS out, and the chat used to
  // tell parents "within 2 weeks" (found 2026-10-05).
  if (dayDiff > ASSESSMENT_MAX_DAYS) return { error: `Slots can only be checked up to ${ASSESSMENT_MAX_DAYS} days ahead. Ask the parent for a date within ${ASSESSMENT_MAX_DAYS} days.` }
  const dow = new Date(date + 'T00:00:00Z').getUTCDay()

  let coachQ = svc.from('coaches').select('id, first_name, last_name').eq('is_active', true)
  if (coachId) coachQ = coachQ.eq('id', coachId)
  const { data: coaches } = await coachQ
  if (!coaches || coaches.length === 0) return { error: 'Coach not found.' }
  const ids = coaches.map((c: any) => c.id)
  const effMap = new Map<string, any>()
  await Promise.all(coaches.map(async (c: any) => { effMap.set(c.id, await getEffectiveZones(svc, c.id, date)) }))

  // holds: other families' fixed-class renewal holds (lib/fixed-classes).
  // book_trial_pending refuses a time inside one (lib/assessment-slot), so
  // offering it here meant the parent picked a time and was told it was gone
  // (found 2026-10-08). This family's own holds never keep it out.
  const [availRes, offRes, sessRes, holds] = await Promise.all([
    svc.from('coach_availability').select('coach_id, start_time, end_time').in('coach_id', ids).eq('day_of_week', dow).eq('is_active', true),
    svc.from('coach_time_off').select('coach_id, start_time, end_time, block_type').in('coach_id', ids).eq('date', date),
    svc.from('class_sessions').select('coach_id, start_time, end_time').in('coach_id', ids).eq('session_date', date).in('status', ['open', 'full']).gt('enrolled_count', 0),
    renewalHolds(svc, date, date, parentId),
  ])
  const offBlocks: any[] = offRes.data || []
  // Interval-based: a lesson running 09:40–10:10 must hide the 09:45 slot too
  const toMinAi = (x: string) => { const [h, m] = String(x).slice(0, 5).split(':').map(Number); return h * 60 + m }
  const busy = new Map<string, { s: number; e: number }[]>()
  for (const s of sessRes.data || []) {
    const st = toMinAi(String(s.start_time))
    const en = (s as any).end_time ? toMinAi(String((s as any).end_time)) : st + 30
    if (!busy.has(s.coach_id)) busy.set(s.coach_id, [])
    busy.get(s.coach_id)!.push({ s: st, e: en })
  }
  const isBusy = (coachId: string, a: number, b: number) => (busy.get(coachId) || []).some(iv => a < iv.e && b > iv.s)
  // Paged and chunked (lib/db-paging): unpaged, a family past 1,000 rows lost
  // its newest bookings here, and every session id in one .in() is past what
  // the API takes.
  const { data: ownBookings } = await allRows(() => svc
    .from('bookings')
    .select('id, class_session_id, student_id, status')
    .eq('parent_id', parentId)
    .not('status', 'in', '("cancelled","pending_partner")')
    .order('id', { ascending: true }))
  const ownSessionIds = [...new Set(ownBookings.map((b: any) => b.class_session_id).filter(Boolean))] as string[]
  const ownTimes = new Map<string, string>()
  if (ownSessionIds.length) {
    const { data: ownSess } = await allRowsIn(ownSessionIds, chunk => svc
      .from('class_sessions')
      .select('id, coach_id, start_time')
      .in('id', chunk)
      .eq('session_date', date)
      .order('id', { ascending: true }))
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
        // heldSeats with no course type: an assessment is never a fixed-class
        // course, so any overlapping hold takes the whole slot (as in
        // assessmentSlotError).
        if (!(dayDiff === 0 && cur <= nowMins + 30) && !isBusy(c.id, cur, cur + 30) && !isBlocked(offBlocks, c.id, t, tEnd)
          && !(heldSeats(holds, c.id, date, cur, cur + 30, '') > 0)) times.push({ time: t, label: formatTime12h(t) })
        cur += SLOT_STEP_MINUTES
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
    name: 'get_my_points',
    description: "Get the parent's points balance and lessons completed. (Late-cancellation allowances no longer exist; any such field in the result is obsolete and must not be mentioned.)",
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_upcoming_lessons',
    description: "Get the parent's upcoming booked lessons, plus any lesson earlier today (started: true -- it has begun or already happened today). Always call this before cancelling or rescheduling so you have real booking ids.",
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_lesson_history',
    description: "Get the parent's 10 most recent past lessons.",
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'cancel_booking',
    description: 'Cancel one upcoming lesson more than 24 hours away. What the family gets follows the policies: a single lesson\'s points come back, a fixed-class lesson becomes a make-up voucher, a make-up returns its voucher. Lessons inside 24 hours cannot be cancelled with this tool. Only call AFTER the parent has explicitly confirmed cancelling this specific lesson in the conversation. booking_id must come from get_upcoming_lessons.',
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
    name: 'create_topup_link',
    description: 'Create a secure Stripe Checkout link for the parent to add points to their account. The parent completes payment themselves on Stripe. Never claim a payment has been made.',
    input_schema: {
      type: 'object',
      properties: { dollars: { type: 'integer', description: `Must be one of the amounts the website sells: ${TOPUP_PRESETS.join(', ')}. 1 dollar = 1 point. Any other figure is refused -- for a smaller amount the parent has to come to the front desk.` } },
      required: ['dollars'],
    },
  },
  {
    name: 'get_my_students',
    description: "Get the parent's students with real student_id values, whether each has an assigned level, and whether they still need a Swim Assessment.",
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_trial_slots',
    description: `Get real available Swim Assessment time slots for a date (up to ${ASSESSMENT_MAX_DAYS} days ahead; the assessment is not limited to 14 days). Optionally filter by coach_id. Never invent availability; only present times returned by this tool.`,
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
    description: `Reserve one Swim Assessment slot (pending payment) and get a secure payment link. Only call AFTER the parent has clearly confirmed this exact student, date and time in a LATER message. The slot is held ${TRIAL_HOLD_MINUTES} minutes; the booking is confirmed only after the parent pays.`,
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

  const reqBody = await readJson(req)
  if (!reqBody) return badRequest()
  const { thread_id } = reqBody
  if (!thread_id) return NextResponse.json({ error: 'Missing thread_id' }, { status: 400 })

  const svc = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: parent } = await svc
    .from('parents').select('id, email, first_name, preferred_language').eq('auth_user_id', user.id).single()
  if (!parent) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data: thread } = await svc
    .from('chat_threads').select('id, parent_id, mode, ai_context_from').eq('id', thread_id).single()
  if (!thread || thread.parent_id !== parent.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let historyQuery = svc
    .from('chat_messages')
    .select('id, sender_type, body, metadata, created_at')
    .eq('thread_id', thread_id)
    .order('created_at', { ascending: false })
    .limit(12)
  // Hand-back-to-AI cutoff: earlier conversation (human-service segment) is invisible to the AI, like a fresh conversation
  if ((thread as any)?.ai_context_from) historyQuery = historyQuery.gte('created_at', (thread as any).ai_context_from)
  const { data: history } = await historyQuery
  let recent = (history || []).reverse()
  const lastMsg = recent[recent.length - 1]
  if ((thread as any)?.mode === 'human') {
    // The desk took the thread and may have forgotten to hand it back.
    // Owner, 2026-10-08: once the desk has been quiet for 30 minutes, the
    // family's next message goes to the AI again (lib/chat-handback.ts).
    const cutoff = lastMsg?.sender_type === 'parent'
      ? await autoHandBackIfIdle(svc, thread_id, lastMsg.created_at)
      : null
    if (!cutoff) return NextResponse.json({ ok: true, skipped: 'human_mode' })
    // As after a manual hand-back, the AI starts from the family's new
    // message; the desk's conversation stays out of its context.
    recent = recent.filter((m: any) => String(m.created_at) >= cutoff)
  }
  if (!lastMsg || lastMsg.sender_type !== 'parent') {
    return NextResponse.json({ skipped: true })
  }
  const lang = replyLang(lastMsg.body, (parent as any).preferred_language)

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

  // The per-parent fence (PARENT_PER_HOUR / PARENT_PER_DAY), after the claim so
  // a duplicate call for the same message is not counted twice. A table error
  // lets the message through (logged): a parent's support chat should not go
  // silent because a counter could not be written.
  {
    const key = keyHash('parent-chat', parent.id)
    const slots = await takeSlots(svc, [
      { scope: 'parent-chat-hour', key, max: PARENT_PER_HOUR, windowMs: 60 * 60 * 1000 },
      { scope: 'parent-chat-day', key, max: PARENT_PER_DAY, windowMs: 24 * 60 * 60 * 1000 },
    ])
    if (slots.result === 'error') console.error('[ai-reply] rate limit could not be counted; letting the message through')
    if (slots.result === 'limited') {
      // Told once per limit window: if this notice is already in the thread
      // within the window that refused (an hour, or a day for the daily cap),
      // further messages only flag the thread for the desk. Looking only at
      // the last 12 messages re-posted it after every 12 more (found
      // 2026-10-08). If the lookup fails, fall back to that recent window.
      const windowMs = slots.failed === 'parent-chat-day' ? 24 * 60 * 60 * 1000 : 60 * 60 * 1000
      const { data: told, error: toldErr } = await svc
        .from('chat_messages')
        .select('id')
        .eq('thread_id', thread_id)
        .eq('sender_type', 'ai')
        .eq('metadata->>rate_limited', 'true')
        .gte('created_at', new Date(Date.now() - windowMs).toISOString())
        .limit(1)
      if (toldErr) console.error('[ai-reply] rate-limit notice lookup failed', toldErr)
      const lastOurs = [...recent].reverse().find(m => m.sender_type !== 'parent')
      const alreadyTold = toldErr
        ? lastOurs?.sender_type === 'ai' && !!lastOurs.metadata?.rate_limited
        : (told || []).length > 0
      if (alreadyTold) {
        await svc.from('chat_threads').update({ unread_by_admin: true }).eq('id', thread_id)
        return NextResponse.json({ ok: true, skipped: true, reason: 'rate_limited' })
      }
      await postAiMessage(CANNED.rateLimited[lang], true, { rate_limited: true })
      return NextResponse.json({ ok: true, escalated: true, limited: true })
    }
  }

  const origin = process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin
  const cookieHeader = req.headers.get('cookie') || ''
  let escalate = false
  let cancelSucceededThisTurn = false
  let cancelAlreadyDoneThisTurn = false
  let trialBookSucceededThisTurn = false

  // ---------- helpers used by multiple tools ----------
  type LessonBooking = {
    id: string; student_id: string; class_session_id: string; status: string
    partner_booking_id: string | null; points_charged: number | null; is_trial: boolean
    lesson_group_id: string | null; voucher_id: string | null; fixed_class_id: string | null
  }
  type LessonSession = { id: string; session_date: string; start_time: string; end_time: string; coach_id: string; course_type_id: string }
  // What cancelling this lesson now would do, in the words of
  // lib/bookings/cancel.ts (docs/fixed-class-spec.md). The model used to see
  // only "cancellable_online" and could not tell a fixed-class lesson (leave ->
  // voucher, no points back), a make-up (voucher back, or spent inside 24h), a
  // 1-on-2 shared with another family (both families cancelled; inside 24h not
  // online at all) or a sibling 1-on-2 (both children's grace) from a single
  // lesson (found 2026-10-08). The button names are the dashboard's own, in the
  // language the parent is writing in.
  function cancelRule(r: {
    kind: 'single' | 'fixed_class' | 'make_up' | 'assessment'
    slug: string; status: string; started: boolean; late: boolean
    shared: boolean; siblings: boolean; kidNames: string[]; graceUsedBy: string[]
  }): string {
    if (r.kind === 'assessment') return "A Swim Assessment can't be cancelled or moved online; the team handles it (escalate_to_human)."
    if (r.started) return 'This lesson has already started or happened today; it can no longer be cancelled.'
    if (r.status !== 'confirmed') return 'This lesson cannot be cancelled online; the team can help (escalate_to_human).'
    const late = (key: string) => `the dashboard button "${translate(lang, key)}"`
    if (!r.late) {
      if (r.kind === 'make_up') return 'More than 24 hours ahead: cancelling gives the make-up voucher back to the family (same dates; extended to 7 days from today if fewer are left). No points are involved. A make-up cannot be rescheduled.'
      if (r.kind === 'fixed_class') {
        if (r.slug === '1on2' && (r.shared || !r.siblings)) return 'Fixed-class 1-on-2 that cannot be turned into a make-up voucher online; the team handles it (escalate_to_human).'
        return `More than 24 hours ahead: this is LEAVE from a fixed class. The points are NOT returned; the lesson becomes a make-up voucher${r.siblings ? ' for both children' : ''}, for a make-up dated within ${LEAVE_WINDOW_DAYS} days before or after this lesson. A fixed-class lesson cannot be rescheduled.`
      }
      if (r.shared) return 'More than 24 hours ahead: this 1-on-2 is shared with ANOTHER family and is one lesson, so cancelling cancels it for BOTH families and both get their points back in full. Tell the parent this before they confirm.'
      if (r.siblings) return `More than 24 hours ahead: both children's seats (${r.kidNames.join(' & ')}) are one lesson and are cancelled together; the points for both come back in full.`
      return 'More than 24 hours ahead: cancelling returns the points in full (or the parent can reschedule).'
    }
    // Inside 24 hours. The chat itself never cancels these.
    if (r.kind === 'make_up') return `Inside 24 hours: cancelling SPENDS the make-up voucher (nothing comes back, and the monthly grace does not apply). The parent can still do it with ${late('dash.up.cancelLate')}; this chat cannot.`
    if (r.shared) return 'Inside 24 hours, shared with another family: it cannot be cancelled online at all; the parent must contact the team (escalate_to_human).'
    if (r.slug === '1on2' && !r.siblings) return 'Inside 24 hours: this 1-on-2 cannot be cancelled online; the team handles it (escalate_to_human).'
    const who = r.siblings ? `BOTH children's (${r.kidNames.join(' & ')})` : `${r.kidNames[0] || 'the child'}'s`
    if (r.graceUsedBy.length) return `Inside 24 hours: the points are not returned, and this month's grace is already used by ${r.graceUsedBy.join(' & ')}, so it cannot be cancelled online. Offer to pass it to the team.`
    return `Inside 24 hours: the points are not returned. The parent can use ${who} monthly grace with ${late(r.kind === 'fixed_class' ? 'dash.up.leaveLate' : 'dash.up.cancelLate')} on their dashboard: the lesson becomes a make-up voucher valid 4 weeks (not points). This chat cannot do it.`
  }

  async function fetchLessonRows(pastNotFuture: boolean) {
    // Paged and ordered by id: one unpaged read stops at 1,000 rows without a
    // word, and the rows it dropped were whichever the database returned last
    // -- the assistant could then tell a family they had no lesson when they
    // did. The session lookup is chunked for the same reason (lib/db-paging).
    const { data: bookings } = await allRows(() => svc
      .from('bookings')
      // lesson_group_id and voucher_id ride along for get_reschedule_link: a
      // 60-minute lesson needs its group id on the booking page, and a make-up
      // cannot be moved at all (found 2026-10-07). fixed_class_id: what a
      // cancellation does depends on it (cancelRule above).
      .select('id, student_id, class_session_id, status, partner_booking_id, points_charged, is_trial, lesson_group_id, voucher_id, fixed_class_id')
      .eq('parent_id', parent!.id)
      // Only lessons the family actually holds (found 2026-10-07). A cart item
      // (in_cart) or a hold waiting on Stripe (pending_payment) is not a booked
      // lesson yet: listing one as "upcoming" let the model offer to cancel a
      // cart item, which the server refuses.
      .not('status', 'in', '("cancelled","pending_partner","in_cart","pending_payment")')
      .order('id', { ascending: true }))
    const rows = bookings as LessonBooking[]
    if (!rows.length) return []
    const sessionIds = [...new Set(rows.map(b => b.class_session_id).filter(Boolean))] as string[]
    const { data: sessionData } = await allRowsIn(sessionIds, chunk => svc
      .from('class_sessions')
      .select('id, session_date, start_time, end_time, coach_id, course_type_id')
      .in('id', chunk)
      .order('id', { ascending: true }))
    const sessions = sessionData as LessonSession[]
    const sMap = new Map(sessions.map(s => [s.id, s]))
    const coachIds = [...new Set(sessions.map(s => s.coach_id).filter(Boolean))]
    const ctIds = [...new Set(sessions.map(s => s.course_type_id).filter(Boolean))]
    const studentIds = [...new Set(rows.map(b => b.student_id).filter(Boolean))]
    const [coachRes, ctRes, stuRes] = await Promise.all([
      coachIds.length ? svc.from('coaches').select('id, first_name, last_name').in('id', coachIds) : Promise.resolve({ data: [] }),
      ctIds.length ? svc.from('course_types').select('id, name, slug').in('id', ctIds) : Promise.resolve({ data: [] }),
      studentIds.length ? svc.from('students').select('id, full_name').in('id', studentIds) : Promise.resolve({ data: [] }),
    ])
    const cMap = new Map(((coachRes.data || []) as { id: string; first_name: string; last_name: string }[]).map(c => [c.id, c]))
    const ctMap = new Map(((ctRes.data || []) as { id: string; name: string; slug: string }[]).map(c => [c.id, c]))
    const stuMap = new Map(((stuRes.data || []) as { id: string; full_name: string }[]).map(x => [x.id, x]))
    const slugOf = (s: LessonSession) => ctMap.get(s.course_type_id)?.slug || ''

    // One entry per LESSON, as the dashboard shows it (found 2026-10-08): the
    // two halves of a 60-minute lesson used to reach the model as two 30-minute
    // lessons ("you have two lessons on Thursday"; "cancel the 9:40 one" took
    // the whole hour), and the two seats of a sibling 1-on-2 as two lessons.
    // Keyed like the dashboard: a 60-minute group (both children when it is a
    // 1-on-2), else a 1-on-2 session, else the booking itself.
    type Part = { b: LessonBooking; s: LessonSession }
    const groups = new Map<string, Part[]>()
    for (const b of rows) {
      const s = sMap.get(b.class_session_id)
      if (!s) continue
      const slug = slugOf(s)
      const key = b.lesson_group_id
        ? 'G|' + b.lesson_group_id + (slug === '1on2' ? '' : '|' + b.student_id)
        : slug === '1on2' && !b.is_trial ? 'S|' + b.class_session_id : 'B|' + b.id
      const g = groups.get(key) || []
      g.push({ b, s })
      groups.set(key, g)
    }
    const toMin = (x: string) => { const [h, m] = String(x).slice(0, 5).split(':').map(Number); return h * 60 + m }
    const startKey = (s: LessonSession) => `${s.session_date} ${String(s.start_time).slice(0, 5)}`

    const kept: { g: Part[]; mins: number; earlierToday: boolean }[] = []
    for (const g of groups.values()) {
      g.sort((x, y) => startKey(x.s).localeCompare(startKey(y.s)))
      const s = g[0].s
      // Judged by when the lesson STARTS, as cancelLesson judges it.
      const mins = minutesUntilSession(s.session_date, s.start_time)
      // Today's lesson that has already started is still "today" to a parent
      // asking what is on today. It was in neither list, so the assistant
      // answered "no lessons today" on a morning with one. It rides with the
      // upcoming list, flagged, and never counts as cancellable.
      const earlierToday = mins < 0 && s.session_date === getTodayLA()
      if (pastNotFuture ? (mins >= 0 || earlierToday) : (mins < 0 && !earlierToday)) continue
      kept.push({ g, mins, earlierToday })
    }

    // A 1-on-2 is shared with another family when a seat links across, or --
    // as cancelLesson decides it -- when another family holds a confirmed seat
    // in the same session (a desk-made pair may carry no link).
    const pairSessions = [...new Set(kept
      .filter(k => slugOf(k.g[0].s) === '1on2')
      .flatMap(k => k.g.map(x => x.s.id)))]
    const otherFamilySessions = new Set<string>()
    if (!pastNotFuture && pairSessions.length) {
      const { data: seats } = await allRowsIn(pairSessions, chunk => svc
        .from('bookings')
        .select('id, class_session_id')
        .in('class_session_id', chunk)
        .neq('parent_id', parent!.id)
        .eq('status', 'confirmed')
        .order('id', { ascending: true }))
      for (const x of seats as { class_session_id: string }[]) otherFamilySessions.add(x.class_session_id)
    }

    // Whose monthly grace is spent already -- only asked when a lesson is
    // inside 24 hours, the one case it decides.
    const lateKids = !pastNotFuture
      ? [...new Set(kept.filter(k => !k.earlierToday && k.mins < CANCEL_LOCK_MINUTES).flatMap(k => k.g.map(x => x.b.student_id)).filter(Boolean))]
      : []
    const graceUsed = lateKids.length ? await graceUsedThisMonth(svc, lateKids) : new Set<string>()
    const nameOf = (id: string) => stuMap.get(id)?.full_name || 'Unknown'

    const out = []
    for (const { g, mins, earlierToday } of kept) {
      const b = g[0].b
      const s = g[0].s
      const last = g[g.length - 1].s
      const coach = cMap.get(s.coach_id)
      const ct = ctMap.get(s.course_type_id)
      const slug = slugOf(s)
      const kidIds = [...new Set(g.map(x => x.b.student_id).filter(Boolean))]
      const kidNames = kidIds.map(nameOf).sort((x, y) => x.localeCompare(y))
      const kind = b.is_trial ? 'assessment' as const : b.voucher_id ? 'make_up' as const : b.fixed_class_id ? 'fixed_class' as const : 'single' as const
      const shared = slug === '1on2' && g.some(x => !!x.b.partner_booking_id || otherFamilySessions.has(x.s.id))
      const siblings = slug === '1on2' && kidIds.length > 1
      const late = mins < CANCEL_LOCK_MINUTES
      out.push({
        booking_id: b.id,
        student: kidNames.join(' & '),
        // An assessment sits on a 1-on-1 course type; without this the
        // assistant told a parent their Swim Assessment was a private lesson.
        course: b.is_trial ? 'Swim Assessment' : (ct?.name || 'Lesson'),
        course_slug: b.is_trial ? 'assessment' : slug,
        // single = booked one at a time; fixed_class = part of a weekly fixed
        // class (固定班); make_up = booked with a make-up voucher (補課).
        kind,
        minutes: toMin(last.end_time) - toMin(s.start_time),
        ...(slug === '1on2' ? { shared_with_other_family: shared, ...(siblings ? { both_children_of_this_family: true } : {}) } : {}),
        coach: coach ? `${coach.first_name} ${coach.last_name}` : 'TBD',
        date: s.session_date,
        time: `${formatTime12h(s.start_time.slice(0, 5))} - ${formatTime12h(last.end_time.slice(0, 5))}`,
        status: b.status,
        minutes_until: mins,
        ...(earlierToday ? { started: true } : {}),
        // Whether THIS chat's cancel_booking can do it (24 hours or more
        // ahead, as lib/bookings/cancel.ts draws the line).
        cancellable_online: !earlierToday && !late && !b.is_trial,
        ...(!pastNotFuture ? {
          if_cancelled_now: cancelRule({
            kind, slug, status: b.status, started: earlierToday, late, shared, siblings, kidNames,
            graceUsedBy: kidIds.filter(id => graceUsed.has(id)).map(nameOf),
          }),
        } : {}),
        _ids: g.map(x => x.b.id),
        _session: s,
        _booking: b,
      })
    }
    out.sort((a, b) => (a.date + ' ' + String(a._session.start_time).slice(0, 5)).localeCompare(b.date + ' ' + String(b._session.start_time).slice(0, 5)))
    return out
  }

  // Any booking id of the lesson finds it: the model may still hold the
  // second half's id from an earlier turn.
  async function loadOwnedUpcoming(bookingId: string) {
    const rows = await fetchLessonRows(false)
    return rows.find(r => r._ids.includes(bookingId)) || null
  }

  function pub(rows: any[]) {
    return rows.map(({ _session, _booking, _ids, ...rest }) => rest)
  }

  // ---------- tool executor ----------
  async function runTool(name: string, input: any): Promise<any> {
    if (name === 'get_my_points') {
      const w = await walletSummary(svc, parent!.id)
      return {
        balance_points: w.balance,
        balance_dollars: w.balance,
        bonus_points: w.balanceGranted,
        // LA calendar day, not the UTC slice -- a grant made after 5pm Pacific
        // was quoted a day late (found 2026-10-05).
        next_bonus_expiry: w.grantedNextExpiry
          ? `${w.grantedNextExpiry.points} bonus points expire on ${formatDateLA(new Date(w.grantedNextExpiry.date))}`
          : null,
        lessons_completed: w.lessonsCompleted,
      }
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
      if (row.course_slug === 'assessment') {
        escalate = true
        return { error: "A Swim Assessment can't be cancelled online. The conversation has been flagged for a team member." }
      }
      if (!row.cancellable_online) {
        escalate = true
        // What applies to THIS lesson (cancelRule): a make-up spends its
        // voucher, a shared 1-on-2 cannot be cancelled online, a sibling
        // 1-on-2 uses both children's grace, a fixed class "takes leave". It
        // used to describe the single-lesson grace for every lesson, under a
        // button name the dashboard does not have (found 2026-10-08).
        return { error: `This tool cannot cancel this lesson. ${row.if_cancelled_now || ''} The conversation has also been flagged for a team member.` }
      }
      // cancelLesson, not the half-cancel: a 60-minute lesson is two booking
      // rows, and cancelling one of them while saying "done" left a coach
      // holding thirty minutes and half the points unrefunded.
      const result = await cancelLesson(svc, row.booking_id, parent!.id)
      // 409 means two different things. Half an hour left standing is not
      // "already cancelled" -- it needs a person, and saying otherwise would
      // send the family away believing a lesson is gone that is not.
      if (result.remainingBookingIds && result.remainingBookingIds.length > 0) {
        escalate = true
        return { error: 'Only part of this 60-minute lesson could be cancelled. The conversation has been flagged for a team member.' }
      }
      // By the reason, not the status alone (found 2026-10-07): cancelLesson
      // answers 409 for other refusals too, and "already cancelled" was then
      // passed on for a lesson that was still booked.
      if (result.status === 409 && result.error === 'Already cancelled') {
        // True, and the model may say so: not a claim the guard should stop.
        cancelAlreadyDoneThisTurn = true
        return { error: 'This lesson was already cancelled. No further action was taken.' }
      }
      if (result.status === 409) {
        escalate = true
        return { error: `This lesson could not be cancelled online (${result.error || 'refused'}). Nothing was changed. The conversation has been flagged for a team member.` }
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
        // Every other row that went with it: the second half of an hour, a
        // sibling's seat in a 1-on-2, the other family's seat. Not all of
        // them are partners, so it does not claim they are.
        also_cancelled: result.cancelledBookingIds.length - 1,
        // What the family got for it (docs/fixed-class-spec.md): points back
        // for a single lesson, a make-up voucher for a fixed-class lesson or a
        // late cancellation on the month's grace, or the voucher back for a
        // make-up lesson.
        points_refunded: result.pointsRefunded ?? 0,
        make_up_voucher: result.voucher ? { course: result.voucher.course_slug, minutes: result.voucher.minutes, use_by: result.voucher.expires_on, usable_from: result.voucher.usable_from ?? null } : null,
        voucher_returned: result.outcome === 'restore',
      }
    }

    if (name === 'get_reschedule_link') {
      const row = await loadOwnedUpcoming(String(input.booking_id || ''))
      if (!row) return { error: 'Booking not found among your upcoming lessons.' }
      // A fixed-class lesson is not moved: the family takes leave (cancel)
      // and books the make-up with the voucher that gives them.
      {
        // A leave voucher is NOT the four-week kind: its make-up has to fall
        // within LEAVE_WINDOW_DAYS either side of the missed lesson. The text
        // said "within four weeks", which the model passed on (found 2026-10-05).
        if (row._booking.fixed_class_id) return { error: `This lesson is part of a fixed weekly class and cannot be rescheduled. Taking leave at least 24 hours ahead turns it into a make-up voucher for a make-up dated within ${LEAVE_WINDOW_DAYS} days before or after this lesson; it can be booked right away. (Inside 24 hours, leave uses the child's monthly grace and that voucher lasts 4 weeks.)` }
      }
      // A make-up lesson (booked with a voucher) is not moved either; the
      // booking route refused it only after the parent had picked a new time
      // (found 2026-10-07). Cancelling it in time gives the voucher back.
      if (row._booking.voucher_id) {
        return { error: 'This is a make-up lesson booked with a make-up voucher, and make-up lessons cannot be rescheduled. If the family cancels it at least 24 hours ahead, the make-up voucher goes back to their account and they can book another time with it from their dashboard.' }
      }
      // A 60-minute lesson shared with another family has no online path that
      // moves both halves and both families together; the dashboard sends it
      // to the desk too.
      if (row._booking.lesson_group_id && row._booking.partner_booking_id) {
        escalate = true
        return { error: 'This 60-minute lesson is shared with another family and cannot be moved online. The conversation has been flagged for a team member, who will arrange the new time.' }
      }
      if (row.course_slug === 'assessment') {
        escalate = true
        return { error: "A Swim Assessment can't be moved online. The conversation has been flagged for a team member." }
      }
      if (!row.cancellable_online) {
        escalate = true
        return { error: 'This lesson starts within 24 hours and cannot be rescheduled online. The conversation has been flagged for a team member.' }
      }
      const b = row._booking
      const partnerParam = b.partner_booking_id ? `&reschedule_partner_booking_id=${b.partner_booking_id}` : ''
      // A 60-minute lesson: the booking page switches to hour mode only when it
      // is given the group id (as the dashboard's own link does). Without it
      // the parent was shown 30-minute times and refused after picking one
      // (found 2026-10-07).
      const groupParam = b.lesson_group_id ? `&reschedule_group_id=${b.lesson_group_id}` : ''
      const url = `${origin}/booking?reschedule_booking_id=${b.id}&reschedule_slug=${row.course_slug}&reschedule_student_id=${b.student_id}${partnerParam}${groupParam}`
      return { url, note: 'The current lesson is only cancelled after the parent confirms the new time on the booking page.' }
    }

    if (name === 'create_topup_link') {
      const dollars = Math.floor(Number(input.dollars))
      // The chat sells exactly what the website sells. It used to accept any
      // figure from $50 up, which quietly undercut the storefront: a parent who
      // asked here could buy $200 while the page offered nothing below $650.
      // Small amounts are a front-desk conversation now, not a chat one.
      if (!(TOPUP_PRESETS as readonly number[]).includes(dollars))
        return { error: `The amount must be one of ${TOPUP_PRESETS.join(', ')} dollars. For any other amount, ask the parent to come to the front desk.` }
      const res = await fetch(`${origin}/api/stripe/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', cookie: cookieHeader },
        body: JSON.stringify({ points: dollars }),
      })
      const data = await res.json().catch(() => ({}))
      // A family with nobody assessed yet is not an error to escalate -- it is
      // the answer to their question, and the assistant should give it.
      if (data?.error === 'NEEDS_ASSESSMENT')
        return { error: 'This family has no assessed swimmer yet, so points would sit unused. Tell them to book a Swim Assessment first and offer to help with that.' }
      if (!res.ok || !data?.url) {
        escalate = true
        return { error: 'Could not create a payment link. The conversation has been flagged for a team member.' }
      }
      return { url: data.url, points: dollars, price: `$${dollars.toLocaleString('en-US')}` }
    }

    if (name === 'get_my_students') {
      const { data: studs } = await svc
        .from('students')
        .select('id, full_name, current_level, trial_used_at, date_of_birth')
        .eq('parent_id', parent!.id)
        // A swimmer the family or the desk has deactivated is not one to
        // offer (adaptive-swim intake lists these as choices, 2026-10-08).
        .neq('is_active', false)
      const ids = (studs || []).map((s: any) => s.id)
      // Age in whole years on today's LA date, so the assistant never has to
      // ask a signed-in family for something the account already holds.
      const today = getTodayLA()
      const ageOf = (dob: string | null) => {
        if (!dob) return null
        const [y, m, d] = String(dob).slice(0, 10).split('-').map(Number)
        const [ty, tm, td] = today.split('-').map(Number)
        if (!y || !m || !d) return null
        return ty - y - ((tm < m || (tm === m && td < d)) ? 1 : 0)
      }
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
          age: ageOf(s.date_of_birth),
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
        // A link made in chat is also emailed (owner, 2026-10-08); one the
        // family opens from the booking page is not.
        body: JSON.stringify({ studentId, coachId, date, time, sendPaymentEmail: true }),
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
        note: `Slot reserved PENDING PAYMENT only. The parent must pay via payment_url within ${TRIAL_HOLD_MINUTES} minutes or the slot is released automatically. Never say the booking is confirmed.`,
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
    const planList = [
      '1 dollar buys 1 point. Points the family buys never expire (bonus points the school adds expire after one year) and are not tied to a course type.',
      `The website sells exactly these amounts, and nothing else: ${TOPUP_PRESETS.map(p => {
        const shape = presetLessons(p)
        return shape ? `$${p.toLocaleString('en-US')} (${shape.lessons} x ${shape.slug})` : '$' + p.toLocaleString('en-US')
      }).join(', ')}.`,
      'A parent who wants a smaller or different amount has to be sent to the front desk; you cannot create a link for one.',
    ].join('\n')

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
      // A system line (the desk handing the chat back) is not something the
      // assistant said.
      if (m.sender_type === 'system') continue
      const role = m.sender_type === 'parent' ? ('user' as const) : ('assistant' as const)
      const text = role === 'user' ? String(m.body || '').slice(0, MAX_PARENT_LEN) : m.body
      const prev = merged[merged.length - 1]
      if (prev && prev.role === role && typeof prev.content === 'string') prev.content += '\n' + text
      else merged.push({ role, content: text })
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
    // Only a claim that a lesson WAS cancelled or refunded counts (owner,
    // 2026-10-08; lib/ai/reply-guards.ts): the bare words used to catch every
    // answer about the cancellation or refund policy.
    // scripts/chat-guard-check.mjs holds the cases.
    if (claimsCompletedCancellation(finalText) && !cancelSucceededThisTurn && !cancelAlreadyDoneThisTurn) {
      console.error('[ai-reply guard] blocked hallucinated cancellation claim:', finalText.slice(0, 200))
      escalate = true
      finalText = CANNED.cancelGuard[lang]
    }

    const claimsTrialBooked =
      /(已保留|已為您保留|已為您預約|已幫您預約|預約成功|已成功預約|slot (is|has been) reserved|reserved (the|this|your) slot|successfully (booked|reserved))/i.test(finalText)
    if (claimsTrialBooked && !trialBookSucceededThisTurn) {
      console.error('[ai-reply guard] blocked hallucinated trial booking claim:', finalText.slice(0, 200))
      escalate = true
      finalText = CANNED.trialGuard[lang]
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
    // changed: a lesson was cancelled or an assessment held this turn, so the
    // page behind the chat reads the account again (ChatWidget fires
    // ACCOUNT_CHANGED_EVENT; found 2026-10-08).
    return NextResponse.json({ ok: true, escalated: escalate, changed: cancelSucceededThisTurn || trialBookSucceededThisTurn })
  } catch (err) {
    console.error('[ai-reply]', err)
    await postAiMessage(CANNED.fallback[lang], true)
    return NextResponse.json({ ok: true, escalated: true, fallback: true, changed: cancelSucceededThisTurn || trialBookSucceededThisTurn })
  }
}
