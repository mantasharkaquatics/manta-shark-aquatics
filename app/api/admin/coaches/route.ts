import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createHash } from 'crypto'
import { requireAdmin } from '@/lib/api-auth'
import { readJson, badRequest } from '@/lib/http'
import { allRows, allRowsIn } from '@/lib/db-paging'
import { getTodayLA, getNowMinutesLA } from '@/lib/date'

const svc = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// List coaches
export async function GET() {
  const auth = await requireAdmin()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const s = svc()
  const [{ data, error }, { data: zrows }] = await Promise.all([
    s.from('coaches')
      .select('id, first_name, last_name, email, is_active, created_at')
      .order('created_at'),
    s.from('coach_availability_zones').select('coach_id'),
  ])
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const zoned = new Set((zrows || []).map((r: { coach_id: string }) => r.coach_id))
  return NextResponse.json({ coaches: (data || []).map((c: { id: string }) => ({ ...c, zoned: zoned.has(c.id) })) })
}

// Create coach
export async function POST(req: NextRequest) {
  const auth = await requireAdmin()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await readJson(req)
  if (!body) return badRequest()
  const { first_name, last_name, email, pin } = body
  if (!first_name?.trim() || !email?.trim()) {
    return NextResponse.json({ error: 'Name and email are required', code: 'missing_fields' }, { status: 400 })
  }
  if (!/^\d{8}$/.test(pin || '')) {
    return NextResponse.json({ error: 'PIN must be exactly 8 digits', code: 'bad_pin' }, { status: 400 })
  }

  const s = svc()
  const pinHash = createHash('sha256').update(pin).digest('hex')

  const { data: dup } = await s.from('coaches').select('id').eq('pin_hash', pinHash).maybeSingle()
  if (dup) return NextResponse.json({ error: 'This PIN is already in use by another coach', code: 'pin_in_use' }, { status: 409 })

  const { data: authUser, error: authErr } = await s.auth.admin.createUser({
    email: email.trim().toLowerCase(),
    email_confirm: true,
  })
  if (authErr || !authUser?.user) {
    // Almost always an email that already has a login (family, coach or admin).
    const taken = /already|registered|exists/i.test(authErr?.message || '')
    return NextResponse.json({ error: 'Auth account creation failed: ' + (authErr?.message || ''), code: taken ? 'email_taken' : 'server' }, { status: taken ? 409 : 500 })
  }

  const { data: coach, error: coachErr } = await s.from('coaches').insert({
    first_name: first_name.trim(),
    last_name: (last_name || '').trim() || null,
    email: email.trim().toLowerCase(),
    pin_hash: pinHash,
    auth_user_id: authUser.user.id,
    is_active: true,
  }).select().single()

  if (coachErr) {
    await s.auth.admin.deleteUser(authUser.user.id) // rollback
    return NextResponse.json({ error: 'Coach creation failed: ' + coachErr.message }, { status: 500 })
  }
  return NextResponse.json({ coach })
}

const toMin = (t: string) => { const [h, m] = String(t).slice(0, 5).split(':').map(Number); return h * 60 + m }

/** A coach's lessons still to come -- booked swimmers in sessions from now on
 *  -- and active fixed classes. Owner, 2026-10-08: a coach with any of these
 *  cannot be deactivated; the lessons are moved to another coach or cancelled
 *  first. Deactivating used to take one click with nothing checked: the
 *  coach's column vanished from the Booking page (it reads active coaches
 *  only) with their lessons in it, families were still reminded, and nobody
 *  came to teach (found 2026-10-08). */
async function futureLoad(s: any, coachId: string): Promise<{ lessons: number; dates: string[]; fixedClasses: number; error: any }> {
  const today = getTodayLA(), now = getNowMinutesLA()
  const [{ data: sessions, error: sErr }, { data: fcs, error: fErr }] = await Promise.all([
    allRows(() => s.from('class_sessions').select('id, session_date, start_time')
      .eq('coach_id', coachId).gte('session_date', today).neq('status', 'cancelled').order('id')),
    s.from('fixed_classes').select('id').eq('coach_id', coachId).eq('status', 'active'),
  ])
  if (sErr || fErr) return { lessons: 0, dates: [], fixedClasses: 0, error: sErr || fErr }
  const upcoming = sessions.filter((x: any) => x.session_date > today || toMin(x.start_time) > now)
  const sessOf = new Map<string, any>(upcoming.map((x: any) => [x.id, x]))
  // A lesson is a booked swimmer: confirmed, an unanswered 1-on-2 invitation,
  // or an assessment being paid for -- the same set time off cancels
  // (time-off/impact AFFECTED). A basket or another checkout is not.
  const { data: rows, error: bErr } = await allRowsIn([...sessOf.keys()], c => s.from('bookings')
    .select('id, class_session_id, student_id, lesson_group_id, status, is_trial')
    .in('class_session_id', c).in('status', ['confirmed', 'pending_partner', 'pending_payment']).order('id'))
  if (bErr) return { lessons: 0, dates: [], fixedClasses: 0, error: bErr }
  const bookings = rows.filter((b: any) => b.status !== 'pending_payment' || b.is_trial)
  const lessons = new Set(bookings.map((b: any) => `${b.lesson_group_id || b.class_session_id}|${b.student_id}`))
  const dates = [...new Set(bookings.map((b: any) => sessOf.get(b.class_session_id)?.session_date).filter(Boolean))].sort() as string[]
  return { lessons: lessons.size, dates, fixedClasses: (fcs || []).length, error: null }
}

// Update coach (name / pin / active toggle)
export async function PATCH(req: NextRequest) {
  const auth = await requireAdmin()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await readJson(req)
  if (!body) return badRequest()
  const { id, first_name, last_name, pin, is_active } = body
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const s = svc()
  const update: Record<string, unknown> = {}
  if (first_name !== undefined) update.first_name = String(first_name).trim()
  if (last_name !== undefined) update.last_name = String(last_name).trim() || null
  if (is_active !== undefined) update.is_active = !!is_active
  if (is_active !== undefined && !is_active) {
    const load = await futureLoad(s, id)
    if (load.error) return NextResponse.json({ error: load.error.message || 'Could not read the coach\'s lessons', code: 'server' }, { status: 500 })
    if (load.lessons > 0 || load.fixedClasses > 0) {
      return NextResponse.json({
        error: 'This coach still has lessons to teach. Move them to another coach or cancel them first.',
        code: 'has_future_lessons', lessons: load.lessons, fixedClasses: load.fixedClasses, dates: load.dates.slice(0, 5), moreDates: Math.max(0, load.dates.length - 5),
      }, { status: 409 })
    }
  }
  if (pin !== undefined && pin !== '') {
    if (!/^\d{8}$/.test(pin)) return NextResponse.json({ error: 'PIN must be exactly 8 digits', code: 'bad_pin' }, { status: 400 })
    const pinHash = createHash('sha256').update(pin).digest('hex')
    const { data: dup } = await s.from('coaches').select('id').eq('pin_hash', pinHash).neq('id', id).maybeSingle()
    if (dup) return NextResponse.json({ error: 'This PIN is already in use by another coach', code: 'pin_in_use' }, { status: 409 })
    update.pin_hash = pinHash
  }
  if (Object.keys(update).length === 0) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })

  const { error } = await s.from('coaches').update(update).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
