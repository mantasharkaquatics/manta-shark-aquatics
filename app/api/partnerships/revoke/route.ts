import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { readJson, badRequest } from '@/lib/http'
import { sendEmail } from '@/lib/email'
import { formatTime12h } from '@/lib/date'
import { getLocations, lessonLocationLine } from '@/lib/locations'

type CancelledRow = { id: string; parent_id: string | null; student_id: string | null; class_session_id: string | null; lesson_group_id: string | null }
type SessRow = { id: string; session_date: string; start_time: string; end_time: string | null; course_type_id: string; location_id?: string | null }
type Svc = SupabaseClient
const NO_ID = '00000000-0000-0000-0000-000000000000'

export async function POST(req: NextRequest) {
  const body = await readJson(req)
  if (!body) return badRequest()
  const { partnership_id } = body
  if (!partnership_id) return NextResponse.json({ error: 'Missing partnership_id' }, { status: 400 })

  const cookieStore = await cookies()
  const supabaseAuth = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } }
  )
  const { data: { user } } = await supabaseAuth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: parent } = await supabase
    .from('parents').select('id').eq('auth_user_id', user.id).single()
  if (!parent) return NextResponse.json({ error: 'Parent not found' }, { status: 404 })

  const { data: partnership } = await supabase
    .from('parent_partnerships')
    .select('id, initiator_parent_id, partner_parent_id')
    .eq('id', partnership_id)
    .eq('status', 'active')
    .single()

  if (!partnership) return NextResponse.json({ error: 'Partnership not found' }, { status: 404 })
  if (partnership.initiator_parent_id !== parent.id && partnership.partner_parent_id !== parent.id)
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // Cancel all pending cross-account bookings
  const otherParentId = partnership.initiator_parent_id === parent.id
    ? partnership.partner_parent_id
    : partnership.initiator_parent_id

  // Only pending invitations, which were never charged -- nothing to refund.
  // Exactly the invitations between THESE two parents, in both directions
  // (found 2026-10-05). It used to match partner_parent_id = the other parent
  // alone, which cancelled every invite that parent had sent to ANY family
  // and missed the ones this parent had sent to them. On an invite row,
  // parent_id is the invited family and partner_parent_id the inviter.
  const { data: pendingBookings, error: findErr } = await supabase
    .from('bookings')
    .select('id, partner_booking_id, lesson_group_id')
    .or(`and(parent_id.eq.${parent.id},partner_parent_id.eq.${otherParentId}),and(parent_id.eq.${otherParentId},partner_parent_id.eq.${parent.id})`)
    .eq('pending_action', 'confirm')
    .eq('status', 'pending_partner')
  if (findErr) return NextResponse.json({ error: 'Could not unlink the accounts' }, { status: 500 })

  // The inviter's own pending (also uncharged) half of each invitation goes
  // with it, as in reject-partner: the linked row, or the whole hour group.
  const ids = new Set<string>()
  const groups = new Set<string>()
  for (const b of pendingBookings || []) {
    ids.add(b.id)
    if (b.partner_booking_id) ids.add(b.partner_booking_id)
    if (b.lesson_group_id) groups.add(b.lesson_group_id)
  }
  if (groups.size > 0) {
    const { data: groupRows } = await supabase.from('bookings')
      .select('id').in('lesson_group_id', [...groups]).eq('status', 'pending_partner')
    for (const r of groupRows || []) ids.add(r.id)
  }
  // Marked with why, so the desk can tell these from a decline or an expiry,
  // and read back so only the rows really cancelled here are announced.
  let cancelledRows: CancelledRow[] = []
  if (ids.size > 0) {
    const { data: cancelled, error: cancelErr } = await supabase.from('bookings')
      .update({ status: 'cancelled', pending_action: null, cancellation_reason: 'partnership_revoked' })
      .in('id', [...ids])
      .eq('status', 'pending_partner')
      .select('id, parent_id, student_id, class_session_id, lesson_group_id')
    if (cancelErr) return NextResponse.json({ error: 'Could not unlink the accounts' }, { status: 500 })
    cancelledRows = (cancelled || []) as CancelledRow[]
  }

  const { error: revokeErr } = await supabase
    .from('parent_partnerships')
    .update({ status: 'revoked', revoked_at: new Date().toISOString() })
    .eq('id', partnership_id)
  if (revokeErr) return NextResponse.json({ error: 'Could not unlink the accounts' }, { status: 500 })

  await notifyUnlinkedInvites(supabase, cancelledRows)

  return NextResponse.json({ success: true })
}

/** Tell both families about each invitation the unlink cancelled (found
 *  2026-10-07: declined, withdrawn and expired invitations were all
 *  announced, this one was not -- the inviter's waiting card just vanished).
 *  One email per family per lesson, naming that family's swimmers; an hour
 *  (two sessions on one lesson_group_id) reads as one span, as the expiry
 *  notice does. Best effort: the unlink has already happened. */
async function notifyUnlinkedInvites(svc: Svc, rows: CancelledRow[]): Promise<void> {
  if (rows.length === 0) return
  try {
    const uniq = (xs: (string | null)[]) => {
      const out = [...new Set(xs.filter((x): x is string => !!x))]
      return out.length ? out : [NO_ID]
    }
    const [{ data: sessData }, { data: parentData }, { data: kidData }, allLocations] = await Promise.all([
      svc.from('class_sessions').select('id, session_date, start_time, end_time, course_type_id, location_id').in('id', uniq(rows.map(r => r.class_session_id))),
      svc.from('parents').select('id, first_name, last_name, email').in('id', uniq(rows.map(r => r.parent_id))),
      svc.from('students').select('id, full_name').in('id', uniq(rows.map(r => r.student_id))),
      getLocations(svc),
    ])
    const sessList = (sessData || []) as SessRow[]
    const { data: ctData } = await svc.from('course_types').select('id, name').in('id', uniq(sessList.map(x => x.course_type_id)))
    const sessionById = new Map(sessList.map(x => [x.id, x]))
    const parentById = new Map(((parentData || []) as { id: string; first_name: string | null; last_name: string | null; email: string | null }[]).map(x => [x.id, x]))
    const nameOf = new Map(((kidData || []) as { id: string; full_name: string }[]).map(k => [k.id, k.full_name]))
    const courseName = new Map(((ctData || []) as { id: string; name: string }[]).map(c => [c.id, c.name]))

    // One lesson per key: an hour's four rows share a lesson_group_id; a
    // 30-minute invitation's two rows share their session.
    const lessons = new Map<string, CancelledRow[]>()
    for (const r of rows) {
      const key = r.lesson_group_id || r.class_session_id
      if (key) lessons.set(key, [...(lessons.get(key) || []), r])
    }
    for (const lessonRows of lessons.values()) {
      const sess = [...new Set(lessonRows.map(r => r.class_session_id))]
        .map(id => (id ? sessionById.get(id) : undefined)).filter((x): x is SessRow => !!x)
        .sort((a, b) => String(a.start_time).localeCompare(String(b.start_time)))
      if (sess.length === 0) continue
      const first = sess[0]
      const lastEnd = sess.reduce((e, x) => (x.end_time && String(x.end_time) > e ? String(x.end_time) : e), String(first.end_time || ''))
      const name = courseName.get(first.course_type_id) || ''
      const families = [...new Set(lessonRows.map(r => r.parent_id).filter((x): x is string => !!x))]
      const location = await lessonLocationLine(svc, first.location_id, allLocations)
      for (const pid of families) {
        const p = parentById.get(pid)
        if (!p?.email) continue
        const otherId = families.find(x => x !== pid)
        const other = otherId ? parentById.get(otherId) : undefined
        await sendEmail({
          type: 'partner_invite_unlinked',
          to: p.email,
          parentName: p.first_name || '',
          partnerName: other ? `${other.first_name || ''} ${other.last_name || ''}`.trim() : '',
          studentName: [...new Set(lessonRows.filter(r => r.parent_id === pid).map(r => (r.student_id ? nameOf.get(r.student_id) : '')).filter(Boolean))].join(' & '),
          courseName: sess.length > 1 ? `${name} (60 min)` : name,
          date: first.session_date,
          time: lastEnd ? `${formatTime12h(first.start_time)} \u2013 ${formatTime12h(lastEnd)}` : formatTime12h(first.start_time),
          location,
        })
      }
    }
  } catch (e) {
    console.error('partnership revoke: invitation-cancelled email failed:', e)
  }
}
