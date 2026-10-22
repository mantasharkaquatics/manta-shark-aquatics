import { NextRequest, NextResponse } from 'next/server'
import { requireParent } from '@/lib/api-auth'
import { getTodayLA } from '@/lib/date'
import { isAdultOn, recordNewSwimmers } from '@/lib/account-holder'
import { medicalToStore } from '@/lib/safety-info'
import { saveMedical } from '@/lib/safety-info-server'

export const runtime = 'nodejs'

/* A family adds a swimmer (My Account, "+ Add a swimmer").
 *
 * This used to be an insert from the browser with the parent's own session,
 * which meant the database had to let any signed-in family write rows into
 * students -- and nothing stopped a hand-made request from sending a
 * current_level (skipping the $85 assessment and the level bands) or a fourth
 * and fifth child (found 2026-10-08). The server now writes the row with the
 * service role, and the browser's INSERT/UPDATE/DELETE on students is revoked
 * (docs/migration-revoke-parent-writes.sql).
 *
 * The family supplies a name, a birthday and whether the swimmer is the
 * account holder themselves (F15), nothing else. Everything a level,
 * a stage or the desk decides is set here and cannot be sent: a new swimmer has
 * no level until an assessment gives them one (lib/level-change.ts). */

// The same number registration and the account page use.
const MAX_STUDENTS = 3

const isRealDate = (d: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return false
  const t = new Date(d + 'T00:00:00Z')
  return !isNaN(t.getTime()) && t.toISOString().slice(0, 10) === d
}

export async function POST(req: NextRequest) {
  const ctx = await requireParent()
  if (!ctx) return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
  const { svc, parent } = ctx

  const body = await req.json().catch(() => null) as { full_name?: unknown; date_of_birth?: unknown; is_account_holder?: unknown; medical?: any } | null
  const fullName = typeof body?.full_name === 'string' ? body.full_name.trim().replace(/\s+/g, ' ') : ''
  const dob = typeof body?.date_of_birth === 'string' ? body.date_of_birth.trim() : ''
  if (!fullName || fullName.length > 120) return NextResponse.json({ error: 'Missing or invalid name', code: 'NAME' }, { status: 400 })
  if (!isRealDate(dob) || dob < '1900-01-01') return NextResponse.json({ error: 'Missing or invalid date of birth', code: 'DOB' }, { status: 400 })
  if (dob > getTodayLA()) return NextResponse.json({ error: 'The date of birth is in the future', code: 'DOB_FUTURE' }, { status: 400 })
  // The safety question (owner, 2026-10-22): "none" or what it is.
  const medical = medicalToStore(body?.medical)
  if (medical === undefined) return NextResponse.json({ error: 'Answer the medical question', code: 'MEDICAL' }, { status: 400 })

  const countActive = async () => {
    const { count, error } = await svc.from('students').select('id', { count: 'exact', head: true })
      .eq('parent_id', parent.id).eq('is_active', true)
    return error ? null : (count ?? 0)
  }
  const before = await countActive()
  if (before === null) return NextResponse.json({ error: 'Could not add the swimmer. Please try again.' }, { status: 500 })
  if (before >= MAX_STUDENTS) return NextResponse.json({ error: `A family can have up to ${MAX_STUDENTS} swimmers`, code: 'LIMIT' }, { status: 409 })

  // After the family's last card, active or not, so a re-added child never
  // shares a position with one the desk archived.
  const { data: last } = await svc.from('students').select('sort_order')
    .eq('parent_id', parent.id).order('sort_order', { ascending: false, nullsFirst: false }).limit(1)
  const sortOrder = (Number(last?.[0]?.sort_order) || 0) + 1

  const { data: row, error } = await svc.from('students').insert({
    parent_id: parent.id,
    full_name: fullName,
    date_of_birth: dob,
    // Only these columns are written. current_stage, trial_used_at and the
    // desk's fields keep their database defaults, as at registration.
    current_level: null,
    is_active: true,
    added_by_parent: true,
    sort_order: sortOrder,
    medical_notes: medical,
  }).select('id').single()
  if (error || !row) {
    console.error('[parent/students] insert failed', error)
    return NextResponse.json({ error: 'Could not add the swimmer. Please try again.' }, { status: 500 })
  }

  // Two adds sent at once could both pass the count above. The later one is
  // taken back rather than leaving a fourth swimmer.
  const after = await countActive()
  if (after !== null && after > MAX_STUDENTS) {
    const { data: newest } = await svc.from('students').select('id')
      .eq('parent_id', parent.id).eq('is_active', true)
      .order('created_at', { ascending: false }).order('id', { ascending: false }).limit(after - MAX_STUDENTS)
    if ((newest || []).some((s: { id: string }) => s.id === row.id)) {
      await svc.from('students').delete().eq('id', row.id).eq('parent_id', parent.id)
      return NextResponse.json({ error: `A family can have up to ${MAX_STUDENTS} swimmers`, code: 'LIMIT' }, { status: 409 })
    }
  }

  // "This swimmer is me" (F15): true only for an adult with the box ticked
  // (the family's other swimmers are then cleared), otherwise false -- never
  // left to the name guess. On its own after the insert, so a database
  // without the column yet (docs/migration-account-holder-swimmer.sql) still
  // adds the swimmer; the answer is then simply not stored.
  // The "answered" stamp, on its own (lib/safety-info-server).
  await saveMedical(svc, parent.id, row.id, medical)

  const me = body?.is_account_holder === true && isAdultOn(dob, getTodayLA())
  const holder = await recordNewSwimmers(svc, parent.id, [row.id], me ? row.id : null)
  if (holder === 'error') console.error('[parent/students] account holder not stored', row.id)

  // Was a second browser write; done here with the insert it belongs to.
  await svc.from('parents').update({ last_activity_at: new Date().toISOString() }).eq('id', parent.id)

  return NextResponse.json({ ok: true, id: row.id })
}
