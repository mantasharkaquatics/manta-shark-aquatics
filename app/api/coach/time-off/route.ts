import { NextRequest, NextResponse } from 'next/server'
import { requireCoach } from '@/lib/api-auth'
import { handledTimeOffIds, bookedLessonsInWindow, type BookedLesson } from '@/lib/time-off'
import { getTodayLA, formatTime12h } from '@/lib/date'
import { sendEmail } from '@/lib/email'
import { sendSms } from '@/lib/sms'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/
const toM = (t: string) => { const [h, m] = String(t).slice(0, 5).split(':').map(Number); return h * 60 + m }

// POST: a coach requests time off (owner, 2026-10-08).
//
// This was an insert straight from the browser, so nothing ran on the server
// and nobody was told: time off covering booked lessons sat on the admin's
// Time Off page until someone happened to open it, the day-before SMS still
// went out, and families arrived to no coach -- while the coach's form said
// the office would contact them. Now the request comes through here, and when
// it covers booked lessons the desk hears about it three ways (owner):
//   1. an email to ADMIN_ALERT_EMAIL listing the lessons and families;
//   2. a short SMS to ADMIN_ALERT_PHONE (skipped quietly when unset);
//   3. a red item on /admin/reviews and the sidebar badge, which stays until
//      the office runs "cancel & notify" (lib/time-off timeOffNeedingAction).
// The time off is saved whatever happens to 1 and 2; 3 needs no sending.
export async function POST(req: NextRequest) {
  const auth = await requireCoach()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { svc, coach } = auth

  const body = await req.json().catch(() => null)
  const date = typeof body?.date === 'string' ? body.date : ''
  const allDay = !body?.start_time && !body?.end_time
  const start = allDay ? null : String(body?.start_time || '').slice(0, 5)
  const end = allDay ? null : String(body?.end_time || '').slice(0, 5)
  const reason = typeof body?.reason === 'string' && body.reason.trim() ? body.reason.trim().slice(0, 500) : null

  if (!DATE_RE.test(date)) return NextResponse.json({ error: 'Pick a date.', code: 'date' }, { status: 400 })
  if (date < getTodayLA()) return NextResponse.json({ error: 'Cannot request time off for past dates.', code: 'past' }, { status: 400 })
  if (!allDay && (!start || !end || !TIME_RE.test(start) || !TIME_RE.test(end)))
    return NextResponse.json({ error: 'Pick start and end times.', code: 'times' }, { status: 400 })
  if (!allDay && start! >= end!) return NextResponse.json({ error: 'End time must be after start time.', code: 'order' }, { status: 400 })

  // Same overlap rule as the form: whole-day time off clashes with anything
  // that day, part-day only where the windows overlap.
  const { data: existing, error: exErr } = await svc
    .from('coach_time_off').select('id, start_time, end_time')
    .eq('coach_id', coach.id).eq('date', date).eq('block_type', 'time_off')
  if (exErr) return NextResponse.json({ error: 'Lookup failed' }, { status: 500 })
  const clash = ((existing || []) as { start_time: string | null; end_time: string | null }[]).some(t => {
    if (allDay || t.start_time == null || t.end_time == null) return true
    return toM(start!) < toM(t.end_time) && toM(end!) > toM(t.start_time)
  })
  if (clash) return NextResponse.json({ error: 'This overlaps with your existing time off on this date.', code: 'clash' }, { status: 409 })

  const { data: row, error } = await svc
    .from('coach_time_off')
    .insert({ coach_id: coach.id, date, reason, start_time: start, end_time: end, block_type: 'time_off' })
    .select('id, date, reason, created_at, start_time, end_time')
    .single()
  if (error || !row) {
    console.error('coach time-off insert failed:', error?.message)
    return NextResponse.json({ error: 'Failed to submit' }, { status: 500 })
  }

  const lessons = await bookedLessonsInWindow(svc, coach.id, date, start, end)
  if (lessons === null) console.error('coach time-off: booked lessons not read for', row.id)
  const affected = lessons?.length || 0
  if (affected > 0) {
    try {
      await alertDesk(svc, coach, row, lessons!)
    } catch (e) {
      // The Reviews item still shows it; a failed alert must not undo the request.
      console.error('coach time-off: desk alert failed:', e)
    }
  }
  return NextResponse.json({ item: row, affected })
}

type Svc = NonNullable<Awaited<ReturnType<typeof requireCoach>>>['svc']
type Row = { id: string; date: string; reason: string | null; start_time: string | null; end_time: string | null }
type Named = { id: string; full_name?: string; first_name?: string; last_name?: string; phone?: string | null; email?: string | null; name?: string }

async function alertDesk(svc: Svc, coach: { id: string; first_name: string }, row: Row, lessons: BookedLesson[]) {
  const { data: me } = await svc.from('coaches').select('first_name, last_name').eq('id', coach.id).maybeSingle()
  const coachName = me ? `${me.first_name || ''} ${me.last_name || ''}`.trim() : coach.first_name
  const stuIds = [...new Set(lessons.flatMap(l => l.students.map(s => s.id)))]
  const parIds = [...new Set(lessons.flatMap(l => l.students.map(s => s.parent_id)).filter(Boolean))] as string[]
  const ctIds = [...new Set(lessons.map(l => l.course_type_id).filter(Boolean))] as string[]
  const [{ data: stus }, { data: pars }, { data: cts }] = await Promise.all([
    stuIds.length ? svc.from('students').select('id, full_name').in('id', stuIds) : Promise.resolve({ data: [] }),
    parIds.length ? svc.from('parents').select('id, first_name, last_name, phone, email').in('id', parIds) : Promise.resolve({ data: [] }),
    ctIds.length ? svc.from('course_types').select('id, name').in('id', ctIds) : Promise.resolve({ data: [] }),
  ])
  const byId = (list: Named[] | null) => new Map<string, Named>((list || []).map(x => [x.id, x]))
  const stuMap = byId(stus)
  const parMap = byId(pars)
  const ctMap = byId(cts)

  const day = new Date(row.date + 'T00:00:00Z').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })
  const span = row.start_time && row.end_time
    ? `${formatTime12h(row.start_time)} – ${formatTime12h(row.end_time)}`
    : 'all day'
  const n = lessons.length
  const plural = n === 1 ? 'lesson' : 'lessons'

  const lines: string[] = [
    `Coach ${coachName} has requested time off on ${day} (${span}). It covers ${n} booked ${plural}.`,
    ...(row.reason ? [`Reason given: ${row.reason}`] : []),
    'Nothing has been cancelled and no family has been told yet. Contact the families, then use "Cancel & notify" on the admin Time Off page (or move the lessons to another coach).',
    ...lessons.map(l => {
      const course = l.is_trial ? 'Swim Assessment' : (l.course_type_id ? ctMap.get(l.course_type_id)?.name || '' : '')
      const who = l.students.map(s => {
        const p = s.parent_id ? parMap.get(s.parent_id) : null
        const family = p ? [`${p.first_name || ''} ${p.last_name || ''}`.trim(), p.phone, p.email].filter(Boolean).join(', ') : ''
        return `${stuMap.get(s.id)?.full_name || 'Swimmer'}${family ? ` (${family})` : ''}`
      }).join('; ')
      return `• ${formatTime12h(l.start)} – ${formatTime12h(l.end)}${course ? ` · ${course}` : ''} · ${who}`
    }),
    `${process.env.NEXT_PUBLIC_APP_URL || 'https://www.mantasharkaquatics.net'}/admin/time-off`,
  ]

  const results = await Promise.allSettled([
    sendEmail({
      type: 'admin_alert',
      to: process.env.ADMIN_ALERT_EMAIL || 'info@mantasharkaquatics.net',
      alertTitle: `Coach time off covers ${n} booked ${plural} (${day})`,
      alertLines: lines,
    }),
    // A short text to the person in charge. No phone set: no text, no error.
    process.env.ADMIN_ALERT_PHONE
      ? sendSms(process.env.ADMIN_ALERT_PHONE,
        `Manta Shark: Coach ${coachName} took time off ${day} (${span}), covering ${n} booked ${plural}. Families not told yet. See admin Reviews / Time Off.`)
      : Promise.resolve(null),
  ])
  for (const r of results) if (r.status === 'rejected') console.error('coach time-off: desk alert failed:', r.reason)
  if (results[0].status === 'fulfilled' && results[0].value === false) console.error('coach time-off: desk email not sent for', row.id)
  const sms = results[1]
  if (sms.status === 'fulfilled' && sms.value && !sms.value.ok) console.error('coach time-off: desk SMS not sent for', row.id, sms.value.reason)
}

// DELETE: a coach removes their own time off.
//
// This used to be a direct table delete from the browser, with nothing that
// looked at the families. A coach could remove time off after the admin had
// emailed families that their lessons were cancelled, which left the lessons
// with no record on the admin's Time Off page of why they were cancelled (or,
// under the old two-step flow, still booked and charged) (found 2026-10-07).
// Once families have been told, only the office can change it (owner,
// 2026-10-07).
export async function DELETE(req: NextRequest) {
  const auth = await requireCoach()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { svc, coach } = auth

  const body = await req.json().catch(() => null)
  const id = body?.id
  if (!id || typeof id !== 'string') return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  // Only the coach's own time off; an admin block is the office's.
  const { data: block } = await svc
    .from('coach_time_off')
    .select('id, coach_id, date, start_time, end_time, block_type')
    .eq('id', id)
    .eq('coach_id', coach.id)
    .eq('block_type', 'time_off')
    .maybeSingle()
  if (!block) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const handled = await handledTimeOffIds(svc, [block])
  if (!handled) return NextResponse.json({ error: 'Lookup failed' }, { status: 500 })
  if (handled.has(block.id))
    return NextResponse.json({ error: 'Families have already been told about this time off. Ask the office to change it.', code: 'locked' }, { status: 409 })

  const { data: gone, error } = await svc
    .from('coach_time_off').delete().eq('id', block.id).eq('coach_id', coach.id).select('id')
  if (error || !gone || gone.length === 0) return NextResponse.json({ error: 'Failed to delete' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
