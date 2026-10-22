/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server'
import { requireParent } from '@/lib/api-auth'
import { familyWaitlist, placeOpen, slotTeachable, type WaitEntry } from '@/lib/waitlist'
import { tierFor } from '@/lib/team-tiers'
import { singleMaxDate } from '@/lib/booking-time'
import { getTodayLA, isGridStart } from '@/lib/date'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/* A family's waitlist places (lib/waitlist.ts, owner 2026-10-22).

   GET                          -> { entries }  (waiting and offered)
   POST { kind: 'team', student_id, team_tier_id }
        { kind: 'group', student_id, class_session_id }
        { kind: 'slot', student_id, coach_id, course_type_id, date, time, minutes }
                                -> { ok, id }
   DELETE ?id=                  -> leaves the line

   Joining is refused with `code` when the place is not actually full
   ('not_full': book it instead), the swimmer cannot take it, or the family
   already waits for it. At most 10 places in line per family. */

const MAX_LIVE = 10
const bad = (code: string, error: string, status = 400) => NextResponse.json({ error, code }, { status })

export async function GET() {
  const ctx = await requireParent()
  if (!ctx) return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
  return NextResponse.json({ entries: await familyWaitlist(ctx.svc, ctx.parent.id) }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(req: NextRequest) {
  const ctx = await requireParent()
  if (!ctx) return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
  const { svc, parent } = ctx
  const b = await req.json().catch(() => null) as any
  if (!b || !['team', 'group', 'slot'].includes(b.kind)) return bad('bad_request', 'Invalid request')

  const { data: kid } = await svc.from('students').select('id, parent_id, is_active, current_level, current_stage').eq('id', String(b.student_id || '')).maybeSingle()
  if (!kid || kid.parent_id !== parent.id || kid.is_active === false) return bad('student', 'Swimmer not found', 404)
  if (kid.current_level == null) return bad('needs_assessment', 'This swimmer needs a Swim Assessment first')

  const { count: liveCount, error: cErr } = await svc.from('waitlist_entries').select('id', { count: 'exact', head: true })
    .eq('parent_id', parent.id).in('status', ['waiting', 'offered'])
  if (cErr) return bad('unavailable', 'Waitlists are not available yet', 503)
  if ((liveCount || 0) >= MAX_LIVE) return bad('too_many', 'Too many waitlist places')

  const row: Partial<WaitEntry> = { parent_id: parent.id, student_id: kid.id, kind: b.kind }
  const today = getTodayLA()

  if (b.kind === 'team') {
    const { data: tiers } = await svc.from('team_tiers').select('id, name, level_min, level_max, min_stage, max_stage').eq('active', true)
    // No squad named: the one the swimmer's level belongs to (the checkout page).
    const tier = b.team_tier_id ? (tiers || []).find((t: any) => t.id === b.team_tier_id) : tierFor(tiers || [], kid.current_level, kid.current_stage)
    if (!tier) return bad('not_found', 'Squad not found', 404)
    if (tierFor(tiers || [], kid.current_level, kid.current_stage)?.id !== tier.id) return bad('wrong_level', 'This squad is not for this swimmer\'s level')
    const { count: member } = await svc.from('team_memberships').select('id', { count: 'exact', head: true })
      .eq('student_id', kid.id).in('status', ['active', 'past_due'])
    if ((member || 0) > 0) return bad('already_in', 'This swimmer is already on the team')
    row.team_tier_id = tier.id
  } else if (b.kind === 'group') {
    const { data: s } = await svc.from('class_sessions')
      .select('id, status, session_date, start_time, level_min, level_max, course_types(slug)').eq('id', String(b.class_session_id || '')).maybeSingle()
    const slug = (Array.isArray((s as any)?.course_types) ? (s as any).course_types[0] : (s as any)?.course_types)?.slug
    if (!s || s.status === 'cancelled' || slug !== '1on4') return bad('not_found', 'Class not found', 404)
    if (s.session_date < today) return bad('past', 'This class has passed')
    const lv = Number(kid.current_level)
    if (s.level_min != null && s.level_max != null && (lv < s.level_min || lv > s.level_max)) return bad('wrong_level', 'This class is not for this swimmer\'s level')
    const { count: mine } = await svc.from('bookings').select('id', { count: 'exact', head: true })
      .eq('class_session_id', s.id).eq('student_id', kid.id).neq('status', 'cancelled')
    if ((mine || 0) > 0) return bad('already_in', 'This swimmer is already in this class')
    row.class_session_id = s.id
  } else {
    const date = String(b.date || ''), time = String(b.time || '').slice(0, 5)
    const minutes = Number(b.minutes) === 60 ? 60 : 30
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time) || !isGridStart(time)) return bad('bad_request', 'Invalid time')
    if (date < today || date > singleMaxDate(today)) return bad('past', 'That date cannot be waited for')
    const [{ data: coach }, { data: ct }] = await Promise.all([
      svc.from('coaches').select('id, is_active').eq('id', String(b.coach_id || '')).maybeSingle(),
      svc.from('course_types').select('id, slug').eq('id', String(b.course_type_id || '')).maybeSingle(),
    ])
    if (!coach || coach.is_active === false || !ct || ct.slug !== '1on1') return bad('not_found', 'Coach or lesson not found', 404)
    Object.assign(row, { coach_id: coach.id, course_type_id: ct.id, slot_date: date, slot_start: time, minutes })
    if (!(await slotTeachable(svc, coach.id, ct.id, date, time, minutes))) return bad('not_teaching', 'The coach does not teach this lesson at that time')
  }

  // Only a place that is really taken can be waited for.
  if (await placeOpen(svc, { ...(row as WaitEntry), status: 'waiting' }, [])) return bad('not_full', 'There is a place free: book it now')

  const { data: ins, error } = await svc.from('waitlist_entries').insert(row).select('id').single()
  if (error) return error.code === '23505' ? bad('already_waiting', 'Already on this waitlist', 409) : bad('server', 'Could not join the waitlist', 500)
  return NextResponse.json({ ok: true, id: ins.id })
}

export async function DELETE(req: NextRequest) {
  const ctx = await requireParent()
  if (!ctx) return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
  const id = req.nextUrl.searchParams.get('id') || ''
  const { data } = await ctx.svc.from('waitlist_entries').update({ status: 'left' })
    .eq('id', id).eq('parent_id', ctx.parent.id).in('status', ['waiting', 'offered']).select('id')
  if (!data || data.length === 0) return bad('not_found', 'Not found', 404)
  return NextResponse.json({ ok: true })
}
