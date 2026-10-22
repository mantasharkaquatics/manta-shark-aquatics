import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendSms, SMS_COMPLIANCE_SUFFIX } from '@/lib/sms'
import { requireCron } from '@/lib/cron-auth'
import { getLocations, lessonPlaceShown, lessonLocationLine, DEFAULT_LOCATION_ID } from '@/lib/locations'
import { sendEmail } from '@/lib/email'
import { lessonCalendar } from '@/lib/lesson-calendar'

// The terms version that first listed lesson reminders in the SMS consent.
const REMINDER_TERMS_FROM = '2026-10-05'

export const runtime = 'nodejs'
// Up to ~a minute of Twilio calls on a busy day (sent 5 at a time below).
export const maxDuration = 60

const WINDOW_START_H = 24.5
const WINDOW_END_H = 25.5

function laWallParts(d: Date) {
  const date = d.toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' })
  const time = d.toLocaleTimeString('en-GB', { timeZone: 'America/Los_Angeles', hour12: false })
  return { date, time }
}

function wallMs(dateStr: string, timeStr: string): number {
  return Date.parse(`${dateStr}T${timeStr}Z`)
}

type Row = { id: string; class_session_id: string; student_id: string | null; parent_id: string; lesson_group_id: string | null; is_trial?: boolean | null; reminder_sent_at?: string | null; reminder_email_sent_at?: string | null }

export async function GET(request: Request) {
  const denied = requireCron(request)
  if (denied) return denied

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // 25h window in LA wall-clock terms
  const now = new Date()
  const nowParts = laWallParts(now)
  const nowWall = wallMs(nowParts.date, nowParts.time)
  const winStart = nowWall + WINDOW_START_H * 3600000
  const winEnd = nowWall + WINDOW_END_H * 3600000
  const dateA = new Date(winStart).toISOString().slice(0, 10)
  const dateB = new Date(winEnd).toISOString().slice(0, 10)
  const candidateDates = dateA === dateB ? [dateA] : [dateA, dateB]

  // Step 1: sessions whose LA wall-clock start falls inside the window
  const { data: sessions, error: sessErr } = await supabase
    .from('class_sessions')
    .select('id, session_date, start_time, end_time, course_type_id, coach_id, location_id')
    .in('session_date', candidateDates)

  if (sessErr) {
    console.error('Error fetching sessions:', sessErr)
    return NextResponse.json({ error: 'DB error (sessions)' }, { status: 500 })
  }

  const inWindow = (sessions || []).filter((s) => {
    const t = wallMs(s.session_date, s.start_time || '00:00:00')
    return t >= winStart && t < winEnd
  })

  if (inWindow.length === 0) {
    return NextResponse.json({ sent: 0, results: [], note: 'no sessions in 25h window' })
  }
  const sessionMap = new Map(inWindow.map((s) => [s.id, s]))

  // Step 2: confirmed bookings for those sessions that still owe a reminder:
  // the text (reminder_sent_at) or, since 2026-10-22, the email
  // (reminder_email_sent_at, docs/migration-reminder-email.sql). Before that
  // migration the email column is not there and only texts go out.
  // A booking the family was emailed about as cancelled for coach time off
  // (the old two-step flow emailed before cancelling) must not get a
  // "lesson tomorrow" reminder (found 2026-10-07).
  const stamps = (withEmail: boolean) => supabase
    .from('bookings')
    .select('id, class_session_id, student_id, parent_id, lesson_group_id, is_trial, reminder_sent_at' + (withEmail ? ', reminder_email_sent_at' : ''))
    .eq('status', 'confirmed')
    .is('block_notice_sent_at', null)
    .in('class_session_id', inWindow.map((s) => s.id))
  let emailOn = true
  let { data: found, error: bookErr } = await stamps(true)
  if (bookErr && /reminder_email_sent_at/.test(bookErr.message || '')) {
    emailOn = false
    ;({ data: found, error: bookErr } = await stamps(false))
  }
  if (bookErr) {
    console.error('Error fetching bookings:', bookErr)
    return NextResponse.json({ error: 'DB error (bookings)' }, { status: 500 })
  }
  const bookings = ((found || []) as unknown as Row[]).filter((b) => !b.reminder_sent_at || (emailOn && !b.reminder_email_sent_at))
  if (bookings.length === 0) {
    return NextResponse.json({ sent: 0, results: [], note: 'no unreminded bookings in window' })
  }

  // Step 2b: one text per family per LESSON, not per booking row (found
  // 2026-10-05). A 60-minute lesson is two half-hour rows (lesson_group_id) and
  // a sibling 1-on-2 is one row per child on the same session; each row used to
  // get its own text, so an hour sent a second reminder an hour later quoting
  // the second half's start, and siblings got one text each. Pull in every
  // confirmed row of the hour lessons seen here (the other half can sit outside
  // this window), plus the sessions of those halves.
  const groupIds = [...new Set(bookings.map((b) => b.lesson_group_id).filter(Boolean))] as string[]
  let groupRows: Row[] = []
  if (groupIds.length > 0) {
    const { data, error } = await supabase
      .from('bookings')
      .select('id, class_session_id, student_id, parent_id, lesson_group_id, is_trial, reminder_sent_at' + (emailOn ? ', reminder_email_sent_at' : ''))
      .eq('status', 'confirmed')
      .in('lesson_group_id', groupIds)
    if (error) {
      console.error('Error fetching lesson groups:', error)
      return NextResponse.json({ error: 'DB error (lesson groups)' }, { status: 500 })
    }
    groupRows = (data || []) as unknown as Row[]
    const missing = [...new Set(groupRows.map((r) => r.class_session_id))].filter((id) => !sessionMap.has(id))
    if (missing.length > 0) {
      const { data: more, error: moreErr } = await supabase
        .from('class_sessions')
        .select('id, session_date, start_time, end_time, course_type_id, coach_id, location_id')
        .in('id', missing)
      if (moreErr) {
        console.error('Error fetching sessions (other halves):', moreErr)
        return NextResponse.json({ error: 'DB error (sessions)' }, { status: 500 })
      }
      for (const s of more || []) sessionMap.set(s.id, s)
    }
  }

  // Family + lesson -> its rows. Key on lesson_group_id for an hour, else on
  // the session (sibling seats share it). Different families never share a key.
  const lessons = new Map<string, Row[]>()
  const add = (r: Row) => {
    const key = r.parent_id + '|' + (r.lesson_group_id || 'cs:' + r.class_session_id)
    const list = lessons.get(key) || []
    if (!list.some((x) => x.id === r.id)) list.push(r)
    lessons.set(key, list)
  }
  for (const b of bookings) add(b as Row)
  for (const r of groupRows) if (bookings.some((b) => b.parent_id === r.parent_id && b.lesson_group_id === r.lesson_group_id)) add(r)

  // Step 3: batch lookups
  const uniq = (arr: (string | null)[]) => [...new Set(arr.filter(Boolean))] as string[]
  const allRows = [...lessons.values()].flat()
  const studentIds = uniq(allRows.map((b) => b.student_id))
  const parentIds = uniq(allRows.map((b) => b.parent_id))
  const courseTypeIds = uniq([...sessionMap.values()].map((s) => s.course_type_id))
  const coachIds = uniq([...sessionMap.values()].map((s) => s.coach_id))

  const [studentsRes, parentsRes, courseTypesRes, coachesRes, pools] = await Promise.all([
    supabase.from('students').select('id, full_name').in('id', studentIds),
    supabase.from('parents').select('id, phone, email, first_name, terms_version, preferred_language').in('id', parentIds),
    supabase.from('course_types').select('id, name').in('id', courseTypeIds),
    supabase.from('coaches').select('id, first_name').in('id', coachIds),
    getLocations(supabase),
  ])
  // Which pool: " at Monrovia (123 Main St)". Said once more than one is open
  // to families, for a lesson at a hidden pool (F66), and -- owner,
  // 2026-10-22 -- whenever the pool has an address set (lessonPlaceShown);
  // these go only to the family who booked. A pool with no address and one
  // pool open reads exactly as before.
  const poolText = (locationId: string | null | undefined) => {
    if (!lessonPlaceShown(pools, locationId)) return ''
    const loc = pools.find((l) => l.id === (locationId || DEFAULT_LOCATION_ID))
    if (!loc) return ''
    const addr = (loc.address || '').trim()
    return ` at ${loc.name}${addr && addr.toLowerCase() !== loc.name.trim().toLowerCase() ? ` (${addr})` : ''}`
  }

  for (const [label, res] of [
    ['students', studentsRes],
    ['parents', parentsRes],
    ['course_types', courseTypesRes],
    ['coaches', coachesRes],
  ] as const) {
    if (res.error) {
      console.error(`Error fetching ${label}:`, res.error)
      return NextResponse.json({ error: `DB error (${label})` }, { status: 500 })
    }
  }

  const studentMap = new Map((studentsRes.data || []).map((r) => [r.id, r]))
  const parentMap = new Map((parentsRes.data || []).map((r) => [r.id, r]))
  const courseTypeMap = new Map((courseTypesRes.data || []).map((r) => [r.id, r]))
  const coachMap = new Map((coachesRes.data || []).map((r) => [r.id, r]))

  const results: Array<Record<string, unknown>> = []
  let sent = 0

  const textLesson = async (rows: Row[]) => {
    const ids = rows.map((r) => r.id)
    const parent = parentMap.get(rows[0].parent_id)
    if (!parent?.phone) return
    // Paused for families who signed up before 2026-10-05 (owner, 2026-10-06).
    // The SMS terms they agreed to named only one-time passcodes; reminders
    // were added to the terms on 10-05. Those accounts are all deleted before
    // launch, so nothing re-asks them. Versions are YYYY-MM-DD, so the string
    // comparison is a date comparison; a missing version counts as older.
    const termsVersion: string | null = (parent as { terms_version?: string | null }).terms_version ?? null
    if (!termsVersion || termsVersion < REMINDER_TERMS_FROM) {
      results.push({ booking_ids: rows.map((r) => r.id), skipped: 'signed up before reminder consent' })
      return
    }
    // The lesson starts when its EARLIEST half starts. Only that run texts:
    // when the earliest half is outside this window (it was this family's
    // reminder an hour ago, or the lesson was booked inside 24.5 hours), the
    // later half seen here is not a lesson of its own.
    const sess = [...new Set(rows.map((r) => r.class_session_id))]
      .map((id) => sessionMap.get(id))
      .filter(Boolean)
      .sort((a: any, b: any) => wallMs(a.session_date, a.start_time || '00:00:00') - wallMs(b.session_date, b.start_time || '00:00:00')) as any[]
    const first = sess[0]
    if (!first) return
    const firstAt = wallMs(first.session_date, first.start_time || '00:00:00')
    if (firstAt < winStart || firstAt >= winEnd) return
    const pending = rows.filter((r) => !r.reminder_sent_at).map((r) => r.id)
    if (pending.length === 0) return

    // Claim BEFORE sending (found 2026-10-05). The stamp used to be written
    // after Twilio answered, so two overlapping runs both saw the rows
    // unreminded and both texted. The conditional update is the lock: only
    // the run whose update actually flips reminder_sent_at sends.
    const stampAt = new Date().toISOString()
    const { data: claimed, error: claimErr } = await supabase
      .from('bookings')
      .update({ reminder_sent_at: stampAt })
      .in('id', pending)
      .is('reminder_sent_at', null)
      .eq('status', 'confirmed')
      .select('id')
    if (claimErr) {
      console.error('Error claiming reminder rows:', pending, claimErr)
      results.push({ booking_ids: ids, error: 'claim failed' })
      return
    }
    const claimedIds = (claimed || []).map((r: any) => r.id as string)
    if (claimedIds.length === 0) {
      results.push({ booking_ids: ids, skipped: 'claimed by another run' })
      return
    }
    const release = async () => {
      const { error } = await supabase
        .from('bookings')
        .update({ reminder_sent_at: null })
        .in('id', claimedIds)
        .eq('reminder_sent_at', stampAt)
      if (error) console.error('Error releasing reminder claim:', claimedIds, error)
    }

    const names = [...new Set(rows.map((r) => studentMap.get(r.student_id || '')?.full_name).filter(Boolean))] as string[]
    const who = names.length ? names.join(' & ') : 'your swimmer'
    const courseType = courseTypeMap.get(first.course_type_id)
    const coach = coachMap.get(first.coach_id)
    const time = formatTime(first.start_time || '')
    const hour = sess.length > 1 ? ' (60 min)' : ''
    // STOP/HELP line (2026-10-05): the SMS Terms tell families to "Reply STOP
    // to any message to opt out", and the reminder was the one text without it.
    // A Swim Assessment sits in an ordinary 1-on-1 slot, so the course name
    // read "1-on-1 Private lesson" -- in the family's first text from us,
    // about something they booked as an assessment (found 2026-10-06).
    const what = rows.some((r) => r.is_trial) ? 'a Swim Assessment' : `a ${courseType?.name} lesson${hour}`
    const message = `Hi ${parent.first_name}! Reminder: ${who} ${names.length > 1 ? 'have' : 'has'} ${what} tomorrow at ${time} with Coach ${coach?.first_name}${poolText(first.location_id)}. See you then! - Manta Shark Aquatics${SMS_COMPLIANCE_SUFFIX}`

    try {
      const result = await sendSms(parent.phone, message)
      if (result.ok && result.sid) {
        sent += 1
        // Ids and status only, never the number (found 2026-10-15): this body
        // is kept in cron-job.org's job history, a third party's log.
        results.push({ booking_ids: claimedIds, status: result.status, stamped: true })
      } else {
        await release()
        results.push({
          booking_ids: claimedIds,
          error: result.ok ? 'twilio accepted the message but returned no sid' : result.code ?? result.reason,
        })
      }
    } catch (err) {
      await release()
      // The full error to our own log only: a provider's message can quote the number.
      console.error('sms-reminder: send failed for bookings', claimedIds.join(','), err)
      results.push({ booking_ids: claimedIds, error: 'send failed (see server log)' })
    }
  }

  // The day-before email (owner, 2026-10-22): every family, whatever their
  // SMS consent, in their language, with the pool's address, map and arrival
  // notes and the lesson's calendar file. Claimed the same way as the text.
  let emailed = 0
  const emailLesson = async (rows: Row[]) => {
    if (!emailOn) return
    const parent = parentMap.get(rows[0].parent_id) as { email?: string | null; first_name?: string | null; preferred_language?: string | null } | undefined
    if (!parent?.email) return
    const sess = [...new Set(rows.map((r) => r.class_session_id))]
      .map((id) => sessionMap.get(id))
      .filter(Boolean)
      .sort((a: any, b: any) => wallMs(a.session_date, a.start_time || '00:00:00') - wallMs(b.session_date, b.start_time || '00:00:00')) as any[]
    const first = sess[0]
    if (!first) return
    const firstAt = wallMs(first.session_date, first.start_time || '00:00:00')
    if (firstAt < winStart || firstAt >= winEnd) return
    const pending = rows.filter((r) => !r.reminder_email_sent_at).map((r) => r.id)
    if (pending.length === 0) return
    const stampAt = new Date().toISOString()
    const { data: claimed, error: claimErr } = await supabase
      .from('bookings')
      .update({ reminder_email_sent_at: stampAt })
      .in('id', pending)
      .is('reminder_email_sent_at', null)
      .eq('status', 'confirmed')
      .select('id')
    if (claimErr || !claimed || claimed.length === 0) return
    const claimedIds = claimed.map((r: any) => r.id as string)
    const last = sess[sess.length - 1]
    const names = [...new Set(rows.map((r) => studentMap.get(r.student_id || '')?.full_name).filter(Boolean))] as string[]
    const courseType = courseTypeMap.get(first.course_type_id)
    let ok = false
    try {
      ok = await sendEmail({
        type: 'reminder_24h',
        to: parent.email,
        lang: parent.preferred_language || undefined,
        parentName: parent.first_name || '',
        studentName: names.join(' & '),
        courseName: rows.some((r) => r.is_trial) ? 'Swim Assessment' : `${courseType?.name || ''}${sess.length > 1 ? ' (60 min)' : ''}`,
        coachName: coachMap.get(first.coach_id)?.first_name || '',
        date: first.session_date,
        time: `${formatTime(first.start_time || '')} – ${formatTime(last.end_time || '')}`,
        location: await lessonLocationLine(supabase, first.location_id, pools),
        calendar: await lessonCalendar(supabase, rows[0].parent_id, rows.map((r) => r.id)),
      })
    } catch (err) {
      console.error('reminder email: send failed for bookings', claimedIds.join(','), err)
    }
    if (ok) { emailed += 1; return }
    const { error } = await supabase.from('bookings').update({ reminder_email_sent_at: null })
      .in('id', claimedIds).eq('reminder_email_sent_at', stampAt)
    if (error) console.error('Error releasing reminder email claim:', claimedIds, error)
  }
  const remindLesson = async (rows: Row[]) => {
    await textLesson(rows)
    await emailLesson(rows)
  }

  // A few at a time: one-by-one could run past the function limit on a busy
  // day, all at once would hit Twilio's rate limit.
  const queue = [...lessons.values()]
  const CONCURRENCY = 5
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
      for (let rows = queue.shift(); rows; rows = queue.shift()) await remindLesson(rows)
    }),
  )

  return NextResponse.json({ sent, emailed, emailOn, results })
}

function formatTime(t: string): string {
  if (!t) return ''
  const [h, m] = t.split(':').map(Number)
  const ampm = h >= 12 ? 'PM' : 'AM'
  const hour = h % 12 || 12
  return `${hour}:${String(m).padStart(2, '0')} ${ampm}`
}
